import * as THREE from 'three';
import { RAPIER, toLocal, toWorld, bodyPos } from './physics.js';
import { mat, mesh, geo } from './materials.js';
import { HATS, FACES, OUTFITS, HEAD_SIZES } from './accessories.js';

/* ------------------------------------------------------------------ */
/* Body layout (metres, standing on y = 0, facing +z)                  */
/* ------------------------------------------------------------------ */

const P = {
  pelvis: { shape: 'pelvis', half: [0.16, 0.09, 0.1], pos: [0, 1.0, 0], mass: 8 },
  chest: { shape: 'chest', half: [0.19, 0.21, 0.11], pos: [0, 1.33, 0], mass: 14 },
  head: { shape: 'head', r: 0.12, pos: [0, 1.71, 0], mass: 4 },
};
for (const [s, x] of [['L', 1], ['R', -1]]) {
  P['upperArm' + s] = { shape: 'capsule', half: 0.09, r: 0.055, pos: [0.265 * x, 1.355, 0], mass: 2.2 };
  P['forearm' + s] = { shape: 'capsule', half: 0.085, r: 0.048, pos: [0.265 * x, 1.075, 0], mass: 1.6 };
  P['hand' + s] = { shape: 'hand', half: [0.035, 0.06, 0.024], pos: [0.265 * x, 0.88, 0], mass: 0.8 };
  P['thigh' + s] = { shape: 'capsule', half: 0.14, r: 0.072, pos: [0.095 * x, 0.72, 0], mass: 4.5 };
  P['shin' + s] = { shape: 'capsule', half: 0.15, r: 0.058, pos: [0.095 * x, 0.29, 0], mass: 3 };
  P['foot' + s] = { shape: 'foot', half: [0.045, 0.035, 0.11], pos: [0.095 * x, 0.036, 0.04], mass: 1.2 };
}
export const PARTS = P;

// [name, parent, child, world anchor, strength, joint-ball radius]
const J = [
  ['neck', 'chest', 'head', [0, 1.575, 0], 1.0, 0.045],
  ['waist', 'pelvis', 'chest', [0, 1.11, 0], 1.4, 0.075],
];
for (const [s, x] of [['L', 1], ['R', -1]]) {
  J.push(
    ['shoulder' + s, 'chest', 'upperArm' + s, [0.265 * x, 1.47, 0], 1.0, 0.06],
    ['elbow' + s, 'upperArm' + s, 'forearm' + s, [0.265 * x, 1.21, 0], 0.9, 0.05],
    ['wrist' + s, 'forearm' + s, 'hand' + s, [0.265 * x, 0.945, 0], 0.8, 0.04],
    ['hip' + s, 'pelvis', 'thigh' + s, [0.095 * x, 0.92, 0], 1.2, 0.07],
    ['knee' + s, 'thigh' + s, 'shin' + s, [0.095 * x, 0.505, 0], 1.0, 0.058],
    ['ankle' + s, 'shin' + s, 'foot' + s, [0.095 * x, 0.08, 0], 0.8, 0.045],
  );
}
export const JOINT_DEFS = J;

/* ------------------------------------------------------------------ */
/* Skins                                                               */
/* ------------------------------------------------------------------ */

const CLAY = [0xf4a6a6, 0xa6d8f4, 0xb8f4a6, 0xf4e3a6, 0xd1a6f4, 0xf4c6a6];

