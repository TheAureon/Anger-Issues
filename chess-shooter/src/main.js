// Gunmate: chess where pieces shoot instead of capture, played from the pieces' own eyes.
import * as THREE from 'three';
import './style.css';
import * as R from './rules.js';
import { chooseAction, AI_SPREAD } from './ai.js';
import { buildPiece, buildViewGun } from './pieces.js';
import { buildWorld } from './world.js';
import { Fx } from './fx.js';
import * as sfx from './audio.js';
import { Minimap } from './minimap.js';

const $ = (id) => document.getElementById(id);
const COLOR_NAME = { w: 'White', b: 'Black' };
const FORWARD_YAW = { w: 0, b: Math.PI };
const POV_PITCH = -0.16;

// --- Renderer, scene, cameras ----------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
$('app').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 220);
camera.position.set(0, 9, 10);
camera.lookAt(0, 0, 0);
const { tiles } = buildWorld(scene);
const fx = new Fx(scene);

// First-person gun, drawn in its own pass on top of the world.
const viewScene = new THREE.Scene();
const viewCam = new THREE.PerspectiveCamera(60, camera.aspect, 0.01, 10);
viewScene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.6));
const viewSun = new THREE.DirectionalLight(0xfff1d6, 1.6);
viewSun.position.set(1, 2, 1);
viewScene.add(viewSun);
let viewGun = null;
let viewKick = 0;

// --- Markers -------------------------------------------------------------------------------

const markerRoot = new THREE.Group();
scene.add(markerRoot);
const moveGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.02, 12);
const moveMat = new THREE.MeshBasicMaterial({ color: 0x3fdc8a, transparent: true, opacity: 0.8, depthWrite: false });
const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 4, 20).rotateX(Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
const diamondGeo = new THREE.OctahedronGeometry(0.085);
const diamondMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
const activeRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x5cc8ff }));
const hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
activeRing.position.y = hoverRing.position.y = 0.015;
scene.add(activeRing, hoverRing);
let diamonds = [];

const TINT = {
  last: new THREE.Color(0xf2c94c),
  cover: new THREE.Color(0xff4433),
  check: new THREE.Color(0xff0000),
  active: new THREE.Color(0x5cc8ff),
};

// --- Game state ----------------------------------------------------------------------------

let st = null;
let vsAI = true;
const human = 'w';
let chosenMode = R.CLASSIC;
let chosenOpp = 'ai';
const groups = new Map(); // piece id -> THREE.Group
const remembered = { w: null, b: null }; // last POV piece per side
let povId = null;
let viewMode = 'pov';
let yaw = 0;
let pitch = POV_PITCH;
let fov = 70;
let ovYaw = 0;
let ovPitch = 0.95;
let ovDist = 11.5;
let busy = false;
let last = null;
let hover = { sq: -1, point: null, x: 0, y: 0, fromMap: false };
let graves = { w: [], b: [] };
let started = false;

const viewerColor = () => (vsAI ? human : st.turn);
const humanTurn = () => started && st && !st.result && (!vsAI || st.turn === human);

function sqOfId(id) {
  if (!st || id == null) return -1;
  for (let s = 0; s < 64; s++) if (st.board[s] && st.board[s].id === id) return s;
  return -1;
}
function kingId(color) {
  const s = R.findKing(st, color);
  return s >= 0 ? st.board[s].id : null;
}

// --- Tweens --------------------------------------------------------------------------------

const tweens = [];
function tween(dur, fn) {
  return new Promise((resolve) => tweens.push({ t: 0, dur, fn, resolve }));
}
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Pieces in the scene -------------------------------------------------------------------

function makeGroup(p) {
  const dims = R.DIMS[p.type];
  const g = buildPiece(p.type, p.color, dims);
  g.userData.h = dims.h;
  g.userData.id = p.id;
  g.rotation.y = FORWARD_YAW[p.color];
  return g;
}
function placeAll() {
  for (const g of groups.values()) scene.remove(g);
  groups.clear();
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (!p) continue;
    const g = makeGroup(p);
    const w = R.toWorld(s);
    g.position.set(w.x, 0, w.z);
    scene.add(g);
    groups.set(p.id, g);
  }
}

// --- Camera --------------------------------------------------------------------------------

let trans = null;
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _target = new THREE.Vector3(0, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);

