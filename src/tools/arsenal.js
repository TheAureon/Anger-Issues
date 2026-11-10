import * as THREE from 'three';
import { RAPIER, toWorld, toLocal, bodyPos } from '../physics.js';
import { mat, mesh, geo } from '../materials.js';
import { camDir, camUp, camRightTrue, strike, smack, aimPoint, placePoint, quatFromDir, gadget, Z, UP } from './util.js';

/*
 * The expanded arsenal: heavy hitters, power blades, guns, big explosives
 * and weather/science chaos. Grouped by dock category; see tools/index.js.
 */

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const steel = () => mat(0xdfe6ee, { metalness: 0.9, roughness: 0.2 });

const muzzle = (game, out = new THREE.Vector3()) => out.copy(game.camera.position).addScaledVector(camUp(game), -0.18).addScaledVector(camDir(game), 0.35);

/** Hold-to-repeat helper for click tools. */
function repeating(game, tool, gap) {
  const down = tool.down;
  tool.down = function (p, hit) {
    const ok = down.call(this, p, hit);
    if (ok) {
      this.holding = true;
      this.next = game.time + gap;
    }
    return ok;
  };
  tool.fixed = function () {
    if (!this.holding || game.time < this.next || !game.pointer) return;
    this.next = game.time + gap;
    const hit = game.pick(game.pointer);
    if (hit) this.hitAt(game.pointer, hit);
  };
  tool.up = tool.cancel = function () {
    this.holding = false;
  };
  return tool;
}

/**
 * Projectile that sticks into whatever it hits (nails, shuriken, harpoon tips).
 * onHit(other, tipWorld, e) runs once on first contact.
 */
function sticky(game, { pos, dir, speed, meshObj, half, tipZ, mass, gravityScale = 1, align = true, spin = null, lifetime = 20, onHit }) {
  const e = game.spawnProp({
    colliders: [RAPIER.ColliderDesc.cuboid(...half)],
    meshObj,
    mass,
    pos,
    quat: quatFromDir(dir, Z),
    vel: dir.clone().multiplyScalar(speed),
    angvel: spin,
    ccd: true,
    lifetime,
    restitution: 0,
    gravityScale,
    angularDamping: 0,
    events: RAPIER.ActiveEvents.COLLISION_EVENTS,
  });
  e.disposeMesh = true;
  const tipLocal = new THREE.Vector3(0, 0, tipZ);
  if (align) {
    e.fixed = () => {
      if (e.stuck) return;
      const lv = e.body.linvel();
      _v.set(lv.x, lv.y, lv.z);
      if (_v.lengthSq() > 4) e.body.setRotation(quatFromDir(_v, Z), true);
    };
  }
  e.onCollide = (other) => {
    if (e.stuck || !other || !other.alive) return;
    e.stuck = true;
    const tip = toWorld(e.body, tipLocal);
    game.joints.fixedNow(other, e, tip, { kind: 'attach', breakDist: 0.2, strength: 0.6 });
    onHit?.(other, tip, e);
  };
  return e;
}

/* ================================================================== */
/* Blunt                                                               */
/* ================================================================== */

function panMesh() {
  const g = new THREE.Group();
  const pan = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.04, 14).rotateX(Math.PI / 2), mat(0x2b2b2e, { metalness: 0.6, roughness: 0.35 }));
  pan.position.z = -0.02;
  const inner = mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.005, 14).rotateX(Math.PI / 2), mat(0x444448, { metalness: 0.8, roughness: 0.25 }));
  inner.position.z = -0.045;
  const handle = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.36, 6), mat(0x1a1a1a));
  handle.position.set(0, 0.33, -0.03);
  g.add(pan, inner, handle);
  return g;
}

function sledgeMesh() {
  const g = new THREE.Group();
  const head = mesh(new THREE.BoxGeometry(0.17, 0.17, 0.36), mat(0x55595f, { metalness: 0.8, roughness: 0.35 }));
  head.position.z = -0.18;
  const handle = mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.95, 6), mat(0xa4723f));
  handle.position.set(0, 0.5, -0.18);
  g.add(head, handle);
  return g;
}

