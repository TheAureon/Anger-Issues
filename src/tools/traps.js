import * as THREE from 'three';
import { RAPIER, bodyPos } from '../physics.js';
import { mat, mesh } from '../materials.js';
import { placePoint, gadget, UP } from './util.js';

/*
 * Traps: placed on the floor, they wait for the (now free-roaming) mannequin
 * to wander into them.
 */

const _v = new THREE.Vector3();

/** Fixed body with a visual group and one sensor collider. */
function trapBody(game, g, at, groupMesh, sensorDesc) {
  const e = g.own(
    game.physics.create({
      body: RAPIER.RigidBodyDesc.fixed().setTranslation(at.x, 0, at.z),
      colliders: [sensorDesc.setSensor(true)],
      mesh: groupMesh,
      kind: 'static',
    }),
  );
  return { e, sensor: e.colliders[0] };
}

/** Is this one of the body parts still attached to the walking mannequin? */
function onMainBody(game, o) {
  const chest = game.mannequin.byName?.chest;
  return o.kind === 'part' && chest?.alive && game.mannequin.graph(chest).set.has(o);
}

export function makeMine(game, at) {
  const g = gadget(game);
  const group = new THREE.Group();
  const disc = mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.06, 10), mat(0x3d4a2f, { roughness: 0.8 }));
  disc.position.y = 0.03;
  const cap = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.04, 8), mat(0x2a2f24, { metalness: 0.4 }));
  cap.position.y = 0.075;
  const led = mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  led.position.set(0.11, 0.07, 0);
  group.add(disc, cap, led);
  const { sensor } = trapBody(game, g, at, group, RAPIER.ColliderDesc.cylinder(0.08, 0.24).setTranslation(0, 0.08, 0));
  const armAt = game.time + 1;
  g.fixed = () => {
    if (game.time < armAt) return;
    let trig = null;
    game.physics.sensorHits(sensor, (o) => {
      if (!trig && o.body.isDynamic()) trig = o;
    });
    if (!trig) return;
    if (trig.kind === 'part') game.progress?.ev('mine', { pos: at.clone().setY(0.5) });
    g.dispose();
    game.explode(at.clone().setY(0.15), 2.4, 15, 2.4);
  };
  g.update = () => {
    led.visible = game.time < armAt ? Math.sin(game.time * 30) > 0 : Math.sin(game.time * 5) > 0.6;
  };
  return game.addGadget(g);
}

export function makeBearTrap(game, at) {
  const g = gadget(game);
  const group = new THREE.Group();
  const metal = mat(0x6d6f73, { metalness: 0.8, roughness: 0.35 });
  const base = mesh(new THREE.TorusGeometry(0.2, 0.02, 5, 16).rotateX(Math.PI / 2), metal);
  base.position.y = 0.03;
  const plate = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.015, 10), mat(0x8a6d3b, { metalness: 0.4 }));
  plate.position.y = 0.03;
  group.add(base, plate);
  const jaws = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.03, 0);
    const jaw = mesh(new THREE.TorusGeometry(0.2, 0.016, 4, 12, Math.PI).rotateX(Math.PI / 2), metal);
    for (let i = 0; i < 6; i++) {
      const tooth = mesh(new THREE.ConeGeometry(0.018, 0.05, 4), metal);
      const a = ((i + 0.5) / 6) * Math.PI;
      tooth.position.set(Math.cos(a) * 0.19, 0.025, Math.sin(a) * 0.19);
      jaw.add(tooth);
    }
    jaw.rotation.y = s > 0 ? 0 : Math.PI;
    pivot.add(jaw);
    group.add(pivot);
    jaws.push({ pivot, s });
  }
  const { e, sensor } = trapBody(game, g, at, group, RAPIER.ColliderDesc.cylinder(0.06, 0.17).setTranslation(0, 0.06, 0));
  let caught = null;
  let closed = 0;
  let readyAt = game.time + 0.8;
  g.fixed = () => {
    if (caught) {
      if (!caught.j.alive || game.time > caught.until) {
        if (caught.j.alive) game.joints.remove(caught.j);
        caught = null;
        readyAt = game.time + 2.5;
        game.sfx.clank();
      }
      return;
    }
    if (game.time < readyAt) return;
    let prey = null;
    game.physics.sensorHits(sensor, (o) => {
      if (!prey && o.kind === 'part' && o !== game.grabbedEntity) prey = o;
    });
    if (!prey) return;
    const p = bodyPos(prey.body);
    const j = game.joints.fixedNow(e, prey, p, { kind: 'attach', breakDist: 0.35, strength: 99 });
    caught = { j, until: game.time + 7 };
    game.mannequin.damage(prey, 0.35, p);
    game.gore?.burst(p, { count: 14, speed: 2.5 });
    game.sfx.clank();
    game.sfx.crack();
    game.fx.shake(0.05);
    game.life?.startle(p, 0.6);
    game.progress?.ev('beartrap', { pos: p.clone().setY(p.y + 0.4) });
  };
  g.update = (dt) => {
    closed += ((caught ? 1 : 0) - closed) * Math.min(1, dt * (caught ? 30 : 4));
    for (const { pivot, s } of jaws) pivot.rotation.x = s * (1 - closed) * -1.25 + s * 0.05;
  };
  return game.addGadget(g);
}