function desiredPose(pos, quat) {
  const g = povId != null ? groups.get(povId) : null;
  if (viewMode === 'pov' && g) {
    pos.set(g.position.x, g.position.y + g.userData.h * R.EYE, g.position.z);
    _euler.set(pitch, yaw, 0, 'YXZ');
    quat.setFromEuler(_euler);
  } else {
    pos.set(Math.sin(ovYaw) * Math.cos(ovPitch) * ovDist, Math.sin(ovPitch) * ovDist, Math.cos(ovYaw) * Math.cos(ovPitch) * ovDist);
    _m.lookAt(pos, _target, _up);
    quat.setFromRotationMatrix(_m);
  }
}
function startTransition(dur = 0.55) {
  trans = { t: 0, dur, pos: camera.position.clone(), quat: camera.quaternion.clone() };
}

function setViewGun() {
  if (viewGun) viewScene.remove(viewGun);
  viewGun = null;
  const s = sqOfId(povId);
  if (s < 0) return;
  const p = st.board[s];
  viewGun = buildViewGun(p.type, p.color);
  viewGun.position.set(0.17, -0.15, -0.36);
  viewGun.rotation.set(0.04, 0.06, 0);
  viewScene.add(viewGun);
}

function setPov(id, { keepView = false } = {}) {
  const s = sqOfId(id);
  if (s < 0) return;
  const p = st.board[s];
  const changed = id !== povId;
  povId = id;
  remembered[p.color] = id;
  if (!keepView) {
    yaw = FORWARD_YAW[p.color];
    pitch = POV_PITCH;
  }
  if (viewMode !== 'pov' || changed) {
    viewMode = 'pov';
    startTransition();
  }
  setViewGun();
  refresh();
}

function setOverview(on) {
  if ((viewMode === 'over') === on) return;
  viewMode = on ? 'over' : 'pov';
  if (on && st) ovYaw = FORWARD_YAW[viewerColor()];
  startTransition();
  refresh();
}

// --- Picking -------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(clientX, clientY) {
  if (!st) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin;
  const d = raycaster.ray.direction;
  const skip = viewMode === 'pov' ? sqOfId(povId) : -1;
  const hit = R.castRay(st, o, d, 200, skip);
  const planeT = d.y < 0 ? -o.y / d.y : Infinity;
  if (hit.sq != null && hit.t < planeT) {
    return { sq: hit.sq, point: { x: o.x + d.x * hit.t, y: o.y + d.y * hit.t, z: o.z + d.z * hit.t }, piece: true };
  }
  if (planeT < Infinity) {
    const p = { x: o.x + d.x * planeT, y: 0, z: o.z + d.z * planeT };
    const s = R.worldToSq(p.x, p.z);
    if (s >= 0) return { sq: s, point: p, piece: false };
  }
  return null;
}

// --- UI helpers ----------------------------------------------------------------------------

let statusTimer = 0;
function status(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'show ' + kind;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.className = ''), 3600);
}
let bannerTimer = 0;
function banner(text, ms = 1300) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.remove('fade');
  void el.offsetWidth;
  el.classList.add('fade');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function pieceLabel(p) {
  return `${COLOR_NAME[p.color]} ${R.NAMES[p.type].toLowerCase()}`;
}

// Why can't the current piece act on `sq`?
function explain(from, sq) {
  const me = st.board[from];
  const p = st.board[sq];
  if (p && p.color !== me.color) {
    if (p.type === 'k' && st.mode === R.CLASSIC) return 'Kings are bulletproof in Classic. Siege it: checkmate wins.';
    if (R.isTargetable(st, from, sq)) return st.mode === R.CLASSIC ? 'You can’t: that would leave your king in check.' : '';
    const t = me.type;
    if (t === 'r' || t === 'b' || t === 'q') {
      const df = Math.abs(R.fileOf(sq) - R.fileOf(from));
      const dr = Math.abs(R.rankOf(sq) - R.rankOf(from));
      const aligned = (t !== 'b' && (df === 0 || dr === 0)) || (t !== 'r' && df === dr);
      if (aligned && Math.max(df, dr) > R.SLIDER_RANGE) return `Out of range: ${R.NAMES[t].toLowerCase()}s shoot only ${R.SLIDER_RANGE} squares (half their movement).`;
      if (aligned) return 'Line of fire is blocked.';
    }
    return `Out of range. ${R.WEAPON_TEXT[t]}`;
  }
  if (!p) {
    if (R.pseudoMoves(st, from).some((m) => m.to === sq)) return 'You can’t: that move leaves your king in check.';
    return `Your ${R.NAMES[me.type].toLowerCase()} can’t move there.`;
  }
  return '';
}

