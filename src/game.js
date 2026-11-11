import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Physics, RAPIER, bodyPos } from './physics.js';
import { Joints } from './joints.js';
import { Mannequin } from './mannequin.js';
import { Life } from './life.js';
import { Gore } from './gore.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { createTools } from './tools/index.js';
import { ROOMS } from './rooms.js';
import { mat, mesh, geo } from './materials.js';

const STEP = 1 / 60;
// Physical key -> [screen right, screen up, depth (into the screen)].
const CAM_KEYS = {
  KeyW: [0, 1, 0],
  KeyS: [0, -1, 0],
  KeyA: [-1, 0, 0],
  KeyD: [1, 0, 0],
  KeyE: [0, 0, 1],
  KeyQ: [0, 0, -1],
};
const MAX_PROPS = 80;
const MAX_GADGETS = 8;

export class Game {
  constructor(container) {
    this.container = container;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.stats = { severed: 0, attached: 0, booms: 0 };

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 300);
    this.camera.position.set(0.55, 1.45, 3.7);

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.target.set(0, 0.88, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 1.0;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.screenSpacePanning = true;
    this.controls = controls;

    this.hemi = new THREE.HemisphereLight(0xfff4e6, 0x4a4250, 1.1);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 9, 5);
    sun.castShadow = true;
    const sm = this.isTouch ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 8;
    sc.bottom = -8;
    sc.near = 1;
    sc.far = 30;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.sun = sun;

    this.physics = new Physics(this.scene);
    this.joints = new Joints(this);
    this.fx = new Fx(this);
    this.sfx = new Sfx();
    this.props = [];
    this.gadgets = [];
    this.timers = [];
    this.time = 0;
    this.timeScale = 1;
    this.acc = 0;
    this.physics.removeHooks.push((e) => this.joints.removeForEntity(e));

    this.mannequin = new Mannequin(this);
    this.life = new Life(this);
    this.gore = new Gore(this);
    this.tools = createTools(this);
    this.tool = this.tools[0];
    this.activeTool = null;
    this.activePointer = null;
    this.pointer = null;