export const SKINS = {
  wood: {
    name: 'Wooden',
    icon: '🪵',
    body: () => mat(0xd9a066, { roughness: 0.75 }),
    joint: mat(0x8a5a2b),
    face: mat(0x5b3a1c),
    sclera: mat(0xf5efe3),
    chips: [0xd9a066, 0xc48a4c, 0xe8bd85],
  },
  crash: {
    name: 'Crash dummy',
    icon: '🚗',
    body: () => mat(0xf2c12e, { roughness: 0.55 }),
    joint: mat(0x222222),
    face: mat(0x111111),
    sclera: mat(0xffffff),
    chips: [0xf2c12e, 0x222222, 0xffffff],
  },
  robot: {
    name: 'Robot',
    icon: '🤖',
    body: () => mat(0xa9b4bf, { roughness: 0.35, metalness: 0.75 }),
    joint: mat(0x3b4148, { metalness: 0.6, roughness: 0.4 }),
    face: mat(0xff3b3b, { emissive: 0xff2020, emissiveIntensity: 1.5 }),
    sclera: mat(0x151515, { roughness: 0.2, metalness: 0.5 }),
    chips: [0xa9b4bf, 0xffd23f, 0x3b4148],
  },
  clay: {
    name: 'Clay',
    icon: '🎨',
    body: (i) => mat(CLAY[i % CLAY.length], { roughness: 1 }),
    joint: mat(0xffffff, { roughness: 1 }),
    face: mat(0x333333),
    sclera: mat(0xffffff, { roughness: 1 }),
    chips: CLAY,
  },
  neon: {
    name: 'Neon',
    icon: '💡',
    body: () => mat(0x1c1c2e, { roughness: 0.5 }),
    joint: mat(0x00e5ff, { emissive: 0x00e5ff, emissiveIntensity: 1.2 }),
    face: mat(0xff4fd8, { emissive: 0xff4fd8, emissiveIntensity: 1.5 }),
    sclera: mat(0x0d0d1a),
    chips: [0x00e5ff, 0xff4fd8, 0x1c1c2e],
  },
  gold: {
    name: 'Gold',
    icon: '🏆',
    // No environment map to reflect, so keep it only half metallic with a warm glow.
    body: () => mat(0xffc93c, { roughness: 0.32, metalness: 0.45, emissive: 0x6a4300, emissiveIntensity: 0.35 }),
    joint: mat(0xc9932a, { roughness: 0.35, metalness: 0.4, emissive: 0x3a2400, emissiveIntensity: 0.3 }),
    face: mat(0x2a1a05),
    sclera: mat(0xfff6d8, { roughness: 0.3 }),
    chips: [0xffc93c, 0xffe9a0, 0xb8860b],
  },
  zombie: {
    name: 'Zombie',
    icon: '🧟',
    body: (i) => mat([0x86a86b, 0x7a9d61, 0x91b077][i % 3], { roughness: 0.95 }),
    joint: mat(0x5b4a3a, { roughness: 1 }),
    face: mat(0x2b1b12),
    sclera: mat(0xe8dc6a, { roughness: 0.6 }),
    chips: [0x86a86b, 0x5b4a3a, 0x6b8f52],
  },
};

const ICE = mat(0xbfe8ff, { roughness: 0.08, metalness: 0.15, emissive: 0x3a7fae, emissiveIntensity: 0.35 });

/* ------------------------------------------------------------------ */
/* Meshes                                                              */
/* ------------------------------------------------------------------ */

function partGeometry(name, d) {
  switch (d.shape) {
    case 'chest':
      return geo('chest', () => {
        const g = new THREE.CylinderGeometry(0.205, 0.165, 0.42, 6);
        g.scale(1, 1, 0.56);
        g.rotateY(Math.PI / 6);
        return g;
      });
    case 'pelvis':
      return geo('pelvis', () => {
        const g = new THREE.CylinderGeometry(0.155, 0.13, 0.18, 6);
        g.scale(1, 1, 0.68);
        g.rotateY(Math.PI / 6);
        return g;
      });
    case 'head':
      return geo('head', () => {
        const g = new THREE.IcosahedronGeometry(d.r, 1);
        g.scale(0.9, 1.08, 0.96);
        return g;
      });
    case 'capsule':
      return geo(`cap${d.half}_${d.r}`, () => new THREE.CapsuleGeometry(d.r, d.half * 2, 2, 7));
    default:
      return geo(`box${d.half.join('_')}`, () => new THREE.BoxGeometry(d.half[0] * 2, d.half[1] * 2, d.half[2] * 2));
  }
}

