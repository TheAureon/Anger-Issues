import * as THREE from 'three';
import { ROOMS } from './rooms.js';
import { SKINS } from './mannequin.js';
import { sendScoreToUsForge } from './usforge.js';

// Leaderboard runs only count in the default room, so scores are comparable.
const LEADERBOARD_ROOM = 'studio';

/*
 * XP, ranks and badges. Purely for bragging rights: nothing is ever locked
 * behind them (everything in the game stays available from the start).
 * Progress is saved in localStorage.
 */

const RANKS = [
  [1, 'Mildly Annoyed'],
  [3, 'Irritated'],
  [5, 'Cranky'],
  [8, 'Fuming'],
  [12, 'Seething'],
  [16, 'Livid'],
  [20, 'Furious'],
  [25, 'Volcanic'],
  [30, 'Apoplectic'],
  [40, 'Inner Peace'],
];

/** XP needed to go from level L to L+1. */
const need = (L) => Math.round(80 * Math.pow(L, 1.35));

// id: [icon, name, description, optional { goal, counter }]
export const BADGES = {
  first_snap: ['🦴', 'First Snap', 'Break your first joint.'],
  heads_roll: ['🗿', 'Heads Will Roll', 'Knock the head clean off.'],
  disarmed: ['🙅', 'Disarmed', 'Take off both arms.'],
  legless: ['🦵', 'Legless', 'Take off both legs.'],
  teardown: ['🧩', 'Full Teardown', 'Break every single joint.'],
  speed_demon: ['⚡', 'Speed Demon', 'Break 5 joints within 2 seconds.'],
  good_as_new: ['🩹', 'Good as New', 'Put a piece back where it belongs.'],
  surgeon: ['🧑‍⚕️', 'Surgeon', 'Put 10 pieces back where they belong.', { goal: 10, counter: 'properAttaches' }],
  potato: ['🥔', 'Some Assembly Required', 'Stick a piece somewhere it does not belong.'],
  wrong_way: ['🔄', 'Wrong Way Round', 'Put the head back on wrong.'],
  frankenstein: ['🧟', 'Frankenstein', 'Have 3 pieces in the wrong places at once.'],
  kaboom: ['💥', 'Kaboom', 'Set off your first explosion.'],
  demolition: ['🏚️', 'Demolition Expert', 'Set off 50 explosions.', { goal: 50, counter: 'booms' }],
  tool_time: ['🧰', 'Tool Time', 'Use 10 different tools.', { goal: 10, counter: 'toolsUsed' }],
  completionist: ['🏆', 'Completionist', 'Use every tool in the box.', { goal: 'tools', counter: 'toolsUsed' }],
  tourist: ['🧳', 'Tourist', 'Visit every room.', { goal: 'rooms', counter: 'rooms' }],
  fashionista: ['👗', 'Fashionista', 'Try every look.', { goal: 'skins', counter: 'skins' }],
  name_giver: ['🏷️', 'It Has a Name', 'Give your mannequin a name.'],
  pancake: ['🥞', 'Pancake', 'Flatten a piece in a press.'],
  wood_chips: ['🌲', 'Wood Chips', 'Feed a piece to the chipper or the blender.'],
  bullseye: ['🎯', 'Bullseye', 'Hit the head with an arrow.'],
  glued: ['🧴', 'Stuck on You', 'Glue the mannequin to a wall or the floor.'],
  liftoff: ['🚀', 'Liftoff', 'Send a piece more than 12 m into the air.'],
  knockdowns: ['🤕', 'Timber!', 'Knock it over 10 times.', { goal: 10, counter: 'knockdowns' }],
  run_away: ['🏃', 'Run Away!', 'Scare it into running for its life.'],
  cornered: ['🫣', 'Cornered', 'Scare it into hiding its face.'],
  combo_king: ['👑', 'Combo King', 'Reach a ×5 combo.'],
  slowmo: ['🐢', 'Bullet Time', 'Break a joint in slow motion.'],
  zero_g: ['🌌', 'Zero G', 'Break a joint in space.'],
  zen: ['🧘', 'Zen', 'Do nothing at all for a whole minute.'],
  thousand: ['💯', 'Busy Hands', 'Break 1,000 joints.', { goal: 1000, counter: 'severed' }],
};

