// Pure game rules for Gunmate: chess movement, guns instead of captures, ballistic shots.
// No rendering here, so this file runs in Node too (see scripts/test-chess-shooter.mjs).

export const CLASSIC = 'classic';
export const MERCIZERO = 'mercizero';
// Fog of War: MerciZero rules (kings can die, no check), but you only see what your pieces see.
export const FOG = 'fog';
export const isClassic = (st) => st.mode === CLASSIC;

export const NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
export const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

// Collision cylinders in world units (one board square = 1). Meshes in pieces.js match these.
export const DIMS = {
  p: { h: 0.62, r: 0.25 },
  n: { h: 0.92, r: 0.28 },
  b: { h: 1.02, r: 0.27 },
  r: { h: 0.84, r: 0.3 },
  q: { h: 1.14, r: 0.29 },
  k: { h: 1.26, r: 0.3 },
};
export const MUZZLE = 0.55; // gun height as a fraction of piece height
export const EYE = 0.9; // POV camera height as a fraction of piece height

// Aim wobble per gun, as a standard deviation in radians (yaw and pitch each).
export const SPREAD = { p: 0.085, n: 0.07, b: 0.065, r: 0.058, q: 0.06, k: 0.075 };

// Sliders shoot half their movement: 8 squares of travel, 4 of range.
export const SLIDER_RANGE = 4;

// Rule modifiers (weekly challenges). A state may carry `rules`; anything missing uses these.
export const DEFAULT_RULES = { sliderRange: SLIDER_RANGE, spreadMul: 1, pawnForward: 0, kingRange: 1 };
export const rulesOf = (st) => (st && st.rules) || DEFAULT_RULES;
const MAX_REACH = { p: Math.SQRT2, k: Math.SQRT2, n: Math.sqrt(5), r: 4, b: 4 * Math.SQRT2, q: 4 * Math.SQRT2 };

export const WEAPON_TEXT = {
  p: 'Sidearm: the two squares diagonally ahead (its capture squares).',
  n: 'Carbine: any L-jump square, fired in a straight line (bullets can clip pieces in between).',
  b: `Rifle: diagonals, up to ${SLIDER_RANGE} squares (half its movement).`,
  r: `Long rifle: straight lines, up to ${SLIDER_RANGE} squares (half its movement).`,
  q: `Assault rifle: lines and diagonals, up to ${SLIDER_RANGE} squares (half its movement).`,
  k: 'Revolver: the 8 squares around it.',
};
export const MOVE_TEXT = {
  p: 'Moves 1 forward (2 from its start square). Promotes on the last rank.',
  n: 'Jumps in an L.',
  b: 'Slides diagonally.',
  r: 'Slides in straight lines.',
  q: 'Slides in any line.',
  k: 'Steps 1 square. Can castle.',
};

export const VALUE = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

export const fileOf = (s) => s & 7;
export const rankOf = (s) => s >> 3;
export const sqAt = (f, r) => (f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f);
export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);
export const other = (c) => (c === 'w' ? 'b' : 'w');
export const toWorld = (s) => ({ x: (s & 7) - 3.5, z: 3.5 - (s >> 3) });
export function worldToSq(x, z) {
  const f = Math.floor(x + 4);
  const r = Math.floor(4 - z);
  return sqAt(f, r);
}

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8 = [...ORTHO, ...DIAG];
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const SLIDE_DIRS = { r: ORTHO, b: DIAG, q: ALL8 };

export function newGame(mode = CLASSIC) {
  const board = new Array(64).fill(null);
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  let id = 1;
  for (let f = 0; f < 8; f++) {
    board[sqAt(f, 0)] = { id: id++, type: back[f], color: 'w', moved: false };
    board[sqAt(f, 1)] = { id: id++, type: 'p', color: 'w', moved: false };
    board[sqAt(f, 6)] = { id: id++, type: 'p', color: 'b', moved: false };
    board[sqAt(f, 7)] = { id: id++, type: back[f], color: 'b', moved: false };
  }
  return { board, turn: 'w', mode, ply: 0, quiet: 0, nextId: id, result: null };
}

