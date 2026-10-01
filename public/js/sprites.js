// Pixel characters, painted in code and cached. Every sprite faces right when painted;
// the cache also stores a mirrored copy. Coordinates: x right, y up is negative, row -1 = feet.
import { C } from './pal.js';

export const SW = 44, SH = 56, AX = 22, AY = 50; // sprite canvas size and the anchor (feet center)
const cache = new Map();

function painter(ctx, flip) {
  const col = (x) => (flip ? AX - x : AX + x);
  return {
    p(x, y, c) { if (!c) return; ctx.fillStyle = c; ctx.fillRect(col(x), AY + y, 1, 1); },
    r(x, y, w, h, c) {
      if (!c || w <= 0 || h <= 0) return;
      ctx.fillStyle = c;
      const x0 = flip ? AX - x - w + 1 : AX + x;
      ctx.fillRect(x0, AY + y, w, h);
    },
  };
}

// Dark outline around the silhouette so characters read on bright sand.
function outline(cv, color) {
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, 0, SW, SH);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && d[(y * SW + x) * 4 + 3] > 0;
  const add = [];
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push(x, y);
    }
  }
  ctx.fillStyle = color;
  for (let i = 0; i < add.length; i += 2) ctx.fillRect(add[i], add[i + 1], 1, 1);
}

export function sprite(key, paint, opts = {}) {
  let entry = cache.get(key);
  if (entry) return entry;
  entry = [];
  for (const flip of [false, true]) {
    const cv = document.createElement('canvas');
    cv.width = SW; cv.height = SH;
    const ctx = cv.getContext('2d');
    paint(painter(ctx, flip));
    if (opts.outline !== false) outline(cv, opts.outlineColor || C.ink);
    entry.push(cv);
  }
  cache.set(key, entry);
  return entry;
}

// Draw a cached sprite with its feet at world (x, y). dir: 1 right, -1 left.
export function blit(ctx, spr, x, y, dir, alpha) {
  const cv = spr[dir < 0 ? 1 : 0];
  if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(cv, Math.round(x) - AX, Math.round(y) - AY);
  if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
}

// Silhouette tint (flash white on a hit, gold for the Name).
const tintCache = new Map();
// the whole figure in one flat colour with a coloured rim: the frame of impact
const flashCache = new Map();
export function blitFlash(ctx, spr, x, y, dir, fill, edge) {
  const cv = spr[dir < 0 ? 1 : 0];
  let m = flashCache.get(cv);
  if (!m) { m = new Map(); flashCache.set(cv, m); }
  const key = fill + edge;
  let t = m.get(key);
  if (!t) {
    t = document.createElement('canvas'); t.width = SW; t.height = SH;
    const c = t.getContext('2d');
    const src = cv.getContext('2d').getImageData(0, 0, SW, SH).data;
    const solid = (px, py) => px >= 0 && py >= 0 && px < SW && py < SH && src[(py * SW + px) * 4 + 3] > 0;
    for (let py = 0; py < SH; py++) for (let px = 0; px < SW; px++) {
      if (!solid(px, py)) continue;
      const rim = !solid(px - 1, py) || !solid(px + 1, py) || !solid(px, py - 1) || !solid(px, py + 1);
      c.fillStyle = rim ? edge : fill; c.fillRect(px, py, 1, 1);
    }
    m.set(key, t);
  }
  ctx.drawImage(t, Math.round(x) - AX, Math.round(y) - AY);
}

