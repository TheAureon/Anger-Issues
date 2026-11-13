// Puzzle generator: random positions, kept only when a search proves the puzzle works.
// "Sure-shot" puzzles use spread 0, so every shot goes exactly where it is aimed and the game tree
// is deterministic. Used offline (scripts/gen-puzzles.mjs bakes the library) and live (Puzzle Rush).
import * as R from './rules.js';

export const SURE_RULES = { ...R.DEFAULT_RULES, spreadMul: 0 };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export function makeState(placement, mode, sure) {
  const st = R.fromPlacement(placement, mode);
  if (sure) st.rules = { ...SURE_RULES };
  return st;
}

export function toPlacement(st) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let gap = 0;
    for (let f = 0; f < 8; f++) {
      const p = st.board[R.sqAt(f, r)];
      if (!p) {
        gap++;
        continue;
      }
      if (gap) row += gap;
      gap = 0;
      row += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    if (gap) row += gap;
    rows.push(row);
  }
  return rows.join('/');
}

// Apply an action with a deterministic shot (aimed at the target's centre).
export function detApply(st, a) {
  if (a.kind === 'shoot') {
    const res = R.simulateShot(st, a.from, R.aimCenter(st, a.to), Math.random, 1);
    return R.applyRaw(st, a, res.hit);
  }
  return R.applyRaw(st, a.promo ? { ...a, promoType: 'q' } : a);
}

// A white shot that kills the black king right now (sure-shot), or null.
export function kingShotNow(st) {
  const k = R.findKing(st, 'b');
  if (k < 0) return null;
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (!p || p.color !== 'w' || !R.isTargetable(st, s, k)) continue;
    const a = { kind: 'shoot', from: s, to: k };
    if (R.findKing(detApply(st, a), 'b') < 0) return a;
  }
  return null;
}

const whiteAlive = (st) => R.findKing(st, 'w') >= 0;

// White to move: a first action that forces a king kill on the next turn, whatever Black does.
export function forcedKingIn2(st) {
  if (kingShotNow(st)) return null;
  for (const a of R.legalActions(st)) {
    const s1 = detApply(st, a);
    if (R.findKing(s1, 'b') < 0) continue;
    let ok = true;
    for (const b of R.legalActions(s1)) {
      const s2 = detApply(s1, b);
      if (!whiteAlive(s2) || !kingShotNow(s2)) {
        ok = false;
        break;
      }
    }
    if (ok) return a;
  }
  return null;
}