// Start from a custom position (campaign battles). `placement` is the board part of a FEN,
// rank 8 first, e.g. '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3'. Uppercase = White.
export function fromPlacement(placement, mode = CLASSIC) {
  const st = newGame(mode);
  st.board = new Array(64).fill(null);
  let id = 1;
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error('placement needs 8 ranks');
  ranks.forEach((row, i) => {
    const r = 7 - i;
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += +ch;
        continue;
      }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      const type = ch.toLowerCase();
      const home =
        (type === 'p' && r === (color === 'w' ? 1 : 6)) ||
        (type === 'k' && f === 4 && r === (color === 'w' ? 0 : 7)) ||
        (type === 'r' && (f === 0 || f === 7) && r === (color === 'w' ? 0 : 7));
      st.board[sqAt(f, r)] = { id: id++, type, color, moved: !home };
      f++;
    }
  });
  st.nextId = id;
  return st;
}

export function clone(st) {
  return { ...st, board: st.board.map((p) => (p ? { ...p } : null)) };
}

export function findKing(st, color) {
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (p && p.type === 'k' && p.color === color) return s;
  }
  return -1;
}

// Is a square blocked for movement and lines of fire? (A piece, or a cover crate.)
export const occ = (st, s) => !!st.board[s] || !!(st.cover && st.cover.includes(s));

// Squares a piece may move to. Moves only go to empty squares: captures are done with guns.
export function pseudoMoves(st, from) {
  const p = st.board[from];
  if (!p) return [];
  const out = [];
  const f0 = fileOf(from);
  const r0 = rankOf(from);
  const add = (to, extra) => out.push({ kind: 'move', from, to, ...extra });
  if (p.type === 'p') {
    const dir = p.color === 'w' ? 1 : -1;
    const last = p.color === 'w' ? 7 : 0;
    const one = sqAt(f0, r0 + dir);
    if (one >= 0 && !occ(st, one)) {
      add(one, rankOf(one) === last ? { promo: true } : {});
      const startRank = p.color === 'w' ? 1 : 6;
      const two = sqAt(f0, r0 + 2 * dir);
      if (r0 === startRank && two >= 0 && !occ(st, two)) add(two, { double: true });
    }
  } else if (p.type === 'n' || p.type === 'k') {
    for (const [df, dr] of p.type === 'n' ? KNIGHT : ALL8) {
      const to = sqAt(f0 + df, r0 + dr);
      if (to >= 0 && !occ(st, to)) add(to);
    }
    if (p.type === 'k' && !p.moved) {
      for (const side of ['K', 'Q']) {
        const rookSq = sqAt(side === 'K' ? 7 : 0, r0);
        const rook = st.board[rookSq];
        if (!rook || rook.type !== 'r' || rook.color !== p.color || rook.moved) continue;
        const between = side === 'K' ? [5, 6] : [1, 2, 3];
        if (between.some((f) => occ(st, sqAt(f, r0)))) continue;
        add(sqAt(side === 'K' ? 6 : 2, r0), { castle: side });
      }
    }
  } else {
    for (const [df, dr] of SLIDE_DIRS[p.type]) {
      for (let i = 1; i < 8; i++) {
        const to = sqAt(f0 + df * i, r0 + dr * i);
        if (to < 0 || occ(st, to)) break;
        add(to);
      }
    }
  }
  return out;
}

// Can the gun on `from` reach square `to`? (Geometry only; ignores who stands on `to`.)
export function gunReaches(st, from, to) {
  const p = st.board[from];
  if (!p || from === to) return false;
  const df = fileOf(to) - fileOf(from);
  const dr = rankOf(to) - rankOf(from);
  const adf = Math.abs(df);
  const adr = Math.abs(dr);
  switch (p.type) {
    case 'p': {
      const dir = p.color === 'w' ? 1 : -1;
      if (adf === 1 && dr === dir) return true;
      // Pawn Shotguns: also straight ahead, up to `pawnForward` squares, line clear.
      const fwd = rulesOf(st).pawnForward;
      if (!fwd || df !== 0 || Math.sign(dr) !== dir || adr > fwd) return false;
      for (let i = 1; i < adr; i++) if (occ(st, sqAt(fileOf(from), rankOf(from) + dir * i))) return false;
      return true;
    }
    case 'k': {
      const kr = rulesOf(st).kingRange;
      if (Math.max(adf, adr) === 1) return true;
      // Royal Guard: further along the 8 lines, line clear.
      if (kr < 2 || !(df === 0 || dr === 0 || adf === adr) || Math.max(adf, adr) > kr) return false;
      const n = Math.max(adf, adr);
      for (let i = 1; i < n; i++) if (occ(st, sqAt(fileOf(from) + Math.sign(df) * i, rankOf(from) + Math.sign(dr) * i))) return false;
      return true;
    }
    case 'n':
      return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
    default: {
      const straight = df === 0 || dr === 0;
      const diagonal = adf === adr;
      if (p.type === 'r' && !straight) return false;
      if (p.type === 'b' && !diagonal) return false;
      if (p.type === 'q' && !straight && !diagonal) return false;
      const dist = Math.max(adf, adr);
      if (dist > rulesOf(st).sliderRange) return false;
      const sf = Math.sign(df);
      const sr = Math.sign(dr);
      for (let i = 1; i < dist; i++) if (occ(st, sqAt(fileOf(from) + sf * i, rankOf(from) + sr * i))) return false;
      return true;
    }
  }
}

