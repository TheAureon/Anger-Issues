import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

export async function initRapier() {
  await RAPIER.init();
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Body-local -> world. */
export function toWorld(body, local, out = new THREE.Vector3()) {
  const t = body.translation();
  const r = body.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  return out.set(local.x, local.y, local.z).applyQuaternion(_q).add(_v.set(t.x, t.y, t.z));
}

/** World -> body-local. */
export function toLocal(body, world, out = new THREE.Vector3()) {
  const t = body.translation();
  const r = body.rotation();
  _q.set(r.x, r.y, r.z, r.w).invert();
  return out.set(world.x - t.x, world.y - t.y, world.z - t.z).applyQuaternion(_q);
}

export function bodyPos(body, out = new THREE.Vector3()) {
  const t = body.translation();
  return out.set(t.x, t.y, t.z);
}

export function bodyQuat(body, out = new THREE.Quaternion()) {
  const r = body.rotation();
  return out.set(r.x, r.y, r.z, r.w);
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}

/**
 * Thin wrapper over a Rapier world that keeps "entities": a rigid body,
 * its colliders and an optional Three.js mesh that follows it.
 */
export class Physics {
  constructor(scene) {
    this.scene = scene;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.queue = new RAPIER.EventQueue(true);
    this.byCollider = new Map();
    this.byBody = new Map();
    this.entities = new Set();
    this.removeHooks = [];
    this.nextId = 1;
    this.gravityY = -9.81;
  }

  setGravity(y) {
    this.gravityY = y;
    this.world.gravity = { x: 0, y, z: 0 };
    for (const e of this.entities) if (e.body.isDynamic()) e.body.wakeUp();
  }

  /**
   * @param {object} o
   * @param {RAPIER.RigidBodyDesc} o.body
   * @param {RAPIER.ColliderDesc[]} [o.colliders]
   * @param {THREE.Object3D} [o.mesh]
   * @param {string} [o.kind] part | prop | static | gadget | stand
   */
  create({ body, colliders = [], mesh = null, kind = 'prop', data = {} }) {
    const rb = this.world.createRigidBody(body);
    const e = { id: this.nextId++, body: rb, mesh, kind, joints: [], colliders: [], alive: true, ...data };
    for (const cd of colliders) this.addCollider(e, cd);
    this.byBody.set(rb.handle, e);
    this.entities.add(e);
    if (mesh) {
      this.scene.add(mesh);
      this.syncEntity(e);
    }
    return e;
  }

  addCollider(e, cd) {
    const c = this.world.createCollider(cd, e.body);
    e.colliders.push(c);
    this.byCollider.set(c.handle, e);
    return c;
  }

  remove(e) {
    if (!e || !e.alive) return;
    for (const h of this.removeHooks) h(e);
    e.alive = false;
    for (const c of e.colliders) this.byCollider.delete(c.handle);
    this.byBody.delete(e.body.handle);
    this.entities.delete(e);
    this.world.removeRigidBody(e.body);
    if (e.mesh) {
      this.scene.remove(e.mesh);
      if (e.disposeMesh) disposeObject(e.mesh);
    }
  }

  entityOf(collider) {
    if (collider == null) return null;
    return this.byCollider.get(typeof collider === 'number' ? collider : collider.handle) || null;
  }

  step() {
    this.world.step(this.queue);
  }

  syncEntity(e) {
    const t = e.body.translation();
    const r = e.body.rotation();
    e.mesh.position.set(t.x, t.y, t.z);
    e.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  sync() {
    for (const e of this.entities) {
      if (e.mesh && !e.body.isFixed() && !e.noSync) this.syncEntity(e);
    }
  }

  /** Ray cast ignoring sensors. predicate(entity, collider) can filter hits. */
  raycast(origin, dir, maxToi = 200, predicate = null) {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const pred = (c) => {
      const e = this.byCollider.get(c.handle);
      if (!e) return false;
      return predicate ? predicate(e, c) : true;
    };
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      pred,
    );
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi;
    const entity = this.byCollider.get(hit.collider.handle);
    return {
      entity,
      collider: hit.collider,
      toi,
      point: new THREE.Vector3(origin.x + dir.x * toi, origin.y + dir.y * toi, origin.z + dir.z * toi),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  /** Nearest surface point on a collider passing predicate(entity). */
  project(point, predicate) {
    const res = this.world.projectPoint(
      { x: point.x, y: point.y, z: point.z },
      false,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (c) => {
        const e = this.byCollider.get(c.handle);
        return !!e && predicate(e);
      },
    );
    if (!res) return null;
    return {
      entity: this.byCollider.get(res.collider.handle),
      point: new THREE.Vector3(res.point.x, res.point.y, res.point.z),
      inside: res.isInside,
    };
  }

  /** Calls fn(entity) for every entity intersecting a sensor collider. */
  sensorHits(collider, fn) {
    this.world.intersectionPairsWith(collider, (other) => {
      const e = this.byCollider.get(other.handle);
      if (e) fn(e);
    });
  }
}
