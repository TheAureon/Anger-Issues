import * as THREE from 'three';

/*
 * Title screen: a cinematic splash over the live scene. The room goes dark,
 * a spotlight picks out the mannequin from a low, slowly pushing-in camera,
 * the logo letters slam down one by one, and "press any key" starts the game:
 * the letters scatter, the lights come up and the camera swoops into play.
 */

const LETTER_START = 0.9; // seconds before the first letter lands
const LETTER_GAP = 0.09;

export class TitleScreen {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.active = true;
    this.t = 0;
    this.look = new THREE.Vector3(0, 1.2, 0);
    game.title = this;
    game.controls.enabled = false;
    ui.root.classList.add('title-mode');
    // Plays right away if the browser allows audio before a click; otherwise it starts on the first press.
    game.music?.play('title');

    // Letters with their landing delay, tilt, and scatter direction.
    let i = 0;
    const word = (w, cls) =>
      `<span class="lw ${cls}">${[...w]
        .map((ch) => {
          const d = LETTER_START + i++ * LETTER_GAP;
          const style = [
            `--r:${(((i * 37) % 11) - 5) * 0.8}deg`,
            `--d:${d.toFixed(2)}s`,
            `--fx:${((Math.random() - 0.5) * 9).toFixed(2)}em`,
            `--fy:${(-2 - Math.random() * 3).toFixed(2)}em`,
            `--fr:${((Math.random() - 0.5) * 540).toFixed(0)}deg`,
          ].join(';');
          return `<span class="ch" style="${style}">${ch}</span>`;
        })
        .join('')}</span>`;
    const lettersHtml = word('ANGER', 'w1') + word('ISSUES', 'w2');
    const landed = LETTER_START + i * LETTER_GAP + 0.3;
    const touch = matchMedia('(pointer: coarse)').matches;

    const el = document.createElement('div');
    el.className = 'title';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Anger Issues. Press any key to start.');
    el.style.setProperty('--vd', `${landed.toFixed(2)}s`);
    el.style.setProperty('--pd', `${(landed + 0.5).toFixed(2)}s`);
    el.innerHTML = `
      <div class="title-vignette"></div>
      <h1 class="title-logo">${lettersHtml}<span class="vein" aria-hidden="true">💢</span></h1>
      <div class="title-prompt">${touch ? 'TAP TO START' : 'PRESS ANY KEY'}</div>
      <div class="title-credit">NO ADS · NO TIMERS · NOTHING TO UNLOCK</div>
      <div class="title-black"></div>`;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.play();
    });
    ui.root.append(el);
    this.el = el;

    // Screen thud as each letter lands.
    this.timers = [];
    for (let k = 0; k < i; k++) {
      this.timers.push(
        setTimeout(() => {
          if (!this.active) return;
          el.classList.remove('shake');
          void el.offsetWidth;
          el.classList.add('shake');
        }, (LETTER_START + k * LETTER_GAP + 0.25) * 1000),
      );
    }

    // Lighting: dark room, one warm spotlight on the mannequin.
    this.saved = { hemi: game.hemi.intensity, sun: game.sun.intensity, exposure: game.renderer.toneMappingExposure };
    game.hemi.intensity = 0.12;
    game.sun.intensity = 0.12;
    const spot = new THREE.SpotLight(0xffd2a0, 90, 14, 0.32, 0.55, 1.2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    game.scene.add(spot, spot.target);
    this.spot = spot;
    const rim = new THREE.PointLight(0xff5a2a, 6, 6, 1.5);
    game.scene.add(rim);
    this.rim = rim;
  }

  chestPos() {
    const c = this.game.mannequin.byName?.chest;
    const t = c?.alive ? c.body.translation() : { x: 0, y: 1.3, z: 0 };
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  /** Low, slowly pushing-in camera that sways a little around the mannequin. */
  camera(dt) {
    const game = this.game;
    this.t += dt;
    const c = this.chestPos();
    const cam = game.camera;
    const portrait = game.container.clientWidth < game.container.clientHeight;
    const push = Math.min(1, this.t / 14);
    const dist = (portrait ? 5.2 : 4.4) - push * 0.7;
    const ang = Math.sin(this.t * 0.16) * 0.3;
    // Look a little above the head so the mannequin sits in the lower half, under the logo.
    this.look.lerp(new THREE.Vector3(c.x, portrait ? 1.6 : 1.45, c.z), Math.min(1, dt * 3));
    cam.position.set(this.look.x + Math.sin(ang) * dist, 0.55 + Math.sin(this.t * 0.4) * 0.04, this.look.z + Math.cos(ang) * dist);
    cam.lookAt(this.look);
    // Lights follow the mannequin.
    this.spot.position.set(c.x + 0.7, 4.6, c.z + 1.4);
    this.spot.target.position.set(c.x, 0.7, c.z);
    this.rim.position.set(c.x - 1.2, 1.6, c.z - 1.4);
  }

  play() {
    if (!this.active) return;
    const game = this.game;
    const ui = this.ui;
    this.active = false;
    for (const t of this.timers) clearTimeout(t);
    game.sfx.unlock();
    game.music?.play('game');
    game.sfx.boom(0.4);
    game.sfx.whoosh();
    this.el.classList.add('leaving');
    ui.root.classList.remove('title-mode');
    ui.update();

    // Swoop to the play view while the lights come back up.
    const cam = game.camera;
    const from = cam.position.clone();
    const c = this.chestPos();
    const target = new THREE.Vector3(c.x, 0.88, c.z);
    const to = target.clone().add(new THREE.Vector3(0.55, 0.57, 2.8));
    const fromLook = this.look.clone();
    const s = this.saved;
    const spot0 = this.spot.intensity;
    const rim0 = this.rim.intensity;
    let k = 0;
    this.swoop = (dt) => {
      k = Math.min(1, k + dt / 1.3);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      cam.position.lerpVectors(from, to, e);
      cam.lookAt(fromLook.clone().lerp(target, e));
      game.hemi.intensity = THREE.MathUtils.lerp(0.12, s.hemi, e);
      game.sun.intensity = THREE.MathUtils.lerp(0.12, s.sun, e);
      this.spot.intensity = spot0 * (1 - e);
      this.rim.intensity = rim0 * (1 - e);
      if (k >= 1) {
        this.swoop = null;
        game.scene.remove(this.spot, this.spot.target, this.rim);
        this.spot.dispose();
        this.rim.dispose();
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
