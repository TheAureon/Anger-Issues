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

// Progression: XP, levels, badges
{
  const P = await import('../chess-shooter/src/progress.js');
  const events = [];
  const pr = new P.Progress((e) => events.push(e));
  ok(P.levelOf(0) === 1 && P.levelOf(99) === 1 && P.levelOf(100) === 2 && P.levelOf(300) === 3, 'level thresholds 0/100/300');
  pr.beginGame({ vsAI: true, human: 'w', difficulty: 'hard', mode: R.MERCIZERO });
  const pawn = { type: 'p', color: 'b' }, queen = { type: 'q', color: 'b' };
  pr.onShot({ mine: true, shooterType: 'r', intended: 10, victim: queen, victimSq: 10, distance: 4, chance: 0.4 });
  const got = new Set(events.filter((e) => e.type === 'badge').map((e) => e.badge.id));
  ok(['first-blood', 'max-range', 'long-shot', 'queenslayer'].every((b) => got.has(b)) && !got.has('stray'), 'kill badges: ' + [...got].join(','));
  for (let i = 0; i < 4; i++) pr.onShot({ mine: true, shooterType: 'p', intended: 3, victim: null, victimSq: null, distance: 1, chance: 0.9 });
  ok(pr.p.badges.stormtrooper, '4 misses in a row -> Stormtrooper');
  pr.onShot({ mine: true, shooterType: 'n', intended: 3, victim: pawn, victimSq: 4, distance: 2, chance: 0.9 });
  ok(pr.p.badges.stray, 'killing a different enemy -> Lucky Stray');
  pr.onShot({ mine: true, shooterType: 'q', intended: 3, victim: { type: 'b', color: 'w' }, victimSq: 5, friendly: true, distance: 2, chance: 0.9 });
  ok(pr.p.badges.oops && !pr.p.badges.untouchable, 'friendly fire -> Oops');
  const sum = pr.endGame({ winner: 'w', reason: 'the king was shot' });
  ok(pr.p.badges['beat-hard'] && pr.p.badges.regicide && !pr.p.badges.untouchable && !pr.p.badges.deadeye, 'win badges (no Untouchable after friendly fire)');
  ok(sum.endXp - sum.startXp === pr.p.xp && pr.p.stats.wins === 1 && pr.p.stats.kills === 2, `game XP ${pr.p.xp}, level ${pr.level}, stats ${JSON.stringify(pr.p.stats)}`);
}

// Shop: spending XP
{
  const P = await import('../chess-shooter/src/progress.js');
  const S = await import('../chess-shooter/src/skins.js');
  const pr = new P.Progress(() => {});
  pr.p.xp = 600; // level 4
  const neon = S.PIECE_SKINS.find((s) => s.id === 'pieces-neon'); // 750 XP, level 4
  const camo = S.PIECE_SKINS.find((s) => s.id === 'pieces-camo'); // 350 XP
  const chrome = S.PIECE_SKINS.find((s) => s.id === 'pieces-chrome'); // level 6
  ok(!pr.canBuy(neon).ok && /more XP/.test(pr.canBuy(neon).why), 'cannot afford: ' + pr.canBuy(neon).why);
  ok(!pr.canBuy(chrome).ok && /level 6/.test(pr.canBuy(chrome).why), 'level-locked: ' + pr.canBuy(chrome).why);
  ok(pr.buy(camo) && pr.owns(camo) && pr.p.spent === 350, 'buy camo spends 350');
  ok(pr.level === P.levelOf(pr.p.xp) && pr.level >= 4 && pr.balance === pr.p.xp - 350, `level kept (${pr.level}), balance ${pr.balance} (incl. Fashionista bonus)`);
  ok(!pr.buy(camo) && pr.p.spent === 350, 'cannot buy twice');
  ok(pr.equip('pieces', camo) && pr.p.equipped.pieces === 'pieces-camo' && !pr.equip('pieces', neon), 'equip only owned skins');
}