function renderGraves() {
  for (const c of ['w', 'b']) {
    $(`grave-${c}`).innerHTML = graves[c].map((t) => `<span class="g-${c}">${R.GLYPHS[t]}&#xFE0E;</span>`).join('');
  }
}

// --- Refresh markers, tiles, HUD, minimap --------------------------------------------------

let current = { from: -1, moves: [], targets: [], coverage: new Set() };

function refresh() {
  if (!st) return;
  for (const d of diamonds) markerRoot.remove(d);
  diamonds = [];
  markerRoot.clear();

  const from = sqOfId(povId);
  const mine = from >= 0 && st.board[from].color === st.turn && humanTurn() && !busy;
  const acts = mine ? R.legalActions(st, from) : [];
  current = {
    from,
    moves: acts.filter((a) => a.kind === 'move').map((a) => a.to),
    targets: acts.filter((a) => a.kind === 'shoot').map((a) => a.to),
    coverage: new Set(from >= 0 && !busy ? R.gunCoverage(st, from) : []),
  };
  for (const s of current.moves) {
    const m = new THREE.Mesh(moveGeo, moveMat);
    const w = R.toWorld(s);
    m.position.set(w.x, 0.012, w.z);
    markerRoot.add(m);
  }
  for (const s of current.targets) {
    const w = R.toWorld(s);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(w.x, 0.02, w.z);
    markerRoot.add(ring);
    const dm = new THREE.Mesh(diamondGeo, diamondMat);
    dm.position.set(w.x, R.DIMS[st.board[s].type].h + 0.22, w.z);
    dm.userData.baseY = dm.position.y;
    markerRoot.add(dm);
    diamonds.push(dm);
  }

  // Check / danger.
  let checkSq = -1;
  const k = R.findKing(st, st.turn);
  if (k >= 0 && R.attackedBy(st, k, R.other(st.turn))) checkSq = k;

  // Tiles.
  const lastSet = last ? last.squares : new Set();
  for (let s = 0; s < 64; s++) {
    const t = tiles[s];
    t.material.color.copy(t.userData.baseColor);
    if (current.coverage.has(s)) t.material.color.lerp(TINT.cover, 0.22);
    if (lastSet.has(s)) t.material.color.lerp(TINT.last, 0.4);
    if (s === checkSq) t.material.color.lerp(TINT.check, 0.55);
  }

  activeRing.visible = from >= 0;
  if (from >= 0) {
    const w = R.toWorld(from);
    activeRing.position.x = w.x;
    activeRing.position.z = w.z;
  }

  // Top bar.
  $('turn-text').textContent = st.result ? 'Game over' : `${COLOR_NAME[st.turn]} to play${vsAI && st.turn !== human ? ' (computer)' : ''}`;
  $('turn-dot').className = st.turn;
  $('mode-tag').textContent = st.mode === R.CLASSIC ? 'Classic · siege the king' : 'MerciZero · kings can die';
  $('mode-tag').className = st.mode;

  // Piece card.
  if (from >= 0) {
    const p = st.board[from];
    $('card-title').innerHTML = `<span class="glyph g-${p.color}">${R.GLYPHS[p.type]}&#xFE0E;</span> ${R.NAMES[p.type]} <small>${R.sqName(from)}</small>`;
    $('card-move').textContent = '🚶 ' + R.MOVE_TEXT[p.type];
    $('card-gun').textContent = '🔫 ' + R.WEAPON_TEXT[p.type];
    $('card-count').textContent = mine
      ? `${current.moves.length} move${current.moves.length === 1 ? '' : 's'} · ${current.targets.length} target${current.targets.length === 1 ? '' : 's'}`
      : '';
  }
  $('minimap').classList.toggle('flip', false);
  minimap.flip = viewerColor() === 'b';
  $('btn-view').classList.toggle('on', viewMode === 'over');
  drawMap();
  updateHover();
  updateMood();
}

