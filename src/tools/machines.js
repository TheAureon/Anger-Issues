import * as THREE from 'three';
import { RAPIER, bodyPos } from '../physics.js';
import { mat, mesh } from '../materials.js';
import { camRight, placePoint, gadget, clearOfMannequin, UP } from './util.js';

const _v = new THREE.Vector3();

function basis(right) {
  const fwd = new THREE.Vector3().crossVectors(right, UP).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, UP, fwd));
}

/* ------------------------------------------------------------------ */
/* Hydraulic press                                                     */
/* ------------------------------------------------------------------ */

export function makePress(game, at, { cycle = false, room = false, size = 0.55, color = 0xf2b632 } = {}) {
  const g = gadget(game, { room });
  g.threat = { kind: room ? 'crusher' : 'press', pos: at.clone().setY(1) };
  const top = 3.3;
  const bottom = 0.14;
  const half = size;
  const center = at.clone().setY(0);
  const group = new THREE.Group();
  const plate = mesh(new THREE.BoxGeometry(half * 2, 0.24, half * 2), mat(color, { metalness: 0.3, roughness: 0.5 }));
  const stripes = mesh(new THREE.BoxGeometry(half * 2 + 0.01, 0.06, half * 2 + 0.01), mat(0x222222));
  stripes.position.y = 0.06;
  const rod = mesh(new THREE.CylinderGeometry(0.09, 0.09, 4, 8), mat(0xb8c0c8, { metalness: 0.9, roughness: 0.2 }));
  rod.position.y = 2.1;
  group.add(plate, stripes, rod);
  const housing = mesh(new THREE.BoxGeometry(half * 1.4, 0.6, half * 1.4), mat(0x444a52, { metalness: 0.5 }));
  housing.position.set(center.x, top + 2.4, center.z);
  g.show(housing);
  const slab = g.own(
    game.physics.create({
      body: RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, top, center.z),
      colliders: [RAPIER.ColliderDesc.cuboid(half, 0.12, half).setFriction(1)],
      mesh: group,
      kind: 'gadget',
    }),
  );
  let y = top;
  let phase = 'down';
  let wait = 0;
  let loop = game.sfx.loop('grind');
  g.loops.push(loop);
  g.fixed = (dt) => {
    if (phase === 'down') {
      y -= 1.3 * dt;
      if (y <= bottom) {
        y = bottom;
        phase = 'hold';
        wait = 0.6;
        game.sfx.thud(1);
        game.fx.shake(0.1);
        game.fx.smoke(center.clone().setY(0.05), { count: 10, color: 0xb0a89a, size: 0.12, speed: 1.6, up: 0.3 });
      }
    } else if (phase === 'hold') {
      wait -= dt;
      if (wait <= 0) phase = 'up';
    } else if (phase === 'up') {
      y += 0.9 * dt;
      if (y >= top) {
        y = top;
        if (cycle) {
          phase = 'wait';
          wait = 3;
          loop.stop();
        } else return g.dispose();
      }
    } else if (phase === 'wait') {
      wait -= dt;
      if (wait <= 0) {
        phase = 'down';
        loop = game.sfx.loop('grind');
        g.loops.push(loop);
      }
    }
    slab.body.setNextKinematicTranslation({ x: center.x, y, z: center.z });
    // Crush: anything trapped under a nearly-closed press gets flattened and popped off.
    const plateBottom = y - 0.12;
    if (phase === 'down' && plateBottom < 0.5) {
      for (const e of game.mannequin.parts) {
        bodyPos(e.body, _v);
        if (Math.abs(_v.x - center.x) > half || Math.abs(_v.z - center.z) > half || _v.y > plateBottom + 0.02) continue;
        if (e.flat) continue;
        e.flat = true;
        game.progress?.ev('flat', { pos: _v.clone() });
        game.gore?.puddle(_v, 0.35 + Math.random() * 0.2);
        game.gore?.burst(_v.clone().setY(0.1), { count: 30, speed: 4, spread: 1.2 });
        e.mesh.scale.set(1.35, 0.35, 1.35);
        for (const j of [...e.joints]) game.mannequin.sever(j);
      }
    }
  };
  return game.addGadget(g);
}

/* ------------------------------------------------------------------ */
/* Wood chipper / blender                                              */
/* ------------------------------------------------------------------ */

