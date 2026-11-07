import * as THREE from 'three';
import { RAPIER, toLocal, toWorld, bodyPos } from '../physics.js';
import { mat, mesh } from '../materials.js';
import { Grabber } from './hand.js';
import { camDir, placePoint, gadget, forDynamic, UP, aimPoint } from './util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function rocketMesh() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), mat(0xeeeeee));
  const nose = mesh(new THREE.ConeGeometry(0.04, 0.1, 8), mat(0xd62828));
  nose.position.y = 0.2;
  g.add(body, nose);
  for (let i = 0; i < 3; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.004, 0.08, 0.06), mat(0xd62828));
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.05, -0.12, Math.sin(a) * 0.05);
    fin.rotation.y = -a;
    g.add(fin);
  }
  return g;
}

function magnetMesh() {
  const g = new THREE.Group();
  const red = mat(0xd62828, { roughness: 0.4 });
  const arc = mesh(new THREE.TorusGeometry(0.16, 0.06, 6, 12, Math.PI), red);
  arc.rotation.z = Math.PI;
  g.add(arc);
  for (const s of [-1, 1]) {
    const tip = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), mat(0xdfe6ee, { metalness: 0.9, roughness: 0.2 }));
    tip.position.set(s * 0.16, -0.05, 0);
    g.add(tip);
  }
  return g;
}