// Every square this piece's gun covers (empty or not), for drawing its field of fire.
export function gunCoverage(st, from) {
  const out = [];
  for (let s = 0; s < 64; s++) if (gunReaches(st, from, s)) out.push(s);
  return out;
}

export function isTargetable(st, from, to) {
  const a = st.board[from];
  const b = st.board[to];
  if (!a || !b || a.color === b.color) return false;
  if (b.type === 'k' && st.mode === CLASSIC) return false;
  return gunReaches(st, from, to);
}

export function pseudoShots(st, from) {
  const out = [];
  for (let s = 0; s < 64; s++) if (isTargetable(st, from, s)) out.push({ kind: 'shoot', from, to: s });
  return out;
}

export function attackedBy(st, sq, color) {
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (p && p.color === color && gunReaches(st, s, sq)) return true;
  }
  return false;
}

export function inCheck(st, color) {
  const k = findKing(st, color);
  return k >= 0 && attackedBy(st, k, other(color));
}

// Apply an action without judging the result. For a shot, `killSq` is the square actually hit
// (null for a miss or ricochet).
export function applyRaw(st, a, killSq = a.kind === 'shoot' ? a.to : null) {
  const n = clone(st);
  const mover = n.board[a.from];
  let resetQuiet = false;
  // Acting ends your own overwatch; smoke clears after its time is up.
  if (n.overwatch && n.overwatch[st.turn]) n.overwatch = { ...n.overwatch, [st.turn]: null };
  if (n.smoke) n.smoke = n.smoke.filter((c) => c.until > st.ply + 1);
  if (a.kind === 'overwatch' || a.kind === 'smoke') {
    n.used = { ...(n.used || {}), [st.turn + a.kind]: true };
    if (a.kind === 'overwatch') n.overwatch = { ...(n.overwatch || {}), [st.turn]: { id: mover.id } };
    else n.smoke = [...(n.smoke || []), { sq: a.to, until: st.ply + 5 }];
  } else if (a.kind === 'move') {
    n.board[a.from] = null;
    mover.moved = true;
    if (mover.type === 'p') resetQuiet = true;
    if (a.promo) mover.type = a.promoType || 'q';
    n.board[a.to] = mover;
    if (a.castle) {
      const r = rankOf(a.from);
      const rf = sqAt(a.castle === 'K' ? 7 : 0, r);
      const rt = sqAt(a.castle === 'K' ? 5 : 3, r);
      n.board[rt] = n.board[rf];
      n.board[rf] = null;
      n.board[rt].moved = true;
    }
  } else if (killSq != null && n.board[killSq]) {
    const victim = n.board[killSq];
    if (!(victim.type === 'k' && n.mode === CLASSIC)) {
      n.board[killSq] = null;
      resetQuiet = true;
    }
  }
  n.turn = other(st.turn);
  n.ply = st.ply + 1;
  n.quiet = resetQuiet ? 0 : st.quiet + 1;
  return n;
}

function leavesKingSafe(st, a) {
  const after = applyRaw(st, a);
  return !inCheck(after, st.turn);
}

export function legalActions(st, from = null) {
  const out = [];
  const color = st.turn;
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (!p || p.color !== color || (from != null && s !== from)) continue;
    for (const m of pseudoMoves(st, s)) {
      if (m.castle && st.mode === CLASSIC) {
        // Classic: can't castle out of, through, or into check.
        const r = rankOf(s);
        const pass = sqAt(m.castle === 'K' ? 5 : 3, r);
        if (inCheck(st, color) || attackedBy(st, pass, other(color))) continue;
      }
      out.push(m);
    }
    out.push(...pseudoShots(st, s));
    if (st.tactics) out.push(...abilityActions(st, s));
  }
  if (st.mode !== CLASSIC) return out;
  return out.filter((a) => leavesKingSafe(st, a));
}

