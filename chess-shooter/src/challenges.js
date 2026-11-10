// Challenges: the daily puzzle, the weekly rule-bending challenge and the gauntlet. Pure data plus
// small generators; the game plays them through the same path as campaign battles.
import { CLASSIC, MERCIZERO, DEFAULT_RULES } from './rules.js';

// --- Daily puzzle ------------------------------------------------------------------------------
// A short position with a deadline: win within `turnLimit` of your turns. One per day.
export const PUZZLES = [
  { id: 'pz1', name: 'Open Season', mode: MERCIZERO, ai: 'easy', turnLimit: 6, placement: 'k7/pp6/8/8/8/8/5PPP/3Q2K1',
    blurb: 'The king is boxed in by its own pawns. Bring the queen within 4 squares on a clear line.' },
  { id: 'pz2', name: 'Rook Roller', mode: MERCIZERO, ai: 'easy', turnLimit: 8, placement: 'k7/8/8/8/8/8/8/R3K2R',
    blurb: 'Two rooks against a bare king. Cut off the files and shoot.' },
  { id: 'pz3', name: 'Cavalry Hunt', mode: MERCIZERO, ai: 'easy', turnLimit: 9, placement: 'r3k3/8/8/8/8/8/8/1N2K1N1',
    blurb: 'Two knights against a king and rook. Their carbines don’t care about walls.' },
  { id: 'pz4', name: 'Behind the Wall', mode: MERCIZERO, ai: 'easy', turnLimit: 6, placement: 'k7/ppp5/8/8/8/8/8/2B1KQ2',
    blurb: 'The king hides behind three pawns. Open a line with the bishop and queen.' },
  { id: 'pz5', name: 'Bodyguards', mode: MERCIZERO, ai: 'easy', turnLimit: 6, placement: 'kn6/n7/8/8/8/8/8/Q3K2R',
    blurb: 'Two knights guard the king. Clear them, then take the shot.' },
  { id: 'pz6', name: 'Sniper Duel', mode: MERCIZERO, ai: 'easy', turnLimit: 9, placement: '4k3/4r3/8/8/8/8/4R3/4K3',
    blurb: 'Rook against rook on an open file. Who blinks first?' },
  { id: 'pz7', name: 'Siege Drill', mode: CLASSIC, ai: 'easy', turnLimit: 10, placement: 'k7/8/1K6/8/8/8/8/7R',
    blurb: 'Classic rules: kings can’t be shot. Checkmate with king and rook.' },
  { id: 'pz8', name: 'Queen’s Gambit', mode: MERCIZERO, ai: 'easy', turnLimit: 7, placement: '3qk3/8/8/8/8/8/3Q4/4K3',
    blurb: 'Queen against queen. Shoot first, or move out of her sights.' },
];
export const PUZZLE_XP = 120;

// --- Weekly challenge ---------------------------------------------------------------------------
// One rule twist per week, played as MerciZero against Soldier. First win of the week pays big.
export const WEEKLY_RULES = [
  { id: 'long-guns', name: 'Long Guns', desc: 'Rooks, bishops and queens shoot their full movement, not half.', rules: { sliderRange: 7 } },
  { id: 'steady', name: 'Steady Hands', desc: 'Every gun wobbles half as much. Long shots land.', rules: { spreadMul: 0.5 } },
  { id: 'shell-shock', name: 'Shell Shock', desc: 'Every gun wobbles 60% more. Get close.', rules: { spreadMul: 1.6 } },
  { id: 'shotguns', name: 'Pawn Shotguns', desc: 'Pawns also shoot up to 2 squares straight ahead.', rules: { pawnForward: 2 } },
  { id: 'royal-guard', name: 'Royal Guard', desc: 'Kings shoot up to 2 squares along every line.', rules: { kingRange: 2 } },
  { id: 'close-quarters', name: 'Close Quarters', desc: 'Rooks, bishops and queens shoot only 2 squares.', rules: { sliderRange: 2 } },
];
export const WEEKLY_XP = 300;

// Monday-based week key, e.g. '2026-11-09' for the week starting Monday 9 Nov.
export function weekKey(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}
function hashIndex(str, n) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % n;
}
export const puzzleFor = (dayKey) => PUZZLES[hashIndex('pz' + dayKey, PUZZLES.length)];
export const weeklyFor = (wk) => WEEKLY_RULES[hashIndex('wk' + wk, WEEKLY_RULES.length)];

export function weeklyBattle(wk) {
  const w = weeklyFor(wk);
  return {
    kind: 'weekly', id: `weekly-${wk}`, name: `Weekly: ${w.name}`, foe: 'Soldier', mode: MERCIZERO, ai: 'normal',
    placement: STD, rules: { ...DEFAULT_RULES, ...w.rules }, blurb: w.desc, week: wk,
  };
}
export function puzzleBattle(day) {
  const p = puzzleFor(day);
  return { ...p, kind: 'puzzle', foe: 'Puzzle', day, name: `Puzzle: ${p.name}` };
}

// --- Gauntlet -----------------------------------------------------------------------------------
// Beat all four computer levels in a row. Pieces you lose stay lost for the next round.
export const GAUNTLET = [
  { ai: 'easy', foe: 'Recruit' },
  { ai: 'normal', foe: 'Soldier' },
  { ai: 'hard', foe: 'Sniper' },
  { ai: 'brutal', foe: 'Warlord' },
];
export const GAUNTLET_XP = [80, 150, 250, 400];
const STD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

// Standard position with White's lost pieces removed (outer pieces first, so the king keeps cover).
export function gauntletPlacement(lost) {
  const rows = STD.split('/').map((r) => r.replace(/\d/g, (n) => '.'.repeat(+n)).split(''));
  const order = { p: [6, 'abcdefgh'], n: [7, 'bg'], b: [7, 'cf'], r: [7, 'ah'], q: [7, 'd'] };
  for (const t of lost) {
    const [row, files] = order[t] || [];
    if (row == null) continue;
    // Pawns: take them from the edges inwards.
    const fs = t === 'p' ? ['a', 'h', 'b', 'g', 'c', 'f', 'd', 'e'] : files.split('');
    for (const f of fs) {
      const i = 'abcdefgh'.indexOf(f);
      if (rows[row][i] === t.toUpperCase()) {
        rows[row][i] = '.';
        break;
      }
    }
  }
  return rows.map((r) => r.join('').replace(/\.+/g, (m) => String(m.length))).join('/');
}
export function gauntletBattle(round, lost) {
  const g = GAUNTLET[round];
  return {
    kind: 'gauntlet', id: `gauntlet-${round}`, round, lost: [...lost], name: `Gauntlet · Round ${round + 1}`, foe: g.foe,
    mode: MERCIZERO, ai: g.ai, placement: gauntletPlacement(lost),
    blurb: lost.length ? `You carry ${lost.length} lost piece${lost.length > 1 ? 's' : ''} into this round.` : 'Full army. Make it last.',
  };
}