export function makeChipper(game, at, right, { room = false, look = 'chipper' } = {}) {
  const g = gadget(game, { room });
  g.threat = { kind: look === 'blender' ? 'blender' : 'chipper', pos: at.clone().setY(0.6) };
  const q = basis(right);
  const center = at.clone().setY(0);
  const W = 0.55;
  const H = 1.1;
  const body = RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, 0, center.z).setRotation(q);
  const t = 0.05;
  const cds = [
    RAPIER.ColliderDesc.cuboid(W, 0.05, W).setTranslation(0, 0.05, 0),
    RAPIER.ColliderDesc.cuboid(t, H / 2, W).setTranslation(-W, H / 2, 0),
    RAPIER.ColliderDesc.cuboid(t, H / 2, W).setTranslation(W, H / 2, 0),
    RAPIER.ColliderDesc.cuboid(W, H / 2, t).setTranslation(0, H / 2, -W),
    RAPIER.ColliderDesc.cuboid(W, H / 2, t).setTranslation(0, H / 2, W),
  ];
  const sensorDesc = RAPIER.ColliderDesc.cuboid(W - t, 0.35, W - t).setTranslation(0, 0.4, 0).setSensor(true);
  const group = new THREE.Group();
  const isBlender = look === 'blender';
  const isShredder = look === 'shredder';
  const wallMat = isBlender ? mat(0xbfe6ff, { opacity: 0.35, roughness: 0.1 }) : isShredder ? mat(0x34373d, { roughness: 0.5, metalness: 0.3 }) : mat(0x2f8f3a, { roughness: 0.6 });
  for (const cd of cds.slice(1)) {
    const tr = cd.translation;
    const sh = cd.shape.halfExtents;
    const m = mesh(new THREE.BoxGeometry(sh.x * 2, sh.y * 2, sh.z * 2), wallMat, { cast: !isBlender });
    m.position.set(tr.x, tr.y, tr.z);
    group.add(m);
  }
  const floor = mesh(new THREE.BoxGeometry(W * 2, 0.1, W * 2), mat(0x333333));
  floor.position.y = 0.05;
  group.add(floor);
  const rotor = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.BoxGeometry(W * 1.7, 0.03, 0.08), mat(0xcfd6dd, { metalness: 0.9, roughness: 0.2 }));
    b.rotation.y = (i * Math.PI) / 3;
    rotor.add(b);
  }
  rotor.position.y = 0.2;
  group.add(rotor);
  if (!isBlender) {
    const chute = mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), isShredder ? mat(0x34373d) : mat(0x2f8f3a));
    chute.position.set(W + 0.25, 0.8, 0);
    chute.rotation.z = -0.4;
    group.add(chute);
    const engine = mesh(new THREE.BoxGeometry(0.5, 0.4, 0.6), mat(0x333333));
    engine.position.set(-W - 0.25, 0.2, 0);
    group.add(engine);
  } else {
    const base = mesh(new THREE.CylinderGeometry(W * 1.1, W * 1.25, 0.25, 8), mat(0xeeeeee));
    base.position.y = -0.02;
    group.add(base);
  }
  const e = g.own(game.physics.create({ body, colliders: [...cds, sensorDesc], mesh: group, kind: 'static' }));
  const sensor = e.colliders[e.colliders.length - 1];
  const exitDir = isBlender ? UP.clone() : right.clone();
  const cool = new Map();
  let loop = null;
  let active = 0;
  g.fixed = (dt) => {
    active -= dt;
    const inside = [];
    game.physics.sensorHits(sensor, (o) => {
      if (o.body.isDynamic()) inside.push(o);
    });
    for (const o of inside) {
      if ((cool.get(o) || 0) > game.time) continue;
      cool.set(o, game.time + 0.5);
      active = 0.6;
      if (o.kind === 'part') for (const j of [...o.joints]) game.mannequin.sever(j, { quiet: true });
      const p = isBlender
        ? center.clone().setY(H + 0.25)
        : center.clone().addScaledVector(right, W + 0.55).setY(0.95);
      if (o.kind === 'part') {
        game.progress?.ev('shred', { pos: p });
        game.gore?.shred(p, exitDir);
      }
      o.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      const v = exitDir.clone().multiplyScalar(isBlender ? 7 : 8).add(new THREE.Vector3((Math.random() - 0.5) * 2, isBlender ? 0 : 4, (Math.random() - 0.5) * 2));
      o.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      o.body.setAngvel({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 }, true);
      const colors = o.kind === 'part' ? game.mannequin.skin.chips : [0x999999, 0x666666];
      game.fx.burst(p, { count: 25, colors, speed: 5, size: 0.03, dir: exitDir, spread: 1, life: 1.5 });
      game.sfx.crack();
      game.fx.shake(0.03);
    }
    if (active > 0 && !loop) {
      loop = game.sfx.loop('grind');
      g.loops.push(loop);
    } else if (active <= 0 && loop) {
      loop.stop();
      loop = null;
    }
  };
  g.update = (dt) => {
    rotor.rotation.y += dt * (active > 0 ? 30 : 8);
  };
  return game.addGadget(g);
}

