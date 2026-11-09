import * as THREE from 'three';
import { bodyPos, bodyQuat } from './physics.js';

/*
 * Makes the mannequin feel alive.
 *
 * Body language works by nudging the *rest pose* of the joint muscles (see
 * joints.js): breathing, idle sway, looking at you, flinching, cowering,
 * kicking when grabbed, waving when rebuilt. The physics does the rest, so the
 * motion stays physical and reacts to hits.
 *
 * On top of that: an expressive face (blinks, pupils that follow things, brows
 * and mouth that track its mood), speech bubbles with a gibberish voice, and
 * loose pieces that hop back toward the body.
 */

const LINES = {
  hello: ['Oh, hi!', 'Go on, let it out.', 'Rough day?', 'Do your worst!'],
  reset: ["I'm back!", 'Fresh start!', 'Round two?', 'Ready when you are.', 'Missed me?'],
  hit: ['Ow!', 'Hey!', 'Ouch!', 'Oof!', 'Rude!', 'Ow, ow, ow!', 'Not the face!', 'Okay, fair.', 'I deserved that.', 'Feel better?', 'Let it out!', 'Ack!', 'Was it something I said?'],
  bigHit: ['OW!', 'That one hurt!', 'Easy!', 'Yikes!', 'My everything!'],
  head: ['I lost my head!', 'Where did my body go?', 'Uh, little help?'],
  arm: ['My arm!', 'I needed that!', "I'm unarmed!", 'Hand me that? ...No?'],
  hand: ['My hand!', 'Can someone give me a hand?'],
  leg: ['My leg!', 'How do I walk now?', 'I was using that!'],
  foot: ['My foot!', 'Off on the wrong foot...'],
  waist: ["I'm in two pieces!", 'I feel a bit split.'],
  stand: ["Whoa, I'm free!", 'My stand!'],
  severedHead: ['Put me back!', 'Hello? Body?', 'Little help down here?', 'Nice view from down here.', 'This is a new perspective.'],
  grabbed: ['Put me down!', 'Whoa, careful!', 'Hey! Hands off!', 'Wheee!', 'Where are we going?'],
  flying: ['Wheeeee!', "I'm flyiiing!", 'Aaaaah!'],
  fixed: ['Good as new!', 'Ahh, much better.', 'Thanks!', 'Back in one piece!', "That's the spot."],
  weird: ["That's... not where that goes.", 'Is this a new look?', 'I can work with this.', 'Interesting choice.', 'Feels weird. I like it.'],
  headWeird: ['Why is everything behind me?', "Hey, this isn't my neck!", "I can't see where I'm going!"],
  bored: ["Is that all you've got?", "I'm still standing!", '...Hello?', 'Take a deep breath.', 'Feeling any better?', 'I could do this all day.', 'Hey! Over here!'],
  gore: ["I'm leaking!", 'Is that ketchup?!', "That's supposed to stay inside!", 'Somebody get a mop!', "It's fine. It's fine.", 'Oh, that is NOT wood glue.'],
  boom: ['AAAH!', 'KABOOM?!', 'My ears!', 'Too loud!'],
  dizzy: ['Ugh... which way is up?', 'Seeing stars...', 'The room is spinning.'],
  hover: ['Uh oh.', "What's that for?", "Now, let's not be hasty...", 'I see you.', 'Easy with that thing.'],
  threat: {
    anvil: ['Is that an anvil?!', 'Look out above!'],
    cannon: ['Incoming!', 'Whoa whoa whoa!'],
    bomb: ['Is that ticking?!', 'Bomb! BOMB!'],
    dynamite: ['Get it off me!', "That's dynamite!", 'Not the dynamite!'],
    rocket: ['Wait, where are we going?', "I'm not ready for space!"],
    press: ['Is it getting lower?', "I'm feeling the pressure!"],
    crusher: ['Keep me away from that!'],
    guillotine: ['Oh no, not that!', "Let's talk about this!"],
    blades: ['Careful with those!', 'Too close! Too close!'],
    chipper: ['I am NOT going in there!', 'That looks hungry.'],
    blender: ['Not the blender!'],
    tornado: ['Hold me!', 'Here comes the wind!'],
    magnet: ["I'm not even metal!", "Something's pulling me!"],
    wreck: ['That ball swings a bit close...'],
  },
  rooms: {
    studio: ['Home sweet home.'],
    construction: ["Shouldn't I have a hard hat?"],
    kitchen: ['Something smells... like burnt toast.'],
    junkyard: ["I don't belong here!"],
    space: ['Is this... space?!'],
  },
};