function rankFor(level) {
  let r = RANKS[0][1];
  for (const [l, name] of RANKS) if (level >= l) r = name;
  return r;
}

export class Progress {
  constructor(game) {
    this.game = game;
    game.progress = this;
    this.data = this.load();
    this.combo = 0;
    this.comboUntil = 0;
    this.severTimes = [];
    this.lastEvent = performance.now();
    this.dirty = false;
    this.saveAt = 0;
    this.pending = new Map(); // popup merging
    this.toastQueue = [];
    this.toasting = false;
    this.lastMode = null;
    this.startRun(); // the first mannequin was built before this existed
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
  }

  load() {
    let d = null;
    try {
      d = JSON.parse(localStorage.getItem('ai-progress') || 'null');
    } catch {
      d = null;
    }
    d = d && typeof d === 'object' ? d : {};
    return {
      xp: Number(d.xp) || 0,
      badges: d.badges && typeof d.badges === 'object' ? d.badges : {},
      c: { severed: 0, booms: 0, attached: 0, properAttaches: 0, knockdowns: 0, ...(d.c || {}) },
      toolsUsed: Array.isArray(d.toolsUsed) ? d.toolsUsed : [],
      rooms: Array.isArray(d.rooms) ? d.rooms : [],
      skins: Array.isArray(d.skins) ? d.skins : [],
    };
  }

  save() {
    try {
      localStorage.setItem('ai-progress', JSON.stringify(this.data));
    } catch {
      /* storage unavailable */
    }
    this.dirty = false;
  }

  resetAll() {
    this.data = { xp: 0, badges: {}, c: { severed: 0, booms: 0, attached: 0, properAttaches: 0, knockdowns: 0 }, toolsUsed: [], rooms: [], skins: [] };
    this.save();
    this.renderHud();
  }

  /* ------------------------------ levels ------------------------------ */

  levelInfo(xp = this.data.xp) {
    let level = 1;
    let rest = xp;
    while (rest >= need(level)) {
      rest -= need(level);
      level++;
    }
    return { level, into: rest, need: need(level), rank: rankFor(level) };
  }

  addXp(amount, pos = null, label = null, { combo = true } = {}) {
    if (this.game.title?.active || amount <= 0) return;
    const now = performance.now();
    let mult = 1;
    if (combo) {
      this.combo = now < this.comboUntil ? this.combo + 1 : 1;
      this.comboUntil = now + 2500;
      mult = 1 + Math.min(4, Math.floor(this.combo / 5));
      if (mult >= 5) this.unlock('combo_king');
    }
    const gained = Math.round(amount * mult);
    // Run score for the leaderboard: action points only (not first-time or badge bonuses).
    if (combo && this.run && !this.run.ended) this.run.score += gained;
    const before = this.levelInfo().level;
    this.data.xp += gained;
    this.dirty = true;
    const after = this.levelInfo();
    this.popup(gained, pos, label, mult);
    if (after.level > before) this.levelUp(after);
    this.renderHud();
  }

  levelUp(info) {
    this.game.sfx.jingle?.('level');
    const chest = this.game.mannequin.byName?.chest;
    if (chest?.alive) {
      const t = chest.body.translation();
      this.game.fx.burst(new THREE.Vector3(t.x, t.y + 0.8, t.z), { count: 40, colors: [0xffd27a, 0xff7a3d, 0xffffff, 0x7dff9b], speed: 4, size: 0.03, life: 1.6, glow: true });
    }
    this.toast({ icon: '⭐', title: `Level ${info.level}`, text: info.rank, kind: 'level' });
  }

  /* ------------------------------ leaderboard runs ------------------------------ */

  /** A run is one mannequin: it starts when a fresh one is built. */
  startRun() {
    this.run = { score: 0, room: this.game.roomId, ended: false };
  }

  /**
   * Ends the current run exactly once: at full teardown (every joint broken) or
   * when the mannequin is replaced (new mannequin / room change), whichever first.
   * Only runs in the default room with a score are reported.
   */
  endRun(reason) {
    const run = this.run;
    if (!run || run.ended) return;
    run.ended = true;
    run.reason = reason;
    if (run.room === LEADERBOARD_ROOM && run.score > 0) sendScoreToUsForge(run.score);
  }

  /* ------------------------------ badges ------------------------------ */

