// Campaign: 12 battles in 3 chapters. Each battle has a twist (start position, rules, opponent) and
// three stars: win, win fast (your turns), win clean (pieces lost). Pure data.
import { CLASSIC, MERCIZERO, FOG } from './rules.js';

const STD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

export const CHAPTERS = [
  { id: 1, name: 'Boot Camp', blurb: 'Learn to fight with every piece.', need: 0, reward: { cat: 'board', id: 'board-wartable' } },
  { id: 2, name: 'Front Line', blurb: 'Odd odds, fog and deadlines.', need: 6, reward: { cat: 'pieces', id: 'pieces-veteran' } },
  { id: 3, name: 'High Command', blurb: 'The best shots in the army.', need: 15, reward: { cat: 'guns', id: 'guns-medal' } },
];

// ai: difficulty key (or { base, aim } to tweak aim). turnLimit: lose if you haven't won by then.
export const BATTLES = [
  // Chapter 1: Boot Camp
  { id: 'c1', chapter: 1, name: 'First Drill', foe: 'Sgt. Brick', mode: CLASSIC, ai: 'easy', placement: STD,
    blurb: 'A standard game against a shaky shot. Learn the ropes.', fast: 40, clean: 4 },
  { id: 'c2', chapter: 1, name: 'Pawn Storm', foe: 'Cpl. Pike', mode: MERCIZERO, ai: 'easy', placement: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3',
    blurb: 'Kings and pawns only. Shoot your way through, or promote and finish the job.', fast: 30, clean: 3 },
  { id: 'c3', chapter: 1, name: 'Cavalry Charge', foe: 'Capt. Hoof', mode: MERCIZERO, ai: 'easy', placement: 'nn2k1nn/pppppppp/8/8/8/8/PPPPPPPP/NN2K1NN',
    blurb: 'Four knights a side. Their carbines fire straight, so watch the gaps.', fast: 30, clean: 3 },
  { id: 'c4', chapter: 1, name: 'Sniper Nest', foe: 'Lt. Hawk', mode: CLASSIC, ai: { base: 'normal', aim: 0.85 }, placement: STD,
    blurb: 'A Soldier-level opponent with a sharpshooter’s aim. Don’t stand in the open.', fast: 40, clean: 5 },

  // Chapter 2: Front Line
  { id: 'c5', chapter: 2, name: 'Fog Patrol', foe: 'Scout Wren', mode: FOG, ai: 'easy', placement: STD,
    blurb: 'Fog of War: you only see what your pieces can see. Shoot the king.', fast: 35, clean: 4 },
  { id: 'c6', chapter: 2, name: 'Outgunned', foe: 'Maj. Vance', mode: MERCIZERO, ai: { base: 'normal', aim: 1.3 }, placement: '1nbqkbn1/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR',
    blurb: 'You start without your queen; they start without their rooks. Different guns, even odds.', fast: 40, clean: 5 },
  { id: 'c7', chapter: 2, name: 'Rook Rampage', foe: 'Col. Tower', mode: CLASSIC, ai: 'normal', placement: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R',
    blurb: 'Rooks, pawns and kings. Long rifles, open files, a siege to win.', fast: 40, clean: 4 },
  { id: 'c8', chapter: 2, name: 'Against the Clock', foe: 'Maj. Tick', mode: MERCIZERO, ai: 'normal', placement: STD, turnLimit: 70,
    blurb: 'Shoot the king within 70 of your turns, or the mission fails.', fast: 45, clean: 5 },

  // Chapter 3: High Command
  { id: 'c9', chapter: 3, name: 'Night Raid', foe: 'Gen. Shade', mode: FOG, ai: 'normal', placement: STD,
    blurb: 'Fog of War against a smarter enemy. Scout before you strike.', fast: 35, clean: 4 },
  { id: 'c10', chapter: 3, name: 'Iron Wall', foe: 'Gen. Bastion', mode: MERCIZERO, ai: { base: 'normal', aim: 0.9 }, placement: 'rnbqkbnr/pppppppp/8/2pppp2/8/8/PPPPPPPP/RNBQKBNR',
    blurb: 'Four extra enemy pawns hold the centre. Break the wall.', fast: 40, clean: 5 },
  { id: 'c11', chapter: 3, name: 'Blitzkrieg', foe: 'Gen. Volt', mode: MERCIZERO, ai: { base: 'normal', aim: 0.95 }, placement: STD, turnLimit: 60,
    blurb: 'A sharpshooting general, and only 60 turns to take the king.', fast: 40, clean: 4 },
  { id: 'c12', chapter: 3, name: 'The Warlord', foe: 'The Warlord', mode: CLASSIC, ai: 'brutal', placement: STD,
    blurb: 'The final battle: Warlord difficulty, Classic rules. Besiege the king.', fast: 45, clean: 5 },
];

export const STAR_XP = 40;

export function starGoals(b) {
  return [
    b.turnLimit ? `Win within ${b.turnLimit} turns` : 'Win the battle',
    `Win in ${b.fast} of your turns or fewer`,
    `Win losing ${b.clean} pieces or fewer`,
  ];
}

// Which stars a finished game earned: [win, fast, clean].
export function starsFor(b, { won, myTurns, lost }) {
  return [won, won && myTurns <= b.fast, won && lost <= b.clean];
}
