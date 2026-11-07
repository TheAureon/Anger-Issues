# Anger Issues

A low-poly 3D sandbox where you vent on a mannequin with a huge toolbox. The body is built from
detachable pieces: cut the head off and stick it back on backwards, or move an arm to the stomach.
Wreck it, rebuild it, repeat. No fail state, no timer, nothing to unlock.

Built with [Three.js](https://threejs.org/) and the [Rapier](https://rapier.rs/) physics engine.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open the URL Vite prints. To build a static site (output in `dist/`, works from any sub-path):

```bash
npm run build
```

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Use the current tool | Left click / drag | One finger |
| Grab & fling (any tool) | Hold <kbd>Shift</kbd> and drag, or pick ✋ Grab | Pick ✋ Grab |
| Rotate a held piece | <kbd>R</kbd> roll, <kbd>F</kbd> turn | ⟳ / ⇆ buttons |
| Push / pull a held piece | Scroll | – |
| Orbit camera | Drag empty space, or right-drag | One finger on empty space |
| Zoom / pan | Scroll / middle-drag | Two fingers |
| New mannequin · clear props · slow-mo | <kbd>X</kbd> · <kbd>C</kbd> · <kbd>T</kbd> | Top-right buttons |

**Rebuilding:** drag a loose piece over the body. A green ring shows where its cut end will stick.
Let go and it attaches there, keeping the orientation you gave it, so a head can go on backwards and
an arm can go on the stomach. Re-attached pieces are normal joints: they flop, hold their pose and can
be severed again.

## What's in it

**The mannequin:** 15 rigid bodies (head, chest, pelvis, upper arms, forearms, hands, thighs, shins,
feet) joined at the neck, shoulders, elbows, wrists, waist, hips, knees and ankles. Joints break from
heavy impacts, accumulated damage, blades, or being stretched apart. Every joint has a soft "muscle"
that pulls it back to its rest pose, so the figure behaves like a stiff wooden mannequin. The 🦴 button
cycles Stiff → Loose → Ragdoll. The 🧍 button takes it off its stand.

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
src/
  main.js          boot: init Rapier, create Game + UI
  game.js          renderer, camera, input routing, fixed-step loop, props, explosions
  physics.js       Rapier world wrapper: entities (body + colliders + mesh), raycasts
  joints.js        all joints: break-by-stretch, pose-holding muscles, fixed "stick" joints
  mannequin.js     body layout, skins, sever / damage / reattach logic
  rooms.js         rooms and their hazards
  fx.js            instanced particles, flashes, camera shake, 2D overlay trails
  audio.js         WebAudio synth sound effects (no audio files)
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

1. ~~Ragdoll mannequin with grab and fling~~
2. ~~Sever and reattach system~~
3. ~~First 10 tools across 3 categories~~ (27 tools across 7 categories)
4. ~~First extra room and mannequin skins~~ (5 rooms, 5 skins)
5. Remaining polish: more tools and rooms, touch-control tuning on real devices, and performance
   profiling on low-end phones (the open question from the design doc).
