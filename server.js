#!/usr/bin/env node
'use strict';
// Let My Agents Go: a local server that watches Claude Code session logs
// (~/.claude/projects) and streams what every agent is doing to the browser.
// Read-only. Binds to 127.0.0.1. No dependencies.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { Parser, identify } = require('./lib/transcripts');
const { Stats, listTranscripts } = require('./lib/stats');

const PORT = Number(process.env.PORT) || 4777;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = process.env.CLAUDE_PROJECTS_DIR || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
const PUBLIC = path.join(__dirname, 'public');
const RECENT_MS = 45 * 60 * 1000; // a session touched in the last 45 minutes is on the site
const TAIL_BYTES = 1.5 * 1024 * 1024; // how much of an old file to read to rebuild its state
const POLL_MS = 400;
const DISCOVER_MS = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// ---------- state that a new browser tab needs to catch up ----------
const sessions = new Map(); // sid -> { sid, proj, projName, title, model, lastPrompt, lastAt, ended, mode }
const agents = new Map(); // aid -> { aid, sid, pid, sub, agentType, desc, model, tool, lastAt, ended, run }
const ring = []; // last events, for the chronicle
// the stone counts are cached per user, not inside the app folder (an npx or global install can be read-only)
const CACHE_DIR = process.env.LMAG_CACHE_DIR || path.join(os.homedir(), '.cache', 'let-my-agents-go');
const stats = new Stats(ROOT, path.join(CACHE_DIR, 'stats.json'));
const projectNames = new Map();

function projName(proj) {
  return projectNames.get(proj) || stats.displayName(proj);
}

function applyEvent(e) {
  const s = sessions.get(e.sid) || { sid: e.sid, proj: e.proj, projName: projName(e.proj), title: '', model: '', lastPrompt: '', lastAt: 0, ended: false };
  sessions.set(e.sid, s);
  const a = agents.get(e.aid) || { aid: e.aid, sid: e.sid, pid: e.pid, sub: !!e.pid, tool: null, lastAt: 0, ended: false };
  agents.set(e.aid, a);
  if (e.t && e.k !== 'session' && e.k !== 'agent') {
    s.lastAt = Math.max(s.lastAt, e.t);
    a.lastAt = Math.max(a.lastAt, e.t);
  }
  switch (e.k) {
    case 'title': if (e.custom || !s.customTitle) { s.title = e.title; if (e.custom) s.customTitle = true; } break;
    case 'model': a.model = e.model; if (!e.pid) s.model = e.model; break;
    case 'mode': s.mode = e.mode; break;
    case 'prompt': s.lastPrompt = e.text; s.ended = false; a.ended = false; break;
    case 'orders': a.desc = a.desc || e.text; break;
    case 'tool': a.tool = { id: e.id, name: e.name, cat: e.cat, target: e.target, since: e.t }; a.ended = false; if (!e.pid) s.ended = false; break;
    case 'done': if (a.tool && a.tool.id === e.id) a.tool = null; break;
    case 'end': a.tool = null; a.ended = true; if (!e.pid) s.ended = true; break;
    case 'interrupt': a.tool = null; a.ended = true; if (!e.pid) s.ended = true; break;
    default: break;
  }
  if (!['tokens', 'think', 'title', 'mode', 'stophook'].includes(e.k)) {
    ring.push(e);
    if (ring.length > 160) ring.splice(0, ring.length - 160);
  }
}

// ---------- file tracking ----------
const tracked = new Map(); // file -> { off, partial, parser, id }

async function readMeta(file) {
  try {
    const m = JSON.parse(await fsp.readFile(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return m;
  } catch { return null; }
}

async function learnProjectName(file, proj) {
  if (projectNames.has(proj)) return;
  try {
    const fh = await fsp.open(file, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    await fh.close();
    const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buf.toString('utf8', 0, bytesRead));
    if (m) projectNames.set(proj, path.win32.basename(JSON.parse(`"${m[1]}"`)));
  } catch { /* keep the fallback name */ }
}

async function track(file, st, fromStart) {
  const id = identify(ROOT, file);
  if (!id) return;
  if (!id.sub) await learnProjectName(file, id.proj);
  const parser = new Parser({ sid: id.sid, aid: id.aid, pid: id.pid, proj: id.proj, sub: id.sub });
  const rec = { off: 0, partial: '', parser, id };
  tracked.set(file, rec);
  const events = [];
  if (id.sub) {
    const meta = await readMeta(file);
    const e = { k: 'agent', t: st.birthtimeMs || st.mtimeMs, sid: id.sid, aid: id.aid, pid: id.pid, proj: id.proj, run: id.run || null };
    if (meta) Object.assign(e, { agentType: meta.agentType || '', desc: meta.description || '', model: meta.model || '', toolUseId: meta.toolUseId || '' });
    const a = agents.get(id.aid) || { aid: id.aid, sid: id.sid, pid: id.pid, sub: true, tool: null, lastAt: 0, ended: false };
    Object.assign(a, { agentType: e.agentType, desc: e.desc, model: e.model, run: e.run, toolUseId: e.toolUseId });
    agents.set(id.aid, a);
    events.push(e);
  } else {
    events.push({ k: 'session', t: st.mtimeMs, sid: id.sid, aid: id.aid, pid: null, proj: id.proj, projName: projName(id.proj) });
  }
  // Rebuild recent state from the tail, then follow new bytes live.
  const start = fromStart ? 0 : Math.max(0, st.size - TAIL_BYTES);
  rec.off = start;
  const tailEvents = await readAppended(file, rec, st.size, start > 0);
  for (const e of tailEvents) applyEvent(e);
  for (const e of events) applyEvent(e);
  return fromStart ? events.concat(tailEvents) : events;
}

async function readAppended(file, rec, size, skipFirstPartial) {
  if (size <= rec.off) return [];
  const len = size - rec.off;
  const fh = await fsp.open(file, 'r');
  const buf = Buffer.alloc(len);
  try { await fh.read(buf, 0, len, rec.off); } finally { await fh.close(); }
  rec.off = size;
  let text = rec.partial + buf.toString('utf8');
  if (skipFirstPartial) {
    const nl = text.indexOf('\n');
    text = nl >= 0 ? text.slice(nl + 1) : '';
  }
  const lines = text.split('\n');
  rec.partial = lines.pop();
  const out = [];
  for (const ln of lines) {
    const evs = rec.parser.line(ln.trim());
    for (const e of evs) out.push(e);
  }
  return out;
}

let clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const batch = [];
    for (const [file, rec] of tracked) {
      let st;
      try { st = await fsp.stat(file); } catch { tracked.delete(file); continue; }
      if (st.size < rec.off) { rec.off = 0; rec.partial = ''; } // file was rewritten
      if (st.size > rec.off) {
        const evs = await readAppended(file, rec, st.size, false);
        for (const e of evs) { applyEvent(e); batch.push(e); }
      }
    }
    if (batch.length) broadcast('ev', batch);
  } catch (err) {
    console.error('poll error', err.message);
  } finally {
    polling = false;
  }
}