export function heavyTools(game) {
  const pan = repeating(
    game,
    {
      id: 'pan',
      cat: 'blunt',
      name: 'Frying Pan',
      icon: '🍳',
      hint: 'BONG. Hits to the head leave it seeing stars. Hold to keep swinging.',
      down(p, hit) {
        if (!hit) return false;
        this.hitAt(p, hit);
        return true;
      },
      hitAt(p, hit) {
        const dir = camDir(game).multiplyScalar(0.5).addScaledVector(hit.normal, -0.5).normalize();
        strike(game, panMesh(), hit.point, dir, {
          dist: 0.55,
          onHit: () => {
            game.sfx.clang();
            game.fx.shake(0.05);
            game.fx.burst(hit.point, { count: 8, colors: [0xffffff, 0xffe08a], speed: 2.5, size: 0.02, life: 0.3, glow: true });
            const e = hit.entity;
            if (!e?.alive || !e.body.isDynamic()) return;
            smack(e.body, hit.point, dir, 11, 8, 55);
            if (e.kind === 'part') {
              game.mannequin.damage(e, 0.3, hit.point);
              if (e.partName === 'head' && game.life) {
                game.life.dizzy = Math.max(game.life.dizzy, 3.5);
                game.ui?.flashWord('BONG!', true);
              }
            }
          },
        });
      },
    },
    0.4,
  );

  const sledge = {
    id: 'sledge',
    cat: 'blunt',
    name: 'Sledgehammer',
    icon: '⚒️',
    hint: 'Slow wind-up, enormous hit. The shockwave knocks everything nearby off its feet.',
    down(p, hit) {
      if (!hit) return false;
      const dir = camDir(game).multiplyScalar(0.35).addScaledVector(hit.normal, -0.65).normalize();
      game.sfx.whoosh();
      strike(game, sledgeMesh(), hit.point, dir, {
        dist: 0.9,
        inTime: 0.22,
        outTime: 0.3,
        onHit: () => {
          game.sfx.thud(1);
          game.sfx.boom(0.25);
          game.fx.shake(0.16);
          const ground = new THREE.Vector3(hit.point.x, 0.05, hit.point.z);
          game.fx.smoke(ground, { count: 12, color: 0xb8ad9c, size: 0.12, speed: 2, up: 0.4 });
          game.explode(hit.point, 1.6, 3.5, 0, { sound: false, fx: false });
          const e = hit.entity;
          if (!e?.alive || !e.body.isDynamic()) return;
          smack(e.body, hit.point, dir, 26, 20, 140);
          if (e.kind === 'part') game.mannequin.damage(e, 0.85, hit.point);
        },
      });
      return true;
    },
  };
  return [pan, sledge];
}

/* ================================================================== */
/* Blades                                                              */
/* ================================================================== */

function chainsawMesh() {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.16, 0.14, 0.24), mat(0xff7a1a, { roughness: 0.5 }));
  body.position.set(-0.24, 0.02, 0);
  const handle = mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI), mat(0x222222));
  handle.position.set(-0.24, 0.09, 0);
  const bar = mesh(new THREE.BoxGeometry(0.42, 0.06, 0.02), steel());
  bar.position.set(0.05, 0, 0);
  const chain = mesh(new THREE.BoxGeometry(0.44, 0.075, 0.012), mat(0x333333, { metalness: 0.7 }));
  chain.position.set(0.05, 0, 0);
  g.add(body, handle, chain, bar);
  return g;
}

function shurikenMesh() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 0.025 : 0.085;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.012, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false });
  g.center();
  // Lie flat in the XZ plane so it spins like a frisbee as it flies along Z.
  g.rotateX(Math.PI / 2);
  return mesh(g, steel());
}

