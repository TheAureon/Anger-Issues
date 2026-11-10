// Shop catalogue: cosmetic skins for the pieces, the board and the guns. Pure data.
// A material spec is { c: colour, r: roughness, m: metalness, e: emissive colour, ei: emissive intensity }.

export const PIECE_SKINS = [
  {
    id: 'pieces-classic', name: 'Classic', price: 0, desc: 'Ivory and charcoal, the original army.',
    w: { body: { c: 0xeee3c8, r: 0.62, m: 0.04 }, trim: { c: 0xc99a3e, r: 0.5, m: 0.2 } },
    b: { body: { c: 0x2e2b36, r: 0.62, m: 0.04 }, trim: { c: 0xb8382e, r: 0.5, m: 0.2 } },
  },
  {
    id: 'pieces-wood', name: 'Carved Wood', price: 150, desc: 'Hand-carved maple and walnut.',
    w: { body: { c: 0xdcb27a, r: 0.8, m: 0 }, trim: { c: 0x7a4a24, r: 0.7, m: 0 } },
    b: { body: { c: 0x5a3620, r: 0.8, m: 0 }, trim: { c: 0xe0b46a, r: 0.7, m: 0 } },
  },
  {
    id: 'pieces-candy', name: 'Candy', price: 250, desc: 'Bubblegum versus grape soda.',
    w: { body: { c: 0xffbfdc, r: 0.4, m: 0 }, trim: { c: 0x6fe0ff, r: 0.35, m: 0 } },
    b: { body: { c: 0x8b78ff, r: 0.4, m: 0 }, trim: { c: 0xffe26b, r: 0.35, m: 0 } },
  },
  {
    id: 'pieces-camo', name: 'Camo', price: 350, desc: 'Olive drab against desert brown.',
    w: { body: { c: 0x98a476, r: 0.9, m: 0 }, trim: { c: 0x46542c, r: 0.85, m: 0 } },
    b: { body: { c: 0x6b5236, r: 0.9, m: 0 }, trim: { c: 0x2e2a20, r: 0.85, m: 0 } },
  },
  {
    id: 'pieces-marble', name: 'Marble', price: 500, desc: 'Polished white and grey stone.',
    w: { body: { c: 0xf3f1ec, r: 0.25, m: 0.05 }, trim: { c: 0x9aa3ad, r: 0.25, m: 0.3 } },
    b: { body: { c: 0x3a3e46, r: 0.25, m: 0.05 }, trim: { c: 0xd2d6dc, r: 0.25, m: 0.3 } },
  },
  {
    id: 'pieces-neon', name: 'Neon', price: 750, level: 4, desc: 'Glowing cyan versus magenta.',
    w: { body: { c: 0x1c2b3c, r: 0.4, m: 0.2, e: 0x0b6f8a, ei: 0.35 }, trim: { c: 0x22eeff, r: 0.3, m: 0, e: 0x22eeff, ei: 1.2 } },
    b: { body: { c: 0x2b1131, r: 0.4, m: 0.2, e: 0x6a0f5c, ei: 0.35 }, trim: { c: 0xff2bd6, r: 0.3, m: 0, e: 0xff2bd6, ei: 1.2 } },
  },
  {
    id: 'pieces-chrome', name: 'Chrome', price: 1000, level: 6, desc: 'Mirror-finish robots.',
    w: { body: { c: 0xdfe4ea, r: 0.18, m: 0.95 }, trim: { c: 0x30c0ff, r: 0.3, m: 0.5, e: 0x1080c0, ei: 0.4 } },
    b: { body: { c: 0x4a5058, r: 0.2, m: 0.95 }, trim: { c: 0xff5030, r: 0.3, m: 0.5, e: 0xc02a10, ei: 0.4 } },
  },
  {
    id: 'pieces-royal', name: 'Gold & Obsidian', price: 1500, level: 8, desc: 'Solid gold against volcanic glass.',
    w: { body: { c: 0xe2b33c, r: 0.28, m: 0.9 }, trim: { c: 0xfff1b0, r: 0.3, m: 0.6 } },
    b: { body: { c: 0x15121b, r: 0.12, m: 0.6 }, trim: { c: 0x9a3cff, r: 0.3, m: 0.4, e: 0x5a14b0, ei: 0.6 } },
  },
  {
    id: 'pieces-prestige', name: 'Prestige', price: 0, prestige: 1, desc: 'Ivory and onyx with a ruby glow. Prestige reward.',
    w: { body: { c: 0xfbf7ee, r: 0.2, m: 0.1 }, trim: { c: 0xff2a4a, r: 0.2, m: 0.3, e: 0xff1030, ei: 0.8 } },
    b: { body: { c: 0x0e0d12, r: 0.15, m: 0.5 }, trim: { c: 0xff2a4a, r: 0.2, m: 0.3, e: 0xff1030, ei: 0.8 } },
  },
  {
    id: 'pieces-veteran', name: 'Veteran', price: 0, campaign: 2, desc: 'Battle-worn olive and gunmetal. Campaign reward.',
    w: { body: { c: 0xb9b48c, r: 0.75, m: 0.1 }, trim: { c: 0xd4a640, r: 0.35, m: 0.8 } },
    b: { body: { c: 0x3c4434, r: 0.75, m: 0.1 }, trim: { c: 0xb0b8c0, r: 0.3, m: 0.85 } },
  },
];

