// Computer opponent: expectimax search (1-3 plies by difficulty) that knows shots can miss.
import {
  CLASSIC, FOG, DIMS, SPREAD, VALUE, applyRaw, aimCenter, findKing, gunReaches, hitChance, inCheck, hiddenEnemySquares,
  legalActions, other, pseudoShots, rankOf, fileOf, toWorld,
} from './rules.js';

export const AI_SPREAD = 1.12; // default aim wobble multiplier (Soldier)

// Difficulty levels: aim = wobble multiplier on every shot, depth = plies searched,
// blunder = chance of a random action, noise = randomness added to each action's score.
export const DIFFICULTIES = {
  easy: { label: 'Recruit', blurb: 'Shaky aim, short-sighted, makes mistakes.', aim: 1.6, depth: 1, blunder: 0.25, noise: 1.0 },
  normal: { label: 'Soldier', blurb: 'Decent shot. Thinks one reply ahead.', aim: 1.12, depth: 2, blunder: 0, noise: 0.08 },
  hard: { label: 'Sniper', blurb: 'Steady hands. Punishes loose pieces.', aim: 0.92, depth: 2, blunder: 0, noise: 0.02 },
  brutal: { label: 'Warlord', blurb: 'Deadly aim. Plans two moves deep.', aim: 0.8, depth: 3, blunder: 0, noise: 0.01 },
};

const KING_VALUE = 60; // MerciZero only: losing the king loses the game

function pieceValue(st, p) {
  return p.type === 'k' ? (st.mode === CLASSIC ? 0 : KING_VALUE) : VALUE[p.type];
}

// Normal CDF approximation, for quick hit odds deep in the search.
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function approxHit(st, a, aim = AI_SPREAD) {
  const shooter = st.board[a.from];
  const target = st.board[a.to];
  const A = toWorld(a.from);
  const B = toWorld(a.to);
  const dist = Math.max(0.5, Math.hypot(A.x - B.x, A.z - B.z) - 0.3);
  const sig = SPREAD[shooter.type] * aim * (st.rules ? st.rules.spreadMul : 1);
  const dm = DIMS[target.type];
  const wx = Math.atan(dm.r / dist) / sig;
  const wy = Math.atan((dm.h * 0.45) / dist) / sig;
  return (2 * phi(wx) - 1) * (2 * phi(wy) - 1);
}

function evaluate(st, me) {
  let score = 0;
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (!p) continue;
    const sign = p.color === me ? 1 : -1;
    let v = pieceValue(st, p);
    const f = fileOf(s);
    const r = rankOf(s);
    const centre = 3.5 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
    if (p.type === 'p') v += 0.06 * (p.color === 'w' ? r - 1 : 6 - r) ** 1.3;
    if (p.type === 'n' || p.type === 'b') v += 0.06 * centre;
    if (p.type === 'q' || p.type === 'r') v += 0.02 * centre;
    // Threats: each enemy this piece has in its sights is worth a little.
    v += 0.05 * pseudoShots(st, s).length;
    score += sign * v;
  }
  if (st.mode === CLASSIC) {
    if (inCheck(st, other(me))) score += 0.3;
    if (inCheck(st, me)) score -= 0.3;
  } else {
    // MerciZero: keep your own king out of the line of fire.
    const k = findKing(st, me);
    for (let s = 0; s < 64; s++) {
      const p = st.board[s];
      if (p && p.color !== me && k >= 0 && gunReaches(st, s, k)) score -= 4;
    }
  }
  return score;
}

const passTurn = (st) => ({ ...st, turn: other(st.turn), ply: st.ply + 1, quiet: st.quiet + 1 });

function terminalValue(st, me) {
  if (st.mode !== CLASSIC) {
    if (findKing(st, me) < 0) return -1000;
    if (findKing(st, other(me)) < 0) return 1000;
  }
  return null;
}

