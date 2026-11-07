import * as THREE from 'three';
import { RAPIER, toWorld } from '../physics.js';
import { mat, mesh, geo } from '../materials.js';
import { placePoint, UP } from './util.js';

function dynamiteMesh() {
  const g = new THREE.Group();
  const red = mat(0xc62828);
  for (const [x, z] of [[-0.03, 0], [0.03, 0], [0, 0.045]]) {
    const s = mesh(geo('dyn', () => new THREE.CylinderGeometry(0.028, 0.028, 0.22, 7)), red);
    s.position.set(x, 0, z - 0.015);
    g.add(s);
  }
  const tape = mesh(geo('dyntape', () => new THREE.CylinderGeometry(0.075, 0.075, 0.03, 8)), mat(0x222222));
  tape.scale.z = 0.8;
  g.add(tape);
  const fuse = mesh(geo('fuse', () => new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4)), mat(0xeeeeee));
  fuse.position.set(0, 0.15, 0);
  g.add(fuse);
  return g;
}

function bombMesh() {
  const g = new THREE.Group();
  const ball = mesh(geo('bomb', () => new THREE.IcosahedronGeometry(0.13, 1)), mat(0x15161a, { roughness: 0.35, metalness: 0.4 }));
  const holes = mat(0x444444);
  for (const [x, y] of [[-0.03, 0.08], [0.03, 0.08], [0, 0.04]]) {
    const h = mesh(geo('bhole', () => new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6)), holes);
    h.position.set(x, y, 0.1);
    h.rotation.x = Math.PI / 2;
    g.add(h);
  }
  const cap = mesh(geo('bcap', () => new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6)), mat(0x888888, { metalness: 0.8 }));
  cap.position.y = 0.13;
  g.add(cap);
  return g;
}

export function explosiveTools(game) {
  const firecrackers = {
    id: 'firecrackers',
    cat: 'explosives',
    name: 'Firecrackers',
    icon: '🧨',
    hint: 'Scatters a pack of firecrackers that go off one after another.',
    down(p, hit) {
      const at = hit ? hit.point.clone().addScaledVector(hit.normal, 0.08) : placePoint(game, p, hit).setY(0.1);
      for (let i = 0; i < 7; i++) {
        const e = game.spawnProp({
          shape: 'cylinder',
          half: 0.045,
          r: 0.014,
          mass: 0.05,
          pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.1, (Math.random() - 0.5) * 0.2)),
          vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3),
          angvel: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
          material: mat(0xff2a2a),
          lifetime: 6,
        });
        const fuse = 0.5 + i * 0.18 + Math.random() * 0.25;
        e.fixed = () => {
          if (game.time - e.born < fuse) {
            if (Math.random() < 0.3) game.fx.sparks(toWorld(e.body, { x: 0, y: 0.05, z: 0 }), { count: 1, speed: 0.8 });
            return;
          }
          const pos = toWorld(e.body, { x: 0, y: 0, z: 0 });
          game.removeProp(e);
          game.explode(pos, 0.9, 4.5, 0.3, { sound: false, fx: false });
          game.fx.flash(pos, 0.35, 0.15);
          game.fx.sparks(pos, { count: 12, speed: 3 });
          game.fx.smoke(pos, { count: 3, size: 0.05, color: 0xbbbbbb, life: 0.8 });
          game.sfx.pop();
          game.fx.shake(0.02);
        };
      }
      return true;
    },
  };

  const dynamite = {
    id: 'dynamite',
    cat: 'explosives',
    name: 'Dynamite',
    icon: '💣',
    hint: 'Sticks dynamite to whatever you click. Big boom after a short fuse.',
    down(p, hit) {
      const at = hit ? hit.point.clone().addScaledVector(hit.normal, 0.075) : placePoint(game, p, hit).setY(0.12);
      const n = hit ? hit.normal.clone() : UP.clone();
      // Stand it upright on floors; on walls/bodies lay it along the surface.
      const along = UP.clone().projectOnPlane(n);
      const axis = n.y > 0.7 || along.lengthSq() < 1e-4 ? UP : along.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, axis);
      const e = game.spawnProp({
        colliders: [RAPIER.ColliderDesc.cuboid(0.06, 0.11, 0.045)],
        meshObj: dynamiteMesh(),
        mass: 0.6,
        pos: at,
        quat: q,
        lifetime: 8,
        data: { threat: 'dynamite' },
      });
      e.disposeMesh = true;
      if (hit?.entity?.alive && hit.entity.kind !== 'static') {
        game.joints.fixedNow(hit.entity, e, hit.point, { kind: 'glue', breakDist: 0.25, strength: 99 });
      }
      const loop = game.sfx.loop('rocket');
      e.onRemove = () => loop.stop();
      e.fixed = () => {
        const t = game.time - e.born;
        if (t < 2.2) {
          game.fx.sparks(toWorld(e.body, { x: 0, y: 0.2 - t * 0.03, z: 0 }), { count: 1, speed: 1.2 });
          return;
        }
        const pos = toWorld(e.body, { x: 0, y: 0, z: 0 });
        game.removeProp(e);
        game.explode(pos, 3, 13, 2.4);
      };
      game.sfx.click();
      return true;
    },
  };

  const bomb = {
    id: 'bomb',
    cat: 'explosives',
    name: 'Bowling Bomb',
    icon: '🎳',
    hint: 'Drops a heavy bowling-ball bomb that goes off on impact.',
    down(p, hit) {
      const at = hit ? hit.point.clone() : placePoint(game, p, hit);
      const pos = new THREE.Vector3(at.x, Math.max(at.y, 0) + 2.2, at.z);
      const e = game.spawnProp({
        shape: 'ball',
        r: 0.13,
        meshObj: bombMesh(),
        mass: 7,
        pos,
        data: { threat: 'bomb' },
        vel: new THREE.Vector3(0, -1, 0),
        angvel: new THREE.Vector3(Math.random() * 4, 0, Math.random() * 4),
        lifetime: 8,
        ccd: true,
        events: RAPIER.ActiveEvents.COLLISION_EVENTS,
      });
      e.disposeMesh = true;
      const boom = () => {
        if (!e.alive) return;
        const pt = toWorld(e.body, { x: 0, y: 0, z: 0 });
        game.removeProp(e);
        game.explode(pt, 3.4, 16, 2.6);
      };
      e.onCollide = () => {
        if (game.time - e.born > 0.15) game.later(0, boom);
      };
      e.fixed = () => {
        if (Math.random() < 0.5) game.fx.sparks(toWorld(e.body, { x: 0, y: 0.15, z: 0 }), { count: 1, speed: 0.8 });
        if (game.time - e.born > 3.5) boom();
      };
      game.sfx.whistle();
      return true;
    },
  };

  return [firecrackers, dynamite, bomb];
}