export const BOARD_SKINS = [
  { id: 'board-classic', name: 'Walnut', price: 0, desc: 'The original wooden board.', light: { c: 0xd9c49b, r: 0.7 }, dark: { c: 0x6f5034, r: 0.7 }, frame: { c: 0x3d2a1c, r: 0.85 } },
  { id: 'board-tournament', name: 'Tournament', price: 100, desc: 'Club green and cream.', light: { c: 0xeeeed2, r: 0.8 }, dark: { c: 0x769656, r: 0.8 }, frame: { c: 0x3a2f20, r: 0.85 } },
  { id: 'board-desert', name: 'Desert', price: 200, desc: 'Sandstone tiles, sun-baked.', light: { c: 0xead3a2, r: 0.95 }, dark: { c: 0xb27c46, r: 0.95 }, frame: { c: 0x7a4e2a, r: 0.9 } },
  { id: 'board-marble', name: 'Marble', price: 350, desc: 'Cold, polished stone.', light: { c: 0xeeebe4, r: 0.22 }, dark: { c: 0x5f6670, r: 0.22 }, frame: { c: 0x2b2e33, r: 0.3 } },
  { id: 'board-ice', name: 'Glacier', price: 500, desc: 'Frozen blue ice.', light: { c: 0xe2f5ff, r: 0.12, m: 0.1 }, dark: { c: 0x6ca7d6, r: 0.12, m: 0.1 }, frame: { c: 0xa6d6f2, r: 0.2 } },
  { id: 'board-candy', name: 'Sweet Shop', price: 500, desc: 'Strawberry and blueberry frosting.', light: { c: 0xffdcec, r: 0.5 }, dark: { c: 0xb2a2ff, r: 0.5 }, frame: { c: 0xff8fc3, r: 0.5 } },
  { id: 'board-wartable', name: 'War Table', price: 0, campaign: 1, desc: 'Command-tent felt and brass. Campaign reward.', light: { c: 0x9fae7a, r: 0.95 }, dark: { c: 0x4d5e3a, r: 0.95 }, frame: { c: 0xb48a3c, r: 0.35, m: 0.8 } },
  { id: 'board-lava', name: 'Lava Field', price: 900, level: 5, desc: 'Basalt over glowing magma.', light: { c: 0x4a3f3b, r: 0.95 }, dark: { c: 0x1c1110, r: 0.85, e: 0xff3c00, ei: 0.045 }, frame: { c: 0x140b08, r: 0.9, e: 0x6a1802, ei: 0.08 } },
];

export const GUN_SKINS = [
  { id: 'guns-standard', name: 'Gunmetal', price: 0, desc: 'Standard issue.', metal: { c: 0x2a2d33, r: 0.45, m: 0.6 }, grip: { c: 0x6b4426, r: 0.8 } },
  { id: 'guns-desert', name: 'Desert Tan', price: 100, desc: 'Sand-coloured furniture.', metal: { c: 0x3a3a36, r: 0.5, m: 0.5 }, grip: { c: 0xc8a978, r: 0.85 } },
  { id: 'guns-tiger', name: 'Tiger', price: 250, desc: 'Orange with black stocks.', metal: { c: 0xe07a1f, r: 0.4, m: 0.2 }, grip: { c: 0x1a1a1a, r: 0.6 } },
  { id: 'guns-arctic', name: 'Arctic', price: 300, desc: 'Winter white.', metal: { c: 0xe8eef2, r: 0.4, m: 0.1 }, grip: { c: 0x9fb3c2, r: 0.6 } },
  { id: 'guns-bubblegum', name: 'Bubblegum', price: 300, desc: 'Pink. Very pink.', metal: { c: 0xff7ab8, r: 0.35, m: 0.1 }, grip: { c: 0xffd1e6, r: 0.5 } },
  { id: 'guns-plasma', name: 'Plasma', price: 700, level: 3, desc: 'Glowing energy weapons.', metal: { c: 0x10202a, r: 0.3, m: 0.4, e: 0x00d0ff, ei: 0.9 }, grip: { c: 0x203040, r: 0.5, e: 0x0060a0, ei: 0.4 } },
  { id: 'guns-medal', name: 'Medal of Honor', price: 0, campaign: 3, desc: 'Bronze and navy blue. Campaign reward.', metal: { c: 0xb87333, r: 0.3, m: 0.9 }, grip: { c: 0x1f2f5a, r: 0.5 } },
  { id: 'guns-gold', name: 'Solid Gold', price: 1200, level: 7, desc: 'Gold-plated everything.', metal: { c: 0xe9b93e, r: 0.25, m: 0.95 }, grip: { c: 0x3b1f10, r: 0.5 } },
];

