// Computer opponent: a two-ply expectimax that knows shots can miss.
import {
  CLASSIC, DIMS, SPREAD, VALUE, applyRaw, aimCenter, findKing, gunReaches, hitChance, inCheck,
  legalActions, other, pseudoShots, rankOf, fileOf, toWorld,
} from './rules.js';

export const AI_SPREAD = 1.12; // the computer aims a little worse than a steady hand

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
function approxHit(st, a) {
  const shooter = st.board[a.from];
  const target = st.board[a.to];
  const A = toWorld(a.from);
  const B = toWorld(a.to);
  const dist = Math.max(0.5, Math.hypot(A.x - B.x, A.z - B.z) - 0.3);
  const sig = SPREAD[shooter.type] * AI_SPREAD;
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
function replyValue(st, me) {
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
      const p = approxHit(st, b);
      v = p * (tv != null ? tv : evaluate(hit, me)) + (1 - p) * base;
    }
    if (v < worst) worst = v;
  }
  return worst;
}

export function chooseAction(st, rng = Math.random) {
  const me = st.turn;
  const acts = legalActions(st);
  let best = null;
  let bestV = -Infinity;
  for (const a of acts) {
    let v;
    if (a.kind === 'move') {
      const m = a.promo ? { ...a, promoType: 'q' } : a;
      v = replyValue(applyRaw(st, m), me);
    } else {
      const p = hitChance(st, a.from, a.to, aimCenter(st, a.to), 48, AI_SPREAD);
      v = p * replyValue(applyRaw(st, a), me) + (1 - p) * replyValue(passTurn(st), me);
    }
    v += rng() * 0.08;
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  if (best && best.promo) best = { ...best, promoType: 'q' };
  return best;
}
