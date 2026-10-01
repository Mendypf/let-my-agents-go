// The simulation: crews of workers (one per Claude session), overseers, Pharaoh, his magicians,
// Moses, plagues. Agent events come in through handle(); everything else animates on its own.
import { C, CREW_COLORS, BAYER } from './pal.js';
import {
  human, workerSpec, TASKMASTER, PHARAOH, MAGICIAN, MOSES, BATYA, SERACH, MIDWIFE, FANBEARER,
  blit, blitTint, blitFlash, blitLying, frogSprite, snakeSprite,
} from './sprites.js';
import { PLACES, W, H, NILE } from './scene.js';
import { ELDERS, YOUTHS, LEVITES, OVERSEERS, VERB, LOG } from './copy.js';

export const BLOCK_W = 10, BLOCK_H = 6, COURSES = 24;
export const PYRAMID_CAP = (COURSES * (COURSES + 1)) / 2; // 300 stones per pyramid
const LEVITE_TYPES = /^(Explore|Plan|claude-code-guide|statusline-setup|gsd-(plan-checker|assumptions-analyzer|codebase-mapper|pattern-mapper|integration-checker))/i;
const QUICK_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep', 'NotebookEdit', 'Skill', 'ToolSearch']);

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------- the pyramid
export class Pyramid {
  constructor(x0 = 214, baseY = 300) {
    this.x0 = x0; this.baseY = baseY;
    this.total = 0; // stones ever laid
    this.shown = 0; // stones visible in the current pyramid
    this.reserved = 0;
    this.cache = null; this.cacheN = -1;
    this.capT = 0; // capstone ceremony timer
    this.sinking = [];
  }
  get inCycle() { return this.total % PYRAMID_CAP; }
  get completed() { return Math.floor(this.total / PYRAMID_CAP); }
  left(c) { return this.x0 + c * (BLOCK_W / 2); }
  course(n) { let c = 0; while (c < COURSES) { const size = COURSES - c; if (n < size) return { c, i: n }; n -= size; c++; } return { c: COURSES - 1, i: 0 }; }
  slot(n) {
    const { c, i } = this.course(Math.min(n, PYRAMID_CAP - 1));
    const x = this.left(c) + i * BLOCK_W;
    return { c, i, x, y: this.baseY - (c + 1) * BLOCK_H, standX: x + 4, standY: this.baseY - c * BLOCK_H };
  }
  top() { const { c } = this.course(Math.max(0, this.shown - 1)); return { c, y: this.baseY - (c + 1) * BLOCK_H }; }
  reserve() { const n = this.shown + this.reserved; this.reserved++; return n; }
  release() { this.reserved = Math.max(0, this.reserved - 1); }
  // the construction ramp leans on the left face and reaches the course being laid
  get buildCourse() { return this.course(Math.min(this.shown, PYRAMID_CAP - 1)).c; }
  rampFoot() { return [this.x0 - 30, this.baseY]; }
  rampAt(c) {
    const cc = Math.max(1, this.buildCourse);
    const [fx] = this.rampFoot();
    const endX = this.left(cc) - 2;
    return [Math.round(fx + (endX - fx) * (c / cc)), this.baseY - c * BLOCK_H];
  }
  // route from the ground to stand on course c at x
  climb(fromX, c, toX) {
    const pts = [this.rampFoot()];
    if (c > 0) pts.push(this.rampAt(c));
    pts.push([toX, this.baseY - c * BLOCK_H]);
    return pts;
  }
  descend(fromX, c) {
    const pts = [];
    if (c > 0) pts.push(this.rampAt(c));
    pts.push(this.rampFoot());
    return pts;
  }
  onPyramid(a) { return a.y < this.baseY - 2 && a.x > this.x0 - 8 && a.x < this.x0 + COURSES * BLOCK_W + 8; }
  courseAt(y) { return Math.max(0, Math.round((this.baseY - y) / BLOCK_H)); }

  shadow(ctx, mode) {
    if (mode === 'night' || mode === 'day') return;
    const n = this.shown;
    if (!n) return;
    const top = this.course(Math.max(0, n - 1)).c + 1;
    const h = top * BLOCK_H;
    const len = mode === 'golden' ? 2.2 : 1.6;
    const x0 = this.x0, y0 = this.baseY, cx = this.x0 + (COURSES * BLOCK_W) / 2;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = C.wine;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y0 + 1);
    ctx.lineTo(cx + 30, y0 + 1);
    ctx.lineTo(cx - h * len, y0 - Math.round(h * 0.34));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  render(ctx, t) {
    if (this.cacheN !== this.shown) this.rebuild();
    ctx.drawImage(this.cache, 0, 0);
    // stones sinking into the sand (Pithom)
    for (const s of this.sinking) {
      const k = clamp((t - s.t0) / 2.2, 0, 1);
      const sink = Math.round(k * 7);
      ctx.fillStyle = C.tan; ctx.fillRect(s.x, s.y + sink, BLOCK_W, BLOCK_H - sink);
      ctx.fillStyle = C.sand; if (sink < BLOCK_H) ctx.fillRect(s.x, s.y + sink, BLOCK_W, 1);
    }
    this.sinking = this.sinking.filter((s) => t - s.t0 < 2.4);
    if (this.capT > 0) {
      const top = this.slot(PYRAMID_CAP - 1);
      const k = clamp(this.capT / 1.2, 0, 1);
      const cx = top.x + 5, cy = top.y - 2 - Math.round((1 - k) * 30);
      for (let r = 0; r < 6; r++) {
        ctx.fillStyle = r < 2 ? C.lemon : C.gold;
        ctx.fillRect(cx - r, cy + r, r * 2 + 1, 1);
      }
      ctx.fillStyle = C.amber; ctx.fillRect(cx - 5, cy + 5, 11, 1);
    }
  }

  rebuild() {
    if (!this.cache) { this.cache = document.createElement('canvas'); this.cache.width = W; this.cache.height = H; }
    const ctx = this.cache.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const cx = this.x0 + (COURSES * BLOCK_W) / 2;
    // the footprint: a leveled bed of packed sand
    ctx.fillStyle = C.clay; ctx.fillRect(this.x0 - 4, this.baseY, COURSES * BLOCK_W + 8, 2);
    ctx.fillStyle = C.umber; ctx.fillRect(this.x0 - 2, this.baseY + 2, COURSES * BLOCK_W + 4, 1);
    // the pyramid still to come: a faint ghost with dotted edges
    for (let c = 0; c < COURSES; c++) {
      const y = this.baseY - (c + 1) * BLOCK_H;
      const x = this.left(c), w = (COURSES - c) * BLOCK_W;
      ctx.fillStyle = 'rgba(234,212,170,0.16)'; ctx.fillRect(x, y, w, BLOCK_H);
      ctx.fillStyle = 'rgba(115,62,57,0.6)';
      for (let k = 0; k < BLOCK_H; k += 2) { ctx.fillRect(x, y + k, 1, 1); ctx.fillRect(x + w - 1, y + k, 1, 1); }
    }
    const ridge = Math.round(cx);
    const FACE = {
      shade: { body: C.clay, top: C.tan, edge: C.umber, joint: C.umber, fleck: C.umber },
      lit: { body: C.sand, top: C.sand, edge: C.tan, joint: C.tan, fleck: C.tan },
    };
    for (let n = 0; n < this.shown; n++) {
      const s = this.slot(n);
      const h = hash('b' + n);
      // paint the block column by column so a block on the ridge splits into both faces
      for (let dx = 0; dx < BLOCK_W; dx++) {
        const f = s.x + dx < ridge ? FACE.shade : FACE.lit;
        ctx.fillStyle = f.body; ctx.fillRect(s.x + dx, s.y, 1, BLOCK_H);
        const hi = f === FACE.lit ? (h % 3 === 0 ? C.white : C.sand) : f.top;
        ctx.fillStyle = dx === BLOCK_W - 1 ? f.edge : hi; ctx.fillRect(s.x + dx, s.y, 1, 1);
        if (dx === BLOCK_W - 1) { ctx.fillStyle = f.edge; ctx.fillRect(s.x + dx, s.y, 1, BLOCK_H); }
        ctx.fillStyle = f.joint; ctx.fillRect(s.x + dx, s.y + BLOCK_H - 1, 1, 1);
      }
      if (h % 5 === 0) { const f = s.x + 4 < ridge ? FACE.shade : FACE.lit; ctx.fillStyle = f.fleck; ctx.fillRect(s.x + 2 + (h % 5), s.y + 2, 1, 1); }
    }
    // the ridge line where the two faces meet
    if (this.shown) {
      const topC = this.course(Math.max(0, this.shown - 1)).c;
      for (let c = 0; c <= topC; c++) { const y = this.baseY - (c + 1) * BLOCK_H; ctx.fillStyle = C.sand; ctx.fillRect(ridge, y, 1, BLOCK_H - 1); }
    }
    // the ramp: a mudbrick walkway on wooden props, up to the course being laid
    const cc = this.buildCourse;
    if (cc > 0) {
      const [fx, fy] = this.rampFoot();
      const [ex, ey] = this.rampAt(cc);
      const n = Math.max(1, ex - fx);
      for (let i = 0; i <= n; i++) {
        const x = fx + i, y = Math.round(fy + (ey - fy) * (i / n));
        ctx.fillStyle = C.sand; ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = C.clay; ctx.fillRect(x, y + 1, 1, 2);
        ctx.fillStyle = i % 5 === 0 ? C.wine : C.umber; ctx.fillRect(x, y + 3, 1, 2);
        ctx.fillStyle = C.wine; ctx.fillRect(x, y + 5, 1, 1);
        if (i % 14 === 7) { ctx.fillStyle = C.wine; ctx.fillRect(x, y + 6, 1, fy - y - 5); ctx.fillStyle = C.umber; ctx.fillRect(x + 1, y + 6, 1, fy - y - 5); }
      }
    }
    this.cacheN = this.shown;
  }
}

// ---------------------------------------------------------------- actors
class Actor {
  constructor(x, y) {
    this.x = x; this.y = y; this.dir = 1; this.path = []; this.speed = 32; this.walkT = 0; this.t = 0;
  }
  go(points, speed) { this.path = points.map((p) => [p[0], p[1]]); if (speed) this.speed = speed; }
  goTo(x, y, speed) { this.go([[x, y]], speed); }
  get moving() { return this.path.length > 0; }
  step(dt, mult = 1) {
    if (!this.path.length) return false;
    const [tx, ty] = this.path[0];
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const v = this.speed * mult * ((this.world && this.world.pace) || 1) * dt; // pace: the demo walks a little slower so people can be followed
    if (Math.abs(dx) > 0.5) this.dir = dx > 0 ? 1 : -1;
    if (d <= v) { this.x = tx; this.y = ty; this.path.shift(); }
    else { this.x += (dx / d) * v; this.y += (dy / d) * v; }
    this.walkT += dt * mult;
    return true;
  }
  walkLegs() { return ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(this.walkT * 8) % 4]; }
}

export class Worker extends Actor {
  constructor(world, crew, id, info) {
    const [gx, gy] = PLACES.goshen;
    super(gx, gy + rand(-6, 6));
    this.world = world; this.crew = crew; this.id = id;
    this.sub = !!info.pid;
    this.agentType = info.agentType || '';
    this.kind = this.sub ? (LEVITE_TYPES.test(this.agentType) ? 'levite' : 'youth') : 'elder';
    const h = hash(id);
    const pool = this.kind === 'levite' ? LEVITES : this.kind === 'youth' ? YOUTHS : ELDERS;
    this.name = world.uniqueName(pool, h);
    this.variant = h % 4;
    this.spec = workerSpec(crew.color, this.variant, this.kind);
    this.act = 'enter';
    this.actT = 0;
    this.task = null; // current tool call {id, name, cat, target, since}
    this.label = VERB.walk;
    this.detail = info.desc || '';
    this.carrying = null;
    this.stones = 0; // finished edits waiting to be placed
    this.slotN = null; // reserved pyramid slot
    this.boostUntil = 0;
    this.flinchT = 0;
    this.cheerT = 0;
    this.bubble = null;
    this.lastAt = world.now;
    this.tokens = 0;
    this.placed = 0;
    this.speed = 34;
    this.hauls = 0;
    this.ended = false;
    this.leaving = false;
    this.lice = 0;
    this.station = null;
  }

  get busy() { return !!this.task; }
  get working() { return this.task && !['ask', 'sleep'].includes(this.task.cat); }

  setLabel(verb, target) { this.label = verb; this.target = target || ''; }

  say(text, secs = 5) { this.bubble = { text, until: this.world.t + secs, kind: 'say' }; }
  thinkBubble() { if (!this.bubble || this.bubble.kind !== 'say') this.bubble = { text: '…', until: this.world.t + 2.5, kind: 'think' }; }