/* ------------------------------------------------------------------ */
/* Spinning blades                                                     */
/* ------------------------------------------------------------------ */

export function makeSpinner(game, at, { room = false, height = null, lifetime = 14, speed = 16, radius = 0.75, look = 'blades' } = {}) {
  const g = gadget(game, { room, lifetime });
  if (look !== 'fan') g.threat = { kind: 'blades', pos: at.clone().setY(height ?? THREE.MathUtils.clamp(at.y, 0.35, 1.6)) };
  const h = height ?? THREE.MathUtils.clamp(at.y, 0.35, 1.6);
  const c = at.clone().setY(h);
  const steel = mat(0xdfe6ee, { metalness: 0.9, roughness: 0.2 });
  const group = new THREE.Group();
  const cds = [];
  for (let i = 0; i < 2; i++) {
    const rot = new THREE.Quaternion().setFromAxisAngle(UP, (i * Math.PI) / 2);
    cds.push(RAPIER.ColliderDesc.cuboid(radius, 0.015, 0.06).setRotation(rot));
    const b = mesh(new THREE.BoxGeometry(radius * 2, 0.03, 0.12), look === 'fan' ? mat(0x8b5a2b) : steel);
    b.quaternion.copy(rot);
    group.add(b);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), mat(0x333333));
  group.add(hub);
  const sensor = RAPIER.ColliderDesc.cylinder(0.06, radius + 0.03).setSensor(true);
  const e = g.own(
    game.physics.create({
      body: RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(c.x, c.y, c.z).setAngvel({ x: 0, y: speed, z: 0 }),
      colliders: [...cds, sensor],
      mesh: group,
      kind: 'gadget',
    }),
  );
  if (look !== 'fan') {
    const pole = mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 6), mat(0x444444));
    pole.position.set(c.x, h / 2 - 0.04, c.z);
    g.show(pole);
  } else {
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 4 - h, 6), mat(0x444444));
    pole.position.set(c.x, h + (4 - h) / 2, c.z);
    g.show(pole);
  }
  const sc = e.colliders[e.colliders.length - 1];
  const cool = new Map();
  const loop = game.sfx.loop('buzz');
  g.loops.push(loop);
  g.fixed = () => {
    if (g.expired()) return g.dispose();
    game.physics.sensorHits(sc, (o) => {
      if (o.kind !== 'part' || (cool.get(o) || 0) > game.time) return;
      cool.set(o, game.time + 0.25);
      const p = bodyPos(o.body);
      if (game.mannequin.severNearest(o, c.clone().setY(p.y), 0.5) || game.mannequin.severNearest(o, p)) {
        game.fx.sparks(p, { count: 10, speed: 4 });
        game.sfx.slice();
      }
    });
  };
  return game.addGadget(g);
}

/* ------------------------------------------------------------------ */
/* Trampoline                                                          */
/* ------------------------------------------------------------------ */

export function makeTrampoline(game, at, { room = false } = {}) {
  const g = gadget(game, { room });
  const c = at.clone().setY(0);
  const R = 0.85;
  const top = 0.32;
  const group = new THREE.Group();
  const pad = mesh(new THREE.CylinderGeometry(R, R, 0.04, 12), mat(0x222a3a));
  pad.position.y = top;
  const ring = mesh(new THREE.TorusGeometry(R, 0.06, 6, 16).rotateX(Math.PI / 2), mat(0x2f7cf6));
  ring.position.y = top;
  group.add(pad, ring);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, top, 5), mat(0x888888, { metalness: 0.8 }));
    leg.position.set(Math.cos(a) * R * 0.92, top / 2, Math.sin(a) * R * 0.92);
    group.add(leg);
  }
  const e = g.own(
    game.physics.create({
      body: RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, 0, c.z),
      colliders: [
        RAPIER.ColliderDesc.cylinder(0.02, R).setTranslation(0, top, 0).setRestitution(0.6),
        RAPIER.ColliderDesc.cylinder(0.1, R - 0.02).setTranslation(0, top + 0.1, 0).setSensor(true),
      ],
      mesh: group,
      kind: 'static',
    }),
  );
  const sensor = e.colliders[1];
  let squish = 0;
  g.fixed = () => {
    game.physics.sensorHits(sensor, (o) => {
      if (!o.body.isDynamic()) return;
      const v = o.body.linvel();
      if (v.y > 3) return;
      o.body.setLinvel({ x: v.x * 0.9, y: 9 + Math.random() * 2, z: v.z * 0.9 }, true);
      squish = 1;
      game.sfx.boing();
    });
  };
  g.update = (dt) => {
    squish = Math.max(0, squish - dt * 5);
    pad.position.y = top - squish * 0.08;
  };
  return game.addGadget(g);
}

