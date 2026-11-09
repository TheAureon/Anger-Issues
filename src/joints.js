import * as THREE from 'three';
import { RAPIER, toWorld } from './physics.js';

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qt = new THREE.Quaternion();
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();

/** Joint stiffness presets for the "pose hold" muscles. */
export const STIFFNESS = {
  stiff: { K: 40, blend: 0.5, label: 'Stiff' },
  loose: { K: 24, blend: 0.4, label: 'Loose' },
  ragdoll: { K: 0, blend: 0, label: 'Ragdoll' },
};

/**
 * Manages every joint in the sandbox: mannequin joints,
 * glue, and stuck-on props (arrows, rockets, dynamite).
 *
 * Rapier gives us ball/fixed joints. On top of that every "hold" joint gets a
 * soft velocity-level muscle that pulls it back to its rest pose, so the
 * mannequin behaves like a stiff wooden figure instead of a wet noodle, and a
 * head stuck on backwards stays backwards.
 */
export class Joints {
  constructor(game) {
    this.game = game;
    this.list = new Set();
    this.setStiffness('stiff');
    this.onBreak = (j) => game.mannequin.sever(j);
  }

  setStiffness(id) {
    this.stiffnessId = id;
    this.K = STIFFNESS[id].K;
    this.blend = STIFFNESS[id].blend;
  }

  get world() {
    return this.game.physics.world;
  }

  create({
    a,
    b,
    anchorA,
    anchorB,
    type = 'spherical',
    frameA,
    frameB,
    hold = true,
    holdMul = 1,
    kind = 'body',
    strength = 1,
    breakDist = 0.12,
    name = '',
    contacts = false,
  }) {
    const A = new THREE.Vector3(anchorA.x, anchorA.y, anchorA.z);
    const B = new THREE.Vector3(anchorB.x, anchorB.y, anchorB.z);
    const data =
      type === 'fixed'
        ? RAPIER.JointData.fixed(A, frameA, B, frameB)
        : RAPIER.JointData.spherical(A, B);
    const raw = this.world.createImpulseJoint(data, a.body, b.body, true);
    raw.setContactsEnabled(contacts);
    const ra = a.body.rotation();
    const rb = b.body.rotation();
    const rest = new THREE.Quaternion(ra.x, ra.y, ra.z, ra.w)
      .invert()
      .multiply(new THREE.Quaternion(rb.x, rb.y, rb.z, rb.w));
    // Joints may start stretched (glue between two distant points snaps them
    // together); only stretching beyond the starting gap counts toward breaking.
    toWorld(a.body, A, pa);
    toWorld(b.body, B, pb);
    const j = {
      a,
      b,
      raw,
      slack: pa.distanceTo(pb),
      anchorA: A,
      anchorB: B,
      type,
      hold: hold && type !== 'fixed',
      holdMul,
      rest,
      base: rest.clone(), // rest pose before any life.js animation offsets
      kind,
      strength,
      damage: 0,
      breakDist,
      stretch: 0,
      name,
      alive: true,
    };
    this.list.add(j);
    a.joints.push(j);
    b.joints.push(j);
    return j;
  }

  /** Fixed joint that freezes the current relative pose of a and b at a world point. */
  fixedNow(a, b, worldPoint, opts = {}) {
    const ra = a.body.rotation();
    const rb = b.body.rotation();
    const qA = new THREE.Quaternion(ra.x, ra.y, ra.z, ra.w);
    const qB = new THREE.Quaternion(rb.x, rb.y, rb.z, rb.w);
    const frameA = qA.clone().invert().multiply(qB);
    const frameB = new THREE.Quaternion();
    const la = new THREE.Vector3();
    const lb = new THREE.Vector3();
    toLocalOf(a.body, worldPoint, la);
    toLocalOf(b.body, worldPoint, lb);
    return this.create({
      a,
      b,
      anchorA: la,
      anchorB: lb,
      type: 'fixed',
      frameA,
      frameB,
      hold: false,
      ...opts,
    });
  }

  remove(j) {
    if (!j.alive) return;
    j.alive = false;
    this.list.delete(j);
    this.world.removeImpulseJoint(j.raw, true);
    removeFrom(j.a.joints, j);
    removeFrom(j.b.joints, j);
  }