export function makeBanana(game, at) {
  const g = gadget(game);
  const group = new THREE.Group();
  const peel = mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10, Math.PI * 0.9), mat(0xf7d13a, { roughness: 0.5 }));
  peel.rotation.x = -Math.PI / 2;
  peel.scale.set(1, 1, 0.5);
  peel.position.y = 0.02;
  const tip = mesh(new THREE.ConeGeometry(0.02, 0.04, 5), mat(0x5a3a1a));
  tip.position.set(0.12, 0.02, 0);
  tip.rotation.z = -Math.PI / 2;
  group.add(peel, tip);
  for (const a of [0.8, 2.2, -2.6]) {
    const flap = mesh(new THREE.BoxGeometry(0.1, 0.008, 0.04), mat(0xf2c82a));
    flap.position.set(Math.cos(a) * 0.08, 0.01, Math.sin(a) * 0.08);
    flap.rotation.y = -a;
    group.add(flap);
  }
  const { e, sensor } = trapBody(game, g, at, group, RAPIER.ColliderDesc.cylinder(0.08, 0.16).setTranslation(0, 0.08, 0));
  let readyAt = game.time + 0.5;
  g.fixed = () => {
    if (game.time < readyAt) return;
    let foot = null;
    game.physics.sensorHits(sensor, (o) => {
      if (!foot && onMainBody(game, o)) foot = o;
    });
    if (!foot || game.life?.state !== 'stand') return;
    readyAt = game.time + 2.5;
    const h = game.life.heading;
    const fwd = _v.set(Math.sin(h), 0, Math.cos(h));
    // Feet shoot forward, the rest goes down.
    for (const n of ['footL', 'footR', 'shinL', 'shinR']) {
      const b = game.mannequin.byName[n];
      if (b?.alive) b.body.setLinvel({ x: fwd.x * 5, y: 3, z: fwd.z * 5 }, true);
    }
    game.life.knockDown(1.8);
    game.sfx.squeak();
    game.sfx.whoosh();
    game.progress?.ev('banana', { pos: at.clone().setY(1) });
    // The peel skids away.
    const t = e.body.translation();
    e.body.setTranslation({ x: t.x + fwd.x * 0.6, y: 0, z: t.z + fwd.z * 0.6 }, true);
    g.spin = 1;
  };
  g.update = (dt) => {
    if (g.spin > 0) {
      g.spin -= dt * 2;
      group.rotation.y += dt * 20 * g.spin;
    }
  };
  return game.addGadget(g);
}

export function makeSpikes(game, at) {
  const g = gadget(game);
  const group = new THREE.Group();
  const plate = mesh(new THREE.BoxGeometry(0.95, 0.06, 0.95), mat(0x3b3f45, { metalness: 0.5, roughness: 0.5 }));
  plate.position.y = 0.03;
  group.add(plate);
  const spikes = new THREE.Group();
  const steel = mat(0xcfd6dd, { metalness: 0.9, roughness: 0.2 });
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      const s = mesh(new THREE.ConeGeometry(0.045, 0.5, 5), steel);
      s.position.set(-0.33 + i * 0.22, 0.25, -0.33 + k * 0.22);
      spikes.add(s);
    }
  }
  group.add(spikes);
  const { sensor } = trapBody(game, g, at, group, RAPIER.ColliderDesc.cuboid(0.47, 0.35, 0.47).setTranslation(0, 0.38, 0));
  const period = 2.6;
  let t0 = game.time;
  let wasUp = false;
  g.fixed = () => {
    const ph = (game.time - t0) % period;
    const up = ph < 0.55;
    if (up && !wasUp) {
      game.sfx.slice();
      game.physics.sensorHits(sensor, (o) => {
        if (!o.body.isDynamic()) return;
        const v = o.body.linvel();
        o.body.setLinvel({ x: v.x, y: v.y + 6, z: v.z }, true);
        if (o.kind === 'part') {
          const p = bodyPos(o.body);
          game.mannequin.damage(o, 0.5, p.clone().setY(0));
          game.gore?.burst(p, { count: 12, speed: 3, dir: UP, spread: 1 });
        }
      });
    }
    wasUp = up;
  };
  g.update = () => {
    const ph = (game.time - t0) % period;
    const k = ph < 0.08 ? ph / 0.08 : ph < 0.45 ? 1 : ph < 0.75 ? 1 - (ph - 0.45) / 0.3 : 0;
    spikes.position.y = -0.48 + k * 0.48;
  };
  return game.addGadget(g);
}

export function trapTools(game) {
  const place = (fn) => (p, hit) => {
    fn(placePoint(game, p, hit));
    game.sfx.clank();
    return true;
  };
  return [
    {
      id: 'mine',
      cat: 'traps',
      name: 'Land Mine',
      icon: '🔴',
      hint: 'Bury a mine. It arms after a second and goes off when anything steps on it.',
      down: place((at) => makeMine(game, at)),
    },
    {
      id: 'beartrap',
      cat: 'traps',
      name: 'Bear Trap',
      icon: '🪤',
      hint: 'Snaps shut on whatever steps in. If it keeps walking, it might leave a foot behind.',
      down: place((at) => makeBearTrap(game, at)),
    },
    {
      id: 'banana',
      cat: 'traps',
      name: 'Banana Peel',
      icon: '🍌',
      hint: 'A classic. Walk over it and down it goes.',
      down: place((at) => makeBanana(game, at)),
    },
    {
      id: 'spikes',
      cat: 'traps',
      name: 'Spike Trap',
      icon: '🔺',
      hint: 'Spikes shoot up every few seconds.',
      down: place((at) => makeSpikes(game, at)),
    },
  ];
}
