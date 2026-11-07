import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { mat, mesh } from '../materials.js';
import { camDir, camRight, smack, strike, placePoint, UP } from './util.js';

function hammerMesh() {
  const g = new THREE.Group();
  const head = mesh(new THREE.BoxGeometry(0.11, 0.11, 0.24), mat(0x6d737a, { metalness: 0.7, roughness: 0.35 }));
  head.position.set(0, 0, -0.12);
  const handle = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.55, 6), mat(0x8b5a2b));
  handle.position.set(0, 0.3, -0.12);
  g.add(head, handle);
  return g;
}

function batMesh() {
  const g = new THREE.Group();
  const bat = mesh(new THREE.CylinderGeometry(0.045, 0.018, 0.85, 8), mat(0xc58b4b));
  bat.position.set(0, 0.32, -0.05);
  const tape = mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.18, 8), mat(0x222222));
  tape.position.set(0, 0.68, -0.05);
  g.add(bat, tape);
  return g;
}

function gloveMesh() {
  const g = new THREE.Group();
  const red = mat(0xd62828, { roughness: 0.4 });
  const glove = mesh(new THREE.IcosahedronGeometry(0.11, 1), red);
  glove.scale.set(1, 0.9, 1.1);
  glove.position.z = -0.1;
  const thumb = mesh(new THREE.IcosahedronGeometry(0.045, 0), red);
  thumb.position.set(0.09, 0.02, -0.08);
  const cuff = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 8).rotateX(Math.PI / 2), mat(0xffffff));
  cuff.position.z = -0.23;
  // Spring: a long coil drawn as a stretched helix line.
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const a = i * 0.6;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.035, Math.sin(a) * 0.035, -0.27 - i * 0.01));
  }
  const spring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbfc5cc }));
  g.add(glove, thumb, cuff, spring);
  return g;
}

function anvilMesh() {
  const g = new THREE.Group();
  const m = mat(0x3d4148, { metalness: 0.8, roughness: 0.35 });
  const base = mesh(new THREE.BoxGeometry(0.36, 0.1, 0.24), m);
  base.position.y = -0.1;
  const waist = mesh(new THREE.BoxGeometry(0.18, 0.1, 0.14), m);
  const top = mesh(new THREE.BoxGeometry(0.42, 0.12, 0.22), m);
  top.position.y = 0.11;
  const horn = mesh(new THREE.ConeGeometry(0.07, 0.26, 6).rotateZ(-Math.PI / 2), m);
  horn.position.set(0.33, 0.12, 0);
  g.add(base, waist, top, horn);
  return g;
}

export function bluntTools(game) {
  const repeat = (tool, gap) => {
    tool.fixed = function () {
      if (!this.holding || game.time < this.next || !game.pointer) return;
      this.next = game.time + gap;
      const hit = game.pick(game.pointer);
      if (hit) this.hitAt(game.pointer, hit);
    };
    tool.up = function () {
      this.holding = false;
    };
    tool.cancel = tool.up;
    const down = tool.down;
    tool.down = function (p, hit) {
      const ok = down.call(this, p, hit);
      if (ok) {
        this.holding = true;
        this.next = game.time + gap;
      }
      return ok;
    };
    return tool;
  };

  const hammer = repeat(
    {
      id: 'hammer',
      cat: 'blunt',
      name: 'Hammer',
      icon: '🔨',
      hint: 'Click to bonk. Hold to keep hammering. Enough hits knock a joint loose.',
      down(p, hit) {
        if (!hit) return false;
        this.hitAt(p, hit);
        return true;
      },
      hitAt(p, hit) {
        const dir = camDir(game).multiplyScalar(0.5).addScaledVector(hit.normal, -0.5).normalize();
        strike(game, hammerMesh(), hit.point, dir, {
          onHit: () => {
            game.sfx.thud(0.6);
            game.fx.burst(hit.point, { count: 5, colors: [0xffffff, 0xffe08a], speed: 2, size: 0.02, life: 0.3, glow: true });
            game.fx.shake(0.03);
            const e = hit.entity;
            if (!e?.alive || !e.body.isDynamic()) return;
            smack(e.body, hit.point, dir, 9, 6, 45);
            if (e.kind === 'part') game.mannequin.damage(e, 0.34, hit.point);
          },
        });
      },
    },
    0.28,
  );

  const bat = {
    id: 'bat',
    cat: 'blunt',
    name: 'Bat',
    icon: '🏏',
    hint: 'Big sideways swing. Sends pieces flying.',
    down(p, hit) {
      if (!hit) return false;
      const side = camRight(game);
      const dir = side.clone().multiplyScalar(-1).addScaledVector(UP, 0.35).addScaledVector(camDir(game), 0.3).normalize();
      game.sfx.whoosh();
      strike(game, batMesh(), hit.point, dir, {
        dist: 0.7,
        inTime: 0.09,
        onHit: () => {
          game.sfx.thud(1);
          game.fx.shake(0.06);
          const e = hit.entity;
          if (!e?.alive || !e.body.isDynamic()) return;
          smack(e.body, hit.point, dir, 16, 12, 90);
          if (e.kind === 'part') game.mannequin.damage(e, 0.5, hit.point);
        },
      });
      return true;
    },
  };

  const anvil = {
    id: 'anvil',
    cat: 'blunt',
    name: 'Anvil',
    icon: '🪨',
    hint: 'Drops a very heavy anvil from above wherever you click.',
    down(p, hit) {
      const at = hit ? hit.point.clone() : placePoint(game, p, hit);
      const pos = new THREE.Vector3(at.x, Math.max(at.y, 0) + 2.6, at.z);
      const cds = [
        RAPIER.ColliderDesc.cuboid(0.18, 0.05, 0.12).setTranslation(0, -0.1, 0),
        RAPIER.ColliderDesc.cuboid(0.09, 0.05, 0.07),
        RAPIER.ColliderDesc.cuboid(0.21, 0.06, 0.11).setTranslation(0, 0.11, 0),
      ];
      const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI);
      const e = game.spawnProp({
        colliders: cds,
        meshObj: anvilMesh(),
        mass: 140,
        pos,
        quat: q,
        vel: new THREE.Vector3(0, -2, 0),
        ccd: true,
        lifetime: 14,
        restitution: 0.05,
        friction: 0.9,
        events: RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        data: { threat: 'anvil' },
      });
      e.disposeMesh = true;
      game.sfx.whistle();
      return true;
    },
  };

  const glove = repeat(
    {
      id: 'glove',
      cat: 'blunt',
      name: 'Spring Glove',
      icon: '🥊',
      hint: 'A boxing glove on a spring punches out of nowhere. Hold for a flurry.',
      down(p, hit) {
        if (!hit) return false;
        this.hitAt(p, hit);
        return true;
      },
      hitAt(p, hit) {
        const dir = p.dir.clone();
        strike(game, gloveMesh(), hit.point, dir, {
          dist: 1.1,
          inTime: 0.08,
          outTime: 0.3,
          onHit: () => {
            game.sfx.boing();
            game.sfx.thud(0.8);
            game.fx.shake(0.04);
            const e = hit.entity;
            if (!e?.alive || !e.body.isDynamic()) return;
            smack(e.body, hit.point, dir.clone().addScaledVector(UP, 0.15).normalize(), 18, 12, 85);
            if (e.kind === 'part') game.mannequin.damage(e, 0.4, hit.point);
          },
        });
      },
    },
    0.42,
  );

  return [hammer, bat, anvil, glove];
}