  removeForEntity(e) {
    for (const j of [...e.joints]) this.remove(j);
  }

  worldAnchor(j, side, out = new THREE.Vector3()) {
    return side === 'a' ? toWorld(j.a.body, j.anchorA, out) : toWorld(j.b.body, j.anchorB, out);
  }

  /** Called every physics step before world.step(). */
  fixed(dt) {
    const broken = [];
    // Pass 1: measure stretch, mark strained pieces, collect broken joints.
    for (const j of this.list) {
      j.a.strained = false;
      j.b.strained = false;
    }
    for (const j of this.list) {
      toWorld(j.a.body, j.anchorA, pa);
      toWorld(j.b.body, j.anchorB, pb);
      const d = pa.distanceTo(pb);
      if (d < j.slack) j.slack = d;
      const excess = d - j.slack;
      if (excess > 0.03) {
        j.a.strained = true;
        j.b.strained = true;
      }
      if (excess > j.breakDist) {
        j.stretch += dt;
        if (j.stretch > 0.05) broken.push(j);
      } else if (j.stretch > 0) {
        j.stretch = Math.max(0, j.stretch - dt);
      }
    }
    // Pass 2: pose-holding muscles. They relax on strained pieces so they don't
    // fight hard constraints (glue, grabs, presses) until the body tears apart.
    if (this.K > 0) {
      for (const j of this.list) {
        if (j.hold && !j.a.strained && !j.b.strained) this.hold(j);
      }
    }
    for (const j of broken) if (j.alive) this.onBreak(j);
  }

  hold(j) {
    const A = j.a.body;
    const B = j.b.body;
    const dynA = A.isDynamic();
    const dynB = B.isDynamic();
    if (!dynA && !dynB) return;
    if ((!dynA || A.isSleeping()) && (!dynB || B.isSleeping())) return;
    const ra = A.rotation();
    const rb = B.rotation();
    qa.set(ra.x, ra.y, ra.z, ra.w);
    qb.set(rb.x, rb.y, rb.z, rb.w);
    // Desired orientation of B given A, and the world-space error rotation.
    qt.copy(qa).multiply(j.rest).multiply(qb.invert());
    if (qt.w < 0) qt.set(-qt.x, -qt.y, -qt.z, -qt.w);
    const s = Math.sqrt(Math.max(0, 1 - qt.w * qt.w));
    let ex, ey, ez;
    if (s < 1e-5) {
      ex = qt.x * 2;
      ey = qt.y * 2;
      ez = qt.z * 2;
    } else {
      const k = (2 * Math.acos(Math.min(1, qt.w))) / s;
      ex = qt.x * k;
      ey = qt.y * k;
      ez = qt.z * k;
    }
    const K = this.K * j.holdMul;
    const blend = Math.min(0.6, this.blend * j.holdMul);
    const wa = A.angvel();
    const wb = B.angvel();
    const dx = (ex * K - (wb.x - wa.x)) * blend;
    const dy = (ey * K - (wb.y - wa.y)) * blend;
    const dz = (ez * K - (wb.z - wa.z)) * blend;
    if (dx * dx + dy * dy + dz * dz < 1e-7) return;
    let fa = 0;
    let fb = 0;
    if (dynA && dynB) {
      const mA = A.mass();
      const mB = B.mass();
      fb = mA / (mA + mB);
      fa = mB / (mA + mB);
    } else if (dynB) fb = 1;
    else fa = 1;
    if (fb) B.setAngvel({ x: wb.x + dx * fb, y: wb.y + dy * fb, z: wb.z + dz * fb }, true);
    if (fa) A.setAngvel({ x: wa.x - dx * fa, y: wa.y - dy * fa, z: wa.z - dz * fa }, true);
  }
}

const _iq = new THREE.Quaternion();
function toLocalOf(body, p, out) {
  const t = body.translation();
  const r = body.rotation();
  _iq.set(r.x, r.y, r.z, r.w).invert();
  return out.set(p.x - t.x, p.y - t.y, p.z - t.z).applyQuaternion(_iq);
}

function removeFrom(arr, item) {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
}