  has(id) {
    return !!this.data.badges[id];
  }

  unlock(id) {
    if (this.has(id) || !BADGES[id] || this.game.title?.active) return;
    this.data.badges[id] = Date.now();
    this.dirty = true;
    const [icon, name, desc] = BADGES[id];
    this.game.sfx.jingle?.('badge');
    this.toast({ icon, title: name, text: desc, kind: 'badge' });
    this.addXp(50, null, null, { combo: false });
  }

  goalOf(b) {
    const g = b[3]?.goal;
    if (g === 'tools') return this.game.tools.length;
    if (g === 'rooms') return Object.keys(ROOMS).length;
    if (g === 'skins') return Object.keys(SKINS).length;
    return g;
  }

  countOf(b) {
    const c = b[3]?.counter;
    if (!c) return 0;
    const v = this.data[c] ?? this.data.c[c];
    return Array.isArray(v) ? v.length : v || 0;
  }

  checkCounters() {
    for (const [id, b] of Object.entries(BADGES)) {
      if (b[3] && !this.has(id) && this.countOf(b) >= this.goalOf(b)) this.unlock(id);
    }
  }

  addToSet(key, value, bonus, label) {
    if (this.data[key].includes(value)) return;
    this.data[key].push(value);
    this.dirty = true;
    if (bonus) this.addXp(bonus, null, label, { combo: false });
    this.checkCounters();
  }

  /* ------------------------------ events ------------------------------ */

  ev(type, d = {}) {
    if (this.game.title?.active) {
      // Choices made before play still count (room, look, name), but no XP for the attract loop.
      if (!['room', 'skin', 'name'].includes(type)) return;
    }
    this.lastEvent = performance.now();
    const game = this.game;
    const m = game.mannequin;
    switch (type) {
      case 'hurt': {
        this.addXp(Math.max(1, Math.round(d.amount * 12)), d.point);
        break;
      }
      case 'sever': {
        const j = d.j;
        this.data.c.severed++;
        this.addXp(10, d.pos);
        this.unlock('first_snap');
        if (j.kind === 'body' && (j.a.partName === 'head' || j.b.partName === 'head')) this.unlock('heads_roll');
        if (game.timeScale < 1) this.unlock('slowmo');
        if (game.roomId === 'space') this.unlock('zero_g');
        const now = performance.now();
        this.severTimes = this.severTimes.filter((t) => now - t < 2000);
        this.severTimes.push(now);
        if (this.severTimes.length >= 5) this.unlock('speed_demon');
        // Body-wide checks once the dust settles this frame.
        game.later(0, () => this.checkBody());
        this.checkCounters();
        break;
      }
      case 'attach': {
        this.data.c.attached++;
        if (d.proper) {
          this.data.c.properAttaches++;
          this.addXp(25, d.point, 'Fixed!');
          this.unlock('good_as_new');
        } else {
          this.addXp(15, d.point, 'Creative!');
          this.unlock('potato');
          if (d.c.from.partName === 'head') this.unlock('wrong_way');
          let custom = 0;
          for (const j of game.joints.list) if (j.kind === 'body' && j.name === 'custom') custom++;
          if (custom >= 3) this.unlock('frankenstein');
        }
        this.checkCounters();
        break;
      }
      case 'boom':
        this.data.c.booms++;
        this.addXp(5, d.pos);
        this.unlock('kaboom');
        this.checkCounters();
        break;
      case 'knockdown':
        this.data.c.knockdowns++;
        this.addXp(8, d.pos, 'Down!');
        this.checkCounters();
        break;
      case 'tool':
        this.addToSet('toolsUsed', d.id, 20, 'New tool!');
        break;
      case 'room':
        this.addToSet('rooms', d.id, 20, 'New room!');
        break;
      case 'skin':
        this.addToSet('skins', d.id, 10, 'New look!');
        break;
      case 'name':
        if (m.name && m.name !== 'Dummy') this.unlock('name_giver');
        break;
      case 'flat':
        this.addXp(15, d.pos, 'Pancake!');
        this.unlock('pancake');
        break;
      case 'shred':
        this.addXp(10, d.pos, 'Shredded!');
        this.unlock('wood_chips');
        break;
      case 'arrow':
        this.addXp(d.part === 'head' ? 20 : 5, d.pos, d.part === 'head' ? 'Headshot!' : null);
        if (d.part === 'head') this.unlock('bullseye');
        break;
      case 'glue':
        if (d.toStatic && d.toPart) this.unlock('glued');
        break;
    }
    this.dirty = true;
  }