export function powerBladeTools(game) {
  const chainsaw = {
    id: 'chainsaw',
    cat: 'blades',
    name: 'Chainsaw',
    icon: '🪚',
    hint: 'Hold on the body. Revs up and rips through joints fast.',
    down(p, hit) {
      if (!hit) return false;
      this.mesh = chainsawMesh();
      game.scene.add(this.mesh);
      this.t = 0;
      this.target = null;
      this.hit = hit;
      this.loop = game.sfx.loop('chainsaw');
      return true;
    },
    fixed(dt) {
      if (!this.mesh || !game.pointer) return;
      const hit = game.pick(game.pointer);
      this.hit = hit;
      if (!hit?.entity?.body.isDynamic()) {
        this.t = 0;
        return;
      }
      const e = hit.entity;
      if (e !== this.target) {
        this.target = e;
        this.t = 0;
      }
      this.t += dt;
      e.body.applyImpulse(hit.normal.clone().multiplyScalar(-Math.min(e.body.mass(), 6) * 0.6), true);
      if (Math.random() < 0.6) game.fx.sparks(hit.point, { count: 2, speed: 3, dir: hit.normal });
      if (e.kind === 'part') {
        if (Math.random() < 0.5) game.fx.burst(hit.point, { count: 3, colors: game.mannequin.skin.chips, speed: 2.5, size: 0.018, life: 0.7, dir: hit.normal, spread: 1 });
        if (Math.random() < 0.35) game.gore?.burst(hit.point, { count: 3, speed: 2.5, dir: hit.normal, spread: 1, size: 0.018 });
        if (this.t > 0.22) {
          this.t = 0;
          if (game.mannequin.severNearest(e, hit.point)) game.sfx.slice();
          else game.mannequin.damage(e, 0.2, hit.point);
        }
      }
    },
    update() {
      if (!this.mesh || !this.hit) return;
      const j = Math.sin(performance.now() * 0.09) * 0.012;
      this.mesh.position.copy(this.hit.point).addScaledVector(this.hit.normal, 0.05 + j).addScaledVector(camRightTrue(game), -0.2);
      this.mesh.quaternion.copy(game.camera.quaternion);
    },
    up() {
      if (this.mesh) game.scene.remove(this.mesh);
      this.mesh = null;
      this.loop?.stop();
    },
  };

  const shuriken = {
    id: 'shuriken',
    cat: 'blades',
    name: 'Shuriken',
    icon: '✴️',
    hint: 'Throw spinning stars. They slice through the nearest joint and stick.',
    down(p, hit) {
      const pos = muzzle(game);
      const dir = aimPoint(p, hit, 20).sub(pos).normalize();
      sticky(game, {
        pos,
        dir,
        speed: 30,
        meshObj: shurikenMesh(),
        half: [0.07, 0.006, 0.07],
        tipZ: 0.06,
        mass: 0.15,
        gravityScale: 0.25,
        align: false,
        spin: new THREE.Vector3(0, 40, 0).applyQuaternion(quatFromDir(dir, Z)),
        onHit: (other, tip) => {
          game.sfx.slice();
          game.fx.sparks(tip, { count: 6, speed: 2 });
          if (other.kind === 'part') {
            if (!game.mannequin.severNearest(other, tip, 0.3)) game.mannequin.damage(other, 0.45, tip);
            game.gore?.burst(tip, { count: 8, speed: 2 });
          }
        },
      });
      game.sfx.whoosh();
      return true;
    },
  };
  return [chainsaw, shuriken];
}

/* ================================================================== */
/* Guns                                                                */
/* ================================================================== */

function nailMesh() {
  const g = new THREE.Group();
  const shaft = mesh(geo('nailShaft', () => new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5).rotateX(Math.PI / 2)), steel());
  const head = mesh(geo('nailHead', () => new THREE.CylinderGeometry(0.012, 0.012, 0.004, 8).rotateX(Math.PI / 2)), steel());
  head.position.z = -0.06;
  g.add(shaft, head);
  return g;
}

function harpoonMesh() {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 5).rotateX(Math.PI / 2), mat(0x8a8f96, { metalness: 0.8 }));
  const tip = mesh(new THREE.ConeGeometry(0.03, 0.12, 5).rotateX(Math.PI / 2), steel());
  tip.position.z = 0.4;
  for (const s of [-1, 1]) {
    const barb = mesh(new THREE.BoxGeometry(0.06, 0.008, 0.008), steel());
    barb.position.set(s * 0.025, 0, 0.32);
    barb.rotation.y = s * 0.6;
    g.add(barb);
  }
  g.add(shaft, tip);
  return g;
}