  startTool(e) {
    this.task = { id: e.id, name: e.name, cat: e.cat, target: e.target, since: this.world.now, file: e.file, cmd: e.cmd, perm: !!e.perm };
    this.toolAt = this.world.t;
    this.ended = false;
    this.setLabel(VERB[e.cat] || e.cat, e.target);
    this.bubble = this.bubble && this.bubble.kind === 'say' ? this.bubble : null;
    this.begin(e.cat);
  }

  begin(cat) {
    if (this.kind === 'levite' && (cat === 'build' || cat === 'haul')) cat = 'scroll';
    const w = this.world;
    if (cat === 'haul' && this.hauling) { this.act = 'haul'; this.actT = 0; return; }
    this.haulDue = cat === 'haul'; // every command gets at least one full trip on the sledge
    // finish setting the stones already earned before starting something else
    if (cat !== 'build' && this.act === 'build' && this.stones > 0) { this.nextAct = cat; return; }
    if (cat !== 'build' && this.carrying === 'block') { this.carrying = null; w.stock = Math.min(9, w.stock + 1); }
    this.nextAct = null;
    const climbing = this.act === 'build' && this.buildStage === 'climb' && this.carrying === 'block' && this.moving;
    this.act = cat; this.actT = 0;
    if (cat === 'build') {
      if (this.slotN == null) this.slotN = w.pyramid.reserve();
      // already on his way up with a stone: the next edit doesn't send him back down to start the climb over
      if (!climbing) this.planBuild();
    } else {
      if (this.slotN != null && !this.stones) { w.pyramid.release(); this.slotN = null; }
      this.station = w.stationFor(this, cat);
      const stay = ['think', 'ask', 'wait', 'conscript'].includes(cat) && w.pyramid.onPyramid(this);
      if (stay) this.path = [];
      else this.route(this.station[0], this.station[1]);
    }
  }

  // Walk anywhere, stepping down from (or up onto) the pyramid as needed.
  route(x, y, speed) {
    const p = this.world.pyramid;
    const pts = [];
    if (p.onPyramid(this)) pts.push(...p.descend(this.x, p.courseAt(this.y)));
    pts.push([x, y]);
    this.go(pts, speed || 34);
  }

  planBuild() {
    const p = this.world.pyramid;
    if (!this.carrying) {
      const [sx, sy] = PLACES.stockpile;
      this.route(sx - 4 + rand(-3, 3), sy + rand(-2, 3));
      this.buildStage = 'fetch';
    } else {
      const s = p.slot(this.slotN);
      const pts = [];
      if (p.onPyramid(this)) pts.push(...p.descend(this.x, p.courseAt(this.y)));
      pts.push(...p.climb(this.x, s.c, s.standX));
      this.go(pts, 40);
      this.buildStage = 'climb';
    }
  }

  endTool(e) {
    const w = this.world;
    const cat = e.cat || (this.task && this.task.cat);
    if (this.task && this.task.id === e.id) this.task = null;
    if (cat === 'build') {
      if (e.err) {
        this.fumble(e);
      } else {
        this.stones++;
        if (this.act !== 'build') this.begin('build');
      }
    } else if (cat === 'haul' && !e.err) {
      this.hauls++;
    }
    if (e.err && cat !== 'build') this.flinch(0.35);
    if (!this.task && !this.stones) this.setLabel(this.act === 'rest' ? VERB.rest : VERB.think, '');
  }

  // the Director interrupted: drop the job without a stone or a fumble
  cancelTool(e) {
    const w = this.world;
    if (this.task && this.task.id === e.id) this.task = null;
    this.stones = 0; this.nextAct = null;
    if (this.carrying === 'block') { this.carrying = null; w.stock = Math.min(9, w.stock + 1); }
    if (this.slotN != null) { w.pyramid.release(); this.slotN = null; }
    if (this.hauling) this.haulDue = false;
  }

  fumble() {
    const w = this.world;
    if (this.carrying === 'block') {
      this.carrying = null;
      const s = w.pyramid.slot(this.slotN != null ? this.slotN : w.pyramid.shown);
      w.pyramid.sinking.push({ x: Math.round(this.x - 5), y: Math.round(this.y - 6), t0: w.t });
      w.dust(this.x, this.y, 10);
      w.sfx('sink');
    }
    if (this.slotN != null && !this.stones) { w.pyramid.release(); this.slotN = null; }
    this.flinch(0.4);
  }

  endTurn() {
    this.task = null;
    this.ended = true;
    if (this.stones > 0) return; // finish placing first
    this.goRest();
  }

  goRest() {
    this.act = 'rest'; this.actT = 0;
    this.setLabel(VERB.rest, '');
    this.station = this.world.stationFor(this, 'rest');
    this.route(this.station[0], this.station[1], 30);
  }

  flinch(secs = 0.5) { this.flinchT = secs; this.boostUntil = this.world.t + 5; }
  cheer(secs = 1.6) { this.cheerT = secs; }

  update(dt) {
    const w = this.world;
    this.t += dt; this.actT += dt;
    if (this.flinchT > 0) { this.flinchT -= dt; return; }
    if (this.cheerT > 0) { this.cheerT -= dt; }
    const boost = w.t < this.boostUntil ? 1.6 : 1;
    if (this.step(dt, boost)) return;

    switch (this.act) {
      case 'enter':
        this.act = this.task ? this.task.cat : (this.ended ? 'rest' : 'think');
        this.begin(this.act);
        break;
      case 'build': this.updateBuild(dt); break;
      case 'quarry': {
        this.dir = -1;
        const cycle = (this.actT * boost) % 0.7;
        if (cycle < dt * boost * 1.05 && this.actT > 0.2) {
          w.chips(this.x - 9, this.y - 10);
          w.sfx('chisel', { x: this.x });
        }
        break;
      }
      case 'leave': w.removeWorker(this); break;
      default: break;
    }
  }

  updateBuild() {
    const w = this.world, p = w.pyramid;
    if (this.buildStage === 'fetch') {
      if (this.actT > 0.25 || this.stones > 0 || this.task) {
        this.carrying = 'block';
        w.stockTake();
        this.planBuild();
      }
    } else if (this.buildStage === 'climb') {
      // on the slot: place as soon as the edit has finished
      this.dir = 1;
      if (this.stones > 0) {
        this.stones--;
        this.carrying = null;
        w.placeStone(this);
        this.buildStage = 'placed';
        this.actT = 0;
      }
    } else if (this.buildStage === 'placed') {
      if (this.actT < 0.35) return;
      if (this.stones > 0) {
        this.slotN = p.reserve();
        this.planBuild();
      } else if (this.task && this.task.cat === 'build') {
        this.slotN = p.reserve();
        this.planBuild();
      } else {
        this.buildStage = 'done';
        const next = this.nextAct || (this.task && this.task.cat !== 'build' ? this.task.cat : null);
        if (this.ended) this.goRest();
        else if (next) { this.act = 'placed'; this.begin(next); }
        else { this.act = 'think'; this.actT = 0; if (!p.onPyramid(this)) { this.station = w.stationFor(this, 'think'); this.route(this.station[0], this.station[1]); } }
      }
    }
  }

  pose() {
    const w = this.world;
    const moving = this.moving;
    const legs = moving ? this.walkLegs() : 'stand';
    let arm = moving ? (legs === 'walk1' ? 'swingF' : legs === 'walk3' ? 'swingB' : 'down') : 'down';
    let far = moving ? 'swing' : 'side';
    let prop = null, eye = 'open', lean = 0, mouth = null, look = null;
    let L = legs;
    if (this.carrying === 'block') { arm = 'up'; far = 'up'; prop = 'block'; }
    if (this.flinchT > 0) return { legs: 'stand', arm: 'raise', far: 'raise', eye: 'shut', lean: 1, mouth: 'open' };
    if (this.cheerT > 0) return { legs: Math.floor(this.cheerT * 6) % 2 ? 'stand' : 'tiptoe', arm: 'raise', far: 'raise', mouth: 'open' };
    if (!moving) {
      switch (this.act) {
        case 'quarry': {
          const c = (this.actT * (w.t < this.boostUntil ? 1.6 : 1)) % 0.7;
          arm = c < 0.42 ? 'swingUp' : 'swingDown'; prop = c < 0.42 ? 'mallet-up' : 'mallet-down'; break;
        }
        case 'haul': {
          L = this.hauling && this.crew.sledge.moving ? this.walkLegs() : 'brace'; arm = 'pull'; far = 'pull'; lean = this.hauling ? 2 : 1; break;
        }
        case 'straw': {
          const c = this.actT % 1.4;
          if (c < 0.7) { L = 'crouch'; arm = 'fwd'; prop = 'straw-hand'; } else { L = 'stand'; prop = 'straw'; }
          break;
        }
        case 'survey': arm = 'shade'; prop = 'rod'; break;
        case 'quota': arm = 'fwd'; prop = 'papyrus'; break;
        case 'ask': case 'wait': arm = 'raise'; prop = 'tablet'; break;
        case 'scroll': prop = 'scroll'; arm = 'fwd'; far = 'hide'; break;
        case 'think': arm = 'chin'; break;
        case 'conscript': arm = 'raise'; mouth = 'open'; break;
        case 'rest': L = 'sit'; arm = (this.actT % 6) < 1.2 ? 'jar' : 'down'; prop = arm === 'jar' ? 'jar' : null; far = 'hide'; break;
        case 'sleep': L = 'sit'; eye = 'shut'; break;
        case 'build':
          if (this.buildStage === 'placed' && this.actT < 0.35) { L = 'crouch'; arm = 'fwd'; }
          break;
        default: break;
      }
    }
    if (this.kind === 'levite' && !prop && this.act !== 'rest') { prop = 'scroll'; arm = 'fwd'; far = 'hide'; }
    return { legs: L, arm, far, prop, eye, lean, mouth, look };
  }

  draw(ctx) {
    const p = this.pose();
    const key = `w|${this.kind}|${this.crew.idx}|${this.variant}|${p.legs}|${p.arm}|${p.far}|${p.prop}|${p.eye}|${p.lean}|${p.mouth}`;
    const spr = human(key, this.spec, p);
    if (this.act === 'sleep' && !this.moving) blitLying(ctx, spr, this.x, this.y, -1);
    else if (this.world.t < this.hitFlash) blitTint(ctx, spr, this.x, this.y, this.dir, C.white);
    else blit(ctx, spr, this.x, this.y, this.dir);
    if (this.lice > 0) {
      ctx.fillStyle = C.ink;
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(this.x - 3 + ((i * 7 + this.world.t * 9) % 7)), Math.round(this.y - 4 - ((i * 5 + this.world.t * 5) % 16)), 1, 1);
    }
  }
}

class Taskmaster extends Actor {
  constructor(world, crew, x, y) {
    super(x, y);
    this.world = world; this.crew = crew;
    this.name = world.uniqueName(OVERSEERS, hash(crew.id + world.tmCount++));
    this.state = 'post';
    this.whips = 0;
    this.nextWhip = world.t + rand(8, 16);
    this.target = null;
    this.stT = 0;
    this.speed = 44;
    this.alive = true;
    this.dir = 1;
    this.post = null;
  }

  whip(worker, reason) {
    const w = this.world;
    if (!this.alive || !worker || worker.kind === 'levite' || w.moses) return;
    if (this.state !== 'post' && this.state !== 'return') return;
    // one lash at a time across the whole site, so each one can be watched; never at someone still walking
    if (reason !== 'manual' && (worker.moving || w.pyramid.onPyramid(worker))) return;
    if (!w.busy && reason !== 'manual' && reason !== 'officer' && w.t < (w.nextAnyWhip || 0)) return;
    w.nextAnyWhip = w.t + 7;
    this.target = worker; this.reason = reason;
    const side = worker.x > this.x ? -1 : 1;
    const p = this.world.pyramid;
    let tx = worker.x + side * 17, ty = worker.y + 1;
    if (p.onPyramid(worker)) { tx = p.x0 - 16; ty = p.baseY + 2; }
    tx = clamp(tx, 8, W - 8); ty = clamp(ty, 186, H - 6);
    this.goTo(tx, ty, reason === 'manual' ? 84 : 52);
    this.state = 'approach'; this.stT = 0;
  }

