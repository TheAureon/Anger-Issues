import * as THREE from 'three';
import { toLocal, toWorld, bodyPos, bodyQuat } from './physics.js';
import { PARTS } from './mannequin.js';

/*
 * Optional, deliberately unrealistic cartoon gore: chunky glossy droplets,
 * stumps that squirt like garden hoses, blobby splats that stick to the floor,
 * walls and the mannequin itself. Comes in silly colours, and Off.
 */

export const GORE_MODES = {
  off: { label: 'Gore off', icon: '🚫' },
  ketchup: { label: 'Cartoon gore', icon: '🩸', colors: [0xe0102a, 0xc20a1f, 0xff2d45] },
  slime: { label: 'Slime gore', icon: '🟢', colors: [0x5bd62b, 0x3fb51a, 0x9cff5a] },
  rainbow: { label: 'Rainbow gore', icon: '🌈', rainbow: true },
};

const MAX_DROPS = 500;
const MAX_DECALS = 320;
const MAX_STAINS_PER_PART = 14;
const Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** A few random low-poly blob outlines (plus satellite drops) shared by every splat. */
function blobGeometries() {
  const out = [];
  for (let k = 0; k < 6; k++) {
    const main = new THREE.Shape();
    const n = 9 + ((Math.random() * 4) | 0);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.7 + Math.random() * 0.45 + (Math.random() < 0.25 ? 0.35 : 0);
      if (i === 0) main.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else main.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const shapes = [main];
    for (let d = 0; d < 3; d++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 1.3 + Math.random() * 0.5;
      const drop = new THREE.Shape();
      drop.absarc(Math.cos(a) * dist, Math.sin(a) * dist, 0.12 + Math.random() * 0.12, 0, Math.PI * 2, false);
      shapes.push(drop);
    }
    const g = new THREE.ShapeGeometry(shapes, 2);
    g.userData.shared = true;
    out.push(g);
  }
  return out;
}