// Arenas: the world around the board. Free, unlocked by rank (`rank` = level needed).
export const ARENAS = [
  { id: 'arena-forest', name: 'Pine Ridge', rank: 1, desc: 'Green hills and pine woods.',
    sky: 0x9fc4d8, fogNear: 18, fogFar: 55, ground: 0x6f8a4c, plateau: 0x7d8a5a, leaves: [0x2f5d3a, 0x3a6b40, 0x2a4f36], trunk: 0x5b3d26, rock: 0x8a8780, sun: 0xfff1d6, sunI: 2.2, hemiI: 1.1, cloud: 0xffffff, treeScale: 1 },
  { id: 'arena-autumn', name: 'Autumn Vale', rank: 3, desc: 'Orange and red leaves, golden light.',
    sky: 0xe8c9a0, fogNear: 16, fogFar: 50, ground: 0x8a7a44, plateau: 0x9a8650, leaves: [0xc8641e, 0xd9902a, 0xa63a22], trunk: 0x4e3020, rock: 0x8e8378, sun: 0xffd9a0, sunI: 2.3, hemiI: 1.0, cloud: 0xfff1de, treeScale: 1 },
  { id: 'arena-desert', name: 'Dust Canyon', rank: 5, desc: 'Sandstone mesas under a hot sun.',
    sky: 0xf2d6a2, fogNear: 20, fogFar: 60, ground: 0xc99a5e, plateau: 0xb9824a, leaves: [0x6e8a3a, 0x7d9a44, 0x5e7a30], trunk: 0x8a6a40, rock: 0xb0703e, sun: 0xfff0c8, sunI: 2.6, hemiI: 1.2, cloud: 0xfffaf0, treeScale: 0.5 },
  { id: 'arena-snow', name: 'Frostfield', rank: 7, desc: 'Snow-covered pines and pale sky.',
    sky: 0xcfe0ee, fogNear: 14, fogFar: 46, ground: 0xe9f0f5, plateau: 0xd9e4ec, leaves: [0x2c4a3e, 0xdfe9ef, 0x34584a], trunk: 0x4a3a30, rock: 0x9aa4ae, sun: 0xeaf4ff, sunI: 2.0, hemiI: 1.3, cloud: 0xffffff, treeScale: 1 },
  { id: 'arena-night', name: 'Night Ops', rank: 10, desc: 'Moonlight and long shadows.',
    sky: 0x141a2c, fogNear: 12, fogFar: 40, ground: 0x2a3426, plateau: 0x343d2c, leaves: [0x15281e, 0x1b3324, 0x10201a], trunk: 0x2a1e16, rock: 0x4a4c56, sun: 0xa8c0ff, sunI: 1.3, hemiI: 0.45, cloud: 0x5a6280, treeScale: 1 },
];

export const CATEGORIES = [
  { key: 'pieces', label: 'Pieces', items: PIECE_SKINS },
  { key: 'board', label: 'Board', items: BOARD_SKINS },
  { key: 'guns', label: 'Guns', items: GUN_SKINS },
  { key: 'arena', label: 'Arena', items: ARENAS },
];
export const DEFAULT_EQUIPPED = { pieces: 'pieces-classic', board: 'board-classic', guns: 'guns-standard', arena: 'arena-forest' };
export const findSkin = (cat, id) => {
  const list = CATEGORIES.find((c) => c.key === cat).items;
  return list.find((s) => s.id === id) || list[0];
};

// Apply a material spec to a three.js MeshStandardMaterial.
export function applySpec(mat, spec, envMap = null) {
  mat.color.setHex(spec.c);
  mat.roughness = spec.r ?? 0.7;
  mat.metalness = spec.m ?? 0;
  mat.emissive.setHex(spec.e ?? 0x000000);
  mat.emissiveIntensity = spec.ei ?? 1;
  // Metals need something to reflect, or they render black.
  mat.envMap = (spec.m ?? 0) > 0.3 ? envMap : null;
  mat.envMapIntensity = 0.9;
  mat.needsUpdate = true;
}

// Swatch colours for the shop cards.
export function swatches(cat, s) {
  const show = (spec) => ((spec.ei ?? 0) >= 0.5 ? spec.e : spec.c); // glowing parts show their glow
  if (cat === 'pieces') return [s.w.body, s.w.trim, s.b.body, s.b.trim].map(show);
  if (cat === 'board') return [s.light, s.dark, s.frame].map(show);
  if (cat === 'arena') return [s.sky, s.ground, s.leaves[0], s.rock];
  return [s.metal, s.grip].map(show);
}