  update(dt) {
    const w = this.world;
    this.stT += dt;
    if (!this.alive) return;
    if (this.step(dt)) return;
    switch (this.state) {
      case 'post':
        this.dir = this.faceDir || 1;
        if (w.moses) break;
        if (w.t > this.nextWhip) {
          this.nextWhip = w.t + (w.busy ? rand(10, 20) : rand(16, 28));
          // anyone standing still at the site; the ones idling get it first
          const still = this.crew.workers().filter((x) => x.kind !== 'levite' && !x.moving && !x.hauling && (w.busy || x.actT > 1.5) && !['rest', 'sleep', 'enter', 'leave'].includes(x.act) && !w.pyramid.onPyramid(x));
          const idle = still.filter((x) => !x.working);
          const pool = idle.length ? idle : still;
          if (pool.length) this.whip(pool[Math.floor(Math.random() * pool.length)], 'pace');
          else this.nextWhip = w.t + rand(3, 6);
        } else if (w.t > (this.nextPostAt || 0)) {
          this.nextPostAt = w.t + rand(7, 11);
          w.movePost(this);
        }
        break;
      case 'approach':
        if (!this.target || !w.workers.has(this.target.id)) { this.state = 'return'; this.backToPost(); break; }
        // the target walked off to another job: give up rather than chase him around the site
        if (!w.busy && this.reason !== 'manual' && (this.target.moving || Math.abs(this.target.x - this.x) > 26 || Math.abs(this.target.y - this.y) > 12)) {
          this.target = null; this.nextWhip = w.t + rand(4, 8); this.state = 'return'; this.backToPost(); break;
        }
        this.dir = this.target.x >= this.x ? 1 : -1;
        this.state = 'windup'; this.stT = 0; this.cracked = false;
        break;
      case 'windup':
        // a long wind-up so you see it coming; the crack sound lands with the lash
        if (!this.cracked && this.stT > (w.busy ? 0 : 0.22)) { this.cracked = true; w.sfx('whip', { x: this.x }); }
        if (this.stT > (w.busy ? 0.23 : 0.45)) {
          this.state = 'crack'; this.stT = 0; this.whips++;
          w.whipCracked(this, this.target);
        }
        break;
      case 'crack': if (this.stT > (w.busy ? 0.16 : 0.3)) { this.state = 'recoil'; this.stT = 0; } break;
      case 'recoil': if (this.stT > (w.busy ? 0.5 : 0.8)) { this.state = 'return'; this.backToPost(); } break;
      case 'return': this.state = 'post'; break;
      case 'point': if (this.stT > 3) { this.state = 'post'; } break;
      default: break;
    }
  }

  backToPost() { const [x, y] = this.post; this.goTo(x, y, 40); }

  pose() {
    if (this.moving) {
      const legs = this.walkLegs();
      return { legs, arm: 'whipIdle', far: 'swing' };
    }
    switch (this.state) {
      case 'windup': return { legs: 'stand', arm: 'whipBack', far: 'side' };
      case 'crack': return { legs: 'brace', arm: 'whipFwd', far: 'side', lean: 1, mouth: 'open' };
      case 'recoil': return { legs: 'stand', arm: 'whipFwd', far: 'side' };
      case 'point': return { legs: 'stand', arm: 'point', far: 'side', mouth: Math.floor(this.stT * 4) % 2 ? 'open' : null };
      default: return { legs: 'stand', arm: 'cross', far: 'hide' };
    }
  }

  draw(ctx) {
    const w = this.world;
    if (this.state === 'dead') {
      const spr = human('tm-dead', TASKMASTER, { legs: 'stand', arm: 'down', eye: 'shut' });
      blitLying(ctx, spr, this.x, this.y, this.dir > 0 ? -1 : 1);
      return;
    }
    if (this.state === 'buried') return;
    const p = this.pose();
    const spr = human(`tm|${p.legs}|${p.arm}|${p.far}|${p.lean || 0}|${p.mouth || ''}`, TASKMASTER, p);
    if (this.flashUntil && w.t < this.flashUntil) blitFlash(ctx, spr, this.x, this.y, this.dir, C.white, C.lemon);
    else blit(ctx, spr, this.x, this.y, this.dir);
    this.drawLash(ctx, p);
  }

  drawLash(ctx, p) {
    const d = this.dir, x = Math.round(this.x), y = Math.round(this.y) - 1;
    ctx.fillStyle = C.plum;
    const dot = (px, py) => ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    if (p.arm === 'whipIdle') {
      const hx = x + d * 5, hy = y - 9;
      ctx.fillStyle = C.wine; dot(hx, hy); dot(hx + d, hy + 1);
      ctx.fillStyle = C.plum;
      for (let k = 0; k < 9; k++) dot(hx + d * (1 + Math.sin(k / 3 + this.t * 2) * 1.5), hy + 2 + k);
    } else if (p.arm === 'whipBack') {
      const hx = x + d * 0, hy = y - 17;
      ctx.fillStyle = C.wine; dot(hx - d, hy - 1); dot(hx - d * 2, hy - 2);
      ctx.fillStyle = C.plum;
      for (let k = 0; k < 16; k++) dot(hx - d * (3 + k), hy - 3 - Math.sin(k / 5) * 6 + k * 0.6);
    } else if ((p.arm === 'whipFwd') && this.state === 'crack') {
      const hx = x + d * 7, hy = y - 14;
      ctx.fillStyle = C.wine; dot(hx, hy); dot(hx + d, hy - 1); dot(hx + d * 2, hy - 1);
      const tx = this.target ? this.target.x : hx + d * 20, ty = this.target ? this.target.y - 12 : hy;
      const n = Math.max(8, Math.round(Math.hypot(tx - hx, ty - hy)));
      for (let k = 0; k < n; k++) {
        const lx = hx + (tx - hx) * k / n + d, ly = hy + (ty - hy) * k / n + Math.sin(k * 0.7) * 1.2;
        ctx.fillStyle = C.plum; dot(lx, ly);
        if (k < n * 0.55) dot(lx, ly + 1);
        if (k % 3 === 0) { ctx.fillStyle = C.wine; dot(lx, ly); }
      }
      // the crack: a starburst at the tip
      const f = Math.min(1, this.stT / (this.world.busy ? 0.16 : 0.3));
      const r = 2 + Math.round(f * 4);
      ctx.fillStyle = C.white; dot(tx, ty); dot(tx + 1, ty); dot(tx - 1, ty); dot(tx, ty + 1); dot(tx, ty - 1);
      ctx.fillStyle = C.lemon;
      for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; dot(tx + Math.cos(ang) * r, ty + Math.sin(ang) * r); dot(tx + Math.cos(ang) * (r - 1), ty + Math.sin(ang) * (r - 1)); }
    } else if (p.arm === 'whipFwd') {
      const hx = x + d * 7, hy = y - 14;
      ctx.fillStyle = C.plum;
      for (let k = 0; k < 12; k++) dot(hx + d * (1 + k * 0.9), hy + (k * k) / 10);
    } else {
      // arms crossed: whip tucked under the arm, lash hanging behind
      ctx.fillStyle = C.wine; dot(x + d * 3, y - 11); dot(x + d * 4, y - 12);
      ctx.fillStyle = C.plum;
      for (let k = 0; k < 8; k++) dot(x - d * (4 + Math.sin(k / 2 + this.t) * 0.8), y - 11 + k);
    }
  }
}

class Crew {
  constructor(world, id, proj, idx) {
    this.world = world; this.id = id; this.proj = proj; this.idx = idx;
    this.color = CREW_COLORS[idx % CREW_COLORS.length].band;
    this.colorName = CREW_COLORS[idx % CREW_COLORS.length].name;
    this.title = ''; this.projName = ''; this.lastPrompt = ''; this.model = '';
    this.taskmaster = null;
    this.lane = PLACES.laneY[idx % PLACES.laneY.length];
    this.laneX = PLACES.laneX[idx % PLACES.laneX.length];
    this.sledge = { x: this.laneX[0], dir: 1, block: true, leg: 0, pause: 0, moving: false };
    this.tax = 0;
    this.lastAt = world.now;
    this.promptAt = 0;
    this.appointAt = 0;
    this.buried = 0;
  }
  workers() { return [...this.world.workers.values()].filter((w) => w.crew === this); }
  main() { return this.world.workers.get(this.id); }
  get label() { return this.title || this.projName || 'Crew'; }
  // what the crew is called when details are hidden (safe to film)
  get safeLabel() { return this.colorName[0].toUpperCase() + this.colorName.slice(1) + ' crew'; }
}

// ---------------------------------------------------------------- the world
export class World {
  constructor(opts) {
    this.opts = opts;
    this.t = 0; // seconds since load (animation clock)
    this.now = Date.now(); // wall clock of the latest event
    this.crews = new Map();
    this.workers = new Map();
    this.names = new Set();
    this.pyramid = new Pyramid();
    this.particles = [];
    this.rings = [];
    this.frogs = [];
    this.snakes = [];
    this.mounds = [];
    this.bubbles = [];
    this.flash = 0;
    this.darkness = null;
    this.hail = null;
    this.locusts = null;
    this.stock = 6;
    this.whips = 0;
    this.tmCount = 0;
    this.moses = null;
    this.mosesReadyAt = 0;
    this.cool = {};
    this.lastFail = new Map(); // command text -> time it failed
    this.fileEdits = new Map(); // file -> {aid, t}
    this.recentSpawns = [];
    this.stats = { tax: 0, stonesToday: 0, stonesAll: 0 };
    this.pharaoh = { x: PLACES.pharaohSeat[0], y: PLACES.pharaohSeat[1], state: 'sit', stT: 0, dir: -1, bubble: null, heart: 0, walk: null, path: [] };
    this.magi = PLACES.magi.map(([x, y], i) => ({ x, y, i, act: null, actT: 0, dir: -1, bubble: null }));
    this.fan = { x: PLACES.fanBearer[0], y: PLACES.fanBearer[1] };
    this.specials = []; // Batya, Serach, midwives, coffin...
    this.onLog = opts.onLog || (() => {});
    this.onMoment = opts.onMoment || (() => {});
    this.sfx = opts.sfx || (() => {});
    this.onFocus = opts.onFocus || (() => {});
  }

  uniqueName(pool, h) {
    for (let k = 0; k < pool.length; k++) {
      const n = pool[(h + k) % pool.length];
      if (!this.names.has(n)) { this.names.add(n); return n; }
    }
    const n = `${pool[h % pool.length]} ${2 + (h % 7)}`;
    this.names.add(n);
    return n;
  }

  stageFree() { return this.t >= (this.stageUntil || 0); }
  claim(secs) { this.stageUntil = Math.max(this.stageUntil || 0, this.t + secs); }

  cooldown(key, secs) {
    const until = this.cool[key] || 0;
    if (this.t < until) return false;
    this.cool[key] = this.t + secs;
    return true;
  }

  // ---------- crews & workers
  crewFor(sid, proj) {
    let c = this.crews.get(sid);
    if (!c) {
      const used = new Set([...this.crews.values()].map((x) => x.idx));
      let idx = 0; while (used.has(idx)) idx++;
      c = new Crew(this, sid, proj, idx);
      this.crews.set(sid, c);
      this.appoint(c, true);
    }
    return c;
  }

  appoint(crew, instant) {
    const [px, py] = PLACES.taskmasterPosts[crew.idx % PLACES.taskmasterPosts.length];
    const tm = new Taskmaster(this, crew, instant ? px : 486, instant ? py : 292);
    tm.post = [px, py];
    if (!instant) { tm.goTo(px, py, 40); this.onLog(LOG.newTm(tm.name, crew.label), 'tm', LOG.newTm(tm.name, crew.safeLabel)); }
    crew.taskmaster = tm;
  }

  workerFor(e) {
    let w = this.workers.get(e.aid);
    if (!w) {
      const crew = this.crewFor(e.sid, e.proj);
      w = new Worker(this, crew, e.aid, e);
      this.workers.set(e.aid, w);
      if (e.pid) {
        const parent = this.workers.get(e.pid);
        if (parent) { w.x = parent.x - 4; w.y = parent.y + 2; }
      }
    }
    return w;
  }

  // an overseer's post follows his crew: the open spot nearest to where they are working
  movePost(tm) {
    const ws = tm.crew.workers().filter((x) => x.working && x.x > 0);
    if (!ws.length) return;
    const cx = ws.reduce((s, x) => s + x.x, 0) / ws.length, cy = ws.reduce((s, x) => s + x.y, 0) / ws.length;
    const others = [...this.crews.values()].map((c) => c.taskmaster).filter((t) => t && t !== tm && t.alive && t.post);
    let best = null, bd = 1e9;
    for (const s of PLACES.overseerSpots) {
      if (others.some((o) => Math.hypot(o.post[0] - s[0], o.post[1] - s[1]) < 50)) continue;
      const d = Math.hypot(s[0] - cx, (s[1] - cy) * 1.5);
      if (d < bd) { bd = d; best = s; }
    }
    if (best && (best[0] !== tm.post[0] || best[1] !== tm.post[1])) { tm.post = [best[0], best[1]]; tm.goTo(best[0], best[1], 34); tm.state = 'return'; }
    tm.faceDir = cx >= (best || tm.post)[0] ? 1 : -1;
  }

  removeWorker(w) {
    this.workers.delete(w.id);
    this.names.delete(w.name);
    if (w.slotN != null) this.pyramid.release();
  }

