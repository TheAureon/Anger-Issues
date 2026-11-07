import * as THREE from 'three';

export const UP = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);

export function camDir(game, out = new THREE.Vector3()) {
  return game.camera.getWorldDirection(out);
}

/** Camera right vector flattened onto the floor plane. */
export function camRight(game, out = new THREE.Vector3()) {
  camDir(game, out);
  out.set(-out.z, 0, out.x);
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  return out.normalize();
}

export function camForwardFlat(game, out = new THREE.Vector3()) {
  camDir(game, out);
  out.y = 0;
  if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
  return out.normalize();
}

export function camUp(game, out = new THREE.Vector3()) {
  return out.set(0, 1, 0).applyQuaternion(game.camera.quaternion);
}

export function camRightTrue(game, out = new THREE.Vector3()) {
  return out.set(1, 0, 0).applyQuaternion(game.camera.quaternion);
}

/** Point the pointer is aiming at: the hit, or 12 m along the ray. */
export function aimPoint(p, hit, dist = 12) {
  return hit ? hit.point.clone() : p.origin.clone().addScaledVector(p.dir, dist);
}

/** Point on the floor below/at the pointer (hit x/z, y = 0). */
export function placePoint(game, p, hit) {
  if (hit && hit.entity?.kind === 'static' && hit.normal.y > 0.5) return hit.point.clone();
  if (hit) return new THREE.Vector3(hit.point.x, 0, hit.point.z);
  return game.floorPoint(p).setY(0);
}

/**
 * Push a placement point away (toward the camera) until a machine of the given
 * footprint radius no longer overlaps the mannequin, so it isn't built inside it.
 */
export function clearOfMannequin(game, at, radius) {
  const p = at.clone();
  const away = new THREE.Vector3();
  for (let i = 0; i < 12; i++) {
    let hit = null;
    for (const e of game.mannequin.parts) {
      const t = e.body.translation();
      if (t.y > 2.2) continue;
      if (Math.hypot(t.x - p.x, t.z - p.z) < radius + 0.15) {
        hit = t;
        break;
      }
    }
    if (!hit) break;
    away.set(game.camera.position.x - p.x, 0, game.camera.position.z - p.z);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    p.addScaledVector(away.normalize(), 0.2);
  }
  return p;
}

export function isDynamic(hit) {
  return !!hit?.entity?.body.isDynamic();
}

export function quatFromDir(dir, axis = Z) {
  return new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
}

/** Impulse at a world point, scaled by the struck body's mass (clamped). */
export function smack(body, point, dir, perKg, min, max) {
  const J = THREE.MathUtils.clamp(body.mass() * perKg, min, max);
  body.applyImpulseAtPoint({ x: dir.x * J, y: dir.y * J, z: dir.z * J }, { x: point.x, y: point.y, z: point.z }, true);
}

/**
 * Show a striking object flying into `point` along `dir` and back out.
 * The object's local +Z is the strike direction and its origin is the striking face.
 */
export function strike(game, obj, point, dir, { dist = 0.45, inTime = 0.07, outTime = 0.16, onHit } = {}) {
  const q = quatFromDir(dir);
  obj.quaternion.copy(q);
  const start = point.clone().addScaledVector(dir, -dist);
  let hitDone = false;
  const total = inTime + outTime;
  game.fx.transient(obj, total, (k) => {
    const t = k * total;
    let a;
    if (t < inTime) a = t / inTime;
    else {
      if (!hitDone) {
        hitDone = true;
        onHit?.();
      }
      a = 1 - (t - inTime) / outTime;
    }
    obj.position.copy(start).addScaledVector(dir, dist * a * a);
  });
}

/** Simple gadget wrapper that tracks entities/meshes and cleans up after itself. */
export function gadget(game, { lifetime = 0, room = false } = {}) {
  const g = {
    entities: [],
    meshes: [],
    loops: [],
    born: game.time,
    lifetime,
    room,
    dead: false,
    own(e) {
      g.entities.push(e);
      return e;
    },
    show(m) {
      game.scene.add(m);
      g.meshes.push(m);
      return m;
    },
    dispose() {
      if (g.dead) return;
      g.dead = true;
      g.onDispose?.();
      for (const e of g.entities) game.physics.remove(e);
      for (const m of g.meshes) game.scene.remove(m);
      for (const l of g.loops) l.stop();
      game.removeGadget(g);
    },
    expired() {
      return g.lifetime && game.time - g.born > g.lifetime;
    },
  };
  return g;
}

/** Iterate dynamic entities (parts + props), skipping those in `skip`. */
export function forDynamic(game, fn, skip = null) {
  for (const e of game.physics.entities) {
    if (!e.body.isDynamic() || (skip && skip.has(e))) continue;
    fn(e);
  }
}