export function gunTools(game) {
  const shotgun = {
    id: 'shotgun',
    cat: 'ranged',
    name: 'Shotgun',
    icon: '🔫',
    hint: 'A spread of pellets that hit instantly. Big kick.',
    down(p, hit) {
      if (game.time < (this.ready || 0)) return true;
      this.ready = game.time + 0.55;
      const from = muzzle(game);
      const aim = aimPoint(p, hit, 25).sub(from).normalize();
      for (let i = 0; i < 9; i++) {
        const d = aim.clone();
        d.x += (Math.random() - 0.5) * 0.12;
        d.y += (Math.random() - 0.5) * 0.12;
        d.z += (Math.random() - 0.5) * 0.12;
        d.normalize();
        const h = game.physics.raycast(from, d, 60);
        const end = h ? h.point : from.clone().addScaledVector(d, 40);
        game.fx.line([from.clone().addScaledVector(d, 0.4), end], { color: 0xffe2a0, dur: 0.09, opacity: 0.8 });
        if (!h) continue;
        const e = h.entity;
        if (e?.body.isDynamic()) {
          e.body.applyImpulseAtPoint(d.clone().multiplyScalar(Math.min(e.body.mass() * 2.2, 7)), h.point, true);
          if (e.kind === 'part') {
            game.mannequin.damage(e, 0.13, h.point);
            game.gore?.burst(h.point, { count: 5, speed: 2.5, dir: h.normal, spread: 1, size: 0.02 });
            game.fx.burst(h.point, { count: 3, colors: game.mannequin.skin.chips, speed: 2, size: 0.018 });
          } else game.fx.sparks(h.point, { count: 3, speed: 2, dir: h.normal });
        } else {
          game.fx.sparks(h.point, { count: 2, speed: 2, dir: h.normal });
          game.fx.smoke(h.point, { count: 1, size: 0.04, color: 0xbbbbbb, life: 0.6, speed: 0.2, up: 0.3 });
        }
      }
      game.fx.flash(from.clone().addScaledVector(aim, 0.5), 0.25, 0.08, 0xffd27a);
      game.sfx.shotgun();
      game.fx.shake(0.09);
      game.music?.bump(0.05);
      return true;
    },
  };

  const nailgun = {
    id: 'nailgun',
    cat: 'ranged',
    name: 'Nail Gun',
    icon: '📌',
    hint: 'Hold to fire nails. Pieces near a wall get nailed to it.',
    down() {
      this.on = true;
      this.next = 0;
      return true;
    },
    fixed() {
      if (!this.on || game.time < this.next || !game.pointer) return;
      this.next = game.time + 0.1;
      const p = game.pointer;
      const pos = muzzle(game);
      const dir = aimPoint(p, game.pick(p), 20).sub(pos).normalize();
      sticky(game, {
        pos,
        dir,
        speed: 45,
        meshObj: nailMesh(),
        half: [0.005, 0.005, 0.06],
        tipZ: 0.055,
        mass: 0.05,
        gravityScale: 0.3,
        lifetime: 25,
        onHit: (other, tip, nail) => {
          game.sfx.knock();
          if (other.kind !== 'part') return;
          game.mannequin.damage(other, 0.1, tip);
          game.gore?.burst(tip, { count: 3, speed: 1.5, size: 0.015 });
          // Through the piece and into a wall right behind it: pin it there.
          const d = nail.body.linvel();
          _w.set(d.x, d.y, d.z);
          if (_w.lengthSq() < 1) _w.copy(dir);
          _w.normalize();
          const wall = game.physics.raycast(tip, _w, 0.35, (o) => o.kind === 'static');
          if (wall) game.joints.fixedNow(wall.entity, nail, tip, { kind: 'attach', breakDist: 0.3, strength: 0.6 });
        },
      });
      game.sfx.pop();
    },
    up() {
      this.on = false;
    },
  };

  const harpoon = {
    id: 'harpoon',
    cat: 'ranged',
    name: 'Harpoon',
    icon: '🔱',
    hint: 'Spear a piece and reel it in. Attached limbs can get yanked right off.',
    down(p, hit) {
      if (!hit?.entity?.body.isDynamic()) return true;
      makeHarpoon(game, hit);
      return true;
    },
  };
  return [shotgun, nailgun, harpoon];
}

