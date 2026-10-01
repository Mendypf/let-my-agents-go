// One palette for everything: Endesga 32 (by Endesga). Every pixel in the scene comes from here.
export const C = {
  ink: '#181425', night: '#262b44', slate: '#3a4466', steel: '#5a6988', mist: '#8b9bb4', cloud: '#c0cbdc', white: '#ffffff',
  plum: '#3e2731', wine: '#733e39', umber: '#b86f50', tan: '#e4a672', sand: '#ead4aa', peach: '#e8b796', clay: '#c28569',
  rust: '#be4a2f', orange: '#d77643', blood: '#a22633', red: '#e43b44', amber: '#f77622', gold: '#feae34', lemon: '#fee761',
  leaf: '#63c74d', green: '#3e8948', pine: '#265c42', deep: '#193c3e', navy: '#124e89', azure: '#0099db', cyan: '#2ce8f5',
  hot: '#ff0044', purple: '#68386c', mauve: '#b55088', pink: '#f6757a',
};

// Crew colors: the headband and belt of every worker in one Claude session.
export const CREW_COLORS = [
  { band: C.azure, name: 'lapis' },
  { band: C.red, name: 'carnelian' },
  { band: C.leaf, name: 'malachite' },
  { band: C.gold, name: 'gold' },
  { band: C.mauve, name: 'amethyst' },
  { band: C.cyan, name: 'turquoise' },
];

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 4x4 Bayer matrix, values 0..15, for dithered gradients.
export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
