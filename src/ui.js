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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class UI {
  constructor(game) {
    this.game = game;
    game.ui = this;
    const root = el('div', 'ui');
    game.container.appendChild(root);
    this.root = root;

    /* ------------------------------ top bar ------------------------------ */
    const top = el('div', 'topbar');
    const left = el('div', 'hud-left');
    left.append(el('div', 'brand-mark', '<span>ANGER</span><span>ISSUES</span>'));
    this.hudSlot = el('div', 'hud-slot'); // the level chip (progress.js) goes here
    left.append(this.hudSlot);
    const right = el('div', 'hud-right');
    const action = (icon, label, key, fn, cls = '') => {
      const b = el('button', `hud-btn ${cls}`, `<span class="ic">${icon}</span>`);
      b.dataset.tip = key ? `${label}  ·  ${key}` : label;
      b.setAttribute('aria-label', label);
      b.onclick = fn;
      right.append(b);
      return b;
    };
    action('↺', 'New mannequin', 'X', () => game.resetMannequin());
    action('🧹', 'Clear props & machines', 'C', () => game.clearProps());
    this.slowBtn = action('🐢', 'Slow motion', 'T', () => game.toggleSlowmo());
    this.settingsBtn = action('⚙️', 'Settings', '', () => this.toggleSettings(), 'primary');
    top.append(left, right);
    root.append(top);

    /* ------------------------------ settings ------------------------------ */
    this.settings = el('div', 'sheet-wrap hidden');
    this.settings.innerHTML = `
      <aside class="sheet" role="dialog" aria-label="Settings">
        <header class="sheet-head">
          <h2>Settings</h2>
          <button class="hud-btn sheet-close" aria-label="Close settings"><span class="ic">✕</span></button>
        </header>
        <div class="sheet-body">
          <section>
            <h3>Mannequin</h3>
            <div class="field">
              <input id="ai-name-input" class="name-input" maxlength="20" autocomplete="off" spellcheck="false" placeholder="Give it a name" aria-label="Mannequin name" />
              <button type="button" class="soft-btn dice" title="Random name" aria-label="Random name">🎲</button>
            </div>
            <div class="chips skins"></div>
          </section>
          <section>
            <h3>Room</h3>
            <div class="rooms-grid"></div>
          </section>
          <section>
            <h3>Gore</h3>
            <div class="seg gore"></div>
          </section>
          <section>
            <h3>Joints</h3>
            <div class="seg joints"></div>
          </section>
          <section>
            <h3>Audio</h3>
            <label class="switch-row"><span>🎵 Music</span><input type="checkbox" class="sw music" /><i></i></label>
            <label class="switch-row"><span>🔊 Sound effects</span><input type="checkbox" class="sw sound" /><i></i></label>
          </section>
          <section class="sheet-links">
            <button class="soft-btn wide open-profile">🏅 Rank &amp; badges</button>
            <button class="soft-btn wide open-help">❔ How to play &amp; controls</button>
          </section>
        </div>
      </aside>`;
    root.append(this.settings);
    const S = this.settings;
    S.onclick = (e) => {
      if (e.target === S || e.target.closest('.sheet-close')) this.toggleSettings(false);
    };
    this.nameInput = S.querySelector('.name-input');
    this.nameInput.oninput = () => {
      game.mannequin.setName(this.nameInput.value);
      this.nametag.textContent = game.mannequin.name;
    };
    this.nameInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') this.nameInput.blur();
    };
    this.nameInput.onchange = () => {
      if (game.mannequin.name) this.flashWord(`Hi, ${game.mannequin.name}!`, true);
    };
    S.querySelector('.dice').onclick = () => {
      this.nameInput.value = NAMES[(Math.random() * NAMES.length) | 0];
      this.nameInput.oninput();
      this.nameInput.onchange();
    };
    S.querySelector('.sw.music').onchange = (e) => {
      game.sfx.unlock();
      game.music.setEnabled(e.target.checked);
    };
    S.querySelector('.sw.sound').onchange = (e) => {
      game.sfx.unlock();
      game.sfx.setEnabled(e.target.checked);
    };
    S.querySelector('.open-profile').onclick = () => {
      this.toggleSettings(false);
      game.progress?.openPanel();
    };
    S.querySelector('.open-help').onclick = () => {
      this.toggleSettings(false);
      this.toggleHelp(true);
    };

    /* ------------------------------ in-world ------------------------------ */
    this.nametag = el('button', 'nametag hidden');
    this.nametag.title = 'Rename';
    this.nametag.onclick = () => this.openNamer();
    root.append(this.nametag);

    this.word = el('div', 'word');
    root.append(this.word);

    this.hold = el('div', 'hold hidden');
    const holdBtn = (icon, label, kind) => {
      const b = el('button', 'hud-btn big', `<span class="ic">${icon}</span><small>${label}</small>`);
      b.onpointerdown = (e) => {
        e.stopPropagation();
        game.grabber.rotate(kind);
      };
      this.hold.append(b);
    };
    holdBtn('⟳', 'Roll · R', 'roll');
    holdBtn('⇆', 'Turn · F', 'turn');
    root.append(this.hold);

    /* ------------------------------ tool dock ------------------------------ */
    const dock = el('div', 'dock');
    this.caption = el('div', 'dock-caption');
    this.toolRow = el('div', 'dock-tools');
    this.cats = el('div', 'dock-cats');
    this.catInk = el('span', 'cat-ink');
    this.cats.append(this.catInk);
    dock.append(this.caption, this.toolRow, this.cats);
    root.append(dock);
    this.dock = dock;
    this.catBtns = {};
    for (const c of CATEGORIES) {
      const b = el('button', 'cat', `<span class="ic">${c.icon}</span><small>${c.name}</small>`);
      b.onclick = () => {
        const first = game.tools.find((t) => t.cat === c.id);
        if (first && game.tool.cat !== c.id) game.setTool(first);
        this.update();
      };
      this.catBtns[c.id] = b;
      this.cats.append(b);
    }
    window.addEventListener('resize', () => this.placeInk());

    /* ------------------------------ help ------------------------------ */
    const k = (s) => s.split(' ').map((x) => `<kbd>${x}</kbd>`).join('');
    this.help = el(
      'div',
      'help hidden',
      `<div class="card">
        <div class="help-head">
          <div class="brand-mark big"><span>ANGER</span><span>ISSUES</span></div>
          <p>It walks around on its own, and it's scared of you. Fair enough. Wreck it, then rebuild it any way you like. Nothing to unlock, no timer, no fail state.</p>
        </div>
        <div class="help-grid">
          <div><span class="hi">🧰</span><b>Use a tool</b><p>Pick one from the dock at the bottom (or ${k('1')}–${k('9')}) and click or tap the mannequin.</p></div>
          <div><span class="hi">✋</span><b>Grab &amp; fling</b><p>The Grab tool, or hold ${k('Shift')} with any tool.</p></div>
          <div><span class="hi">🧩</span><b>Rebuild</b><p>Drag a loose piece onto the body. Let go when the green ring shows. ${k('R')} ${k('F')} rotate it first.</p></div>
          <div><span class="hi">🎥</span><b>Camera</b><p>${k('W A S D')} move, ${k('Q')} ${k('E')} out / in. Drag empty space to orbit, scroll to zoom. Touch: two fingers.</p></div>
          <div><span class="hi">⚡</span><b>Shortcuts</b><p>${k('X')} new mannequin · ${k('C')} clear · ${k('T')} slow-mo · ${k('Esc')} grab</p></div>
          <div><span class="hi">⚙️</span><b>Settings</b><p>Name it, change room or look, gore, joints and audio.</p></div>
        </div>
        <button class="cta go">Let's go</button>
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
    this.helpSeen = seen;

    // Number keys pick a tool in the current category; Esc closes panels.
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || game.title?.active) return;
      if (e.key === 'Escape') {
        this.toggleSettings(false);
        this.toggleHelp(false);
        game.progress?.panel?.classList.add('hidden');
      }
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = game.tools.filter((x) => x.cat === game.tool.cat)[Number(e.key) - 1];
        if (t) game.setTool(t);
      }
    });

    this.update();
  }

  /* ------------------------------ settings ------------------------------ */

  toggleSettings(force) {
    const show = force ?? this.settings.classList.contains('hidden');
    if (show) this.renderSettings();
    this.settings.classList.toggle('hidden', !show);
    this.settingsBtn.classList.toggle('on', show);
  }

  renderSettings() {
    const game = this.game;
    const S = this.settings;
    if (document.activeElement !== this.nameInput) this.nameInput.value = game.mannequin.name;
    const opts = (box, entries, current, pick, cls) => {
      box.innerHTML = '';
      for (const [id, d] of Object.entries(entries)) {
        const b = el('button', `${cls}${id === current ? ' on' : ''}`, `<span class="ic">${d.icon ?? ''}</span><span>${esc(d.name)}</span>`);
        b.onclick = () => {
          game.sfx.click();
          pick(id);
          this.renderSettings();
          this.update();
        };
        box.append(b);
      }
    };
    opts(S.querySelector('.skins'), SKINS, game.mannequin.skinId, (id) => game.mannequin.setSkin(id), 'chip');
    opts(S.querySelector('.rooms-grid'), ROOMS, game.roomId, (id) => game.setRoom(id), 'room-card');
    const gore = Object.fromEntries(Object.entries(GORE_MODES).map(([id, m]) => [id, { icon: m.icon, name: id === 'off' ? 'Off' : id === 'ketchup' ? 'Cartoon' : m.label.replace(/ gore$/, '') }]));
    opts(S.querySelector('.gore'), gore, game.gore.mode, (id) => game.gore.setMode(id), 'seg-btn');
    const joints = Object.fromEntries(Object.entries(STIFFNESS).map(([id, s]) => [id, { icon: { stiff: '🪵', loose: '🧦', ragdoll: '🫠' }[id], name: s.label }]));
    opts(S.querySelector('.joints'), joints, game.joints.stiffnessId, (id) => game.joints.setStiffness(id), 'seg-btn');
    S.querySelector('.sw.music').checked = !!game.music?.enabled;
    S.querySelector('.sw.sound').checked = game.sfx.enabled;
  }

  openNamer() {
    this.toggleSettings(true);
    this.nameInput.focus();
    this.nameInput.select();
  }

  /* ------------------------------ per frame ------------------------------ */

  /** Keep the name tag over the head. */
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

  /** Called when the title screen hands over: first-timers get the help card. */
  afterTitle() {
    this.update();
    if (!this.helpSeen) this.toggleHelp(true);
  }

  toggleHelp(force) {
    const show = force ?? this.help.classList.contains('hidden');
    this.help.classList.toggle('hidden', !show);
    if (!show) {
      this.helpSeen = true;
      try {
        localStorage.setItem('ai-help-seen', '1');
      } catch {
        /* storage unavailable */
      }
    }
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

  /** Full-screen white flash (the mini nuke). */
  whiteout() {
    const w = el('div', 'whiteout');
    this.root.append(w);
    setTimeout(() => w.remove(), 1600);
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

  /** Slide the category underline under the active tab. */
  placeInk() {
    const b = this.catBtns[this.game.tool.cat];
    if (!b) return;
    this.catInk.style.width = `${b.offsetWidth - 16}px`;
    this.catInk.style.transform = `translateX(${b.offsetLeft + 8}px)`;
    // Keep the active tab in view on narrow screens.
    const c = this.cats;
    if (b.offsetLeft < c.scrollLeft || b.offsetLeft + b.offsetWidth > c.scrollLeft + c.clientWidth) {
      c.scrollTo({ left: b.offsetLeft - c.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' });
    }
  }

  update() {
    const game = this.game;
    this.nametag.textContent = game.mannequin.name;
    this.slowBtn.classList.toggle('on', game.timeScale < 1);
    const cat = game.tool.cat;
    for (const [id, b] of Object.entries(this.catBtns)) b.classList.toggle('on', id === cat);
    this.toolRow.innerHTML = '';
    game.tools
      .filter((x) => x.cat === cat)
      .forEach((t, i) => {
        const b = el('button', 'tile' + (t === game.tool ? ' on' : ''), `<span class="tile-ic">${t.icon}</span><small>${t.name}</small><kbd class="num">${i + 1}</kbd>`);
        b.setAttribute('aria-label', t.name);
        b.onclick = () => game.setTool(t);
        this.toolRow.append(b);
      });
    this.caption.innerHTML = `<b>${game.tool.icon} ${game.tool.name}</b><span>${game.tool.hint}</span>`;
    requestAnimationFrame(() => this.placeInk());
    if (!this.settings.classList.contains('hidden')) this.renderSettings();
  }
}
