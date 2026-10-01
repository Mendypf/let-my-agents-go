// Boot: canvas, camera, the loop, and the controls.
import { Scene, W, H, skyModeFor, TORCHES, PLACES } from './scene.js';
import { World } from './world.js';
import { LiveFeed, DemoFeed } from './feed.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { C } from './pal.js';

const params = new URLSearchParams(location.search);
const screen = document.getElementById('screen');
const sctx = screen.getContext('2d');
const worldCv = document.createElement('canvas');
worldCv.width = W; worldCv.height = H;
const wctx = worldCv.getContext('2d');

const app = {
  mode: params.has('demo') ? 'demo' : 'live',
  sky: params.get('sky') || localStorageGet('lmag.sky') || 'live',
  film: params.has('film'),
  privacy: params.has('private'), // ?private hides names, files, commands and prompts, for screen recordings
  director: false,
  clean: params.has('clean'),
  verses: params.has('verses'), // the verse panel at the top is off unless the address asks for it
  chaos: !params.has('calm'), // the demo runs at the busy pace; ?calm is a slower one, for recording clips
  wide: params.has('wide'), // the demo with the camera held on the whole site, for recording the full dashboard
};
// the camera moves in on whatever is happening: always in the demo, and in ?film recordings
const autoCam = () => app.film || (app.mode === 'demo' && !app.wide);

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

const scene = new Scene();
const sound = new Sound();
let ui;
const cam = { x: W / 2, y: H, zoom: 1, tx: W / 2, ty: H, tz: 1, hold: 0, auto: 0, follow: null, mineUntil: 0 };
// a shot you called up (Director, keys, Send Moses) keeps the camera until it is over:
// the demo's own scenes can't cut away from it in the middle
const claimCam = () => { cam.mineUntil = Math.max(cam.mineUntil, performance.now() + cam.hold * 1000); };
let directing = false; // true while a Director button or key starts its scene: that scene gets the camera, nothing else does

const world = new World({
  scene,
  onLog: (t, k, safe) => ui && ui.log(t, k, safe),
  onMoment: (key, ctx, priority) => ui && ui.moment(key, ctx, priority),
  sfx: (name, o) => sound.play(name, o),
  // focused action sits below center, clear of the scripture scroll at the top
  onFocus: (f) => {
    const mine = f && (f.user || directing);
    if (!f || !(autoCam() || mine)) return;
    if (!mine && performance.now() < cam.mineUntil) return;
    cam.follow = f.follow || null; cam.cluster = false;
    if (!f.follow) { cam.tx = f.x; cam.ty = f.y - (app.verses ? Math.round(20 * Math.min(1, (f.zoom || 2) / 2.8)) : 0); }
    cam.tz = f.zoom || 2; cam.hold = f.hold || 6;
    if (mine) claimCam();
  },
});
ui = new UI(world, app);

// ---------------------------------------------------------------- feeds
let feed = null;
const handlers = {
  busy: () => app.chaos,
  snapshot: (snap) => { resetWorld(); world.seed(snap); if (snap.stats) handlers.stats(snap.stats); (snap.recent || []).slice(-6).forEach((e) => { if (e.k === 'prompt') ui.log(`Pharaoh decrees: “${e.text.slice(0, 60)}”`, 'decree'); }); updateEmpty(); },
  events: (evs) => { for (const e of evs) world.handle(e, true); updateEmpty(); },
  stats: (s) => {
    if (!s || !s.projects) return;
    let total = 0;
    for (const p of Object.values(s.projects)) total += (p.total && p.total.build) || 0;
    if (total) world.setTotals(total);
  },
  status: (st) => { document.body.dataset.conn = st; updateEmpty(); },
};

function resetWorld() {
  world.crews.clear(); world.workers.clear(); world.names.clear();
  world.mounds = []; world.specials = []; world.particles = [];
  world.cool = {}; world.stageUntil = 0; world.nextAnyWhip = 0; world.recentSpawns = [];
  if (world.fileEdits) world.fileEdits.clear();
  if (world.lastFail) world.lastFail.clear();
  world.moses = null; world.mosesReadyAt = 0; world.snakes = []; world.frogs = [];
  world.hail = null; world.darkness = null; world.locusts = null; world.dim = null; world.tint = null; world.beam = null; world.flash = 0;
  if (ui) { ui.queue = []; ui.nextCaption(true); }
}

