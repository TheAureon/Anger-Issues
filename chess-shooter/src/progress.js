// Player profile: XP, levels, ranks, lifetime stats and badges. Saved in localStorage on this device.

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
  { id: 'veteran', icon: '🎖️', name: 'Veteran', desc: 'Finish 10 games.', progress: (s) => [s.games, 10] },
  { id: 'centurion', icon: '💯', name: 'Centurion', desc: 'Get 100 kills in total.', progress: (s) => [s.kills, 100] },
  { id: 'marksman', icon: '🔫', name: 'Trigger Happy', desc: 'Fire 250 shots in total.', progress: (s) => [s.shots, 250] },
];
const BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

function blank() {
  return {
    xp: 0,
    badges: {}, // id -> unlock timestamp
    stats: { games: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, shots: 0, hits: 0, bestStreak: 0, streak: 0 },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const p = JSON.parse(raw);
    const b = blank();
    return { ...b, ...p, stats: { ...b.stats, ...(p.stats || {}) }, badges: p.badges || {} };
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
    return levelOf(this.p.xp);
  }

  addXp(amount, label) {
    if (amount <= 0) return;
    const before = this.level;
    this.p.xp += amount;
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
      const [cur, goal] = b.progress(this.p.stats);
      if (cur >= goal) this.unlock(b.id);
    }
  }

  // --- Game hooks ------------------------------------------------------------------------

  beginGame({ vsAI, human, difficulty, mode }) {
    this.game = { vsAI, human, difficulty, mode, xp: [], badges: [], shots: 0, hits: 0, missStreak: 0, knightKills: 0, lost: 0, worstDiff: 0, myTurns: 0, startLevel: this.level, startXp: this.p.xp };
  }

  // `mine`: the shot was fired by a human player (always true in Pass & Play).
  onShot({ mine, shooterType, intended, victim, victimSq, friendly, ricochet, distance, chance }) {
    const g = this.game;
    if (!g) return;
    if (!mine) {
      if (victim && g.vsAI && victim.color === g.human) g.lost++;
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
      if (g.vsAI) g.lost++;
      this.unlock('oops');
      this.save();
      return;
    }
    g.hits++;
    this.p.stats.hits++;
    this.p.stats.kills++;
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
    } else {
      this.addXp(WIN_XP.local, 'Game played');
      this.unlock('hot-seat');
      if (winner && reason.startsWith('checkmate')) this.unlock('siege');
      if (winner && reason === 'the king was shot') this.unlock('regicide');
    }
    this.checkCounters();
    this.save();
    const summary = { ...g, endXp: this.p.xp, endLevel: this.level };
    this.game = null;
    return summary;
  }
}