const onlyKings = (st) => st.board.every((p) => !p || p.type === 'k');

// Decide the game after an action has been applied (st.turn is the side about to play).
export function judge(st) {
  const mover = other(st.turn);
  if (st.mode !== CLASSIC) {
    const wk = findKing(st, 'w') >= 0;
    const bk = findKing(st, 'b') >= 0;
    if (!wk || !bk) {
      const winner = !wk && !bk ? null : wk ? 'w' : 'b';
      const selfKill = winner && winner !== mover;
      return { winner, reason: selfKill ? 'friendly fire killed the king' : 'the king was shot' };
    }
  }
  if (onlyKings(st)) return { winner: null, reason: 'only kings are left' };
  if (st.quiet >= 100) return { winner: null, reason: '50 turns without a kill or a pawn move' };
  if (legalActions(st).length === 0) {
    if (st.mode === CLASSIC && inCheck(st, st.turn)) return { winner: mover, reason: 'checkmate: the king is besieged' };
    return { winner: null, reason: 'stalemate' };
  }
  return null;
}

// --- Ballistics ---------------------------------------------------------------------------

export function piecePos(s) {
  return toWorld(s);
}

export function aimCenter(st, sq) {
  const p = st.board[sq];
  const w = toWorld(sq);
  return { x: w.x, y: p ? DIMS[p.type].h * MUZZLE * 0.95 : 0.3, z: w.z };
}

export function muzzleOf(st, from, aim) {
  const p = st.board[from];
  const d = DIMS[p.type];
  const w = toWorld(from);
  const dx = aim.x - w.x;
  const dz = aim.z - w.z;
  const len = Math.hypot(dx, dz) || 1;
  const off = 0.2 + (p.type === 'r' ? 0.28 : 0.18);
  return { x: w.x + (dx / len) * off, y: d.h * MUZZLE, z: w.z + (dz / len) * off };
}

export function maxTravel(type, st = null) {
  const r = rulesOf(st);
  const reach = {
    ...MAX_REACH,
    p: Math.max(Math.SQRT2, r.pawnForward),
    k: r.kingRange * Math.SQRT2,
    r: r.sliderRange,
    b: r.sliderRange * Math.SQRT2,
    q: r.sliderRange * Math.SQRT2,
  };
  return reach[type] + 0.45;
}

// Gun description for the HUD, reflecting any rule modifiers.
export function weaponText(type, st = null) {
  const r = rulesOf(st);
  const n = r.sliderRange;
  const half = n === SLIDER_RANGE ? ' (half its movement)' : '';
  switch (type) {
    case 'p':
      return r.pawnForward ? `Shotgun: diagonals ahead, plus ${r.pawnForward} squares straight ahead.` : WEAPON_TEXT.p;
    case 'k':
      return r.kingRange > 1 ? `Revolver: ${r.kingRange} squares along every line.` : WEAPON_TEXT.k;
    case 'b':
      return `Rifle: diagonals, up to ${n} squares${half}.`;
    case 'r':
      return `Long rifle: straight lines, up to ${n} squares${half}.`;
    case 'q':
      return `Assault rifle: lines and diagonals, up to ${n} squares${half}.`;
    default:
      return WEAPON_TEXT[type];
  }
}

// Ray vs. upright cylinder (centre cx,cz, radius r, height h). Returns entry distance or Infinity.
function rayCylinder(o, d, cx, cz, r, h) {
  let t0 = -Infinity;
  let t1 = Infinity;
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  const c = ox * ox + oz * oz - r * r;
  if (a < 1e-9) {
    if (c > 0) return Infinity;
  } else {
    const b = 2 * (ox * d.x + oz * d.z);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    t0 = (-b - sq) / (2 * a);
    t1 = (-b + sq) / (2 * a);
  }
  if (Math.abs(d.y) < 1e-9) {
    if (o.y < 0 || o.y > h) return Infinity;
  } else {
    let ya = (0 - o.y) / d.y;
    let yb = (h - o.y) / d.y;
    if (ya > yb) [ya, yb] = [yb, ya];
    t0 = Math.max(t0, ya);
    t1 = Math.min(t1, yb);
  }
  if (t0 > t1 || t1 < 0) return Infinity;
  return Math.max(t0, 0);
}

