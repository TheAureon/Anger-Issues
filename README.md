# Anger Issues

A low-poly 3D sandbox where you vent on a mannequin with a huge toolbox. The body is built from
detachable pieces: cut the head off and stick it back on backwards, or move an arm to the stomach.
Wreck it, rebuild it, repeat. No fail state, no timer, nothing to unlock.

Built with [Three.js](https://threejs.org/) and the [Rapier](https://rapier.rs/) physics engine.

## Playing it

Open `index.html`. That's it: it's the whole game in one self-contained file (code, physics engine and
styles inlined, no network requests), so it works by double-clicking it, from GitHub Pages, or from any
static host.

## Developing

The source entry is `dev.html` (loads `src/main.js`).

```bash
npm install
```

```bash
npm run dev
```

After changing anything in `src/`, regenerate the playable `index.html`:

```bash
npm run build
```

This bundles with Vite and then runs `scripts/make-playable.mjs`, which inlines everything into the root
`index.html` (also copied to `dist/`). Commit the regenerated `index.html` along with your source changes.

## UsForge leaderboard

When the game runs inside UsForge's page (an iframe), it reports one score per run to the parent
page with `window.postMessage({ usforge: 'score', score, unit: 'points' }, '*')` via
`sendScoreToUsForge` in `src/usforge.js`. UsForge asks for the nickname and shows the board; the game
itself never does. Opened on its own, nothing is sent.

- **Run:** one mannequin, from the moment a fresh one appears.
- **Ends:** exactly once, at full teardown (every joint broken) or when the mannequin is replaced
  (New mannequin, X, or a room change), whichever comes first.
- **Score:** the destruction points earned on that mannequin. It's the action XP, combos included,
  without one-off bonuses for trying a tool, room or look for the first time or for unlocking a badge.
- **Board:** Studio (the default room) only, so scores are comparable. No score is sent from the title
  screen or for an empty run, and points after a run ends don't count until the next mannequin.

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Use the current tool | Left click / drag | One finger |
| Grab & fling (any tool) | Hold <kbd>Shift</kbd> and drag, or pick ✋ Grab | Pick ✋ Grab |
| Rotate a held piece | <kbd>R</kbd> roll, <kbd>F</kbd> turn | ⟳ / ⇆ buttons |
| Push / pull a held piece | Scroll | – |
| Orbit camera | Drag empty space, or right-drag | One finger on empty space |
| Pick a tool | <kbd>1</kbd>–<kbd>9</kbd> within the current category | Tap a tile |
| Move camera | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> up / left / down / right, <kbd>Q</kbd> / <kbd>E</kbd> out / in (<kbd>Shift</kbd> = faster) | – |
| Zoom / pan | Scroll / middle-drag | Two fingers |
| New mannequin · clear props · slow-mo | <kbd>X</kbd> · <kbd>C</kbd> · <kbd>T</kbd> | Top-right buttons |
| Close a panel | <kbd>Esc</kbd> | Tap outside it |

**Rebuilding:** drag a loose piece over the body. A green ring shows where its cut end will stick.
Let go and it attaches there, keeping the orientation you gave it, so a head can go on backwards and
an arm can go on the stomach. Re-attached pieces are normal joints: they flop, hold their pose and can
be severed again.

## What's in it

**The mannequin:** 15 rigid bodies (head, chest, pelvis, upper arms, forearms, hands, thighs, shins,
feet) joined at the neck, shoulders, elbows, wrists, waist, hips, knees and ankles. Joints break from
heavy impacts, accumulated damage, blades, or being stretched apart. Every joint has a soft "muscle"
that pulls it back to its rest pose, so the figure behaves like a stiff wooden mannequin. The 🦴 button
cycles Stiff → Loose → Ragdoll (Ragdoll switches its brain off).

**Title screen:** the game opens dark and letterboxed. A spotlight picks out your mannequin, which
stares into a low camera that slowly pushes in. The logo letters slam down one by one with a screen
thud, then PRESS ANY KEY (or TAP TO START). Starting scatters the letters, brings the lights up and
swoops the camera into the game. Room, look, gore and the name are all set from the in-game top bar.

**Music:** generated live in the browser, no audio files. The title has a dark, slow theme: pads in a
big reverb, a heartbeat kick, a drone and sparse bells. In game there's an angsty minor-key groove
that follows the chaos. It's just bass and hats when things are calm, drums come in once you start
hitting things, and a lead riff and crashes arrive during heavy carnage or when the mannequin panics.
It settles back down over time. Slow-mo muffles it, and the 🎵 button turns it off (remembered).
Browsers block sound until your first click or key press, so on a first visit the title is silent
and the music starts when you press start.

**XP, ranks and badges:** just for bragging rights, since nothing is ever locked behind them. You earn
XP for:
- hits, broken joints, explosions, knockdowns, shredding and flattening;
- rebuilding (more for putting a piece back where it belongs);
- trying a tool, room or look for the first time.

Quick chains of actions build a combo of up to ×5, and floating "+XP" numbers pop up where it happened.
Levels come with ranks, from *Mildly Annoyed* through *Seething* and *Volcanic* up to *Inner Peace*.
There are 31 badges (*Heads Will Roll*, *Wrong Way Round*, *Pancake*, *Bullseye*, *Combo King*,
*Zen*, ...), each announced with a toast and a chime. The level chip in the top bar opens your
profile: rank, XP, lifetime stats, and every badge with progress bars. Progress is saved locally and
can be reset from the profile.

**Interface:** the top bar shows the logo and your level and XP on the left, and New mannequin, Clear,
Slow-mo and ⚙️ Settings on the right. Settings slides in from the right (a bottom sheet on phones) and
holds the name, look, room, gore, joints, music and sound, plus links to your badges and the help
card. Tools sit in a dock at the bottom: category tabs, big tiles for the tools in that category,
and the selected tool's tip above them. Number keys pick a tool within the current category.

**Name it:** in ⚙️ Settings (or click the floating name tag above its head), with a 🎲 for random
suggestions. The name stays over its head, even when that head is
rolling around on its own, and it's remembered next time you play.

**It has a mind of its own:** the mannequin balances on its own feet and wanders around the room,
pausing to look around. Hit it hard and it falls over, lies there a moment, then gets back up. It
limps on damaged legs and drags itself along with its arms if it loses both legs. Its eyes blink and
follow things, and it breathes. Loose pieces hop back toward the body.

**It's afraid of you:**
- A sudden threat makes it startle and freeze for a moment, then run away, glancing back at the danger.
- It backs away, still facing you, when you hover a weapon near it.
- It crouches and covers its head when it's cornered.
- Being hurt leaves it anxious: it keeps its distance from you, checks on you more often, breathes
  faster and trembles. This fades slowly.
- When scared, its eyes go wide with dilated pupils.

**Cartoon gore (optional):** the 🩸 button cycles Off → Cartoon (ketchup red) → Slime → Rainbow. It's
deliberately silly: glossy stretched droplets, stumps that squirt in pulses, red stump caps with a
cartoon bone, and blobby splats that stick to floors, walls and the mannequin. The press leaves a
puddle and the chipper sprays. Your choice is remembered, and Off removes everything.

**27 tools in 7 categories:**

| Category | Tools |
| --- | --- |
| Hands | Grab, Slap |
| Blunt | Hammer, Bat, Anvil drop, Spring Glove |
| Blades | Katana (swipe), Axe, Saw (hold), Guillotine |
| Ranged | Slingshot (pull back), Cannon, Bow (hold to draw; arrows stick), Ball Launcher |
| Explosives | Firecrackers, Dynamite (sticks to things), Bowling Bomb |
| Machines | Hydraulic Press, Wood Chipper, Spinning Blades, Conveyor, Trampoline |
| Chaos | Gravity Gun, Magnet, Glue Gun, Tornado, Rocket |

**Rooms** (each with its own hazards): Studio, Construction Site (wrecking ball, conveyor), Kitchen
(hot stove, giant blender, ceiling fan), Junkyard (car crusher, trampoline), Space (low gravity, black
hole).

**Skins:** Wooden, Crash dummy, Robot, Clay, Neon.

Everything is available from the start. No coins, no ads, no progression.

## Code map

```
index.html                 generated, self-contained playable build (open this to play)
dev.html                   development entry for Vite
scripts/make-playable.mjs  inlines the Vite build into index.html
src/
  main.js          boot: init Rapier, create Game + UI
  game.js          renderer, camera, input routing, fixed-step loop, props, explosions
  physics.js       Rapier world wrapper: entities (body + colliders + mesh), raycasts
  joints.js        all joints: break-by-stretch, pose-holding muscles, fixed "stick" joints
  mannequin.js     body layout, skins, sever / damage / reattach logic
  gore.js          optional cartoon gore: droplets, stump fountains, caps, splat decals
  life.js          its brain: balance, walking, getting up, crawling, fear behaviour, eyes
  rooms.js         rooms and their hazards
  fx.js            instanced particles, flashes, camera shake, 2D overlay trails
  audio.js         WebAudio synth sound effects (no audio files)
  usforge.js       UsForge leaderboard bridge (postMessage to the parent page)
  progress.js      XP, combos, ranks, badges, toasts, profile panel (saved in localStorage)
  music.js         procedural music: lookahead sequencer, synth instruments, chaos-reactive layers
  title.js         cinematic title screen: spotlight, slam-in logo, press any key, swoop into play
  ui.js, style.css toolbox, menus, help
  tools/           one file per category; each tool is { down, move, up, fixed, update }
```

Adding a tool means adding an object to one of the `tools/*.js` arrays. `down(pointer, hit)` returns
`true` to take over the gesture (otherwise the camera orbits). `fixed(dt)` runs every physics step.

## Performance notes

- Physics runs at a fixed 60 Hz with up to 4 substeps per frame.
- Props are capped at 80 (oldest removed first) and expire after a while. Placed machines are capped at 8.
- Particles use three pooled `InstancedMesh`es, so explosions don't allocate.
- Pieces that leave the world are teleported back. Nothing is ever lost, so you can always rebuild.

## Milestones (from the design doc)

1. ~~Ragdoll mannequin with grab and fling~~ (now an active ragdoll that walks)
2. ~~Sever and reattach system~~
3. ~~First 10 tools across 3 categories~~ (27 tools across 7 categories)
4. ~~First extra room and mannequin skins~~ (5 rooms, 5 skins)
5. Remaining polish: more tools and rooms, touch-control tuning on real devices, and performance
   profiling on low-end phones (the open question from the design doc).
