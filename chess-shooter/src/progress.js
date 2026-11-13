// Player profile: XP, levels, ranks, lifetime stats and badges. Saved in localStorage on this device.

import { DEFAULT_EQUIPPED, CATEGORIES } from './skins.js';
import { BATTLES, CHAPTERS, STAR_XP, starsFor } from './campaign.js';
import { PUZZLE_XP, WEEKLY_XP, GAUNTLET, GAUNTLET_XP } from './challenges.js';
import { LIBRARY, LIB_XP, WEEKLY_PUZZLE_XP } from './puzzles.js';

export const PRESTIGE_LEVEL = 20;
// Piece mastery: kills with each piece type unlock tiers I-V.
export const MASTERY_TIERS = [3, 10, 25, 50, 100];
export const MASTERY_REWARDS = { 3: 'Coloured tracer rounds for this piece', 5: 'Gold trim on this piece' };
export function masteryTier(kills) {
  let t = 0;
  while (t < MASTERY_TIERS.length && kills >= MASTERY_TIERS[t]) t++;
  return t;
}
// Rank perks: things that unlock at a level (by the highest level ever reached, so prestige keeps them).
export const PERKS = { fog: 5, killcam: 6 };

const KEY = 'gunmate-profile';

export const RANKS = [
  'Private', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Lieutenant', 'Captain',
  'Major', 'Colonel', 'Brigadier', 'General', 'Field Marshal', 'Grandmaster',
];

// XP needed to reach `level` from zero: 0, 100, 300, 600, 1000, ...
export const xpForLevel = (level) => 50 * (level - 1) * level;
export function levelOf(xp) {
  let l = 1;
  while (xp >= xpForLevel(l + 1)) l++;
  return l;
}
export const rankOf = (level) => RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 2))];

export const KILL_XP = { p: 5, n: 15, b: 15, r: 25, q: 45, k: 60 };
export const WIN_XP = { easy: 60, normal: 120, hard: 180, brutal: 300, local: 40 };
export const BADGE_XP = 50;