function drawMap() {
  if (!st) return;
  const checkK = R.findKing(st, st.turn);
  minimap.draw({
    board: st.board,
    active: current.from,
    moves: current.moves,
    targets: current.targets,
    coverage: current.coverage,
    hover: hover.sq,
    lastSquares: last ? last.squares : null,
    last: last && last.line,
    checkSq: checkK >= 0 && R.attackedBy(st, checkK, R.other(st.turn)) ? checkK : -1,
    cone: viewMode === 'pov' && current.from >= 0 ? { s: current.from, yaw, fov: (2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)) } : null,
  });
}

// --- Hover tooltips ------------------------------------------------------------------------

let chanceCache = { key: '', v: 0 };
function updateHover() {
  const tip = $('tip');
  hoverRing.visible = false;
  canvas.style.cursor = 'grab';
  if (!st || hover.sq < 0 || dragging) {
    tip.classList.add('hidden');
    return;
  }
  const s = hover.sq;
  const p = st.board[s];
  const from = current.from;
  let text = '';
  let cls = '';
  if (p && p.color === viewerColor() && p.id !== povId) {
    text = `👁 See through ${R.NAMES[p.type].toLowerCase()}`;
    canvas.style.cursor = 'pointer';
  } else if (current.moves.includes(s)) {
    text = `Move to ${R.sqName(s)}`;
    cls = 'move';
    canvas.style.cursor = 'pointer';
  } else if (current.targets.includes(s)) {
    const aim = !hover.fromMap && viewMode === 'pov' && hover.point && hover.pointPiece ? hover.point : R.aimCenter(st, s);
    const key = `${from}-${s}-${aim.x.toFixed(2)}-${aim.y.toFixed(2)}-${aim.z.toFixed(2)}`;
    if (chanceCache.key !== key) chanceCache = { key, v: R.hitChance(st, from, s, aim, 220) };
    text = `🎯 Shoot ${R.NAMES[p.type].toLowerCase()} · ${Math.round(chanceCache.v * 100)}% hit`;
    cls = 'shoot';
    canvas.style.cursor = 'crosshair';
  } else if (p && from >= 0 && humanTurn() && !busy && p.color !== st.board[from].color) {
    text = explain(from, s);
    cls = 'no';
  }
  if (s >= 0 && (p || current.moves.includes(s))) {
    const w = R.toWorld(s);
    hoverRing.position.x = w.x;
    hoverRing.position.z = w.z;
    hoverRing.visible = viewMode === 'over' || s !== current.from;
  }
  if (!text) {
    tip.classList.add('hidden');
    return;
  }
  tip.textContent = text;
  tip.className = cls;
  const x = Math.min(window.innerWidth - 240, hover.x + 16);
  tip.style.left = `${x}px`;
  tip.style.top = `${hover.y + 18}px`;
}

// --- Actions -------------------------------------------------------------------------------

function onSquare(sq, aim = null) {
  if (!st || st.result) return;
  const p = st.board[sq];
  if (p && p.color === viewerColor()) {
    if (p.id !== povId || viewMode !== 'pov') {
      sfx.click();
      setPov(p.id);
    }
    return;
  }
  if (busy || !humanTurn()) return;
  const from = sqOfId(povId);
  if (from < 0) return;
  const acts = R.legalActions(st, from);
  const mv = acts.find((a) => a.kind === 'move' && a.to === sq);
  if (mv) return doMove(mv, true);
  const sh = acts.find((a) => a.kind === 'shoot' && a.to === sq);
  if (sh) return doShoot(sh, aim || R.aimCenter(st, sq), 1);
  const why = explain(from, sq);
  if (why) status(why, 'warn');
}

function askPromotion() {
  return new Promise((resolve) => {
    const el = $('promo');
    el.classList.remove('hidden');
    const handler = (e) => {
      const b = e.target.closest('button[data-t]');
      if (!b) return;
      el.removeEventListener('click', handler);
      el.classList.add('hidden');
      resolve(b.dataset.t);
    };
    el.addEventListener('click', handler);
  });
}

function slide(g, to, dur, hop) {
  const a = g.position.clone();
  const b = new THREE.Vector3(to.x, 0, to.z);
  return tween(dur, (k) => {
    const e = ease(k);
    g.position.lerpVectors(a, b, e);
    g.position.y = hop ? Math.sin(Math.PI * k) * 0.8 : Math.abs(Math.sin(Math.PI * k * Math.max(1, Math.round(a.distanceTo(b) * 1.5)))) * 0.05;
  });
}

