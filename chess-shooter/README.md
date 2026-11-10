# Gunmate

Chess, but every piece is armed. Low-poly 3D, played from the pieces' own eyes.

## Play

Open `index.html` at the repo root. It's the whole game in one self-contained file (no network, no build).

## Rules

- Pieces move exactly like chess, but only onto **empty** squares.
- Instead of capturing, you **shoot**. A kill doesn't move your piece: a rook can snipe from across the
  board and stay on its safe square.
- One action per turn: **move or shoot**.
- Gun range:
  - **Pawn**: its two diagonal capture squares.
  - **Knight**: its L squares. The bullet flies in a straight line to the target, not in an L, so it can
    clip pieces in between.
  - **King**: the 8 squares around it.
  - **Rook / bishop / queen**: along their lines, half their movement (4 squares). The line must be clear.
- You can **miss**. Each gun has some wobble, so long shots miss more. Bullets are real rays: they hit
  the first thing in their path (even your own pieces), fly over short pieces, or hit the floor. Hovering
  a target shows its hit chance.
- Castling and promotion work as in chess (no en passant: pawns don't capture by moving).
- **Classic**: kings are bulletproof (shots ricochet). Check means the king is inside an enemy gun's
  reach, you can't leave your king in check, and checkmate (the siege) wins. Stalemate is a draw.
- **MerciZero**: no check rules. Shoot the enemy king to win. Shoot your own and you lose.
- Draw after 50 turns each without a kill or pawn move, or when only kings remain.

## Controls

| Action | How |
| --- | --- |
| See through a piece | Click one of your pieces in 3D or on the corner board. <kbd>Q</kbd>/<kbd>E</kbd> cycle |
| Move | Click a green-dot square (3D or corner board) |
| Shoot | Click a red-marked enemy. In first person you aim where you click |
| Look around | Drag, or arrow keys / WASD |
| Zoom sights | Scroll |
| Overview camera | <kbd>V</kbd> or the 🗺️ button |
| Music on/off | <kbd>M</kbd> or the 🎵 button (🔊 mutes everything) |
| Pause | <kbd>Esc</kbd> or ⏸ |

You start in your king's POV, with the full board in the corner.

## Pass & Play (local multiplayer, no internet)

Play a friend on one computer or phone: take your turn, then hand the device over.

- Enter both players' names in setup (⇅ swaps who plays White).
- After each turn a **pass screen** covers the board: "Pass the device to Sam". It recaps what the
  other player just did ("Alex's rook shot your knight on f6"), warns you if your king is threatened,
  and waits until the next player taps **I'm Sam, start my turn**. You then look through your own
  pieces, from your side of the board.
- The pass screen can be turned off in setup if you're both watching the screen anyway.
- **Play again** swaps sides so the other player gets White. <kbd>Esc</kbd> on the pass screen pauses.
- Names are remembered for next time. XP and badges from Pass & Play go to this device's profile.

## Menus and difficulty

Title screen → main menu (Play vs Computer, Pass & Play, How to Play, Settings) → game setup (mode,
difficulty, your side). <kbd>Esc</kbd> pauses (resume, restart, settings, quit). Settings: music and
effects volume, look sensitivity, field-of-fire tint, control hints. Choices are remembered.

| Level | Aim | Thinking |
| --- | --- | --- |
| ★ Recruit | shaky (1.6× wobble) | judges only its own move, blunders 1 in 4 turns |
| ★★ Soldier | decent (1.12×) | considers your best reply |
| ★★★ Sniper | steady (0.92×) | considers your best reply, no randomness |
| ★★★★ Warlord | deadly (0.8×) | three plies: its move, your reply, its answer |

You can play White, Black, or let a coin toss decide.

## XP, ranks and badges

You earn XP for kills (pawn 5, knight/bishop 15, rook 25, queen 45, king 60, +5 for hits from 3+
squares), promotions, and finishing games: a win is worth 60 / 120 / 180 / 300 XP against Recruit /
Soldier / Sniper / Warlord, plus a streak bonus; draws give 40, losses 20, Pass & Play games 40. Each
badge is worth another 50 XP.

Levels need 100, 300, 600, 1000… XP in total, and every two levels give a new rank, from Private up
to Grandmaster. Your level, XP bar and badge count are on the main menu; **Badges & Stats** shows all
35 badges (locked ones say how to get them, counters show progress) plus your record: games, wins,
kills, accuracy and best win streak. The game-over screen lists what you earned that game.

Progress is saved in the browser on this device. Settings has a reset button.

## Campaign

12 battles in 3 chapters (main menu → **Campaign**). Each battle has a twist and three stars: win,
win fast (your turns), and win clean (pieces lost). Winning a battle opens the next one; chapters
need stars (chapter 2: 6★, chapter 3: 15★). Every new star is worth 40 XP, and finishing a chapter
unlocks an exclusive skin you can't buy: **War Table** board, **Veteran** pieces, **Medal of Honor**
guns.

| # | Battle | Twist |
| --- | --- | --- |
| 1 | First Drill | Standard game vs Recruit |
| 2 | Pawn Storm | Kings and pawns only (MerciZero) |
| 3 | Cavalry Charge | Four knights a side (MerciZero) |
| 4 | Sniper Nest | Soldier brain with sharpshooter aim |
| 5 | Fog Patrol | Fog of War vs Recruit |
| 6 | Outgunned | You have no queen; they have no rooks |
| 7 | Rook Rampage | Rooks, pawns and kings (Classic) |
| 8 | Against the Clock | Shoot the king within 70 turns |
| 9 | Night Raid | Fog of War vs Soldier |
| 10 | Iron Wall | Four extra enemy pawns in the centre |
| 11 | Blitzkrieg | Sharpshooting general, 60-turn deadline |
| 12 | The Warlord | Warlord difficulty, Classic |

Campaign games give normal XP and badges but never post to the UsForge leaderboard.

## Daily contracts

Three contracts a day on the main menu (one kill task, one win task, one misc task, picked from 20),
e.g. "Get 3 kills with pawns", "Win losing 3 pieces or fewer", "Castle your king". They reset at
local midnight, pay 50–140 XP each, and only count against the computer. Your **first win of the
day** pays double victory XP. The pause menu shows today's contracts too.

## Fog of War

A third mode, unlocked at level 5. MerciZero rules (shoot the king), but you only see enemies your
pieces can see: squares next to them, squares they can move to or shoot, and along their lines up to
the first piece. Unseen squares are darkened and enemies there are hidden, in 3D and on the corner
board. The computer can only shoot at pieces it can see. In Pass & Play the fog follows whoever holds
the device, and the turn recap won't reveal moves made in the fog.

## Shop

Spend XP on cosmetic skins from the main menu's **Shop**. Your level is based on all the XP you've
ever earned, so spending never lowers your level or rank; the shop uses a separate balance (earned
minus spent). Click any skin to preview it live on the board behind the shop, then buy or equip it.
Previews you don't buy are undone when you leave. Some premium skins also need a minimum level.

| Category | Skins (price in XP, level needed) |
| --- | --- |
| Pieces | Classic (free), Carved Wood 150, Candy 250, Camo 350, Marble 500, Neon 750 (Lv 4), Chrome 1000 (Lv 6), Gold & Obsidian 1500 (Lv 8) |
| Board | Walnut (free), Tournament 100, Desert 200, Marble 350, Glacier 500, Sweet Shop 500, Lava Field 900 (Lv 5) |
| Guns | Gunmetal (free), Desert Tan 100, Tiger 250, Arctic 300, Bubblegum 300, Plasma 700 (Lv 3), Solid Gold 1200 (Lv 7) |

Two shop badges: Fashionista (first purchase) and Collector (own 10 skins).

Badges: First Blood, Pawn Power, Royal Revolver, Cavalry Charge (3 knight kills in a game), Max Range
(kill from 4 squares), Long Shot (kill under 50% hit chance), Queenslayer, Lucky Stray, Oops (friendly
fire), Bulletproof (ricochet off a king), Stormtrooper (4 misses in a row), Field Promotion, Castle
Keep, Siege Master, Regicide, Untouchable (win losing nothing), Deadeye (win with 100% accuracy),
Comeback Kid (win from 5+ material down), Blitz (win in 20 turns), one for beating each difficulty,
Hot Seat, Fashionista, Collector, Fog Walker (win a Fog of War game), Graduate / Front-Line
Veteran / High Command (finish each campaign chapter), Decorated (all 36 stars), Contractor (10
contracts), Veteran (10 games), Centurion (100 kills), Trigger Happy (250 shots).

## UsForge leaderboard

When the game runs inside UsForge's page (in an iframe), it reports one score per game to the page
with `window.postMessage({ usforge: 'score', score, unit: 'points' }, '*')`. UsForge asks for the
nickname and shows the top 10; the game never asks for a name. Opened on its own, nothing is sent.

Only one mode counts, so scores are comparable: **Classic vs the computer on Soldier** (the default
mode and difficulty), with either side. Pass & Play, MerciZero and the other difficulties send nothing.
The score is sent once, when the game ends (`reportLeaderboardScore` in `src/main.js`, called from
`gameOver`):

- 10 points per point of enemy material you shoot (pawn 1, knight/bishop 3, rook 5, queen 9; promoted pieces count too)
- +500 for a win, plus 10 for each of your turns under 50 (faster wins score more)
- +150 for a draw

## Music

The soundtrack is generated live in code (no audio files): a looping D-minor march. It's calm pads
and bass on the menu, adds drums, an arpeggio and a melody once the battle starts, and gets tenser
(faster hats, snare rolls, a low pulse) whenever your king is in an enemy gun's reach.

## Code

```
dev.html          Vite entry
src/rules.js      pure rules: moves, gun reach, check, ballistics (runs in Node)
src/ai.js         computer opponent: 1-3 ply expectimax by difficulty, aware of hit chance
src/main.js       renderer, POV/overview camera, input, turn flow, HUD
src/pieces.js     low-poly pieces and their guns
src/world.js      board, plateau, trees, rocks, lights
src/fx.js         tracers, muzzle flash, shattering pieces
src/minimap.js    the 2D board in the corner
src/progress.js   XP, levels, ranks, stats, badges, shop wallet (saved in localStorage)
src/skins.js      shop catalogue: piece, board and gun skins
src/campaign.js   campaign chapters, battles, star goals
src/icons.js      inline SVG icons and chess-piece silhouettes for the UI
src/audio.js      synthesized sound effects
src/music.js      procedural soundtrack (WebAudio sequencer)
```

```bash
npm run dev:chess
```

```bash
npm run build:chess
```

```bash
npm run test:chess
```

The build regenerates the root `index.html`; commit it with source changes.