// Badges. `progress` (optional) returns [current, goal] from lifetime stats for a progress bar.
export const BADGES = [
  { id: 'first-blood', icon: '🩸', name: 'First Blood', desc: 'Get your first kill.' },
  { id: 'pawn-power', icon: '♟️', name: 'Pawn Power', desc: 'Kill a piece with a pawn.' },
  { id: 'revolver', icon: '👑', name: 'Royal Revolver', desc: 'Kill a piece with your king.' },
  { id: 'cavalry', icon: '🐴', name: 'Cavalry Charge', desc: 'Get 3 knight kills in one game.' },
  { id: 'max-range', icon: '🎯', name: 'Max Range', desc: 'Kill from 4 squares away, the edge of a slider’s range.' },
  { id: 'long-shot', icon: '🍀', name: 'Long Shot', desc: 'Land a kill that had under 50% hit chance.' },
  { id: 'queenslayer', icon: '♛', name: 'Queenslayer', desc: 'Shoot down the enemy queen.' },
  { id: 'stray', icon: '🎱', name: 'Lucky Stray', desc: 'Miss your target but kill a different enemy.' },
  { id: 'oops', icon: '🤦', name: 'Oops', desc: 'Shoot one of your own pieces.' },
  { id: 'ricochet', icon: '🛡️', name: 'Bulletproof', desc: 'Bounce a bullet off a king in Classic.' },
  { id: 'stormtrooper', icon: '💨', name: 'Stormtrooper', desc: 'Miss 4 shots in a row.' },
  { id: 'promotion', icon: '⭐', name: 'Field Promotion', desc: 'Promote a pawn.' },
  { id: 'castle', icon: '🏰', name: 'Castle Keep', desc: 'Castle your king.' },
  { id: 'siege', icon: '⚔️', name: 'Siege Master', desc: 'Win a Classic game by checkmate.' },
  { id: 'regicide', icon: '💀', name: 'Regicide', desc: 'Win a MerciZero game by shooting the king.' },
  { id: 'untouchable', icon: '✨', name: 'Untouchable', desc: 'Beat the computer without losing a single piece.' },
  { id: 'deadeye', icon: '👁️', name: 'Deadeye', desc: 'Beat the computer with 100% accuracy (5+ shots).' },
  { id: 'comeback', icon: '🔥', name: 'Comeback Kid', desc: 'Beat the computer after being 5+ points of material down.' },
  { id: 'blitz', icon: '⚡', name: 'Blitz', desc: 'Beat the computer in 20 of your turns or fewer.' },
  { id: 'beat-easy', icon: '🥉', name: 'Boot Camp', desc: 'Beat Recruit.' },
  { id: 'beat-normal', icon: '🥈', name: 'Soldier Down', desc: 'Beat Soldier.' },
  { id: 'beat-hard', icon: '🥇', name: 'Sniper Duel', desc: 'Beat Sniper.' },
  { id: 'beat-brutal', icon: '🏆', name: 'Warlord Slayer', desc: 'Beat Warlord.' },
  { id: 'hot-seat', icon: '🛋️', name: 'Hot Seat', desc: 'Finish a Pass & Play game.' },
  { id: 'fog-walker', icon: '🌫️', name: 'Fog Walker', desc: 'Win a Fog of War game against the computer.' },
  { id: 'chapter-1', icon: '🎗️', name: 'Graduate', desc: 'Win every battle in campaign chapter 1.' },
  { id: 'chapter-2', icon: '🪖', name: 'Front-Line Veteran', desc: 'Win every battle in campaign chapter 2.' },
  { id: 'chapter-3', icon: '🏅', name: 'High Command', desc: 'Win every battle in campaign chapter 3.' },
  { id: 'all-stars', icon: '🌟', name: 'Decorated', desc: 'Earn all 36 campaign stars.', progress: (s, p) => [Object.values(p.campaign.stars).reduce((a, b) => a + b, 0), 36] },
  { id: 'contractor', icon: '📋', name: 'Contractor', desc: 'Complete 10 daily contracts.', progress: (s) => [s.contracts, 10] },
  { id: 'puzzler', icon: '🧩', name: 'Puzzler', desc: 'Solve a daily puzzle.' },
  { id: 'streak-7', icon: '🔥', name: 'On Fire', desc: 'Solve the daily puzzle 7 days in a row.' },
  { id: 'rule-breaker', icon: '🃏', name: 'Rule Breaker', desc: 'Win a weekly challenge.' },
  { id: 'gauntlet', icon: '🛡️', name: 'Gauntlet Champion', desc: 'Beat all four computer levels in one gauntlet run.' },
  { id: 'master', icon: '🎯', name: 'Weapon Master', desc: 'Reach mastery V with any piece (100 kills).' },
  { id: 'prestige', icon: '💎', name: 'Prestige', desc: 'Reach level 20 and prestige.' },
  { id: 'librarian', icon: '📚', name: 'Librarian', desc: 'Earn 30 stars in the puzzle library.', progress: (s, p) => [Object.values(p.lib).reduce((a, x) => a + (x.stars || 0), 0), 30] },
  { id: 'trickster', icon: '📦', name: 'Trickster', desc: 'Solve every Trick Shot puzzle.' },
  { id: 'rush-20', icon: '⏱️', name: 'Rush Hour', desc: 'Score 20 in Puzzle Rush.' },
  { id: 'architect', icon: '🛠️', name: 'Architect', desc: 'Build and test a puzzle in the editor.' },
  { id: 'shopper', icon: '🛍️', name: 'Fashionista', desc: 'Buy your first skin in the shop.' },
  { id: 'collector', icon: '🎨', name: 'Collector', desc: 'Own 10 skins.', progress: (s, p) => [Object.keys(p.owned).length, 10] },
  { id: 'veteran', icon: '🎖️', name: 'Veteran', desc: 'Finish 10 games.', progress: (s) => [s.games, 10] },
  { id: 'centurion', icon: '💯', name: 'Centurion', desc: 'Get 100 kills in total.', progress: (s) => [s.kills, 100] },
  { id: 'marksman', icon: '🔫', name: 'Trigger Happy', desc: 'Fire 250 shots in total.', progress: (s) => [s.shots, 250] },
];
const BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

