import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Pooled instanced particles (cubes for debris, icosahedra for puffs). */
class ParticleSystem {
  constructor(scene, geometry, material, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3);
    this.spin = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.next = 0;
    this.active = 0;
    for (let i = 0; i < max; i++) {
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  spawn(p, v, { color = 0xffffff, life = 1, size = 0.04, grow = 0, gravity = 1, drag = 0.5 }) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x;
    this.vel[i3 + 1] = v.y;
    this.vel[i3 + 2] = v.z;
    this.rot[i3] = Math.random() * 6;
    this.rot[i3 + 1] = Math.random() * 6;
    this.rot[i3 + 2] = Math.random() * 6;
    this.spin[i3] = (Math.random() - 0.5) * 12;
    this.spin[i3 + 1] = (Math.random() - 0.5) * 12;
    this.spin[i3 + 2] = (Math.random() - 0.5) * 12;
    this.life[i] = life * (0.7 + Math.random() * 0.6);
    this.maxLife[i] = this.life[i];
    this.size[i] = size * (0.6 + Math.random() * 0.8);
    this.grow[i] = grow;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, g) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      const drag = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag + g * this.grav[i] * dt;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.01 && this.grav[i] > 0) {
        this.pos[i3 + 1] = 0.01;
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.6;
        this.vel[i3 + 2] *= 0.6;
        this.spin[i3] *= 0.5;
        this.spin[i3 + 2] *= 0.5;
      }
      this.rot[i3] += this.spin[i3] * dt;
      this.rot[i3 + 1] += this.spin[i3 + 1] * dt;
      this.rot[i3 + 2] += this.spin[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      let s = this.size[i] * (1 + this.grow[i] * (1 - t));
      if (t < 0.25) s *= t / 0.25;
      _q.setFromEuler(_e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]));
      _m.compose(_p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class Fx {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.debris = new ParticleSystem(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }),
      900,
    );
    this.puffs = new ParticleSystem(
      scene,
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }),
      260,
    );
    this.glow = new ParticleSystem(
      scene,
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      400,
    );
    this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.visible = false;
      scene.add(m);
      this.flashes.push({ mesh: m, t: 0, dur: 0, size: 1 });
    }
    this.light = new THREE.PointLight(0xffb15c, 0, 12, 1.5);
    scene.add(this.light);
    this.lightT = 0;
    this.shakeAmt = 0;
    this.shakeOffset = new THREE.Vector3();
    this.transients = [];
    this.trails = [];
    this.drawers = new Set();

    this.overlay = document.createElement('canvas');
    this.overlay.className = 'overlay';
    game.container.appendChild(this.overlay);
    this.ctx2d = this.overlay.getContext('2d');
  }

  resize(w, h, dpr) {
    this.overlay.width = w * dpr;
    this.overlay.height = h * dpr;
    this.overlay.style.width = w + 'px';
    this.overlay.style.height = h + 'px';
    this.dpr = dpr;
  }

  /** Debris burst (wood chips, sparks, ...). */
  burst(p, { count = 12, colors = [0xffffff], speed = 3, size = 0.04, life = 1.2, gravity = 1, dir = null, spread = 1, glow = false } = {}) {
    const sys = glow ? this.glow : this.debris;
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      if (dir) {
        v.copy(dir).multiplyScalar(speed * (0.5 + Math.random()));
        v.x += rnd(spread * speed * 0.5);
        v.y += rnd(spread * speed * 0.5);
        v.z += rnd(spread * speed * 0.5);
      } else {
        v.set(rnd(), Math.random() * 0.8 + 0.4, rnd()).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      }
      sys.spawn(p, v, {
        color: colors[(Math.random() * colors.length) | 0],
        life,
        size,
        gravity,
        drag: glow ? 2 : 0.4,
      });
    }
  }

  /** Smoke/dust puffs. */
  smoke(p, { count = 8, color = 0x9a9a9a, size = 0.12, speed = 0.8, life = 1.4, up = 0.8 } = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(rnd(speed), Math.random() * up, rnd(speed));
      _p.set(p.x + rnd(size), p.y + rnd(size), p.z + rnd(size));
      this.puffs.spawn(_p, v, { color, life, size, grow: 2.2, gravity: 0, drag: 1.5 });
    }
  }

  sparks(p, { count = 6, color = 0xffc34d, speed = 2.5, dir = null } = {}) {
    this.burst(p, { count, colors: [color, 0xffffff, 0xff8a2b], speed, size: 0.018, life: 0.45, glow: true, dir, spread: 1.2 });
  }

  flash(p, size = 1, dur = 0.35, color = 0xffd27a) {
    const f = this.flashes.find((x) => x.t >= x.dur) || this.flashes[0];
    f.mesh.position.copy(p);
    f.mesh.material.color.set(color);
    f.mesh.visible = true;
    f.t = 0;
    f.dur = dur;
    f.size = size;
    this.light.position.copy(p);
    this.light.color.set(color);
    this.light.intensity = 30 * size;
    this.lightT = dur;
  }

  explosion(p, radius) {
    // Smoke and debris stop growing past dynamite size, so huge blasts don't bury the camera.
    const r = Math.min(radius, 3);
    this.flash(p, radius * 0.55, 0.4);
    this.smoke(p, { count: Math.round(10 + r * 6), color: 0x5a5550, size: 0.12 * r, speed: r * 0.9, life: 1.8, up: r });
    this.burst(p, { count: Math.round(20 + r * 10), colors: [0xffc34d, 0xff6a2b, 0xffffff], speed: r * 5, size: 0.03, life: 0.7, glow: true });
    this.burst(p, { count: Math.round(r * 8), colors: [0x3a3a3a, 0x555555], speed: r * 3.5, size: 0.04, life: 1.6 });
    this.shake(Math.min(0.35, radius * 0.08));
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  /** Temporary scene object animated by fn(t01, dt, obj); removed after dur seconds. */
  transient(obj, dur, fn) {
    this.game.scene.add(obj);
    this.transients.push({ obj, dur, t: 0, fn });
    if (fn) fn(0, 0, obj);
  }

  /** Fading 3D line, e.g. a bullet tracer, a rope or a lightning bolt (pass several points). */
  line(points, { color = 0xfff2b0, dur = 0.12, opacity = 1, additive = true } = {}) {
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
    this.transient(l, dur, (k) => {
      mat.opacity = opacity * (1 - k);
      if (k >= 1) mat.dispose();
    });
    return l;
  }

  /** 2D trail (screen space) e.g. katana slash. */
  trail(points, color = 'rgba(255,255,255,0.95)', width = 6) {
    this.trails.push({ points, color, width, t: 0, dur: 0.28 });
  }

  update(dt) {
    const g = this.game.physics.gravityY;
    this.debris.update(dt, g);
    this.puffs.update(dt, 0);
    this.glow.update(dt, g * 0.3);
    for (const f of this.flashes) {
      if (f.t >= f.dur) continue;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.mesh.scale.setScalar(f.size * (0.3 + k * 1.2));
      f.mesh.material.opacity = (1 - k) * 0.9;
      if (k >= 1) f.mesh.visible = false;
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity *= Math.exp(-dt * 10);
      if (this.lightT <= 0) this.light.intensity = 0;
    }
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const tr = this.transients[i];
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.dur);
      if (tr.fn) tr.fn(k, dt, tr.obj);
      if (k >= 1) {
        this.game.scene.remove(tr.obj);
        tr.obj.traverse((o) => {
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        });
        this.transients.splice(i, 1);
      }
    }
    this.shakeAmt *= Math.exp(-dt * 8);
    this.draw2d(dt);
  }

  applyShake(camera) {
    if (this.shakeAmt < 0.002) return;
    this.shakeOffset.set(rnd(this.shakeAmt), rnd(this.shakeAmt), rnd(this.shakeAmt));
    camera.position.add(this.shakeOffset);
  }

  removeShake(camera) {
    if (this.shakeAmt < 0.002) return;
    camera.position.sub(this.shakeOffset);
  }

  draw2d(dt) {
    const c = this.ctx2d;
    const dpr = this.dpr || 1;
    // Clear in device pixels with an identity transform, then draw in CSS pixels.
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.overlay.width, this.overlay.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Nothing to draw: hide the layer entirely so a stale frame can never linger on screen.
    const idle = !this.trails.length && !this.drawers.size;
    if (idle !== this.overlayIdle) {
      this.overlayIdle = idle;
      this.overlay.style.visibility = idle ? 'hidden' : '';
    }
    if (idle) return;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.t += dt;
      if (tr.t > tr.dur) {
        this.trails.splice(i, 1);
        continue;
      }
      const a = 1 - tr.t / tr.dur;
      c.globalAlpha = a;
      c.strokeStyle = tr.color;
      c.lineWidth = tr.width * a;
      c.beginPath();
      tr.points.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.stroke();
    }
    c.globalAlpha = 1;
    for (const d of this.drawers) d(c);
  }
}