function makePartMesh(name, def, skin, index) {
  const g = new THREE.Group();
  const body = mesh(partGeometry(name, def), skin.body(index));
  body.userData.role = 'body';
  g.add(body);
  // Joint balls on the child side, like a real artist's mannequin.
  for (const [, , child, w, , r] of J) {
    if (child !== name) continue;
    const ball = mesh(geo(`ball${r}`, () => new THREE.IcosahedronGeometry(r, 1)), skin.joint);
    ball.userData.role = 'joint';
    ball.position.set(w[0] - def.pos[0], w[1] - def.pos[1], w[2] - def.pos[2]);
    g.add(ball);
  }
  if (def.shape === 'head') {
    const neck = mesh(geo('neck', () => new THREE.CylinderGeometry(0.035, 0.045, 0.1, 6)), skin.joint);
    neck.userData.role = 'joint';
    neck.position.set(0, -0.1, 0);
    g.add(neck);
    // Eyes (animated by life.js). Also shows when the head is on backwards.
    const face = (name, geom, material, pos, role = 'face') => {
      const m = mesh(geom, material, { cast: false });
      m.userData.role = role;
      m.userData.facePart = name;
      m.position.set(...pos);
      m.userData.base = m.position.clone();
      g.add(m);
      return m;
    };
    for (const [s, x] of [['L', 0.046], ['R', -0.046]]) {
      face('eye' + s, geo('sclera', () => new THREE.BoxGeometry(0.046, 0.056, 0.014)), skin.sclera, [x, 0.024, 0.101], 'sclera');
      face('pupil' + s, geo('pupil', () => new THREE.BoxGeometry(0.022, 0.028, 0.01)), skin.face, [x, 0.024, 0.11]);
    }
    const nose = mesh(geo('nose', () => new THREE.ConeGeometry(0.018, 0.05, 4).rotateX(Math.PI / 2)), skin.body(index));
    nose.userData.role = 'body';
    nose.position.set(0, -0.012, 0.12);
    g.add(nose);
  }
  if (def.shape === 'chest') {
    // Little "belly button" stud on the front to show orientation.
    const stud = mesh(geo('stud', () => new THREE.IcosahedronGeometry(0.025, 0)), skin.joint);
    stud.userData.role = 'joint';
    stud.position.set(0, -0.05, 0.1);
    g.add(stud);
  }
  return g;
}

function colliderFor(def) {
  switch (def.shape) {
    case 'head':
      return RAPIER.ColliderDesc.ball(def.r);
    case 'capsule':
      return RAPIER.ColliderDesc.capsule(def.half, def.r);
    default:
      return RAPIER.ColliderDesc.cuboid(...def.half);
  }
}

/* ------------------------------------------------------------------ */
/* Mannequin                                                           */
/* ------------------------------------------------------------------ */

// Collision groups: (membership << 16) | filter.
export const GROUP_PART = 0x0001ffff;
// A loose piece being carried passes through the rest of the body.
export const GROUP_GHOST = 0x0002fffe;

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */

export class Mannequin {
  constructor(game) {
    this.game = game;
    this.parts = [];
    this.skinId = 'wood';
    let name = null;
    try {
      name = localStorage.getItem('ai-name');
    } catch {
      /* storage unavailable */
    }
    this.name = name ?? 'Dummy';
    this.steps = 0;
    this.look = this.loadLook();
    this.skinId = this.look.skin;
  }

  /* ------------------------------ customisation ------------------------------ */

  static defaultLook() {
    return { skin: 'wood', paint: { body: 0xd9a066, joint: 0x8a5a2b, eyes: 0x5b3a1c }, hat: 'none', face: 'none', outfit: 'none', head: 'normal' };
  }