// Best outcome for the side to move in `st`, judged from `me`'s point of view (they minimise it).
function replyValue(st, me, aim = AI_SPREAD) {
  const term = terminalValue(st, me);
  if (term != null) return term;
  const acts = legalActions(st);
  if (acts.length === 0) {
    if (st.mode === CLASSIC && inCheck(st, st.turn)) return 1000; // we delivered mate
    return 0;
  }
  const base = evaluate(st, me);
  let worst = Infinity;
  for (const b of acts) {
    let v;
    if (b.kind === 'move') {
      v = evaluate(applyRaw(st, b), me);
    } else {
      const hit = applyRaw(st, b);
      const tv = terminalValue(hit, me);
      const p = approxHit(st, b, aim);
      v = p * (tv != null ? tv : evaluate(hit, me)) + (1 - p) * base;
    }
    if (v < worst) worst = v;
  }
  return worst;
}

// Expected score (for `me`) of taking action `a` in `st`, judged right after it.
function oneply(st, a, me, aim) {
  if (a.kind === 'move') return evaluate(applyRaw(st, a.promo ? { ...a, promoType: 'q' } : a), me);
  const hit = applyRaw(st, a);
  const tv = terminalValue(hit, me);
  const p = approxHit(st, a, aim);
  return p * (tv != null ? tv : evaluate(hit, me)) + (1 - p) * evaluate(passTurn(st), me);
}

// Best 1-ply outcome for `me` when it's `me` to move in `st`.
function myBest(st, me, aim) {
  const term = terminalValue(st, me);
  if (term != null) return term;
  const acts = legalActions(st);
  if (acts.length === 0) return st.mode === CLASSIC && inCheck(st, me) ? -1000 : 0;
  let best = -Infinity;
  for (const a of acts) best = Math.max(best, oneply(st, a, me, aim));
  return best;
}

// Three-ply: the opponent replies (we look at their most dangerous replies), then we answer.
function replyValueDeep(st, me, aim, width = 6) {
  const term = terminalValue(st, me);
  if (term != null) return term;
  const acts = legalActions(st);
  if (acts.length === 0) return st.mode === CLASSIC && inCheck(st, st.turn) ? 1000 : 0;
  const scored = acts.map((b) => ({ b, v: oneply(st, b, me, aim) })).sort((x, y) => x.v - y.v).slice(0, width);
  let worst = Infinity;
  for (const { b } of scored) {
    let v;
    if (b.kind === 'move') v = myBest(applyRaw(st, b.promo ? { ...b, promoType: 'q' } : b), me, aim);
    else {
      const p = approxHit(st, b, aim);
      v = p * myBest(applyRaw(st, b), me, aim) + (1 - p) * myBest(passTurn(st), me, aim);
    }
    worst = Math.min(worst, v);
  }
  return worst;
}

// `level` is a difficulty key or a config object shaped like DIFFICULTIES entries (campaign).
export function chooseAction(st, level = 'normal', rng = Math.random) {
  const cfg = typeof level === 'object' ? level : DIFFICULTIES[level] || DIFFICULTIES.normal;
  const me = st.turn;
  let acts = legalActions(st);
  if (st.mode === FOG) {
    // Fog of War: the computer can only shoot at pieces it can see.
    const hidden = hiddenEnemySquares(st, me);
    acts = acts.filter((a) => a.kind !== 'shoot' || !hidden.has(a.to));
  }
  if (!acts.length) return null;
  const promote = (a) => (a.promo ? { ...a, promoType: 'q' } : a);
  if (rng() < cfg.blunder) return promote(acts[Math.floor(rng() * acts.length)]);

  const reply = cfg.depth >= 3 ? (s) => replyValueDeep(s, me, cfg.aim) : (s) => replyValue(s, me, cfg.aim);
  let scored;
  if (cfg.depth >= 3) {
    // Only search the most promising root actions deeply.
    scored = acts.map((a) => ({ a, v: oneply(st, a, me, cfg.aim) })).sort((x, y) => y.v - x.v).slice(0, 12);
  } else scored = acts.map((a) => ({ a }));

  let best = null;
  let bestV = -Infinity;
  for (const { a } of scored) {
    let v;
    if (cfg.depth === 1) v = oneply(st, a, me, cfg.aim);
    else if (a.kind === 'move') v = reply(applyRaw(st, promote(a)));
    else {
      const p = hitChance(st, a.from, a.to, aimCenter(st, a.to), 48, cfg.aim);
      v = p * reply(applyRaw(st, a)) + (1 - p) * reply(passTurn(st));
    }
    v += rng() * cfg.noise;
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  return promote(best);
}