// White to move: survive `n` black turns? Returns a first action that guarantees it (or null),
// and how many first actions fail.
function survives(st, n) {
  if (!whiteAlive(st)) return false;
  if (R.findKing(st, 'b') < 0) return true;
  if (n === 0) return true;
  for (const a of R.legalActions(st)) {
    const s1 = detApply(st, a);
    if (R.findKing(s1, 'b') < 0) return true;
    let ok = true;
    for (const b of R.legalActions(s1)) {
      if (!survives(detApply(s1, b), n - 1)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
export function survivalSolution(st, n = 2) {
  let good = null;
  let bad = 0;
  const acts = R.legalActions(st);
  for (const a of acts) {
    const s1 = detApply(st, a);
    let ok = whiteAlive(s1);
    if (ok && R.findKing(s1, 'b') >= 0) {
      for (const b of R.legalActions(s1)) {
        if (!survives(detApply(s1, b), n - 1)) {
          ok = false;
          break;
        }
      }
    }
    if (ok && !good) good = a;
    if (!ok) bad++;
  }
  return { good, bad, total: acts.length };
}

// Rescue: promote a pawn within two of your turns, whatever Black does.
export function forcedPromotionIn2(st) {
  const promoNow = (s) => R.legalActions(s).find((a) => a.kind === 'move' && a.promo);
  if (promoNow(st)) return null;
  for (const a of R.legalActions(st)) {
    const s1 = detApply(st, a);
    let ok = true;
    for (const b of R.legalActions(s1)) {
      const s2 = detApply(s1, b);
      if (!whiteAlive(s2) || !promoNow(s2)) {
        ok = false;
        break;
      }
    }
    if (ok) return a;
  }
  return null;
}

// Aim points spread over the side of a piece facing the shooter.
export function aimGrid(st, from, to) {
  const p = st.board[to];
  const d = R.DIMS[p.type];
  const A = R.toWorld(from);
  const B = R.toWorld(to);
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const len = Math.hypot(dx, dz);
  const ux = -dz / len;
  const uz = dx / len;
  const out = [];
  for (let i = -3; i <= 3; i++) {
    for (let j = 1; j <= 5; j++) {
      const u = (i / 3) * d.r * 0.9;
      out.push({ x: B.x + ux * u - (dx / len) * d.r * 0.5, y: (j / 6) * d.h, z: B.z + uz * u - (dz / len) * d.r * 0.5 });
    }
  }
  return out;
}
export function aimWindow(st, from, to) {
  const pts = aimGrid(st, from, to);
  const ok = pts.filter((pt) => R.simulateShot(st, from, pt, Math.random, 1).hit === to);
  return { frac: ok.length / pts.length, best: ok[Math.floor(ok.length / 2)] || null };
}

// --- Random positions ---------------------------------------------------------------------------

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function emptySquare(st, rng, test = () => true) {
  for (let i = 0; i < 200; i++) {
    const s = Math.floor(rng() * 64);
    if (!st.board[s] && test(s)) return s;
  }
  return -1;
}
const near = (a, b) => Math.max(Math.abs(R.fileOf(a) - R.fileOf(b)), Math.abs(R.rankOf(a) - R.rankOf(b))) <= 1;
function place(st, rng, color, type, test = () => true) {
  const s = emptySquare(st, rng, (q) => {
    const r = R.rankOf(q);
    if (type === 'p' && (r === 0 || r === 7)) return false;
    return test(q);
  });
  if (s < 0) return -1;
  st.board[s] = { id: st.nextId++, type, color, moved: true };
  return s;
}
export function randomPosition(rng, white, black, mode = R.MERCIZERO, sure = true) {
  const st = R.newGame(mode);
  st.board = new Array(64).fill(null);
  st.nextId = 1;
  if (sure) st.rules = { ...SURE_RULES };
  const wk = place(st, rng, 'w', 'k', (q) => R.rankOf(q) <= 2);
  place(st, rng, 'b', 'k', (q) => R.rankOf(q) >= 4 && !near(q, wk));
  for (const t of white) place(st, rng, 'w', t);
  for (const t of black) place(st, rng, 'b', t);
  return st;
}

// --- Generators ---------------------------------------------------------------------------------

const someOf = (rng, pool, n) => Array.from({ length: n }, () => pick(rng, pool));

// "Find the shooter": exactly one of your pieces can shoot the king this turn.
export function genDrill(rng) {
  for (let tries = 0; tries < 400; tries++) {
    const st = randomPosition(rng, someOf(rng, ['q', 'r', 'b', 'n', 'p', 'p'], 4 + Math.floor(rng() * 2)), someOf(rng, ['p', 'n', 'b', 'r'], 2 + Math.floor(rng() * 3)));
    const k = R.findKing(st, 'b');
    const shooters = [];
    for (let s = 0; s < 64; s++) if (st.board[s] && st.board[s].color === 'w' && R.isTargetable(st, s, k)) shooters.push(s);
    if (shooters.length !== 1) continue;
    const a = kingShotNow(st);
    if (!a) continue;
    return { st, solution: a };
  }
  return null;
}

// "Shoot the most valuable piece": several targets, one clearly worth the most.
export function genBestTarget(rng) {
  for (let tries = 0; tries < 400; tries++) {
    const st = randomPosition(rng, someOf(rng, ['q', 'r', 'b', 'n', 'p'], 4), someOf(rng, ['p', 'n', 'b', 'r', 'q'], 4));
    const k = R.findKing(st, 'b');
    let king = false;
    const targets = new Map();
    for (let s = 0; s < 64; s++) {
      const p = st.board[s];
      if (!p || p.color !== 'w') continue;
      for (let t = 0; t < 64; t++) {
        if (!R.isTargetable(st, s, t)) continue;
        if (t === k) king = true;
        const res = R.simulateShot(st, s, R.aimCenter(st, t), Math.random, 1);
        if (res.hit === t) targets.set(t, s);
      }
    }
    if (king || targets.size < 2) continue;
    const vals = [...targets.keys()].map((t) => VALUE[st.board[t].type]).sort((a, b) => b - a);
    if (vals[0] === vals[1]) continue;
    const best = [...targets.keys()].find((t) => VALUE[st.board[t].type] === vals[0]);
    return { st, solution: { kind: 'shoot', from: targets.get(best), to: best }, target: best };
  }
  return null;
}

export function genTwoMover(rng, big = false) {
  for (let tries = 0; tries < 300; tries++) {
    const st = randomPosition(rng, someOf(rng, ['q', 'r', 'b', 'n', 'p'], big ? 4 : 3), someOf(rng, ['p', 'n', 'b', 'r'], big ? 4 : 2));
    if (R.legalActions(st).length > 45) continue;
    const a = forcedKingIn2(st);
    if (a) return { st, solution: a };
  }
  return null;
}

// Trick shot: one knight (or pawn) shot past blockers; aiming at the centre fails, but a careful
// aim at the right part of the target lands.
export function genTrickShot(rng) {
  for (let tries = 0; tries < 2000; tries++) {
    const st = R.newGame(R.MERCIZERO);
    st.board = new Array(64).fill(null);
    st.nextId = 1;
    st.rules = { ...SURE_RULES };
    const ks = R.sqAt(Math.floor(rng() * 8), 0);
    st.board[ks] = { id: st.nextId++, type: 'k', color: 'w', moved: true };
    const from = R.sqAt(1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 3));
    if (st.board[from]) continue;
    st.board[from] = { id: st.nextId++, type: 'n', color: 'w', moved: true };
    const [df, dr] = pick(rng, [[1, 2], [-1, 2], [2, 1], [-2, 1]]);
    const to = R.sqAt(R.fileOf(from) + df, R.rankOf(from) + dr);
    if (to < 0 || st.board[to]) continue;
    st.board[to] = { id: st.nextId++, type: pick(rng, ['r', 'q', 'b']), color: 'b', moved: true };
    // Blockers on the squares the bullet passes near.
    const mids = [R.sqAt(R.fileOf(from) + Math.sign(df) * (Math.abs(df) === 2 ? 1 : 0), R.rankOf(from) + Math.sign(dr) * (Math.abs(dr) === 2 ? 1 : 0)),
      R.sqAt(R.fileOf(from) + (Math.abs(df) === 2 ? Math.sign(df) : df), R.rankOf(from) + (Math.abs(dr) === 2 ? Math.sign(dr) : dr))];
    // A crate on one square the bullet passes, sometimes a piece on the other: a crate's corner reaches
    // into the bullet's path, a round piece doesn't.
    st.cover = [];
    const order = rng() < 0.5 ? mids : [...mids].reverse();
    if (order[0] >= 0 && !st.board[order[0]]) st.cover.push(order[0]);
    if (order[1] >= 0 && !st.board[order[1]] && rng() < 0.5) {
      if (rng() < 0.5) st.cover.push(order[1]);
      else st.board[order[1]] = { id: st.nextId++, type: pick(rng, ['p', 'n', 'b']), color: rng() < 0.5 ? 'w' : 'b', moved: true };
    }
    if (!st.cover.length) continue;
    place(st, rng, 'b', 'k', (q) => R.rankOf(q) >= 6);
    if (R.findKing(st, 'b') < 0) continue;
    const centre = R.simulateShot(st, from, R.aimCenter(st, to), Math.random, 1);
    if (centre.hit === to) continue;
    const win = aimWindow(st, from, to);
    if (win.frac < 0.08 || win.frac > 0.55) continue;
    return { st, solution: { kind: 'shoot', from, to }, target: to, aim: win.best, window: win.frac };
  }
  return null;
}

// Odds: several shots, one with clearly the best chance (normal wobble).
export function genOdds(rng) {
  for (let tries = 0; tries < 300; tries++) {
    const st = randomPosition(rng, someOf(rng, ['q', 'r', 'b', 'n', 'p'], 4), someOf(rng, ['p', 'n', 'b', 'r', 'q'], 4), R.MERCIZERO, false);
    const k = R.findKing(st, 'b');
    const shots = [];
    for (let s = 0; s < 64; s++) {
      const p = st.board[s];
      if (!p || p.color !== 'w') continue;
      for (let t = 0; t < 64; t++) if (t !== k && R.isTargetable(st, s, t)) shots.push({ from: s, to: t, chance: R.hitChance(st, s, t, R.aimCenter(st, t), 160) });
    }
    if (shots.length < 3 || [...Array(64).keys()].some((s) => st.board[s] && st.board[s].color === 'w' && R.isTargetable(st, s, k))) continue;
    shots.sort((a, b) => b.chance - a.chance);
    if (shots[0].chance - shots[1].chance < 0.12 || shots[0].chance > 0.97) continue;
    return { st, solution: { kind: 'shoot', from: shots[0].from, to: shots[0].to }, best: shots[0].chance };
  }
  return null;
}

export function genSurvival(rng) {
  for (let tries = 0; tries < 400; tries++) {
    const st = randomPosition(rng, someOf(rng, ['r', 'b', 'n', 'p'], 2), someOf(rng, ['q', 'r', 'b', 'n'], 2 + Math.floor(rng() * 2)));
    const wk = R.findKing(st, 'w');
    if (!R.attackedBy(st, wk, 'b')) continue; // the king starts in the line of fire
    if (R.legalActions(st).length > 24) continue;
    const r = survivalSolution(st, 2);
    if (r.good && r.bad >= r.total * 0.4) return { st, solution: r.good };
  }
  return null;
}

export function genRescue(rng) {
  for (let tries = 0; tries < 600; tries++) {
    const st = randomPosition(rng, someOf(rng, ['r', 'b', 'n'], 1 + Math.floor(rng() * 2)), someOf(rng, ['r', 'b', 'n', 'q'], 1 + Math.floor(rng() * 2)));
    const f = Math.floor(rng() * 8);
    const s = R.sqAt(f, 5);
    if (st.board[s] || st.board[R.sqAt(f, 6)] || st.board[R.sqAt(f, 7)]) continue;
    st.board[s] = { id: st.nextId++, type: 'p', color: 'w', moved: true };
    // The pawn must be in danger: at least one enemy gun on it or its path.
    if (!R.attackedBy(st, s, 'b') && !R.attackedBy(st, R.sqAt(f, 6), 'b')) continue;
    if (R.legalActions(st).length > 30) continue;
    const a = forcedPromotionIn2(st);
    if (a) return { st, solution: a };
  }
  return null;
}