  loadLook() {
    const def = Mannequin.defaultLook();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('ai-look') || 'null');
    } catch {
      saved = null;
    }
    if (!saved || typeof saved !== 'object') return def;
    const pick = (v, table, fallback) => (typeof v === 'string' && table[v] ? v : fallback);
    const num = (v, fallback) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : fallback);
    return {
      skin: saved.skin === 'custom' || SKINS[saved.skin] ? saved.skin : def.skin,
      paint: {
        body: num(saved.paint?.body, def.paint.body),
        joint: num(saved.paint?.joint, def.paint.joint),
        eyes: num(saved.paint?.eyes, def.paint.eyes),
      },
      hat: pick(saved.hat, HATS, 'none'),
      face: pick(saved.face, FACES, 'none'),
      outfit: pick(saved.outfit, OUTFITS, 'none'),
      head: pick(saved.head, HEAD_SIZES, 'normal'),
    };
  }

  saveLook() {
    try {
      localStorage.setItem('ai-look', JSON.stringify(this.look));
    } catch {
      /* storage unavailable */
    }
  }

  /** The "Custom paint" skin, built from the chosen colours. */
  customSkin() {
    const p = this.look.paint;
    const hex = (c) => c & 0xffffff;
    const darker = new THREE.Color(hex(p.body)).multiplyScalar(0.75).getHex();
    return {
      name: 'Custom paint',
      icon: '🎨',
      body: () => mat(hex(p.body), { roughness: 0.6 }),
      joint: mat(hex(p.joint), { roughness: 0.6 }),
      face: mat(hex(p.eyes)),
      sclera: mat(0xfaf6ee),
      chips: [hex(p.body), hex(p.joint), darker],
    };
  }

  /**
   * Change part of the look. Head size needs a rebuilt body (it's physics), the
   * rest applies live.
   */
  setLook(patch) {
    const before = this.look.head;
    this.look = { ...this.look, ...patch, paint: { ...this.look.paint, ...(patch.paint || {}) } };
    this.saveLook();
    if (patch.skin || patch.paint) this.setSkin(this.look.skin);
    if (this.look.head !== before) {
      this.reset();
      return;
    }
    if ('hat' in patch || 'face' in patch || 'outfit' in patch) this.dress();
  }

  randomLook() {
    const keys = (t) => Object.keys(t);
    const any = (a) => a[(Math.random() * a.length) | 0];
    const PALETTE = [0xd9a066, 0xf2c12e, 0xe8213a, 0xff7a3d, 0xff9ccd, 0xc77dff, 0x2a8cff, 0x4dd6e0, 0x3fd06a, 0xf4efe8, 0x3a3a44];
    const custom = Math.random() < 0.4;
    this.setLook({
      skin: custom ? 'custom' : any(keys(SKINS)),
      paint: custom ? { body: any(PALETTE), joint: any(PALETTE), eyes: any([0x111111, 0x2a8cff, 0x3fd06a, 0xe8213a]) } : {},
      hat: Math.random() < 0.75 ? any(keys(HATS).filter((k) => k !== 'none')) : 'none',
      face: Math.random() < 0.5 ? any(keys(FACES).filter((k) => k !== 'none')) : 'none',
      outfit: Math.random() < 0.6 ? any(keys(OUTFITS).filter((k) => k !== 'none')) : 'none',
      head: Math.random() < 0.6 ? 'normal' : any(keys(HEAD_SIZES)),
    });
  }

  /** (Re)attach hat, face and outfit accessories to the current body parts. */
  dress() {
    const by = this.byName;
    if (!by) return;
    for (const e of this.parts) {
      if (!e.mesh) continue;
      for (const c of [...e.mesh.children]) if (c.userData.accessory) e.mesh.remove(c);
    }
    const put = (table, id, defaultPart) => {
      const item = table[id];
      if (!item?.build) return;
      const target = by[item.part || defaultPart];
      if (!target?.alive) return;
      const g = item.build();
      g.userData.accessory = id;
      g.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      target.mesh.add(g);
    };
    put(HATS, this.look.hat, 'head');
    put(FACES, this.look.face, 'head');
    put(OUTFITS, this.look.outfit, 'chest');
    // Bits that animate: spinning (propeller, halo), flapping (wings), flickering (jetpack flames).
    this.spinners = [];
    this.flappers = [];
    this.flickers = [];
    for (const e of this.parts) {
      e.mesh?.traverse((o) => {
        if (o.userData.spin) this.spinners.push(o);
        if (o.userData.flap) this.flappers.push(o);
        if (o.userData.flicker) this.flickers.push(o);
      });
    }
  }

  setName(name) {
    this.name = String(name).replace(/\s+/g, ' ').trim().slice(0, 20);
    try {
      localStorage.setItem('ai-name', this.name);
    } catch {
      /* storage unavailable */
    }
    this.game.progress?.ev('name');
  }

  get skin() {
    return this.skinId === 'custom' ? this.customSkin() : SKINS[this.skinId] || SKINS.wood;
  }

  build() {
    const { physics, joints } = this.game;
    const skin = this.skin;
    const byName = {};
    let i = 0;
    const headScale = HEAD_SIZES[this.look.head]?.scale || 1;
    for (const [name, base] of Object.entries(P)) {
      const idx = i++;
      // Head size is real: a bigger ball collider, heavier, sitting higher on the same neck.
      const def = name === 'head' && headScale !== 1 ? { ...base, r: base.r * headScale, pos: [0, 1.575 + 0.135 * headScale, 0], mass: base.mass * headScale * headScale } : base;
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...def.pos)
        .setLinearDamping(0.05)
        .setAngularDamping(0.9)
        .setCcdEnabled(true);
      const cd = colliderFor(def)
        .setMass(def.mass)
        .setFriction(0.8)
        .setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(400)
        .setCollisionGroups(GROUP_PART);
      const e = physics.create({
        body: bd,
        colliders: [cd],
        mesh: makePartMesh(name, base, skin, idx),
        kind: 'part',
        data: { partName: name, sockets: [], skinIndex: idx },
      });
      if (name === 'head' && headScale !== 1) e.mesh.scale.setScalar(headScale);
      byName[name] = e;
      this.parts.push(e);
    }
    for (const [name, an, bn, w, strength] of J) {
      const a = byName[an];
      const b = byName[bn];
      const wp = new THREE.Vector3(...w);
      joints.create({
        a,
        b,
        anchorA: toLocal(a.body, wp),
        anchorB: toLocal(b.body, wp),
        kind: 'body',
        strength,
        name,
      });
    }
    this.byName = byName;
    this.dress();
    this.game.life?.onBuild();
    this.game.progress?.startRun();
  }

  clear() {
    const { physics } = this.game;
    for (const e of this.parts) physics.remove(e);
    this.parts = [];
  }

  reset() {
    this.game.progress?.endRun('replaced');
    this.clear();
    this.build();
  }

  setSkin(id) {
    this.skinId = id;
    if (this.look && this.look.skin !== id) {
      this.look.skin = id;
      this.saveLook();
    }
    const skin = this.skin;
    for (const e of this.parts) {
      e.mesh.traverse((o) => {
        if (!o.isMesh) return;
        const role = o.userData.role;
        let m = null;
        if (role === 'body') m = skin.body(e.skinIndex);
        else if (role === 'joint') m = skin.joint;
        else if (role === 'face') m = skin.face;
        else if (role === 'sclera') m = skin.sclera;
        if (!m) return;
        // While tinted (frozen / charred), change what it reverts to instead.
        if (o.userData.baseMat) o.userData.baseMat = m;
        else o.material = m;
      });
    }
    this.game.progress?.ev('skin', { id });
  }

  /** Temporarily re-skin a piece (charred, frozen). Restores after `dur` seconds if given. */
  tint(e, material, dur = 0) {
    if (!e?.alive || !e.mesh) return;
    e.mesh.traverse((o) => {
      const role = o.userData.role;
      if (!o.isMesh || (role !== 'body' && role !== 'joint')) return;
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      o.material = material;
    });
    if (dur) {
      const token = (e.tintToken = (e.tintToken || 0) + 1);
      this.game.later(dur, () => {
        if (e.tintToken === token && !e.frozen) this.untint(e);
      });
    }
  }

  untint(e) {
    if (!e?.mesh) return;
    e.mesh.traverse((o) => {
      if (o.userData.baseMat) {
        o.material = o.userData.baseMat;
        delete o.userData.baseMat;
      }
    });
  }

  /** Freeze pieces solid: ice look, locked pose (a statue), triple damage, shatter on breaking. */
  freeze(set, dur) {
    const until = this.game.time + dur;
    for (const e of set) {
      if (e.kind !== 'part' || !e.alive) continue;
      e.frozenUntil = until;
      if (!e.frozen) {
        e.frozen = true;
        this.tint(e, ICE);
        this.game.fx.burst(bodyPos(e.body), { count: 6, colors: [0xffffff, 0xbfe8ff], speed: 1.2, size: 0.025, life: 0.8, glow: true });
      }
    }
    // Lock the current pose.
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    for (const j of this.game.joints.list) {
      if (j.kind !== 'body' || !j.a.frozen || !j.b.frozen) continue;
      const ra = j.a.body.rotation();
      const rb = j.b.body.rotation();
      qa.set(ra.x, ra.y, ra.z, ra.w);
      qb.set(rb.x, rb.y, rb.z, rb.w);
      j.rest.copy(qa.invert().multiply(qb));
    }
    this.game.later(dur + 0.05, () => this.thaw());
  }

  thaw() {
    const now = this.game.time;
    for (const e of this.parts) {
      if (e.frozen && now >= e.frozenUntil - 0.02) {
        e.frozen = false;
        this.untint(e);
        this.game.fx.burst(bodyPos(e.body), { count: 5, colors: [0xbfe8ff, 0x9fd8ff], speed: 1, size: 0.02, life: 0.6 });
      }
    }
  }

  /** All entities connected to `start` through joints. anchored = touches a fixed body. */
  graph(start) {
    const set = new Set([start]);
    const stack = [start];
    let anchored = false;
    while (stack.length) {
      const e = stack.pop();
      for (const j of e.joints) {
        const o = j.a === e ? j.b : j.a;
        if (!o.body.isDynamic()) {
          anchored = true;
          continue;
        }
        if (!set.has(o)) {
          set.add(o);
          stack.push(o);
        }
      }
    }
    return { set, anchored };
  }

  /** Breaks a joint, leaving sockets on both pieces so they can be reattached. */
  sever(j, { quiet = false } = {}) {
    if (!j || !j.alive) return false;
    const { joints, fx, sfx } = this.game;
    const w = joints.worldAnchor(j, 'a');
    joints.remove(j);
    const pushed = [];
    if (j.kind === 'body') {
      for (const [e, s] of [[j.a, j.anchorA], [j.b, j.anchorB]]) {
        if (e.kind === 'part') {
          const socket = s.clone();
          e.sockets.push(socket);
          if (e.sockets.length > 6) this.game.gore?.onAttach(e, e.sockets.shift());
          pushed.push({ e, socket });
        }
      }
    }
    this.game.gore?.onSever(j, w, pushed);
    // Pop the pieces apart a little.
    const A = j.a.body;
    const B = j.b.body;
    if (A.isDynamic() && B.isDynamic()) {
      const dir = bodyPos(B).sub(bodyPos(A)).normalize().multiplyScalar(1.2);
      B.applyImpulse(dir.clone().multiplyScalar(B.mass()), true);
      A.applyImpulse(dir.multiplyScalar(-A.mass() * 0.5), true);
    }
    if (j.a.frozen || j.b.frozen) {
      fx.burst(w, { count: 26, colors: [0xffffff, 0xbfe8ff, 0x8fd0ff], speed: 4, size: 0.035, life: 1.4 });
      sfx.shatter();
      this.game.progress?.ev('shatter', { pos: w });
    }
    if (!quiet) {
      fx.burst(w, { count: 14, colors: this.skin.chips, speed: 3, size: 0.035, life: 1.4 });
      sfx.crack();
      this.game.ui?.flashWord?.(['SNAP!', 'POP!', 'CRACK!', 'CLACK!'][(Math.random() * 4) | 0]);
    }
    this.game.stats.severed++;
    this.game.life?.onSever(j, quiet);
    this.game.progress?.ev('sever', { j, pos: w, quiet });
    return true;
  }

  /** Sever the joint on `e` nearest to `point` (optionally only within maxDist). */
  severNearest(e, point, maxDist = Infinity) {
    const j = this.nearestJoint(e, point, maxDist);
    return j ? this.sever(j) : false;
  }

  nearestJoint(e, point, maxDist = Infinity) {
    if (!e) return null;
    let best = null;
    let bd = maxDist;
    const tmp = new THREE.Vector3();
    for (const j of e.joints) {
      toWorld(e.body, j.a === e ? j.anchorA : j.anchorB, tmp);
      const d = tmp.distanceTo(point);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return best;
  }

  /** Accumulate damage on the nearest joint; break it when it runs out of strength. */
  damage(e, amount, point) {
    if (!e || amount <= 0 || !e.joints.length) return false;
    if (e.frozen) amount *= 3; // brittle
    const j = this.nearestJoint(e, point);
    if (!j) return false;
    j.damage += amount;
    this.game.life?.onHurt(e, amount, point);
    this.game.gore?.onHurt(e, amount, point);
    this.game.music?.bump(amount * 0.15);
    this.game.progress?.ev('hurt', { e, amount, point });
    if (j.damage >= j.strength) return this.sever(j);
    return false;
  }

  /** Best place to stick a held loose piece: one of its free sockets near another body piece. */
  findAttach(held) {
    const { set } = this.graph(held);
    let best = null;
    const wp = new THREE.Vector3();
    for (const e of set) {
      if (e.kind !== 'part') continue;
      for (const s of e.sockets) {
        toWorld(e.body, s, wp);
        const hit = this.game.physics.project(wp, (o) => o.kind === 'part' && !set.has(o));
        if (!hit) continue;
        const d = hit.inside ? 0 : wp.distanceTo(hit.point);
        if (d < 0.2 && (!best || d < best.d)) {
          best = { from: e, socket: s, wp: wp.clone(), to: hit.entity, point: hit.point, d, set };
        }
      }
    }
    return best;
  }

  attach(c) {
    const { joints, fx, sfx } = this.game;
    if (!c.from.alive || !c.to.alive) return false;
    // Snap the whole loose component so the socket lands on the target point.
    const delta = c.point.clone().sub(toWorld(c.from.body, c.socket));
    for (const e of c.set) {
      const t = e.body.translation();
      e.body.setTranslation({ x: t.x + delta.x, y: t.y + delta.y, z: t.z + delta.z }, true);
      e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    const anchorA = toLocal(c.to.body, c.point);
    const proper = this.properJoint(c, anchorA);
    const j = joints.create({
      a: c.to,
      b: c.from,
      anchorA,
      anchorB: c.socket,
      kind: 'body',
      strength: proper ? proper[4] : 1,
      name: proper ? proper[0] : 'custom',
    });
    // Put back where it belongs: it becomes the original joint again and
    // relaxes into its natural pose (so it can move like it used to).
    if (proper) j.rest.identity();
    j.base = j.rest.clone();
    const i = c.from.sockets.indexOf(c.socket);
    this.game.gore?.onAttach(c.from, c.socket);
    if (i >= 0) c.from.sockets.splice(i, 1);
    fx.burst(c.point, { count: 10, colors: [0xffffff, 0xfff1a8], speed: 1.5, size: 0.025, life: 0.6, gravity: 0 });
    sfx.clank();
    this.game.stats.attached++;
    this.game.life?.onAttach(c, !!proper, j);
    this.game.progress?.ev('attach', { c, proper: !!proper, point: c.point });
    return true;
  }

  /** If an attach recreates an original joint (right parts, right spot, upright-ish), return its def. */
  properJoint(c, anchorA) {
    for (const d of J) {
      const [name, parent, child, w] = d;
      if (c.to.partName !== parent || c.from.partName !== child) continue;
      if ([...this.game.joints.list].some((j) => j.name === name)) continue;
      const pd = P[parent];
      const local = new THREE.Vector3(w[0] - pd.pos[0], w[1] - pd.pos[1], w[2] - pd.pos[2]);
      if (local.distanceTo(anchorA) > 0.13) continue;
      const ra = c.to.body.rotation();
      const rb = c.from.body.rotation();
      const rel = new THREE.Quaternion(ra.x, ra.y, ra.z, ra.w).invert().multiply(new THREE.Quaternion(rb.x, rb.y, rb.z, rb.w));
      if (2 * Math.acos(Math.min(1, Math.abs(rel.w))) > 0.9) continue; // e.g. head on backwards
      return d;
    }
    return null;
  }

  /** Per physics step: rescue pieces that fell out of the world. */
  fixed() {
    if (++this.steps % 20) return;
    const seen = new Set();
    for (const e of this.parts) {
      if (seen.has(e)) continue;
      const t = e.body.translation();
      const lost = t.y < -12 || Math.abs(t.x) > 40 || Math.abs(t.z) > 40 || t.y > 60;
      if (!lost) continue;
      const { set } = this.graph(e);
      for (const o of set) seen.add(o);
      const delta = new THREE.Vector3(-t.x + (Math.random() - 0.5), 2.5 - t.y, -t.z + (Math.random() - 0.5));
      for (const o of set) {
        const p = o.body.translation();
        o.body.setTranslation({ x: p.x + delta.x, y: p.y + delta.y, z: p.z + delta.z }, true);
        o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  /** Make a set of pieces pass through the rest of the mannequin (or solid again). */
  setGhost(set, on) {
    for (const e of set) {
      if (e.kind !== 'part' || !e.alive) continue;
      for (const c of e.colliders) c.setCollisionGroups(on ? GROUP_GHOST : GROUP_PART);
    }
  }

  /** Count of intact default joints, for the HUD. */
  intactCount() {
    let n = 0;
    for (const j of this.game.joints.list) if (j.kind === 'body') n++;
    return n;
  }
}