async function doMove(a, byHuman) {
  busy = true;
  if (a.promo && byHuman) a = { ...a, promoType: await askPromotion() };
  refresh();
  const p = st.board[a.from];
  const g = groups.get(p.id);
  const to = R.toWorld(a.to);
  const dist = Math.hypot(R.fileOf(a.to) - R.fileOf(a.from), R.rankOf(a.to) - R.rankOf(a.from));
  sfx.move();
  const jobs = [slide(g, to, 0.28 + dist * 0.07, p.type === 'n')];
  if (a.castle) {
    const r = R.rankOf(a.from);
    const rookSq = R.sqAt(a.castle === 'K' ? 7 : 0, r);
    const rg = groups.get(st.board[rookSq].id);
    jobs.push(slide(rg, R.toWorld(R.sqAt(a.castle === 'K' ? 5 : 3, r)), 0.45, false));
  }
  await Promise.all(jobs);
  sfx.step();
  const next = R.applyRaw(st, a);
  if (a.promo) {
    // Swap the mesh for the promoted piece.
    scene.remove(g);
    const np = next.board[a.to];
    const ng = makeGroup(np);
    ng.position.set(to.x, 0, to.z);
    scene.add(ng);
    groups.set(np.id, ng);
    fx.sparks(new THREE.Vector3(to.x, 0.6, to.z), 18, 0xfff2a0);
    status(`${COLOR_NAME[np.color]} pawn promoted to ${R.NAMES[np.type].toLowerCase()}!`, 'good');
  }
  const f = R.toWorld(a.from);
  commit(next, {
    squares: new Set([a.from, a.to]),
    line: { kind: 'move', a: { f: f.x + 4, r: 4 - f.z }, b: { f: to.x + 4, r: 4 - to.z } },
  });
}

function faceYaw(from, x, z) {
  return Math.atan2(-(x - from.x), -(z - from.z));
}
function turnTo(g, target, dur = 0.18) {
  const a = g.rotation.y;
  let d = target - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return tween(dur, (k) => (g.rotation.y = a + d * ease(k)));
}

async function doShoot(a, aim, spreadMul) {
  busy = true;
  refresh();
  const shooter = st.board[a.from];
  const g = groups.get(shooter.id);
  const res = R.simulateShot(st, a.from, aim, Math.random, spreadMul);
  const end = new THREE.Vector3(res.end.x, res.end.y, res.end.z);
  await turnTo(g, faceYaw(g.position, res.end.x, res.end.z));

  // Tracer starts at the visible muzzle (the view gun's, if we're looking through the shooter).
  const start = new THREE.Vector3();
  const firstPerson = viewMode === 'pov' && povId === shooter.id;
  if (firstPerson) {
    start.copy(camera.localToWorld(new THREE.Vector3(0.17, -0.12, -0.75)));
    viewKick = 1;
  } else {
    const muzzle = g.userData.gun.getObjectByName('muzzle');
    muzzle.getWorldPosition(start);
    const gun = g.userData.gun;
    const z0 = gun.position.z;
    tween(0.18, (k) => (gun.position.z = z0 + Math.sin(Math.PI * k) * 0.06));
  }
  fx.muzzleFlash(start);
  sfx.gunshot(shooter.type);
  await fx.tracer(start, end);

  let kill = null;
  let victimDesc = '';
  if (res.hit != null) {
    const victim = st.board[res.hit];
    if (victim.type === 'k' && st.mode === R.CLASSIC) {
      fx.sparks(end, 14);
      sfx.ricochet();
      status('Ricochet! Kings are bulletproof in Classic.', 'warn');
    } else {
      kill = res.hit;
      victimDesc = pieceLabel(victim);
      const vg = groups.get(victim.id);
      fx.shatter(vg, new THREE.Vector3(res.dir.x, 0, res.dir.z).normalize());
      scene.remove(vg);
      groups.delete(victim.id);
      graves[victim.color].push(victim.type);
      renderGraves();
      sfx.shatter();
      if (res.hit === a.to) status(`Hit! ${victimDesc} down.`, 'good');
      else if (victim.color === shooter.color) status(`Friendly fire! The bullet hit your own ${R.NAMES[victim.type].toLowerCase()}.`, 'bad');
      else status(`Stray bullet hit the ${victimDesc} instead!`, 'good');
      if (victim.id === povId) {
        banner(`Your ${R.NAMES[victim.type].toLowerCase()} was shot!`, 1500);
      }
    }
  } else {
    if (res.ground) {
      fx.dust(end, 4);
      fx.sparks(end, 6, 0xd9c49b);
    }
    sfx.thud();
    status(res.ground ? 'Missed! The bullet hit the floor.' : 'Missed! The bullet flew past.', 'warn');
  }
  turnTo(g, FORWARD_YAW[shooter.color], 0.4);
  const f = R.toWorld(a.from);
  const next = R.applyRaw(st, a, kill);
  await wait(kill != null ? 350 : 150);
  commit(next, {
    squares: new Set([a.from, ...(kill != null ? [kill] : [])]),
    line: { kind: 'shoot', hit: kill != null, a: { f: f.x + 4, r: 4 - f.z }, b: { f: res.end.x + 4, r: 4 - res.end.z } },
  });
}