export class Gore {
  constructor(game) {
    this.game = game;
    game.gore = this;
    let saved = null;
    try {
      saved = localStorage.getItem('ai-gore');
    } catch {
      /* storage unavailable */
    }
    this.mode = GORE_MODES[saved] ? saved : 'ketchup';
    this.blobs = blobGeometries();
    this.materials = new Map();

    // Droplets: one instanced mesh, simple ballistic motion, ray-tested each frame.
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.1, flatShading: true }),
      MAX_DROPS,
    );
    this.dropMesh.frustumCulled = false;
    this.dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_DROPS; i++) {
      this.dropMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.dropMesh.setColorAt(i, _c.set(0xffffff));
    }
    game.scene.add(this.dropMesh);
    this.drops = [];
    for (let i = 0; i < MAX_DROPS; i++) this.drops.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), size: 0, color: 0, life: 0 });
    this.nextDrop = 0;

    this.decals = [];
    this.fountains = [];
  }

  get on() {
    return this.mode !== 'off';
  }

  setMode(id) {
    this.mode = id;
    try {
      localStorage.setItem('ai-gore', id);
    } catch {
      /* storage unavailable */
    }
    if (!this.on) this.clearAll();
  }

  cycle() {
    const ids = Object.keys(GORE_MODES);
    this.setMode(ids[(ids.indexOf(this.mode) + 1) % ids.length]);
    return GORE_MODES[this.mode];
  }

  color() {
    const m = GORE_MODES[this.mode];
    if (m.rainbow) return _c.setHSL(Math.random(), 0.85, 0.55).getHex();
    return m.colors[(Math.random() * m.colors.length) | 0];
  }

  material(color) {
    // Quantise so rainbow mode doesn't create a material per splat.
    const key = color & 0xf0f0f0;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: key,
        roughness: 0.2,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  /* ------------------------------ emitters ------------------------------ */

  drop(p, v, size, color = this.color()) {
    const idx = this.nextDrop;
    const d = this.drops[idx];
    this.nextDrop = (idx + 1) % MAX_DROPS;
    d.alive = true;
    d.p.copy(p);
    d.v.copy(v);
    d.size = size;
    d.color = color;
    d.life = 4;
    d.age = 0;
    this.dropMesh.setColorAt(idx, _c.set(color));
    this.dropMesh.instanceColor.needsUpdate = true;
  }

  /** Burst of droplets from a point, optionally aimed. */
  burst(p, { count = 20, speed = 3, dir = null, spread = 0.6, size = 0.025, inherit = null } = {}) {
    if (!this.on) return;
    for (let i = 0; i < count; i++) {
      if (dir) _v.copy(dir).multiplyScalar(speed * (0.6 + Math.random() * 0.7));
      else _v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      _v.x += (Math.random() - 0.5) * spread * speed;
      _v.y += (Math.random() - 0.5) * spread * speed;
      _v.z += (Math.random() - 0.5) * spread * speed;
      if (inherit) _v.add(inherit);
      this.drop(p, _v, size * (0.5 + Math.random()));
    }
  }

  /** Stump squirts in pulses for a while. */
  fountain(e, socket, dur = 2.4) {
    if (!this.on) return;
    this.fountains.push({ e, socket, t: 0, dur, acc: 0, phase: Math.random() * 6 });
  }

  /* ------------------------------ decals ------------------------------ */

  splat(point, normal, size, color, entity = null) {
    if (!this.on) return;
    const m = new THREE.Mesh(this.blobs[(Math.random() * this.blobs.length) | 0], this.material(color));
    m.receiveShadow = true;
    m.scale.setScalar(size);
    if (entity && entity.kind === 'part' && entity.mesh) {
      // Stain on the body piece itself; it travels with it.
      const stains = (entity.goreStains ||= []);
      if (stains.length >= MAX_STAINS_PER_PART) entity.mesh.remove(stains.shift());
      const ln = normal.clone().applyQuaternion(bodyQuat(entity.body).invert());
      m.position.copy(toLocal(entity.body, point)).addScaledVector(ln, 0.003);
      m.quaternion.setFromUnitVectors(Z, ln);
      m.rotateZ(Math.random() * 6.28);
      m.scale.multiplyScalar(0.6);
      entity.mesh.add(m);
      stains.push(m);
      return;
    }
    m.position.copy(point).addScaledVector(normal, 0.004);
    m.quaternion.setFromUnitVectors(Z, normal);
    m.rotateZ(Math.random() * 6.28);
    this.game.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > MAX_DECALS) this.game.scene.remove(this.decals.shift());
  }

  /** Big flat splat on the floor (press, falls). */
  puddle(p, size = 0.5) {
    if (!this.on) return;
    this.splat(_w.set(p.x, 0, p.z).clone(), new THREE.Vector3(0, 1, 0), size, this.color());
  }

  clearDecals() {
    for (const d of this.decals) this.game.scene.remove(d);
    this.decals = [];
  }

  clearAll() {
    this.clearDecals();
    this.fountains = [];
    for (const d of this.drops) d.alive = false;
    for (const e of this.game.mannequin.parts) {
      for (const s of e.goreStains || []) e.mesh.remove(s);
      e.goreStains = [];
      for (const c of e.goreCaps || []) e.mesh.remove(c.mesh);
      e.goreCaps = [];
    }
  }

  /* ------------------------------ stumps ------------------------------ */

  cap(e, socket) {
    if (!this.on || !e.mesh) return;
    const def = PARTS[e.partName];
    const r = def ? (def.r ?? Math.min(def.half[0], def.half[2]) * 1.1) : 0.05;
    const out = _v.copy(socket);
    if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
    out.normalize();
    const g = new THREE.Group();
    const meat = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.014, 8), this.material(this.color()));
    const bone = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.28, r * 0.32, 0.05, 6),
      new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.5, flatShading: true }),
    );
    bone.position.y = 0.02;
    const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.4, 0), bone.material);
    knob.position.y = 0.045;
    g.add(meat, bone, knob);
    g.position.copy(socket).addScaledVector(out, 0.012);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
    e.mesh.add(g);
    (e.goreCaps ||= []).push({ socket, mesh: g });
  }

  /* ------------------------------ hooks ------------------------------ */

  onSever(j, w, pushed) {
    if (!this.on) return;
    for (const { e, socket } of pushed) {
      this.cap(e, socket);
      this.fountain(e, socket, 1.6 + Math.random() * 1.6);
    }
    this.burst(w, { count: 26, speed: 3.2 });
    this.game.fx.shake(0.02);
  }

  onAttach(e, socket) {
    const caps = e.goreCaps || [];
    const i = caps.findIndex((c) => c.socket === socket);
    if (i >= 0) {
      e.mesh.remove(caps[i].mesh);
      caps.splice(i, 1);
    }
    this.fountains = this.fountains.filter((f) => f.socket !== socket);
  }

  onHurt(e, amount, point) {
    if (!this.on) return;
    const n = bodyPos(e.body, _w).sub(point).negate().normalize();
    this.burst(point, { count: Math.round(4 + amount * 22), speed: 1.5 + amount * 4, dir: n.lengthSq() ? n : null, spread: 1 });
    if (amount > 0.2) this.splat(point, n.lengthSq() ? n : new THREE.Vector3(0, 0, 1), 0.035 + amount * 0.04, this.color(), e);
  }

  /** Something got shredded (chipper/blender): spray a lot. */
  shred(p, dir) {
    if (!this.on) return;
    this.burst(p, { count: 45, speed: 6, dir, spread: 0.8, size: 0.03 });
  }

  /* ------------------------------ per frame ------------------------------ */

  update(dt) {
    if (!dt) return;
    const game = this.game;
    const g = game.physics.gravityY;

    // Fountains: pulsing squirts out of stumps.
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i];
      f.t += dt;
      if (f.t > f.dur || !f.e.alive || !f.e.sockets.includes(f.socket)) {
        this.fountains.splice(i, 1);
        continue;
      }
      const pulse = 0.5 + 0.5 * Math.sin(f.t * 11 + f.phase);
      const fade = 1 - f.t / f.dur;
      f.acc += dt * 70 * fade * (0.3 + pulse);
      if (f.acc < 1) continue;
      const p = toWorld(f.e.body, f.socket, _v);
      const out = _w.copy(f.socket);
      if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
      out.normalize().applyQuaternion(bodyQuat(f.e.body, _q));
      const lv = f.e.body.linvel();
      while (f.acc >= 1) {
        f.acc -= 1;
        const sp = (1.6 + pulse * 2.4) * fade + 0.5;
        const v = out.clone().multiplyScalar(sp);
        v.x += (Math.random() - 0.5) * 0.6 + lv.x;
        v.y += (Math.random() - 0.5) * 0.6 + lv.y + 0.6;
        v.z += (Math.random() - 0.5) * 0.6 + lv.z;
        this.drop(p, v, 0.012 + Math.random() * 0.014);
      }
    }

    // Droplets.
    let any = false;
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = this.drops[i];
      if (!d.alive) continue;
      any = true;
      d.life -= dt;
      d.age += dt;
      d.v.y += g * dt;
      const step = d.v.length() * dt;
      let hit = null;
      if (step > 1e-4) {
        _w.copy(d.v).normalize();
        // Freshly spawned drops ignore body parts so they don't splat on the stump they came from.
        const young = d.age < 0.12;
        hit = game.physics.raycast(d.p, _w, step + d.size, (e) => e.kind === 'static' || (e.kind === 'part' && !young));
      }
      if (hit || d.p.y < -2 || d.life <= 0) {
        if (hit && (hit.entity.kind === 'part' || Math.random() < 0.6)) {
          const s = d.size * (3 + Math.random() * 3);
          this.splat(hit.point, hit.normal, s, d.color, hit.entity.kind === 'part' && Math.random() < 0.35 ? hit.entity : null);
        }
        d.alive = false;
        this.dropMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      d.p.addScaledVector(d.v, dt);
      // Stretch droplets along their velocity, cartoon style.
      const sp = d.v.length();
      _q.setFromUnitVectors(Z, _w.copy(d.v).divideScalar(sp || 1));
      _s.set(d.size, d.size, d.size * (1 + Math.min(2.5, sp * 0.25)));
      this.dropMesh.setMatrixAt(i, _m.compose(d.p, _q, _s));
    }
    if (any) this.dropMesh.instanceMatrix.needsUpdate = true;
  }
}