/** A harpoon sticks into the target and a rope reels it toward the camera. */
function makeHarpoon(game, hit) {
  const g = gadget(game, { lifetime: 2.2 });
  const e = hit.entity;
  const local = toLocal(e.body, hit.point);
  const spear = harpoonMesh();
  g.show(spear);
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xd8c9a8 }));
  g.show(rope);
  game.sfx.twang();
  game.sfx.whoosh();
  if (e.kind === 'part') {
    game.mannequin.damage(e, 0.25, hit.point);
    game.gore?.burst(hit.point, { count: 10, speed: 2.5, dir: hit.normal, spread: 1 });
  }
  const dir0 = hit.point.clone().sub(game.camera.position).normalize();
  g.fixed = () => {
    if (g.expired() || !e.alive) return g.dispose();
    const pw = toWorld(e.body, local, _v);
    const target = _w.copy(game.camera.position).addScaledVector(camDir(game), 1.6);
    target.y = Math.max(target.y, 0.4);
    const d = target.sub(pw);
    if (d.length() < 0.5) return g.dispose();
    d.multiplyScalar(7);
    if (d.length() > 20) d.setLength(20);
    const lv = e.body.linvel();
    const m = e.body.mass();
    e.body.applyImpulseAtPoint({ x: (d.x - lv.x) * m * 0.4, y: (d.y - lv.y) * m * 0.4, z: (d.z - lv.z) * m * 0.4 }, pw, true);
  };
  g.update = () => {
    if (!e.alive) return;
    const pw = toWorld(e.body, local, _v);
    spear.position.copy(pw);
    spear.quaternion.copy(quatFromDir(dir0, Z));
    const a = muzzle(game, _w);
    const pos = ropeGeo.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, pw.x - dir0.x * 0.35, pw.y - dir0.y * 0.35, pw.z - dir0.z * 0.35);
    pos.needsUpdate = true;
  };
  g.onDispose = () => {
    ropeGeo.dispose();
    rope.material.dispose();
  };
  return game.addGadget(g);
}

/* ================================================================== */
/* Explosives                                                          */
/* ================================================================== */

function grenadeMesh() {
  const g = new THREE.Group();
  const body = mesh(new THREE.IcosahedronGeometry(0.07, 1), mat(0x3f5a2a, { roughness: 0.7 }));
  body.scale.set(1, 1.25, 1);
  const top = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 6), mat(0x888888, { metalness: 0.8 }));
  top.position.y = 0.095;
  const lever = mesh(new THREE.BoxGeometry(0.015, 0.1, 0.02), mat(0x888888, { metalness: 0.8 }));
  lever.position.set(0.05, 0.05, 0);
  lever.rotation.z = -0.25;
  const light = mesh(new THREE.SphereGeometry(0.015, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  light.position.set(0, 0.115, 0);
  light.userData.blink = true;
  g.add(body, top, lever, light);
  return g;
}

function nukeMesh() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.6, 3, 10), mat(0x4a5a3a, { roughness: 0.6, metalness: 0.3 }));
  const band = mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.1, 12), mat(0xf2c12e));
  band.position.y = 0.1;
  g.add(body, band);
  for (let i = 0; i < 4; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.02, 0.28, 0.22), mat(0x333a2a));
    fin.position.y = 0.45;
    fin.rotation.y = (i * Math.PI) / 2;
    fin.translateZ(0.2);
    g.add(fin);
  }
  return g;
}