function blank() {
  return {
    xp: 0, // lifetime XP: sets your level and never goes down
    spent: 0, // XP spent in the shop
    owned: {}, // skin id -> true (free skins are always owned)
    equipped: { ...DEFAULT_EQUIPPED },
    campaign: { stars: {}, won: {} }, // battle id -> best stars (0-3); battle id -> true
    daily: null, // { date, ids, progress: {id: n}, done: {id: true} }
    firstWin: '', // date of the last first-win-of-the-day bonus
    prestige: 0, // times prestiged
    prestigeBase: 0, // lifetime XP at the last prestige; your level counts from here
    peak: 1, // highest level ever reached (rank perks use it, so prestige never takes them away)
    mastery: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, // kills per piece type
    puzzle: { last: '', streak: 0, best: 0, solved: 0 },
    weekly: { claimed: '', wins: 0 },
    gauntlet: { best: 0, clears: 0 },
    titles: {}, // title id -> unlock time
    lib: {}, // library puzzle id -> { stars, fails }
    wpuzzle: '', // week of the last puzzle-of-the-week reward
    rush: { best: 0, runs: 0 },
    title: '', // equipped title id
    badges: {}, // id -> unlock timestamp
    stats: { games: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, shots: 0, hits: 0, bestStreak: 0, streak: 0, contracts: 0 },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const p = JSON.parse(raw);
    const b = blank();
    return {
      ...b,
      ...p,
      stats: { ...b.stats, ...(p.stats || {}) },
      badges: p.badges || {},
      owned: p.owned || {},
      campaign: { stars: {}, won: {}, ...(p.campaign || {}) },
      mastery: { ...b.mastery, ...(p.mastery || {}) },
      puzzle: { ...b.puzzle, ...(p.puzzle || {}) },
      weekly: { ...b.weekly, ...(p.weekly || {}) },
      gauntlet: { ...b.gauntlet, ...(p.gauntlet || {}) },
      titles: p.titles || {},
      lib: p.lib || {},
      rush: { ...b.rush, ...(p.rush || {}) },
      equipped: { ...DEFAULT_EQUIPPED, ...(p.equipped || {}) },
    };
  } catch {
    return blank();
  }
}