function startFeed(mode) {
  if (feed) feed.stop();
  app.mode = mode;
  document.body.dataset.mode = mode;
  world.pace = mode === 'demo' && !app.chaos ? 0.8 : 1;
  world.busy = mode === 'demo' && app.chaos;
  // a new feed starts from the whole site: live stays there, the demo's camera picks its first shot right away
  cam.follow = null; cam.hold = 0; cam.auto = 0; cam.mineUntil = 0;
  if (mode === 'demo') { feed = new DemoFeed(handlers); feed.start(); }
  else if (mode === 'live') { feed = new LiveFeed(handlers); feed.start(); }
  updateEmpty();
  syncButtons();
}

function updateEmpty() {
  const empty = document.getElementById('empty');
  const none = app.mode === 'live' && world.crews.size === 0;
  empty.hidden = !none;
  document.getElementById('empty-offline').hidden = document.body.dataset.conn !== 'offline';
}

// ---------------------------------------------------------------- camera & view
const view = { scale: 1, dpr: 1, dx: 0, dy: 0, sx: 0, sy: 0, vw: W, vh: H, devW: 1, devH: 1 };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cw = window.innerWidth, ch = window.innerHeight;
  screen.width = Math.round(cw * dpr); screen.height = Math.round(ch * dpr);
  screen.style.width = cw + 'px'; screen.style.height = ch + 'px';
  view.dpr = dpr; view.devW = screen.width; view.devH = screen.height;
  const contain = Math.min(view.devW / W, view.devH / H);
  const cover = Math.max(view.devW / W, view.devH / H);
  // fill the window edge to edge; only a tall (phone-shaped) window outside film mode shows the whole scene with bars
  const fill = app.film || cw >= ch;
  let s = fill ? cover : contain;
  if (!fill) { const snapped = Math.floor(s); if (snapped >= 2 && snapped / s > 0.93) s = snapped; }
  view.base = s;
  document.body.classList.toggle('portrait', ch > cw);
}

function computeView() {
  // keep at least 170x96 world px in view; a tall (phone-shaped) window shows the same height of the scene
  // a wide one would at that zoom, so close-ups close in as far as they do on a laptop
  const tall = view.devH > view.devW;
  const s = Math.min(view.base * cam.zoom, view.devW / (tall ? 64 : 170), view.devH / 96);
  view.scale = s;
  let vw = view.devW / s, vh = view.devH / s;
  let sx = cam.x - vw / 2, sy = cam.y - vh / 2;
  // keep the camera inside the world
  if (vw >= W) sx = (W - vw) / 2; else sx = Math.max(0, Math.min(W - vw, sx));
  if (vh >= H) sy = (H - vh) / 2; else sy = Math.max(0, Math.min(H - vh, sy));
  if (world.shake > 0) { sx += (Math.random() - 0.5) * world.shake * 6; sy += (Math.random() - 0.5) * world.shake * 6; }
  view.sx = sx; view.sy = sy; view.vw = vw; view.vh = vh;
}

view.toScreen = (x, y) => {
  const px = ((x - view.sx) * view.scale) / view.dpr;
  const py = ((y - view.sy) * view.scale) / view.dpr;
  return { x: px, y: py, visible: px > -60 && py > -30 && px < innerWidth + 60 && py < innerHeight + 40 };
};
view.toWorld = (cx, cy) => ({ x: (cx * view.dpr) / view.scale + view.sx, y: (cy * view.dpr) / view.scale + view.sy });

