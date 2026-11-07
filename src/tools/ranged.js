import * as THREE from 'three';
import { RAPIER, toWorld } from '../physics.js';
import { mat, mesh, geo } from '../materials.js';
import { camDir, camUp, aimPoint, quatFromDir, Z } from './util.js';

const BALL_COLORS = [0xd7ff3a, 0xff5a5a, 0x5ab4ff, 0xffb13a, 0xc77dff];

function arrowMesh() {
  const g = new THREE.Group();
  const shaft = mesh(geo('arrowShaft', () => new THREE.CylinderGeometry(0.008, 0.008, 0.64, 5).rotateX(Math.PI / 2)), mat(0xc49a6c));
  const tip = mesh(geo('arrowTip', () => new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(Math.PI / 2)), mat(0x8a929b, { metalness: 0.7 }));
  tip.position.z = 0.34;
  g.add(shaft, tip);
  for (let i = 0; i < 3; i++) {
    const f = mesh(geo('fletch', () => new THREE.BoxGeometry(0.002, 0.04, 0.09)), mat(0xff4d4d));
    f.position.z = -0.28;
    f.rotation.z = (i * Math.PI * 2) / 3;
    f.position.x = Math.sin(f.rotation.z) * -0.012;
    f.position.y = Math.cos(f.rotation.z) * 0.012;
    g.add(f);
  }
  return g;
}