export class Progress {
  constructor(onEvent) {
    this.p = load();
    this.onEvent = onEvent; // ({type:'xp'|'badge'|'level', ...})
    this.game = null;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.p));
    } catch {
      /* storage unavailable: progress lasts for this visit only */
    }
  }

  reset() {
    this.p = blank();
    this.save();
  }

  get level() {
    return levelOf(this.p.xp - this.p.prestigeBase);
  }
  // Highest level ever reached: rank perks and level-locked skins use this.
  get rankLevel() {
    return Math.max(this.p.peak || 1, this.level);
  }
  perk(name) {
    return this.rankLevel >= PERKS[name];
  }

  // --- Prestige ---------------------------------------------------------------------------

  get canPrestige() {
    return this.level >= PRESTIGE_LEVEL;
  }
  prestigeNow() {
    if (!this.canPrestige) return false;
    this.p.prestige++;
    this.p.prestigeBase = this.p.xp; // level restarts at 1; XP to spend is untouched
    this.p.owned['pieces-prestige'] = true;
    this.unlock('prestige');
    this.checkTitles();
    this.save();
    return true;
  }

  // --- Titles -----------------------------------------------------------------------------

  checkTitles() {
    for (const t of TITLES) {
      if (this.p.titles[t.id] || !t.when(this)) continue;
      this.p.titles[t.id] = Date.now();
      this.onEvent({ type: 'title', title: t });
      if (t.xp) this.addXp(t.xp, `Title: ${t.name}`);
    }
  }
  setTitle(id) {
    if (id && !this.p.titles[id]) return;
    this.p.title = id;
    this.save();
  }
  get titleName() {
    const t = TITLES.find((x) => x.id === this.p.title);
    return t ? t.name : '';
  }

  // --- Puzzle library, rush, weekly puzzle -----------------------------------------------

  spendXp(n) {
    if (this.balance < n) return false;
    this.p.spent += n;
    this.save();
    return true;
  }
  get libStars() {
    return Object.values(this.p.lib).reduce((a, x) => a + (x.stars || 0), 0);
  }
  failLibrary(id) {
    const e = (this.p.lib[id] ||= { stars: 0, fails: 0 });
    e.fails++;
    this.save();
  }
  // Stars: 1 solved, 2 solved without hints, 3 also on the first try.
  recordLibrary(id, { hints }) {
    const e = (this.p.lib[id] ||= { stars: 0, fails: 0 });
    const stars = 1 + (hints ? 0 : 1) + (!hints && !e.fails ? 1 : 0);
    const before = e.stars;
    if (stars > before) {
      let xp = 0;
      for (let k = before + 1; k <= stars; k++) xp += LIB_XP[k];
      e.stars = stars;
      this.addXp(xp, `Puzzle star${stars - before > 1 ? 's' : ''} ×${stars - before}`);
    }
    const tricks = LIBRARY.filter((x) => x.pack === 'trick');
    if (tricks.every((x) => this.p.lib[x.id] && this.p.lib[x.id].stars)) this.unlock('trickster');
    this.checkCounters();
    this.checkTitles();
    this.save();
    return { stars, before };
  }
  solveWeeklyPuzzle(week) {
    if (this.p.wpuzzle === week) return { already: true };
    this.p.wpuzzle = week;
    this.addXp(WEEKLY_PUZZLE_XP, 'Puzzle of the week');
    this.save();
    return { already: false };
  }
  recordRush(score) {
    const r = this.p.rush;
    r.runs++;
    const best = score > r.best;
    r.best = Math.max(r.best, score);
    if (score) this.addXp(10 * score, `Puzzle Rush ×${score}`);
    if (score >= 20) this.unlock('rush-20');
    this.save();
    return { best };
  }

  // --- Daily puzzle, weekly challenge, gauntlet -------------------------------------------

  solvePuzzle(day) {
    const z = this.p.puzzle;
    if (z.last === day) return { already: true, streak: z.streak };
    const y = new Date(day + 'T12:00:00');
    y.setDate(y.getDate() - 1);
    z.streak = z.last === dayKey(y) ? z.streak + 1 : 1;
    z.best = Math.max(z.best, z.streak);
    z.last = day;
    z.solved++;
    this.addXp(PUZZLE_XP + 20 * Math.min(z.streak - 1, 6), z.streak > 1 ? `Daily puzzle (streak ${z.streak})` : 'Daily puzzle');
    this.unlock('puzzler');
    if (z.streak >= 7) this.unlock('streak-7');
    return { already: false, streak: z.streak };
  }
  winWeekly(week) {
    const w = this.p.weekly;
    if (w.claimed === week) return { already: true };
    w.claimed = week;
    w.wins++;
    this.addXp(WEEKLY_XP, 'Weekly challenge');
    this.unlock('rule-breaker');
    return { already: false };
  }
  gauntletRound(round, won) {
    const gt = this.p.gauntlet;
    if (!won) return { round, won };
    gt.best = Math.max(gt.best, round + 1);
    this.addXp(GAUNTLET_XP[round], `Gauntlet round ${round + 1}`);
    const cleared = round === GAUNTLET.length - 1;
    if (cleared) {
      gt.clears++;
      this.unlock('gauntlet');
    }
    return { round, won, cleared };
  }

  // --- Shop ------------------------------------------------------------------------------

  get balance() {
    return this.p.xp - this.p.spent;
  }
  owns(skin) {
    if (skin.rank) return this.rankLevel >= skin.rank; // arenas and other rank unlocks
    if (skin.campaign || skin.prestige) return !!this.p.owned[skin.id];
    return skin.price === 0 || !!this.p.owned[skin.id];
  }
  canBuy(skin) {
    if (this.owns(skin)) return { ok: false, why: 'owned' };
    if (skin.campaign) return { ok: false, why: `Campaign reward: finish chapter ${skin.campaign}` };
    if (skin.rank) return { ok: false, why: `Unlocks at level ${skin.rank}` };
    if (skin.prestige) return { ok: false, why: 'Prestige reward' };
    if (skin.level && this.rankLevel < skin.level) return { ok: false, why: `Reach level ${skin.level}` };
    if (this.balance < skin.price) return { ok: false, why: `Need ${skin.price - this.balance} more XP` };
    return { ok: true };
  }
  buy(skin) {
    if (!this.canBuy(skin).ok) return false;
    this.p.spent += skin.price;
    this.p.owned[skin.id] = true;
    this.unlock('shopper');
    this.checkCounters();
    this.save();
    return true;
  }
  equip(cat, skin) {
    if (!this.owns(skin)) return false;
    this.p.equipped[cat] = skin.id;
    this.save();
    return true;
  }

  addXp(amount, label) {
    if (amount <= 0) return;
    const before = this.level;
    this.p.xp += amount;
    this.p.peak = Math.max(this.p.peak || 1, this.level);
    if (this.game) this.game.xp.push({ label, amount });
    this.onEvent({ type: 'xp', amount, label });
    const after = this.level;
    if (after > before) this.onEvent({ type: 'level', level: after, rank: rankOf(after) });
  }

  unlock(id) {
    if (this.p.badges[id]) return;
    this.p.badges[id] = Date.now();
    if (this.game) this.game.badges.push(id);
    this.onEvent({ type: 'badge', badge: BY_ID[id] });
    this.addXp(BADGE_XP, `Badge: ${BY_ID[id].name}`);
  }

  checkCounters() {
    for (const b of BADGES) {
      if (!b.progress || this.p.badges[b.id]) continue;
      const [cur, goal] = b.progress(this.p.stats, this.p);
      if (cur >= goal) this.unlock(b.id);
    }
  }

  // --- Daily contracts --------------------------------------------------------------------

  // Today's three contracts (one kill task, one win task, one other), the same all day.
  daily() {
    const today = dayKey();
    if (!this.p.daily || this.p.daily.date !== today) {
      const rng = seeded(today);
      const pick = (group) => {
        const list = CONTRACTS.filter((c) => c.group === group);
        return list[Math.floor(rng() * list.length)].id;
      };
      this.p.daily = { date: today, ids: [pick('kill'), pick('win'), pick('misc')], progress: {}, done: {} };
      this.save();
    }
    return this.p.daily;
  }
  get firstWinAvailable() {
    return this.p.firstWin !== dayKey();
  }
  // Advance every of today's contracts that `test` accepts (contracts only count vs the computer).
  bumpContracts(kind, info) {
    const g = this.game;
    if (!g || !g.vsAI) return;
    const d = this.daily();
    for (const id of d.ids) {
      if (d.done[id]) continue;
      const c = CONTRACT_BY_ID[id];
      if (!c[kind] || !c[kind](info)) continue;
      d.progress[id] = (d.progress[id] || 0) + 1;
      if (d.progress[id] >= c.goal) {
        d.done[id] = true;
        this.p.stats.contracts++;
        this.onEvent({ type: 'contract', contract: c });
        this.addXp(c.xp, `Contract: ${c.text}`);
      }
    }
  }

  // --- Campaign -------------------------------------------------------------------------

  get campaignStars() {
    return Object.values(this.p.campaign.stars).reduce((a, b) => a + b, 0);
  }
  chapterUnlocked(ch) {
    return this.campaignStars >= ch.need;
  }
  battleUnlocked(b) {
    const ch = CHAPTERS.find((c) => c.id === b.chapter);
    if (!this.chapterUnlocked(ch)) return false;
    const i = BATTLES.indexOf(b);
    // First battle of a chapter opens with the chapter; others need the previous battle won.
    return i === 0 || BATTLES[i - 1].chapter !== b.chapter || !!this.p.campaign.won[BATTLES[i - 1].id];
  }
  recordBattle(b, info) {
    const c = this.p.campaign;
    const got = starsFor(b, info);
    const count = got.filter(Boolean).length;
    const before = c.stars[b.id] || 0;
    const newStars = Math.max(0, count - before);
    if (count > before) c.stars[b.id] = count;
    if (info.won) c.won[b.id] = true;
    if (newStars) this.addXp(newStars * STAR_XP, `Campaign star${newStars > 1 ? 's' : ''} ×${newStars}`);
    // Chapter complete: exclusive skin + badge.
    let reward = null;
    const ch = CHAPTERS.find((x) => x.id === b.chapter);
    const done = BATTLES.filter((x) => x.chapter === ch.id).every((x) => c.won[x.id]);
    if (done && !this.p.owned[ch.reward.id]) {
      this.p.owned[ch.reward.id] = true;
      const cat = CATEGORIES.find((x) => x.key === ch.reward.cat);
      reward = cat.items.find((x) => x.id === ch.reward.id);
      this.onEvent({ type: 'reward', chapter: ch, skin: reward });
    }
    if (done) this.unlock(`chapter-${ch.id}`);
    return { stars: got, newStars, best: c.stars[b.id] || 0, reward };
  }

  // --- Game hooks ------------------------------------------------------------------------

  beginGame({ vsAI, human, difficulty, mode, campaign = null }) {
    this.game = { vsAI, human, difficulty, mode, campaign, lostTypes: [], mastery: [], xp: [], badges: [], shots: 0, hits: 0, missStreak: 0, knightKills: 0, lost: 0, worstDiff: 0, myTurns: 0, startLevel: this.level, startXp: this.p.xp };
  }

  // `mine`: the shot was fired by a human player (always true in Pass & Play).
  onShot({ mine, shooterType, intended, victim, victimSq, friendly, ricochet, distance, chance }) {
    const g = this.game;
    if (!g) return;
    if (!mine) {
      if (victim && !ricochet && g.vsAI && victim.color === g.human) {
        g.lost++;
        if (victim.type !== 'k') g.lostTypes.push(victim.type);
      }
      return;
    }
    g.myTurns++;
    g.shots++;
    this.p.stats.shots++;
    const killed = victim && !ricochet;
    if (ricochet) this.unlock('ricochet');
    if (!killed) {
      g.missStreak++;
      if (g.missStreak >= 4) this.unlock('stormtrooper');
      this.checkCounters();
      this.save();
      return;
    }
    g.missStreak = 0;
    if (friendly) {
      if (g.vsAI) {
        g.lost++;
        if (victim.type !== 'k') g.lostTypes.push(victim.type);
      }
      this.unlock('oops');
      this.save();
      return;
    }
    g.hits++;
    this.p.stats.hits++;
    this.p.stats.kills++;
    // Piece mastery.
    const before = masteryTier(this.p.mastery[shooterType]);
    this.p.mastery[shooterType]++;
    const after = masteryTier(this.p.mastery[shooterType]);
    if (after > before) {
      g.mastery.push({ type: shooterType, tier: after });
      this.onEvent({ type: 'mastery', piece: shooterType, tier: after, reward: MASTERY_REWARDS[after] });
      this.addXp(30 * after, `Mastery ${'I II III IV V'.split(' ')[after - 1]}`);
      if (after === 5) this.unlock('master');
    }
    this.addXp(KILL_XP[victim.type], `Killed ${victim.type === 'k' ? 'the king' : 'a ' + { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }[victim.type]}`);
    if (distance >= 3) this.addXp(5, 'Long-range hit');
    this.unlock('first-blood');
    if (shooterType === 'p') this.unlock('pawn-power');
    if (shooterType === 'k') this.unlock('revolver');
    if (shooterType === 'n' && ++g.knightKills >= 3) this.unlock('cavalry');
    if (distance >= 4 && ['r', 'b', 'q'].includes(shooterType)) this.unlock('max-range');
    if (victimSq === intended && chance < 0.5) this.unlock('long-shot');
    if (victim.type === 'q') this.unlock('queenslayer');
    if (victimSq !== intended) this.unlock('stray');
    this.bumpContracts('kill', { shooterType, victim, distance, chance, aimed: victimSq === intended });
    this.checkCounters();
    this.save();
  }

  onMove({ mine, castle, promo }) {
    const g = this.game;
    if (!g || !mine) return;
    g.myTurns++;
    if (castle) this.unlock('castle');
    if (promo) {
      this.unlock('promotion');
      this.addXp(10, 'Promotion');
    }
    this.bumpContracts('move', { castle, promo });
    this.save();
  }

  // Material balance from the human's side, after every action (vs computer only).
  onMaterial(diff) {
    if (this.game) this.game.worstDiff = Math.min(this.game.worstDiff, diff);
  }

  // Returns a summary for the game-over screen.
  endGame({ winner, reason }) {
    const g = this.game;
    if (!g) return null;
    const s = this.p.stats;
    s.games++;
    if (g.vsAI) {
      const won = winner === g.human;
      if (winner == null) {
        s.draws++;
        this.addXp(40, 'Draw');
      } else if (won) {
        s.wins++;
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        this.addXp(WIN_XP[g.difficulty], 'Victory');
        if (this.firstWinAvailable) {
          this.p.firstWin = dayKey();
          this.addXp(WIN_XP[g.difficulty], 'First win of the day (×2)');
        }
        if (g.mode === 'fog') this.unlock('fog-walker');
        if (s.streak >= 2) this.addXp(10 * Math.min(s.streak, 5), `Win streak ×${s.streak}`);
        this.unlock(`beat-${g.difficulty}`);
        if (reason.startsWith('checkmate')) this.unlock('siege');
        if (reason === 'the king was shot') this.unlock('regicide');
        if (g.lost === 0) this.unlock('untouchable');
        if (g.shots >= 5 && g.hits === g.shots) this.unlock('deadeye');
        if (g.worstDiff <= -5) this.unlock('comeback');
        if (g.myTurns <= 20) this.unlock('blitz');
      } else {
        s.losses++;
        s.streak = 0;
        this.addXp(20, 'Battle experience');
      }
      const kind = g.campaign ? g.campaign.kind || 'campaign' : null;
      const info = { won, difficulty: g.difficulty, mode: g.mode, myTurns: g.myTurns, lost: g.lost, campaign: kind === 'campaign' };
      if (won) this.bumpContracts('win', info);
      this.bumpContracts('end', info);
      if (kind === 'campaign') g.campaignResult = this.recordBattle(g.campaign, info);
      if (kind === 'puzzle' && won) g.challengeResult = { kind, ...this.solvePuzzle(g.campaign.day) };
      if (kind === 'puzzle' && !won) g.challengeResult = { kind, failed: true };
      if (kind === 'weekly') g.challengeResult = { kind, won, ...(won ? this.winWeekly(g.campaign.week) : {}) };
      if (kind === 'gauntlet') g.challengeResult = { kind, ...this.gauntletRound(g.campaign.round, won) };
    } else {
      this.addXp(WIN_XP.local, 'Game played');
      this.unlock('hot-seat');
      if (winner && reason.startsWith('checkmate')) this.unlock('siege');
      if (winner && reason === 'the king was shot') this.unlock('regicide');
    }
    this.checkCounters();
    this.checkTitles();
    this.save();
    const summary = { ...g, endXp: this.p.xp, endLevel: this.level };
    this.game = null;
    return summary;
  }
}

