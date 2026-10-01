// The painted world: sky, Nile, quarry, Pharaoh's pavilion, sand. Static layers are cached per
// time of day; water, reeds, palms, clouds, torches and birds animate every frame.
import { C, BAYER, hexToRgb } from './pal.js';

export const W = 640, H = 360;
export const HORIZON = 150;
export const NILE = { top: 150, bottom: 167 };
export const GROUND = 169;

// Where things are. Everything else in the app reads these.
export const PLACES = {
  quarryFace: (y) => 124 + Math.max(0, y - 150) * 0.06, // x of the cliff face at height y
  quarrySlots: [[138, 258], [134, 246], [141, 266], [132, 236], [146, 252], [136, 226], [150, 262]],
  laneY: [276, 289, 302, 283],
  laneX: [[84, 150], [56, 142], [28, 134], [108, 150]], // each crew's sledge parks at its own spot
  overseerSpots: [[116, 312], [222, 322], [262, 342], [300, 326], [340, 344], [380, 326], [420, 338]], // open sand near the work
  stockpile: [190, 302],
  restSpots: [[150, 338], [166, 342], [182, 338], [144, 348], [198, 346], [160, 352], [176, 352], [192, 354]],
  strawSpots: [[42, 322], [60, 318], [78, 324], [52, 332], [30, 330], [70, 312]],
  surveySpots: [[446, 318], [430, 336], [462, 342], [414, 326]],
  goshen: [-14, 328],
  taskmasterPosts: [[240, 318], [298, 328], [354, 320], [392, 334]],
  pharaohSeat: [558, 248],
  fanBearer: [578, 248],
  magi: [[498, 302], [532, 306]],
  brazier: [470, 298],
  basket: [262, 165],
  midian: [-20, 300],
};

const SKY = {
  day: {
    stops: [C.navy, C.azure, C.azure, C.cloud], sun: [520, 46], sunC: [C.white, C.lemon], haze: C.cloud,
    far: [C.clay, C.tan], bank: [C.pine, C.deep], water: [C.azure, C.navy, C.cyan, C.white],
    cloud: [C.white, C.cloud, C.white], ground: [C.sand, C.tan, C.clay], rock: [C.sand, C.clay, C.umber, C.wine], grade: null,
  },
  golden: {
    stops: [C.purple, C.mauve, C.pink, C.amber, C.gold, C.lemon], sun: [528, 106], sunC: [C.lemon, C.gold], haze: C.gold,
    far: [C.rust, C.orange], bank: [C.wine, C.plum], water: [C.amber, C.mauve, C.gold, C.lemon],
    cloud: [C.pink, C.gold, C.mauve], ground: [C.sand, C.tan, C.clay], rock: [C.sand, C.clay, C.umber, C.wine], grade: { op: 'soft-light', c: C.amber, a: 0.18 },
  },
  dusk: {
    stops: [C.ink, C.night, C.purple, C.mauve, C.pink], sun: [548, 142], sunC: [C.pink, C.red], haze: C.mauve,
    far: [C.purple, C.mauve], bank: [C.plum, C.ink], water: [C.purple, C.night, C.pink, C.pink],
    cloud: [C.mauve, C.pink, C.purple], ground: [C.tan, C.clay, C.umber], rock: [C.tan, C.clay, C.umber, C.wine], grade: { op: 'multiply', c: C.purple, a: 0.3 },
  },
  night: {
    stops: [C.ink, C.ink, C.night, C.night, C.slate], sun: [110, 42], sunC: [C.cloud, C.white], moon: true, haze: C.slate,
    far: [C.night, C.slate], bank: [C.ink, C.ink], water: [C.night, C.ink, C.steel, C.cloud],
    cloud: [C.slate, C.steel, C.night], ground: [C.sand, C.tan, C.clay], rock: [C.sand, C.clay, C.umber, C.wine], grade: { op: 'multiply', c: C.night, a: 0.64 },
  },
  dawn: {
    stops: [C.night, C.purple, C.pink, C.gold, C.lemon], sun: [470, 140], sunC: [C.lemon, C.gold], haze: C.pink,
    far: [C.mauve, C.pink], bank: [C.plum, C.purple], water: [C.pink, C.purple, C.gold, C.lemon],
    cloud: [C.pink, C.lemon, C.mauve], ground: [C.sand, C.tan, C.clay], rock: [C.sand, C.clay, C.umber, C.wine], grade: { op: 'soft-light', c: C.pink, a: 0.22 },
  },
};

export function skyModeFor(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 6.8) return 'dawn';
  if (h >= 6.8 && h < 16.8) return 'day';
  if (h >= 16.8 && h < 18.8) return 'golden';
  if (h >= 18.8 && h < 20) return 'dusk';
  return 'night';
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- pixel helpers
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