/* ------------------------------------------------------------------ */
/* Conveyor belt                                                       */
/* ------------------------------------------------------------------ */

function beltTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#2a2a2a';
  x.fillRect(0, 0, 128, 32);
  x.fillStyle = '#f2c12e';
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    x.moveTo(i * 32, 0);
    x.lineTo(i * 32 + 14, 16);
    x.lineTo(i * 32, 32);
    x.lineTo(i * 32 + 8, 32);
    x.lineTo(i * 32 + 22, 16);
    x.lineTo(i * 32 + 8, 0);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeConveyor(game, at, right, { room = false, length = 3.2, speed = 2.6 } = {}) {
  const g = gadget(game, { room });
  const q = basis(right);
  const c = at.clone().setY(0);
  const L = length / 2;
  const top = 0.3;
  const tex = beltTexture();
  tex.repeat.set(length * 2, 1);
  const group = new THREE.Group();
  const belt = mesh(new THREE.BoxGeometry(length, 0.06, 0.8), [
    mat(0x333333),
    mat(0x333333),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    mat(0x333333),
    mat(0x555555),
    mat(0x555555),
  ]);
  belt.position.y = top - 0.03;
  group.add(belt);
  const frame = mesh(new THREE.BoxGeometry(length + 0.1, 0.2, 0.9), mat(0x5f6670, { metalness: 0.6 }));
  frame.position.y = top - 0.16;
  group.add(frame);
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(0.08, top - 0.2, 0.7), mat(0x444444));
    leg.position.set(s * (L - 0.1), (top - 0.2) / 2, 0);
    group.add(leg);
  }
  const e = g.own(
    game.physics.create({
      body: RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, 0, c.z).setRotation(q),
      colliders: [
        RAPIER.ColliderDesc.cuboid(L, top / 2, 0.4).setTranslation(0, top / 2, 0).setFriction(1.2),
        RAPIER.ColliderDesc.cuboid(L, 0.15, 0.4).setTranslation(0, top + 0.15, 0).setSensor(true),
      ],
      mesh: group,
      kind: 'static',
    }),
  );
  const sensor = e.colliders[1];
  g.fixed = () => {
    game.physics.sensorHits(sensor, (o) => {
      if (!o.body.isDynamic()) return;
      const v = o.body.linvel();
      const along = v.x * right.x + v.z * right.z;
      const k = (speed - along) * 0.25;
      o.body.setLinvel({ x: v.x + right.x * k, y: v.y, z: v.z + right.z * k }, true);
    });
  };
  g.update = (dt) => {
    tex.offset.x -= dt * speed * 2;
  };
  g.onDispose = () => tex.dispose();
  return game.addGadget(g);
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

export function machineTools(game) {
  const place = (fn) => (p, hit) => {
    fn(placePoint(game, p, hit), hit);
    game.sfx.clank();
    return true;
  };
  return [
    {
      id: 'press',
      cat: 'machines',
      name: 'Hydraulic Press',
      icon: '🗜️',
      hint: 'Click to bring a hydraulic press down on that spot. Flattens whatever is underneath.',
      down: place((at) => makePress(game, at)),
    },
    {
      id: 'chipper',
      cat: 'machines',
      name: 'Wood Chipper',
      icon: '🌲',
      hint: 'Places a wood chipper. Throw pieces in and they get spat out the chute in bits.',
      down: place((at) => makeChipper(game, clearOfMannequin(game, at, 0.75), camRight(game))),
    },
    {
      id: 'spinner',
      cat: 'machines',
      name: 'Spinning Blades',
      icon: '🌀',
      hint: 'Places a spinning blade at the height you click. Severs anything that touches it.',
      down: place((at, hit) => makeSpinner(game, hit ? hit.point : at)),
    },
    {
      id: 'conveyor',
      cat: 'machines',
      name: 'Conveyor',
      icon: '➡️',
      hint: 'Places a conveyor belt that runs left to right. Pair it with the chipper.',
      down: place((at) => makeConveyor(game, clearOfMannequin(game, at, 0.45), camRight(game))),
    },
    {
      id: 'trampoline',
      cat: 'machines',
      name: 'Trampoline',
      icon: '🤸',
      hint: 'Places a trampoline. Anything that lands on it bounces high.',
      down: place((at) => makeTrampoline(game, clearOfMannequin(game, at, 0.9))),
    },
  ];
}