export function bigBoomTools(game) {
  const grenade = {
    id: 'grenade',
    cat: 'explosives',
    name: 'Grenade',
    icon: '🍍',
    hint: 'Lob it where you click. It bounces around, then goes off.',
    down(p, hit) {
      const pos = muzzle(game);
      const target = aimPoint(p, hit, 10);
      const dist = target.distanceTo(pos);
      const t = THREE.MathUtils.clamp(dist / 9, 0.45, 1.3);
      const gy = game.physics.gravityY;
      const v = target.clone().sub(pos).divideScalar(t);
      v.y -= 0.5 * gy * t;
      const e = game.spawnProp({
        shape: 'ball',
        r: 0.07,
        meshObj: grenadeMesh(),
        mass: 0.6,
        pos,
        vel: v,
        angvel: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        restitution: 0.45,
        friction: 0.8,
        lifetime: 6,
        ccd: true,
        data: { threat: 'bomb' },
      });
      e.disposeMesh = true;
      let light = null;
      e.mesh.traverse((o) => {
        if (o.userData.blink) light = o;
      });
      e.update = () => {
        const left = 2.3 - (game.time - e.born);
        if (light) light.visible = Math.sin(game.time * (left < 0.8 ? 40 : 14)) > 0;
      };
      e.fixed = () => {
        if (game.time - e.born < 2.3) return;
        const at = toWorld(e.body, { x: 0, y: 0, z: 0 });
        game.removeProp(e);
        game.explode(at, 2.8, 13, 2.2);
      };
      game.sfx.whoosh();
      return true;
    },
  };

  const nuke = {
    id: 'nuke',
    cat: 'explosives',
    name: 'Mini Nuke',
    icon: '☢️',
    hint: 'Calls in a very small, very big bomb. Stand back.',
    down(p, hit) {
      const at = placePoint(game, p, hit);
      const e = game.spawnProp({
        shape: 'capsule',
        half: 0.3,
        r: 0.22,
        meshObj: nukeMesh(),
        mass: 60,
        pos: new THREE.Vector3(at.x, 9, at.z),
        vel: new THREE.Vector3(0, -6, 0),
        lifetime: 8,
        ccd: true,
        events: RAPIER.ActiveEvents.COLLISION_EVENTS,
        data: { threat: 'bomb' },
      });
      e.disposeMesh = true;
      const go = () => {
        if (!e.alive) return;
        const c = toWorld(e.body, { x: 0, y: 0, z: 0 });
        game.removeProp(e);
        detonateNuke(game, c);
      };
      e.onCollide = () => game.later(0, go);
      e.fixed = () => {
        if (game.time - e.born > 4) go();
      };
      game.sfx.whistle();
      return true;
    },
  };
  return [grenade, nuke];
}

function detonateNuke(game, c) {
  game.explode(c, 7, 26, 4);
  game.fx.flash(c, 7, 1.2, 0xfff6e0);
  game.fx.shake(0.6);
  game.sfx.boom(3);
  game.sfx.thunder();
  game.ui?.whiteout?.();
  game.music?.bump(1);
  // Mushroom cloud: a rising stem, then a rolling cap.
  const g = gadget(game, { lifetime: 3.2 });
  g.fixed = () => {
    const t = game.time - g.born;
    if (g.expired()) return g.dispose();
    const colors = [0xc9b8a4, 0xe2d2bf, 0xffb070, 0xa8978a];
    for (let i = 0; i < 2; i++) {
      const y = Math.min(4.5, t * 3.5) * Math.random();
      game.fx.puffs.spawn(_v.set(c.x + (Math.random() - 0.5) * 0.4, y, c.z + (Math.random() - 0.5) * 0.4), _w.set(0, 2 + Math.random() * 2, 0), {
        color: colors[(Math.random() * 4) | 0],
        life: 2.2,
        size: 0.18,
        grow: 1.6,
        gravity: 0,
        drag: 0.8,
      });
    }
    if (t > 0.4) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.8 + Math.random() * 1.6;
        game.fx.puffs.spawn(_v.set(c.x + Math.cos(a) * r * 0.4, 4.2 + Math.random() * 0.8, c.z + Math.sin(a) * r * 0.4), _w.set(Math.cos(a) * r, 0.4, Math.sin(a) * r), {
          color: colors[(Math.random() * 4) | 0],
          life: 2.4,
          size: 0.35,
          grow: 2.2,
          gravity: 0,
          drag: 1.2,
        });
      }
    }
  };
  game.addGadget(g);
}