// dithered gradient through the given colors over rows [y0, y1)
function ditherGradient(img, x0, x1, y0, y1, stops, width) {
  const cols = stops.map(hexToRgb);
  const d = img.data;
  for (let y = y0; y < y1; y++) {
    const f = (y - y0) / Math.max(1, y1 - y0 - 1) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(f));
    const local = f - i;
    for (let x = x0; x < x1; x++) {
      const th = (BAYER[y & 3][x & 3] + 0.5) / 16;
      const c = local > th ? cols[i + 1] : cols[i];
      const o = (y * width + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
}

// solid bands with short dithered seams (cleaner than a full-height gradient)
function bands(ctx, x0, x1, y0, y1, list) {
  // list: [[untilY, color], ...]
  let y = y0;
  for (let i = 0; i < list.length; i++) {
    const [until, c] = list[i];
    rect(ctx, x0, y, x1 - x0, until - y, c);
    y = until;
  }
  y = y0;
  for (let i = 0; i < list.length - 1; i++) {
    const [until, a] = list[i];
    const b = list[i + 1][1];
    for (let k = -3; k <= 3; k++) {
      const yy = until + k;
      const level = Math.round(((k + 3.5) / 7) * 16);
      for (let x = x0; x < x1; x++) px(ctx, x, yy, BAYER[yy & 3][x & 3] < level ? b : a);
    }
  }
}

function disc(ctx, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    rect(ctx, cx - w, cy + y, w * 2 + 1, 1, c);
  }
}

function ellipse(ctx, cx, cy, rx, ry, c) {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    rect(ctx, Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1, c);
  }
}

function triangle(ctx, cx, baseY, halfW, h, cLit, cShade, rim) {
  for (let y = 0; y < h; y++) {
    const w = Math.round(halfW * (y + 1) / h);
    rect(ctx, cx - w, baseY - h + y, w, 1, cShade);
    rect(ctx, cx, baseY - h + y, w + 1, 1, cLit);
    if (rim) px(ctx, cx + w, baseY - h + y, rim);
  }
}