  stationFor(w, cat) {
    const k = w.crew.idx * 3 + (w.sub ? 1 + (hash(w.id) % 3) : 0);
    const pick = (arr) => arr[k % arr.length];
    switch (cat) {
      case 'quarry': { const [x, y] = pick(PLACES.quarrySlots); return [x + (w.sub ? 4 : 0), y]; }
      case 'haul': { const s = w.crew.sledge; return [s.x + s.dir * (27 + (w.sub ? 12 : 0)), w.crew.lane + (w.sub ? 3 : 0)]; }
      case 'straw': return pick(PLACES.strawSpots);
      case 'survey': return pick(PLACES.surveySpots);
      case 'quota': { const tm = w.crew.taskmaster; return tm ? [tm.post[0] + 14, tm.post[1] + 2] : [200, 310]; }
      case 'rest': case 'sleep': return pick(PLACES.restSpots);
      case 'scroll': return [150 + (k % 5) * 8, 326 + (k % 3) * 4];
      case 'conscript': case 'think': case 'ask': case 'wait': default: {
        if (w.act === 'enter' || w.x < 0) return [236 + (w.crew.idx % 4) * 52 + ((k * 7) % 20), 322 + (k % 3) * 7];
        if (this.pyramid.onPyramid(w)) return [w.x, w.y];
        return [clamp(w.x, 24, 462), clamp(w.y, 250, 352)];
      }
    }
  }

  // ---------- events
  seed(snap) {
    this.now = snap.now || Date.now();
    for (const s of snap.sessions || []) {
      const crew = this.crewFor(s.sid, s.proj);
      Object.assign(crew, { title: s.title || '', projName: s.projName || '', lastPrompt: s.lastPrompt || '', model: s.model || '', lastAt: s.lastAt });
      if (!snap.agents.find((a) => a.aid === s.sid)) snap.agents.push({ aid: s.sid, sid: s.sid, pid: null, ended: s.ended });
    }
    for (const a of snap.agents || []) {
      if (!this.crews.has(a.sid)) continue;
      const w = this.workerFor({ aid: a.aid, sid: a.sid, pid: a.pid, agentType: a.agentType, desc: a.desc, proj: this.crews.get(a.sid).proj });
      w.lastAt = a.lastAt || this.now;
      w.detail = a.desc || w.detail;
      const cat = a.tool ? a.tool.cat : null;
      const [x, y] = this.stationFor(w, cat || 'rest');
      w.x = x; w.y = y; w.path = [];
      if (a.tool) {
        w.task = { id: a.tool.id, name: a.tool.name, cat: a.tool.cat, target: a.tool.target, since: a.tool.since };
        w.setLabel(VERB[a.tool.cat] || a.tool.cat, a.tool.target);
        w.begin(a.tool.cat);
        w.path = [];
        if (a.tool.cat === 'build') { w.x = PLACES.stockpile[0]; w.y = PLACES.stockpile[1]; }
      } else if (a.ended || !a.pid) {
        w.ended = !!a.ended; w.act = 'rest'; w.setLabel(VERB.rest, '');
        w.station = [x, y];
      } else {
        w.act = 'think'; w.setLabel(VERB.think, '');
      }
    }
    this.onFocus();
  }

  handle(e, live = true) {
    if (e.t) this.now = Math.max(this.now, e.t);
    if (e.k === 'session') {
      const known = this.crews.has(e.sid);
      const crew = this.crewFor(e.sid, e.proj);
      crew.projName = e.projName || crew.projName;
      const w = this.workerFor(e);
      if (!known && live && this.cooldown('midwives', 20)) this.midwives(w);
      return;
    }
    if (!e.aid) return;
    const crew = this.crewFor(e.sid, e.proj);
    const w = this.workerFor(e);
    if (!['title', 'mode', 'tokens'].includes(e.k)) { w.lastAt = this.now; crew.lastAt = this.now; }
    if (w.leaving) { w.leaving = false; }
    switch (e.k) {
      case 'agent': {
        w.agentType = e.agentType || w.agentType; w.detail = e.desc || w.detail;
        if (LEVITE_TYPES.test(w.agentType) && w.kind !== 'levite') { w.kind = 'levite'; w.spec = workerSpec(crew.color, w.variant, 'levite'); }
        if (live) {
          this.onLog(LOG.joined(w.name, e.desc), 'join', LOG.joined(w.name, ''));
          const parent = this.workers.get(e.pid);
          if (parent && crew.taskmaster && this.cooldown('whip-new' + crew.id, 6)) crew.taskmaster.whip(w, 'new');
        }
        break;
      }
      case 'title': crew.title = e.title; break;
      case 'mode': crew.mode = e.mode; break;
      case 'model': {
        const prev = crew.model;
        crew.model = e.model;
        if (live && e.prev && prev && e.model !== prev && this.cooldown('newking', 600)) this.onMoment('newKing', { w: w.name, model: e.model });
        break;
      }
      case 'tokens': crew.tax += e.tokens; w.tokens += e.tokens; this.stats.tax += e.tokens; break;
      case 'prompt':
        crew.lastPrompt = e.text; crew.promptAt = this.now;
        w.ended = false;
        if (live) {
          this.decree(e.text, crew);
          if (crew.taskmaster) crew.taskmaster.whip(w, 'decree');
          this.onLog(LOG.prompt(e.text.length > 60 ? e.text.slice(0, 59) + '…' : e.text), 'decree');
        }
        if (w.act === 'rest' || w.act === 'sleep') { w.act = 'think'; w.begin('think'); }
        break;
      case 'orders': w.detail = w.detail || e.text; break;
      case 'tool':
        w.startTool(e);
        if (live) this.toolEggs(e, w, crew);
        break;
      case 'done':
        if (e.cancel) { w.cancelTool(e); break; }
        w.endTool(e);
        if (live) this.doneEggs(e, w, crew);
        break;
      case 'text': if (live) w.say(e.text); break;
      case 'think':
        w.thinkBubble();
        if (live && this.cooldown('mutter', 14)) this.magicAct('mutter');
        break;
      case 'end': case 'interrupt':
        w.endTurn();
        if (live) {
          this.onLog(LOG.rest(w.name), 'rest');
          if (!w.sub && crew.promptAt && this.now - crew.promptAt < 25000 && this.cooldown('matzah', 300)) {
            this.onMoment('matzah', { w: w.name, s: Math.max(1, Math.round((this.now - crew.promptAt) / 1000)) });
            this.matzah(w);
          }
        }
        if (w.sub) setTimeout(() => { if (w.ended && !w.task) { w.leaving = true; w.act = 'leave-walk'; w.route(PLACES.goshen[0], PLACES.goshen[1] + rand(-8, 8), 30); w.onArrive = 'leave'; } }, 30000);
        break;
      case 'apierr': if (live && this.cooldown('hail', 90)) { this.claim(6); this.startHail(); this.onMoment('hail', { text: (e.text || '').slice(0, 60) }); } break;
      case 'compact': if (live && this.cooldown('dark', 60)) { this.claim(7); this.startDarkness(); this.onMoment('darkness', { w: w.name }); } break;
      case 'deny': if (live && this.cooldown('heart', 30)) { this.pharaoh.heart = 6; this.onMoment('heart', { w: w.name }); this.sfx('stone'); } break;
      default: break;
    }
  }

  toolEggs(e, w, crew) {
    if (e.cat === 'conscript' && (e.name === 'Agent' || e.name === 'Task')) {
      w.act = 'conscript'; w.actT = 0;
      this.recentSpawns.push(this.now);
      this.recentSpawns = this.recentSpawns.filter((t) => this.now - t < 60000);
      if (e.batch >= 6 && this.cooldown('six', 300)) this.onMoment('sixAtOnce', { w: w.name, n: e.batch });
      else if (this.recentSpawns.length >= 3 && this.cooldown('frogs', 240)) { this.claim(8); this.magicAct('frogs'); this.onMoment('frogs', { w: w.name, n: this.recentSpawns.length }); }
      else if (this.cooldown('afarayim', 900)) { this.magicAct('afarayim'); this.onMoment('afarayim', { w: w.name }); }
    }
    if (e.cmd && /\bgit\s+(log|blame|show|reflog)\b/.test(e.cmd) && this.stageFree() && this.cooldown('joseph', 600)) {
      this.claim(10);
      this.josephBones();
      this.onMoment('joseph', { w: w.name, cmd: e.cmd.length > 50 ? e.cmd.slice(0, 49) + '…' : e.cmd });
    }
    if (e.file) {
      const prev = this.fileEdits.get(e.file);
      if (e.cat === 'build') {
        if (prev && prev.aid !== w.id && this.now - prev.t < 60000 && this.stageFree() && this.cooldown('quarrel', 300)) {
          const other = this.workers.get(prev.aid);
          if (other) { this.claim(5); this.quarrel(w, other); this.onMoment('quarrel', { a: other.name, b: w.name, file: e.target }); }
        }
        this.fileEdits.set(e.file, { aid: w.id, t: this.now });
      }
    }
    const working = [...this.workers.values()].filter((x) => x.working).length;
    if (working >= 6 && this.stageFree() && this.cooldown('locusts', 600)) { this.claim(7); this.startLocusts(); this.onMoment('locusts', { n: working }); }
  }

  doneEggs(e, w, crew) {
    if (e.cat === 'build' && e.err && /not found|has not been read|modified since|No changes/i.test(e.errText || '') && this.cooldown('pithom', 180)) {
      this.onMoment('pithom', { w: w.name, file: e.file ? e.file.split(/[\\/]/).pop() : '', err: '' });
    }
    if (e.cat === 'build' && !e.err && /\.py$/i.test(e.file || '') && this.stageFree() && this.cooldown('snake', 120)) {
      this.claim(6);
      this.magicAct('snake');
      this.onMoment('snake', { w: w.name, file: e.file.split(/[\\/]/).pop() });
    }
    if ((e.name === 'Bash' || e.name === 'PowerShell') && e.cmd) {
      const key = e.cmd.slice(0, 120);
      if (e.err) {
        this.lastFail.set(key, this.now);
        w.bubble = { text: `✗ ${(e.target || e.cmd || 'command').slice(0, 34)} failed`, until: this.t + 4.5, kind: 'err' };
        if (e.testFail && this.cooldown('lice', 180)) { this.claim(6); this.magicAct('lice', w); this.onMoment('lice', { w: w.name }); }
        else if (this.cooldown('blood', 150)) { this.claim(8); this.magicAct('blood'); this.onMoment('blood', { w: w.name, exit: e.exit }); }
        this.onLog(LOG.fail(w.name, 'command'), 'fail');
      } else if (this.lastFail.has(key) && this.now - this.lastFail.get(key) < 600000) {
        this.lastFail.delete(key);
        if (this.cooldown('swallow', 180)) { this.claim(6); this.magicAct('swallow'); this.onMoment('swallow', { w: w.name }); }
      }
    }
    if ((e.name === 'Agent' || e.name === 'Task') && e.err) {
      const parent = w;
      if (crew.taskmaster && this.cooldown('officers', 240)) {
        crew.taskmaster.whip(parent, 'officer');
        this.onMoment('officers', { w: parent.name, helper: 'A helper' });
      }
    }
  }

  // ---------- set pieces
  decree(text, crew) {
    const ph = this.pharaoh;
    ph.state = 'decree'; ph.stT = 0;
    ph.bubble = { text: `“${text.length > 70 ? text.slice(0, 69) + '…' : text}”`, until: this.t + 4.5 };
    this.sfx('decree');
  }

  whipCracked(tm, w) {
    this.whips++;
    this.lastWhipCrew = tm.crew;
    if (w && this.workers.has(w.id)) { w.flinch(this.busy ? 0.45 : 0.8); w.hitFlash = this.t + 0.14; this.sparks(w.x, w.y - 12, C.lemon, 8); }
    this.onLog(LOG.whip(tm.name, w ? w.name : 'the air'), 'whip');
    if (!this.taxShown && this.whips === 1) {
      this.taxShown = true;
      setTimeout(() => this.onMoment('taxes', { tax: fmtTokens(this.stats.tax) }), 900);
    }
  }

  canSendMoses() { return !this.moses && this.t >= this.mosesReadyAt; }

  sendMoses(crew, user) {
    const tm = crew && crew.taskmaster;
    if (!tm || !tm.alive || !this.canSendMoses()) return false;
    const others = [...this.crews.values()].map((c) => c.taskmaster).filter((t) => t && t !== tm && t.alive);
    const far = (s) => others.every((o) => Math.hypot(o.x - s[0], o.y - s[1]) >= 64 && (!o.post || Math.hypot(o.post[0] - s[0], o.post[1] - s[1]) >= 64));
    const spots = PLACES.overseerSpots.filter((s) => s[0] > 150 && far(s)).sort((a, b) => Math.hypot(a[0] - tm.x, a[1] - tm.y) - Math.hypot(b[0] - tm.x, b[1] - tm.y));
    const [px, py] = spots[0] || tm.post;
    tm.post = [px, py];
    tm.state = 'frozen'; tm.target = null; tm.goTo(px, py, 64);
    // the other overseers stop what they are doing and keep their distance
    for (const o of others) { o.target = null; o.state = 'return'; o.backToPost(); }
    this.claim(14);
    const startX = Math.max(-16, px - 150);
    this.moses = { crew, tm, x: startX, y: py + 1, dir: 1, stage: 'walk', stT: 0, path: [[px - 12, py + 1]], speed: 78, walkT: 0 };
    this.sfx('horn');
    this.onFocus({ x: px - 6, y: py - 14, zoom: 2.8, hold: 12.5, user: !!user });
    return true;
  }