export function chaosTools(game) {
  const ggun = new Grabber(game, { strength: 22, maxSpeed: 40, allowAttach: false });
  const gravityGun = {
    id: 'gravgun',
    cat: 'chaos',
    name: 'Gravity Gun',
    icon: '🔫',
    hint: 'Hold on a piece to yank it toward you, release to launch it. Tap empty space for a shockwave.',
    down(p, hit) {
      if (hit?.entity?.body.isDynamic()) {
        ggun.start(p, hit);
        ggun.local.set(0, 0, 0);
        ggun.depth = 2.2;
        ggun.move(p);
        this.p = p;
        this.loop = game.sfx.loop('wind');
        return true;
      }
      // Shockwave cone.
      const d = p.dir;
      forDynamic(game, (e) => {
        bodyPos(e.body, _v).sub(p.origin);
        const dist = _v.length();
        if (dist > 9 || _v.normalize().dot(d) < 0.92) return;
        const f = (1 - dist / 9) * 14;
        e.body.applyImpulse({ x: d.x * f * e.body.mass(), y: (d.y + 0.2) * f * e.body.mass(), z: d.z * f * e.body.mass() }, true);
      });
      game.sfx.whoosh();
      game.fx.shake(0.04);
      return false;
    },
    move(p) {
      this.p = p;
      ggun.move(p);
    },
    fixed: (dt) => ggun.fixed(dt),
    update: () => ggun.update(),
    up(p) {
      const e = ggun.e;
      ggun.end(true);
      this.loop?.stop();
      if (!e?.alive) return;
      const dir = (p || this.p).dir;
      e.body.setLinvel({ x: dir.x * 32, y: dir.y * 32 + 2, z: dir.z * 32 }, true);
      game.sfx.whoosh();
      game.fx.sparks(bodyPos(e.body), { count: 10, color: 0x7de8ff, speed: 3 });
    },
    cancel() {
      ggun.end(true);
      this.loop?.stop();
    },
  };

  const magnet = {
    id: 'magnet',
    cat: 'chaos',
    name: 'Magnet',
    icon: '🧲',
    hint: 'Places a powerful magnet for a few seconds. Everything gets pulled in.',
    down(p, hit) {
      const at = hit ? hit.point.clone().addScaledVector(hit.normal, 0.35) : aimPoint(p, null, 4);
      at.y = Math.max(at.y, 0.3);
      const g = gadget(game, { lifetime: 9 });
      g.threat = { kind: 'magnet', pos: at };
      const m = g.show(magnetMesh());
      m.position.copy(at);
      m.lookAt(game.camera.position.x, at.y, game.camera.position.z);
      const loop = game.sfx.loop('buzz');
      g.loops.push(loop);
      g.fixed = (dt) => {
        if (g.expired()) return g.dispose();
        forDynamic(game, (e) => {
          bodyPos(e.body, _v);
          _w.copy(at).sub(_v);
          const d = _w.length();
          if (d > 6 || d < 0.05) return;
          const a = Math.min(45, 40 / (d * d + 0.4));
          _w.multiplyScalar(1 / d);
          const lv = e.body.linvel();
          const damp = d < 0.5 ? 0.85 : 1;
          e.body.setLinvel(
            { x: lv.x * damp + _w.x * a * dt, y: lv.y * damp + _w.y * a * dt - game.physics.gravityY * dt * 0.5, z: lv.z * damp + _w.z * a * dt },
            true,
          );
        });
        if (Math.random() < 0.3) game.fx.sparks(at, { count: 1, color: 0x7de8ff, speed: 1 });
      };
      g.update = () => {
        m.scale.setScalar(1 + Math.sin(performance.now() * 0.03) * 0.04);
      };
      game.addGadget(g);
      game.sfx.clank();
      return true;
    },
  };

  const glue = {
    id: 'glue',
    cat: 'chaos',
    name: 'Glue Gun',
    icon: '🧴',
    hint: 'Click one thing, then another, to glue them together. Works on walls and props too.',
    down(p, hit) {
      if (!hit) return false;
      const blob = mesh(new THREE.IcosahedronGeometry(0.03, 1), mat(0xfff6c8, { roughness: 0.2 }));
      blob.position.copy(hit.point);
      if (!this.first || !this.first.entity.alive) {
        this.first = { entity: hit.entity, local: toLocal(hit.entity.body, hit.point), blob };
        game.scene.add(blob);
        game.sfx.click();
        return true;
      }
      const a = this.first;
      game.scene.remove(a.blob);
      this.first = null;
      if (a.entity === hit.entity || (!a.entity.body.isDynamic() && !hit.entity.body.isDynamic())) return true;
      // Glue holds the two pieces where they are right now (nothing gets yanked
      // across the room); a glue strand bridges the gap between the two dabs.
      const worldA = toWorld(a.entity.body, a.local);
      const j = game.joints.create({
        a: a.entity,
        b: hit.entity,
        anchorA: a.local,
        anchorB: toLocal(hit.entity.body, worldA),
        kind: 'glue',
        strength: 1.5,
        breakDist: 0.3,
        hold: true,
        contacts: false,
      });
      const strand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2),
        mat(0xfff6c8, { roughness: 0.2, opacity: 0.85 }),
      );
      game.scene.add(strand);
      this.strands.push({ j, strand, localB: toLocal(hit.entity.body, hit.point) });
      game.fx.burst(hit.point, { count: 8, colors: [0xfff6c8, 0xffffff], speed: 1, size: 0.02, life: 0.6 });
      game.sfx.clank();
      return true;
    },
    strands: [],
    always() {
      // Keep glue strands stretched between their dabs; drop them when the glue breaks.
      for (let i = this.strands.length - 1; i >= 0; i--) {
        const s = this.strands[i];
        if (!s.j.alive) {
          game.scene.remove(s.strand);
          s.strand.geometry.dispose();
          this.strands.splice(i, 1);
          continue;
        }
        const pA = game.joints.worldAnchor(s.j, 'a', _v);
        const pB = toWorld(s.j.b.body, s.localB, _w);
        const len = Math.max(0.01, pA.distanceTo(pB));
        s.strand.position.copy(pA);
        s.strand.lookAt(pB);
        s.strand.scale.set(1, 1, len);
      }
    },
    update() {
      if (this.first && !this.first.entity.alive) {
        game.scene.remove(this.first.blob);
        this.first = null;
      }
      if (this.first) toWorld(this.first.entity.body, this.first.local, this.first.blob.position);
    },
    deselect() {
      if (this.first) game.scene.remove(this.first.blob);
      this.first = null;
    },
  };

  const tornado = {
    id: 'tornado',
    cat: 'chaos',
    name: 'Tornado',
    icon: '🌪️',
    hint: 'Spawns a tornado that wanders around sucking everything up.',
    down(p, hit) {
      const c = placePoint(game, p, hit);
      const g = gadget(game, { lifetime: 8 });
      g.threat = { kind: 'tornado', pos: c };
      const wander = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      const loop = game.sfx.loop('wind');
      g.loops.push(loop);
      g.fixed = (dt) => {
        if (g.expired()) return g.dispose();
        c.addScaledVector(wander, dt);
        if (Math.random() < 0.01) wander.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
        const fade = Math.min(1, (g.lifetime - (game.time - g.born)) / 1.5);
        forDynamic(game, (e) => {
          bodyPos(e.body, _v);
          const dx = _v.x - c.x;
          const dz = _v.z - c.z;
          const r = Math.hypot(dx, dz);
          if (r > 3 || _v.y > 6) return;
          const f = (1 - r / 3) * fade;
          const tx = -dz / (r + 0.01);
          const tz = dx / (r + 0.01);
          const lv = e.body.linvel();
          const k = 0.08;
          const tvx = tx * 9 * f - (dx / (r + 0.01)) * 2 * f;
          const tvz = tz * 9 * f - (dz / (r + 0.01)) * 2 * f;
          const tvy = (_v.y < 3.5 ? 6 : -1) * f;
          e.body.setLinvel({ x: lv.x + (tvx - lv.x) * k, y: lv.y + (tvy - lv.y) * k * f, z: lv.z + (tvz - lv.z) * k }, true);
        });
        for (let i = 0; i < 2; i++) {
          const y = Math.random() * 4;
          const rad = 0.2 + y * 0.35;
          const a = Math.random() * Math.PI * 2;
          game.fx.puffs.spawn(
            _v.set(c.x + Math.cos(a) * rad, y, c.z + Math.sin(a) * rad),
            _w.set(-Math.sin(a) * 4, 0.8, Math.cos(a) * 4),
            { color: 0xb8b2a6, life: 0.9, size: 0.1 + y * 0.03, grow: 1.2, gravity: 0, drag: 0.5 },
          );
        }
      };
      game.addGadget(g);
      return true;
    },
  };

  const rocket = {
    id: 'rocket',
    cat: 'chaos',
    name: 'Rocket',
    icon: '🚀',
    hint: 'Straps a rocket onto whatever you click. Liftoff in one second.',
    down(p, hit) {
      if (!hit?.entity) return false;
      const n = hit.normal.clone();
      // Rocket axis: along the surface, pointing up as much as possible.
      let axis = UP.clone().projectOnPlane(n);
      if (axis.lengthSq() < 1e-3) axis = camDir(game).projectOnPlane(n);
      axis.normalize();
      const pos = hit.point.clone().addScaledVector(n, 0.05);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, axis);
      const e = game.spawnProp({
        shape: 'cylinder',
        half: 0.15,
        r: 0.04,
        meshObj: rocketMesh(),
        mass: 1,
        pos,
        quat: q,
        lifetime: 6,
        data: { threat: 'rocket' },
      });
      e.disposeMesh = true;
      if (hit.entity.alive) game.joints.fixedNow(hit.entity, e, hit.point, { kind: 'glue', breakDist: 0.3, strength: 99 });
      let loop = null;
      e.onRemove = () => loop?.stop();
      e.fixed = (dt) => {
        const t = game.time - e.born;
        if (t < 1) {
          if (Math.random() < 0.3) game.fx.sparks(toWorld(e.body, { x: 0, y: -0.16, z: 0 }), { count: 1, speed: 0.6 });
          return;
        }
        if (!loop) loop = game.sfx.loop('rocket');
        if (t > 4) {
          const at = toWorld(e.body, { x: 0, y: 0, z: 0 });
          game.removeProp(e);
          game.explode(at, 1.6, 7, 1.2);
          return;
        }
        const dir = toWorld(e.body, UP, _w).sub(bodyPos(e.body, _v));
        const lv = e.body.linvel();
        const along = lv.x * dir.x + lv.y * dir.y + lv.z * dir.z;
        if (along < 18) {
          const F = 900 * dt;
          e.body.applyImpulse({ x: dir.x * F, y: dir.y * F, z: dir.z * F }, true);
        }
        const noz = toWorld(e.body, { x: 0, y: -0.18, z: 0 });
        game.fx.burst(noz, { count: 2, colors: [0xffc34d, 0xff6a2b, 0xffffff], speed: 3, size: 0.03, life: 0.25, glow: true, dir: dir.clone().negate(), spread: 0.3 });
        if (Math.random() < 0.4) game.fx.smoke(noz, { count: 1, size: 0.05, color: 0xcccccc, life: 0.9, speed: 0.3, up: 0.2 });
      };
      game.sfx.clank();
      return true;
    },
  };

  return [gravityGun, magnet, glue, tornado, rocket];
}
