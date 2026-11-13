// Puzzle library: packs, goals, the puzzle of the week, and shareable puzzle codes.
import { MERCIZERO, FOG, CLASSIC, NAMES, sqAt, fromPlacement, findKing } from './rules.js';
import { PUZZLE_DATA } from './puzzle-data.js';

export const PACKS = [
  { id: 'basic', name: 'Basic Training', icon: '🎯', blurb: 'Find the one piece that can shoot the king. Sure-shot: shots never miss.' },
  { id: 'two', name: 'Two-Movers', icon: '♞', blurb: 'Set up, then fire. Shots never miss, and the enemy defends perfectly.' },
  { id: 'trick', name: 'Trick Shots', icon: '📦', blurb: 'A crate blocks the straight shot. Look through the shooter and click the exact spot: aim high or at the edge.' },
  { id: 'survive', name: 'Survival', icon: '🛡️', blurb: 'Your king is in the line of fire. Stay alive for 2 enemy turns.' },
  { id: 'odds', name: 'Odds', icon: '🎲', blurb: 'Shots can miss here. Take the shot with the best chance: hover each one to compare.' },
  { id: 'rescue', name: 'Rescue', icon: '⭐', blurb: 'Get a pawn to the last rank within 2 turns, under fire.' },
  { id: 'fog', name: 'Fog', icon: '🌫️', blurb: 'You can’t see the king. Scout with your moves, then shoot.' },
];

// Hand-made Fog of War puzzles (normal wobble, so shots can miss).
const FOG_PUZZLES = [
  { id: 'fog-1', pack: 'fog', placement: '6k1/5ppp/8/8/8/8/5PPP/3R2K1', mode: FOG, sure: false, ai: 'easy', goal: { type: 'king', n: 8 }, hint: { from: 'd1', to: 'd7' } },
  { id: 'fog-2', pack: 'fog', placement: 'k7/pp6/8/8/8/8/6PP/2Q3K1', mode: FOG, sure: false, ai: 'easy', goal: { type: 'king', n: 8 }, hint: { from: 'c1', to: 'c6' } },
  { id: 'fog-3', pack: 'fog', placement: '7k/6pp/8/8/8/8/PPN5/1K1R4', mode: FOG, sure: false, ai: 'easy', goal: { type: 'king', n: 10 }, hint: { from: 'd1', to: 'd7' } },
  { id: 'fog-4', pack: 'fog', placement: '3k4/2ppp3/8/8/8/8/3PP3/2BRK3', mode: FOG, sure: false, ai: 'easy', goal: { type: 'king', n: 12 }, hint: { from: 'c1', to: 'g5' } },
];

export const LIBRARY = [...PUZZLE_DATA.filter((p) => p.pack !== 'weekly'), ...FOG_PUZZLES];
export const WEEKLY_POOL = PUZZLE_DATA.filter((p) => p.pack === 'weekly');
export const WEEKLY_PUZZLE_XP = 200;
export const LIB_XP = { 1: 40, 2: 20, 3: 20 }; // per new star
export const HINT_COST = 25;

export const parseSq = (n) => sqAt('abcdefgh'.indexOf(n[0]), +n[1] - 1);

export function goalText(goal, st = null) {
  const n = goal.n;
  switch (goal.type) {
    case 'kill': {
      const t = st && st.board[parseSq(goal.target)];
      return `Kill the ${t ? NAMES[t.type].toLowerCase() : 'piece'} on ${goal.target} with one shot.`;
    }
    case 'survive':
      return `Survive ${n} enemy turn${n > 1 ? 's' : ''}.`;
    case 'promote':
      return `Promote a pawn within ${n} turn${n > 1 ? 's' : ''}.`;
    case 'odds':
      return 'Take the shot with the best hit chance.';
    default:
      return n === 1 ? 'Shoot the king this turn.' : `Shoot the king within ${n} turns.`;
  }
}

// A library puzzle (or a decoded code) as a playable battle for startGame().
export function puzzleToBattle(p, kind = 'library') {
  const pack = PACKS.find((x) => x.id === p.pack);
  const num = LIBRARY.filter((x) => x.pack === p.pack).indexOf(p) + 1;
  return {
    kind,
    id: p.id,
    puzzle: p,
    name: p.title || (pack ? `${pack.name} ${num}` : 'Custom puzzle'),
    foe: 'Puzzle',
    mode: p.mode,
    ai: p.ai || 'normal',
    placement: p.placement,
    sure: !!p.sure,
    cover: p.cover ? p.cover.map(parseSq) : null,
    goal: p.goal,
    hint: p.hint || null,
    turnLimit: p.goal.type === 'survive' ? 0 : p.goal.n,
    blurb: goalText(p.goal),
  };
}

export function weeklyPuzzle(week) {
  let h = 2166136261;
  for (const ch of 'wp' + week) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const p = WEEKLY_POOL[(h >>> 0) % WEEKLY_POOL.length];
  return { ...p, title: 'Puzzle of the week' };
}

// --- Share codes ---------------------------------------------------------------------------------
// GM1-<base64url(JSON)>: placement, mode, sure-shot, cover, goal, AI, title.
export function encodePuzzle(p) {
  const j = JSON.stringify({ v: 1, p: p.placement, m: p.mode, s: p.sure ? 1 : 0, c: p.cover || [], g: p.goal, a: p.ai || 'normal', t: p.title || '' });
  const b = btoa(unescape(encodeURIComponent(j))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'GM1-' + b;
}
export function decodePuzzle(code) {
  const m = String(code).trim().match(/^GM1-([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('That isn’t a Gunmate puzzle code (they start with GM1-).');
  let o;
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    o = JSON.parse(decodeURIComponent(escape(atob(b + '='.repeat((4 - (b.length % 4)) % 4)))));
  } catch {
    throw new Error('The code is damaged. Check you copied all of it.');
  }
  const modes = [CLASSIC, MERCIZERO, FOG];
  if (!modes.includes(o.m)) throw new Error('Unknown mode in code.');
  const goalTypes = ['king', 'kill', 'survive', 'promote'];
  if (!o.g || !goalTypes.includes(o.g.type) || !(o.g.n >= 1 && o.g.n <= 30)) throw new Error('Unknown goal in code.');
  if (!['easy', 'normal', 'hard', 'brutal'].includes(o.a)) throw new Error('Unknown opponent in code.');
  let st;
  try {
    st = fromPlacement(o.p, o.m);
  } catch {
    throw new Error('The board in this code is invalid.');
  }
  if (findKing(st, 'w') < 0 || findKing(st, 'b') < 0) throw new Error('Both sides need a king.');
  if (o.g.type === 'kill' && !(o.g.target && /^[a-h][1-8]$/.test(o.g.target) && st.board[parseSq(o.g.target)])) throw new Error('The target square is empty.');
  const cover = (o.c || []).filter((n) => /^[a-h][1-8]$/.test(n));
  return { id: 'code', pack: null, placement: o.p, mode: o.m, sure: !!o.s, cover, goal: o.g, ai: o.a, title: String(o.t || 'Custom puzzle').slice(0, 40) };
}