function commit(next, lastInfo) {
  st = next;
  last = lastInfo;
  const result = R.judge(st);
  if (result) {
    st.result = result;
    busy = false;
    refresh();
    gameOver(result);
    return;
  }
  // If the piece we were looking through died, fall back to the king.
  for (const c of ['w', 'b']) if (sqOfId(remembered[c]) < 0) remembered[c] = kingId(c);
  if (sqOfId(povId) < 0) {
    povId = remembered[viewerColor()];
    setViewGun();
    startTransition(0.9);
  }
  const k = R.findKing(st, st.turn);
  if (k >= 0 && R.attackedBy(st, k, R.other(st.turn))) {
    sfx.check();
    if (st.mode === R.CLASSIC) status(`Check! ${COLOR_NAME[st.turn]} king is under siege.`, 'bad');
    else status(`${COLOR_NAME[st.turn]} king is in the line of fire!`, 'bad');
  }
  nextTurn();
}

async function nextTurn() {
  if (vsAI && st.turn !== human) {
    busy = true;
    refresh();
    $('turn-text').textContent = 'Computer is aiming…';
    await wait(550);
    const a = chooseAction(st);
    if (!a) return;
    if (a.kind === 'move') await doMove(a, false);
    else await doShoot(a, R.aimCenter(st, a.to), AI_SPREAD);
    return;
  }
  if (!vsAI) {
    busy = true;
    refresh();
    await wait(650);
    banner(`${COLOR_NAME[st.turn]} to play`);
    const id = sqOfId(remembered[st.turn]) >= 0 ? remembered[st.turn] : kingId(st.turn);
    viewMode = 'pov';
    busy = false;
    povId = null;
    setPov(id);
    return;
  }
  busy = false;
  if (sqOfId(povId) < 0 || st.board[sqOfId(povId)].color !== human) setPov(kingId(human), { keepView: false });
  refresh();
}

function gameOver(result) {
  const won = result.winner;
  let title = won ? `${COLOR_NAME[won]} wins` : 'Draw';
  if (vsAI && won) title = won === human ? 'You win!' : 'The computer wins';
  $('over-title').textContent = title;
  $('over-reason').textContent = result.reason[0].toUpperCase() + result.reason.slice(1) + '.';
  sfx.fanfare(!vsAI || won === human);
  setTimeout(() => $('over').classList.remove('hidden'), 1100);
}

// --- Game setup ----------------------------------------------------------------------------

function startGame() {
  sfx.unlock();
  st = R.newGame(chosenMode);
  vsAI = chosenOpp === 'ai';
  graves = { w: [], b: [] };
  renderGraves();
  last = null;
  busy = false;
  placeAll();
  remembered.w = kingId('w');
  remembered.b = kingId('b');
  povId = null;
  viewMode = 'pov';
  started = true;
  setPov(remembered.w);
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('btn-resume').classList.add('hidden');
  banner(chosenMode === R.CLASSIC ? 'Classic: siege the king' : 'MerciZero: shoot the king', 1600);
}

// --- Input ---------------------------------------------------------------------------------

