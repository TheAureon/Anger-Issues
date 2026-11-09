import * as THREE from 'three';
import { ROOMS } from './rooms.js';
import { SKINS } from './mannequin.js';
import { GORE_MODES } from './gore.js';

const NAMES = ['Gerald', 'Woody', 'Splinter', 'Kevin', 'Sir Oakley', 'Plank', 'Pinecone', 'Barry', 'Timber', 'Clive', 'Norbert', 'Knot', 'Dougie', 'Mr. Hinges', 'Twiggy', 'Steve'];
const TAGLINES = [
  'A sandbox for bad days.',
  'Wreck it. Rebuild it. Repeat.',
  "It's afraid of you. Fair enough.",
  'Cheaper than therapy.',
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Title screen over the live scene: the camera circles the mannequin as it
 * wanders around, and room / skin / gore picks apply live behind the menu.
 */
export class TitleScreen {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.active = true;
    this.angle = 0.6;
    this.t = 0;
    this.camTarget = new THREE.Vector3(0, 1, 0);
    game.title = this;
    game.controls.enabled = false;
    ui.root.classList.add('title-mode');

    const logo = (word, cls) =>
      `<span class="lw ${cls}">${[...word]
        .map((ch, i) => `<span class="ch" style="--r:${((i * 37) % 11) - 5}deg;--d:${i * 0.06}s">${ch}</span>`)
        .join('')}</span>`;
    const el = document.createElement('div');
    el.className = 'title';
    el.innerHTML = `
      <div class="title-vignette"></div>
      <div class="title-inner">
        <h1 class="logo" aria-label="Anger Issues">
          ${logo('ANGER', 'w1')}
          ${logo('ISSUES', 'w2')}
          <span class="vein" aria-hidden="true">💢</span>
        </h1>
        <p class="tagline">${TAGLINES[(Math.random() * TAGLINES.length) | 0]}</p>
        <div class="t-bottom">
          <div class="title-card">
            <label class="t-label" for="title-name">Your mannequin</label>
            <div class="t-name">
              <input id="title-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="Give it a name" />
              <button type="button" class="t-dice" title="Random name" aria-label="Random name">🎲</button>
            </div>
            <details class="t-more">
              <summary>Room, look &amp; gore</summary>
              <div class="t-label">Room</div>
              <div class="t-chips rooms"></div>
              <div class="t-label">Look</div>
              <div class="t-chips skins"></div>
              <div class="t-label">Gore</div>
              <div class="t-chips gore"></div>
            </details>
          </div>
          <button class="play" type="button"><span>Let it out</span></button>
          <button class="t-howto" type="button">How to play</button>
        </div>
      </div>
      <div class="title-foot">No ads · No timers · Nothing to unlock</div>`;
    ui.root.append(el);
    this.el = el;
    // Options start open on roomy screens, folded on phones so the mannequin stays visible.
    el.querySelector('.t-more').open = game.container.clientWidth > 700 && game.container.clientHeight > 600;

    this.nameInput = el.querySelector('#title-name');
    this.nameInput.value = game.mannequin.name;
    this.nameInput.oninput = () => {
      game.mannequin.setName(this.nameInput.value);
      ui.update();
    };
    this.nameInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.play();
    };
    el.querySelector('.t-dice').onclick = () => {
      const n = NAMES[(Math.random() * NAMES.length) | 0];
      this.nameInput.value = n;
      game.mannequin.setName(n);
      ui.update();
    };
    el.querySelector('.play').onclick = () => this.play();
    el.querySelector('.t-howto').onclick = () => ui.toggleHelp(true);
    this.renderChips();
  }

  renderChips() {
    const game = this.game;
    const chips = (sel, entries, current, onPick) => {
      const box = this.el.querySelector(sel);
      box.innerHTML = '';
      for (const [id, d] of Object.entries(entries)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 't-chip' + (id === current ? ' on' : '');
        b.innerHTML = `<span>${d.icon}</span>${esc(d.name || d.label)}`;
        b.onclick = () => {
          game.sfx.unlock();
          game.sfx.click();
          onPick(id);
          this.renderChips();
          this.ui.update();
        };
        box.append(b);
      }
    };
    chips('.rooms', ROOMS, game.roomId, (id) => game.setRoom(id));
    chips('.skins', SKINS, game.mannequin.skinId, (id) => game.mannequin.setSkin(id));
    const gore = Object.fromEntries(Object.entries(GORE_MODES).map(([id, m]) => [id, { icon: m.icon, name: m.label.replace(/ gore$/, '').replace('Gore off', 'Off') }]));
    chips('.gore', gore, game.gore.mode, (id) => game.gore.setMode(id));
  }

  /** Per frame while active: slow orbit around the wandering mannequin. */
  camera(dt) {
    if (!this.active) return;
    const game = this.game;
    this.t += dt;
    this.angle += dt * 0.12;
    const chest = game.mannequin.byName?.chest;
    if (chest?.alive) {
      const p = chest.body.translation();
      this.camTarget.lerp(new THREE.Vector3(p.x, Math.max(0.6, p.y - 0.2), p.z), Math.min(1, dt * 2));
    }
    const r = 3.6 + Math.sin(this.t * 0.2) * 0.4;
    const cam = game.camera;
    // On wide screens the menu sits on the left, so frame the mannequin right of centre.
    const wide = game.container.clientWidth > 900;
    const side = new THREE.Vector3(Math.cos(this.angle), 0, -Math.sin(this.angle)).multiplyScalar(wide ? -0.9 : 0);
    const look = this.camTarget.clone().add(side);
    cam.position.set(look.x + Math.sin(this.angle) * r, 1.55 + Math.sin(this.t * 0.3) * 0.15, look.z + Math.cos(this.angle) * r);
    cam.lookAt(look);
  }

  play() {
    if (!this.active) return;
    const game = this.game;
    const ui = this.ui;
    this.active = false;
    game.sfx.unlock();
    game.sfx.whoosh();
    game.mannequin.setName(this.nameInput.value);
    this.el.classList.add('leaving');
    ui.root.classList.remove('title-mode');
    ui.update();
    // Swoop the camera to the play view, then hand control back.
    const cam = game.camera;
    const from = cam.position.clone();
    const chest = game.mannequin.byName?.chest?.body.translation() || { x: 0, y: 1, z: 0 };
    const target = new THREE.Vector3(chest.x, 0.88, chest.z);
    const to = target.clone().add(new THREE.Vector3(0.55, 0.57, 2.8));
    const fromLook = this.camTarget.clone();
    let k = 0;
    this.swoop = (dt) => {
      k = Math.min(1, k + dt / 1.1);
      const e = 1 - Math.pow(1 - k, 3);
      cam.position.lerpVectors(from, to, e);
      const look = fromLook.clone().lerp(target, e);
      cam.lookAt(look);
      if (k >= 1) {
        this.swoop = null;
        game.controls.target.copy(target);
        game.controls.enabled = true;
        game.controls.update();
        this.el.remove();
        ui.afterTitle();
      }
    };
  }

  frame(dt) {
    if (this.active) this.camera(dt);
    else if (this.swoop) this.swoop(dt);
  }
}
