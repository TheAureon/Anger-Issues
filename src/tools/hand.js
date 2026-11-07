import * as THREE from 'three';
import { toLocal, toWorld, bodyPos, bodyQuat } from '../physics.js';
import { camDir, UP } from './util.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Grab & fling. Pulls the grabbed point toward the cursor with a velocity-level
 * spring applied at the grab point, so dragging an attached limb swings the
 * whole ragdoll. Loose pieces are also rotated to a target orientation that
 * the player can spin (R / F, or the on-screen buttons), and get reattached
 * on release if one of their sockets is close to the body.
 */
export class Grabber {
  constructor(game, { strength = 14, maxSpeed = 32, allowAttach = true } = {}) {
    this.game = game;
    this.strength = strength;
    this.maxSpeed = maxSpeed;
    this.allowAttach = allowAttach;
    this.e = null;
    this.camDir = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.targetRot = new THREE.Quaternion();
    this.steps = 0;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.012, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0x7dff9b, transparent: true, opacity: 0.9, depthTest: false }),
    );
    ring.renderOrder = 10;
    ring.visible = false;
    game.scene.add(ring);
    this.marker = ring;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    );
    dot.renderOrder = 10;
    dot.visible = false;
    game.scene.add(dot);
    this.dot = dot;
  }

  start(p, hit) {
    if (!hit?.entity || !hit.entity.body.isDynamic()) return false;
    const e = hit.entity;
    this.e = e;
    this.game.grabbedEntity = e;
    this.local = toLocal(e.body, hit.point);
    camDir(this.game, this.camDir);
    this.depth = hit.point.clone().sub(p.origin).dot(this.camDir);
    this.target.copy(hit.point);
    this.p = p;
    const g = this.game.mannequin.graph(e);
    this.free = !g.anchored && g.set.size <= 9;
    this.ghost = null;
    if (this.free && this.allowAttach && e.kind === 'part') {
      this.ghost = g.set;
      this.game.mannequin.setGhost(g.set, true);
    }
    bodyQuat(e.body, this.targetRot);
    if (this.free && e.kind === 'part') {
      // Loose body pieces turn upright and face the camera, as they sit on a
      // standing mannequin, so their sockets line up naturally for reattaching.
      const cam = this.game.camera.position;
      const t = e.body.translation();
      this.targetRot.setFromAxisAngle(UP, Math.atan2(cam.x - t.x, cam.z - t.z));
    }
    this.candidate = null;
    e.body.wakeUp();
    this.game.ui?.showHold(this.free);
    this.game.sfx.click();
    return true;
  }

  move(p) {
    if (!this.e) return;
    this.p = p;
    this.retarget(0.5);
  }

  retarget(blend) {
    const p = this.p;
    if (!p) return;
    camDir(this.game, this.camDir);
    const denom = Math.max(0.2, p.dir.dot(this.camDir));
    if (this.free && this.allowAttach && this.e.kind === 'part') {
      // Depth assist: hovering a loose piece over the body pulls it to the
      // body's depth instead of keeping it on its original depth plane.
      const held = this.game.mannequin.graph(this.e).set;
      let best = 0.4;
      let depth = null;
      for (const o of this.game.mannequin.parts) {
        if (held.has(o)) continue;
        bodyPos(o.body, _a).sub(p.origin);
        const along = _a.dot(p.dir);
        if (along <= 0) continue;
        const off = Math.sqrt(Math.max(0, _a.lengthSq() - along * along));
        if (off < best) {
          best = off;
          depth = _a.dot(this.camDir);
        }
      }
      if (depth != null) this.depth += (depth - this.depth) * blend;
    }
    this.target.copy(p.origin).addScaledVector(p.dir, this.depth / denom);
    if (this.target.y < 0.03) this.target.y = 0.03;
  }

  wheel(dy) {
    if (!this.e) return;
    this.depth = THREE.MathUtils.clamp(this.depth * (1 + dy * 0.001), 0.6, 15);
    this.retarget(0);
  }

  rotate(kind) {
    if (!this.e) return;
    camDir(this.game, _a);
    if (kind === 'roll') _q.setFromAxisAngle(_a, Math.PI / 4);
    else _q.setFromAxisAngle(UP, Math.PI / 2);
    this.targetRot.premultiply(_q);
    this.free = true;
    this.game.sfx.click();
  }

  key(k) {
    if (!this.e) return false;
    if (k === 'r') this.rotate('roll');
    else if (k === 'f') this.rotate('turn');
    else return false;
    return true;
  }

  fixed(dt) {
    const e = this.e;
    if (!e) return;
    if (!e.alive) {
      this.end(true);
      return;
    }
    if (this.free) this.retarget(0.12);
    const b = e.body;
    const pw = toWorld(b, this.local, _a);
    const t = b.translation();
    const lv = b.linvel();
    const av = b.angvel();
    // Velocity of the grab point.
    const rx = pw.x - t.x;
    const ry = pw.y - t.y;
    const rz = pw.z - t.z;
    const pvx = lv.x + av.y * rz - av.z * ry;
    const pvy = lv.y + av.z * rx - av.x * rz;
    const pvz = lv.z + av.x * ry - av.y * rx;
    _b.copy(this.target).sub(pw).multiplyScalar(this.strength);
    if (_b.length() > this.maxSpeed) _b.setLength(this.maxSpeed);
    const m = b.mass();
    const k = 0.55;
    const g = this.free ? -this.game.physics.gravityY * dt : 0;
    const imp = { x: (_b.x - pvx) * m * k, y: ((_b.y - pvy) * k + g) * m, z: (_b.z - pvz) * m * k };
    // Loose pieces: push through the centre (we steer their rotation directly).
    // Attached pieces: push at the grab point so the ragdoll swings naturally.
    if (this.free) b.applyImpulse(imp, true);
    else b.applyImpulseAtPoint(imp, { x: pw.x, y: pw.y, z: pw.z }, true);
    if (this.free) {
      // Spin toward the target orientation.
      _q.copy(this.targetRot).multiply(bodyQuat(b).invert());
      if (_q.w < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      const s = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
      const ang = 2 * Math.acos(Math.min(1, _q.w));
      const f = s < 1e-5 ? 0 : (ang / s) * 9;
      b.setAngvel(
        { x: av.x + (_q.x * f - av.x) * 0.4, y: av.y + (_q.y * f - av.y) * 0.4, z: av.z + (_q.z * f - av.z) * 0.4 },
        true,
      );
    }
    if (this.allowAttach && this.free && ++this.steps % 3 === 0) {
      const c = this.game.mannequin.findAttach(e);
      if (c) {
        this.candidate = c;
        this.candidateTime = this.game.time;
      } else if (this.game.time - (this.candidateTime || 0) > 0.25) {
        // Keep the last candidate briefly so jitter doesn't drop it at release.
        this.candidate = null;
      }
    }
  }

  update() {
    const show = !!(this.e && this.candidate);
    this.marker.visible = show;
    if (show) {
      this.marker.position.copy(this.candidate.point);
      this.marker.lookAt(this.game.camera.position);
      const s = 1 + Math.sin(performance.now() * 0.012) * 0.15;
      this.marker.scale.setScalar(s);
    }
    this.dot.visible = !!this.e;
    if (this.e) this.dot.position.copy(this.target);
  }

  end(cancel = false) {
    const e = this.e;
    this.e = null;
    this.game.grabbedEntity = null;
    this.marker.visible = false;
    this.dot.visible = false;
    this.game.ui?.showHold(false);
    if (this.ghost) this.game.mannequin.setGhost(this.ghost, false);
    this.ghost = null;
    if (!e || !e.alive) return;
    if (!cancel && this.candidate && this.allowAttach) {
      const c = this.game.mannequin.findAttach(e) || this.candidate;
      this.game.mannequin.attach(c);
    } else {
      const v = e.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 6) this.game.sfx.whoosh();
    }
    this.candidate = null;
  }
}