  checkBody() {
    const m = this.game.mannequin;
    const by = m.byName;
    if (!by?.chest?.alive) return;
    const torso = m.graph(by.chest).set;
    const hips = by.pelvis?.alive ? m.graph(by.pelvis).set : new Set();
    if (!torso.has(by.upperArmL) && !torso.has(by.upperArmR)) this.unlock('disarmed');
    if (!hips.has(by.thighL) && !hips.has(by.thighR)) this.unlock('legless');
    let intact = 0;
    for (const j of this.game.joints.list) if (j.kind === 'body') intact++;
    if (intact === 0) {
      this.unlock('teardown');
      this.endRun('teardown');
    }
  }

  /** Per frame: polled badges, popups, autosave. */
  update() {
    const game = this.game;
    if (game.title?.active) return;
    const now = performance.now();
    const life = game.life;
    if (life && life.mode !== this.lastMode) {
      this.lastMode = life.mode;
      if (life.mode === 'flee') this.unlock('run_away');
      if (life.mode === 'cower') this.unlock('cornered');
    }
    if (!this.has('liftoff')) {
      for (const e of game.mannequin.parts) if (e.alive && e.body.translation().y > 12) this.unlock('liftoff');
    }
    if (now - this.lastEvent > 60000 && !game.activeTool) this.unlock('zen');
    if (this.combo && now > this.comboUntil) {
      this.combo = 0;
      this.renderCombo(1);
    }
    this.flushPopups();
    if (this.dirty && now > this.saveAt) {
      this.save();
      this.saveAt = now + 2000;
    }
  }

  /* ------------------------------ UI ------------------------------ */

  mountUi(ui) {
    this.ui = ui;
    const chip = document.createElement('button');
    chip.className = 'pill lvl-chip';
    chip.title = 'Your rank and badges';
    chip.onclick = () => this.openPanel();
    (ui.hudSlot || ui.root.querySelector('.topbar')).append(chip);
    this.chip = chip;
    this.comboEl = document.createElement('div');
    this.comboEl.className = 'combo';
    ui.root.append(this.comboEl);
    this.toastsEl = document.createElement('div');
    this.toastsEl.className = 'toasts';
    ui.root.append(this.toastsEl);
    this.popLayer = document.createElement('div');
    this.popLayer.className = 'xp-layer';
    ui.root.append(this.popLayer);
    this.panel = document.createElement('div');
    this.panel.className = 'profile hidden';
    this.panel.onclick = (e) => {
      if (e.target === this.panel || e.target.closest('.p-close')) this.panel.classList.add('hidden');
      if (e.target.closest('.p-reset') && confirm('Reset all XP and badges? This cannot be undone.')) {
        this.resetAll();
        this.openPanel();
      }
    };
    ui.root.append(this.panel);
    // Count the room and look you started with.
    for (const [key, v] of [['rooms', this.game.roomId], ['skins', this.game.mannequin.skinId]]) {
      if (v && !this.data[key].includes(v)) this.data[key].push(v);
    }
    this.renderHud();
  }

  renderHud() {
    if (!this.chip) return;
    const info = this.levelInfo();
    const pct = Math.round((info.into / info.need) * 100);
    const got = Object.keys(this.data.badges).length;
    this.chip.innerHTML = `<span class="lvl">${info.level}</span><span class="lvl-text"><b>${info.rank}</b><span class="xpbar"><i style="width:${pct}%"></i></span></span><span class="lvl-badges">🏅${got}</span>`;
  }

  renderCombo(mult) {
    if (!this.comboEl) return;
    if (mult < 2) {
      this.comboEl.classList.remove('show');
      return;
    }
    this.comboEl.textContent = `COMBO ×${mult}`;
    this.comboEl.classList.remove('show', 'bump');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('show', 'bump');
  }

