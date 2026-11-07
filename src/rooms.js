import * as THREE from 'three';
import { RAPIER, bodyPos } from './physics.js';
import { mat, mesh } from './materials.js';
import { makePress, makeChipper, makeSpinner, makeConveyor, makeTrampoline } from './tools/machines.js';
import { forDynamic } from './tools/util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Shared room scaffolding: tracks statics, meshes, hazards for clean disposal. */
function roomKit(game) {
  const r = {
    entities: [],
    meshes: [],
    gadgets: [],
    updates: [],
    fixeds: [],
    show(m) {
      game.scene.add(m);
      r.meshes.push(m);
      return m;
    },
    staticBox(pos, half, color, { rot = 0, opts = {}, visible = true } = {}) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      const m = visible ? mesh(new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2), mat(color, opts)) : null;
      const e = game.physics.create({
        body: RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]).setRotation(q),
        colliders: [RAPIER.ColliderDesc.cuboid(...half).setFriction(0.8)],
        mesh: m,
        kind: 'static',
      });
      e.disposeMesh = true;
      r.entities.push(e);
      return e;
    },
    dynamic(e) {
      // Room-owned dynamic props (not cleared by the Clear button).
      const i = game.props.indexOf(e);
      if (i >= 0) game.props.splice(i, 1);
      e.lifetime = 0;
      r.entities.push(e);
      return e;
    },
    hazard(g) {
      g.room = true;
      r.gadgets.push(g);
      return g;
    },
    floor(color, size = 14, { tex = null } = {}) {
      const m = mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), tex ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }) : mat(color, { roughness: 0.95 }), { cast: false });
      r.show(m);
      r.staticBox([0, -0.5, 0], [40, 0.5, 40], color, { visible: false });
    },
    walls(color, { size = 14, height = 4.2 } = {}) {
      // "Dollhouse" box: inner faces only, so near walls vanish when orbiting outside.
      const box = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), mat(color, { side: THREE.BackSide, roughness: 1 }));
      box.position.y = height / 2 - 0.001;
      box.receiveShadow = true;
      r.show(box);
      const h = size / 2;
      for (const [x, z, hx, hz] of [[h + 0.5, 0, 0.5, h], [-h - 0.5, 0, 0.5, h], [0, h + 0.5, h, 0.5], [0, -h - 0.5, h, 0.5]]) {
        r.staticBox([x, 6, z], [hx, 6, hz], color, { visible: false });
      }
    },
    dispose() {
      for (const g of r.gadgets) g.dispose();
      for (const e of r.entities) game.physics.remove(e);
      for (const m of r.meshes) game.scene.remove(m);
    },
    fixed(dt) {
      for (const g of r.gadgets) g.fixed?.(dt);
      for (const f of r.fixeds) f(dt);
    },
    update(dt) {
      for (const g of r.gadgets) g.update?.(dt);
      for (const f of r.updates) f(dt);
    },
  };
  return r;
}

function checkerTexture(a, b, n = 8) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const s = 256 / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * s, j * s, s, s);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function crate(game, r, pos, size = 0.22, color = 0xb07a45) {
  return r.dynamic(
    game.spawnProp({
      shape: 'box',
      size: [size, size, size],
      mass: 6,
      pos: new THREE.Vector3(...pos),
      color,
      lifetime: 0,
    }),
  );
}