// ---------- the painter
export class Scene {
  constructor() {
    this.mode = null;
    this.layers = {};
    this.birds = [];
    this.boat = { x: 160, speed: 4 };
    this.completed = []; // finished pyramids shown on the horizon
    const r = rng(7);
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const parts = [];
      const n = 3 + Math.floor(r() * 3);
      const w = 18 + r() * 26;
      for (let k = 0; k < n; k++) parts.push([Math.round((k / (n - 1) - 0.5) * w), Math.round(-r() * 4 - (k > 0 && k < n - 1 ? 3 : 0)), Math.round(6 + r() * 7), Math.round(3 + r() * 3)]);
      this.clouds.push({ x: r() * (W + 100), y: 22 + r() * 70, s: 1.2 + r() * 2.2, parts, cache: null });
    }
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.sky = SKY[mode];
    for (const c of this.clouds) c.cache = null;
    this.buildSky();
    this.buildGround();
  }

  canvas(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  buildSky() {
    const cv = this.canvas(W, GROUND + 4);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, GROUND + 4);
    ditherGradient(img, 0, W, 0, HORIZON + 2, this.sky.stops, W);
    ctx.putImageData(img, 0, 0);
    const [sx, sy] = this.sky.sun;
    const glow = this.sky.moon ? C.steel : this.sky.sunC[1];
    for (let r = 36; r > 12; r -= 2) {
      const level = Math.round(((36 - r) / 24) * 7);
      for (let y = -r; y <= r; y++) {
        const w = Math.floor(Math.sqrt(r * r - y * y));
        for (let x = -w; x <= w; x++) {
          const X = sx + x, Y = sy + y;
          if (Y < 0 || Y > HORIZON) continue;
          if (BAYER[Y & 3][X & 3] < level) px(ctx, X, Y, glow);
        }
      }
    }
    if (this.sky.moon) {
      disc(ctx, sx, sy, 9, C.cloud); disc(ctx, sx + 1, sy - 1, 7, C.white);
      rect(ctx, sx - 3, sy + 2, 2, 1, C.cloud); rect(ctx, sx + 1, sy + 4, 2, 1, C.cloud); rect(ctx, sx - 2, sy - 4, 2, 2, C.cloud);
      disc(ctx, sx + 7, sy - 3, 7, this.sky.stops[1]);
    } else {
      disc(ctx, sx, sy, 13, this.sky.sunC[1]); disc(ctx, sx, sy, 11, this.sky.sunC[0]);
    }
    // far hills, hazy
    const [farD, farL] = this.sky.far;
    const r = rng(3);
    let h = 5;
    for (let x = 0; x < W; x++) {
      h += (r() - 0.5) * 1.1; h = Math.max(2, Math.min(10, h));
      const top = HORIZON - Math.round(h + Math.sin(x / 41) * 3 + Math.sin(x / 13) * 1);
      rect(ctx, x, top, 1, HORIZON - top + 2, farD);
      if (x % 3 === 0 && r() > 0.6) px(ctx, x, top, farL);
    }
    for (let y = HORIZON - 9; y < HORIZON + 1; y++) {
      const level = Math.round(((y - (HORIZON - 9)) / 10) * 9);
      for (let x = 0; x < W; x++) if (BAYER[y & 3][x & 3] < level) px(ctx, x, y, this.sky.haze);
    }
    // the Giza trio, low on the horizon by the sun
    const [pd, pl] = this.sky.far;
    triangle(ctx, 506, HORIZON + 1, 27, 30, pl, pd, this.sky.moon ? null : this.sky.sunC[0]);
    triangle(ctx, 557, HORIZON + 1, 21, 23, pl, pd, this.sky.moon ? null : this.sky.sunC[0]);
    triangle(ctx, 594, HORIZON + 1, 13, 15, pl, pd, null);
    this.layers.sky = cv;
  }

  buildGround() {
    const cv = this.canvas();
    const ctx = cv.getContext('2d');
    const [g1, g2, g3] = this.sky.ground;
    bands(ctx, 0, W, GROUND - 2, H, [[177, g1], [300, g2], [H, g2]]);
    const r = rng(11);
    // soft dunes
    this.dune(ctx, 560, 364, 150, 26, g2, g3);
    this.dune(ctx, 40, 368, 120, 18, g2, g3);
    // packed paths
    const path = (pts, wd, c) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let k = 0; k <= n; k++) {
          const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
          for (let j = -wd; j <= wd; j++) {
            const edge = Math.abs(j) === wd;
            if (!edge || BAYER[(y + j) & 3][x & 3] < 8) px(ctx, x, y + j, c);
          }
        }
      }
    };
    path([[-4, 328], [70, 316], [124, 304], [196, 302]], 3, g1);
    path([[124, 304], [136, 272], [140, 262]], 3, g1);
    path([[196, 302], [300, 314], [470, 310], [492, 290]], 3, g1);
    // sand ripples in the foreground
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(r() * W), y = Math.floor(236 + r() * 120);
      const len = 6 + Math.floor(r() * 10);
      for (let k = 0; k < len; k++) px(ctx, x + k, y + Math.round(Math.sin((k / len) * Math.PI) * -1.5), g3);
    }
    // pebbles and dry grass
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(r() * W), y = Math.floor(200 + r() * 150);
      rect(ctx, x, y, 2, 1, C.umber); px(ctx, x, y - 1, g1);
    }
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(r() * W), y = Math.floor(176 + r() * 40);
      px(ctx, x, y, C.green); px(ctx, x - 1, y - 1, C.green); px(ctx, x + 1, y - 2, C.leaf); px(ctx, x + 2, y - 1, C.pine);
    }

    this.paintNile(ctx);
    this.paintQuarry(ctx);
    this.paintBrickyard(ctx);
    this.paintPavilion(ctx);
    this.paintRestArea(ctx);
    this.layers.ground = cv;
  }

  dune(ctx, cx, baseY, halfW, h, lit, shade) {
    for (let x = -halfW; x <= halfW; x++) {
      const t = x / halfW;
      const top = Math.round(baseY - h * Math.pow(Math.cos((t * Math.PI) / 2), 1.6));
      const crestX = Math.round(halfW * 0.18);
      const c = x > crestX ? shade : lit;
      rect(ctx, cx + x, top, 1, baseY - top, c);
      if (Math.abs(x - crestX) < 2) px(ctx, cx + x, top, C.sand);
    }
  }

  paintNile(ctx) {
    const [w0, w1, w2] = this.sky.water;
    const [bank, bankD] = this.sky.bank;
    // water: brighter where it meets the horizon
    rect(ctx, 0, NILE.top + 2, W, NILE.bottom - NILE.top - 2, w1);
    for (let y = NILE.top + 2; y < NILE.top + 7; y++) for (let x = 0; x < W; x++) if (BAYER[y & 3][x & 3] < 16 - (y - NILE.top - 2) * 3) px(ctx, x, y, w0);
    // far bank: low scrub with a few palm silhouettes
    rect(ctx, 0, NILE.top, W, 2, bank);
    const r = rng(5);
    for (let x = 0; x < W; x++) {
      const h = Math.round(1 + Math.abs(Math.sin(x / 9) * 2 + Math.sin(x / 3.3)));
      rect(ctx, x, NILE.top - h, 1, h, bank);
    }
    const palms = [];
    for (let x = 24; x < W; x += 34 + Math.floor(r() * 50)) {
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) palms.push([x + k * (6 + Math.floor(r() * 4)), 7 + Math.floor(r() * 8), r() > 0.5 ? 1 : -1]);
    }
    for (const [x, h, lean] of palms) {
      for (let k = 0; k < h; k++) px(ctx, x + Math.round(lean * (k * k) / (h * 5)), NILE.top - k, bankD);
      const tx = x + Math.round(lean * h / 5), ty = NILE.top - h;
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-3, 1], [3, 1]]) px(ctx, tx + dx, ty + dy, bankD);
    }
    // near bank: a lip of wet mud
    for (let x = 0; x < W; x++) {
      const y = NILE.bottom + Math.round(Math.sin(x / 17) * 1);
      rect(ctx, x, y - 1, 1, 1, C.wine);
      rect(ctx, x, y, 1, 2, C.umber);
    }
  }

  paintQuarry(ctx) {
    const [lit, mid, shade, dark] = this.sky.rock;
    const face = PLACES.quarryFace;
    const top = (x) => Math.round(108 + Math.sin(x / 23) * 3 + Math.sin(x / 7) * 1 + (x > 88 ? Math.pow(x - 88, 1.35) * 0.9 : 0));
    const floor = 268;
    // body
    for (let x = 0; x < 150; x++) {
      const t = top(x);
      for (let y = t; y < floor; y++) {
        if (x > face(y)) continue;
        let c = mid;
        if (x < 22 + Math.sin(y / 9) * 4) c = shade;
        if (x < 7) c = dark;
        px(ctx, x, y, c);
      }
    }
    // the lit plateau edge
    for (let x = 0; x < 150; x++) {
      const t = top(x);
      if (x > face(t)) continue;
      rect(ctx, x, t, 1, 3, lit); px(ctx, x, t + 3, x % 5 ? lit : mid);
    }
    // bedding planes, broken and slightly wavy
    const planes = [132, 151, 173, 196, 219, 243];
    for (const py0 of planes) {
      for (let x = 8; x < 140; x++) {
        const y = py0 + Math.round(Math.sin(x / 15 + py0) * 1.2);
        if (y < top(x) + 5 || x > face(y) - 1) continue;
        if (((x * 7 + py0) % 23) < 3) continue;
        px(ctx, x, y, shade);
      }
    }
    // vertical cracks
    const r = rng(17);
    for (let i = 0; i < 26; i++) {
      const x = 14 + Math.floor(r() * 106), y = 128 + Math.floor(r() * 120);
      if (y < top(x) + 6 || x > face(y) - 2) continue;
      const len = 4 + Math.floor(r() * 10);
      for (let k = 0; k < len; k++) px(ctx, x + (k % 4 === 3 ? 1 : 0), y + k, dark);
    }
    // the cutting face: blocks being cut out of the lower rock, in steps
    const steps = [[70, 206, 5], [48, 228, 6], [30, 250, 7]];
    for (const [x0, y0, n] of steps) {
      for (let k = 0; k < n; k++) {
        const bx = x0 + k * 13, by = y0;
        if (bx + 12 > face(by + 10)) continue;
        const removed = (k + y0) % 3 === 0;
        if (removed) {
          rect(ctx, bx, by, 12, 9, shade);
          rect(ctx, bx, by, 12, 2, dark);
          rect(ctx, bx, by, 1, 9, dark);
          rect(ctx, bx + 1, by + 8, 11, 1, mid);
        } else {
          rect(ctx, bx, by, 12, 1, dark); rect(ctx, bx, by, 1, 9, dark);
          rect(ctx, bx + 1, by + 1, 11, 1, lit);
        }
      }
      // the ledge the cutters stand on
      for (let x = x0 - 4; x < Math.min(x0 + n * 13, face(y0 + 9)); x++) px(ctx, x, y0 + 9, lit);
    }
    // the cliff's lit right edge
    for (let y = 110; y < floor; y++) { const x = Math.floor(face(y)); if (y >= top(x) - 1) { px(ctx, x, y, lit); px(ctx, x - 1, y, y % 7 === 0 ? shade : mid); } }
    // shadow at the foot, rubble, rough blocks
    for (let x = 0; x < face(floor) + 6; x++) { px(ctx, x, floor, dark); if (BAYER[floor & 3][x & 3] < 8) px(ctx, x, floor + 1, shade); }
    for (let i = 0; i < 40; i++) {
      const x = 126 + Math.floor(r() * 30), y = 240 + Math.floor(r() * 34);
      if (x < face(y) + 1) continue;
      px(ctx, x, y, r() > 0.5 ? lit : shade);
    }
    const block = (x, y, w, h) => {
      rect(ctx, x, y, w, h, mid); rect(ctx, x, y, w, 1, lit); rect(ctx, x + w - 1, y + 1, 1, h - 1, shade);
      rect(ctx, x, y + h - 1, w, 1, shade); rect(ctx, x - 1, y + h, w + 3, 1, dark);
    };
    block(150, 232, 11, 7); block(158, 241, 9, 6); block(92, 262, 10, 6);
  }

  paintBrickyard(ctx) {
    // Exodus 1:14 "with mortar and with bricks": rows of mud bricks drying in the sun
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 7; i++) {
        const x = 16 + i * 13 + (row % 2) * 6, y = 338 + row * 6;
        rect(ctx, x, y, 9, 3, C.rust); rect(ctx, x, y, 9, 1, C.orange); rect(ctx, x, y + 3, 9, 1, C.wine);
      }
    }
    // brick mould
    rect(ctx, 112, 334, 11, 1, C.wine); rect(ctx, 112, 338, 11, 1, C.wine); rect(ctx, 112, 334, 1, 5, C.wine); rect(ctx, 117, 334, 1, 5, C.wine); rect(ctx, 122, 334, 1, 5, C.wine);
    // haystacks of straw (Exodus 5:7)
    const stack = (cx, by, w, h) => {
      for (let x = -w; x <= w; x++) {
        const t = x / w;
        const top = Math.round(by - h * Math.sqrt(Math.max(0, 1 - t * t)));
        rect(ctx, cx + x, top, 1, by - top, x > w * 0.3 ? C.amber : C.gold);
        if (x < -w * 0.2 && x > -w * 0.8) px(ctx, cx + x, top + 1, C.lemon);
      }
      for (let k = 0; k < w * 2; k += 3) px(ctx, cx - w + k, by - 2, C.amber);
      rect(ctx, cx - w, by, w * 2 + 1, 1, C.umber);
    };
    stack(30, 320, 9, 8); stack(52, 314, 7, 7); stack(22, 330, 6, 5);
    // clay pit
    const cx = 88, cy = 326;
    for (let y = -6; y <= 6; y++) {
      const w = Math.round(Math.sqrt(1 - (y * y) / 36) * 18 + Math.sin(y) * 1);
      rect(ctx, cx - w, cy + y, w * 2, 1, y < -4 ? C.umber : y > 4 ? C.clay : C.wine);
    }
    rect(ctx, cx - 9, cy - 1, 11, 1, C.navy); rect(ctx, cx - 6, cy, 7, 1, C.azure); px(ctx, cx - 4, cy - 1, C.cyan);
  }

  paintPavilion(ctx) {
    const L = 478, R = W;
    // dais
    rect(ctx, L, 248, R - L, 32, C.tan);
    rect(ctx, L, 248, R - L, 2, C.sand);
    for (let y = 254; y < 280; y += 6) rect(ctx, L, y, R - L, 1, C.umber);
    for (let y = 248, k = 0; y < 280; y += 6, k++) for (let x = L + (k % 2) * 8; x < R; x += 16) rect(ctx, x, y + 1, 1, 5, C.umber);
    rect(ctx, L, 280, R - L, 2, C.clay);
    rect(ctx, L - 1, 248, 1, 34, C.clay);
    // steps down to the sand
    for (let i = 0; i < 5; i++) {
      const y = 250 + i * 6, x = 492 - i * 2, w = 34 + i * 4;
      rect(ctx, x, y, w, 6, C.sand); rect(ctx, x, y + 5, w, 1, C.umber); rect(ctx, x, y, w, 1, C.white);
    }
    // back wall between the columns
    rect(ctx, L, 198, R - L, 50, C.clay);
    for (let y = 204; y < 248; y += 7) rect(ctx, L, y, R - L, 1, C.umber);
    // painted frieze on the back wall: ankh, djed pillar and water glyphs
    const GLYPH = {
      ankh: ['.X.', 'X.X', '.X.', 'XXX', '.X.', '.X.'],
      djed: ['X.X', 'XXX', 'X.X', 'XXX', '.X.', '.X.'],
      water: ['X.X', '.X.', '...', 'X.X', '.X.', '...'],
    };
    const order = ['ankh', 'djed', 'water', 'ankh', 'water', 'djed'];
    let gi = 0;
    for (let x = L + 12; x < R - 6; x += 9) {
      const g = GLYPH[order[gi++ % order.length]];
      g.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === 'X') px(ctx, x + xx, 208 + yy, gi % 2 ? C.navy : C.wine); }));
    }
    rect(ctx, L, 220, R - L, 1, C.gold);
    // columns with lotus capitals
    for (const cx of [486, 522, 596, 628]) {
      rect(ctx, cx - 3, 198, 7, 50, C.sand);
      rect(ctx, cx - 3, 198, 2, 50, C.tan);
      rect(ctx, cx + 3, 198, 1, 50, C.clay);
      for (let y = 206; y < 246; y += 8) rect(ctx, cx - 3, y, 7, 1, C.tan);
      rect(ctx, cx - 5, 190, 11, 8, C.green); rect(ctx, cx - 5, 190, 11, 2, C.leaf);
      rect(ctx, cx - 4, 196, 9, 2, C.gold);
      px(ctx, cx - 5, 197, C.pine); px(ctx, cx + 5, 197, C.pine);
      rect(ctx, cx - 4, 246, 9, 2, C.tan);
    }
    // entablature with a winged sun disk
    rect(ctx, L - 4, 180, R - L + 4, 10, C.tan);
    rect(ctx, L - 4, 180, R - L + 4, 2, C.sand);
    rect(ctx, L - 4, 188, R - L + 4, 2, C.umber);
    for (let x = L; x < R; x += 6) { rect(ctx, x, 183, 3, 3, C.navy); rect(ctx, x + 3, 183, 3, 3, C.gold); }
    const mx = 558;
    rect(ctx, mx - 20, 182, 40, 5, C.sand);
    for (let k = 0; k < 16; k++) { px(ctx, mx - 6 - k, 184 - (k >> 3), C.azure); px(ctx, mx + 6 + k, 184 - (k >> 3), C.azure); px(ctx, mx - 6 - k, 185, C.navy); px(ctx, mx + 6 + k, 185, C.navy); }
    disc(ctx, mx, 184, 3, C.red); px(ctx, mx - 1, 183, C.gold);
    rect(ctx, L - 6, 176, R - L + 8, 4, C.clay); rect(ctx, L - 6, 176, R - L + 8, 1, C.sand);
    // banners
    for (const bx of [504, 610]) {
      rect(ctx, bx - 4, 192, 9, 34, C.blood); rect(ctx, bx - 4, 192, 9, 2, C.gold); rect(ctx, bx - 4, 224, 9, 2, C.gold);
      for (let y = 197; y < 222; y += 5) { px(ctx, bx - 1, y, C.gold); px(ctx, bx + 1, y + 2, C.gold); rect(ctx, bx - 2, y + 1, 1, 2, C.lemon); }
      px(ctx, bx - 4, 226, C.gold); px(ctx, bx + 4, 226, C.gold);
    }
    // throne
    const [tx, ty] = PLACES.pharaohSeat;
    rect(ctx, tx + 2, ty - 26, 8, 26, C.gold);
    rect(ctx, tx + 2, ty - 26, 8, 2, C.lemon);
    rect(ctx, tx + 9, ty - 26, 1, 26, C.amber);
    rect(ctx, tx - 6, ty - 8, 16, 3, C.gold);
    rect(ctx, tx - 6, ty - 5, 2, 5, C.amber); rect(ctx, tx + 6, ty - 5, 2, 5, C.amber);
    rect(ctx, tx - 5, ty - 9, 12, 1, C.red);
    rect(ctx, tx + 3, ty - 22, 6, 12, C.navy);
    for (let y = ty - 21; y < ty - 10; y += 2) rect(ctx, tx + 3, y, 6, 1, C.azure);
    // brazier
    const [bx, by] = PLACES.brazier;
    rect(ctx, bx - 5, by - 12, 11, 4, C.umber); rect(ctx, bx - 5, by - 12, 11, 1, C.gold);
    rect(ctx, bx - 1, by - 8, 3, 7, C.wine); rect(ctx, bx - 4, by - 1, 9, 1, C.wine);
  }

  paintRestArea(ctx) {
    // a reed sunshade on two poles, a mat, water jars
    rect(ctx, 138, 312, 1, 32, C.wine); rect(ctx, 204, 314, 1, 30, C.wine);
    for (let x = 132; x < 212; x++) {
      const y = 310 + Math.round((x - 132) * 0.04);
      rect(ctx, x, y, 1, 3, (x >> 1) % 2 ? C.gold : C.amber);
      px(ctx, x, y + 3, C.umber);
      if (x % 6 === 0) px(ctx, x, y + 4, C.gold);
    }
    for (let y = 318; y < 344; y++) { const x0 = 142 + Math.round((y - 318) * 0.35); rect(ctx, x0, y, 64 - Math.round((y - 318) * 0.1), 1, C.clay); }
    for (let x = 140; x < 208; x++) for (let y = 344; y < 352; y++) px(ctx, x, y, (x + y) % 4 < 2 ? C.gold : C.amber);
    rect(ctx, 140, 352, 68, 1, C.umber);
    const jar = (x, y) => {
      rect(ctx, x - 2, y - 7, 5, 6, C.umber); rect(ctx, x - 1, y - 9, 3, 2, C.umber); rect(ctx, x - 2, y - 7, 1, 6, C.wine);
      px(ctx, x + 1, y - 6, C.tan); rect(ctx, x - 1, y - 1, 3, 1, C.wine);
    };
    jar(214, 348); jar(220, 350); jar(132, 350);
  }

  // ---------- per-frame drawing
  drawBack(ctx, t) {
    ctx.drawImage(this.layers.sky, 0, 0);
    this.drawStars(ctx, t);
    this.drawClouds(ctx, t);
    this.drawCompleted(ctx);
    this.drawBirds(ctx, t);
    ctx.drawImage(this.layers.ground, 0, 0, W, H, 0, 0, W, H);
    this.drawWater(ctx, t);
    this.drawReeds(ctx, t);
    this.drawBoat(ctx, t);
  }

  drawStars(ctx, t) {
    if (this.mode !== 'night' && this.mode !== 'dusk') return;
    const r = rng(99);
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * (HORIZON - 30));
      const tw = Math.sin(t * (1 + r() * 2) + i) > 0.6;
      px(ctx, x, y, tw ? C.white : (this.mode === 'dusk' ? C.mauve : C.slate));
    }
  }

  cloudCanvas(cl) {
    const cv = this.canvas(90, 30);
    const ctx = cv.getContext('2d');
    const [body, under, top] = this.sky.cloud;
    for (const [dx, dy, rx, ry] of cl.parts) ellipse(ctx, 45 + dx, 18 + dy, rx, ry, body);
    // lit underside
    const img = ctx.getImageData(0, 0, 90, 30);
    const solid = (x, y) => x >= 0 && y >= 0 && x < 90 && y < 30 && img.data[(y * 90 + x) * 4 + 3] > 0;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 90; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x, y + 1) || !solid(x, y + 2)) px(ctx, x, y, under);
      else if (!solid(x, y - 1)) px(ctx, x, y, top);
    }
    return cv;
  }

  drawClouds(ctx, t) {
    if (this.mode === 'night') return;
    for (const cl of this.clouds) {
      if (!cl.cache) cl.cache = this.cloudCanvas(cl);
      const x = Math.round(((cl.x + t * cl.s) % (W + 120)) - 90);
      ctx.drawImage(cl.cache, x, Math.round(cl.y) - 18);
    }
  }

  drawCompleted(ctx) {
    // finished pyramids of your agents, lined up on the horizon
    const n = Math.min(this.completed.length, 18);
    const night = this.mode === 'night';
    const lit = night ? C.steel : C.sand, shade = night ? C.slate : C.tan;
    for (let i = 0; i < n; i++) {
      const x = 146 + i * 17 - (i % 2) * 5, h = 7 + ((i * 7) % 3) * 2;
      triangle(ctx, x, HORIZON + 1, Math.round(h * 0.95), h, lit, shade);
      px(ctx, x, HORIZON - h + 1, night ? C.cloud : C.lemon); px(ctx, x, HORIZON - h + 2, night ? C.mist : C.gold);
    }
  }

  drawBirds(ctx, t) {
    if (this.mode === 'night') return;
    if (this.birds.length < 3 && Math.random() < 0.004) {
      const dir = Math.random() > 0.5 ? 1 : -1;
      this.birds.push({ x: dir > 0 ? -10 : W + 10, y: 30 + Math.random() * 70, dir, s: 14 + Math.random() * 10, ph: Math.random() * 6 });
    }
    const dt = 1 / 60;
    for (const b of this.birds) {
      b.x += b.dir * b.s * dt;
      const up = Math.sin(t * 9 + b.ph) > 0;
      const x = Math.round(b.x), y = Math.round(b.y + Math.sin(t + b.ph) * 2);
      const c = this.mode === 'day' ? C.ink : C.plum;
      px(ctx, x, y, c);
      if (up) { px(ctx, x - 1, y - 1, c); px(ctx, x + 1, y - 1, c); px(ctx, x - 2, y - 2, c); px(ctx, x + 2, y - 2, c); }
      else { px(ctx, x - 1, y, c); px(ctx, x + 1, y, c); px(ctx, x - 2, y + 1, c); px(ctx, x + 2, y + 1, c); }
    }
    this.birds = this.birds.filter((b) => b.x > -20 && b.x < W + 20);
  }

  drawWater(ctx, t) {
    const [, , ripple, glint] = this.sky.water;
    const r = rng(21);
    for (let i = 0; i < 46; i++) {
      const y = NILE.top + 5 + Math.floor(r() * (NILE.bottom - NILE.top - 7));
      const speed = 2 + r() * 4;
      const x = Math.floor((r() * W + t * speed) % W);
      const len = 3 + Math.floor(r() * 7);
      if (Math.sin(t * 1.7 + i * 1.3) > -0.4) rect(ctx, x, y, len, 1, ripple);
    }
    // sun or moon on the water
    const sx = this.sky.sun[0];
    for (let y = NILE.top + 3; y < NILE.bottom - 1; y += 2) {
      const w = 2 + Math.round((Math.sin(t * 3 + y) + 1) * 2) + Math.round((y - NILE.top) * 0.3);
      rect(ctx, sx - w, y, w * 2, 1, glint);
    }
    const bl = this.blood;
    if (bl && t < bl.until + 1.5) {
      // the river turns to blood, spreading from Pharaoh's side
      const k = Math.min(1, (t - bl.t0) / 1.6);
      const fade = t > bl.until ? 1 - (t - bl.until) / 1.5 : 1;
      const front = W - k * (W + 24);
      const edge = (y) => Math.round(front + Math.sin(y * 1.3 + t * 5) * 3 + Math.sin(y * 0.45 - t * 2) * 6);
      ctx.globalAlpha = Math.max(0, fade);
      for (let y = NILE.top + 2; y < NILE.bottom; y++) {
        const fx = Math.max(0, edge(y));
        if (fx < W) rect(ctx, fx, y, W - fx, 1, C.blood);
        if (fx > 0 && fx < W) rect(ctx, fx, y, 2, 1, C.red);
      }
      const rr = rng(21);
      for (let i = 0; i < 46; i++) {
        const y = NILE.top + 5 + Math.floor(rr() * (NILE.bottom - NILE.top - 7));
        const speed = 2 + rr() * 4;
        const x = Math.floor((rr() * W + t * speed) % W);
        const len = 3 + Math.floor(rr() * 7);
        if (x >= edge(y) && Math.sin(t * 1.7 + i * 1.3) > -0.4) rect(ctx, x, y, len, 1, i % 3 ? C.red : C.wine);
      }
      const rh = rng(77);
      for (let i = 0; i < 460; i++) {
        const y = NILE.top + 3 + Math.floor(rh() * (NILE.bottom - NILE.top - 4));
        const x = Math.floor((rh() * (W + 40) + t * (6 + rh() * 4)) % (W + 40)) - 20;
        const len = 3 + Math.floor(rh() * 3);
        if (x >= edge(y)) rect(ctx, x, y, len, 1, i % 7 ? C.red : C.pink);
      }
      for (let y = NILE.top + 3; y < NILE.bottom - 1; y += 2) {
        const w = 2 + Math.round((Math.sin(t * 3 + y) + 1) * 2) + Math.round((y - NILE.top) * 0.3);
        if (sx - w >= edge(y)) rect(ctx, sx - w, y, w * 2, 1, C.pink);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawReeds(ctx, t) {
    // papyrus in clumps along the near bank
    const r = rng(41);
    let x = 132;
    while (x < W) {
      const n = 3 + Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        const rx = x + k * 2 + Math.floor(r() * 2);
        const h = 5 + Math.floor(r() * 9);
        const sway = Math.round(Math.sin(t * 1.3 + rx * 0.21) * 1);
        const base = NILE.bottom + 1;
        for (let j = 0; j < h; j++) px(ctx, rx + (j > h - 4 ? sway : 0), base - j, j < 2 ? C.pine : C.green);
        if (r() < 0.55) {
          const tx = rx + sway, ty = base - h;
          px(ctx, tx, ty - 1, C.leaf); px(ctx, tx - 1, ty - 1, C.leaf); px(ctx, tx + 1, ty - 1, C.leaf); px(ctx, tx - 2, ty, C.green); px(ctx, tx + 2, ty, C.green);
        }
      }
      x += n * 2 + 10 + Math.floor(r() * 26);
      if (x > 468 && x < 640) x += 20;
    }
  }

  drawBoat(ctx, t) {
    const b = this.boat;
    const x = Math.round(((b.x + t * b.speed) % (W + 120)) - 60);
    const y = NILE.top + 9 + Math.round(Math.sin(t * 2) * 0.6);
    rect(ctx, x - 9, y, 19, 2, C.wine); rect(ctx, x - 11, y - 1, 3, 1, C.wine); rect(ctx, x + 9, y - 1, 3, 1, C.wine);
    rect(ctx, x - 8, y + 2, 16, 1, C.plum);
    rect(ctx, x, y - 14, 1, 14, C.plum);
    for (let k = 0; k < 11; k++) rect(ctx, x + 1, y - 13 + k, Math.round(k * 0.8), 1, k % 5 === 0 ? C.cloud : C.white);
    px(ctx, x - 4, y - 2, C.clay); px(ctx, x + 5, y - 2, C.ink);
  }

  // a date palm; sways a little
  palm(ctx, x, y, h, t, lean = 0, silhouette = false) {
    if (silhouette) {
      const cv = this.silCanvas || (this.silCanvas = this.canvas(80, 110));
      const c2 = cv.getContext('2d');
      c2.clearRect(0, 0, 80, 110);
      this.palm(c2, 40, 108, h, t, lean, false);
      c2.globalCompositeOperation = 'source-in';
      c2.fillStyle = this.mode === 'night' ? C.ink : C.plum;
      c2.fillRect(0, 0, 80, 110);
      c2.globalCompositeOperation = 'source-over';
      ctx.drawImage(cv, x - 40, y - 108);
      return;
    }
    const sway = Math.sin(t * 0.8 + x) * 1.2;
    let cx = x, cy = y;
    for (let k = 0; k < h; k++) {
      const f = k / h;
      cx = x + Math.round(lean * f * f * h * 0.25 + sway * f * f);
      cy = y - k;
      const ring = k % 3 === 0;
      rect(ctx, cx - 1, cy, 3, 1, ring ? C.wine : C.umber);
      px(ctx, cx + 1, cy, ring ? C.umber : C.clay);
    }
    // under-crown shadow and dates
    rect(ctx, cx - 3, cy + 1, 7, 2, C.pine);
    rect(ctx, cx - 3, cy + 3, 2, 3, C.rust); rect(ctx, cx + 2, cy + 3, 2, 3, C.rust); px(ctx, cx - 2, cy + 5, C.amber); px(ctx, cx + 3, cy + 5, C.amber);
    const fronds = [-2.9, -2.4, -1.9, -1.2, -0.7, -0.2, -1.55];
    fronds.forEach((a0, i) => {
      const a = a0 + Math.sin(t * 1.3 + i + x) * 0.05;
      const L = i === 6 ? 11 : 17;
      const droop = i === 6 ? 0.2 : 0.95;
      let lx = cx, ly = cy;
      for (let s = 1; s <= L; s++) {
        const u = s / L;
        const fx = Math.round(cx + Math.cos(a) * s);
        const fy = Math.round(cy + Math.sin(a) * s + droop * u * u * L * 0.9);
        px(ctx, fx, fy, s > L - 3 ? C.leaf : C.green);
        if (s > 2 && s % 2 === 0) { px(ctx, fx, fy + 1, C.green); px(ctx, fx + (Math.cos(a) > 0 ? -1 : 1), fy + 2, C.pine); }
        if (s > 3 && s % 3 === 1) px(ctx, fx, fy - 1, C.leaf);
        lx = fx; ly = fy;
      }
      px(ctx, lx, ly + 1, C.pine);
    });
  }

  torch(ctx, x, y, t) {
    rect(ctx, x, y, 1, 8, C.wine);
    rect(ctx, x - 1, y - 1, 3, 2, C.umber);
    const f = Math.floor(t * 12 + x) % 3;
    px(ctx, x, y - 2, C.lemon); px(ctx, x, y - 3, f ? C.gold : C.lemon); px(ctx, x - 1 + (f % 2), y - 4, C.amber);
    if (f === 2) px(ctx, x, y - 5, C.amber);
  }

  fire(ctx, x, y, t) {
    const f = Math.floor(t * 10) % 4;
    rect(ctx, x - 3, y, 7, 1, C.gold);
    rect(ctx, x - 2, y - 1, 5, 1, C.amber);
    rect(ctx, x - 1, y - 2 - (f % 2), 3, 2, C.gold);
    px(ctx, x + (f % 3) - 1, y - 4, C.lemon); px(ctx, x, y - 3, C.lemon);
    if (f === 1) px(ctx, x + 1, y - 5, C.amber);
  }
}

export const TORCHES = [[480, 206], [634, 206], [148, 226], [200, 282], [452, 292]];