// Cast a ray against every piece (except `skip`, and squares in `ignore`). Used for bullets and
// for mouse picking (picking ignores enemies hidden by fog).
export function castRay(st, o, d, maxT = Infinity, skip = -1, ignore = null) {
  let best = { t: maxT, sq: null };
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (!p || s === skip || (ignore && ignore.has(s))) continue;
    const w = toWorld(s);
    const dm = DIMS[p.type];
    const t = rayCylinder(o, d, w.x, w.z, dm.r, dm.h);
    if (t < best.t) best = { t, sq: s };
  }
  if (st.cover) {
    for (const c of st.cover) {
      const w = toWorld(c);
      const t = rayBox(o, d, w.x - COVER.half, 0, w.z - COVER.half, w.x + COVER.half, COVER.h, w.z + COVER.half);
      if (t < best.t) best = { t, sq: null, cover: c };
    }
  }
  return best;
}

export const COVER = { half: 0.36, h: 0.62 };
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = Infinity;
  for (const [oo, dd, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return Infinity;
      continue;
    }
    let a = (lo - oo) / dd;
    let b = (hi - oo) / dd;
    if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a);
    tmax = Math.min(tmax, b);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

function gauss(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Fire a bullet from `from` toward `aim` with the gun's wobble. The bullet hits the first thing in
// its path: the target, a piece in between (either colour), the floor, or nothing (out of range).
export function simulateShot(st, from, aim, rng = Math.random, spreadMul = 1) {
  const p = st.board[from];
  const o = muzzleOf(st, from, aim);
  const dx = aim.x - o.x;
  const dy = aim.y - o.y;
  const dz = aim.z - o.z;
  let sigma = SPREAD[p.type] * spreadMul * rulesOf(st).spreadMul;
  const wx = st.weather || null;
  if (wx && wx.rain) sigma *= 1.3;
  if (st.smoke && st.smoke.length && throughSmoke(st, o, aim)) sigma *= 2.6;
  const yaw = Math.atan2(dx, dz) + gauss(rng) * sigma;
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + gauss(rng) * sigma;
  const d = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  if (wx && wx.wind) {
    // Wind pushes the bullet sideways: tilt its heading toward the wind and renormalise.
    d.x += wx.wind.x;
    d.z += wx.wind.z;
    const l = Math.hypot(d.x, d.y, d.z);
    d.x /= l;
    d.y /= l;
    d.z /= l;
  }
  let maxT = maxTravel(p.type, st);
  let ground = false;
  if (d.y < 0) {
    const tg = -o.y / d.y;
    if (tg < maxT) {
      maxT = tg;
      ground = true;
    }
  }
  const hit = castRay(st, o, d, maxT, from);
  const t = hit.sq != null || hit.cover != null ? hit.t : maxT;
  return {
    origin: o,
    dir: d,
    hit: hit.sq,
    cover: hit.cover ?? null,
    end: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t },
    ground: hit.sq == null && hit.cover == null && ground,
  };
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Monte-Carlo chance that a shot aimed at `aim` actually kills the piece on `to`.
export function hitChance(st, from, to, aim = aimCenter(st, to), samples = 240, spreadMul = 1) {
  const rng = mulberry(from * 131 + to * 7 + 1);
  let n = 0;
  for (let i = 0; i < samples; i++) if (simulateShot(st, from, aim, rng, spreadMul).hit === to) n++;
  return n / samples;
}

// --- Fog of War ------------------------------------------------------------------------------

// Squares `color` can see: around each of its pieces, everywhere it could move or shoot, and
// along its lines up to and including the first piece in the way.
export function visibleSquares(st, color) {
  const vis = new Set();
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (!p || p.color !== color) continue;
    const f0 = fileOf(s);
    const r0 = rankOf(s);
    vis.add(s);
    for (const [df, dr] of ALL8) {
      const t = sqAt(f0 + df, r0 + dr);
      if (t >= 0) vis.add(t);
    }
    if (p.type === 'n') {
      for (const [df, dr] of KNIGHT) {
        const t = sqAt(f0 + df, r0 + dr);
        if (t >= 0) vis.add(t);
      }
    } else if (p.type === 'p') {
      const dir = color === 'w' ? 1 : -1;
      for (const df of [-1, 0, 1]) for (const k of [1, 2]) {
        const t = sqAt(f0 + df, r0 + dir * k);
        if (t >= 0 && (df === 0 || k === 1)) vis.add(t);
      }
    } else if (SLIDE_DIRS[p.type]) {
      for (const [df, dr] of SLIDE_DIRS[p.type]) {
        for (let i = 1; i < 8; i++) {
          const t = sqAt(f0 + df * i, r0 + dr * i);
          if (t < 0) break;
          vis.add(t);
          if (occ(st, t)) break;
        }
      }
    }
  }
  return vis;
}