// Progression: campaign, contracts, fog
{
  const P = await import('../chess-shooter/src/progress.js');
  const C = await import('../chess-shooter/src/campaign.js');
  const { chooseAction } = await import('../chess-shooter/src/ai.js');
  // Custom positions
  for (const b of C.BATTLES) {
    const g = R.fromPlacement(b.placement, b.mode);
    if (R.findKing(g, 'w') < 0 || R.findKing(g, 'b') < 0 || R.legalActions(g).length === 0) ok(false, `battle ${b.id} position is playable`);
  }
  ok(true, `all ${C.BATTLES.length} campaign positions have both kings and legal moves`);
  const pawns = R.fromPlacement('4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3', R.MERCIZERO);
  ok(R.pseudoMoves(pawns, at('e2')).some((m) => m.double) && pawns.board[at('e1')].moved === false, 'placement keeps start-square flags (double pawn step, castling rights)');
  // Fog visibility
  const fog = R.newGame(R.FOG);
  const hid = R.hiddenEnemySquares(fog, 'w');
  ok(hid.size === 16, `fog hides all 16 black pieces at the start (hidden ${hid.size})`);
  ok(!R.visibleSquares(fog, 'w').has(at('e5')) && R.visibleSquares(fog, 'w').has(at('e4')), 'white sees e4 but not e5 at the start');
  const fogClassic = R.hiddenEnemySquares(R.newGame(R.CLASSIC), 'w');
  ok(fogClassic.size === 0, 'no fog outside Fog of War');
  const g2 = R.newGame(R.FOG); g2.board[at('e3')] = { id: 90, type: 'p', color: 'b', moved: true }; g2.turn = 'b';
  const fogAct = chooseAction(g2, 'normal');
  ok(fogAct && (fogAct.kind !== 'shoot' || !R.hiddenEnemySquares(g2, 'b').has(fogAct.to)), 'fog AI only shoots what it can see');
  ok(R.judge({ ...R.newGame(R.FOG), board: R.newGame(R.FOG).board.map((p) => (p && p.type === 'k' && p.color === 'b' ? null : p)) }).winner === 'w', 'fog: shooting the king wins (MerciZero rules)');

  // Contracts + first win + campaign
  const pr = new P.Progress(() => {});
  const d = pr.daily();
  ok(d.ids.length === 3 && new Set(d.ids).size === 3, 'three distinct daily contracts: ' + d.ids.join(', '));
  const first = C.BATTLES[0], second = C.BATTLES[1], ch2 = C.BATTLES.find((b) => b.chapter === 2);
  ok(pr.battleUnlocked(first) && !pr.battleUnlocked(second) && !pr.battleUnlocked(ch2), 'only battle 1 is open at first');
  pr.beginGame({ vsAI: true, human: 'w', difficulty: 'easy', mode: R.CLASSIC, campaign: first });
  const xp0 = pr.p.xp;
  for (let i = 0; i < 6; i++) pr.onShot({ mine: true, shooterType: 'p', intended: 1, victim: { type: 'p', color: 'b' }, victimSq: 1, distance: 3, chance: 0.4 });
  pr.onMove({ mine: true, castle: true, promo: true });
  pr.game.myTurns = 20; pr.game.lost = 1;
  const sum = pr.endGame({ winner: 'w', reason: 'checkmate: the king is besieged' });
  const lines = sum.xp.map((l) => l.label);
  ok(lines.includes('First win of the day (×2)') && !pr.firstWinAvailable, 'first win of the day pays double, once');
  ok(sum.campaignResult.stars.every(Boolean) && pr.p.campaign.stars[first.id] === 3 && lines.some((l) => l.startsWith('Campaign star')), '3 stars recorded and paid: ' + JSON.stringify(sum.campaignResult.stars));
  ok(pr.battleUnlocked(second), 'winning battle 1 unlocks battle 2');
  const doneCount = Object.keys(pr.p.daily.done).length;
  ok(doneCount >= 1, `contracts progressed (${doneCount} done: ${Object.keys(pr.p.daily.done).join(', ')}), XP gained ${pr.p.xp - xp0}`);
  // Second win today: no double
  pr.beginGame({ vsAI: true, human: 'w', difficulty: 'easy', mode: R.CLASSIC });
  ok(!pr.endGame({ winner: 'w', reason: 'checkmate: the king is besieged' }).xp.some((l) => l.label.startsWith('First win')), 'no second first-win bonus the same day');
  // Chapter reward
  for (const b of C.BATTLES.filter((x) => x.chapter === 1)) pr.recordBattle(b, { won: true, myTurns: 99, lost: 99 });
  const wt = (await import('../chess-shooter/src/skins.js')).BOARD_SKINS.find((s) => s.id === 'board-wartable');
  ok(pr.owns(wt) && pr.p.badges['chapter-1'], 'finishing chapter 1 grants the War Table board and Graduate badge');
  ok(!new P.Progress(() => {}).owns(wt) && /Campaign reward/.test(new P.Progress(() => {}).canBuy(wt).why), 'campaign skins are not free or buyable');
  ok(pr.chapterUnlocked(C.CHAPTERS[1]) === pr.campaignStars >= 6, `chapter 2 gate follows stars (${pr.campaignStars} stars)`);
}

