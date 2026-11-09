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