const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function partGroup(name = '') {
  if (name.startsWith('head')) return 'head';
  if (name.startsWith('hand')) return 'hand';
  if (name.startsWith('foot')) return 'foot';
  if (name.startsWith('upperArm') || name.startsWith('forearm')) return 'arm';
  if (name.startsWith('thigh') || name.startsWith('shin')) return 'leg';
  return 'waist';
}

export class Life {
  constructor(game) {
    this.game = game;
    game.life = this;
    this.talk = true;
    this.t = 0;
    this.pain = 0;
    this.fear = 0;
    this.happy = 0;
    this.dizzy = 0;
    this.flinch = 0;
    this.struggle = 0;
    this.lastEvent = 0;
    this.offsets = new Map();
    this.face = { lid: 1, pupil: 1, tilt: 0, browY: 0, smile: 0.25, open: 0 };
    this.blinkIn = 2;
    this.blinking = 0;
    this.lookTarget = new THREE.Vector3(0, 1.5, 4);
    this.lookSmooth = new THREE.Vector3(0, 1.5, 4);
    this.lookAway = null;
    this.glance = null;
    this.glanceAt = 0;
    this.threat = null;
    this.saidAt = -99;
    this.saidPriority = 0;
    this.spoke = {};
    this.wasGrabbed = null;
    this.hopIn = 3;
    this.steps = 0;
    this.started = false;

    this.bubble = document.createElement('div');
    this.bubble.className = 'bubble';
    game.container.appendChild(this.bubble);
    this.bubbleT = 0;

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

  get head() {
    const h = this.game.mannequin.byName?.head;
    return h?.alive ? h : null;
  }

  /* ------------------------------ speech ------------------------------ */

  say(text, { priority = 1, chance = 1 } = {}) {
    if (!this.talk || !text || Math.random() > chance) return false;
    const now = this.game.time;
    const busy = now - this.saidAt < 1.8;
    if (busy && !(priority > this.saidPriority && now - this.saidAt > 0.35)) return false;
    this.saidAt = now;
    this.saidPriority = priority;
    this.bubble.textContent = text;
    this.bubble.classList.remove('show');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('show');
    this.bubbleT = 1.6 + text.length * 0.045;
    const pitch = this.fear > 0.4 ? 1.35 : this.dizzy > 0 ? 0.8 : this.happy > 0 ? 1.12 : this.pain > 0.4 ? 1.18 : 1;
    this.game.sfx.voice(text, { pitch, shaky: this.pain > 0.5 || this.fear > 0.6 });
    return true;
  }

  sayOnce(key, lines, gap, opts) {
    const now = this.game.time;
    if (now - (this.spoke[key] ?? -99) < gap) return false;
    if (this.say(pick(lines), opts)) {
      this.spoke[key] = now;
      return true;
    }
    return false;
  }

  /* ------------------------------ events ------------------------------ */

  poke() {
    this.lastEvent = this.game.time;
  }

  onBuild() {
    this.pain = this.fear = this.dizzy = this.flinch = this.struggle = 0;
    this.happy = 1.2;
    this.offsets.clear();
    this.faceParts = null;
    this.poke();
    const lines = this.started ? LINES.reset : LINES.hello;
    this.started = true;
    this.game.later(0.6, () => this.say(pick(lines), { priority: 1 }));
  }

  onRoom(id) {
    const l = LINES.rooms[id];
    if (l) this.game.later(1.4, () => this.say(pick(l), { priority: 1.2 }));
  }

  onHurt(e, amount, point) {
    this.poke();
    this.pain = Math.min(1.5, this.pain + amount * 1.3);
    this.flinch = Math.max(this.flinch, 0.25 + amount * 0.4);
    this.happy = 0;
    const head = this.head;
    if (head) {
      // Wince: look away from the hit.
      const hp = bodyPos(head.body);
      this.lookAway = { pos: hp.clone().add(hp.clone().sub(point).setY(0).normalize().multiplyScalar(2)), until: this.game.time + 0.6 };
    }
    if (e.partName === 'head' && amount >= 0.3 && this.dizzy <= 0) {
      this.dizzy = 3;
      this.game.later(0.5, () => this.say(pick(LINES.dizzy), { priority: 1 }));
    }
    if (amount >= 0.45) this.say(pick(LINES.bigHit), { priority: 2 });
    else this.say(pick(LINES.hit), { priority: 1, chance: 0.55 });
  }

  onBump(e, force) {
    this.pain = Math.min(1.5, this.pain + Math.min(0.2, force / 20000));
    if (force > 2500) {
      this.flinch = Math.max(this.flinch, 0.2);
      this.say(pick(['Oof!', 'Ow!', 'Ugh!', 'Hey!']), { priority: 0.5, chance: 0.35 });
    }
  }

  onSever(j, quiet) {
    this.poke();
    this.pain = Math.min(1.5, this.pain + 0.5);
    this.flinch = 0.6;
    this.happy = 0;
    let lines;
    if (j.kind === 'stand') lines = LINES.stand;
    else if (j.kind !== 'body') return;
    else lines = LINES[partGroup(j.b.partName)];
    if (quiet && Math.random() < 0.5) return;
    if (this.game.gore?.on && Math.random() < 0.35) lines = LINES.gore;
    this.say(pick(lines), { priority: 2 });
  }

  onAttach(c, proper, j) {
    this.poke();
    this.happy = 2.6;
    this.pain *= 0.4;
    this.fear = 0;
    let lines = proper ? LINES.fixed : LINES.weird;
    if (!proper && c.from.partName === 'head') lines = LINES.headWeird;
    void j;
    this.say(pick(lines), { priority: 3 });
  }

  onBoom(point, radius) {
    this.poke();
    const head = this.head;
    if (!head) return;
    const d = bodyPos(head.body).distanceTo(point);
    if (d > radius * 2.2) return;
    this.fear = 1;
    this.flinch = 0.8;
    if (radius > 1.2) this.say(pick(LINES.boom), { priority: 2 });
  }

  /* --------------------------- per physics step --------------------------- */

  fixed(dt) {
    const game = this.game;
    const m = game.mannequin;
    if (!m.byName) return;
    this.t += dt;
    this.steps++;
    this.pain = Math.max(0, this.pain - dt * 0.25);
    this.fear = Math.max(0, this.fear - dt * 0.5);
    this.happy = Math.max(0, this.happy - dt);
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.flinch = Math.max(0, this.flinch - dt);

    // Being carried around.
    const g = game.grabbedEntity;
    const grabbed = g && g.kind === 'part' ? g : null;
    if (grabbed && grabbed !== this.wasGrabbed) {
      this.poke();
      if (grabbed.partName === 'head' && !grabbed.joints.length) this.say(pick(['Careful with me!', 'Take me to my body!', 'Wheee!']), { priority: 1 });
      else this.say(pick(LINES.grabbed), { priority: 1, chance: 0.7 });
    }
    this.wasGrabbed = grabbed;
    this.struggle += ((grabbed ? 1 : 0) - this.struggle) * Math.min(1, dt * 6);

    if (this.steps % 10 === 0) this.senseThreats();
    if (this.steps % 15 === 0) this.checkFlying();
    this.idleChatter();
    this.hopLoosePieces(dt);
    this.updateLookTarget();
    this.drivePose(dt);
  }

  senseThreats() {
    const game = this.game;
    const head = this.head;
    if (!head) return;
    const core = bodyPos(head.body, _v);
    core.y -= 0.4;
    let best = null;
    let bestD = Infinity;
    for (const e of game.physics.entities) {
      if (!e.threat || !e.body.isDynamic()) continue;
      const p = bodyPos(e.body);
      const d = p.distanceTo(core);
      if (d > 4) continue;
      const lv = e.body.linvel();
      const toward = -((p.x - core.x) * lv.x + (p.y - core.y) * lv.y + (p.z - core.z) * lv.z) / Math.max(d, 0.01);
      const lit = e.threat === 'dynamite' || e.threat === 'rocket';
      if (toward > 3 || (lit && d < 2)) {
        if (d < bestD) {
          bestD = d;
          best = { kind: e.threat, pos: p };
        }
      }
    }
    const gadgets = [...game.gadgets, ...(game.room?.gadgets || [])];
    for (const gd of gadgets) {
      if (!gd.threat || gd.dead) continue;
      const p = gd.threat.pos;
      const d = Math.hypot(p.x - core.x, p.z - core.z);
      if (d < 2.3 && d < bestD) {
        bestD = d;
        best = { kind: gd.threat.kind, pos: p.clone().setY(Math.max(p.y, 0.5)) };
      }
    }
    // A weapon hovering over the body makes it nervous.
    const hov = game.hoverHit;
    if (!best && hov && hov.entity?.kind === 'part' && game.time - hov.time < 0.6 && game.tool.cat !== 'hand') {
      this.fear = Math.max(this.fear, 0.35);
      this.threat = { kind: 'hover', pos: hov.point };
      this.sayOnce('hover', LINES.hover, 9, { priority: 0.5, chance: 0.5 });
      return;
    }
    this.threat = best;
    if (!best) return;
    this.fear = Math.max(this.fear, clamp(1.3 - bestD / 3, 0.4, 1));
    this.poke();
    const lines = LINES.threat[best.kind];
    if (lines) this.sayOnce('threat_' + best.kind, lines, 6, { priority: 2 });
  }

  checkFlying() {
    const head = this.head;
    if (!head || this.game.grabbedEntity) return;
    const v = head.body.linvel();
    if (Math.hypot(v.x, v.y, v.z) > 7 && head.body.translation().y > 1) this.sayOnce('fly', LINES.flying, 3, { priority: 1.5 });
  }

  idleChatter() {
    const game = this.game;
    const quiet = game.time - this.lastEvent;
    const head = this.head;
    if (!head) return;
    if (head.joints.length === 0 && quiet > 6) {
      if (this.sayOnce('severedHead', LINES.severedHead, 9, { priority: 0.5 })) this.lastEvent = game.time - 2;
    } else if (quiet > 15) {
      if (this.say(pick(LINES.bored), { priority: 0.5 })) this.lastEvent = game.time - 3;
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
    const e = pick(loose);
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
    e.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.05 * e.body.mass(), y: 0, z: (Math.random() - 0.5) * 0.05 * e.body.mass() }, true);
    if (Math.random() < 0.3) game.sfx.knock();
  }

