// Sanity checks for chess-shooter rules + AI: node scripts/test-chess-shooter.mjs
import * as R from '../chess-shooter/src/rules.js';
import { chooseAction } from '../chess-shooter/src/ai.js';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const at = (n) => R.sqAt('abcdefgh'.indexOf(n[0]), +n[1] - 1);
let st = R.newGame(R.CLASSIC);
ok(R.legalActions(st).length === 20, 'opening has 20 moves, no shots');
// Pawn shot range
st = R.newGame(R.CLASSIC);
st.board[at('d3')] = { id: 99, type: 'p', color: 'b', moved: true };
ok(R.isTargetable(st, at('e2'), at('d3')), 'pawn can shoot diagonal');
ok(!R.isTargetable(st, at('d2'), at('d3')), 'pawn cannot shoot forward');
// Rook range 4
st = { ...R.newGame(R.CLASSIC), board: new Array(64).fill(null) };
st.board[at('a1')] = { id: 1, type: 'r', color: 'w' };
st.board[at('e1')] = { id: 2, type: 'k', color: 'w' };
st.board[at('h8')] = { id: 3, type: 'k', color: 'b' };
st.board[at('a5')] = { id: 4, type: 'p', color: 'b' };
st.board[at('a6')] = { id: 5, type: 'n', color: 'b' };
ok(R.isTargetable(st, at('a1'), at('a5')), 'rook shoots 4 squares');
ok(!R.isTargetable(st, at('a1'), at('a6')), 'rook cannot shoot 5 squares');
ok(R.pseudoMoves(st, at('a1')).some((m) => m.to === at('a4')) && !R.pseudoMoves(st, at('a1')).some((m) => m.to === at('a5')), 'rook moves only to empty squares');
// Classic: king not shootable
st.board[at('e4')] = { id: 6, type: 'q', color: 'w' };
st.board[at('e7')] = { id: 7, type: 'k', color: 'b' }; st.board[at('h8')] = null;
ok(!R.isTargetable(st, at('e4'), at('e7')), 'classic: king cannot be shot');
ok(R.inCheck(st, 'b'), 'queen 3 squares away checks');
const merci = { ...st, mode: R.MERCIZERO };
ok(R.isTargetable(merci, at('e4'), at('e7')), 'mercizero: king can be shot');
// Knight straight bullet hit chance
st = R.newGame(R.CLASSIC);
st.board[at('f3')] = { id: 99, type: 'p', color: 'b', moved: true };
ok(R.isTargetable(st, at('g1'), at('f3')), 'knight targets L square');
console.log('   knight g1->f3 hit', R.hitChance(st, at('g1'), at('f3')).toFixed(2), '(f2/g2 pawns in the way)');
st = { ...R.newGame(R.CLASSIC), board: new Array(64).fill(null) };
st.board[at('a1')] = { id: 1, type: 'r', color: 'w' };
for (const [n, sq] of [[1, 'a2'], [2, 'a3'], [3, 'a4'], [4, 'a5']]) {
  const s2 = R.clone(st); s2.board[at(sq)] = { id: 9, type: 'p', color: 'b' };
  console.log(`   rook at ${n} sq: hit ${R.hitChance(s2, at('a1'), at(sq)).toFixed(2)}`);
}
st.board[at('a1')] = { id: 1, type: 'b', color: 'w' };
for (const sq of ['b2', 'c3', 'd4', 'e5']) { const s2 = R.clone(st); s2.board[at(sq)] = { id: 9, type: 'n', color: 'b' }; console.log(`   bishop -> ${sq}: hit ${R.hitChance(s2, at('a1'), at(sq)).toFixed(2)}`); }
// Mate detection: back rank
st = { ...R.newGame(R.CLASSIC), board: new Array(64).fill(null), turn: 'b' };
st.board[at('h8')] = { id: 1, type: 'k', color: 'b', moved: true };
st.board[at('g7')] = { id: 2, type: 'p', color: 'b' }; st.board[at('h7')] = { id: 3, type: 'p', color: 'b' };
st.board[at('e8')] = { id: 4, type: 'r', color: 'w' }; st.board[at('e1')] = { id: 5, type: 'k', color: 'w' };
st.board[at('g8')] = null;
const j = R.judge(st); ok(j && j.winner === 'w', 'back-rank siege is checkmate: ' + JSON.stringify(j));
// AI plays a few games quickly
for (const mode of [R.CLASSIC, R.MERCIZERO]) {
  let g = R.newGame(mode), t0 = Date.now(), plies = 0, res = null, maxMs = 0;
  while (!res && plies < 120) {
    const t = Date.now(); const a = chooseAction(g); maxMs = Math.max(maxMs, Date.now() - t);
    let kill = null;
    if (a.kind === 'shoot') { const r = R.simulateShot(g, a.from, R.aimCenter(g, a.to)); kill = r.hit; }
    g = R.applyRaw(g, a, kill); res = R.judge(g); plies++;
  }
  console.log(`   ${mode}: ${plies} plies, result ${JSON.stringify(res)}, ${(Date.now() - t0) / plies | 0}ms/ply avg, max ${maxMs}ms`);
}
