import * as THREE from 'three';
import { bodyPos, bodyQuat } from './physics.js';

/*
 * The mannequin's "brain": it balances, walks around on its own, falls over
 * when hit hard and gets back up, crawls when its legs are gone, and is
 * afraid of you.
 *
 * Motor control is an active ragdoll:
 *  - balance: upright torque on pelvis and chest, plus a height spring and
 *    gravity compensation on the upper body (the legs swing freely),
 *  - steering: the pelvis/chest velocity is nudged toward a desired velocity,
 *  - gait and body language: offsets on the joint muscles' rest poses.
 *
 * Fear is behavioural rather than theatrical: a startle/freeze when a threat
 * appears, fleeing while glancing back, backing away (still facing you) when
 * you hover a weapon near it, cowering when cornered, and lingering anxiety
 * (keeps its distance, faster breathing, trembling) that fades slowly.
 */

const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

const STAND_H = 1.0; // pelvis height when standing
const WALK = 0.75;
const RUN = 2.6;

// Walkable area per room (square half-size or disc radius).
const ARENA = { space: { r: 5.2 }, default: { half: 5.6 } };

export class Life {
  constructor(game) {
    this.game = game;
    game.life = this;
    this.t = 0;
    this.steps = 0;
    this.offsets = new Map();
    this.eyes = { lid: 1, pupil: 1 };
    this.blinkIn = 2;
    this.blinking = 0;
    this.lookTarget = new THREE.Vector3(0, 1.5, 4);
    this.lookSmooth = new THREE.Vector3(0, 1.5, 4);
    this.reset();

    this.stars = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.025, 0), starMat);
      s.userData.a = (i / 4) * Math.PI * 2;
      this.stars.add(s);
    }
    this.stars.visible = false;
    game.scene.add(this.stars);
  }

  reset() {
    this.pain = 0;
    this.fear = 0; // acute, follows current threats
    this.anxiety = 0; // slow, builds up from being hurt
    this.dizzy = 0;
    this.flinch = 0;
    this.happy = 0;
    this.struggle = 0;
    this.freeze = 0;
    this.state = 'stand'; // stand | down | rising | carried | crawl | limp
    this.stateT = 0;
    this.downFor = 0;
    this.tilted = 0;
    this.mode = 'wander'; // wander | idle | flee | backoff | cower | freeze
    this.target = null;
    this.targetAt = 0;
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.threat = null;
    this.glance = null;
    this.glanceAt = 0;
    this.dart = 0;
    this.hopIn = 3;
    this.crawlT = 0;
    this.offsets.clear();
  }

  get head() {
    const h = this.game.mannequin.byName?.head;
    return h?.alive ? h : null;
  }

  /* ------------------------------ events ------------------------------ */

  onBuild() {
    this.reset();
    this.faceParts = null;
    this.heading = Math.atan2(this.game.camera.position.x, this.game.camera.position.z);
  }

  onRoom() {
    this.target = null;
  }

  onHurt(e, amount, point) {
    point = new THREE.Vector3(point.x, point.y, point.z);
    this.pain = Math.min(1.5, this.pain + amount * 1.3);
    this.anxiety = Math.min(1, this.anxiety + amount * 0.6);
    this.fear = Math.min(1, this.fear + amount * 0.8);
    this.flinch = Math.max(this.flinch, 0.25 + amount * 0.4);
    this.happy = 0;
    this.lastHit = { point: point.clone(), at: this.game.time };
    this.memory = { pos: point.clone(), until: this.game.time + 3 };
    const head = this.head;
    if (head) {
      const hp = bodyPos(head.body);
      this.lookAway = { pos: hp.clone().add(hp.clone().sub(point).setY(0).normalize().multiplyScalar(2)), until: this.game.time + 0.5 };
    }
    if (e.partName === 'head' && amount >= 0.3) this.dizzy = 3;
    if (amount >= 0.4 && this.state === 'stand') this.knockDown(1.2 + amount * 2);
  }

  onBump(e, force) {
    this.pain = Math.min(1.5, this.pain + Math.min(0.2, force / 20000));
    if (force > 2500) this.flinch = Math.max(this.flinch, 0.2);
    if (force > 9000 && this.state === 'stand') this.knockDown(1);
  }

  onSever() {
    this.pain = Math.min(1.5, this.pain + 0.5);
    this.anxiety = Math.min(1, this.anxiety + 0.3);
    this.flinch = 0.6;
    this.happy = 0;
  }

  onAttach() {
    this.happy = 2;
    this.pain *= 0.5;
    this.fear *= 0.5;
  }

  onBoom(point, radius) {
    const pel = this.game.mannequin.byName?.pelvis;
    if (!pel?.alive) return;
    const d = bodyPos(pel.body).distanceTo(point);
    if (d > radius * 3) return;
    this.startle(point, 0.6);
    this.anxiety = Math.min(1, this.anxiety + 0.25);
    if (d < radius && this.state === 'stand') this.knockDown(1.5);
  }

  knockDown(time) {
    this.state = 'down';
    this.stateT = 0;
    this.downFor = time + this.pain * 0.8 + Math.random() * 0.5;
  }

  /** Sudden fright: brief freeze, a little jump, then the fear kicks in. */
  startle(pos, strength = 0.5) {
    if (this.freeze <= 0 && this.state === 'stand') {
      this.freeze = 0.25 + Math.random() * 0.3;
      const m = this.game.mannequin.byName;
      for (const n of ['pelvis', 'chest']) {
        const b = m[n]?.body;
        if (b) {
          const v = b.linvel();
          b.setLinvel({ x: v.x, y: v.y + 1.4, z: v.z }, true);
        }
      }
    }
    this.fear = Math.min(1, this.fear + strength);
    this.threat = { kind: 'startle', pos: pos.clone(), urgency: strength };
  }

  /* --------------------------- per physics step --------------------------- */

  fixed(dt) {
    const game = this.game;
    const m = game.mannequin;
    if (!m.byName) return;
    this.t += dt;
    this.steps++;
    this.stateT += dt;
    this.pain = Math.max(0, this.pain - dt * 0.25);
    this.fear = Math.max(0, this.fear - dt * 0.35);
    this.anxiety = Math.max(0, this.anxiety - dt * 0.02);
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    this.happy = Math.max(0, this.happy - dt);
    this.freeze = Math.max(0, this.freeze - dt);

    const body = this.bodyInfo();
    this.body = body;
    this.updateState(dt, body);
    if (this.steps % 6 === 0) this.senseThreats(body);
    if (this.steps % 10 === 0) this.decide(body);
    this.updateLookTarget(body);
    this.motor(dt, body);
    this.drivePose(dt, body);
    this.hopLoosePieces(dt);
  }

  /** What the body is currently capable of. */
  bodyInfo() {
    const m = this.game.mannequin;
    const P = m.byName.pelvis;
    const C = m.byName.chest;
    const j = (n) => !!this.jointByName(n);
    const waist = j('waist') && P.alive && C.alive;
    const legL = j('hipL') && j('kneeL');
    const legR = j('hipR') && j('kneeR');
    const legs = (legL ? 1 : 0) + (legR ? 1 : 0);
    const main = C.alive ? m.graph(C).set : new Set();
    const g = this.game.grabbedEntity;
    const ragdoll = this.game.joints.K <= 0;
    // Limping: damaged leg joints slow it down.
    let limp = 0;
    for (const n of ['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']) {
      const jj = this.jointByName(n);
      if (jj) limp = Math.max(limp, jj.damage / jj.strength);
    }
    if (legs === 1) limp = Math.max(limp, 0.6);
    return { P, C, waist, legL, legR, legs, main, grabbed: !!g && main.has(g), ragdoll, limp, canStand: waist && legs > 0 && !ragdoll };
  }

  updateState(dt, b) {
    const { P, C } = b;
    if (b.ragdoll) {
      this.state = 'limp';
      return;
    }
    if (b.grabbed) {
      if (this.state !== 'carried') {
        this.state = 'carried';
        this.stateT = 0;
        this.fear = Math.min(1, this.fear + 0.4);
      }
      this.struggle += (1 - this.struggle) * Math.min(1, dt * 6);
      return;
    }
    this.struggle += (0 - this.struggle) * Math.min(1, dt * 6);
    if (this.state === 'carried') this.knockDown(0.5);
    if (!b.canStand) {
      this.state = 'crawl';
      return;
    }
    if (this.state === 'crawl' || this.state === 'limp') this.knockDown(0.6);

    if (this.state === 'stand') {
      // Fall detection: torso tipped over or pelvis too low.
      const up = _u.set(0, 1, 0).applyQuaternion(bodyQuat(C.body, _q));
      const low = P.body.translation().y < 0.5;
      if (up.y < 0.5 || low) this.tilted += dt;
      else this.tilted = 0;
      if (this.tilted > 0.3) this.knockDown(0.8 + Math.random());
    } else if (this.state === 'down') {
      if (this.stateT > this.downFor) {
        this.state = 'rising';
        this.stateT = 0;
      }
    } else if (this.state === 'rising') {
      if (this.stateT > 1.3) {
        this.state = 'stand';
        this.stateT = 0;
        this.tilted = 0;
      }
    }
  }

  /** Nearest real danger, a weapon hovering near it, or a recent attacker. */
  senseThreats(b) {
    const game = this.game;
    if (!b.C.alive) return;
    const core = bodyPos(b.C.body, _v).clone();
    let best = null;
    let bestU = 0;
    const consider = (kind, pos, urgency) => {
      if (urgency > bestU) {
        bestU = urgency;
        best = { kind, pos: pos.clone(), urgency };
      }
    };
    for (const e of game.physics.entities) {
      if (!e.threat || !e.body.isDynamic()) continue;
      const p = bodyPos(e.body);
      const d = p.distanceTo(core);
      if (d > 6) continue;
      const lv = e.body.linvel();
      const toward = -((p.x - core.x) * lv.x + (p.y - core.y) * lv.y + (p.z - core.z) * lv.z) / Math.max(d, 0.01);
      const lit = e.threat === 'dynamite' || e.threat === 'rocket' || e.threat === 'bomb';
      if (toward > 2.5) consider(e.threat, p, clamp(1.4 - d / 5, 0.3, 1));
      else if (lit && d < 3.5) consider(e.threat, p, clamp(1.2 - d / 4, 0.3, 1));
    }
    for (const gd of [...game.gadgets, ...(game.room?.gadgets || [])]) {
      if (!gd.threat || gd.dead) continue;
      const p = gd.threat.pos;
      const d = Math.hypot(p.x - core.x, p.z - core.z);
      if (d < 3) consider(gd.threat.kind, _w.set(p.x, Math.max(p.y, 0.5), p.z), clamp(1.2 - d / 3, 0.25, 1));
    }
    // The player's weapon: hovering a non-grab tool near the body is threatening,
    // more so the more it has been hurt.
    const hov = game.hoverHit;
    if (hov && game.time - hov.time < 0.8 && game.tool.cat !== 'hand') {
      const d = Math.hypot(hov.point.x - core.x, hov.point.z - core.z);
      if (d < 1.6) consider('cursor', hov.point, clamp((0.25 + this.anxiety * 0.6) * (1.3 - d / 1.6), 0, 0.7));
    }
    // Whoever just hit it.
    if (this.lastHit && game.time - this.lastHit.at < 2.5) consider('attacker', this.lastHit.point, 0.4 + this.anxiety * 0.3);

    if (best && best.urgency > 0.3) this.memory = { pos: best.pos.clone(), until: game.time + 3 };
    const prev = this.threat;
    if (best && (!prev || prev.kind !== best.kind) && best.urgency > 0.5 && best.kind !== 'cursor') this.startle(best.pos, 0.3);
    this.threat = best;
    if (best) this.fear = Math.max(this.fear, best.urgency * (best.kind === 'cursor' ? 0.5 : 1));
  }

  arenaClamp(p) {
    const a = this.game.roomId === 'space' ? ARENA.space : ARENA.default;
    if (a.r) {
      const d = Math.hypot(p.x, p.z);
      if (d > a.r) p.multiplyScalar(a.r / d);
    } else {
      p.x = clamp(p.x, -a.half, a.half);
      p.z = clamp(p.z, -a.half, a.half);
    }
    return p;
  }

  /** Pick what to do: wander, back off, flee, freeze or cower. */
  decide(b) {
    const game = this.game;
    const now = game.time;
    const pos = bodyPos(b.C.body).setY(0);
    // Remember where danger came from for a few seconds after it stops moving.
    const th = this.threat || (this.memory && now < this.memory.until && this.fear > 0.35 ? { kind: 'memory', pos: this.memory.pos, urgency: this.fear } : null);
    if (game.title?.active) {
      // Centre stage on the title screen: stand still, look at the camera.
      this.mode = 'idle';
      this.target = pos.clone();
      this.targetAt = now + 1;
      return;
    }
    if (this.freeze > 0) {
      this.mode = 'freeze';
      return;
    }
    if (th && th.kind === 'cursor' && this.fear < 0.45) {
      // Wary: step back from the weapon while keeping an eye on it.
      this.mode = 'backoff';
      const away = pos.clone().sub(_v.set(th.pos.x, 0, th.pos.z)).normalize();
      this.target = this.arenaClamp(pos.clone().addScaledVector(away, 1.5));
      return;
    }
    if (th && this.fear > 0.35) {
      // Run directly away; if a wall is in the way, try veering off; if boxed in, cower.
      const away = pos.clone().sub(_v.set(th.pos.x, 0, th.pos.z));
      if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      away.normalize();
      let best = null;
      for (const ang of [0, 0.7, -0.7, 1.3, -1.3]) {
        const dir = away.clone().applyAxisAngle(UP, ang);
        const want = pos.clone().addScaledVector(dir, 3.5);
        const got = this.arenaClamp(want.clone());
        const room = got.distanceTo(pos);
        if (room > 1.4) {
          best = got;
          break;
        }
      }
      if (best) {
        this.mode = 'flee';
        this.target = best;
      } else this.mode = 'cower';
      return;
    }
    if (this.fear > 0.6) {
      this.mode = 'cower';
      return;
    }
    // Calm-ish: wander between spots, pause and look around. Anxiety keeps it far from the camera.
    if (this.mode !== 'wander' && this.mode !== 'idle') this.target = null;
    if (!this.target || now > this.targetAt || pos.distanceTo(this.target) < 0.35) {
      if (this.mode === 'wander' && Math.random() < 0.45) {
        this.mode = 'idle';
        this.target = pos.clone();
        this.targetAt = now + 1.5 + Math.random() * 3;
      } else {
        this.mode = 'wander';
        const cam = game.camera.position;
        let t = null;
        for (let i = 0; i < 6; i++) {
          const c = this.arenaClamp(new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9));
          // Anxious: prefer spots far from the player.
          if (this.anxiety > 0.3 && Math.hypot(c.x - cam.x, c.z - cam.z) < 3 + this.anxiety * 3) continue;
          t = c;
          break;
        }
        this.target = t || this.arenaClamp(new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9));
        this.targetAt = now + 5 + Math.random() * 5;
      }
    }
  }

  /** Balance, steering and getting up. */
  motor(dt, b) {
    const { P, C } = b;
    if (!C.alive) return;
    const head = this.head;
    const pos = bodyPos(C.body, _v).setY(0);

    // Desired horizontal velocity from the current mode.
    let speed = 0;
    let faceDir = null;
    const dir = new THREE.Vector3();
    if (this.target && ['wander', 'flee', 'backoff'].includes(this.mode)) {
      dir.copy(this.target).sub(pos).setY(0);
      const dist = dir.length();
      if (dist > 0.2) {
        dir.divideScalar(dist);
        const base = this.mode === 'flee' ? RUN : this.mode === 'backoff' ? 0.9 : WALK * (1 - this.anxiety * 0.3);
        speed = base * Math.min(1, dist / 0.8) * (1 - b.limp * 0.55);
      }
    }
    if (this.dizzy > 0) {
      // Stagger.
      dir.x += Math.sin(this.t * 2.3) * 0.8;
      dir.z += Math.cos(this.t * 1.7) * 0.8;
      dir.normalize();
      speed = Math.max(speed, 0.4);
    }
    if (this.mode === 'freeze' || this.mode === 'cower' || this.mode === 'idle') speed = 0;
    if (this.mode === 'backoff' && this.threat) faceDir = _w.set(this.threat.pos.x - pos.x, 0, this.threat.pos.z - pos.z).normalize().clone();
    else if (this.mode === 'cower' && this.threat) faceDir = _w.set(pos.x - this.threat.pos.x, 0, pos.z - this.threat.pos.z).normalize().clone();
    else if (speed > 0.15) faceDir = dir.clone();
    else if (this.mode === 'idle' && head) faceDir = _w.set(this.lookTarget.x - pos.x, 0, this.lookTarget.z - pos.z).normalize().clone();
    if (faceDir && faceDir.lengthSq() > 0.5) {
      const want = Math.atan2(faceDir.x, faceDir.z);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * (this.mode === 'flee' ? 6 : 3));
    }
    this.speed += (speed - this.speed) * Math.min(1, dt * 4);

    if (this.state === 'crawl') return this.crawl(dt, b, dir, speed);
    if (this.state !== 'stand' && this.state !== 'rising') return;

    // Support strength ramps up while getting up.
    const s = this.state === 'rising' ? clamp(this.stateT / 0.9, 0, 1) : 1;
    const g = -this.game.physics.gravityY;
    const crouch = (this.mode === 'cower' ? 0.3 : 0) + (this.mode === 'freeze' ? 0.08 : 0) + (this.state === 'rising' ? 0.25 * (1 - s) : 0);
    const bob = this.speed > 0.1 ? Math.abs(Math.sin(this.phase)) * 0.03 * Math.min(1, this.speed) : 0;
    const H = STAND_H - crouch + bob - b.limp * 0.04;

    // Gravity compensation for the upper body (legs stay free to swing).
    for (const e of b.main) {
      if (e.kind !== 'part' || /^(thigh|shin|foot)/.test(e.partName)) continue;
      const v = e.body.linvel();
      e.body.setLinvel({ x: v.x, y: v.y + g * dt * s, z: v.z }, true);
    }
    // Height spring on the pelvis.
    const pt = P.body.translation();
    const pv = P.body.linvel();
    const vyT = clamp((H - pt.y) * 11, -2, 3);
    const k = 0.4 * s;
    for (const e of [P, C]) {
      const v = e.body.linvel();
      const vx = dir.x * this.speed;
      const vz = dir.z * this.speed;
      e.body.setLinvel(
        {
          x: v.x + (vx - v.x) * 0.12 * s,
          y: e === P ? pv.y + (vyT - pv.y) * k : v.y,
          z: v.z + (vz - v.z) * 0.12 * s,
        },
        true,
      );
    }
    // Upright + heading torque.
    this.upright(P.body, 1.0 * s, this.heading);
    this.upright(C.body, 0.8 * s, this.heading);

    // Gait phase.
    this.phase += dt * (this.speed * 6.5 + (this.speed > 0.05 ? 1.5 : 0));
  }

  /** Steer a body's angular velocity so it stands up straight facing `heading`. */
  upright(body, strength, heading) {
    if (strength <= 0) return;
    const q = bodyQuat(body, _q);
    const up = _u.set(0, 1, 0).applyQuaternion(q);
    // Tilt correction: rotate about (up x Y) = (-up.z, 0, up.x) to bring `up` back to vertical.
    let ax = -up.z;
    let az = up.x;
    const s = Math.hypot(ax, az);
    const ang = Math.atan2(s, up.y);
    if (s > 1e-5) {
      ax = (ax / s) * ang;
      az = (az / s) * ang;
    }
    // Yaw: forward (local +z) toward heading.
    const f = _w.set(0, 0, 1).applyQuaternion(q);
    let yawErr = heading - Math.atan2(f.x, f.z);
    yawErr = Math.atan2(Math.sin(yawErr), Math.cos(yawErr));
    const K = 14;
    const w = body.angvel();
    const bl = 0.3 * strength;
    body.setAngvel(
      {
        x: w.x + (ax * K - w.x) * bl,
        y: w.y + (yawErr * 6 - w.y) * bl,
        z: w.z + (az * K - w.z) * bl,
      },
      true,
    );
  }

  /** No legs (or cut in half): drag itself along with the arms. */
  crawl(dt, b, dir, speed) {
    this.crawlT -= dt;
    this.phase += dt * 5;
    if (this.crawlT > 0) return;
    this.crawlT = this.mode === 'flee' ? 0.45 : 0.8;
    if (speed <= 0.05 && this.mode !== 'flee') return;
    const hasArm = this.jointByName('shoulderL') || this.jointByName('shoulderR');
    const gs = Math.sqrt(Math.abs(this.game.physics.gravityY) / 9.81) || 0.4;
    const push = (hasArm ? 1.3 : 0.6) * gs * (this.mode === 'flee' ? 1.5 : 1);
    for (const e of b.main) {
      const v = e.body.linvel();
      e.body.setLinvel({ x: v.x + dir.x * push, y: v.y + 0.9 * gs, z: v.z + dir.z * push }, true);
    }
  }

  updateLookTarget(b) {
    const game = this.game;
    const now = game.time;
    if (this.lookAway && now < this.lookAway.until) {
      this.lookTarget.copy(this.lookAway.pos);
      return;
    }
    if (this.threat && (this.mode === 'flee' || this.mode === 'backoff' || this.mode === 'cower' || this.mode === 'freeze')) {
      // Darting eyes: mostly on the threat, quick checks of where it's going.
      this.dart -= 1 / 60;
      if (this.dart < -0.25) this.dart = 0.5 + Math.random() * 0.6;
      if (this.dart < 0 && this.target && this.mode === 'flee') this.lookTarget.copy(this.target).setY(1);
      else this.lookTarget.copy(this.threat.pos);
      return;
    }
    if (game.grabbedEntity && b.main.has(game.grabbedEntity)) {
      this.lookTarget.copy(game.camera.position);
      return;
    }
    if (game.title?.active) {
      // Staring into the camera, with the odd nervous glance to the side.
      if (now > this.glanceAt) {
        this.glance = Math.random() < 0.7 ? 'player' : new THREE.Vector3((Math.random() - 0.5) * 6, 1.4, 1 + Math.random());
        this.glanceAt = now + 1.2 + Math.random() * 2;
      }
      this.lookTarget.copy(this.glance === 'player' ? game.camera.position : this.glance);
      return;
    }
    if (now > this.glanceAt) {
      // Mostly look where it's going or around the room; anxious ones keep checking on you.
      const r = Math.random();
      if (r < 0.25 + this.anxiety * 0.5) this.glance = 'player';
      else if (r < 0.6 && this.target) this.glance = 'path';
      else this.glance = new THREE.Vector3((Math.random() - 0.5) * 8, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 8);
      this.glanceAt = now + (this.anxiety > 0.3 ? 0.6 + Math.random() : 1.5 + Math.random() * 3);
    }
    if (this.glance === 'player') this.lookTarget.copy(game.camera.position);
    else if (this.glance === 'path' && this.target) this.lookTarget.copy(this.target).setY(0.8);
    else if (this.glance instanceof THREE.Vector3) this.lookTarget.copy(this.glance);
  }

  drivePose(dt, b) {
    const T = new Map();
    const add = (name, x, y, z, w = 1) => {
      if (!w) return;
      let v = T.get(name);
      if (!v) T.set(name, (v = new THREE.Vector3()));
      v.x += x * w;
      v.y += y * w;
      v.z += z * w;
    };
    const sym = (base, x, y, z, w = 1) => {
      add(base + 'L', x, y, z, w);
      add(base + 'R', x, -y, -z, w);
    };
    const t = this.t;
    const arousal = Math.max(this.fear, this.anxiety * 0.7);
    this.breathRate = 1.6 + arousal * 4.5 + this.pain * 1.5 + (this.mode === 'flee' ? 2 : 0);
    this.breathPhase = (this.breathPhase || 0) + dt * this.breathRate;
    const breath = Math.sin(this.breathPhase);
    this.breath = breath * (1 + arousal * 0.8);

    // Idle: breathing, small weight shift, relaxed arms.
    sym('shoulder', 0, 0, 0.07 + 0.025 * breath);
    sym('elbow', -0.15, 0, 0);
    add('waist', 0.02 * Math.sin(t * 0.6), 0.03 * Math.sin(t * 0.31), 0.025 * Math.sin(t * 0.43));
    add('neck', -0.03 * breath, 0, 0);

    // Walk / run cycle.
    if (this.state === 'stand' && this.speed > 0.05) {
      const run = clamp((this.speed - WALK) / (RUN - WALK), 0, 1);
      const A = clamp(this.speed / 1.0, 0, 1) * (0.45 + run * 0.35);
      const ph = this.phase;
      const limp = b.limp;
      add('hipL', -A * Math.sin(ph) * (1 - limp * 0.5), 0, 0);
      add('hipR', A * Math.sin(ph), 0, 0);
      add('kneeL', A * 1.4 * Math.max(0, -Math.cos(ph)) * (1 - limp * 0.6), 0, 0);
      add('kneeR', A * 1.4 * Math.max(0, Math.cos(ph)), 0, 0);
      add('ankleL', A * 0.3 * Math.sin(ph), 0, 0);
      add('ankleR', -A * 0.3 * Math.sin(ph), 0, 0);
      // Arms swing opposite; when running, elbows bent and pumping.
      add('shoulderL', A * 0.7 * Math.sin(ph), 0, 0);
      add('shoulderR', -A * 0.7 * Math.sin(ph), 0, 0);
      sym('elbow', -1.2, 0, 0, run);
      add('waist', 0.15 * run, A * 0.12 * Math.sin(ph), 0); // lean into the run, counter-twist
      if (this.mode === 'backoff') add('waist', -0.12, 0, 0); // leaning back, away from the danger
    }

    // Getting up: start from a crouch and straighten.
    if (this.state === 'rising') {
      const w = 1 - clamp(this.stateT / 1.1, 0, 1);
      sym('hip', -1.3, 0, 0, w);
      sym('knee', 2.0, 0, 0, w);
      add('waist', 0.5, 0, 0, w);
      sym('shoulder', -0.8, 0, 0.3, w);
    }

    // Fear postures.
    const wCower = this.mode === 'cower' ? 1 : 0;
    const wFreeze = this.mode === 'freeze' ? 1 : 0;
    const wGuard = clamp(this.flinch * 1.6 + wFreeze * 0.6 + (this.mode === 'backoff' ? 0.35 : 0), 0, 1) * (1 - wCower);
    // Cornered: deep crouch, back turned, arms wrapped over the head.
    sym('hip', -0.9, 0, 0, wCower);
    sym('knee', 1.6, 0, 0, wCower);
    add('waist', 0.55, 0, 0, wCower);
    add('neck', 0.45, 0, 0, wCower);
    sym('shoulder', -2.4, 0, -0.45, wCower);
    sym('elbow', -2.0, 0, 0, wCower);
    // Guarding (flinch / startle / wary): hands up in front, shoulders hunched.
    sym('shoulder', -1.3, 0, -0.25, wGuard);
    sym('elbow', -1.5, 0, 0, wGuard);
    add('waist', 0.12, 0, 0, wGuard);
    // Trembling, stronger in the legs and hands, scaled by fear and lingering anxiety.
    if (arousal > 0.3) {
      const tr = (arousal - 0.3) * 0.09;
      sym('knee', Math.sin(t * 47) * tr, 0, 0);
      sym('wrist', Math.sin(t * 53) * tr * 1.5, 0, Math.sin(t * 41) * tr);
      add('neck', Math.sin(t * 39) * tr * 0.4, Math.sin(t * 31) * tr * 0.4, 0);
    }

    // Carried: kick and flail.
    const ws = this.struggle;
    if (ws > 0.01) {
      const w = 13;
      add('shoulderL', -1.0 + 0.9 * Math.sin(t * w), 0, 0.6 + 0.4 * Math.sin(t * w * 1.3), ws);
      add('shoulderR', -1.0 + 0.9 * Math.sin(t * w + 2), 0, -(0.6 + 0.4 * Math.sin(t * w * 1.1 + 1)), ws);
      sym('elbow', -0.8 + 0.6 * Math.sin(t * w * 1.2), 0, 0, ws);
      add('hipL', -0.5 + 0.7 * Math.sin(t * w * 0.9), 0, 0, ws);
      add('hipR', -0.5 + 0.7 * Math.sin(t * w * 0.9 + Math.PI), 0, 0, ws);
      add('kneeL', 0.7 + 0.6 * Math.sin(t * w * 0.9 + 1), 0, 0, ws);
      add('kneeR', 0.7 + 0.6 * Math.sin(t * w * 0.9 + Math.PI + 1), 0, 0, ws);
    }

    // Crawling: arms reach and pull.
    if (this.state === 'crawl') {
      add('shoulderL', -2.6 + 0.9 * Math.sin(this.phase), 0, 0);
      add('shoulderR', -2.6 + 0.9 * Math.sin(this.phase + Math.PI), 0, 0);
      sym('elbow', -0.4, 0, 0);
      add('neck', -0.6, 0, 0);
    }

    // Relief after being put back together: a little stretch.
    const wh = clamp(this.happy, 0, 1) * (1 - wCower) * (1 - ws);
    sym('shoulder', 0, 0, 0.5 * Math.sin(t * 3) ** 2, wh);

    // Dizzy: head lolls in circles.
    const wd = clamp(this.dizzy, 0, 1);
    add('neck', 0.2 * Math.sin(t * 5), 0, 0.2 * Math.cos(t * 5), wd);

    // Look with the head (less while cowering, where it peeks).
    this.lookSmooth.lerp(this.lookTarget, Math.min(1, dt * (arousal > 0.4 ? 12 : 6)));
    const neck = this.jointByName('neck');
    if (neck) {
      const hp = bodyPos(neck.b.body, _v);
      const local = _w.copy(this.lookSmooth).sub(hp).applyQuaternion(bodyQuat(neck.a.body, _q).invert());
      const yaw = clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
      const pitch = clamp(Math.atan2(-local.y, Math.hypot(local.x, local.z)), -0.5, 0.6);
      add('neck', pitch, yaw, 0, (1 - wCower * 0.6) * (1 - wd * 0.6));
    }

    // Blend and write into the joint rest poses.
    const k = 1 - Math.exp(-dt * (this.flinch > 0 || this.mode === 'freeze' ? 18 : 9));
    const names = new Set([...T.keys(), ...this.offsets.keys()]);
    for (const name of names) {
      const target = T.get(name) || _v.set(0, 0, 0);
      let cur = this.offsets.get(name);
      if (!cur) this.offsets.set(name, (cur = new THREE.Vector3()));
      cur.lerp(target, k);
      const j = this.jointByName(name);
      if (!j || !j.base) continue;
      _q.setFromEuler(_e.set(cur.x, cur.y, cur.z, 'YXZ'));
      j.rest.copy(_q).multiply(j.base);
    }
  }

  /** Loose pieces lying still occasionally hop toward the rest of the body. */
  hopLoosePieces(dt) {
    const game = this.game;
    const m = game.mannequin;
    this.hopIn -= dt;
    if (this.hopIn > 0) return;
    this.hopIn = 1.2 + Math.random() * 2.2;
    const chest = m.byName.chest;
    if (!chest?.alive) return;
    const main = m.graph(chest).set;
    const loose = m.parts.filter((e) => e.alive && !main.has(e) && e !== game.grabbedEntity && !e.flat);
    if (!loose.length) return;
    const e = loose[(Math.random() * loose.length) | 0];
    const comp = m.graph(e);
    if (comp.anchored || comp.set.size > 4) return;
    for (const o of comp.set) if (o === game.grabbedEntity) return;
    const v = e.body.linvel();
    if (Math.hypot(v.x, v.y, v.z) > 0.4) return;
    const p = bodyPos(e.body);
    const target = bodyPos(chest.body);
    const dir = _w.set(target.x - p.x, 0, target.z - p.z);
    const dist = dir.length();
    if (dist < 0.45) return;
    dir.normalize();
    const gs = Math.sqrt(Math.abs(game.physics.gravityY) / 9.81) || 0.4;
    const up = (e.partName === 'head' ? 1.6 : 2.2) * gs;
    const fwd = Math.min(1.4, dist) * gs;
    for (const o of comp.set) {
      const ov = o.body.linvel();
      o.body.setLinvel({ x: ov.x + dir.x * fwd, y: ov.y + up, z: ov.z + dir.z * fwd }, true);
    }
    if (Math.random() < 0.3) game.sfx.knock();
  }

  jointByName(name) {
    if (!this._jointCache || this._jointCacheStep !== this.steps) {
      this._jointCache = new Map();
      this._jointCacheStep = this.steps;
      for (const j of this.game.joints.list) if (j.kind === 'body' && j.name && j.name !== 'custom') this._jointCache.set(j.name, j);
    }
    return this._jointCache.get(name);
  }

  /* ------------------------------ per frame ------------------------------ */

  update(dt) {
    const game = this.game;
    const head = this.head;
    const chest = game.mannequin.byName?.chest;
    if (chest?.alive && !chest.flat) {
      const b = this.breath || 0;
      chest.mesh.scale.set(1 + 0.012 * b, 1 + 0.008 * b, 1 + 0.035 * b);
    }
    this.updateEyes(dt, head);
    this.stars.visible = !!head && this.dizzy > 0;
    if (this.stars.visible) {
      const hp = bodyPos(head.body, _v);
      for (const s of this.stars.children) {
        s.userData.a += dt * 4;
        s.position.set(hp.x + Math.cos(s.userData.a) * 0.16, hp.y + 0.2 + Math.sin(s.userData.a * 2) * 0.02, hp.z + Math.sin(s.userData.a) * 0.16);
        s.rotation.y += dt * 6;
      }
    }
  }

  updateEyes(dt, head) {
    if (!head) return;
    if (!this.faceParts || this.faceParts.owner !== head) {
      this.faceParts = { owner: head };
      head.mesh.traverse((o) => {
        if (o.userData.facePart) this.faceParts[o.userData.facePart] = o;
      });
    }
    const F = this.faceParts;
    if (!F.eyeL) return;
    const arousal = Math.max(this.fear, this.anxiety * 0.6);
    // Fear: eyes wide open, pupils dilated. Pain: squeezed shut. Dizzy: unfocused.
    let lid = 1;
    let pupil = 1;
    if (this.state === 'down' && this.stateT < 0.6) lid = 0.15;
    else if (this.pain > 0.35) lid = 0.25;
    else if (arousal > 0.25) {
      lid = 1 + arousal * 0.35;
      pupil = 1 + arousal * 0.35;
    } else if (this.dizzy > 0) lid = 0.65;
    else if (this.happy > 0) lid = 0.7;
    const k = 1 - Math.exp(-dt * 14);
    this.eyes.lid += (lid - this.eyes.lid) * k;
    this.eyes.pupil += (pupil - this.eyes.pupil) * k;

    // Blinking: frightened eyes stare (blink rarely); anxious ones blink often.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinking = 0.12;
      this.blinkIn = this.fear > 0.5 ? 4 + Math.random() * 3 : this.anxiety > 0.3 ? 0.8 + Math.random() * 1.5 : 1.8 + Math.random() * 4;
    }
    this.blinking = Math.max(0, this.blinking - dt);
    const L = Math.max(0.06, this.eyes.lid * (this.blinking > 0 ? 0.08 : 1));

    const hp = bodyPos(head.body, _v);
    const d = _w.copy(this.lookSmooth).sub(hp).applyQuaternion(bodyQuat(head.body, _q).invert());
    let px = clamp(d.x / Math.max(0.3, Math.abs(d.z) + 0.3), -1, 1) * 0.011;
    let py = clamp(d.y / Math.max(0.3, Math.abs(d.z) + 0.3), -1, 1) * 0.011;
    const t = performance.now() / 1000;
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1;
      F['eye' + s].scale.y = L;
      const p = F['pupil' + s];
      if (this.dizzy > 0) {
        px = Math.cos(t * 9 * sign) * 0.007;
        py = Math.sin(t * 9 * sign) * 0.007;
      }
      p.position.set(p.userData.base.x + px, p.userData.base.y + py * Math.min(1, L), p.userData.base.z);
      p.scale.set(this.eyes.pupil, this.eyes.pupil * Math.min(1, L), 1);
    }
  }
}