  updateMoses(dt) {
    const m = this.moses;
    if (!m) return;
    m.stT += dt;
    const move = () => {
      if (!m.path.length) return false;
      const [tx, ty] = m.path[0];
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), v = m.speed * dt;
      if (Math.abs(dx) > 0.5) m.dir = dx > 0 ? 1 : -1;
      if (d <= v) { m.x = tx; m.y = ty; m.path.shift(); } else { m.x += (dx / d) * v; m.y += (dy / d) * v; }
      m.walkT += dt;
      return true;
    };
    const tm = m.tm;
    switch (m.stage) {
      case 'walk': if (!move()) { m.stage = 'look'; m.stT = 0; tm.dir = -1; this.onMoment('moses', { tm: tm.name, crew: m.crew.label, crewSafe: m.crew.safeLabel }, true); } break;
      case 'look': if (m.stT > 1.6 && !tm.moving) { tm.dir = -1; m.stage = 'raise'; m.stT = 0; this.sfx('gather'); } break;
      case 'raise':
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({ x: m.x + 6 + Math.cos(a) * 26, y: m.y - 28 + Math.sin(a) * 20, tx: m.x + 6, ty: m.y - 30, life: 0.5, max: 0.5, c: Math.random() > 0.5 ? C.lemon : C.gold, homing: true });
        }
        if (m.stT > 0.9) {
          m.stage = 'name'; m.stT = 0;
          this.flash = 1;
          this.hitStop = 0.14;
          this.dim = { t: 0, dur: 1.5, x: (m.x + tm.x) / 2, y: tm.y - 12 };
          this.beam = null;
          this.rings.push({ x: tm.x - 3, y: tm.y - 13, r: 2, max: 90, c: C.lemon, life: 0.9, t: 0 });
          this.rings.push({ x: tm.x - 3, y: tm.y - 13, r: 2, max: 60, c: C.white, life: 0.6, t: 0 });
          this.sparks(tm.x - 3, tm.y - 13, C.lemon, 10);
          tm.flashUntil = this.t + 0.12;
          this.shake = 0.5;
          this.sfx('boom');
        }
        break;
      case 'name':
        if (tm.state !== 'dead' && m.stT < 0.45) tm.x += 14 * dt;
        if (m.stT > 0.6 && tm.state !== 'dead') { tm.state = 'dead'; tm.alive = false; this.dust(tm.x, tm.y, 12); this.sfx('thud'); }
        if (m.stT > 1.3) { m.stage = 'approach'; m.stT = 0; m.speed = 34; m.path = [[tm.x - 13, tm.y + 1]]; }
        break;
      case 'approach':
        if (!move()) {
          m.stage = 'bury'; m.stT = 0; m.dir = 1;
          this.sfx('sand');
          this.mounds.push({ x: tm.x, y: tm.y + 1, t: this.t, name: tm.name, dur: 2.4 });
        }
        break;
      case 'bury':
        // scooping sand with both hands and throwing it over the body
        if (Math.random() < 0.7) {
          const sx = m.x + 6, sy = m.y - 7, tx = tm.x + rand(-10, 10), fl = 0.42;
          this.particles.push({ x: sx, y: sy, vx: (tx - sx) / fl, vy: -38, g: 170, life: fl, max: fl, c: Math.random() > 0.5 ? C.umber : C.clay });
        }
        if (m.stT > 2.4 && tm.state !== 'buried') tm.state = 'buried';
        if (m.stT > 2.9) {
          m.crew.buried++;
          this.onLog(LOG.moses(tm.name), 'moses');
          m.stage = 'pharaoh'; m.stT = 0;
          const ph = this.pharaoh; ph.state = 'angry'; ph.stT = 0; ph.bubble = { text: 'MOSES!', until: this.t + 2.4 };
        }
        break;
      case 'pharaoh':
        if (m.stT > 1.2) {
          m.stage = 'flee'; m.stT = 0; m.speed = 96;
          m.path = [[PLACES.midian[0], m.y + 6]];
          this.mosesReadyAt = this.t + 60;
          m.crew.taskmaster = null;
          m.crew.appointAt = this.t + 25;
          setTimeout(() => this.onMoment('midian', {}), 600);
        }
        break;
      case 'flee': if (!move()) { this.moses = null; } break;
      default: break;
    }
  }

  drawMoses(ctx) {
    const m = this.moses;
    if (!m) return;
    let pose;
    if (m.path.length) {
      const legs = ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(m.walkT * (m.stage === 'flee' ? 12 : 9)) % 4];
      pose = { legs, arm: 'staff', far: 'swing', prop: 'staff' };
    } else if (m.stage === 'look') {
      const k = Math.floor(m.stT / 0.4) % 4;
      pose = { legs: 'stand', arm: 'staff', far: 'side', prop: 'staff', look: k === 0 || k === 2 ? 'back' : null };
      m.lookDir = k === 1 ? -1 : 1;
    } else if (m.stage === 'raise') {
      pose = { legs: 'stand', arm: 'staffUp', far: 'raise', prop: 'staff-up' };
    } else if (m.stage === 'name') {
      pose = { legs: 'brace', arm: 'fwd', far: 'side', lean: 1, mouth: 'open' };
    } else if (m.stage === 'bury') {
      const k = Math.floor(m.stT / 0.22) % 2;
      pose = { legs: 'kneel', arm: k ? 'fwd' : 'swingDown', far: k ? 'pull' : 'side', lean: 1 };
    } else pose = { legs: 'stand', arm: 'staff', far: 'side', prop: 'staff' };
    const dir = m.stage === 'look' ? (m.lookDir || 1) : m.dir;
    const spr = human(`moses|${pose.legs}|${pose.arm}|${pose.far}|${pose.prop}|${pose.look}|${pose.mouth}|${pose.lean || 0}`, MOSES, pose);
    if (m.stage === 'name' && m.stT < 0.12) blitFlash(ctx, spr, m.x, m.y, dir, C.white, C.lemon);
    else blit(ctx, spr, m.x, m.y, dir);
    if (m.stage === 'name') {
      const a = Math.max(0.15, 1.35 - m.stT * 14); // from nearly upright to level in about 0.09 s
      const hx = m.x + dir * 6, hy = m.y - 11, len = 14;
      const bx = hx - dir * Math.cos(a) * 3, by = hy + Math.sin(a) * 3;
      const tx = hx + dir * Math.cos(a) * len, ty = hy - Math.sin(a) * len;
      const n = Math.max(1, Math.round(Math.hypot(tx - bx, ty - by)));
      for (let k = 0; k <= n; k++) { ctx.fillStyle = k > n - 2 ? C.gold : C.wine; ctx.fillRect(Math.round(bx + (tx - bx) * k / n), Math.round(by + (ty - by) * k / n), 1, 1); }
    }
    if (m.stage === 'name' && m.stT < 1.1) {
      // the Name: light bursting where the staff lands
      const k = m.stT / 1.1;
      const bx = m.tm.x - dir * 3, by = m.tm.y - 13;
      ctx.globalAlpha = 1 - k;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const len = 12 + k * 70;
        ctx.fillStyle = a % 2 ? C.lemon : C.white;
        for (let r = 4; r < len; r += 2) ctx.fillRect(Math.round(bx + Math.cos(ang) * r), Math.round(by + Math.sin(ang) * r * 0.8), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (m.stage === 'raise') {
      // rays of light
      ctx.fillStyle = C.lemon;
      const cx = Math.round(m.x + dir * 6), cy = Math.round(m.y - 32);
      for (let a = 0; a < 8; a++) {
        const ang = a * Math.PI / 4 + this.t * 2;
        for (let r = 3; r < 7; r++) ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1);
      }
    }
  }

  magicAct(kind, target) {
    const [a, b] = this.magi;
    const mg = kind === 'blood' ? b : a;
    mg.act = kind; mg.actT = 0; mg.target = target; mg.thrown = false;
    if (kind === 'lice') { b.act = 'lice'; b.actT = 0; b.thrown = false; }
    if (kind === 'afarayim') mg.bubble = { text: 'Straw to Afarayim?', until: this.t + 4 };
    if (kind !== 'mutter') {
      this.sfx('magic');
      const focus = { snake: [470, 280, 2.4], swallow: [460, 280, 2.2], blood: [470, 230, 1.5], frogs: [420, 250, 1.3], lice: [470, 270, 2.2] }[kind];
      if (focus) this.onFocus({ x: focus[0], y: focus[1], zoom: focus[2], hold: 3.2 });
    }
  }

  updateMagi(dt) {
    for (const mg of this.magi) {
      if (!mg.act) continue;
      mg.actT += dt;
      const fx = mg.x - 20, fy = mg.y + 2;
      const ring = (x, y, c) => { for (let k = 0; k < 16; k++) { const ang = (k / 16) * Math.PI * 2; this.particles.push({ x: x + Math.cos(ang) * 3, y: y + Math.sin(ang) * 2, vx: Math.cos(ang) * 34, vy: Math.sin(ang) * 20 - 6, life: 0.6, max: 0.6, c }); } };
      switch (mg.act) {
        case 'snake':
          if (mg.actT > 0.5 && !mg.thrown) {
            mg.thrown = true;
            this.snakes.push({ x: fx, y: fy, t: 0, life: 8, stick: 0.8, dir: -1, speed: 9, len: 22 });
            setTimeout(() => { this.puff(fx, fy - 3); this.puff(fx - 6, fy - 2); this.sparks(fx, fy - 4, C.white, 10); }, 800);
            ring(fx, fy - 3, C.leaf); this.sfx('hiss');
          }
          if (mg.actT > 1.4) mg.act = null;
          break;
        case 'swallow':
          if (mg.actT > 0.3 && !mg.thrown) {
            mg.thrown = true;
            this.snakes.push({ x: fx + 4, y: fy + 3, t: 0, life: 6, stick: 0, dir: -1, speed: 2, len: 12, small: true });
            this.snakes.push({ x: fx - 14, y: fy - 2, t: 0, life: 6, stick: 0, dir: -1, speed: 2, len: 12, small: true });
            this.snakes.push({ x: fx - 90, y: fy + 1, t: 0, life: 7, stick: 1.0, dir: 1, speed: 26, len: 30, big: true, gold: true });
            ring(fx - 90, fy - 3, C.lemon); this.sfx('hiss');
          }
          if (mg.actT > 1.2) mg.act = null;
          break;
        case 'blood':
          if (mg.actT > 0.6 && !mg.thrown) { mg.thrown = true; this.blood = { t0: this.t, until: this.t + 7 }; this.tint = { c: C.blood, t: 0, dur: 0.9, a: 0.38 }; this.sparks(mg.x - 8, mg.y - 13, C.red, 14); }
          if (mg.actT > 5) mg.act = null;
          break;
        case 'frogs':
          if (mg.actT > 0.7 && !mg.thrown) {
            mg.thrown = true;
            ring(fx, fy - 3, C.leaf);
            for (let i = 0; i < 40; i++) {
              const fromBank = i > 6;
              this.frogs.push({ x: fromBank ? rand(130, 620) : fx + rand(-6, 6), y: fromBank ? rand(172, 182) : fy, baseY: 0, vx: 0, vy: 0, hopT: rand(0, 0.9), life: rand(6, 9), dir: -1, drift: rand(-14, 14) });
            }
            this.sfx('frogs');
          }
          if (mg.actT > 1.6) mg.act = null;
          break;
        case 'lice':
          if (mg.actT > 1.2 && !mg.thrown) {
            mg.thrown = true; this.puff(fx, fy - 8); this.sfx('fizzle');
            if (mg.i === 0) for (const w of this.workers.values()) w.lice = 6;
          }
          if (mg.actT > 4.4) mg.act = null;
          break;
        case 'mutter':
          if (Math.random() < 0.3) this.particles.push({ x: mg.x + rand(-4, 4), y: mg.y - 27 + rand(-3, 3), vx: rand(-3, 3), vy: rand(-10, -4), life: 0.9, max: 0.9, c: Math.random() > 0.5 ? C.cyan : C.lemon });
          if (mg.actT > 2) mg.act = null;
          break;
        case 'afarayim': if (mg.actT > 4) mg.act = null; break;
        default: mg.act = null;
      }
    }
  }

  drawMagi(ctx) {
    for (const mg of this.magi) {
      const spec = MAGICIAN(mg.i);
      let pose = { legs: 'stand', arm: 'staff', far: 'side', prop: 'magestaff' };
      const a = mg.act, t = mg.actT;
      if (a === 'snake' || a === 'swallow') pose = t < 0.5 ? { legs: 'stand', arm: 'raise', far: 'side', prop: null } : { legs: 'stand', arm: 'point', far: 'side' };
      else if (a === 'blood') pose = { legs: 'stand', arm: 'fwd', far: 'side', prop: 'bowl' };
      else if (a === 'frogs') pose = { legs: 'stand', arm: t < 0.7 ? 'raise' : 'point', far: 'raise', prop: null };
      else if (a === 'lice') pose = t < 1.2 ? { legs: 'stand', arm: 'raise', far: 'raise' } : { legs: 'stand', arm: 'scratch', far: 'side', eye: 'shut' };
      else if (a === 'mutter') pose = { legs: 'stand', arm: 'raise', far: 'side', mouth: Math.floor(t * 5) % 2 ? 'open' : null };
      else if (a === 'afarayim') pose = { legs: 'stand', arm: 'point', far: 'side', mouth: Math.floor(t * 5) % 2 ? 'open' : null };
      const bowl = a === 'blood' && t > 0.6 ? C.red : C.azure;
      const s = Object.assign({}, spec, { bowl });
      const spr = human(`mg${mg.i}|${pose.legs}|${pose.arm}|${pose.far}|${pose.prop}|${pose.eye}|${pose.mouth}|${bowl}`, s, pose);
      blit(ctx, spr, mg.x, mg.y, mg.dir);
    }
  }

  drawPharaoh(ctx) {
    const ph = this.pharaoh;
    let pose;
    if (ph.path.length) pose = { legs: ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(ph.walkT * 8) % 4], arm: ph.carry ? 'fwd' : 'down', far: 'swing', prop: ph.carry || null };
    else if (ph.state === 'decree') pose = { legs: 'sit', arm: 'raise', far: 'side', prop: 'crook', mouth: Math.floor(ph.stT * 5) % 2 ? 'open' : null };
    else if (ph.state === 'angry') pose = { legs: 'stand', arm: 'point', far: 'raise', mouth: 'open' };
    else if (ph.state === 'crouch') pose = { legs: 'crouch', arm: 'down', far: 'side' };
    else if (ph.state === 'work') pose = { legs: 'stand', arm: 'fwd', far: 'side', prop: 'brick' };
    else pose = { legs: 'sit', arm: 'fwd', far: 'side', prop: 'crook', eye: ph.asleep ? 'shut' : 'open' };
    const spr = human(`ph|${pose.legs}|${pose.arm}|${pose.far}|${pose.prop}|${pose.eye}|${pose.mouth}`, PHARAOH, pose);
    blit(ctx, spr, ph.x, ph.y, ph.dir);
    if (ph.heart > 0) {
      const x = Math.round(ph.x - 2), y = Math.round(ph.y - 34);
      const c = ph.heart > 3 ? C.red : C.mist;
      ctx.fillStyle = c;
      ctx.fillRect(x - 2, y, 2, 1); ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x - 3, y + 1, 7, 2); ctx.fillRect(x - 2, y + 3, 5, 1); ctx.fillRect(x - 1, y + 4, 3, 1); ctx.fillRect(x, y + 5, 1, 1);
      if (ph.heart <= 3) { ctx.fillStyle = C.steel; ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 1, y + 2, 1, 1); }
    }
  }

  updatePharaoh(dt) {
    const ph = this.pharaoh;
    ph.stT += dt;
    if (ph.heart > 0) ph.heart -= dt;
    if (ph.path.length) {
      const [tx, ty] = ph.path[0];
      const dx = tx - ph.x, dy = ty - ph.y, d = Math.hypot(dx, dy), v = (ph.speed || 26) * dt;
      if (Math.abs(dx) > 0.5) ph.dir = dx > 0 ? 1 : -1;
      if (d <= v) { ph.x = tx; ph.y = ty; ph.path.shift(); if (!ph.path.length && ph.onArrive) { const f = ph.onArrive; ph.onArrive = null; f(); } }
      else { ph.x += (dx / d) * v; ph.y += (dy / d) * v; }
      ph.walkT = (ph.walkT || 0) + dt;
      return;
    }
    if ((ph.state === 'decree' && ph.stT > 2.6) || (ph.state === 'angry' && ph.stT > 2.4)) { ph.state = 'sit'; ph.stT = 0; }
    const anyWork = [...this.workers.values()].some((w) => w.working);
    if (anyWork) { ph.idleT = 0; ph.asleep = false; }
    else { ph.idleT = (ph.idleT || 0) + dt; ph.asleep = ph.idleT > 180; }
    if (ph.asleep && Math.random() < 0.012) this.particles.push({ x: ph.x - 4, y: ph.y - 26, vx: -3, vy: -8, life: 1.6, max: 1.6, c: C.white, z: true });
  }

  pharaohWalk(pts, onArrive, speed = 26) {
    const ph = this.pharaoh;
    ph.path = pts.map((p) => [p[0], p[1]]);
    ph.onArrive = onArrive; ph.speed = speed; ph.state = 'walk';
  }

  // Midrash Tanchuma: on day one Pharaoh worked too.
  softMouth() {
    // down the steps, carry one brick to the pyramid's foot, back to the throne (about 12 seconds)
    const ph = this.pharaoh;
    this.claim(12);
    this.onFocus({ follow: ph, zoom: 2.2, hold: 7 }); // down the steps with the brick; the walk back is not worth the time
    ph.carry = 'brick';
    this.pharaohWalk([[520, 282], [490, 300], [462, 304]], () => {
      ph.state = 'work'; ph.stT = 0; ph.carry = null;
      this.dust(456, 304, 5); this.sfx('place', { x: 456 });
      setTimeout(() => this.pharaohWalk([[490, 300], [520, 282], PLACES.pharaohSeat], () => { ph.state = 'sit'; ph.dir = -1; }, 34), 1400);
    }, 34);
    this.onMoment('softMouth', {});
  }

  // Rashi, Shemot 7:15
  nileTrip() {
    const ph = this.pharaoh;
    this.onFocus({ follow: ph, zoom: 2.2, hold: 9 });
    this.pharaohWalk([[520, 282], [470, 250], [452, NILE.bottom + 6]], () => {
      ph.state = 'crouch'; ph.stT = 0;
      setTimeout(() => this.pharaohWalk([[470, 250], [520, 282], PLACES.pharaohSeat], () => { ph.state = 'sit'; ph.dir = -1; }, 22), 3200);
    }, 22);
    this.onMoment('nile', {});
  }

  batya() {
    const [bx] = PLACES.basket;
    const b = { kind: 'batya', x: bx + 34, y: NILE.bottom + 6, t: 0, reach: 0 };
    this.specials.push(b);
    this.onFocus({ x: bx + 16, y: NILE.bottom - 2, zoom: 2.6, hold: 5 });
    this.onMoment('batya', {});
    this.sfx('stretch');
  }

  josephBones() {
    this.onFocus({ x: 318, y: NILE.bottom - 2, zoom: 2.2, hold: 6 });
    this.specials.push({ kind: 'serach', x: 300, y: NILE.bottom + 6, t: 0 });
    this.specials.push({ kind: 'coffin', x: 336, y: NILE.top + 10, t: 0 });
    this.sfx('magic');
  }

  midwives(w) {
    const [gx, gy] = PLACES.goshen;
    this.onFocus({ x: gx + 44, y: gy - 12, zoom: 2.4, hold: 5 });
    this.specials.push({ kind: 'midwife', i: 0, x: gx + 24, y: gy - 4, t: 0 });
    this.specials.push({ kind: 'midwife', i: 1, x: gx + 36, y: gy + 4, t: 0 });
    const crew = w.crew;
    setTimeout(() => this.onMoment('midwives', { w: w.name, title: crew.title }), 400);
  }

  quarrel(a, b) {
    const mx = (a.x + b.x) / 2;
    this.onFocus({ x: mx, y: (a.y + b.y) / 2 - 8, zoom: 2.6, hold: 4 });
    a.say('Who made you prince over us?', 4);
    setTimeout(() => b.say('Will you kill me too?', 4), 1200);
    a.flinch(0.3); b.flinch(0.3);
    this.sparks(mx, Math.min(a.y, b.y) - 20, C.red, 6);
  }

  matzah(w) { this.particles.push({ x: w.x, y: w.y - 26, vx: 0, vy: -6, life: 2.2, max: 2.2, c: C.sand, matzah: true }); }

  startHail() { this.hail = { t: 0, dur: 5 }; this.flash = 0.7; this.sfx('thunder'); this.onFocus({ x: W / 2, y: H, zoom: 1, hold: 4 }); }
  startDarkness() { this.darkness = { t: 0, dur: 5.5 }; this.sfx('dark'); this.onFocus({ x: W / 2, y: H, zoom: 1, hold: 5 }); }
  startLocusts() {
    const swarm = [];
    for (let i = 0; i < 260; i++) swarm.push({ x: rand(-260, -10), y: rand(20, 150), ph: rand(0, 6), s: rand(60, 90) });
    this.locusts = { t: 0, dur: 8, swarm };
    this.onFocus({ x: W / 2, y: H, zoom: 1, hold: 5 });
    this.sfx('locusts');
  }

  // ---------- stones
  stockTake() { this.stock = Math.max(0, this.stock - 1); }

  placeStone(w) {
    const p = this.pyramid;
    p.release();
    if (p.capT > 0) {
      p.total++; p.carry = (p.carry || 0) + 1;
      w.slotN = null; w.placed++; this.stats.stonesToday++;
      this.sfx('place', { x: w.x });
      return;
    }
    const s = p.slot(p.shown);
    p.total++; p.shown++;
    w.slotN = null;
    w.placed++;
    this.stats.stonesToday++;
    this.dust(s.x + 5, s.y + BLOCK_H, 6);
    this.sparks(s.x + 5, s.y, C.lemon, 3);
    this.sfx('place', { x: s.x });
    this.onLog(LOG.stone(w.name, w.task && w.task.target ? '' : (w.lastFile || '')), 'stone', LOG.stone(w.name, ''));
    if (p.shown >= PYRAMID_CAP) this.capstone();
  }

  capstone() {
    const p = this.pyramid;
    p.capT = 0.01;
    this.claim(7);
    this.sfx('capstone');
    for (const w of this.workers.values()) w.cheer(2.5);
    this.onMoment('capstone', { project: 'Your agents', n: PYRAMID_CAP });
    this.onLog(LOG.capstone('your agents'), 'capstone');
    setTimeout(() => {
      this.opts.scene.completed.push(1);
      p.shown = Math.min(p.carry || 0, PYRAMID_CAP - 1); p.carry = 0; p.capT = 0; p.cacheN = -1;
    }, 6000);
  }


  setTotals(total) {
    const p = this.pyramid;
    const add = total - p.total;
    if (p.total === 0 || add < 0 || add > 40) {
      p.total = total;
      p.shown = total % PYRAMID_CAP;
      p.cacheN = -1;
      const done = Math.floor(total / PYRAMID_CAP);
      this.opts.scene.completed = new Array(done).fill(1);
    }
  }

  // ---------- particles
  dust(x, y, n) { for (let i = 0; i < n; i++) this.particles.push({ x: x + rand(-4, 4), y: y - rand(0, 2), vx: rand(-14, 14), vy: rand(-10, -2), g: 20, life: rand(0.4, 0.8), max: 0.8, c: Math.random() > 0.5 ? C.sand : C.tan }); }
  chips(x, y) { for (let i = 0; i < 3; i++) this.particles.push({ x, y, vx: rand(4, 24), vy: rand(-26, -8), g: 90, life: 0.5, max: 0.5, c: Math.random() > 0.5 ? C.sand : C.white }); }
  sparks(x, y, c, n) { for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 10), g: 30, life: rand(0.25, 0.6), max: 0.6, c }); }
  puff(x, y) { for (let i = 0; i < 10; i++) this.particles.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-8, 8), vy: rand(-12, -2), life: 0.8, max: 0.8, c: Math.random() > 0.5 ? C.cloud : C.mist }); }

  // ---------- main loop
  update(dt, realNow) {
    if (this.hitStop > 0) { this.hitStop -= dt; this.updateEffects(dt * 0.15); return; }
    this.t += dt;
    if (realNow && realNow > this.now) this.now = realNow;
    for (const w of [...this.workers.values()]) {
      // waiting for permission: a quick tool that never came back
      if (w.task && QUICK_TOOLS.has(w.task.name) && this.now - w.task.since > (w.task.perm ? 1200 : 9000) && w.act !== 'wait') {
        w.act = 'wait'; w.actT = 0; w.setLabel(VERB.wait, w.task.target);
        w.bubble = { text: '?', until: this.t + 999, kind: 'ask' };
        const tm = w.crew.taskmaster;
        if (tm && tm.alive && tm.state === 'post') { tm.state = 'point'; tm.stT = 0; tm.dir = 1; tm.bubble = { text: `Pharaoh! ${w.name} needs your OK.`, until: this.t + 4 }; }
      }
      if (w.task && w.task.cat === 'ask' && w.act !== 'ask') { w.act = 'ask'; w.bubble = { text: '?', until: this.t + 999, kind: 'ask' }; }
      if (w.act !== 'wait' && w.act !== 'ask' && w.bubble && w.bubble.kind === 'ask') w.bubble = null;
      if (w.onArrive && !w.moving) { const k = w.onArrive; w.onArrive = null; if (k === 'leave') { this.removeWorker(w); continue; } }
      w.update(dt);
      if (w.lice > 0) w.lice -= dt;
    }
    // crews: overseers, sledges, idle crews going home
    for (const crew of [...this.crews.values()]) {
      if (crew.taskmaster) crew.taskmaster.update(dt);
      if (!crew.taskmaster && crew.appointAt && this.t > crew.appointAt) { crew.appointAt = 0; this.appoint(crew, false); }
      this.updateSledge(crew, dt);
      if (this.now - crew.lastAt > 45 * 60 * 1000) {
        for (const w of crew.workers()) { if (!w.leaving) { w.leaving = true; w.route(PLACES.goshen[0], PLACES.goshen[1], 26); w.onArrive = 'leave'; } }
        if (!crew.workers().length) this.crews.delete(crew.id);
      }
    }
    this.updateMoses(dt);
    this.updateMagi(dt);
    this.updatePharaoh(dt);
    this.updateEffects(dt);
  }

  updateSledge(crew, dt) {
    const s = crew.sledge, y = crew.lane;
    const [x0, x1] = crew.laneX;
    // who is on the ropes: anyone whose command is running, plus anyone finishing the trip they started
    const haulers = [];
    for (const w of crew.workers()) {
      const was = w.hauling;
      w.hauling = false;
      if (w.act !== 'haul' || w.moving) continue;
      if (!was) {
        if (!w.task && !w.haulDue) continue;
        w.haulDue = false; w.haulLeg = s.leg;
      } else if (!w.task && s.leg !== w.haulLeg) {
        // trip done and nothing else to pull: let go of the rope and step off the lane
        w.act = 'think'; w.actT = 0; w.setLabel(VERB.think, '');
        w.goTo(w.x - s.dir * 4, Math.min(H - 8, w.y + 10), 24);
        continue;
      }
      haulers.push(w);
    }
    // everyone takes a place on the rope in front of the sledge, hurrying there if needed
    let settled = true;
    haulers.forEach((w, i) => {
      w.hauling = true;
      const tx = s.x + s.dir * (27 + i * 12), ty = y + (i % 2) * 3;
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
      if (d > 1.5) {
        settled = false;
        const k = Math.min(1, (70 * dt) / d);
        w.x += dx * k; w.y += dy * k; w.walkT += dt; w.dir = dx >= 0 ? 1 : -1;
      } else { w.x = tx; w.y = ty; w.dir = s.dir; }
    });
    s.moving = false;
    if (s.pause > 0) { s.pause -= dt; return; }
    if (!haulers.length || !settled) return;
    const whipped = this.t < Math.max(...haulers.map((h) => h.boostUntil));
    const v = Math.min(30, 14 + (haulers.length - 1) * 5) * (whipped ? 1.5 : 1) * (s.block ? 1 : 1.4);
    s.x += s.dir * v * dt;
    s.moving = true;
    for (const w of haulers) { w.x += s.dir * v * dt; w.walkT += dt; }
    if (Math.random() < 0.2) this.dust(s.x - s.dir * 11, y + 1, 1);
    if (s.dir > 0 && s.x >= x1) {
      // at the stockpile: the stone comes off and joins the pile
      s.x = x1; s.dir = -1; s.leg++; s.pause = 0.9;
      if (s.block) { s.block = false; this.stock = Math.min(9, this.stock + 1); this.dust(x1 + 4, y, 8); this.sfx('thud', { x: x1 }); }
    } else if (s.dir < 0 && s.x <= x0) {
      // back at the quarry: a fresh stone goes on
      s.x = x0; s.dir = 1; s.leg++; s.pause = 0.9; s.block = true;
      this.chips(x0, y - 6); this.sfx('stone', { x: x0 });
    }
  }

  updateEffects(dt) {
    for (const p of this.particles) {
      if (p.homing) { p.x += (p.tx - p.x) * 6 * dt; p.y += (p.ty - p.y) * 6 * dt; }
      else { p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; if (p.g) p.vy += p.g * dt; }
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) { r.t += dt; r.r = r.max * Math.min(1, r.t / r.life); }
    this.rings = this.rings.filter((r) => r.t < r.life);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.dim) { this.dim.t += dt; if (this.dim.t > this.dim.dur) this.dim = null; }
    if (this.beam) { this.beam.t += dt; if (this.beam.t > this.beam.dur) this.beam = null; }
    if (this.tint) { this.tint.t += dt; if (this.tint.t > this.tint.dur) this.tint = null; }
    for (const f of this.frogs) {
      f.hopT -= dt; f.life -= dt;
      if (!f.baseY) f.baseY = f.y;
      if (f.hopT <= 0 && f.y >= f.baseY - 0.1) {
        f.hopT = rand(0.45, 1.0);
        f.vy = -rand(34, 48);
        f.vx = f.drift + rand(-8, 8);
        f.baseY = Math.min(352, f.baseY + rand(3, 11));
        f.dir = f.vx < 0 ? -1 : 1;
      }
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 150 * dt;
      if (f.y >= f.baseY) { f.y = f.baseY; f.vy = 0; f.vx = 0; }
    }
    this.frogs = this.frogs.filter((f) => f.life > 0 && f.x > -20);
    for (const s of this.snakes) {
      s.t += dt;
      if (s.t > s.stick) s.x += s.dir * s.speed * dt;
      if (s.big && s.t > s.stick) for (const o of this.snakes) if (o.small && !o.gone && Math.abs(o.x - (s.x + s.dir * 6)) < 8) { o.gone = true; this.sparks(o.x, o.y - 3, C.leaf, 5); this.sfx('gulp'); }
    }
    this.snakes = this.snakes.filter((s) => s.t < s.life && !s.gone);
    if (this.hail) { this.hail.t += dt; if (this.hail.t > this.hail.dur) this.hail = null; }
    if (this.darkness) { this.darkness.t += dt; if (this.darkness.t > this.darkness.dur) this.darkness = null; }
    if (this.locusts) {
      this.locusts.t += dt;
      for (const l of this.locusts.swarm) { l.x += l.s * dt; l.y += Math.sin(this.t * 3 + l.ph) * 12 * dt; }
      if (this.locusts.t > this.locusts.dur) this.locusts = null;
    }
    for (const s of this.specials) s.t += dt;
    this.specials = this.specials.filter((s) => s.t < (s.kind === 'coffin' ? 9 : s.kind === 'serach' ? 9 : s.kind === 'batya' ? 7 : 6));
    this.mounds = this.mounds.filter((m) => this.t - m.t < 600);
    if (this.pyramid.capT > 0) this.pyramid.capT += dt;
    for (const mg of this.magi) if (mg.bubble && this.t > mg.bubble.until) mg.bubble = null;
    if (this.pharaoh.bubble && this.t > this.pharaoh.bubble.until) this.pharaoh.bubble = null;
  }

  // ---------- drawing
  groundShadow(ctx, x, y, w = 7) {
    ctx.fillStyle = 'rgba(115,62,57,0.35)';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, 1);
    ctx.fillRect(Math.round(x - w / 2) + 1, Math.round(y) + 1, w - 2, 1);
  }

  drawActors(ctx, extras = []) {
    for (const w of this.workers.values()) if (!(w.act === 'sleep' && !w.moving)) this.groundShadow(ctx, w.x, w.y - 1, 8);
    for (const c of this.crews.values()) if (c.taskmaster && c.taskmaster.state !== 'buried' && c.taskmaster.state !== 'dead') this.groundShadow(ctx, c.taskmaster.x, c.taskmaster.y - 1, 9);
    for (const mg of this.magi) this.groundShadow(ctx, mg.x, mg.y - 1, 9);
    if (this.moses) this.groundShadow(ctx, this.moses.x, this.moses.y - 1, 9);
    const list = [];
    for (const w of this.workers.values()) list.push({ y: w.y, d: () => w.draw(ctx) });
    for (const c of this.crews.values()) if (c.taskmaster) list.push({ y: c.taskmaster.y, d: () => c.taskmaster.draw(ctx) });
    for (const c of this.crews.values()) list.push({ y: c.lane - 1, d: () => this.drawSledge(ctx, c) });
    if (this.moses) list.push({ y: this.moses.y, d: () => this.drawMoses(ctx) });
    list.push({ y: this.pharaoh.y, d: () => this.drawPharaoh(ctx) });
    list.push({ y: this.fan.y - 1, d: () => this.drawFan(ctx) });
    list.push({ y: this.magi[0].y, d: () => this.drawMagi(ctx) });
    for (const m of this.mounds) list.push({ y: m.y, d: () => this.drawMound(ctx, m) });
    for (const s of this.specials) list.push({ y: s.y, d: () => this.drawSpecial(ctx, s) });
    list.push({ y: PLACES.stockpile[1] - 2, d: () => this.drawStock(ctx) });
    list.push(...extras);
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();
    // snakes and frogs on top of the ground layer
    for (const s of this.snakes) {
      if (s.t < s.stick) { ctx.fillStyle = C.wine; ctx.fillRect(Math.round(s.x) - 6, Math.round(s.y) - 1, 12, 1); ctx.fillStyle = C.gold; ctx.fillRect(Math.round(s.x) - 6, Math.round(s.y) - 1, 1, 1); continue; }
      const spr = snakeSprite(Math.floor(s.t * 6) % 3, s.len || 12, !!s.gold);
      blit(ctx, spr, s.x, s.y, s.dir);
    }
    for (const f of this.frogs) blit(ctx, frogSprite(f.vy < 0 ? 1 : 0), f.x, f.y, f.dir);
    this.drawStrike(ctx);
  }

  // what a worker is doing right now, for the label over his head; null while resting or walking in
  doing(w) {
    if (w.x < -4 || w.leaving) return null;
    if (w.act === 'wait') return 'wait';
    if (w.act === 'ask') return 'ask';
    if (w.act === 'sleep') return w.moving ? null : 'sleep';
    if (w.act === 'rest' || w.act === 'enter') return null;
    if (w.hauling) return 'haul';
    if (w.task) return w.task.cat;
    if (w.act === 'build' && (w.stones > 0 || w.carrying)) return 'build';
    if (w.act === 'quarry' && !w.moving) return 'quarry';
    return this.now - w.lastAt < 30000 ? 'think' : null;
  }

  // head height of a worker, where the icon's tail points
  headY(w) { return w.y - (w.act === 'sleep' && !w.moving ? 8 : w.carrying ? 30 : 23); }

  drawSledge(ctx, crew) {
    const s = crew.sledge, x = Math.round(s.x), y = crew.lane, d = s.dir;
    // ground shadow
    ctx.fillStyle = 'rgba(62,39,49,0.28)'; ctx.fillRect(x - 12, y + 1, 26, 2);
    // wooden runners, the front end curled up
    ctx.fillStyle = C.plum; ctx.fillRect(x - 12, y - 2, 25, 3);
    ctx.fillStyle = C.wine; ctx.fillRect(x - 11, y - 1, 23, 1);
    const tip = d > 0 ? x + 12 : x - 12;
    ctx.fillStyle = C.plum; ctx.fillRect(tip, y - 5, 1, 4); ctx.fillRect(tip - d, y - 5, 1, 1);
    if (s.block) {
      // the stone: a lit top face over a shaded front, a darker end, chisel marks; outlined below and at the sides
      const bx = x - 9, by = y - 16, bw = 18;
      ctx.fillStyle = C.plum; ctx.fillRect(bx - 1, by + 1, 1, 13); ctx.fillRect(bx + bw, by + 1, 1, 13); ctx.fillRect(bx, by + 14, bw, 1);
      ctx.fillStyle = C.wine; ctx.fillRect(bx, by, bw, 1);
      ctx.fillStyle = C.sand; ctx.fillRect(bx, by + 1, bw, 4);
      ctx.fillStyle = C.white; ctx.fillRect(bx + 1, by + 1, bw - 4, 1);
      ctx.fillStyle = C.peach; ctx.fillRect(bx, by + 5, bw, 9);
      ctx.fillStyle = C.tan; ctx.fillRect(bx, by + 10, bw, 4); ctx.fillRect(bx + bw - 4, by + 5, 4, 9);
      ctx.fillStyle = C.clay; ctx.fillRect(bx + bw - 2, by + 5, 2, 9); ctx.fillRect(bx, by + 13, bw, 1);
      ctx.fillStyle = C.umber; ctx.fillRect(bx + 3, by + 7, 2, 1); ctx.fillRect(bx + 8, by + 11, 1, 1); ctx.fillRect(bx + 11, by + 8, 2, 1); ctx.fillRect(bx + 6, by + 3, 1, 1);
    } else {
      // empty: the spare rope coiled on the boards
      ctx.fillStyle = C.wine; ctx.fillRect(x - 5, y - 4, 7, 2);
      ctx.fillStyle = C.umber; ctx.fillRect(x - 4, y - 4, 5, 1);
    }
    // one rope from the front of the sledge through every hauler's hands
    const haulers = crew.workers().filter((w) => w.hauling).sort((a, b) => d * (a.x - b.x));
    let px = tip, py = y - 4;
    for (const w of haulers) {
      const hx = Math.round(w.x - d * 2), hy = Math.round(w.y - 14);
      const n = Math.max(1, Math.abs(hx - px));
      const sag = s.moving ? 0 : 1.5;
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        const rx = Math.round(px + (hx - px) * f), ry = Math.round(py + (hy - py) * f + Math.sin(f * Math.PI) * sag);
        ctx.fillStyle = C.wine; ctx.fillRect(rx, ry, 1, 1);
        ctx.fillStyle = C.plum; ctx.fillRect(rx, ry + 1, 1, 1);
      }
      px = hx; py = hy;
    }
    if (s.moving && s.block) {
      // water poured in front of the runners, as on Djehutihotep's tomb wall
      ctx.fillStyle = C.azure;
      if (Math.floor(this.t * 6) % 2) { ctx.fillRect(tip + d * 2, y, 2, 1); ctx.fillRect(tip + d * 4, y - 1, 1, 1); }
    }
  }

  drawStock(ctx) {
    const [sx, sy] = PLACES.stockpile;
    const pos = [[0, 0], [10, 0], [5, -6], [-10, 0], [15, -6], [-5, -6], [10, -12], [0, -12], [20, 0]];
    for (let i = 0; i < Math.min(this.stock, pos.length); i++) {
      const [dx, dy] = pos[i];
      const x = sx - 14 + dx, y = sy - 6 + dy;
      ctx.fillStyle = C.tan; ctx.fillRect(x, y, 10, 6);
      ctx.fillStyle = C.sand; ctx.fillRect(x, y, 9, 1);
      ctx.fillStyle = C.umber; ctx.fillRect(x, y + 5, 10, 1); ctx.fillRect(x + 9, y, 1, 6);
    }
  }

  drawFan(ctx) {
    const spr = human(`fan|${Math.floor(this.t * 1.5) % 2}`, FANBEARER, { legs: 'stand', arm: 'raise', far: 'side' });
    blit(ctx, spr, this.fan.x, this.fan.y, -1);
    // the ostrich-feather fan swaying over Pharaoh
    const sw = Math.round(Math.sin(this.t * 1.5) * 3);
    const fx = this.fan.x - 5 + sw, fy = this.fan.y - 30;
    ctx.fillStyle = C.wine; for (let k = 0; k < 10; k++) ctx.fillRect(this.fan.x - 5 + Math.round(sw * k / 10), this.fan.y - 20 - k, 1, 1);
    ctx.fillStyle = C.white; ctx.fillRect(fx - 4, fy - 3, 9, 4); ctx.fillRect(fx - 3, fy - 5, 7, 2);
    ctx.fillStyle = C.cloud; ctx.fillRect(fx - 4, fy, 9, 1);
    ctx.fillStyle = C.azure; ctx.fillRect(fx - 1, fy - 3, 3, 2);
  }

  drawMound(ctx, m) {
    const x = Math.round(m.x), y = Math.round(m.y);
    const grow = Math.min(1, (this.t - m.t) / (m.dur || 0.6));
    const H = Math.max(1, Math.round(8 * grow)), W = Math.round(12 + 16 * grow);
    const prof = (r) => Math.max(2, Math.round(W * Math.sqrt(Math.max(0, 1 - (r / H) ** 2))));
    // shadow on the ground, then a dark outline one pixel proud of the dome
    ctx.fillStyle = 'rgba(62,39,49,0.3)'; ctx.fillRect(x - Math.round(W / 2) - 3, y, W + 2, 2);
    ctx.fillStyle = C.wine;
    for (let r = 0; r < H; r++) { const w = prof(r) + 2; ctx.fillRect(x - Math.round(w / 2), y - r - 1, w, 2); }
    for (let r = 0; r < H; r++) {
      const w = prof(r), x0 = x - Math.round((w - 2) / 2) - 1;
      ctx.fillStyle = C.tan; ctx.fillRect(x0 + 1, y - r, w - 2, 1);
      ctx.fillStyle = C.clay; ctx.fillRect(x0 + 1, y - r, Math.max(1, Math.round((w - 2) * 0.3)), 1);
      ctx.fillStyle = C.sand; ctx.fillRect(x0 + 1 + Math.round((w - 2) * 0.62), y - r, Math.max(1, Math.round((w - 2) * 0.3)), 1);
    }
    if (grow < 1) return;
    // the whip, sticking out
    ctx.fillStyle = C.wine; ctx.fillRect(x + 3, y - 8, 1, 4); ctx.fillStyle = C.plum; ctx.fillRect(x + 4, y - 9, 1, 1); ctx.fillRect(x + 5, y - 10, 1, 1); ctx.fillRect(x + 6, y - 10, 1, 1);
  }

  drawSpecial(ctx, s) {
    if (s.kind === 'batya') {
      const spr = human('batya', BATYA, { legs: 'stand', arm: 'reach', far: 'side' });
      blit(ctx, spr, s.x, s.y, -1);
      const [bx, by] = PLACES.basket;
      const k = clamp(s.t / 1.6, 0, 1), back = clamp((s.t - 3.2) / 1.2, 0, 1);
      const reach = Math.round((s.x - 8 - bx) * (k - back));
      ctx.fillStyle = BATYA.skin; ctx.fillRect(Math.round(s.x) - 6 - reach, Math.round(s.y) - 13, reach, 1);
      ctx.fillStyle = BATYA.skinD; ctx.fillRect(Math.round(s.x) - 6 - reach, Math.round(s.y) - 12, reach, 1);
      ctx.fillStyle = C.gold; ctx.fillRect(Math.round(s.x) - 6 - Math.round(reach * 0.5), Math.round(s.y) - 13, 1, 2);
      if (back > 0) this.basketHeld = true;
      return;
    }
    if (s.kind === 'serach') {
      const legs = s.t < 2 ? ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(s.t * 6) % 4] : 'stand';
      if (s.t < 2) s.x += 0.25;
      const spr = human(`serach|${legs}|${s.t > 2}`, SERACH, { legs, arm: s.t > 2 ? 'point' : 'down', far: 'side', prop: s.t > 2 ? null : 'cane' });
      blit(ctx, spr, s.x, s.y, 1);
      return;
    }
    if (s.kind === 'coffin') {
      const rise = clamp((s.t - 2.2) / 1.5, 0, 1);
      if (rise <= 0) return;
      const x = Math.round(s.x), y = Math.round(s.y + 4 - rise * 4 + Math.sin(s.t * 2) * 0.6);
      ctx.fillStyle = C.mist; ctx.fillRect(x - 9, y - 3, 18, 4);
      ctx.fillStyle = C.cloud; ctx.fillRect(x - 9, y - 3, 18, 1);
      ctx.fillStyle = C.gold; ctx.fillRect(x - 7, y - 2, 2, 2); ctx.fillRect(x + 5, y - 2, 2, 2);
      ctx.fillStyle = C.azure; ctx.fillRect(x - 11, y + 1, 22, 1);
      return;
    }
    if (s.kind === 'midwife') {
      const spr = human(`midwife${s.i}|${s.t > 1.5}`, MIDWIFE(s.i), { legs: 'stand', arm: s.i ? 'raise' : 'fwd', far: 'side', prop: s.i ? null : 'baby' });
      blit(ctx, spr, s.x, s.y, 1, clamp(Math.min(s.t, 6 - s.t), 0, 1));
    }
  }

  drawEffects(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / (p.max || 1) * 1.4, 0, 1);
      ctx.fillStyle = p.c;
      if (p.z) { ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 1); ctx.fillRect(Math.round(p.x) + 2, Math.round(p.y) + 1, 1, 1); ctx.fillRect(Math.round(p.x), Math.round(p.y) + 2, 3, 1); ctx.fillRect(Math.round(p.x) + 1, Math.round(p.y) + 1, 1, 1); }
      else if (p.matzah) { ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y), 7, 5); ctx.fillStyle = C.umber; ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) + 1, 1, 1); ctx.fillRect(Math.round(p.x) + 1, Math.round(p.y) + 3, 1, 1); ctx.fillRect(Math.round(p.x) + 2, Math.round(p.y) + 1, 1, 1); }
      else ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      ctx.globalAlpha = 1 - r.t / r.life;
      ctx.fillStyle = r.c;
      const n = Math.max(12, Math.round(r.r * 3));
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; ctx.fillRect(Math.round(r.x + Math.cos(a) * r.r), Math.round(r.y + Math.sin(a) * r.r * 0.7), 1, 1); }
    }
    ctx.globalAlpha = 1;
    if (this.locusts) {
      const k = this.locusts.t / this.locusts.dur;
      ctx.fillStyle = C.plum;
      for (const l of this.locusts.swarm) { const x = Math.round(l.x + k * 60), y = Math.round(l.y); ctx.fillRect(x, y, 2, 1); if (Math.floor(this.t * 20 + l.ph * 3) % 2) ctx.fillRect(x, y - 1, 1, 1); }
    }
    if (this.hail) {
      // a full storm of big stones, with the fire inside the hail (Shemot 9:24) as a tail,
      // so it still reads on a phone-sized window
      const k = this.hail.t;
      for (let i = 0; i < 220; i++) {
        const seed = i * 97.13;
        const x = Math.round((seed * 7 + k * 60) % W);
        const y = Math.round(((seed * 13 + k * (200 + (i % 5) * 12)) % (H + 40)) - 40);
        ctx.fillStyle = i % 3 ? C.amber : C.gold; ctx.fillRect(x - 1, y - 5, 1, 4); ctx.fillRect(x, y - 8, 1, 4); ctx.fillRect(x + 1, y - 4, 1, 2);
        ctx.fillStyle = C.white; ctx.fillRect(x - 1, y - 1, 3, 3);
      }
    }
  }

  drawStrike(ctx) {
    const b = this.beam;
    if (b) {
      const k = b.t / b.dur;
      const n = Math.max(1, Math.round(Math.hypot(b.x1 - b.x0, b.y1 - b.y0)));
      const wdt = Math.max(1, Math.round(4 * (1 - k)));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(b.x0 + (b.x1 - b.x0) * i / n), y = Math.round(b.y0 + (b.y1 - b.y0) * i / n);
        ctx.fillStyle = C.gold; ctx.fillRect(x - wdt - 1, y - wdt - 1, wdt * 2 + 3, wdt * 2 + 3);
        ctx.fillStyle = C.lemon; ctx.fillRect(x - wdt, y - wdt, wdt * 2 + 1, wdt * 2 + 1);
        ctx.fillStyle = C.white; ctx.fillRect(x - Math.floor(wdt / 2), y - Math.floor(wdt / 2), wdt, wdt);
      }
    }
  }

  drawOverlays(ctx) {
    if (this.dim) {
      const d = this.dim;
      const a = Math.min(1, d.t / 0.12) * Math.min(1, (d.dur - d.t) / 0.5);
      if (!this.dimMask) {
        const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
        const mc = cv.getContext('2d');
        mc.fillStyle = C.ink;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
          const r = Math.hypot((x - W) / 1.5, y - H);
          const level = r < 30 ? 0 : r < 34 ? 4 : r < 38 ? 8 : r < 42 ? 12 : 16;
          if (BAYER[y & 3][x & 3] < level) mc.fillRect(x, y, 1, 1);
        }
        this.dimMask = cv;
      }
      ctx.globalAlpha = 0.78 * Math.max(0, a);
      ctx.drawImage(this.dimMask, Math.round(d.x - W), Math.round(d.y - H));
      ctx.globalAlpha = 1;
    }
    if (this.tint) { const tn = this.tint; ctx.globalAlpha = tn.a * (1 - tn.t / tn.dur); ctx.fillStyle = tn.c; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (this.darkness) {
      const d = this.darkness;
      const a = Math.min(1, d.t / 0.8) * Math.min(1, (d.dur - d.t) / 1);
      ctx.globalAlpha = 0.86 * clamp(a, 0, 1);
      ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = clamp(a, 0, 1);
      for (const w of this.workers.values()) {
        const x = Math.round(w.x), y = Math.round(w.y - 8);
        ctx.fillStyle = C.gold;
        for (let r = 6; r > 0; r -= 2) { ctx.globalAlpha = clamp(a, 0, 1) * (0.18 + (6 - r) * 0.08); ctx.fillRect(x - r * 2, y - r, r * 4, r * 2); }
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = C.lemon; ctx.fillRect(x + 3, y - 2, 1, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (this.flash > 0) { ctx.globalAlpha = this.flash; ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  // for the UI
  summary() {
    const workers = [...this.workers.values()];
    return {
      working: workers.filter((w) => w.working).length,
      total: workers.length,
      stones: this.pyramid.total,
      stonesToday: this.stats.stonesToday,
      whips: this.whips,
      tax: this.stats.tax,
      completed: this.pyramid.completed,
    };
  }
}

export function fmtTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