// director: in the demo (and ?film recordings) the camera drifts to where things happen
function direct(dt) {
  const tall = innerHeight > innerWidth;
  if (cam.hold > 0) { cam.hold -= dt; if (cam.hold <= 0) { cam.auto = 0; cam.follow = null; } }
  else if (autoCam()) {
    cam.auto -= dt;
    if (cam.auto <= 0) {
      cam.auto = tall ? 6 : 7;
      cam.follow = null;
      // frame the busiest spot: the worker with the most other workers busy around them
      const busy = [...world.workers.values()].filter((w) => w.working && w.x > 0);
      let pick = null, best = -1;
      for (const w of busy) {
        const n = busy.filter((o) => Math.abs(o.x - w.x) < 60 && Math.abs(o.y - w.y) < 45).length + Math.random() * 0.9;
        if (n > best) { best = n; pick = w; }
      }
      if (pick && Math.random() < (tall ? 0.9 : 0.7)) { cam.follow = pick; cam.cluster = true; cam.tz = tall ? 1.3 : 1.6; }
      else if (tall) { cam.tx = 286; cam.ty = 262; cam.tz = 1; } // the ramp and the lit face of the pyramid
      else { cam.tx = W / 2; cam.ty = H; cam.tz = 1; } // wide shots sit on the ground: any trimming comes off the sky
    }
  } else if (!cam.follow) { cam.tx = W / 2; cam.ty = H; cam.tz = 1; }
  if (cam.follow) {
    const f = cam.follow;
    if (f.id && !world.workers.has(f.id)) { cam.follow = null; cam.auto = 0; }
    else if (cam.cluster) {
      const near = [...world.workers.values()].filter((w) => w.working && Math.abs(w.x - f.x) < 60 && Math.abs(w.y - f.y) < 45);
      const list = near.length ? near : [f];
      const cx = list.reduce((s, w) => s + w.x, 0) / list.length;
      cam.tx = tall ? cx + (300 - cx) * 0.35 : cx;
      cam.ty = list.reduce((s, w) => s + w.y, 0) / list.length - 24;
    } else { cam.tx = f.x; cam.ty = f.y - 22; }
  }
  const k = 1 - Math.pow(0.04, dt);
  cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.zoom += (cam.tz - cam.zoom) * k;
}

// ---------------------------------------------------------------- render
function skyMode() {
  if (app.sky !== 'live') return app.sky;
  return skyModeFor(new Date());
}

const FRONT_PALMS = [[14, 362, 78, 1], [628, 364, 70, -1]];
const BACK_PALMS = [[454, 206, 38, -0.4], [196, 190, 30, 0.3], [238, 184, 26, -0.2]];
const MID_PALMS = [[166, 336, 50, 0.5]]; // stands among the workers, so it is depth-sorted with them
// where each palm's crown of fronds sits: a worker with his head in there can't be seen
const PALM_CROWNS = [...MID_PALMS, ...FRONT_PALMS].map(([x, y, h, lean]) => [x + Math.round(lean * h * 0.25), y - h + 1]);
const behindPalm = (w) => PALM_CROWNS.some(([cx, cy]) => Math.abs(w.x - cx) < 20 && w.y > cy - 4 && w.y < cy + 34);

function render(t) {
  const mode = skyMode();
  scene.setMode(mode);
  scene.blood = world.blood;
  scene.drawBack(wctx, t);
  if (!world.basketHeld) drawBasket(wctx, t);
  for (const [x, y, h, lean] of BACK_PALMS) scene.palm(wctx, x, y, h, t, lean);
  world.pyramid.shadow(wctx, mode);
  world.pyramid.render(wctx, t);
  world.drawActors(wctx, MID_PALMS.map(([x, y, h, lean]) => ({ y, d: () => scene.palm(wctx, x, y, h, t, lean) })));
  for (const [x, y] of TORCHES) scene.torch(wctx, x, y, t);
  scene.fire(wctx, PLACES.brazier[0], PLACES.brazier[1] - 13, t);
  scene.fire(wctx, 206, 336, t);
  world.drawEffects(wctx);
  const backlit = mode === 'golden' || mode === 'dusk' || mode === 'dawn' || mode === 'night';
  for (const [x, y, h, lean] of FRONT_PALMS) scene.palm(wctx, x, y, h, t, lean, backlit);
  grade(wctx, mode, t);
  world.drawOverlays(wctx);

  // world → screen
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = C.ink;
  sctx.fillRect(0, 0, view.devW, view.devH);
  const dx = (0 - view.sx) * view.scale, dy = (0 - view.sy) * view.scale;
  sctx.drawImage(worldCv, Math.round(dx), Math.round(dy), Math.round(W * view.scale), Math.round(H * view.scale));
}

function drawBasket(ctx, t) {
  const [x, y] = PLACES.basket;
  const bob = Math.round(Math.sin(t * 1.4) * 0.6);
  ctx.fillStyle = C.umber; ctx.fillRect(x - 4, y - 2 + bob, 9, 3);
  ctx.fillStyle = C.gold; ctx.fillRect(x - 4, y - 2 + bob, 9, 1);
  ctx.fillStyle = C.wine; ctx.fillRect(x - 3, y + 1 + bob, 7, 1);
  ctx.fillStyle = C.cloud; ctx.fillRect(x - 1, y - 3 + bob, 3, 1);
}