// --- Daily contracts -------------------------------------------------------------------------

const harder = (d) => ['normal', 'hard', 'brutal'].includes(d);
export const CONTRACTS = [
  { id: 'kills5', group: 'kill', text: 'Shoot down 5 enemy pieces', goal: 5, xp: 60, kill: () => true },
  { id: 'pawn3', group: 'kill', text: 'Get 3 kills with pawns', goal: 3, xp: 70, kill: (k) => k.shooterType === 'p' },
  { id: 'knight2', group: 'kill', text: 'Get 2 kills with knights', goal: 2, xp: 70, kill: (k) => k.shooterType === 'n' },
  { id: 'rook2', group: 'kill', text: 'Get 2 kills with rooks', goal: 2, xp: 70, kill: (k) => k.shooterType === 'r' },
  { id: 'bishop2', group: 'kill', text: 'Get 2 kills with bishops', goal: 2, xp: 70, kill: (k) => k.shooterType === 'b' },
  { id: 'long3', group: 'kill', text: 'Land 3 kills from 3+ squares away', goal: 3, xp: 80, kill: (k) => k.distance >= 3 },
  { id: 'risky', group: 'kill', text: 'Land a kill that had under 50% hit chance', goal: 1, xp: 90, kill: (k) => k.aimed && k.chance < 0.5 },
  { id: 'queen', group: 'kill', text: 'Shoot down an enemy queen', goal: 1, xp: 80, kill: (k) => k.victim.type === 'q' },
  { id: 'kingkill', group: 'kill', text: 'Get a kill with your king', goal: 1, xp: 90, kill: (k) => k.shooterType === 'k' },
  { id: 'win', group: 'win', text: 'Win a game against the computer', goal: 1, xp: 100, win: () => true },
  { id: 'win-hard', group: 'win', text: 'Beat Soldier or a harder computer', goal: 1, xp: 130, win: (w) => harder(w.difficulty) },
  { id: 'win-classic', group: 'win', text: 'Win a Classic game', goal: 1, xp: 110, win: (w) => w.mode === 'classic' },
  { id: 'win-merci', group: 'win', text: 'Win a MerciZero or Fog of War game', goal: 1, xp: 110, win: (w) => w.mode !== 'classic' },
  { id: 'win-fast', group: 'win', text: 'Win in 30 of your turns or fewer', goal: 1, xp: 140, win: (w) => w.myTurns <= 30 },
  { id: 'win-clean', group: 'win', text: 'Win losing 3 pieces or fewer', goal: 1, xp: 140, win: (w) => w.lost <= 3 },
  { id: 'win-campaign', group: 'win', text: 'Win a campaign battle', goal: 1, xp: 110, win: (w) => w.campaign },
  { id: 'promote', group: 'misc', text: 'Promote a pawn', goal: 1, xp: 80, move: (m) => m.promo },
  { id: 'castle', group: 'misc', text: 'Castle your king', goal: 1, xp: 50, move: (m) => m.castle },
  { id: 'play3', group: 'misc', text: 'Finish 3 games against the computer', goal: 3, xp: 80, end: () => true },
  { id: 'play2', group: 'misc', text: 'Finish 2 games against the computer', goal: 2, xp: 60, end: () => true },
];
const CONTRACT_BY_ID = Object.fromEntries(CONTRACTS.map((c) => [c.id, c]));