  popup(xp, pos, label, mult) {
    if (mult >= 2) this.renderCombo(mult);
    // Merge rapid-fire popups (katana, saw) into one.
    const key = label || 'xp';
    const p = this.pending.get(key) || { xp: 0, pos: null, label, at: performance.now() };
    p.xp += xp;
    if (pos) p.pos = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z);
    this.pending.set(key, p);
  }

  flushPopups() {
    if (!this.popLayer) return;
    const now = performance.now();
    for (const [key, p] of this.pending) {
      if (now - p.at < 120) continue;
      this.pending.delete(key);
      const game = this.game;
      let pos = p.pos;
      if (!pos) {
        const c = game.mannequin.byName?.chest;
        if (!c?.alive) continue;
        const t = c.body.translation();
        pos = new THREE.Vector3(t.x, t.y + 0.5, t.z);
      }
      const v = pos.clone().project(game.camera);
      if (v.z > 1) continue;
      const r = game.renderer.domElement.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'xp-pop' + (p.label ? ' big' : '');
      el.textContent = p.label ? `${p.label} +${p.xp}` : `+${p.xp}`;
      el.style.left = `${((v.x + 1) / 2) * r.width + (Math.random() - 0.5) * 30}px`;
      el.style.top = `${((1 - v.y) / 2) * r.height}px`;
      this.popLayer.append(el);
      setTimeout(() => el.remove(), 1200);
      while (this.popLayer.children.length > 24) this.popLayer.firstChild.remove();
    }
  }

  toast(t) {
    this.toastQueue.push(t);
    if (!this.toasting) this.nextToast();
  }

  nextToast() {
    const t = this.toastQueue.shift();
    if (!t || !this.toastsEl) {
      this.toasting = false;
      return;
    }
    this.toasting = true;
    const el = document.createElement('div');
    el.className = `toast toast-${t.kind}`;
    el.innerHTML = `<span class="t-icon">${t.icon}</span><span class="t-body"><small>${t.kind === 'level' ? 'Level up!' : 'Badge unlocked'}</small><b></b><span></span></span>`;
    el.querySelector('b').textContent = t.title;
    el.querySelector('.t-body > span').textContent = t.text;
    this.toastsEl.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => {
      el.remove();
      this.nextToast();
    }, 3000);
  }

  openPanel() {
    this.save();
    const info = this.levelInfo();
    const d = this.data;
    const got = Object.keys(d.badges).length;
    const total = Object.keys(BADGES).length;
    const next = RANKS.find(([l]) => l > info.level);
    const badges = Object.entries(BADGES)
      .map(([id, b]) => {
        const has = this.has(id);
        const goal = this.goalOf(b);
        const count = Math.min(this.countOf(b), goal || 0);
        const bar = goal && !has ? `<span class="b-prog"><i style="width:${Math.round((count / goal) * 100)}%"></i></span><small>${count} / ${goal}</small>` : '';
        return `<div class="badge${has ? ' got' : ''}" title="${b[2]}"><span class="b-icon">${b[0]}</span><b>${b[1]}</b><span class="b-desc">${b[2]}</span>${bar}</div>`;
      })
      .join('');
    this.panel.innerHTML = `
      <div class="card">
        <button class="icon p-close" aria-label="Close">✕</button>
        <div class="p-head">
          <div class="p-level">${info.level}</div>
          <div>
            <div class="p-rank">${info.rank}</div>
            <div class="p-xp">${d.xp.toLocaleString()} XP total · ${info.into} / ${info.need} to level ${info.level + 1}</div>
            <div class="xpbar big"><i style="width:${Math.round((info.into / info.need) * 100)}%"></i></div>
            ${next ? `<div class="p-next">Next rank: <b>${next[1]}</b> at level ${next[0]}</div>` : ''}
          </div>
        </div>
        <div class="p-stats">
          <span><b>${d.c.severed.toLocaleString()}</b> joints broken</span>
          <span><b>${d.c.booms.toLocaleString()}</b> explosions</span>
          <span><b>${d.c.properAttaches + 0}</b> repairs</span>
          <span><b>${d.c.knockdowns}</b> knockdowns</span>
        </div>
        <div class="p-title">Badges <span>${got} / ${total}</span></div>
        <div class="badges">${badges}</div>
        <p class="p-note">Just for bragging rights. Everything in the game is available from the start.</p>
        <button class="pill p-reset">Reset progress</button>
      </div>`;
    this.panel.classList.remove('hidden');
  }
}
