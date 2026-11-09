import * as THREE from 'three';
import { RAPIER, bodyPos } from '../physics.js';
import { mat, mesh } from '../materials.js';
import { camDir, camRight, camUp, camRightTrue, strike, placePoint, gadget, quatFromDir, UP } from './util.js';

const steel = () => mat(0xdfe6ee, { metalness: 0.9, roughness: 0.2 });

function axeMesh() {
  const g = new THREE.Group();
  const blade = mesh(new THREE.BoxGeometry(0.02, 0.16, 0.14), steel());
  blade.position.set(0, 0, -0.07);
  const handle = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.6, 6), mat(0x8b5a2b));
  handle.position.set(0, 0.28, -0.16);
  g.add(blade, handle);
  return g;
}

function sawMesh() {
  const g = new THREE.Group();
  const blade = mesh(new THREE.BoxGeometry(0.42, 0.1, 0.008), steel());
  blade.position.set(0.05, 0.03, 0);
  const handle = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.03), mat(0xd62828));
  handle.position.set(-0.22, 0.06, 0);
  g.add(blade, handle);
  return g;
}

export function bladeTools(game) {
  const katana = {
    id: 'katana',
    cat: 'blades',
    name: 'Katana',
    icon: '🗡️',
    hint: 'Swipe across the mannequin to slice joints apart.',
    down(p) {
      this.last = { x: p.x, y: p.y };
      this.points = [{ x: p.x, y: p.y }];
      this.cool = new Map();
      return true;
    },
    move(p) {
      if (!this.last) return;
      const dx = p.x - this.last.x;
      const dy = p.y - this.last.y;
      const len = Math.hypot(dx, dy);
      if (len < 4) return;
      this.points.push({ x: p.x, y: p.y });
      if (this.points.length > 14) this.points.shift();
      game.fx.trail(this.points.slice(), 'rgba(235,245,255,0.95)', 7);
      if (len > 25) game.sfx.whoosh();
      // Swipe direction in world space.
      const wdir = camRightTrue(game).multiplyScalar(dx).addScaledVector(camUp(game), -dy).normalize();
      const n = Math.ceil(len / 8);
      for (let i = 1; i <= n; i++) {
        const sp = game.pointerAt(this.last.x + (dx * i) / n, this.last.y + (dy * i) / n);
        const hit = game.pick(sp);
        if (!hit?.entity?.body.isDynamic()) continue;
        const e = hit.entity;
        const until = this.cool.get(e) || 0;
        if (game.time < until) continue;
        this.cool.set(e, game.time + 0.15);
        e.body.applyImpulse(wdir.clone().multiplyScalar(Math.min(e.body.mass() * 2.5, 12)), true);
        if (e.kind === 'part' && game.mannequin.severNearest(e, hit.point)) {
          game.sfx.slice();
          game.fx.sparks(hit.point, { dir: wdir, count: 8 });
        }
      }
      this.last = { x: p.x, y: p.y };
    },
    up() {
      this.last = null;
    },
  };

  const axe = {
    id: 'axe',
    cat: 'blades',
    name: 'Axe',
    icon: '🪓',
    hint: 'Chop: always severs the joint closest to where you click.',
    down(p, hit) {
      if (!hit) return false;
      const dir = camDir(game).multiplyScalar(0.4).addScaledVector(hit.normal, -0.6).normalize();
      strike(game, axeMesh(), hit.point, dir, {
        dist: 0.5,
        onHit: () => {
          game.sfx.knock();
          game.fx.shake(0.04);
          const e = hit.entity;
          game.fx.burst(hit.point, { count: 8, colors: game.mannequin.skin.chips, speed: 2.5, size: 0.025 });
          if (!e?.alive || !e.body.isDynamic()) return;
          e.body.applyImpulseAtPoint(dir.clone().multiplyScalar(Math.min(e.body.mass() * 6, 30)), hit.point, true);
          if (e.kind === 'part') game.mannequin.severNearest(e, hit.point);
        },
      });
      return true;
    },
  };

  const saw = {
    id: 'saw',
    cat: 'blades',
    name: 'Saw',
    icon: '🪚',
    hint: 'Hold on a piece to saw through its nearest joint.',
    down(p, hit) {
      if (!hit) return false;
      this.mesh = sawMesh();
      game.scene.add(this.mesh);
      this.t = 0;
      this.target = null;
      this.hit = hit;
      this.loop = game.sfx.loop('buzz');
      return true;
    },
    fixed(dt) {
      if (!this.mesh || !game.pointer) return;
      const hit = game.pick(game.pointer);
      this.hit = hit;
      if (!hit?.entity?.body.isDynamic() || hit.entity.kind !== 'part') {
        this.t = 0;
        return;
      }
      if (hit.entity !== this.target) {
        this.target = hit.entity;
        this.t = 0;
      }
      this.t += dt;
      if (Math.random() < 0.5) game.fx.burst(hit.point, { count: 2, colors: game.mannequin.skin.chips, speed: 1.6, size: 0.015, life: 0.7 });
      if (this.t > 0.5) {
        this.t = 0;
        game.mannequin.severNearest(hit.entity, hit.point);
        game.sfx.slice();
      }
    },
    update() {
      if (!this.mesh || !this.hit) return;
      const s = Math.sin(performance.now() * 0.05) * 0.08;
      this.mesh.position.copy(this.hit.point).addScaledVector(camRightTrue(game), s).addScaledVector(this.hit.normal, 0.02);
      this.mesh.quaternion.copy(game.camera.quaternion);
    },
    up() {
      if (this.mesh) game.scene.remove(this.mesh);
      this.mesh = null;
      this.loop?.stop();
    },
  };

  const guillotine = {
    id: 'guillotine',
    cat: 'blades',
    name: 'Guillotine',
    icon: '⚔️',
    hint: 'Click to drop a guillotine blade. It cuts every joint in its path.',
    down(p, hit) {
      const at = placePoint(game, p, hit);
      makeGuillotine(game, at);
      return true;
    },
  };

  return [katana, axe, saw, guillotine];
}