    this.raycaster = new THREE.Raycaster();
    this.setupInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.setRoom('studio');
    this.mannequin.build();
  }

  /* ---------------------------------------------------------------- */
  /* Rooms, tools, resets                                             */
  /* ---------------------------------------------------------------- */

  setRoom(id) {
    if (this.room) this.room.dispose();
    this.clearProps();
    const def = ROOMS[id];
    this.roomId = id;
    this.room = def.build(this);
    this.physics.setGravity(def.gravity ?? -9.81);
    this.scene.background = new THREE.Color(def.sky);
    this.scene.fog = def.fog ? new THREE.Fog(def.sky, def.fog[0], def.fog[1]) : null;
    this.hemi.color.set(def.hemi?.[0] ?? 0xfff4e6);
    this.hemi.groundColor.set(def.hemi?.[1] ?? 0x4a4250);
    this.sun.intensity = def.sun ?? 2.2;
    if (this.mannequin.parts.length) this.mannequin.reset();
    this.life?.onRoom(id);
    this.progress?.ev('room', { id });
    this.ui?.update();
  }

  setTool(tool) {
    if (this.activeTool) this.endGesture(null, true);
    this.tool.deselect?.();
    this.tool = tool;
    tool.select?.();
    this.ui?.update();
  }

  toolById(id) {
    return this.tools.find((t) => t.id === id);
  }

  resetMannequin() {
    if (this.activeTool) this.endGesture(null, true);
    this.mannequin.reset();
    this.sfx.whoosh();
    if (this.mannequin.name) this.ui?.flashWord(`${this.mannequin.name} is back`, true);
  }

  clearProps() {
    if (this.activeTool) this.endGesture(null, true);
    for (const p of [...this.props]) this.physics.remove(p);
    this.props = [];
    for (const g of [...this.gadgets]) g.dispose();
    this.gadgets = [];
    this.gore?.clearDecals();
  }

  /* ---------------------------------------------------------------- */
  /* Spawning helpers                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Spawn a dynamic prop.
   * shape: ball(r) | box(half[]) | cylinder(half, r) | capsule(half, r)
   */
  spawnProp({
    shape = 'ball',
    r = 0.1,
    half = 0.1,
    size = [0.1, 0.1, 0.1],
    mass = 1,
    pos,
    quat = null,
    vel = null,
    angvel = null,
    color = 0x888888,
    material = null,
    meshObj = null,
    restitution = 0.2,
    friction = 0.6,
    lifetime = 20,
    ccd = false,
    events = 0,
    colliders = null,
    data = {},
    gravityScale = 1,
    linearDamping = 0.02,
    angularDamping = 0.2,
  }) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setCcdEnabled(ccd)
      .setGravityScale(gravityScale)
      .setLinearDamping(linearDamping)
      .setAngularDamping(angularDamping);
    if (quat) bd.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    if (vel) bd.setLinvel(vel.x, vel.y, vel.z);
    if (angvel) bd.setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z });
    let cds = colliders;
    let m = meshObj;
    const material_ = material || mat(color);
    if (!cds) {
      let cd;
      if (shape === 'ball') {
        cd = RAPIER.ColliderDesc.ball(r);
        m = m || mesh(geo(`pball${r}`, () => new THREE.IcosahedronGeometry(r, 1)), material_);
      } else if (shape === 'box') {
        cd = RAPIER.ColliderDesc.cuboid(...size);
        m = m || mesh(geo(`pbox${size.join('_')}`, () => new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2)), material_);
      } else if (shape === 'cylinder') {
        cd = RAPIER.ColliderDesc.cylinder(half, r);
        m = m || mesh(geo(`pcyl${half}_${r}`, () => new THREE.CylinderGeometry(r, r, half * 2, 8)), material_);
      } else if (shape === 'capsule') {
        cd = RAPIER.ColliderDesc.capsule(half, r);
        m = m || mesh(geo(`pcap${half}_${r}`, () => new THREE.CapsuleGeometry(r, half * 2, 2, 8)), material_);
      }
      cds = [cd];
    }
    cds.forEach((cd, i) => {
      if (i === 0) cd.setMass(mass);
      else cd.setDensity(0);
      cd.setRestitution(restitution).setFriction(friction);
      if (events) cd.setActiveEvents(events);
    });
    const e = this.physics.create({ body: bd, colliders: cds, mesh: m, kind: 'prop', data: { born: this.time, lifetime, ...data } });
    this.props.push(e);
    if (this.props.length > MAX_PROPS) {
      const old = this.props.find((p) => p !== this.grabbedEntity);
      this.removeProp(old);
    }
    return e;
  }

  removeProp(e) {
    if (!e) return;
    e.onRemove?.();
    const i = this.props.indexOf(e);
    if (i >= 0) this.props.splice(i, 1);
    this.physics.remove(e);
  }

  /** Gadgets are placed machines/hazards with fixed(dt), update(dt), dispose(). */
  addGadget(g) {
    if (g.room) return g; // room hazards are driven by the room itself
    this.gadgets.push(g);
    const own = this.gadgets.filter((x) => !x.room);
    if (own.length > MAX_GADGETS) own[0].dispose();
    return g;
  }

  removeGadget(g) {
    const i = this.gadgets.indexOf(g);
    if (i >= 0) this.gadgets.splice(i, 1);
  }

  /** Run fn after `delay` seconds of game time. */
  later(delay, fn) {
    this.timers.push({ at: this.time + delay, fn });
  }

  /** Radial blast: shoves every dynamic body and damages nearby mannequin joints. */
  explode(point, radius, power, damage = 0, { sound = true, fx = true } = {}) {
    const p = new THREE.Vector3(point.x, point.y, point.z);
    const d = new THREE.Vector3();
    for (const e of [...this.physics.entities]) {
      const b = e.body;
      if (!b.isDynamic()) continue;
      bodyPos(b, d).sub(p);
      const dist = d.length();
      if (dist > radius) continue;
      const f = 1 - dist / radius;
      if (dist < 1e-3) d.set(0, 1, 0);
      else d.divideScalar(dist);
      d.y += 0.4;
      d.normalize();
      const m = b.mass();
      const dv = power * f;
      b.applyImpulse({ x: d.x * dv * m, y: d.y * dv * m, z: d.z * dv * m }, true);
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * f, y: (Math.random() - 0.5) * m * f, z: (Math.random() - 0.5) * m * f }, true);
      if (damage && e.kind === 'part') this.mannequin.damage(e, damage * f, p);
      if (damage && e.kind === 'prop') for (const j of [...e.joints]) if (j.kind === 'glue' && f > 0.4) this.mannequin.sever(j);
    }
    if (fx) this.fx.explosion(p, radius);
    this.life?.onBoom(p, radius);
    this.progress?.ev('boom', { pos: p, radius });
    if (sound) this.sfx.boom(radius / 3);
    this.stats.booms++;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  setupInput() {
    const el = this.container;
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
    el.addEventListener(
      'wheel',
      (e) => {
        if (this.activeTool?.wheel) {
          this.activeTool.wheel(e.deltaY);
          e.preventDefault();
          e.stopPropagation();
        }
      },
      { capture: true, passive: false },
    );
    window.addEventListener('keydown', (e) => this.onKey(e));
    // Keyboard camera: WASD slides across the screen, Q/E move in/out (physical keys, so AZERTY works too).
    this.camKeys = new Set();
    window.addEventListener('keyup', (e) => {
      this.camKeys.delete(e.code);
      if (e.key === 'Shift') this.camFast = false;
    });
    window.addEventListener('blur', () => this.camKeys.clear());
    this.camVel = new THREE.Vector3();
  }

  makePointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return {
      id: e.pointerId,
      x,
      y,
      ndc,
      origin: this.raycaster.ray.origin.clone(),
      dir: this.raycaster.ray.direction.clone(),
      shift: e.shiftKey,
      time: this.time,
    };
  }

  /** Pointer at an arbitrary screen position (used by tools that sample along a swipe). */
  pointerAt(x, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return { x, y, ndc, origin: this.raycaster.ray.origin.clone(), dir: this.raycaster.ray.direction.clone() };
  }

  pick(p, predicate = null) {
    return this.physics.raycast(p.origin, p.dir, 200, predicate);
  }

  /** Where the pointer ray meets the floor (y = 0), or a point 8 m out. */
  floorPoint(p) {
    if (p.dir.y < -0.02) {
      const t = -p.origin.y / p.dir.y;
      if (t > 0 && t < 60) return p.origin.clone().addScaledVector(p.dir, t);
    }
    return p.origin.clone().addScaledVector(p.dir, 8);
  }

  onPointerDown(e) {
    this.sfx.unlock();
    if (e.target.closest && e.target.closest('.ui')) return;
    if (this.ui?.wardrobeOpen) return; // dressing up: drags just orbit the camera
    if (e.button !== 0 && e.pointerType === 'mouse') return; // right/middle = camera
    if (this.activePointer != null) return;
    const p = this.makePointer(e);
    this.pointer = p;
    const hit = this.pick(p);
    const tool = e.shiftKey ? this.toolById('hand') : this.tool;
    const consumed = tool.down?.(p, hit);
    if (consumed) {
      this.activeTool = tool;
      this.progress?.ev('tool', { id: tool.id });
      this.activePointer = e.pointerId;
      this.controls.enabled = false;
      e.preventDefault();
    }
  }

  onPointerMove(e) {
    const p = this.makePointer(e);
    this.pointer = p;
    if (this.activeTool && e.pointerId === this.activePointer) {
      this.activeTool.move?.(p);
    } else if (e.pointerType === 'mouse' && !this.activeTool) {
      this.hoverPending = true;
    }
  }

  onPointerUp(e, cancel = false) {
    if (e.pointerId !== this.activePointer) return;
    this.endGesture(this.makePointer(e), cancel);
  }

  endGesture(p, cancel) {
    const t = this.activeTool;
    this.activeTool = null;
    this.activePointer = null;
    this.controls.enabled = true;
    if (!t) return;
    if (cancel) t.cancel ? t.cancel() : t.up?.(p || this.pointer);
    else t.up?.(p);
    this.fx.drawers.clear(); // gesture overlays (slingshot band, bow charge) never outlive the gesture
  }

  updateHover() {
    if (!this.hoverPending || !this.pointer) return;
    this.hoverPending = false;
    const hit = this.pick(this.pointer);
    this.hoverHit = hit ? { point: hit.point, entity: hit.entity, time: this.time } : null;
    const canvas = this.renderer.domElement;
    let cursor = 'default';
    if (hit?.entity?.body.isDynamic()) cursor = this.tool.id === 'hand' ? 'grab' : 'crosshair';
    else if (hit) cursor = 'crosshair';
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }

  onKey(e) {
    if (e.target.tagName === 'INPUT') return;
    if (this.title?.active) {
      if (!['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'].includes(e.key)) this.title.play();
      return;
    }
    if (e.key === 'Shift') this.camFast = true;
    if (CAM_KEYS[e.code] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.camKeys.add(e.code);
      return;
    }
    const k = e.key.toLowerCase();
    if (this.activeTool?.key?.(k)) return;
    if (k === 'escape') this.setTool(this.toolById('hand'));
    else if (k === 'x') this.resetMannequin();
    else if (k === 'c') this.clearProps();
    else if (k === 't') this.toggleSlowmo();
    else if (k === 'h' || k === '?') this.ui?.toggleHelp();
  }

  /** WASD / QE camera movement, smoothed. Moves the orbit target with the camera. */
  moveCamera(dt) {
    const want = new THREE.Vector3();
    for (const code of this.camKeys) {
      const [x, y, z] = CAM_KEYS[code];
      want.x += x;
      want.y += y;
      want.z += z;
    }
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(this.camFast ? 7 : 2.8);
    this.camVel.lerp(want, Math.min(1, dt * 10));
    if (this.camVel.lengthSq() < 1e-6) return;
    const cam = this.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const move = right.multiplyScalar(this.camVel.x * dt).addScaledVector(up, this.camVel.y * dt).addScaledVector(fwd, this.camVel.z * dt);
    const t = this.controls.target;
    // Keep the camera and its target inside a sensible box above the floor.
    const nextCam = cam.position.clone().add(move);
    const nextT = t.clone().add(move);
    if (nextCam.y < 0.15 || nextT.y < 0.05) {
      const lift = Math.max(0.15 - nextCam.y, 0.05 - nextT.y);
      nextCam.y += lift;
      nextT.y += lift;
    }
    const lim = 30;
    if (Math.abs(nextT.x) > lim || Math.abs(nextT.z) > lim || nextT.y > 20) return;
    cam.position.copy(nextCam);
    t.copy(nextT);
  }

  toggleSlowmo() {
    this.timeScale = this.timeScale < 1 ? 1 : 0.3;
    this.ui?.update();
  }

  /* ---------------------------------------------------------------- */
  /* Loop                                                              */
  /* ---------------------------------------------------------------- */

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 70 : 55;
    this.camera.updateProjectionMatrix();
    this.fx.resize(w, h, Math.min(window.devicePixelRatio, 2));
  }

  handleEvents() {
    const forces = [];
    const hits = [];
    this.physics.queue.drainContactForceEvents((ev) => {
      forces.push([ev.collider1(), ev.collider2(), ev.totalForceMagnitude()]);
    });
    this.physics.queue.drainCollisionEvents((h1, h2, started) => {
      if (started) hits.push([h1, h2]);
    });
    for (const [h1, h2, f] of forces) {
      const e1 = this.physics.entityOf(h1);
      const e2 = this.physics.entityOf(h2);
      this.onImpact(e1, e2, f);
      this.onImpact(e2, e1, f);
    }
    for (const [h1, h2] of hits) {
      const e1 = this.physics.entityOf(h1);
      const e2 = this.physics.entityOf(h2);
      if (e1?.alive && e1.onCollide) e1.onCollide(e2);
      if (e2?.alive && e2.onCollide) e2.onCollide(e1);
    }
  }

  onImpact(e, other, f) {
    if (!e || e.kind !== 'part' || !e.alive) return;
    if (f > 1500) {
      this.sfx.knock();
      this.life?.onBump(e, f);
    }
    const T = 4000;
    if (f < T || !other) return;
    // Heavy hits break the joint closest to whatever hit us.
    this.mannequin.damage(e, (f - T) / 9000, bodyPos(other.body));
  }

  fixedStep(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.time) {
        const t = this.timers[i];
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    this.activeTool?.fixed?.(dt);
    if (this.tool !== this.activeTool) this.tool.idleFixed?.(dt);
    for (const g of [...this.gadgets]) g.fixed?.(dt);
    this.room?.fixed?.(dt);
    for (const p of [...this.props]) {
      p.fixed?.(dt);
      if (!p.alive) continue;
      const t = p.body.translation();
      if ((p.lifetime && this.time - p.born > p.lifetime && p !== this.grabbedEntity) || t.y < -30 || Math.abs(t.x) > 80 || Math.abs(t.z) > 80) {
        this.removeProp(p);
      }
    }
    this.life.fixed(dt);
    this.joints.fixed(dt);
    this.physics.step();
    this.handleEvents();
    this.mannequin.fixed(dt);
  }

  frame(dtReal) {
    const dt = Math.min(dtReal, 0.1);
    this.acc += dt * this.timeScale;
    let n = 0;
    while (this.acc >= STEP && n < 4) {
      this.fixedStep(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === 4) this.acc = 0;
    this.physics.sync();
    const vdt = dt * this.timeScale;
    for (const t of this.tools) t.always?.(vdt);
    this.tool.update?.(vdt);
    if (this.activeTool && this.activeTool !== this.tool) this.activeTool.update?.(vdt);
    for (const g of this.gadgets) g.update?.(vdt);
    this.room?.update?.(vdt);
    for (const p of this.props) p.update?.(vdt);
    this.fx.update(vdt);
    this.life.update(vdt);
    this.gore.update(vdt);
    this.music?.update(dt);
    this.progress?.update();
    this.updateHover();
    if (this.title && (this.title.active || this.title.swoop)) this.title.frame(dt);
    else {
      this.moveCamera(dt);
      this.controls.update();
    }
    this.fx.applyShake(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.fx.removeShake(this.camera);
    this.ui?.tick?.(dt);
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      // Schedule the next frame first, so a bug in one frame can never freeze the whole game.
      requestAnimationFrame(loop);
      try {
        this.frame(dt);
      } catch (err) {
        if (!this.loggedFrameError) console.error('Frame error (game keeps running):', err);
        this.loggedFrameError = true;
      }
    };
    requestAnimationFrame(loop);
  }
}