let down = null;
let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  dragging = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (down && down.id === e.pointerId) {
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!dragging && Math.hypot(dx, dy) > 6) {
      dragging = true;
      canvas.style.cursor = 'grabbing';
      updateHover();
    }
    if (dragging) {
      look(dx, dy);
      down.x = e.clientX;
      down.y = e.clientY;
    }
    return;
  }
  if (e.pointerType === 'mouse') setHoverFrom3D(e.clientX, e.clientY);
});
function setHoverFrom3D(x, y) {
  const h = pick(x, y);
  hover = { sq: h ? h.sq : -1, point: h ? h.point : null, pointPiece: h ? h.piece : false, x, y, fromMap: false };
  updateHover();
  drawMap();
}
canvas.addEventListener('pointerup', (e) => {
  if (!down || down.id !== e.pointerId) return;
  const wasDrag = dragging;
  down = null;
  dragging = false;
  if (wasDrag) return;
  const h = pick(e.clientX, e.clientY);
  if (!h) return;
  const aim = viewMode === 'pov' && h.piece ? h.point : null;
  onSquare(h.sq, aim);
  if (e.pointerType === 'mouse') setHoverFrom3D(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => {
  if (!hover.fromMap) {
    hover.sq = -1;
    updateHover();
  }
});
canvas.addEventListener('pointercancel', () => {
  down = null;
  dragging = false;
});

function look(dx, dy) {
  const zoom = fov / 70;
  if (viewMode === 'pov') {
    yaw -= dx * 0.005 * zoom;
    pitch = Math.max(-1.25, Math.min(1.0, pitch - dy * 0.005 * zoom));
  } else {
    ovYaw -= dx * 0.006;
    ovPitch = Math.max(0.2, Math.min(1.45, ovPitch + dy * 0.005));
  }
}

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (viewMode === 'pov') fov = Math.max(22, Math.min(80, fov + e.deltaY * 0.04));
    else ovDist = Math.max(6, Math.min(22, ovDist + e.deltaY * 0.01));
  },
  { passive: false },
);

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (!started) return;
  const k = e.key.toLowerCase();
  if (k === 'v' || k === 'tab') {
    e.preventDefault();
    setOverview(viewMode !== 'over');
  } else if (k === 'escape') {
    toggleMenu();
  } else if (k === 'm') {
    setMusic(!sfx.music.enabled);
  } else if (k === 'q' || k === 'e') {
    cyclePiece(k === 'e' ? 1 : -1);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function cyclePiece(dir) {
  if (!st) return;
  const c = viewerColor();
  const order = [];
  for (let s = 0; s < 64; s++) if (st.board[s] && st.board[s].color === c) order.push(st.board[s].id);
  if (!order.length) return;
  const i = order.indexOf(povId);
  const next = order[(i + dir + order.length) % order.length];
  sfx.click();
  setPov(next);
}

function toggleMenu() {
  const m = $('menu');
  if (m.classList.contains('hidden')) {
    m.classList.remove('hidden');
    $('btn-resume').classList.toggle('hidden', !st || !!st.result);
  } else if (st) {
    m.classList.add('hidden');
  }
}

// Menu wiring.
for (const b of document.querySelectorAll('#mode-choices .choice')) {
  b.addEventListener('click', () => {
    chosenMode = b.dataset.mode;
    document.querySelectorAll('#mode-choices .choice').forEach((x) => x.classList.toggle('selected', x === b));
  });
}
for (const b of document.querySelectorAll('#opp-choices .choice')) {
  b.addEventListener('click', () => {
    chosenOpp = b.dataset.opp;
    document.querySelectorAll('#opp-choices .choice').forEach((x) => x.classList.toggle('selected', x === b));
  });
}
$('btn-start').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', () => $('menu').classList.add('hidden'));
$('btn-menu').addEventListener('click', toggleMenu);
$('btn-view').addEventListener('click', () => setOverview(viewMode !== 'over'));
$('btn-help').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btn-help-close').addEventListener('click', () => $('help').classList.add('hidden'));
function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function savePref(key, on) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* storage unavailable: setting lasts for this visit only */
  }
}
function setMusic(on) {
  sfx.music.setEnabled(on);
  $('btn-music').classList.toggle('off', !on);
  $('btn-music').title = on ? 'Music on (M)' : 'Music off (M)';
  savePref('gunmate-music', on);
}
setMusic(loadPref('gunmate-music', true));
$('btn-music').addEventListener('click', () => setMusic(!sfx.music.enabled));
// Music needs a user gesture before it can start.
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// Battle mood: tense when the side you're playing has its king in an enemy gun's reach.
function updateMood() {
  if (!started || !st || st.result) return sfx.music.setMood(0);
  const k = R.findKing(st, viewerColor());
  sfx.music.setMood(k >= 0 && R.attackedBy(st, k, R.other(viewerColor())) ? 2 : 1);
}