export function makeGuillotine(game, at) {
  const g = gadget(game, { lifetime: 9 });
  g.threat = { kind: 'guillotine', pos: at.clone().setY(1) };
  const right = camRight(game);
  const normal = new THREE.Vector3().crossVectors(right, UP).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, UP, normal));
  const wood = mat(0x6b4426);
  const frame = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = mesh(new THREE.BoxGeometry(0.1, 3, 0.1), wood);
    post.position.set(s * 0.75, 1.5, 0);
    frame.add(post);
  }
  const beam = mesh(new THREE.BoxGeometry(1.7, 0.12, 0.14), wood);
  beam.position.y = 3;
  frame.add(beam);
  frame.position.copy(at).setY(0);
  frame.quaternion.copy(q);
  g.show(frame);
  const bladeMesh = new THREE.Group();
  const blade = mesh(new THREE.BoxGeometry(1.36, 0.28, 0.02), steel());
  const weight = mesh(new THREE.BoxGeometry(1.36, 0.14, 0.08), mat(0x333333, { metalness: 0.5 }));
  weight.position.y = 0.2;
  bladeMesh.add(blade, weight);
  let y = 2.75;
  let v = 0;
  const center = at.clone().setY(0);
  const blade_ = g.own(
    game.physics.create({
      body: RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, y, center.z).setRotation(q),
      colliders: [RAPIER.ColliderDesc.cuboid(0.68, 0.14, 0.02)],
      mesh: bladeMesh,
      kind: 'gadget',
    }),
  );
  const tmp = new THREE.Vector3();
  let landed = false;
  game.sfx.whoosh();
  g.fixed = (dt) => {
    if (g.expired()) return g.dispose();
    if (landed) return;
    v += 30 * dt;
    const prev = y;
    y = Math.max(0.16, y - v * dt);
    blade_.body.setNextKinematicTranslation({ x: center.x, y, z: center.z });
    const bottom = y - 0.14;
    const prevBottom = prev - 0.14;
    for (const j of [...game.joints.list]) {
      game.joints.worldAnchor(j, 'b', tmp);
      if (tmp.y > prevBottom + 0.05 || tmp.y < bottom - 0.05) continue;
      tmp.sub(center);
      if (Math.abs(tmp.dot(normal)) > 0.13 || Math.abs(tmp.dot(right)) > 0.7) continue;
      game.mannequin.sever(j);
      game.sfx.slice();
    }
    if (y <= 0.16) {
      landed = true;
      game.sfx.thud(1);
      game.fx.shake(0.08);
      game.fx.smoke(center, { count: 6, color: 0xaaaaaa });
    }
  };
  return game.addGadget(g);
}

export { bodyPos, quatFromDir };