let discovering = false;
let firstDiscovery = true;
async function discover() {
  if (discovering) return;
  discovering = true;
  try {
    const files = await listTranscripts(ROOT);
    const now = Date.now();
    const fresh = [];
    for (const f of files) {
      if (tracked.has(f)) continue;
      let st;
      try { st = await fsp.stat(f); } catch { continue; }
      if (now - st.mtimeMs > RECENT_MS) continue;
      // A file born after we started is streamed from its first line.
      const bornWhileRunning = !firstDiscovery && now - st.birthtimeMs < DISCOVER_MS * 3;
      const evs = await track(f, st, bornWhileRunning);
      if (!firstDiscovery && evs) fresh.push(...evs);
    }
    if (fresh.length) broadcast('ev', fresh.sort((a, b) => a.t - b.t));
  } catch (err) {
    console.error('discover error', err.message);
  } finally {
    firstDiscovery = false;
    discovering = false;
  }
}

function snapshot() {
  const now = Date.now();
  const activeSessions = [...sessions.values()].filter((s) => now - s.lastAt < RECENT_MS);
  const live = new Set(activeSessions.map((s) => s.sid));
  const activeAgents = [...agents.values()].filter((a) => live.has(a.sid) && (!a.sub || a.tool || now - a.lastAt < 10 * 60 * 1000));
  return { now, sessions: activeSessions, agents: activeAgents, recent: ring.filter((e) => live.has(e.sid)).slice(-40), stats: stats.summary() };
}

// ---------- http ----------
// the page only loads its own files (plus Google Fonts), so text from a session log can never run as code
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

function send(res, code, body, type) {
  const headers = { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (String(type).startsWith('text/html')) headers['Content-Security-Policy'] = CSP;
  res.writeHead(code, headers);
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Only answer requests addressed to this computer by name. Without this, a web page could point its own
// domain at 127.0.0.1 (DNS rebinding) and read your prompts and commands from this server.
const LOCAL_NAMES = ['localhost', '127.0.0.1', '[::1]'];
const hostIsLocal = (req) => LOCAL_NAMES.includes(String(req.headers.host || '').toLowerCase().replace(/:\d+$/, ''));
const SHARED = !['127.0.0.1', 'localhost', '::1'].includes(HOST); // HOST set to a network address: the user chose to share it

const server = http.createServer(async (req, res) => {
  try {
    if (!SHARED && !hostIsLocal(req)) return send(res, 403, 'forbidden', 'text/plain');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/api/stats') return send(res, 200, stats.summary());
    // static
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'no', 'text/plain');
    const data = await fsp.readFile(file);
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') send(res, 404, 'not found', 'text/plain');
    else if (err instanceof URIError) send(res, 400, 'bad request', 'text/plain');
    else { console.error(err); send(res, 500, 'error', 'text/plain'); }
  }
});

async function main() {
  await stats.load();
  await discover();
  setInterval(poll, POLL_MS);
  setInterval(discover, DISCOVER_MS);
  setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 15000);
  server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  Let My Agents Go is watching ${ROOT}`);
    console.log(`  Open ${url}\n`);
    if (process.argv.includes('--open')) {
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
      require('child_process').exec(cmd);
    }
  });
  // Count every stone ever laid (first run reads all transcripts, later runs only new bytes).
  const t0 = Date.now();
  stats.scanAll().then((summary) => {
    console.log(`  Counted all stones in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    broadcast('stats', summary);
    setInterval(async () => { broadcast('stats', await stats.scanAll()); }, 60000);
  });
}

main();