export function rangedTools(game) {
  const muzzle = (out = new THREE.Vector3()) =>
    out.copy(game.camera.position).addScaledVector(camUp(game), -0.18).addScaledVector(camDir(game), 0.35);

  const slingshot = {
    id: 'slingshot',
    cat: 'ranged',
    name: 'Slingshot',
    icon: '🪃',
    hint: 'Press, pull back and let go. The further you pull, the harder it flies.',
    down(p) {
      this.start = { x: p.x, y: p.y };
      this.cur = { x: p.x, y: p.y };
      this.draw = (c) => {
        const s = this.start;
        const k = this.cur;
        c.strokeStyle = '#6b3f1f';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(s.x - 22, s.y - 30);
        c.lineTo(s.x, s.y);
        c.lineTo(s.x + 22, s.y - 30);
        c.moveTo(s.x, s.y);
        c.lineTo(s.x, s.y + 34);
        c.stroke();
        c.strokeStyle = '#e8c07a';
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(s.x - 22, s.y - 30);
        c.lineTo(k.x, k.y);
        c.lineTo(s.x + 22, s.y - 30);
        c.stroke();
        c.fillStyle = '#777';
        c.beginPath();
        c.arc(k.x, k.y, 7, 0, Math.PI * 2);
        c.fill();
      };
      game.fx.drawers.add(this.draw);
      return true;
    },
    move(p) {
      if (this.cur) this.cur = { x: p.x, y: p.y };
    },
    up() {
      game.fx.drawers.delete(this.draw);
      if (!this.start) return;
      const dx = this.start.x - this.cur.x;
      const dy = this.start.y - this.cur.y;
      const len = Math.min(260, Math.hypot(dx, dy));
      const aim = game.pointerAt(this.start.x + dx * 1.2, this.start.y + dy * 1.2);
      const speed = 8 + (len / 260) * 30;
      const pos = muzzle();
      const target = aimPoint(aim, game.pick(aim), 20);
      const dir = target.sub(pos).normalize();
      game.spawnProp({
        shape: 'ball',
        r: 0.06,
        mass: 1.5,
        pos,
        vel: dir.multiplyScalar(speed),
        color: 0x777777,
        ccd: true,
        lifetime: 10,
      });
      game.sfx.twang();
      this.start = null;
    },
    cancel() {
      game.fx.drawers.delete(this.draw);
      this.start = null;
    },
  };

  const cannon = {
    id: 'cannon',
    cat: 'ranged',
    name: 'Cannon',
    icon: '💥',
    hint: 'Fires a heavy cannonball at whatever you click.',
    down(p, hit) {
      const pos = muzzle();
      const dir = aimPoint(p, hit, 20).sub(pos).normalize();
      game.spawnProp({
        shape: 'ball',
        r: 0.13,
        mass: 30,
        pos,
        data: { threat: 'cannon' },
        vel: dir.clone().multiplyScalar(40),
        material: mat(0x1d1f22, { metalness: 0.7, roughness: 0.4 }),
        ccd: true,
        lifetime: 10,
        restitution: 0.15,
        events: RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
      });
      game.sfx.boom(0.5);
      game.fx.shake(0.06);
      game.fx.smoke(pos.clone().addScaledVector(dir, 0.6), { count: 5, color: 0xcccccc, size: 0.05, life: 0.8 });
      return true;
    },
  };

  const bow = {
    id: 'bow',
    cat: 'ranged',
    name: 'Bow',
    icon: '🏹',
    hint: 'Hold to draw, release to shoot. Arrows stick in whatever they hit.',
    down(p) {
      this.t0 = performance.now();
      this.p = p;
      this.draw = (c) => {
        const k = this.power();
        const q = this.p;
        c.strokeStyle = 'rgba(255,255,255,0.9)';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(q.x, q.y, 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        c.stroke();
      };
      game.fx.drawers.add(this.draw);
      return true;
    },
    move(p) {
      this.p = p;
    },
    power() {
      return Math.min(1, (performance.now() - this.t0) / 700);
    },
    up(p) {
      game.fx.drawers.delete(this.draw);
      const ptr = p || this.p;
      const k = Math.max(0.15, this.power());
      const pos = muzzle();
      const dir = aimPoint(ptr, game.pick(ptr), 20).sub(pos).normalize();
      fireArrow(game, pos, dir, 16 + 38 * k);
      game.sfx.twang();
    },
    cancel() {
      game.fx.drawers.delete(this.draw);
    },
  };

  const launcher = {
    id: 'launcher',
    cat: 'ranged',
    name: 'Ball Launcher',
    icon: '🎾',
    hint: 'Hold to spray bouncy balls.',
    down() {
      this.next = 0;
      this.on = true;
      return true;
    },
    fixed() {
      if (!this.on || game.time < this.next || !game.pointer) return;
      this.next = game.time + 0.07;
      const ptr = game.pointer;
      const pos = muzzle();
      const dir = aimPoint(ptr, game.pick(ptr), 20).sub(pos).normalize();
      dir.x += (Math.random() - 0.5) * 0.05;
      dir.y += (Math.random() - 0.5) * 0.05;
      dir.z += (Math.random() - 0.5) * 0.05;
      game.spawnProp({
        shape: 'ball',
        r: 0.065,
        mass: 0.3,
        pos,
        vel: dir.normalize().multiplyScalar(24),
        color: BALL_COLORS[(Math.random() * BALL_COLORS.length) | 0],
        restitution: 0.8,
        lifetime: 7,
      });
      game.sfx.pop();
    },
    up() {
      this.on = false;
    },
  };

  return [slingshot, cannon, bow, launcher];
}

export function fireArrow(game, pos, dir, speed) {
  const q = quatFromDir(dir, Z);
  const e = game.spawnProp({
    colliders: [RAPIER.ColliderDesc.cuboid(0.012, 0.012, 0.33)],
    meshObj: arrowMesh(),
    mass: 0.4,
    pos,
    quat: q,
    vel: dir.clone().multiplyScalar(speed),
    ccd: true,
    lifetime: 25,
    restitution: 0,
    events: RAPIER.ActiveEvents.COLLISION_EVENTS,
  });
  const tipLocal = new THREE.Vector3(0, 0, 0.3);
  const v = new THREE.Vector3();
  e.fixed = () => {
    if (e.stuck) return;
    const lv = e.body.linvel();
    v.set(lv.x, lv.y, lv.z);
    if (v.lengthSq() > 4) e.body.setRotation(quatFromDir(v, Z), true);
  };
  e.onCollide = (other) => {
    if (e.stuck || !other || !other.alive) return;
    e.stuck = true;
    // Stick at the tip with the current pose.
    const tip = toWorld(e.body, tipLocal);
    game.joints.fixedNow(other, e, tip, { kind: 'attach', breakDist: 0.2, strength: 0.6 });
    game.sfx.knock();
    if (other.kind === 'part') {
      game.mannequin.damage(other, 0.3, tip);
      game.fx.burst(tip, { count: 6, colors: game.mannequin.skin.chips, speed: 1.5, size: 0.02 });
    }
  };
  return e;
}