$('btn-sound').addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  $('btn-sound').textContent = sfx.muted ? '🔇' : '🔊';
});
$('btn-again').addEventListener('click', startGame);
$('btn-over-menu').addEventListener('click', () => {
  $('over').classList.add('hidden');
  $('menu').classList.remove('hidden');
});
$('btn-over-look').addEventListener('click', () => {
  $('over').classList.add('hidden');
  setOverview(true);
});

const minimap = new Minimap(
  $('minimap'),
  (s) => onSquare(s, null),
  (s) => {
    const r = $('minimap').getBoundingClientRect();
    hover = { sq: s, point: null, x: r.right - 250, y: r.top - 40, fromMap: true };
    updateHover();
    drawMap();
  },
);
$('minimap').addEventListener('pointermove', (e) => {
  hover.x = Math.max(8, e.clientX - 240);
  hover.y = e.clientY - 46;
  updateHover();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  viewCam.aspect = camera.aspect;
  viewCam.updateProjectionMatrix();
  drawMap();
});

// --- Main loop -----------------------------------------------------------------------------

const clock = new THREE.Clock();
let mapTimer = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(k);
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.resolve();
    }
  }

  // Keyboard look.
  const kx = (keys.has('arrowleft') || keys.has('a') ? -1 : 0) + (keys.has('arrowright') || keys.has('d') ? 1 : 0);
  const ky = (keys.has('arrowup') || keys.has('w') ? -1 : 0) + (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
  if (kx || ky) look(kx * 420 * dt, ky * 300 * dt);

  if (!started) ovYaw += dt * 0.08;

  // Camera.
  const targetFov = viewMode === 'pov' ? fov : 50;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
  desiredPose(_pos, _quat);
  let blend = 1;
  if (trans) {
    trans.t += dt;
    blend = ease(Math.min(1, trans.t / trans.dur));
    camera.position.lerpVectors(trans.pos, _pos, blend);
    // Arc up and over the board instead of flying through pieces.
    camera.position.y += Math.sin(Math.PI * blend) * Math.min(2.5, trans.pos.distanceTo(_pos) * 0.3);
    camera.quaternion.slerpQuaternions(trans.quat, _quat, blend);
    if (trans.t >= trans.dur) trans = null;
  } else {
    camera.position.copy(_pos);
    camera.quaternion.copy(_quat);
  }
  for (const [id, g] of groups) g.visible = !(viewMode === 'pov' && id === povId && blend > 0.55);

  // Markers.
  for (const d of diamonds) {
    d.rotation.y = time * 2.5;
    d.position.y = d.userData.baseY + Math.sin(time * 4) * 0.04;
  }
  moveMat.opacity = 0.6 + Math.sin(time * 5) * 0.2;
  ringMat.color.setHSL(0.01, 1, 0.5 + Math.sin(time * 6) * 0.1);

  fx.update(dt);

  // Minimap view cone follows the camera.
  mapTimer += dt;
  if (st && mapTimer > 0.06) {
    mapTimer = 0;
    drawMap();
  }

  renderer.clear();
  renderer.render(scene, camera);
  if (viewGun && viewMode === 'pov' && blend > 0.8) {
    viewKick = Math.max(0, viewKick - dt * 6);
    const bob = Math.sin(time * 1.6) * 0.004;
    viewGun.position.set(0.17, -0.15 + bob - viewKick * 0.012, -0.36 + viewKick * 0.06);
    viewGun.rotation.x = 0.04 + viewKick * 0.25;
    viewCam.fov = camera.fov;
    viewCam.aspect = camera.aspect;
    viewCam.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(viewScene, viewCam);
  }
}

// Read-only hook for automated play-testing.
window.__gunmate = { state: () => st, legal: () => (st ? R.legalActions(st) : []), busy: () => busy, music: sfx.music, cam: () => ({ pos: camera.position.toArray().map((v) => +v.toFixed(2)), povId, viewMode, yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2) }) };

// Show the board (slowly orbiting) behind the menu.
st = R.newGame(R.CLASSIC);
placeAll();
viewMode = 'over';
ovPitch = 0.6;
frame();
