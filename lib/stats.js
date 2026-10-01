'use strict';
// Counts every tool call ever made, per project, by scanning all transcripts once.
// Results are cached in .cache/stats.json; later runs only read the bytes that were added.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { classify } = require('./transcripts');

const CACHE_VERSION = 3;
const TOOL_RE = /"type":"tool_use","id":"[^"]*","name":"([^"]+)"/g;
const TS_RE = /"timestamp":"([^"]+)"/;
const CWD_RE = /"cwd":"((?:[^"\\]|\\.)*)"/;

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function listTranscripts(root) {
  const out = [];
  let slugs = [];
  try { slugs = await fsp.readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const s of slugs) {
    if (!s.isDirectory()) continue;
    const dir = path.join(root, s.name);
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
      else if (e.isDirectory()) {
        const subs = path.join(p, 'subagents');
        let se = [];
        try { se = await fsp.readdir(subs, { withFileTypes: true }); } catch { continue; }
        for (const f of se) {
          if (f.isFile() && f.name.endsWith('.jsonl')) out.push(path.join(subs, f.name));
          else if (f.isDirectory() && f.name === 'workflows') {
            let runs = [];
            try { runs = await fsp.readdir(path.join(subs, 'workflows'), { withFileTypes: true }); } catch { continue; }
            for (const r of runs) {
              if (!r.isDirectory()) continue;
              let af = [];
              try { af = await fsp.readdir(path.join(subs, 'workflows', r.name)); } catch { continue; }
              for (const a of af) if (a.endsWith('.jsonl')) out.push(path.join(subs, 'workflows', r.name, a));
            }
          }
        }
      }
    }
  }
  return out;
}

class Stats {
  constructor(root, cacheFile) {
    this.root = root;
    this.cacheFile = cacheFile;
    this.cache = { v: CACHE_VERSION, files: {}, names: {} };
    this.ready = false;
    this.progress = 0;
  }

  async load() {
    try {
      const c = JSON.parse(await fsp.readFile(this.cacheFile, 'utf8'));
      if (c.v === CACHE_VERSION) this.cache = c;
    } catch { /* first run */ }
  }

  async save() {
    try {
      await fsp.mkdir(path.dirname(this.cacheFile), { recursive: true });
      await fsp.writeFile(this.cacheFile, JSON.stringify(this.cache));
    } catch (err) {   // the cache only saves time; a folder we can't write to must not stop the site
      if (!this.saveWarned) console.error(`could not save the stone count cache (${err.message}); counting from scratch each start`);
      this.saveWarned = true;
    }
  }

  // Read one file from its last offset; add tool counts by day.
  async scanFile(file, st) {
    const key = file;
    const prev = this.cache.files[key];
    const proj = path.relative(this.root, file).split(path.sep)[0].toLowerCase();
    let rec = prev && prev.size <= st.size ? prev : { off: 0, size: 0, proj, days: {} };
    if (rec.off >= st.size) { rec.size = st.size; this.cache.files[key] = rec; return; }
    let consumed = rec.off;
    await new Promise((resolve) => {
      const stream = fs.createReadStream(file, { start: rec.off, highWaterMark: 1 << 20 });
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const ln = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          consumed += Buffer.byteLength(ln, 'utf8') + 1;
          if (!this.cache.names[proj]) {
            const m = CWD_RE.exec(ln);
            if (m) { try { this.cache.names[proj] = JSON.parse(`"${m[1]}"`); } catch { /* ignore */ } }
          }
          if (ln.indexOf('"tool_use"') < 0) continue;
          const tm = TS_RE.exec(ln);
          const dk = dayKey(tm ? Date.parse(tm[1]) : Date.now());
          TOOL_RE.lastIndex = 0;
          let m;
          while ((m = TOOL_RE.exec(ln))) {
            const cat = classify(m[1], null);
            const day = rec.days[dk] || (rec.days[dk] = {});
            day[cat] = (day[cat] || 0) + 1;
          }
        }
      });
      stream.on('end', resolve);
      stream.on('error', resolve);
    });
    rec.off = consumed;
    rec.size = st.size;
    this.cache.files[key] = rec;
  }

  async scanAll(onProgress) {
    const files = await listTranscripts(this.root);
    let done = 0;
    for (const f of files) {
      let st;
      try { st = await fsp.stat(f); } catch { continue; }
      const prev = this.cache.files[f];
      if (!prev || prev.size !== st.size) await this.scanFile(f, st);
      done++;
      this.progress = done / files.length;
      if (onProgress && done % 10 === 0) onProgress(this.progress);
    }
    this.ready = true;
    await this.save();
    return this.summary();
  }

  // { projects: { key: { name, total: {build,haul,...}, today: {...}, days: n } } }
  summary() {
    const today = dayKey(Date.now());
    const projects = {};
    for (const rec of Object.values(this.cache.files)) {
      const p = projects[rec.proj] || (projects[rec.proj] = { key: rec.proj, name: this.displayName(rec.proj), total: {}, today: {} });
      for (const [dk, counts] of Object.entries(rec.days)) {
        for (const [cat, n] of Object.entries(counts)) {
          p.total[cat] = (p.total[cat] || 0) + n;
          if (dk === today) p.today[cat] = (p.today[cat] || 0) + n;
        }
      }
    }
    return { projects, ready: this.ready };
  }

  displayName(proj) {
    const cwd = this.cache.names[proj];
    if (cwd) return path.win32.basename(cwd.replace(/\\\\/g, '\\')) || cwd;
    // folder names: c--Users-name-... on Windows, -Users-name-... on macOS, -home-name-... on Linux
    return proj.replace(/^([a-z]-)?-(users|home)-[^-]+-(downloads-)?/i, '').replace(/-/g, ' ').trim() || proj;
  }
}

module.exports = { Stats, listTranscripts, dayKey };
