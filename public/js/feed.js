// Where events come from: the live server (SSE) or a scripted demo.

export class LiveFeed {
  constructor(h) { this.h = h; this.es = null; this.connected = false; }
  start() {
    this.es = new EventSource('/events');
    this.es.addEventListener('snapshot', (m) => { this.connected = true; this.h.status('live'); this.h.snapshot(JSON.parse(m.data)); });
    this.es.addEventListener('ev', (m) => this.h.events(JSON.parse(m.data)));
    this.es.addEventListener('stats', (m) => this.h.stats(JSON.parse(m.data)));
    this.es.onerror = () => { this.connected = false; this.h.status('offline'); };
  }
  stop() { if (this.es) this.es.close(); this.es = null; }
}

// ---------------------------------------------------------------- demo
const FILES = ['server.js', 'world.js', 'index.html', 'app.css', 'scene.js', 'README.md', 'build.py', 'render.py', 'api.ts', 'Hero.tsx', 'schema.sql', 'feed.js'];
const CMDS = ['npm test', 'node server.js --check', 'python render.py --1080', 'git status', 'npm run build', 'ffmpeg -i raw.mp4 -vf scale=1080:1920 out.mp4', 'pytest tests/', 'git diff --stat'];
const SEARCHES = ['pyramid ramp construction', 'Rashi Shemot 2:12', 'Endesga 32 palette', 'SSE reconnect best practice'];
const TEXTS = ['Found it. The overseer keeps the lash in the wrong hand.', 'Tests pass. Moving on to the pyramid.', 'Two files left to update.', 'That command failed. Reading the log.', 'Done. The site loads in under a second.'];
const PROMPTS = ['make the pyramid taller', 'fix the whip timing', 'add Moses to the roll call', 'the caption at 0:14 is late', 'ship it'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
// how often each kind of job comes up in the demo
const KINDS = [['quarry', 0.3], ['build', 0.32], ['haul', 0.24], ['straw', 0.07], ['scroll', 0.04], ['survey', 0.03]];
const pickKind = () => { let r = Math.random(); for (const [k, p] of KINDS) { if ((r -= p) < 0) return k; } return 'build'; };
const rnd = (a, b) => a + Math.random() * (b - a);

export class DemoFeed {
  constructor(h) { this.h = h; this.timers = []; this.seq = 0; this.running = false; this.keyed = new Map(); this.inflight = new Map(); }

  // key: the agent a timer belongs to, so that agent's plans can be cancelled
  at(ms, fn, key) {
    const id = setTimeout(() => { if (key && this.keyed.has(key)) this.keyed.get(key).delete(id); fn(); }, ms);
    this.timers.push(id);
    if (key) { if (!this.keyed.has(key)) this.keyed.set(key, new Set()); this.keyed.get(key).add(id); }
    return id;
  }

  // stop everything an agent had planned and close the tool he is in the middle of
  halt(a) {
    for (const id of this.keyed.get(a.aid) || []) clearTimeout(id);
    this.keyed.delete(a.aid);
    for (const [id, f] of [...this.inflight]) if (f.aid === a.aid) { this.inflight.delete(id); this.emit(this.ev('done', a, { id, name: f.name, cat: f.cat, err: false, cancel: true })); }
  }

  // the Director: the first crew's foreman stops and does one thing, long enough to film, then goes back to work
  // text: the prompt for 'decree' (a random demo prompt when left out)
  act(kind, text) {
    const a = this.A;
    if (!this.running || !a) return null;
    // you are directing now: the demo's own scripted scenes stop so they don't cut into your shot
    for (const id of this.keyed.get('script') || []) clearTimeout(id);
    this.keyed.delete('script');
    this.halt(a);
    const k = a.aid;
    let t = 300;
    const run = (n, what) => { for (let i = 0; i < n; i++) t += this.call(a, what, t) + 900; };
    const tool = (name, cat, extra, d, err = false, more = {}) => { this.at(t, () => this.one(a, name, cat, extra, d, err, more), k); t += d + 900; };
    switch (kind) {
      case 'read': run(3, 'quarry'); break;
      case 'edit': run(3, 'build'); break;
      case 'command': run(1, 'haul'); break;
      case 'search': run(1, 'straw'); break;
      case 'screenshot': run(1, 'survey'); break;
      case 'skill': run(1, 'scroll'); break;
      case 'todo': tool('TodoWrite', 'quota', { target: 'to-do list' }, 4500); break;
      case 'ask': tool('AskUserQuestion', 'ask', { target: 'Which color should the tunics be?' }, 7000); break;
      case 'permission': tool('Edit', 'build', { target: 'server.js', file: 'C:/demo/server.js', perm: true }, 9000); break;
      case 'fail': tool('Bash', 'haul', { target: 'npm run build', cmd: 'npm run build' }, 5000, true, { exit: 1, errText: 'Exit code 1' }); break;
      case 'sleep': tool('ScheduleWakeup', 'sleep', { target: 'back in 20 minutes' }, 9000); break;
      case 'helpers': this.at(t, () => this.spawn(a, 3, false), k); t += 7000; break;
      case 'finish': this.at(t, () => this.emit(this.ev('end', a, {})), k); t += 8000; break;
      case 'decree': this.at(t, () => this.job(a, text || pick(PROMPTS)), k); return { aid: a.aid, ms: 6000 };
      default: return null;
    }
    this.at(t + 1500, () => this.job(a, null), k);
    return { aid: a.aid, ms: t };
  }
  emit(evs) { if (this.running) this.h.events(Array.isArray(evs) ? evs : [evs]); }
  ev(k, a, extra) { return Object.assign({ k, t: Date.now(), sid: a.sid, aid: a.aid, pid: a.pid || null, proj: 'demo' }, extra); }

  start() {
    this.running = true;
    const A = { sid: 'demo-a', aid: 'demo-a' };
    const B = { sid: 'demo-b', aid: 'demo-b' };
    const Cc = { sid: 'demo-c', aid: 'demo-c' };
    this.A = A;
    this.h.snapshot({ now: Date.now(), sessions: [], agents: [], recent: [], stats: { projects: {} } });
    this.h.stats({ projects: { demo: { key: 'demo', name: 'Demo', total: { build: 7470 } } }, ready: true });
    this.emit([
      this.ev('session', A, { projName: 'let-my-agents-go' }), this.ev('title', A, { title: 'Pyramid visualizer' }),
      this.ev('session', B, { projName: 'video-pipeline' }), this.ev('title', B, { title: 'Caption timing' }),
    ]);
    this.at(900, () => this.job(A, 'make the overseers crack the whip faster'));
    this.at(1800, () => this.job(B, 'render the 1080 cut and check the captions'));
    const busy = this.h.busy && this.h.busy();
    this.at(busy ? 4200 : 40000, () => this.spawn(A, 2, true));
    this.at(busy ? 6500 : 18000, () => {
      this.emit([this.ev('session', Cc, { projName: 'shop-backend' }), this.ev('title', Cc, { title: 'Checkout bug' })]);
      this.job(Cc, 'fix the checkout total');
    });
    // set pieces, spaced so a 4-minute recording catches all of them
    this.at(23000, () => this.one(A, 'Write', 'build', { target: 'haul.py', file: 'C:/demo/haul.py' }), 'script');
    this.at(33000, () => this.failThenFix(B, 'npm run build'), 'script');
    this.at(60000, () => this.spawn(A, 3, false), 'script');
    this.at(74000, () => this.testFail(B), 'script');
    this.at(88000, () => this.one(A, 'Bash', 'quarry', { target: 'git log --oneline -20', cmd: 'git log --oneline -20' }), 'script');
    this.at(102000, () => this.emit(this.ev('apierr', A, { text: 'Overloaded (529)' })), 'script');
    this.at(114000, () => this.emit(this.ev('compact', B, { trigger: 'auto' })), 'script');
    this.at(126000, () => this.quarrel(A, B), 'script');
    this.at(138000, () => this.emit(this.ev('deny', A, { kind: 'user-rejected' })), 'script');
    this.at(150000, () => this.spawn(Cc, 6, true), 'script');
    this.at(170000, () => this.emit(this.ev('model', A, { model: 'claude-fable-5-1', prev: 'claude-opus-5-5' })), 'script');
    this.at(185000, () => this.emit(this.ev('model', A, { model: 'claude-opus-5-5', prev: 'claude-fable-5-1' })), 'script');
  }

  stop() { this.running = false; this.timers.forEach(clearTimeout); this.timers = []; }

  id() { return `toolu_demo_${++this.seq}`; }

  // one tool call with a result
  one(a, name, cat, extra, ms = 1400, err = false, more = {}) {
    const id = this.id();
    this.inflight.set(id, { aid: a.aid, name, cat });
    this.emit(this.ev('tool', a, Object.assign({ id, name, cat }, extra)));
    this.at(ms, () => { this.inflight.delete(id); this.emit(this.ev('done', a, Object.assign({ id, name, cat, err, file: extra.file || '', cmd: extra.cmd || '' }, more))); }, a.aid);
    this.at(ms, () => this.emit(this.ev('tokens', a, { tokens: Math.round(rnd(24000, 96000)), out: Math.round(rnd(200, 1800)) })), a.aid);
    return ms;
  }

  // an agent's work, paced so one worker can be followed: a few runs of one kind of job
  // (read several files, then edit several, then run a command), with a pause to think in between
  job(a, prompt) {
    if (!this.running) return;
    if (this.h.busy && this.h.busy()) return this.jobBusy(a, prompt);
    if (prompt && !a.pid) this.emit(this.ev('prompt', a, { text: prompt }));
    let t = 900;
    const runs = a.pid ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3);
    let prev = null;
    for (let r = 0; r < runs; r++) {
      let kind = pickKind();
      if (kind === prev) kind = pickKind();
      prev = kind;
      const n = kind === 'haul' ? 1 + (Math.random() < 0.35 ? 1 : 0) : ['straw', 'survey', 'scroll'].includes(kind) ? 1 : 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) t += this.call(a, kind, t) + rnd(900, 1700);
      if (Math.random() < 0.35) this.at(t - 300, () => this.emit(this.ev('think', a, {})), a.aid);
      if (Math.random() < 0.3) { const txt = pick(TEXTS); this.at(t, () => this.emit(this.ev('text', a, { text: txt })), a.aid); }
      t += rnd(1800, 3200);
    }
    this.at(t, () => this.emit(this.ev('end', a, {})), a.aid);
    if (!a.pid) this.at(t + rnd(6000, 10000), () => this.job(a, pick(PROMPTS)), a.aid);
  }

  // Chaos: the original pace. Every step a new kind of job, short calls, little pause
  jobBusy(a, prompt) {
    if (prompt && !a.pid) this.emit(this.ev('prompt', a, { text: prompt }));
    let t = 900;
    const steps = 8 + Math.floor(Math.random() * 8);
    for (let i = 0; i < steps; i++) {
      const r = Math.random();
      let d;
      const k = a.aid;
      if (r < 0.25) { const f = pick(FILES); d = rnd(700, 1400); this.at(t, () => this.one(a, 'Read', 'quarry', { target: f, file: 'C:/demo/' + f }, d), k); }
      else if (r < 0.5) { const f = pick(FILES.filter((x) => !x.endsWith('.py'))); d = rnd(900, 1800); this.at(t, () => this.one(a, 'Edit', 'build', { target: f, file: 'C:/demo/' + f }, d), k); }
      else if (r < 0.8) { const c = pick(CMDS.slice(0, 5)); d = rnd(2500, 7000); this.at(t, () => this.one(a, 'Bash', 'haul', { target: c, cmd: c }, d), k); }
      else if (r < 0.88) { const q = pick(SEARCHES); d = rnd(2500, 4500); this.at(t, () => this.one(a, 'WebSearch', 'straw', { target: q }, d), k); }
      else if (r < 0.93) { d = rnd(1500, 2500); this.at(t, () => this.one(a, 'Skill', 'scroll', { target: 'frontend-design' }, d), k); }
      else { d = rnd(2500, 4000); this.at(t, () => this.one(a, 'mcp__playwright__browser_take_screenshot', 'survey', { target: 'screenshot' }, d), k); }
      t += d + rnd(300, 1100);
      if (Math.random() < 0.3) { this.at(t - 200, () => this.emit(this.ev('think', a, {})), k); }
      if (Math.random() < 0.2) { const txt = pick(TEXTS); this.at(t, () => this.emit(this.ev('text', a, { text: txt })), k); t += 700; }
    }
    this.at(t, () => this.emit(this.ev('end', a, {})), a.aid);
    if (!a.pid) this.at(t + rnd(5000, 9000), () => this.job(a, pick(PROMPTS)), a.aid);
  }

  // one tool call of a kind, starting t ms from now; returns how long it runs
  call(a, kind, t) {
    let d;
    switch (kind) {
      case 'quarry': { const f = pick(FILES); d = rnd(2200, 3200); this.at(t, () => this.one(a, 'Read', 'quarry', { target: f, file: 'C:/demo/' + f }, d), a.aid); break; }
      case 'build': { const f = pick(FILES.filter((x) => !x.endsWith('.py'))); d = rnd(2600, 3800); this.at(t, () => this.one(a, 'Edit', 'build', { target: f, file: 'C:/demo/' + f }, d), a.aid); break; }
      case 'haul': { const c = pick(CMDS.slice(0, 5)); d = rnd(5500, 8500); this.at(t, () => this.one(a, 'Bash', 'haul', { target: c, cmd: c }, d), a.aid); break; }
      case 'straw': { const q = pick(SEARCHES); d = rnd(4000, 5500); this.at(t, () => this.one(a, 'WebSearch', 'straw', { target: q }, d), a.aid); break; }
      case 'scroll': { d = rnd(3000, 4000); this.at(t, () => this.one(a, 'Skill', 'scroll', { target: 'frontend-design' }, d), a.aid); break; }
      default: { d = rnd(3500, 4500); this.at(t, () => this.one(a, 'mcp__playwright__browser_take_screenshot', 'survey', { target: 'screenshot' }, d), a.aid); }
    }
    return d;
  }

  failThenFix(a, cmd) {
    const t = this.one(a, 'Bash', 'haul', { target: cmd, cmd }, 3000, true, { exit: 1, errText: 'Exit code 1' });
    this.at(t + 4000, () => this.one(a, 'Edit', 'build', { target: 'vite.config.js', file: 'C:/demo/vite.config.js' }, 1200));
    this.at(t + 11000, () => this.one(a, 'Bash', 'haul', { target: cmd, cmd }, 3500, false));
  }

  testFail(a) { this.one(a, 'Bash', 'haul', { target: 'pytest tests/', cmd: 'pytest tests/' }, 3500, true, { exit: 1, testFail: true }); }

  quarrel(a, b) {
    const file = 'C:/demo/index.html';
    this.one(a, 'Edit', 'build', { target: 'index.html', file }, 1500);
    this.at(2500, () => this.one(b, 'Edit', 'build', { target: 'index.html', file }, 1500));
  }

  spawn(parent, n, readOnly) {
    const ids = [];
    const toolIds = [];
    const evs = [];
    for (let i = 0; i < n; i++) {
      const tid = this.id();
      toolIds.push(tid);
      evs.push(this.ev('tool', parent, { id: tid, name: 'Agent', cat: 'conscript', target: readOnly && i % 2 === 0 ? 'Map the codebase' : 'Build a piece', batch: n }));
    }
    this.emit(evs);
    for (let i = 0; i < n; i++) {
      const sub = { sid: parent.sid, aid: `${parent.sid}:sub${this.seq}-${i}`, pid: parent.sid };
      ids.push(sub);
      const levite = readOnly && i % 2 === 0;
      this.at(600 + i * 250, () => {
        this.emit(this.ev('agent', sub, { agentType: levite ? 'Explore' : 'general-purpose', desc: levite ? 'Map the codebase' : 'Build a piece' }));
        this.job(sub, null);
      });
    }
    this.at(45000, () => toolIds.forEach((tid) => this.emit(this.ev('done', parent, { id: tid, name: 'Agent', cat: 'conscript', err: false }))));
  }
}