export function blitTint(ctx, spr, x, y, dir, color, alpha = 1) {
  const cv = spr[dir < 0 ? 1 : 0];
  const key = cv;
  let m = tintCache.get(key);
  if (!m) { m = new Map(); tintCache.set(key, m); }
  let t = m.get(color);
  if (!t) {
    t = document.createElement('canvas'); t.width = SW; t.height = SH;
    const c = t.getContext('2d');
    c.drawImage(cv, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, SW, SH);
    m.set(color, t);
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(t, Math.round(x) - AX, Math.round(y) - AY);
  ctx.globalAlpha = 1;
}

// Draw rotated 90° (lying down). side: -1 head to the left, 1 head to the right.
export function blitLying(ctx, spr, x, y, side) {
  const cv = spr[0];
  ctx.save();
  // rotate about the feet so the body lies on the ground, head toward `side`
  ctx.translate(Math.round(x), Math.round(y) - 3);
  ctx.rotate(side < 0 ? -Math.PI / 2 : Math.PI / 2);
  ctx.drawImage(cv, -AX, -AY);
  ctx.restore();
}

// ---------------------------------------------------------------- people
// 3/4 view: the face looks toward the camera, turned the way the character walks.
// s (spec): skin, skinD, top, topD, band, head, headC, headD, beard, feet, robe, collar, leopard, tall, hair
// p (pose): legs, arm, far, lean, eye, mouth, prop, look
export function paintHuman(g, s, p) {
  const legs = p.legs || 'stand';
  let dy = 0;
  if (legs === 'walk1' || legs === 'walk3') dy = 1;
  if (legs === 'crouch' || legs === 'kneel') dy = 2;
  if (legs === 'sit') dy = 4;
  if (s.tall) dy -= 1;
  const lx = p.lean || 0;
  const robe = s.robe || 'tunic';
  const long = robe === 'robe' || robe === 'dress';
  const near = s.skin, far = s.skinD, feet = s.feet || C.plum;
  const legH = s.tall ? 4 : 3; // leg rows above the feet

  // ---- legs & feet
  if (legs === 'stand' || legs === 'walk0' || legs === 'walk2' || legs === 'tiptoe') {
    if (!long) { g.r(-1, -1 - legH, 1, legH, far); g.r(1, -1 - legH, 1, legH, near); }
    else { g.p(-1, -2, far); g.p(1, -2, near); }
    if (legs === 'tiptoe') { g.p(-1, -1, feet); g.p(1, -1, feet); }
    else { g.r(-2, -1, 2, 1, feet); g.r(1, -1, 2, 1, feet); }
  } else if (legs === 'walk1' || legs === 'walk3') {
    const a = legs === 'walk1' ? near : far, b = legs === 'walk1' ? far : near;
    if (!long) {
      g.r(1, -legH, 1, legH - 1, a); g.p(2, -2, a);
      g.r(-1, -legH, 1, legH - 1, b); g.p(-2, -2, b);
    } else { g.p(2, -2, a); g.p(-2, -2, b); }
    g.r(2, -1, 2, 1, feet); g.r(-3, -1, 2, 1, feet);
  } else if (legs === 'brace') {
    if (!long) { g.p(1, -3, near); g.p(2, -2, near); g.r(-1, -1 - legH, 1, legH, far); }
    g.r(3, -1, 2, 1, feet); g.r(-2, -1, 2, 1, feet);
  } else if (legs === 'crouch') {
    if (!long) { g.p(2, -2, near); g.p(-2, -2, far); }
    g.r(2, -1, 2, 1, feet); g.r(-3, -1, 2, 1, feet);
  } else if (legs === 'kneel') {
    g.r(-3, -1, 3, 1, far); g.p(-4, -1, feet);
    if (!long) g.p(2, -2, near);
    g.r(2, -1, 2, 1, feet);
  } else if (legs === 'sit') {
    g.r(0, -2, 4, 1, near); g.r(0, -1, 4, 1, far);
    g.p(4, -2, feet); g.p(4, -1, feet);
  }

  const X = (x) => x + lx;
  const Y = (y) => y + dy;
  const P = (x, y, c) => g.p(X(x), Y(y), c);
  const R = (x, y, w, h, c) => g.r(X(x), Y(y), w, h, c);
  const skin = s.skin, shade = s.skinD;

  // ---- far arm (drawn first, sits behind the body)
  const farArm = p.far || (p.arm === 'up' ? 'up' : 'side');
  switch (farArm) {
    case 'side': R(-3, -12, 1, 4, shade); break;
    case 'swing': P(-3, -12, shade); P(-3, -11, shade); P(-4, -10, shade); P(-4, -9, shade); break;
    case 'up': R(-4, -17, 1, 5, shade); break;
    case 'raise': P(-3, -12, shade); P(-4, -13, shade); P(-4, -14, shade); P(-5, -15, shade); P(-5, -16, shade); break;
    case 'pull': P(-3, -12, shade); P(-3, -11, shade); P(-2, -10, shade); break;
    case 'hide': default: break;
  }

  // ---- body
  const top = s.top, topD = s.topD;
  if (robe === 'tunic') {
    R(-2, -12, 5, 6, top); R(-2, -12, 1, 6, topD);
    R(-3, -6, 7, 2, top); R(-3, -6, 2, 2, topD); R(0, -5, 1, 1, topD);
    if (s.band) R(-2, -9, 5, 1, s.band);
  } else if (long) {
    const h = dy > 0 ? Math.max(2, 5 - dy) : 5;
    R(-2, -12, 5, 6, top); R(-2, -12, 1, 6, topD);
    R(-3, -6, 7, h, top); R(-3, -6, 2, h, topD);
    if (s.mantle) R(-2, -12, 2, 6 + h - 1, s.mantle);
    if (s.band) R(-2, -9, 5, 1, s.band);
    if (s.trim) R(-3, -6 + h - 1, 7, 1, s.trim);
  } else if (robe === 'kilt') {
    R(-2, -12, 5, 5, skin); R(-2, -12, 1, 5, shade);
    R(-2, -7, 5, 3, top); R(-2, -7, 1, 3, topD); R(-3, -5, 1, 1, topD); R(3, -5, 1, 1, top);
    R(-2, -7, 5, 1, s.belt || C.gold); P(1, -6, C.sand); P(1, -5, C.sand);
  }
  if (s.collar) { R(-2, -12, 5, 1, s.collar[0]); R(-2, -11, 5, 1, s.collar[1]); P(-3, -12, s.collar[0]); P(3, -12, s.collar[0]); }
  if (s.leopard) {
    const L = [[-2, -12], [-1, -11], [0, -10], [1, -9], [2, -8], [-1, -12], [0, -11], [1, -10], [2, -9], [3, -8]];
    L.forEach(([x, y], i) => P(x, y, i % 3 === 1 ? C.wine : C.gold));
  }
  if (s.longBeard) { R(-1, -12, 3, 3, s.beard); P(0, -9, s.beard); }

  // ---- head (rows -19..-13), rounded, face turned to the right
  const H = (x, y, c) => g.p(X(x), Y(y), c);
  const HR = (x, y, w, h, c) => g.r(X(x), Y(y), w, h, c);
  HR(-2, -17, 5, 4, skin); // face block
  HR(-1, -13, 3, 1, skin); // chin
  H(-3, -15, shade); H(-3, -14, shade);
  const head = s.head || 'cloth';
  if (head === 'cloth') {
    HR(-2, -19, 5, 1, s.headC); HR(-3, -18, 6, 1, s.headC);
    HR(-3, -17, 6, 1, s.band || s.headD);
    HR(-4, -17, 1, 5, s.headC); HR(-3, -16, 1, 4, s.headD);
    H(3, -16, s.headC);
  } else if (head === 'hair') {
    const hc = s.hair || C.plum;
    HR(-2, -19, 5, 1, hc); HR(-3, -18, 6, 2, hc); HR(-3, -16, 1, 3, hc);
    if (s.band) HR(-2, -17, 5, 1, s.band);
  } else if (head === 'wig') {
    HR(-2, -19, 5, 1, C.ink); HR(-3, -18, 6, 1, C.ink); HR(-3, -17, 6, 1, C.ink);
    HR(-4, -17, 2, 6, C.ink); HR(3, -16, 1, 4, C.ink);
    H(-1, -19, C.slate); H(0, -19, C.slate); H(-3, -15, C.slate);
  } else if (head === 'nemes') {
    HR(-2, -20, 5, 1, C.gold); HR(-3, -19, 7, 1, C.navy); HR(-3, -18, 7, 1, C.gold); HR(-3, -17, 7, 1, C.navy);
    for (let y = -16; y <= -10; y++) { H(-4, y, y % 2 ? C.gold : C.navy); H(-3, y, y % 2 ? C.navy : C.gold); H(3, y, y % 2 ? C.navy : C.gold); }
    H(1, -21, C.gold); H(1, -20, C.lemon); // cobra on the brow
  } else if (head === 'bald') {
    HR(-2, -18, 5, 1, skin); H(0, -18, s.skinL || C.tan); H(-1, -18, s.skinL || C.tan);
    HR(-3, -17, 1, 3, shade);
  } else if (head === 'veil') {
    HR(-2, -19, 5, 1, s.headC); HR(-3, -18, 6, 1, s.headC); HR(-4, -17, 2, 8, s.headC); HR(-3, -17, 1, 6, s.headD);
    H(3, -17, s.headC); H(3, -16, s.headC);
  } else if (head === 'crown') {
    HR(-2, -19, 5, 1, C.ink); HR(-3, -18, 6, 1, C.gold); HR(-4, -17, 2, 7, C.ink); HR(3, -17, 1, 4, C.ink);
    H(-3, -17, C.ink);
  }
  // eyes (two, since the face is turned toward us)
  const eyeY = -16;
  const e1 = p.look === 'back' ? -2 : 0, e2 = p.look === 'back' ? 0 : 2;
  if (p.eye === 'shut') { H(e1, eyeY, shade); H(e2, eyeY, shade); }
  else if (p.eye === 'wide') { H(e1, eyeY, C.ink); H(e2, eyeY, C.ink); H(e1, eyeY - 1, C.white); H(e2, eyeY - 1, C.white); }
  else { H(e1, eyeY, C.ink); H(e2, eyeY, C.ink); }
  if (s.kohl || head === 'wig' || head === 'nemes' || head === 'crown') H(e2 + 1, eyeY, C.ink);
  // beard / mouth
  if (s.beard) { HR(-2, -14, 5, 1, s.beard); HR(-1, -13, 3, 1, s.beard); H(-2, -15, s.beard); if (s.longBeard) H(2, -15, s.beard); }
  if (head === 'nemes') { H(1, -12, C.navy); H(1, -11, C.gold); }
  if (p.mouth === 'open') H(1, -14, C.plum);
  else if (!s.beard) H(1, -14, s.skinD);

  // ---- near arm + props
  const A = (x, y) => g.p(X(x), Y(y), skin);
  const arm = p.arm || 'down';
  switch (arm) {
    case 'down': A(3, -12); A(3, -11); A(3, -10); A(3, -9); break;
    case 'swingF': A(3, -12); A(3, -11); A(4, -10); A(4, -9); break;
    case 'swingB': A(3, -12); A(3, -11); A(2, -10); A(2, -9); break;
    case 'fwd': A(3, -12); A(3, -11); A(4, -10); A(5, -10); break;
    case 'up': g.r(X(3), Y(-17), 1, 5, skin); break;
    case 'raise': A(3, -12); A(4, -13); A(4, -14); A(5, -15); A(5, -16); break;
    case 'point': A(3, -12); A(4, -12); A(5, -12); A(6, -12); A(7, -13); break;
    case 'chin': A(3, -12); A(3, -11); A(2, -12); A(2, -13); break;
    case 'shade': A(3, -12); A(4, -13); A(4, -14); A(3, -15); A(2, -15); break;
    case 'swingUp': A(3, -12); A(3, -13); A(3, -14); A(2, -15); A(2, -16); break;
    case 'swingDown': A(3, -12); A(4, -11); A(5, -10); A(6, -10); break;
    case 'pull': A(3, -12); A(4, -11); A(4, -10); A(5, -10); break;
    case 'cross': g.r(X(-1), Y(-10), 4, 1, skin); A(3, -12); A(3, -11); break;
    case 'whipBack': A(3, -12); A(3, -13); A(2, -14); A(1, -15); A(0, -16); break;
    case 'whipFwd': A(3, -12); A(4, -12); A(5, -13); A(6, -13); break;
    case 'whipIdle': A(3, -12); A(3, -11); A(3, -10); A(4, -9); break;
    case 'reach': A(3, -12); A(4, -12); break; // the long arm itself is drawn in world space
    case 'jar': A(3, -12); A(3, -13); A(2, -14); break;
    case 'staff': A(3, -12); A(4, -11); A(5, -11); break;
    case 'staffUp': A(3, -12); A(4, -13); A(4, -14); A(5, -15); break;
    case 'scratch': A(3, -12); A(3, -13); A(3, -14); A(3, -15); A(2, -18); A(3, -17); break;
    case 'none': break;
    default: A(3, -12); A(3, -11); A(3, -10); A(3, -9);
  }
  const prop = p.prop;
  if (!prop) return;
  switch (prop) {
    case 'block':
      R(-4, -24, 9, 6, C.tan); R(-4, -24, 9, 1, C.sand); R(-4, -19, 9, 1, C.umber); R(4, -24, 1, 6, C.umber);
      P(-2, -22, C.sand); P(1, -21, C.sand); break;
    case 'mallet-up': P(1, -17, C.wine); P(0, -18, C.wine); R(-2, -21, 4, 3, C.umber); P(-2, -21, C.tan); P(-1, -21, C.tan); break;
    case 'mallet-down': P(7, -10, C.wine); P(8, -10, C.wine); R(9, -12, 2, 4, C.umber); P(9, -12, C.tan); break;
    case 'tablet': R(4, -22, 5, 6, C.umber); R(4, -22, 5, 1, C.tan); P(5, -21, C.sand); P(6, -21, C.sand); P(7, -20, C.sand); P(6, -19, C.sand); P(6, -17, C.sand); break;
    case 'scroll': R(-2, -11, 6, 3, C.sand); P(-2, -11, C.umber); P(-2, -9, C.umber); P(3, -11, C.umber); P(3, -9, C.umber); R(-1, -10, 3, 1, C.tan); break;
    case 'papyrus': R(5, -13, 3, 4, C.sand); R(5, -13, 3, 1, C.tan); P(7, -10, C.umber); break;
    case 'straw': R(-6, -17, 3, 8, C.gold); P(-6, -17, C.lemon); P(-5, -16, C.lemon); P(-4, -13, C.lemon); P(-5, -10, C.amber); break;
    case 'straw-hand': R(4, -10, 3, 2, C.gold); P(5, -11, C.lemon); break;
    case 'jar': R(1, -17, 2, 3, C.umber); P(1, -17, C.tan); P(2, -14, C.wine); break;
    case 'bowl': R(5, -13, 4, 2, C.umber); R(5, -13, 4, 1, s.bowl || C.azure); break;
    case 'rod': R(6, -16, 1, 9, C.gold); break;
    case 'staff': R(5, -27, 1, 26, C.wine); P(6, -27, C.wine); P(7, -26, C.wine); P(7, -25, C.wine); break;
    case 'staff-up': R(5, -32, 1, 22, C.wine); P(6, -32, C.wine); P(7, -31, C.wine); P(7, -30, C.wine); break;
    case 'magestaff': R(5, -24, 1, 23, C.wine); P(5, -25, C.gold); P(5, -24, C.lemon); break;
    case 'crook': P(3, -10, C.gold); P(4, -11, C.navy); P(4, -12, C.gold); P(4, -13, C.navy); P(4, -14, C.gold); P(5, -15, C.gold); P(6, -15, C.gold); P(6, -14, C.gold); break;
    case 'brick': R(4, -12, 4, 2, C.rust); R(4, -12, 4, 1, C.orange); break;
    case 'baby': R(3, -12, 4, 3, C.cloud); P(6, -13, C.peach); P(5, -13, C.peach); break;
    case 'cane': R(5, -10, 1, 9, C.wine); P(4, -10, C.wine); break;
    default: break;
  }
}

// ---------------------------------------------------------------- specs
const TUNICS = [[C.cloud, C.mist], [C.sand, C.tan], [C.mist, C.steel], [C.clay, C.umber]];

// the darker fold colour for each crew's tunic
const SHADE = { [C.azure]: C.navy, [C.red]: C.blood, [C.leaf]: C.green, [C.gold]: C.orange, [C.mauve]: C.purple, [C.cyan]: C.azure };

export function workerSpec(crewBand, variant, kind) {
  // the whole tunic is the crew's colour, so you can tell sessions apart from across the site
  const top = crewBand, topD = SHADE[crewBand] || TUNICS[variant % TUNICS.length][1];
  if (kind === 'levite') {
    return { skin: C.peach, skinD: C.clay, top: C.white, topD: C.cloud, band: crewBand, robe: 'robe', head: 'cloth', headC: C.white, headD: C.cloud, beard: C.plum, trim: crewBand };
  }
  return {
    skin: C.peach, skinD: C.clay, top, topD, band: crewBand, robe: 'tunic',
    head: kind === 'youth' ? 'hair' : 'cloth', headC: variant % 2 ? C.sand : C.cloud, headD: variant % 2 ? C.tan : C.mist,
    hair: variant % 2 ? C.plum : C.wine, beard: kind === 'youth' ? null : (variant % 3 === 2 ? C.plum : C.wine),
  };
}

export const TASKMASTER = { skin: C.umber, skinD: C.wine, top: C.white, topD: C.cloud, robe: 'kilt', head: 'wig', collar: [C.gold, C.azure], belt: C.blood, tall: true, feet: C.wine };
export const PHARAOH = { skin: C.umber, skinD: C.wine, top: C.white, topD: C.cloud, robe: 'kilt', head: 'nemes', collar: [C.gold, C.azure], belt: C.gold, feet: C.gold };
export const MAGICIAN = (i) => ({ skin: C.umber, skinD: C.wine, skinL: C.tan, top: i ? C.cloud : C.white, topD: i ? C.mist : C.cloud, robe: 'robe', head: 'bald', leopard: true, kohl: true, feet: C.wine });
export const MOSES = { skin: C.peach, skinD: C.clay, top: C.umber, topD: C.wine, mantle: C.rust, robe: 'robe', head: 'cloth', headC: C.sand, headD: C.tan, band: C.wine, beard: C.cloud, longBeard: true, feet: C.plum };
export const BATYA = { skin: C.umber, skinD: C.wine, top: C.white, topD: C.cloud, robe: 'dress', head: 'crown', collar: [C.gold, C.cyan], feet: C.gold };
export const SERACH = { skin: C.peach, skinD: C.clay, top: C.purple, topD: C.plum, robe: 'dress', head: 'veil', headC: C.cloud, headD: C.mist, feet: C.plum };
export const MIDWIFE = (i) => ({ skin: C.peach, skinD: C.clay, top: i ? C.navy : C.rust, topD: i ? C.night : C.wine, robe: 'dress', head: 'veil', headC: i ? C.sand : C.cloud, headD: i ? C.tan : C.mist, feet: C.plum });
export const FANBEARER = { skin: C.umber, skinD: C.wine, top: C.white, topD: C.cloud, robe: 'kilt', head: 'wig', collar: [C.azure, C.gold], feet: C.wine };
export const HEBREW_ELDER = { skin: C.peach, skinD: C.clay, top: C.navy, topD: C.night, robe: 'robe', head: 'cloth', headC: C.cloud, headD: C.mist, beard: C.plum, feet: C.plum };

export function human(key, spec, pose) {
  return sprite(key, (g) => paintHuman(g, spec, pose));
}

// ---------------------------------------------------------------- small things
// W white, K pupil, G green, L light back, Y belly, D dark legs; facing right, feet on y = 0
const FROG = [
  ['......WW.WW', '.....GWKGWK', '..GGGGGGGGG', '.GLLLGGGGGG', 'GLLGGGGGGGG', 'GGGGGYYYGG.', 'DGGDGYYGD..', 'DD.DD..DDD.'],
  ['......WW.WW', '.....GWKGWK', '...GGGGGGGG', '..GLLGGGGG.', '.GLGGGGGY..', 'DGGGGYYY...', 'DDG........', '.DD........'],
];
const FROG_C = { W: C.white, K: C.ink, G: C.green, L: C.leaf, Y: C.lemon, D: C.pine };
export function frogSprite(frame) {
  return sprite(`frog${frame}`, (g) => {
    const rows = FROG[frame ? 1 : 0];
    const lift = frame ? 2 : 0;
    rows.forEach((row, i) => {
      for (let x = 0; x < row.length; x++) { const c = FROG_C[row[x]]; if (c) g.p(x - 5, i - rows.length - lift, c); }
    });
  });
}

export function snakeSprite(frame, len = 12, gold = false) {
  const body = gold ? C.gold : C.green, hi = gold ? C.lemon : C.leaf, low = gold ? C.amber : C.pine;
  return sprite('snake' + frame + '-' + len + '-' + gold, (g) => {
    const thick = len > 16 ? 2 : 1;
    for (let i = 0; i < len; i++) {
      const y = -2 - Math.round(Math.sin((i + frame * 2) * 0.7) * (len > 16 ? 2 : 1.2));
      const x = i - len + 3;
      g.p(x, y, i % 3 ? body : hi);
      if (thick > 1) g.p(x, y + 1, i % 4 === 1 ? C.lemon : body);
      g.p(x, y + thick, low);
    }
    const hy = len > 16 ? -5 : -4;
    g.r(3, hy, 4, 3, body); g.r(3, hy, 4, 1, hi); g.p(5, hy + 1, C.ink); g.p(7, hy + 2, C.red); g.p(8, hy + 2, C.red);
  });
}
