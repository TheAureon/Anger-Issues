import { CATEGORIES } from './tools/index.js';
import { ROOMS } from './rooms.js';
import { SKINS } from './mannequin.js';
import { STIFFNESS } from './joints.js';
import { GORE_MODES } from './gore.js';

const NAMES = ['Gerald', 'Woody', 'Splinter', 'Kevin', 'Sir Oakley', 'Plank', 'Pinecone', 'Barry', 'Timber', 'Clive', 'Norbert', 'Knot', 'Dougie', 'Mr. Hinges', 'Twiggy', 'Steve'];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export class UI {
  constructor(game) {
    this.game = game;
    game.ui = this;
    const root = el('div', 'ui');
    game.container.appendChild(root);
    this.root = root;

    // Top bar
    const top = el('div', 'topbar');
    top.append(el('div', 'brand', 'Anger&nbsp;Issues'));
    const left = el('div', 'group');
    this.roomBtn = el('button', 'pill');
    this.roomBtn.onclick = () => this.openMenu('room');
    this.skinBtn = el('button', 'pill');
    this.skinBtn.onclick = () => this.openMenu('skin');
    this.nameBtn = el('button', 'pill name-pill');
    this.nameBtn.title = 'Name the mannequin';
    this.nameBtn.onclick = () => this.openNamer();
    left.append(this.nameBtn, this.roomBtn, this.skinBtn);
    top.append(left);
    const actions = el('div', 'group actions');
    const btn = (icon, title, fn) => {
      const b = el('button', 'icon', icon);
      b.title = title;
      b.setAttribute('aria-label', title);
      b.onclick = fn;
      actions.append(b);
      return b;
    };
    btn('↺', 'New mannequin (X)', () => game.resetMannequin());
    btn('🧹', 'Clear props & machines (C)', () => game.clearProps());
    this.slowBtn = btn('🐢', 'Slow motion (T)', () => game.toggleSlowmo());
    this.stiffBtn = btn('🦴', 'Joint stiffness', () => this.cycleStiffness());
    this.goreBtn = btn('🩸', 'Gore: off / cartoon / slime / rainbow', () => {
      const m = game.gore.cycle();
      this.flashWord(m.label, true);
      this.update();
    });
    this.soundBtn = btn('🔊', 'Sound on/off', () => {
      game.sfx.setEnabled(!game.sfx.enabled);
      this.update();
    });
    btn('?', 'Help (H)', () => this.toggleHelp());
    top.append(actions);
    root.append(top);

    // Menus
    this.menu = el('div', 'menu hidden');
    root.append(this.menu);

    // Name tag floating over the head, and the rename dialog.
    this.nametag = el('button', 'nametag hidden');
    this.nametag.title = 'Click to rename';
    this.nametag.onclick = () => this.openNamer();
    root.append(this.nametag);
    this.namer = el(
      'div',
      'namer hidden',
      `<form class="card">
        <label for="ai-name-input">Name your mannequin</label>
        <div class="row">
          <input id="ai-name-input" maxlength="20" autocomplete="off" spellcheck="false" placeholder="e.g. Gerald" />
          <button type="button" class="icon dice" title="Random name" aria-label="Random name">🎲</button>
        </div>
        <div class="row end">
          <button type="button" class="pill cancel">Cancel</button>
          <button type="submit" class="pill go">Save</button>
        </div>
      </form>`,
    );
    this.nameInput = this.namer.querySelector('input');
    this.namer.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      this.saveName();
    };
    this.namer.querySelector('.cancel').onclick = () => this.closeNamer();
    this.namer.querySelector('.dice').onclick = () => {
      this.nameInput.value = NAMES[(Math.random() * NAMES.length) | 0];
      this.nameInput.focus();
    };
    this.namer.onclick = (e) => {
      if (e.target === this.namer) this.closeNamer();
    };
    this.nameInput.onkeydown = (e) => {
      if (e.key === 'Escape') this.closeNamer();
      e.stopPropagation();
    };
    root.append(this.namer);
    document.addEventListener('pointerdown', (e) => {
      if (!this.menu.contains(e.target) && e.target !== this.roomBtn && e.target !== this.skinBtn) this.menu.classList.add('hidden');
    });

    // Word pop
    this.word = el('div', 'word');
    root.append(this.word);

    // Hold controls (rotate held piece; mostly for touch)
    this.hold = el('div', 'hold hidden');
    const r1 = el('button', 'icon', '⟳');
    r1.title = 'Roll held piece (R)';
    r1.onpointerdown = (e) => {
      e.stopPropagation();
      game.grabber.rotate('roll');
    };
    const r2 = el('button', 'icon', '⇆');
    r2.title = 'Turn held piece (F)';
    r2.onpointerdown = (e) => {
      e.stopPropagation();
      game.grabber.rotate('turn');
    };
    this.hold.append(r1, r2);
    root.append(this.hold);

    // Toolbox
    const box = el('div', 'toolbox');
    this.hint = el('div', 'hint');
    this.cats = el('div', 'cats');
    this.toolRow = el('div', 'tools');
    box.append(this.hint, this.toolRow, this.cats);
    root.append(box);
    this.cat = 'hand';
    this.catBtns = {};
    for (const c of CATEGORIES) {
      const b = el('button', 'cat', `<span>${c.icon}</span><small>${c.name}</small>`);
      b.onclick = () => {
        this.cat = c.id;
        const first = game.tools.find((t) => t.cat === c.id);
        if (first && game.tool.cat !== c.id) game.setTool(first);
        this.update();
      };
      this.catBtns[c.id] = b;
      this.cats.append(b);
    }

    // Help
    this.help = el(
      'div',
      'help hidden',
      `<div class="card">
        <h2>Anger Issues</h2>
        <p>Vent on the mannequin. It walks around on its own and it's scared of you. Fair enough. Wreck it, then rebuild it any way you like. Nothing to unlock, no timer, no fail state.</p>
        <ul>
          <li><b>Name it</b> with the 🏷️ button (or click its name tag).</li>
          <li><b>Pick a tool</b> from the toolbox at the bottom and use it on the mannequin.</li>
          <li><b>Grab</b> (✋, or hold <kbd>Shift</kbd> with any tool) drags and flings pieces.</li>
          <li><b>Rebuild:</b> drag a loose piece onto the body. When the green ring shows, let go and it sticks there. Rotate it first with <kbd>R</kbd> / <kbd>F</kbd> (or the ⟳ ⇆ buttons) to put a head on backwards.</li>
          <li><b>Camera:</b> drag empty space or right-drag to orbit, scroll to zoom. On touch: two fingers to zoom/pan.</li>
          <li><kbd>X</kbd> new mannequin · <kbd>C</kbd> clear props · <kbd>T</kbd> slow-mo · <kbd>Esc</kbd> grab tool</li>
        </ul>
        <button class="pill go">Let's go</button>
      </div>`,
    );
    this.help.onclick = (e) => {
      if (e.target === this.help || e.target.classList.contains('go')) this.toggleHelp(false);
    };
    root.append(this.help);
    let seen = false;
    try {
      seen = localStorage.getItem('ai-help-seen') === '1';
    } catch {
      /* storage unavailable */
    }
    if (!seen) this.toggleHelp(true);

    this.update();
  }

  openNamer() {
    this.menu.classList.add('hidden');
    this.nameInput.value = this.game.mannequin.name;
    this.namer.classList.remove('hidden');
    this.nameInput.focus();
    this.nameInput.select();
  }

  closeNamer() {
    this.namer.classList.add('hidden');
    this.nameInput.blur();
  }

  saveName() {
    const m = this.game.mannequin;
    const before = m.name;
    m.setName(this.nameInput.value);
    this.closeNamer();
    if (m.name && m.name !== before) this.flashWord(`Hi, ${m.name}!`, true);
    this.update();
  }

  /** Per frame: keep the name tag over the head. */
  tick() {
    const game = this.game;
    const head = game.mannequin.byName?.head;
    const tag = this.nametag;
    if (!head?.alive || !game.mannequin.name) {
      tag.classList.add('hidden');
      return;
    }
    const t = head.body.translation();
    const v = this._v || (this._v = game.camera.position.clone());
    v.set(t.x, t.y + 0.27, t.z).project(game.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
      tag.classList.add('hidden');
      return;
    }
    tag.classList.remove('hidden');
    const r = game.renderer.domElement.getBoundingClientRect();
    tag.style.transform = `translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
  }

  toggleHelp(force) {
    const show = force ?? this.help.classList.contains('hidden');
    this.help.classList.toggle('hidden', !show);
    if (!show) {
      try {
        localStorage.setItem('ai-help-seen', '1');
      } catch {
        /* storage unavailable */
      }
    }
  }

  openMenu(kind) {
    const m = this.menu;
    const game = this.game;
    if (!m.classList.contains('hidden') && m.dataset.kind === kind) {
      m.classList.add('hidden');
      return;
    }
    m.dataset.kind = kind;
    m.innerHTML = '';
    const entries = kind === 'room' ? ROOMS : SKINS;
    const current = kind === 'room' ? game.roomId : game.mannequin.skinId;
    for (const [id, def] of Object.entries(entries)) {
      const b = el('button', 'item' + (id === current ? ' on' : ''), `<span>${def.icon}</span> ${def.name}`);
      b.onclick = () => {
        if (kind === 'room') game.setRoom(id);
        else game.mannequin.setSkin(id);
        m.classList.add('hidden');
        this.update();
      };
      m.append(b);
    }
    const anchor = kind === 'room' ? this.roomBtn : this.skinBtn;
    const r = anchor.getBoundingClientRect();
    m.style.left = r.left + 'px';
    m.style.top = r.bottom + 6 + 'px';
    m.classList.remove('hidden');
  }

  cycleStiffness() {
    const ids = Object.keys(STIFFNESS);
    const i = ids.indexOf(this.game.joints.stiffnessId);
    this.game.joints.setStiffness(ids[(i + 1) % ids.length]);
    this.flashWord(STIFFNESS[this.game.joints.stiffnessId].label + ' joints', true);
    this.update();
  }

  showHold(on) {
    this.hold.classList.toggle('hidden', !on);
  }

  flashWord(text, info = false) {
    if (!info && Math.random() > 0.5) return;
    const w = this.word;
    w.textContent = text;
    w.classList.toggle('info', info);
    w.style.setProperty('--rot', `${(Math.random() - 0.5) * 16}deg`);
    w.classList.remove('pop');
    void w.offsetWidth;
    w.classList.add('pop');
  }

  update() {
    const game = this.game;
    const room = ROOMS[game.roomId];
    this.nameBtn.textContent = `🏷️ ${game.mannequin.name || 'Name me'}`;
    this.nametag.textContent = game.mannequin.name;
    if (room) this.roomBtn.innerHTML = `${room.icon} ${room.name} ▾`;
    const skin = SKINS[game.mannequin.skinId];
    this.skinBtn.innerHTML = `${skin.icon} ${skin.name} ▾`;
    this.slowBtn.classList.toggle('on', game.timeScale < 1);
    this.soundBtn.textContent = game.sfx.enabled ? '🔊' : '🔇';
    this.goreBtn.textContent = GORE_MODES[game.gore.mode].icon;
    this.goreBtn.title = `${GORE_MODES[game.gore.mode].label} (click to change)`;
    this.stiffBtn.title = `Joints: ${STIFFNESS[game.joints.stiffnessId].label} (click to change)`;
    this.stiffBtn.classList.toggle('on', game.joints.stiffnessId !== 'stiff');
    this.cat = game.tool.cat;
    for (const [id, b] of Object.entries(this.catBtns)) b.classList.toggle('on', id === this.cat);
    this.toolRow.innerHTML = '';
    for (const t of game.tools.filter((x) => x.cat === this.cat)) {
      const b = el('button', 'tool' + (t === game.tool ? ' on' : ''), `<span>${t.icon}</span><small>${t.name}</small>`);
      b.onclick = () => game.setTool(t);
      this.toolRow.append(b);
    }
    this.hint.textContent = game.tool.hint;
  }
}