// Local calendar day, so contracts reset at the player's midnight.
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// --- Titles (collection rewards) -------------------------------------------------------------
const ownsAll = (pr, cat) =>
  CATEGORIES.find((c) => c.key === cat).items.filter((x) => !x.campaign && !x.prestige && !x.rank).every((x) => pr.owns(x));
export const TITLES = [
  { id: 'quartermaster', name: 'Quartermaster', desc: 'Own every piece skin in the shop.', xp: 150, when: (pr) => ownsAll(pr, 'pieces') },
  { id: 'armorer', name: 'Armorer', desc: 'Own every gun skin in the shop.', xp: 150, when: (pr) => ownsAll(pr, 'guns') },
  { id: 'groundskeeper', name: 'Groundskeeper', desc: 'Own every board skin in the shop.', xp: 150, when: (pr) => ownsAll(pr, 'board') },
  { id: 'campaigner', name: 'Campaigner', desc: 'Win every campaign battle.', xp: 200, when: (pr) => BATTLES.every((b) => pr.p.campaign.won[b.id]) },
  { id: 'decorated', name: 'The Decorated', desc: 'Earn all 36 campaign stars.', xp: 200, when: (pr) => pr.campaignStars >= 36 },
  { id: 'puzzle-master', name: 'Puzzle Master', desc: 'Reach a 7-day puzzle streak.', xp: 150, when: (pr) => pr.p.puzzle.best >= 7 },
  { id: 'champion', name: 'Champion', desc: 'Clear the gauntlet.', xp: 150, when: (pr) => pr.p.gauntlet.clears > 0 },
  { id: 'rebel', name: 'Rebel', desc: 'Win 3 weekly challenges.', xp: 150, when: (pr) => pr.p.weekly.wins >= 3 },
  { id: 'weapon-master', name: 'Weapon Master', desc: 'Reach mastery V with any piece.', xp: 150, when: (pr) => Object.values(pr.p.mastery).some((k) => masteryTier(k) >= 5) },
  { id: 'prestigious', name: 'The Prestigious', desc: 'Prestige at least once.', xp: 0, when: (pr) => pr.p.prestige > 0 },
  { id: 'scholar', name: 'Scholar', desc: 'Earn 3 stars on every library puzzle.', xp: 300, when: (pr) => LIBRARY.every((x) => pr.p.lib[x.id] && pr.p.lib[x.id].stars >= 3) },
  { id: 'legend', name: 'Legend', desc: 'Unlock every badge.', xp: 500, when: (pr) => BADGES.every((b) => pr.p.badges[b.id]) },
];