function grade(ctx, mode, t) {
  const g = scene.sky.grade;
  if (!g) return;
  ctx.save();
  ctx.globalCompositeOperation = g.op;
  ctx.globalAlpha = g.a;
  ctx.fillStyle = g.c;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  if (mode === 'night' || mode === 'dusk') {
    // warm light around torches and fires
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lights = [...TORCHES.map(([x, y]) => [x, y - 3, 26]), [PLACES.brazier[0], PLACES.brazier[1] - 14, 34], [206, 334, 30]];
    for (const [x, y, r] of lights) {
      const fl = 1 + Math.sin(t * 9 + x) * 0.06;
      for (let k = 4; k >= 1; k--) {
        ctx.globalAlpha = mode === 'night' ? 0.05 : 0.03;
        ctx.fillStyle = C.amber;
        const rr = Math.round(r * fl * k / 4);
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let clock = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  world.update(dt, app.mode === 'live' ? Date.now() : null);
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt);
  direct(dt);
  computeView();
  render(clock);
  ui.frame(view);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- input
function syncButtons() {
  const q = (id) => document.getElementById(id);
  q('btn-sound').setAttribute('aria-pressed', sound.on);
  q('btn-sound').querySelector('span').textContent = sound.on ? 'Sound on' : 'Sound off';
  const skyName = { live: 'Sky: live (follows your clock)', day: 'Sky: day', golden: 'Sky: golden hour', dusk: 'Sky: dusk', night: 'Sky: night', dawn: 'Sky: dawn' }[app.sky];
  q('btn-sky').querySelector('span').textContent = skyName; q('btn-sky').title = skyName + '. Click to change.';
  q('btn-sound').title = sound.on ? 'Sound is on' : 'Sound is off';
  q('btn-mode').querySelector('span').textContent = app.mode === 'live' ? 'Watch demo' : 'Back to live';
  document.body.dataset.mode = app.mode;
  document.body.classList.toggle('film', app.film);
  document.body.classList.toggle('director', app.director);
}

const SKIES = ['live', 'day', 'golden', 'dusk', 'night', 'dawn'];
document.getElementById('btn-sound').addEventListener('click', async () => { if (sound.on) sound.disable(); else await sound.enable(); syncButtons(); });
document.getElementById('btn-sky').addEventListener('click', () => { app.sky = SKIES[(SKIES.indexOf(app.sky) + 1) % SKIES.length]; localStorageSet('lmag.sky', app.sky); syncButtons(); });
document.getElementById('btn-mode').addEventListener('click', () => startFeed(app.mode === 'live' ? 'demo' : 'live'));
document.getElementById('btn-director').addEventListener('click', () => { app.director = !app.director; syncButtons(); });
document.getElementById('film-director').addEventListener('click', () => { app.director = !app.director; syncButtons(); });
// film mode: after 2.5 s without mouse movement the star and the pointer fade out
let idleTimer = 0;
const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('idle'), 2500); };
window.addEventListener('mousemove', wake);
wake();
document.getElementById('empty-demo').addEventListener('click', () => startFeed('demo'));
document.getElementById('roll-toggle').addEventListener('click', () => document.body.classList.toggle('roll-closed'));
function mosesTarget() {
  const alive = [...world.crews.values()].filter((c) => c.taskmaster && c.taskmaster.alive);
  if (world.lastWhipCrew && alive.includes(world.lastWhipCrew)) return world.lastWhipCrew;
  return alive.sort((a, b) => b.taskmaster.whips - a.taskmaster.whips)[0];
}
document.getElementById('btn-moses').addEventListener('click', () => {
  const crew = mosesTarget();
  if (crew && world.sendMoses(crew, true) && !sound.on) sound.enable().then(syncButtons);
});

document.getElementById('roll-list').addEventListener('click', (e) => {
  const b = e.target.closest('button.kill');
  if (!b || b.disabled) return;
  const crew = world.crews.get(b.dataset.crew);
  if (crew && world.sendMoses(crew, true)) { if (!sound.on) sound.enable().then(syncButtons); }
});

// click the world: taskmasters (send Moses), the basket in the reeds
screen.addEventListener('click', (e) => {
  const p = view.toWorld(e.clientX, e.clientY);
  const [bx, by] = PLACES.basket;
  if (Math.abs(p.x - bx) < 8 && Math.abs(p.y - by) < 6 && !world.basketHeld) { world.batya(); return; }
  for (const c of world.crews.values()) {
    const tm = c.taskmaster;
    if (tm && tm.alive && Math.abs(p.x - tm.x) < 8 && p.y < tm.y + 2 && p.y > tm.y - 24) {
      if (world.sendMoses(c, true)) { if (!sound.on) sound.enable().then(syncButtons); }
      return;
    }
  }
});
screen.addEventListener('mousemove', (e) => {
  const p = view.toWorld(e.clientX, e.clientY);
  let hover = false;
  const [bx, by] = PLACES.basket;
  if (Math.abs(p.x - bx) < 8 && Math.abs(p.y - by) < 6) hover = true;
  for (const c of world.crews.values()) { const tm = c.taskmaster; if (tm && tm.alive && Math.abs(p.x - tm.x) < 8 && p.y < tm.y + 2 && p.y > tm.y - 24) hover = true; }
  screen.style.cursor = hover ? 'pointer' : '';
});

// the director panel: trigger any scene by hand (for filming)
const firstCrew = () => [...world.crews.values()][0];
const anyWorker = () => { const ws = [...world.workers.values()].filter((w) => w.kind !== 'levite'); return ws[Math.floor(Math.random() * ws.length)]; };
// who the Whip button goes for: the worker nearest an overseer, preferring someone standing still in plain sight;
// someone walking, behind a palm or up on the pyramid only when there is nobody else
function whipPick() {
  let best = null;
  for (const c of world.crews.values()) {
    const tm = c.taskmaster;
    if (!tm || !tm.alive || world.moses) continue;
    for (const w of c.workers()) {
      if (w.kind === 'levite' || w.x <= 0) continue;
      const d = Math.hypot(w.x - tm.x, w.y - tm.y) + (w.moving || w.hauling ? 400 : 0) + (behindPalm(w) ? 800 : 0) + (world.pyramid.onPyramid(w) ? 1600 : 0);
      if (!best || d < best.d) best = { tm, w, d };
    }
  }
  return best;
}
const ACTIONS = {
  whip: () => {
    const best = whipPick();
    if (!best) return;
    if (best.tm.state !== 'post' && best.tm.state !== 'return') { best.tm.state = 'return'; best.tm.path = []; }
    best.tm.whip(best.w, 'manual');
    cam.follow = best.w; cam.cluster = false; cam.tz = 2.6; cam.hold = 5;
  },
  moses: () => { const c = [...world.crews.values()].find((x) => x.taskmaster && x.taskmaster.alive); if (c) { world.mosesReadyAt = 0; world.sendMoses(c, true); } },
  snake: () => { world.magicAct('snake'); ui.moment('snake', { w: (anyWorker() || {}).name || 'Nachshon', file: 'haul.py' }); },
  blood: () => { world.magicAct('blood'); ui.moment('blood', { w: (anyWorker() || {}).name || 'Nachshon', exit: 1 }); },
  frogs: () => { world.magicAct('frogs'); ui.moment('frogs', { w: (anyWorker() || {}).name || 'Nachshon', n: 4 }); },
  lice: () => { world.magicAct('lice', anyWorker()); ui.moment('lice', { w: (anyWorker() || {}).name || 'Nachshon' }); },
  swallow: () => { world.magicAct('swallow'); ui.moment('swallow', { w: (anyWorker() || {}).name || 'Nachshon' }); },
  hail: () => { world.startHail(); ui.moment('hail', { text: 'Overloaded' }); },
  darkness: () => { world.startDarkness(); ui.moment('darkness', { w: (anyWorker() || {}).name || 'Nachshon' }); },
  locusts: () => { world.startLocusts(); ui.moment('locusts', { n: world.workers.size }); },
  batya: () => world.batya(),
  nile: () => world.nileTrip(),
  joseph: () => { world.josephBones(); ui.moment('joseph', { w: (anyWorker() || {}).name || 'Nachshon', cmd: 'git log --oneline' }); },
  midwives: () => { const w = anyWorker(); if (w) world.midwives(w); },
  newKing: () => { ui.moment('newKing', { w: (anyWorker() || {}).name || 'Nachshon', model: 'claude-opus-5-5' }); world.onFocus({ follow: world.pharaoh, zoom: 2.4, hold: 4 }); },
  heart: () => { world.pharaoh.heart = 6; ui.moment('heart', { w: (anyWorker() || {}).name || 'Nachshon' }); world.onFocus({ follow: world.pharaoh, zoom: 2.8, hold: 4 }); },
  quarrel: () => { const ws = [...world.workers.values()].filter((w) => w.kind !== 'levite'); if (ws.length > 1) { world.quarrel(ws[0], ws[1]); ui.moment('quarrel', { a: ws[1].name, b: ws[0].name, file: 'index.html' }); } },
  capstone: () => { const p = world.pyramid; p.total += 300 - p.shown - 1; p.shown = 299; p.cacheN = -1; const w = anyWorker(); if (w) { w.stones++; w.begin('build'); world.onFocus({ follow: w, zoom: 2.2, hold: 9 }); } },
  dayone: () => world.softMouth(),
};
// what an agent does, on demand (demo only): the first crew's foreman does it and the camera follows him
const AGENT_ACTS = new Set(['read', 'edit', 'command', 'search', 'screenshot', 'skill', 'todo', 'ask', 'permission', 'fail', 'sleep', 'helpers', 'finish', 'decree']);
function runAct(act, text) {
  if (AGENT_ACTS.has(act)) {
    if (!(feed instanceof DemoFeed)) return;
    const r = feed.act(act, text);
    if (!r) return;
    const onWorker = (hold) => { const w = world.workers.get(r.aid); if (w) { cam.follow = w; cam.cluster = false; cam.tz = 2.2; cam.hold = hold; claimCam(); } };
    if (act === 'decree') {
      // Pharaoh gives the order: the camera stays on him while he speaks, then goes to the worker
      cam.follow = world.pharaoh; cam.cluster = false; cam.tz = 3.2; cam.hold = 5; claimCam();
      setTimeout(() => onWorker(5), 5000);
    } else setTimeout(() => onWorker(Math.min(14, r.ms / 1000 + 1)), 80);
  } else if (ACTIONS[act]) {
    directing = true;
    try { ACTIONS[act](); } finally { directing = false; }
    if (cam.hold > 0) claimCam();
  }
  if (app.director) { app.director = false; syncButtons(); } // out of the shot
}
document.getElementById('director').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) runAct(b.dataset.act); });
// one key per action, so scenes can be called up while filming with nothing on screen
const KEYS = {
  1: 'read', 2: 'edit', 3: 'command', 4: 'search', 5: 'screenshot', 6: 'skill', 7: 'helpers', 8: 'ask', 9: 'permission', 0: 'finish',
  e: 'decree', x: 'fail', u: 'todo', z: 'sleep',
  w: 'whip', s: 'snake', a: 'swallow', b: 'blood', r: 'frogs', l: 'lice', h: 'hail', o: 'locusts', k: 'darkness',
  t: 'batya', n: 'nile', j: 'joseph', i: 'midwives', g: 'newKing', y: 'heart', q: 'quarrel', c: 'capstone', p: 'dayone',
};

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const act = KEYS[e.key.toLowerCase()];
  if (act) { runAct(act); return; }
  if (e.key === 'd') document.getElementById('btn-director').click();
  if (e.key === 'm') document.getElementById('btn-moses').click();
  if (e.key === 'Escape') { app.film = false; resize(); syncButtons(); }
});
window.addEventListener('resize', resize);

// the app's state, for scripted checks in a browser
window.__lmag = { world, app, ui, ACTIONS, startFeed, cam, view, whipPick, runAct };

if (app.clean) document.body.classList.add('clean');
if (app.verses) document.body.classList.add('verses');
resize();
syncButtons();
startFeed(app.mode);
if (!localStorageGet('lmag.dayone.' + new Date().toDateString())) {
  localStorageSet('lmag.dayone.' + new Date().toDateString(), '1');
  setTimeout(() => world.softMouth(), 9000);
}
{
  const d = new Date();
  if (d.getHours() >= 5 && d.getHours() < 7) setTimeout(() => world.nileTrip(), 20000);
}
requestAnimationFrame(loop);