/* ================================================================== */
/* Chaos                                                               */
/* ================================================================== */

const ICE = () => mat(0xbfe8ff, { roughness: 0.08, metalness: 0.15, emissive: 0x3a7fae, emissiveIntensity: 0.35 });
const CHAR = () => mat(0x1d1a18, { roughness: 1 });

function bolt(from, to, jitter) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const p = from.clone().lerp(to, i / n);
    if (i > 0 && i < n) {
      p.x += (Math.random() - 0.5) * jitter;
      p.y += (Math.random() - 0.5) * jitter * 0.4;
      p.z += (Math.random() - 0.5) * jitter;
    }
    pts.push(p);
  }
  return pts;
}

export function scienceTools(game) {
  const lightning = {
    id: 'lightning',
    cat: 'chaos',
    name: 'Lightning',
    icon: '⚡',
    hint: 'Call down a lightning bolt. It arcs between body parts and chars them.',
    down(p, hit) {
      const at = hit ? hit.point.clone() : placePoint(game, p, hit);
      const sky = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 14, (Math.random() - 0.5) * 3));
      game.fx.line(bolt(sky, at, 1.2), { color: 0xd8f0ff, dur: 0.35 });
      game.fx.line(bolt(sky, at, 0.8), { color: 0x7fc4ff, dur: 0.25 });
      game.fx.flash(at, 1.4, 0.35, 0x9fd0ff);
      game.fx.sparks(at, { count: 25, color: 0x9fd0ff, speed: 4 });
      game.fx.shake(0.15);
      game.sfx.thunder();
      game.sfx.zap();
      // Arc through the nearest body parts.
      const parts = game.mannequin.parts
        .filter((e) => e.alive)
        .map((e) => ({ e, d: bodyPos(e.body).distanceTo(at) }))
        .filter((x) => x.d < 1.4)
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);
      let prev = at;
      for (const { e } of parts) {
        const pos = bodyPos(e.body);
        game.fx.line(bolt(prev, pos, 0.25), { color: 0xd8f0ff, dur: 0.3 });
        prev = pos;
        game.mannequin.damage(e, 0.4, pos);
        e.body.applyImpulse({ x: (Math.random() - 0.5) * e.body.mass() * 3, y: e.body.mass() * 4, z: (Math.random() - 0.5) * e.body.mass() * 3 }, true);
        if (!e.frozen) game.mannequin.tint(e, CHAR(), 4);
        game.fx.smoke(pos, { count: 2, size: 0.05, color: 0x444444 });
      }
      if (parts.length) {
        if (game.life) game.life.dizzy = Math.max(game.life.dizzy, 2.5);
        game.progress?.ev('lightning', { pos: at });
      }
      return true;
    },
  };

  const freeze = {
    id: 'freeze',
    cat: 'chaos',
    name: 'Freeze Ray',
    icon: '🧊',
    hint: 'Hold on the mannequin to freeze it solid. Frozen pieces shatter at triple damage.',
    down(p, hit) {
      this.on = true;
      this.charge = 0;
      this.beam = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
      );
      game.scene.add(this.beam);
      this.hit = hit;
      return true;
    },
    fixed(dt) {
      if (!this.on || !game.pointer) return;
      const hit = game.pick(game.pointer);
      this.hit = hit;
      if (!hit) return;
      if (Math.random() < 0.7) {
        game.fx.burst(hit.point, { count: 2, colors: [0xffffff, 0xbfe8ff], speed: 1.2, size: 0.02, life: 0.6, glow: true });
      }
      if (hit.entity?.kind !== 'part') return;
      this.charge += dt;
      if (this.charge > 0.5) {
        this.charge = 0;
        const set = game.mannequin.graph(hit.entity).set;
        game.mannequin.freeze(set, 7);
        game.sfx.freeze();
      }
    },
    update() {
      if (!this.beam) return;
      const a = muzzle(game, _v);
      const b = this.hit ? this.hit.point : a.clone().addScaledVector(camDir(game), 8);
      const pos = this.beam.geometry.attributes.position;
      pos.setXYZ(0, a.x, a.y, a.z);
      pos.setXYZ(1, b.x, b.y, b.z);
      pos.needsUpdate = true;
      this.beam.material.opacity = 0.6 + Math.random() * 0.4;
    },
    up() {
      this.on = false;
      if (this.beam) {
        game.scene.remove(this.beam);
        this.beam.geometry.dispose();
        this.beam.material.dispose();
      }
      this.beam = null;
    },
  };

  const balloons = {
    id: 'balloons',
    cat: 'chaos',
    name: 'Balloons',
    icon: '🎈',
    hint: 'Tie a bunch of balloons to anything. More bunches, more lift.',
    down(p, hit) {
      if (!hit?.entity?.body.isDynamic()) return !!hit;
      makeBalloons(game, hit);
      game.sfx.squeak();
      return true;
    },
  };
  return [lightning, freeze, balloons];
}