export const ROOMS = {
  studio: {
    name: 'Studio',
    icon: '🏠',
    sky: 0x2a2633,
    fog: [14, 30],
    build(game) {
      const r = roomKit(game);
      r.floor(0x8e7f72, 14, { tex: checkerTexture('#9a8b7d', '#8a7b6e', 8) });
      r.walls(0xe8dccb);
      // Skirting + a couple of toys.
      crate(game, r, [-2.2, 0.25, -1.5]);
      crate(game, r, [-2.2, 0.7, -1.5], 0.18, 0xc48a4c);
      r.dynamic(game.spawnProp({ shape: 'ball', r: 0.25, mass: 2, pos: new THREE.Vector3(2, 0.3, -1.2), color: 0xd64545, restitution: 0.6, lifetime: 0 }));
      const rug = mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.01, 10), mat(0x6d4c8a), { cast: false });
      rug.position.y = 0.005;
      r.show(rug);
      return r;
    },
  },

  construction: {
    name: 'Construction Site',
    icon: '🏗️',
    sky: 0x9cc7e8,
    fog: [18, 40],
    hemi: [0xffffff, 0x8a7a5a],
    sun: 2.6,
    build(game) {
      const r = roomKit(game);
      r.floor(0x9b8a6a, 14, { tex: checkerTexture('#a0906f', '#958564', 6) });
      r.walls(0xd9a441);
      // Girders and pallets.
      r.staticBox([-4.5, 0.15, -4.5], [1.5, 0.15, 0.15], 0xd94f2b, { opts: { metalness: 0.4 } });
      r.staticBox([-4.5, 0.45, -4.5], [1.5, 0.15, 0.15], 0xd94f2b, { opts: { metalness: 0.4 } });
      r.staticBox([4.5, 0.1, 3.5], [0.6, 0.1, 0.6], 0xa3743e);
      for (let i = 0; i < 4; i++) crate(game, r, [4.3 + (i % 2) * 0.45, 0.45 + Math.floor(i / 2) * 0.45, 3.5], 0.2, 0xb54a2c);
      for (const [x, z] of [[2.5, 2.5], [-2.5, 2.5], [3, -1]]) {
        const cone = mesh(new THREE.ConeGeometry(0.15, 0.45, 6), mat(0xff7a1a));
        r.dynamic(
          game.spawnProp({ shape: 'cylinder', half: 0.22, r: 0.12, mass: 1, pos: new THREE.Vector3(x, 0.25, z), meshObj: cone, lifetime: 0 }),
        );
      }
      // Crane + wrecking ball (swings behind the mannequin; drag the dummy into it).
      const pivot = new THREE.Vector3(0, 5.6, -2.6);
      const mast = mesh(new THREE.BoxGeometry(0.3, 6, 0.3), mat(0xf2c12e));
      mast.position.set(-3.6, 3, -2.6);
      const boom = mesh(new THREE.BoxGeometry(4, 0.25, 0.25), mat(0xf2c12e));
      boom.position.set(-1.6, 5.75, -2.6);
      r.show(mast);
      r.show(boom);
      const anchor = game.physics.create({ body: RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y, pivot.z), kind: 'stand' });
      r.entities.push(anchor);
      const ball = game.physics.create({
        body: RAPIER.RigidBodyDesc.dynamic().setTranslation(pivot.x + 2.2, pivot.y - 3.2, pivot.z).setAngularDamping(0.5),
        colliders: [RAPIER.ColliderDesc.ball(0.42).setMass(400).setRestitution(0.2)],
        mesh: mesh(new THREE.IcosahedronGeometry(0.42, 1), mat(0x2a2d33, { metalness: 0.6, roughness: 0.4 })),
        kind: 'prop',
        data: { threat: 'wreck' },
      });
      r.entities.push(ball);
      game.physics.world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 3.9, z: 0 }), anchor.body, ball.body, true);
      const chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pivot, pivot]), new THREE.LineBasicMaterial({ color: 0x222222 }));
      r.show(chain);
      r.fixeds.push(() => {
        // Keep it swinging: pump energy along the direction of travel.
        const v = ball.body.linvel();
        const sp = Math.hypot(v.x, v.z);
        const p = bodyPos(ball.body, _v);
        if (sp > 0.3 && sp < 5 && p.y < pivot.y - 3.7) {
          ball.body.applyImpulse({ x: (v.x / sp) * 40, y: 0, z: (v.z / sp) * 40 }, true);
        } else if (sp <= 0.3) ball.body.applyImpulse({ x: 400, y: 0, z: 0 }, true);
      });
      r.updates.push(() => {
        const pos = chain.geometry.attributes.position;
        const p = bodyPos(ball.body, _v);
        pos.setXYZ(1, p.x, p.y + 0.4, p.z);
        pos.needsUpdate = true;
      });
      r.hazard(makeConveyor(game, new THREE.Vector3(2.8, 0, -4.2), new THREE.Vector3(1, 0, 0), { length: 3, room: true }));
      return r;
    },
  },

  kitchen: {
    name: 'Kitchen',
    icon: '🍳',
    sky: 0x2b3a3a,
    fog: [14, 30],
    hemi: [0xfffbe8, 0x6a7a7a],
    build(game) {
      const r = roomKit(game);
      r.floor(0xdddddd, 14, { tex: checkerTexture('#e8e8e8', '#2d2d2d', 10) });
      r.walls(0xa8d8c8);
      // Counter along the back wall with a stove.
      r.staticBox([0, 0.45, -6.4], [4, 0.45, 0.6], 0xf5f0e6);
      r.staticBox([0, 0.92, -6.4], [4.05, 0.03, 0.62], 0x5a5a5a);
      r.staticBox([5.6, 1.0, -6.3], [0.6, 1.0, 0.6], 0xdfe6ee, { opts: { metalness: 0.5, roughness: 0.3 } }); // fridge
      const burners = [];
      for (const x of [-1.2, -0.6]) {
        const b = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 10), mat(0xff3b1a, { emissive: 0xff3b1a, emissiveIntensity: 0.8 }), { cast: false });
        b.position.set(x, 0.96, -6.25);
        r.show(b);
        burners.push(b.position.clone());
      }
      // Hot burners pop anything that touches them.
      r.fixeds.push(() => {
        forDynamic(game, (e) => {
          bodyPos(e.body, _v);
          for (const b of burners) {
            if (Math.abs(_v.y - b.y) < 0.25 && Math.hypot(_v.x - b.x, _v.z - b.z) < 0.25) {
              e.body.setLinvel({ x: (Math.random() - 0.5) * 2, y: 6, z: 2.5 }, true);
              game.fx.smoke(_v, { count: 4, color: 0x888888, size: 0.06 });
              game.sfx.hiss();
            }
          }
        });
      });
      // Giant blender in the corner, ceiling fan overhead.
      r.hazard(makeChipper(game, new THREE.Vector3(-5.2, 0, -5.2), new THREE.Vector3(1, 0, 0), { look: 'blender', room: true }));
      r.hazard(makeSpinner(game, new THREE.Vector3(0, 0, 0), { height: 3.4, lifetime: 0, speed: 5, radius: 1.1, look: 'fan', room: true }));
      // Some pans and fruit.
      for (let i = 0; i < 4; i++) {
        r.dynamic(
          game.spawnProp({ shape: 'ball', r: 0.08, mass: 0.3, pos: new THREE.Vector3(1 + i * 0.3, 1.1, -6.3), color: [0xff4d4d, 0xffc93a, 0x7ed957, 0xff8c1a][i], lifetime: 0 }),
        );
      }
      r.dynamic(game.spawnProp({ shape: 'cylinder', half: 0.03, r: 0.22, mass: 2, pos: new THREE.Vector3(-0.9, 1.1, -6.25), material: mat(0x2b2b2b, { metalness: 0.6 }), lifetime: 0 }));
      return r;
    },
  },

  junkyard: {
    name: 'Junkyard',
    icon: '🚙',
    sky: 0xc9a27a,
    fog: [12, 35],
    hemi: [0xffe2c0, 0x5a4a3a],
    sun: 2.4,
    build(game) {
      const r = roomKit(game);
      r.floor(0x7a6448, 14, { tex: checkerTexture('#7d6749', '#735e43', 5) });
      r.walls(0x8a8f96, { height: 3.2 });
      // Car wrecks.
      for (const [x, z, rot, c] of [[-4.2, -4, 0.3, 0x7a2f2f], [-4.6, 1.5, -0.2, 0x2f4f7a], [4.4, -1, 1.2, 0x4f6a2f]]) {
        r.staticBox([x, 0.35, z], [0.9, 0.35, 0.45], c, { rot, opts: { metalness: 0.3, roughness: 0.7 } });
        r.staticBox([x, 0.85, z], [0.5, 0.18, 0.4], c, { rot, opts: { metalness: 0.3, roughness: 0.7 } });
      }
      // Tires.
      for (let i = 0; i < 5; i++) {
        const tire = mesh(new THREE.TorusGeometry(0.2, 0.09, 6, 10).rotateX(Math.PI / 2), mat(0x1c1c1c));
        r.dynamic(
          game.spawnProp({ shape: 'cylinder', half: 0.09, r: 0.29, mass: 8, pos: new THREE.Vector3(2.5 + (i % 2) * 0.1, 0.1 + i * 0.2, 3), meshObj: tire, lifetime: 0, friction: 1 }),
        );
      }
      // Car crusher that cycles forever.
      const plat = mesh(new THREE.BoxGeometry(1.4, 0.04, 1.4), mat(0x333333));
      plat.position.set(3.2, 0.02, -3.6);
      r.show(plat);
      r.hazard(makePress(game, new THREE.Vector3(3.2, 0, -3.6), { cycle: true, size: 0.65, color: 0x9a9fa6, room: true }));
      r.hazard(makeTrampoline(game, new THREE.Vector3(-1.8, 0, 3), { room: true }));
      return r;
    },
  },

  space: {
    name: 'Space',
    icon: '🌌',
    sky: 0x05060f,
    gravity: -1.62,
    hemi: [0xbfd0ff, 0x222233],
    sun: 2.8,
    build(game) {
      const r = roomKit(game);
      // Moon platform (no walls - things drift off and get recovered).
      const moon = mesh(new THREE.CylinderGeometry(7, 6.2, 1, 14), mat(0x9a9a9f, { roughness: 1 }));
      moon.position.y = -0.5;
      r.show(moon);
      r.staticBox([0, -0.5, 0], [5, 0.5, 5], 0x9a9a9f, { visible: false });
      for (const a of [0.4, 1.3, 2.2, 3.1, 4.0, 4.9, 5.8]) {
        r.staticBox([Math.cos(a) * 5.6, -0.5, Math.sin(a) * 5.6], [1.4, 0.5, 1.4], 0x9a9a9f, { rot: a, visible: false });
      }
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 1.5 + Math.random() * 4.5;
        const crater = mesh(new THREE.CylinderGeometry(0.3 + Math.random() * 0.4, 0.2, 0.02, 8), mat(0x7a7a80), { cast: false });
        crater.position.set(Math.cos(a) * d, 0.005, Math.sin(a) * d);
        r.show(crater);
      }
      // Stars.
      const g = new THREE.BufferGeometry();
      const pts = [];
      for (let i = 0; i < 1500; i++) {
        _v.randomDirection().multiplyScalar(80 + Math.random() * 60);
        pts.push(_v.x, Math.abs(_v.y) * 0.8 + 5, _v.z);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      r.show(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true, fog: false })));
      const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 2), mat(0x3f7fd9, { roughness: 1 }));
      planet.position.set(-40, 25, -70);
      r.show(planet);
      // Floating asteroids.
      for (let i = 0; i < 5; i++) {
        const rad = 0.2 + Math.random() * 0.25;
        const m = mesh(new THREE.IcosahedronGeometry(rad, 0), mat(0x6b6157));
        const e = game.spawnProp({
          shape: 'ball',
          r: rad,
          mass: 20,
          pos: new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 3, (Math.random() - 0.5) * 8),
          meshObj: m,
          gravityScale: 0,
          angvel: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
          lifetime: 0,
        });
        r.dynamic(e);
      }
      // Black hole: pulls things in and spits them out the other side.
      const bh = new THREE.Vector3(4, 2.5, -4);
      const core = mesh(new THREE.IcosahedronGeometry(0.35, 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      core.position.copy(bh);
      const disk = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.14, 4, 24),
        new THREE.MeshBasicMaterial({ color: 0xb36bff, blending: THREE.AdditiveBlending, transparent: true }),
      );
      disk.position.copy(bh);
      disk.rotation.x = 1.2;
      r.show(core);
      r.show(disk);
      r.fixeds.push((dt) => {
        forDynamic(game, (e) => {
          bodyPos(e.body, _v);
          _w.copy(bh).sub(_v);
          const d = _w.length();
          if (d > 5) return;
          if (d < 0.4) {
            const out = bh.clone().add(_v.set(-2, 1, 3));
            e.body.setTranslation(out, true);
            e.body.setLinvel({ x: -5, y: 2, z: 7 }, true);
            if (e.kind === 'part') game.mannequin.damage(e, 0.6, bh);
            game.fx.sparks(out, { count: 16, color: 0xb36bff, speed: 3 });
            game.sfx.whoosh();
            return;
          }
          const a = Math.min(20, 6 / (d * d));
          const lv = e.body.linvel();
          e.body.setLinvel({ x: lv.x + (_w.x / d) * a * dt, y: lv.y + (_w.y / d) * a * dt, z: lv.z + (_w.z / d) * a * dt }, true);
        });
      });
      r.updates.push((dt) => {
        disk.rotation.z += dt * 2;
      });
      return r;
    },
  },
};
