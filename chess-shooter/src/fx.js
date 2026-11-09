// Visual effects: tracers, muzzle flashes, shattering pieces, sparks and dust.
import * as THREE from 'three';
import { SHARD_GEOS } from './pieces.js';

const BOARD_Y = 0;
const OUT_Y = -1.6;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.flash = new THREE.PointLight(0xffc070, 0, 6, 2);
    scene.add(this.flash);
    this.flashT = 0;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95 });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd060 });
    this.dustMat = new THREE.MeshStandardMaterial({ color: 0xcdbb98, flatShading: true, transparent: true, opacity: 0.8 });
    this.flashGeo = new THREE.IcosahedronGeometry(0.07, 0);
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true });
  }

  muzzleFlash(pos) {
    this.flash.position.copy(pos);
    this.flash.intensity = 6;
    this.flashT = 0.08;
    const m = new THREE.Mesh(this.flashGeo, this.flashMat.clone());
    m.position.copy(pos);
    m.scale.setScalar(1.6);
    this.scene.add(m);
    this.items.push({ kind: 'flash', mesh: m, life: 0.08, max: 0.08 });
  }

  // A bullet streak flying from a to b. Resolves when it arrives.
  tracer(a, b, speed = 38) {
    return new Promise((resolve) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), this.tracerMat.clone());
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      this.scene.add(m);
      this.items.push({ kind: 'tracer', mesh: m, a: a.clone(), dir: dir.normalize(), len, d: 0, speed, resolve });
    });
  }

  sparks(pos, count = 10, color = 0xffd060) {
    const mat = this.sparkMat.clone();
    mat.color.set(color);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(SHARD_GEOS[1], mat);
      m.scale.setScalar(0.35);
      m.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
      this.scene.add(m);
      this.items.push({ kind: 'bit', mesh: m, v, life: 0.35 + Math.random() * 0.25, spin: 0, floor: BOARD_Y, shrink: true });
    }
  }

  dust(pos, count = 6) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(SHARD_GEOS[2], this.dustMat.clone());
      m.position.copy(pos);
      m.scale.setScalar(0.6 + Math.random());
      const v = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random(), Math.random() - 0.5).multiplyScalar(1.2);
      this.scene.add(m);
      this.items.push({ kind: 'puff', mesh: m, v, life: 0.7, max: 0.7 });
    }
  }

  // Break a piece into flying polygons, pushed along the bullet's direction.
  shatter(group, push) {
    const { mat, trim } = group.userData;
    const origin = group.position.clone();
    const h = group.userData.h || 0.8;
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(SHARD_GEOS[i % SHARD_GEOS.length], i % 5 === 0 ? trim : mat);
      m.castShadow = true;
      m.position.set(origin.x + (Math.random() - 0.5) * 0.3, Math.random() * h, origin.z + (Math.random() - 0.5) * 0.3);
      m.scale.setScalar(0.8 + Math.random() * 1.4);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.4, 1 + Math.random() * 3, (Math.random() - 0.5) * 2.4).addScaledVector(push, 2.5 + Math.random() * 2);
      this.scene.add(m);
      this.items.push({ kind: 'bit', mesh: m, v, life: 7 + Math.random() * 2, spin: (Math.random() - 0.5) * 18, floor: BOARD_Y, shrink: true, shared: true });
    }
    // The gun drops and clatters.
    const gun = group.userData.gun;
    if (gun) {
      const wp = new THREE.Vector3();
      gun.getWorldPosition(wp);
      const wq = new THREE.Quaternion();
      gun.getWorldQuaternion(wq);
      group.remove(gun);
      gun.position.copy(wp);
      gun.quaternion.copy(wq);
      this.scene.add(gun);
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.2, (Math.random() - 0.5) * 1.5).addScaledVector(push, 1.5);
      this.items.push({ kind: 'bit', mesh: gun, v, life: 8, spin: (Math.random() - 0.5) * 10, floor: BOARD_Y + 0.03, shrink: true, shared: true });
    }
    this.dust(new THREE.Vector3(origin.x, 0.1, origin.z), 8);
  }

  update(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const m = it.mesh;
      let dead = false;
      if (it.kind === 'tracer') {
        it.d += it.speed * dt;
        const head = Math.min(it.d, it.len);
        const tail = Math.max(0, head - 0.9);
        m.position.copy(it.a).addScaledVector(it.dir, (head + tail) / 2);
        m.scale.y = Math.max(0.01, head - tail);
        if (it.d >= it.len) {
          if (it.resolve) {
            it.resolve();
            it.resolve = null;
          }
          m.material.opacity -= dt * 12;
          if (m.material.opacity <= 0) dead = true;
        }
      } else if (it.kind === 'flash') {
        it.life -= dt;
        m.material.opacity = it.life / it.max;
        m.scale.multiplyScalar(1 + dt * 8);
        dead = it.life <= 0;
      } else if (it.kind === 'puff') {
        it.life -= dt;
        m.position.addScaledVector(it.v, dt);
        it.v.multiplyScalar(1 - dt * 2);
        m.scale.multiplyScalar(1 + dt * 1.5);
        m.material.opacity = 0.8 * (it.life / it.max);
        dead = it.life <= 0;
      } else if (it.kind === 'bit') {
        it.life -= dt;
        it.v.y -= 9.8 * dt;
        m.position.addScaledVector(it.v, dt);
        // Off the board edge: fall to the ground below.
        const onBoard = Math.abs(m.position.x) < 4.5 && Math.abs(m.position.z) < 4.5;
        const floor = onBoard ? it.floor : OUT_Y;
        if (m.position.y < floor) {
          m.position.y = floor;
          it.v.y = Math.abs(it.v.y) * 0.3;
          it.v.x *= 0.6;
          it.v.z *= 0.6;
          it.spin *= 0.6;
          if (Math.abs(it.v.y) < 0.3) it.v.y = 0;
        }
        if (it.spin) {
          m.rotation.x += it.spin * dt;
          m.rotation.z += it.spin * 0.7 * dt;
        }
        if (it.shrink && it.life < 0.6) m.scale.multiplyScalar(Math.max(0, 1 - dt * 5));
        dead = it.life <= 0;
      }
      if (dead) {
        this.scene.remove(m);
        if (!it.shared && m.material && m.material.dispose) m.material.dispose();
        if (it.kind === 'tracer') m.geometry.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