const BALLOON_COLORS = [0xff4d6d, 0x4dabff, 0xffd23f, 0x7ed957, 0xc77dff];

function makeBalloons(game, hit) {
  const g = gadget(game, { lifetime: 15 });
  const e = hit.entity;
  const local = toLocal(e.body, hit.point);
  const n = 3;
  const items = [];
  for (let i = 0; i < n; i++) {
    const color = BALLOON_COLORS[(Math.random() * BALLOON_COLORS.length) | 0];
    const b = new THREE.Group();
    const skin = mesh(geo('balloon', () => new THREE.IcosahedronGeometry(0.17, 1).scale(1, 1.18, 1)), mat(color, { roughness: 0.25 }));
    const knot = mesh(geo('balloonKnot', () => new THREE.ConeGeometry(0.03, 0.05, 5)), mat(color));
    knot.position.y = -0.21;
    b.add(skin, knot);
    g.show(b);
    const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xeeeeee }));
    g.show(string);
    const off = new THREE.Vector3(Math.cos((i / n) * Math.PI * 2) * 0.22, 1.1 + i * 0.12, Math.sin((i / n) * Math.PI * 2) * 0.22);
    b.position.copy(hit.point).add(off);
    items.push({ b, sg, off, phase: Math.random() * 6 });
  }
  let flagged = false;
  g.fixed = (dt) => {
    if (!e.alive) return g.dispose();
    if (g.expired()) return g.dispose();
    const pw = toWorld(e.body, local, _v);
    const lv = e.body.linvel();
    // Buoyancy: enough to carry a loose limb away, or (with a few bunches) the whole mannequin.
    if (lv.y < 2.2) {
      const lift = n * 230 * dt;
      e.body.applyImpulseAtPoint({ x: -lv.x * 0.02 * e.body.mass(), y: lift, z: -lv.z * 0.02 * e.body.mass() }, pw, true);
    }
    if (!flagged && e.kind === 'part' && pw.y > 6) {
      flagged = true;
      game.progress?.ev('balloon_high', { pos: pw.clone() });
    }
  };
  g.update = (dt) => {
    if (!e.alive) return;
    const pw = toWorld(e.body, local, _v);
    const t = performance.now() / 1000;
    for (const it of items) {
      const target = _w.copy(pw).add(it.off);
      target.x += Math.sin(t * 1.3 + it.phase) * 0.08;
      target.z += Math.cos(t * 1.1 + it.phase) * 0.08;
      it.b.position.lerp(target, Math.min(1, dt * 4));
      it.b.rotation.z = Math.sin(t + it.phase) * 0.1;
      const pos = it.sg.attributes.position;
      pos.setXYZ(0, pw.x, pw.y, pw.z);
      pos.setXYZ(1, it.b.position.x, it.b.position.y - 0.22, it.b.position.z);
      pos.needsUpdate = true;
    }
  };
  g.onDispose = () => {
    for (const it of items) {
      game.fx.burst(it.b.position, { count: 8, colors: [0xffffff], speed: 2, size: 0.02, life: 0.5, gravity: 0.3 });
      it.sg.dispose();
    }
    game.sfx.pop();
  };
  return game.addGadget(g);
}

export { ICE };