  updateLookTarget() {
    const game = this.game;
    const now = game.time;
    if (this.lookAway && now < this.lookAway.until) this.lookTarget.copy(this.lookAway.pos);
    else if (this.threat) this.lookTarget.copy(this.threat.pos);
    else if (game.grabbedEntity && game.grabbedEntity !== this.head) this.lookTarget.copy(bodyPos(game.grabbedEntity.body, _v));
    else if (game.hoverHit && now - game.hoverHit.time < 2.5) this.lookTarget.copy(game.hoverHit.point);
    else {
      if (now > this.glanceAt) {
        // Mostly look at the player; sometimes glance around the room.
        this.glance = Math.random() < 0.35 ? new THREE.Vector3((Math.random() - 0.5) * 8, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 8) : null;
        this.glanceAt = now + 1.5 + Math.random() * 3;
      }
      this.lookTarget.copy(this.glance || game.camera.position);
    }
  }

  drivePose(dt) {
    const game = this.game;
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
    const breath = Math.sin(t * (1.7 + this.fear * 3 + this.pain * 1.5));
    this.breath = breath;

    // Idle: breathing, a little weight shift.
    sym('shoulder', 0, 0, 0.07 + 0.025 * breath);
    sym('elbow', -0.15, 0, 0);
    add('waist', 0.025 * Math.sin(t * 0.6), 0.04 * Math.sin(t * 0.31), 0.035 * Math.sin(t * 0.43));
    add('neck', -0.03 * breath, 0, 0);

    // Cower / flinch: arms up over the face, hunch, knees up.
    const wc = clamp(this.fear * 1.1 + this.flinch * 1.6, 0, 1) * (1 - this.struggle);
    sym('shoulder', -2.0, 0, -0.5, wc);
    sym('elbow', -1.6, 0, 0, wc);
    add('waist', 0.3, 0, 0, wc);
    sym('hip', -0.5, 0, 0, wc);
    sym('knee', 0.9, 0, 0, wc);
    if (this.fear > 0.3) sym('shoulder', Math.sin(t * 43) * 0.05 * this.fear, 0, 0); // trembling

    // Struggle while grabbed: kick and flail.
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

    // Happy: wave with the right arm.
    const wh = clamp(this.happy, 0, 1) * (1 - wc) * (1 - ws);
    add('shoulderR', 0, 0, -2.5, wh);
    add('elbowR', 0, 0, -(0.5 + 0.5 * Math.sin(t * 11)), wh);

    // Dizzy: head wobbles in circles.
    const wd = clamp(this.dizzy, 0, 1);
    add('neck', 0.2 * Math.sin(t * 5), 0, 0.2 * Math.cos(t * 5), wd);
    add('waist', 0.07 * Math.sin(t * 2.5), 0, 0.07 * Math.cos(t * 2.5), wd);

    // Look at things with the head.
    this.lookSmooth.lerp(this.lookTarget, Math.min(1, dt * 6));
    const neck = this.jointByName('neck');
    if (neck) {
      const hp = bodyPos(neck.b.body, _v);
      const local = _w.copy(this.lookSmooth).sub(hp).applyQuaternion(bodyQuat(neck.a.body, _q).invert());
      const yaw = clamp(Math.atan2(local.x, local.z), -1.0, 1.0);
      const pitch = clamp(Math.atan2(-local.y, Math.hypot(local.x, local.z)), -0.5, 0.6);
      const wl = (1 - wc * 0.7) * (1 - wd * 0.6);
      add('neck', pitch, yaw, 0, wl);
    }

    // Blend current offsets toward targets and write them into the joint rest poses.
    const k = 1 - Math.exp(-dt * (this.flinch > 0 ? 16 : 7));
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
    // Breathing chest.
    const chest = game.mannequin.byName?.chest;
    if (chest?.alive && !chest.flat) {
      const b = this.breath || 0;
      chest.mesh.scale.set(1 + 0.012 * b, 1 + 0.008 * b, 1 + 0.035 * b);
    }
    this.updateFace(dt, head);
    this.updateBubble(dt, head);
    // Dizzy stars.
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

  updateFace(dt, head) {
    if (!head) return;
    if (!this.faceParts || this.faceParts.owner !== head) {
      this.faceParts = { owner: head };
      head.mesh.traverse((o) => {
        if (o.userData.facePart) this.faceParts[o.userData.facePart] = o;
      });
    }
    const F = this.faceParts;
    if (!F.eyeL) return;
    const now = this.game.time;
    const severed = head.joints.length === 0;
    const bored = now - this.lastEvent > 10;

    // Expression targets, by priority.
    let tgt = { lid: 1, pupil: 1, tilt: 0, browY: 0, smile: 0.3, open: 0 };
    if (this.dizzy > 0) tgt = { lid: 0.65, pupil: 0.9, tilt: -0.15, browY: 0.003, smile: -0.3, open: 0.35 };
    else if (this.pain > 0.3) tgt = { lid: 0.2, pupil: 1, tilt: 0.45, browY: -0.004, smile: -1, open: 0.55 };
    else if (this.fear > 0.3) tgt = { lid: 1.3, pupil: 0.55, tilt: -0.4, browY: 0.009, smile: -0.4, open: 0.9 };
    else if (this.happy > 0) tgt = { lid: 0.75, pupil: 1, tilt: -0.1, browY: 0.005, smile: 1, open: 0.35 };
    else if (this.pain > 0.08) tgt = { lid: 0.8, pupil: 1, tilt: 0.35, browY: -0.003, smile: -0.6, open: 0 };
    else if (severed) tgt = { lid: 1.05, pupil: 0.9, tilt: -0.3, browY: 0.005, smile: -0.5, open: 0.15 };
    else if (bored) tgt = { lid: 0.5, pupil: 1, tilt: 0.05, browY: -0.002, smile: -0.1, open: 0 };
    const k = 1 - Math.exp(-dt * 14);
    for (const key in tgt) this.face[key] += (tgt[key] - this.face[key]) * k;
    const f = this.face;

    // Blinking.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinking = 0.13;
      this.blinkIn = 1.8 + Math.random() * 4 * (this.fear > 0.3 ? 0.3 : 1);
    }
    this.blinking = Math.max(0, this.blinking - dt);
    const lid = Math.max(0.06, f.lid * (this.blinking > 0 ? 0.08 : 1));

    // Where the pupils point (head-local).
    const hp = bodyPos(head.body, _v);
    const d = _w.copy(this.lookSmooth).sub(hp).applyQuaternion(bodyQuat(head.body, _q).invert());
    let px = clamp(d.x / Math.max(0.3, Math.abs(d.z) + 0.3), -1, 1) * 0.011;
    let py = clamp(d.y / Math.max(0.3, Math.abs(d.z) + 0.3), -1, 1) * 0.011;
    const t = performance.now() / 1000;
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1;
      F['eye' + s].scale.y = lid;
      const pupil = F['pupil' + s];
      if (this.dizzy > 0) {
        px = Math.cos(t * 9 * sign) * 0.007;
        py = Math.sin(t * 9 * sign) * 0.007;
      }
      pupil.position.set(pupil.userData.base.x + px, pupil.userData.base.y + py * Math.min(1, lid), pupil.userData.base.z);
      pupil.scale.set(f.pupil, f.pupil * Math.min(1, lid), 1);
      const brow = F['brow' + s];
      brow.rotation.z = f.tilt * sign;
      brow.position.y = brow.userData.base.y + f.browY + (lid - 1) * 0.01;
      const mouth = F['mouth' + s];
      mouth.rotation.z = f.smile * 0.42 * sign * (1 - f.open * 0.5);
      mouth.scale.y = 1 + f.open * 2.6;
    }
  }

  updateBubble(dt, head) {
    const b = this.bubble;
    if (this.bubbleT <= 0) return;
    this.bubbleT -= dt;
    if (this.bubbleT <= 0 || !head) {
      b.classList.remove('show');
      this.bubbleT = 0;
      return;
    }
    const p = bodyPos(head.body, _v);
    p.y += 0.2;
    p.project(this.game.camera);
    if (p.z > 1) {
      b.style.opacity = '0';
      return;
    }
    b.style.opacity = '';
    const r = this.game.renderer.domElement.getBoundingClientRect();
    const x = clamp(((p.x + 1) / 2) * r.width, 80, r.width - 80);
    const y = clamp(((1 - p.y) / 2) * r.height, 120, r.height - 40);
    b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}