// Challenges, prestige, mastery, titles
{
  const P = await import('../chess-shooter/src/progress.js');
  const CH = await import('../chess-shooter/src/challenges.js');
  const S = await import('../chess-shooter/src/skins.js');
  // Rule modifiers
  let g = { ...R.newGame(R.MERCIZERO), board: new Array(64).fill(null) };
  g.board[at('a1')] = { id: 1, type: 'r', color: 'w' }; g.board[at('a7')] = { id: 2, type: 'p', color: 'b' };
  ok(!R.isTargetable(g, at('a1'), at('a7')) && R.isTargetable({ ...g, rules: { ...R.DEFAULT_RULES, sliderRange: 7 } }, at('a1'), at('a7')), 'Long Guns: rook reaches 6 squares only with the rule');
  g.board[at('e2')] = { id: 3, type: 'p', color: 'w' }; g.board[at('e4')] = { id: 4, type: 'n', color: 'b' };
  ok(!R.isTargetable(g, at('e2'), at('e4')) && R.isTargetable({ ...g, rules: { ...R.DEFAULT_RULES, pawnForward: 2 } }, at('e2'), at('e4')), 'Pawn Shotguns: pawn shoots 2 ahead only with the rule');
  g.board[at('g1')] = { id: 5, type: 'k', color: 'w' }; g.board[at('g3')] = { id: 6, type: 'b', color: 'b' };
  ok(!R.isTargetable(g, at('g1'), at('g3')) && R.isTargetable({ ...g, rules: { ...R.DEFAULT_RULES, kingRange: 2 } }, at('g1'), at('g3')), 'Royal Guard: king shoots 2 squares only with the rule');
  const steady = R.hitChance({ ...g, rules: { ...R.DEFAULT_RULES, spreadMul: 0.5 } }, at('a1'), at('a7'));
  ok(R.weaponText('r', { rules: { ...R.DEFAULT_RULES, sliderRange: 7 } }).includes('7 squares'), 'weapon text follows the rules');
  // Gauntlet carries losses
  const gp = CH.gauntletPlacement(['q', 'n', 'p', 'p']);
  const gs = R.fromPlacement(gp, R.MERCIZERO);
  const white = gs.board.filter((p) => p && p.color === 'w');
  ok(white.length === 12 && !white.some((p) => p.type === 'q'), `gauntlet removes lost pieces (${gp})`);
  ok(CH.weeklyFor(CH.weekKey(new Date(2026, 10, 9))) === CH.weeklyFor(CH.weekKey(new Date(2026, 10, 15))), 'weekly rule is stable Monday to Sunday');
  ok(CH.puzzleFor('2026-11-10') === CH.puzzleFor('2026-11-10'), 'daily puzzle is stable within a day');

  const pr = new P.Progress(() => {});
  // Puzzle streak
  ok(pr.solvePuzzle('2026-11-08').streak === 1 && pr.solvePuzzle('2026-11-09').streak === 2 && pr.solvePuzzle('2026-11-09').already, 'puzzle streak grows on consecutive days, pays once a day');
  ok(pr.solvePuzzle('2026-11-11').streak === 1, 'puzzle streak resets after a missed day');
  ok(!pr.winWeekly('2026-11-09').already && pr.winWeekly('2026-11-09').already, 'weekly reward pays once a week');
  // Mastery
  pr.beginGame({ vsAI: true, human: 'w', difficulty: 'easy', mode: R.CLASSIC });
  for (let i = 0; i < 10; i++) pr.onShot({ mine: true, shooterType: 'n', intended: 1, victim: { type: 'p', color: 'b' }, victimSq: 1, distance: 2, chance: 0.9 });
  ok(P.masteryTier(pr.p.mastery.n) === 2 && pr.game.mastery.length === 2, 'knight mastery reaches tier II after 10 kills');
  pr.onShot({ mine: false, shooterType: 'q', intended: 2, victim: { type: 'r', color: 'w' }, victimSq: 2, distance: 3, chance: 0.5 });
  ok(pr.game.lostTypes.join() === 'r', 'lost piece types are tracked for the gauntlet');
  pr.endGame({ winner: 'w', reason: 'checkmate: the king is besieged' });
  // Arenas unlock by rank
  const snow = S.ARENAS.find((a) => a.id === 'arena-snow');
  ok(!pr.owns(snow) && /level 7/.test(pr.canBuy(snow).why), 'arena locked below its level');
  // Prestige
  pr.p.xp += P.xpForLevel(20) + 10;
  pr.p.peak = pr.level;
  const spendBefore = pr.balance;
  ok(pr.canPrestige && pr.prestigeNow() && pr.level === 1 && pr.balance === spendBefore + 50, `prestige resets level to 1, keeps the wallet (+50 badge XP)`);
  ok(pr.owns(snow) && pr.perk('fog') && pr.perk('killcam'), 'rank perks and arenas survive prestige');
  ok(pr.owns(S.PIECE_SKINS.find((s) => s.id === 'pieces-prestige')) && pr.p.titles.prestigious, 'prestige grants the Prestige pieces and title');
  pr.setTitle('prestigious');
  ok(pr.titleName === 'The Prestigious' && (pr.setTitle('legend'), pr.p.title === 'prestigious'), 'can only wear unlocked titles');
}