export function handTools(game) {
  const grab = new Grabber(game);
  game.grabber = grab;
  return [
    {
      id: 'hand',
      cat: 'hand',
      name: 'Grab',
      icon: '✋',
      hint: 'Drag pieces and fling them. Drop a loose piece on the body to stick it on. R / F (or the buttons) rotate a held piece. Scroll = push/pull.',
      down: (p, hit) => grab.start(p, hit),
      move: (p) => grab.move(p),
      up: () => grab.end(),
      cancel: () => grab.end(true),
      fixed: (dt) => grab.fixed(dt),
      update: () => grab.update(),
      wheel: (dy) => grab.wheel(dy),
      key: (k) => grab.key(k),
    },
    {
      id: 'poke',
      cat: 'hand',
      name: 'Slap',
      icon: '🖐️',
      hint: 'Tap to slap. Hold to keep slapping.',
      down(p, hit) {
        if (!hit) return false;
        this.hit(hit, p);
        this.next = game.time + 0.22;
        return true;
      },
      hit(hit, p) {
        game.fx.burst(hit.point, { count: 4, colors: [0xffffff], speed: 1.5, size: 0.02, life: 0.3, glow: true });
        game.sfx.knock();
        if (!hit.entity.body.isDynamic()) return;
        const dir = p.dir.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize();
        const J = THREE.MathUtils.clamp(hit.entity.body.mass() * 4, 3, 30);
        hit.entity.body.applyImpulseAtPoint(dir.multiplyScalar(J), hit.point, true);
        if (hit.entity.kind === 'part') game.mannequin.damage(hit.entity, 0.06, hit.point);
      },
      fixed() {
        if (game.time < this.next || !game.pointer) return;
        this.next = game.time + 0.22;
        const hit = game.pick(game.pointer);
        if (hit) this.hit(hit, game.pointer);
      },
      up() {},
    },
  ];
}

export { bodyPos };