// Enemy-occupied squares hidden from `color` (empty set outside Fog of War).
export function hiddenEnemySquares(st, color) {
  const hidden = new Set();
  if (st.mode !== FOG) return hidden;
  const vis = visibleSquares(st, color);
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (p && p.color !== color && !vis.has(s)) hidden.add(s);
  }
  return hidden;
}

// --- Tactics: once-per-game abilities ---------------------------------------------------------
// Rook OVERWATCH: spend your turn watching; the first enemy that moves into its line of fire gets
// shot at automatically (until your next turn). Bishop SMOKE: throw a grenade onto a square on its
// diagonals within range; bullets through the 3x3 cloud wobble far more, for two turns each side.

export const SMOKE_TURNS = 5; // plies
export function abilityActions(st, from) {
  const p = st.board[from];
  if (!p) return [];
  const used = st.used || {};
  if (p.type === 'r' && !used[p.color + 'overwatch']) return [{ kind: 'overwatch', from, to: from }];
  if (p.type === 'b' && !used[p.color + 'smoke']) {
    const out = [];
    const range = rulesOf(st).sliderRange;
    for (const [df, dr] of DIAG) {
      for (let i = 1; i <= range; i++) {
        const t = sqAt(fileOf(from) + df * i, rankOf(from) + dr * i);
        if (t < 0) break;
        out.push({ kind: 'smoke', from, to: t });
      }
    }
    return out;
  }
  return [];
}
export const smokeAt = (st, s) =>
  !!st.smoke && st.smoke.some((c) => Math.abs(fileOf(c.sq) - fileOf(s)) <= 1 && Math.abs(rankOf(c.sq) - rankOf(s)) <= 1);
function throughSmoke(st, o, aim) {
  for (let i = 1; i <= 12; i++) {
    const k = i / 12;
    const s = worldToSq(o.x + (aim.x - o.x) * k, o.z + (aim.z - o.z) * k);
    if (s >= 0 && smokeAt(st, s)) return true;
  }
  return false;
}
// After `color`'s opponent moves a piece to `sq`: the square of `color`'s overwatching rook that
// fires at it, or -1.
export function overwatchShooter(st, color, sq) {
  const ow = st.overwatch && st.overwatch[color];
  if (!ow) return -1;
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (p && p.id === ow.id) return isTargetable(st, s, sq) ? s : -1;
  }
  return -1;
}
// Resolve an overwatch shot: no turn passes, and the overwatch is spent.
export function applyOverwatch(st, color, killSq) {
  const n = clone(st);
  n.overwatch = { ...(n.overwatch || {}), [color]: null };
  if (killSq != null && n.board[killSq] && !(n.board[killSq].type === 'k' && n.mode === CLASSIC)) n.board[killSq] = null;
  return n;
}

// --- Variants: cover crates and weather -------------------------------------------------------
// Six crates, mirrored between the two halves so neither side is favoured.
export function makeCover(rng = Math.random) {
  const files = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => rng() - 0.5).slice(0, 3);
  const out = [];
  files.forEach((f, i) => {
    const r = 2 + (i % 2); // ranks 3-4 for White's half
    out.push(sqAt(f, r), sqAt(7 - f, 7 - r));
  });
  return out;
}
export function makeWeather(kind, rng = Math.random) {
  if (kind === 'wind') {
    const a = rng() * Math.PI * 2;
    const k = 0.05 + rng() * 0.04;
    return { wind: { x: Math.cos(a) * k, z: Math.sin(a) * k }, kph: Math.round(k * 600) };
  }
  if (kind === 'rain') return { rain: true };
  return null;
}
