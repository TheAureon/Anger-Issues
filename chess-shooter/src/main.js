// Gunmate: chess where pieces shoot instead of capture, played from the pieces' own eyes.
import * as THREE from 'three';
import './style.css';
import * as R from './rules.js';
import { chooseAction, DIFFICULTIES } from './ai.js';
import { buildPiece, buildViewGun, setEnvMap, setPieceSkin, setGunSkin } from './pieces.js';
import { CATEGORIES, findSkin, swatches } from './skins.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildWorld, applyBoardSkin } from './world.js';
import { Fx } from './fx.js';
import * as sfx from './audio.js';
import { Minimap } from './minimap.js';
import { Progress, BADGES, BADGE_XP, xpForLevel, levelOf, rankOf } from './progress.js';

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
const world = buildWorld(scene);
const { tiles } = world;
// Reflections for metallic skins (chrome, gold): a small studio environment.
setEnvMap(new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
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
activeRing.visible = hoverRing.visible = false;
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
let human = 'w';
let chosenMode = loadPref('gunmate-mode', R.CLASSIC);
let chosenOpp = 'ai';
let difficulty = loadPref('gunmate-diff', 'normal');
let chosenSide = loadPref('gunmate-side', 'w');
let paused = false;
// Pass & Play
const names = { w: loadPref('gunmate-name-w', 'Player 1'), b: loadPref('gunmate-name-b', 'Player 2') };
let handoffOn = loadPref('gunmate-handoff', '1') === '1';
let pendingTurn = null; // piece id to look through once the next player taps Ready
let lastDesc = '';
let gameToken = 0; // bumps on every new game so stale async turns stop
const settings = {
  musicVol: +loadPref('gunmate-vol-music', '70'),
  sfxVol: +loadPref('gunmate-vol-sfx', '90'),
  sens: +loadPref('gunmate-sens', '100'),
  cover: loadPref('gunmate-cover', '1') === '1',
  hints: loadPref('gunmate-hints', '1') === '1',
};

function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function savePref(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable: setting lasts for this visit only */
  }
}
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
const playerName = (c) => (vsAI ? (c === human ? 'You' : DIFFICULTIES[difficulty].label) : names[c] || COLOR_NAME[c]);
const pieceName = (p) => R.NAMES[p.type].toLowerCase();
const humanTurn = () => started && !paused && st && !st.result && (!vsAI || st.turn === human);

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
    coverage: new Set(from >= 0 && !busy && settings.cover ? R.gunCoverage(st, from) : []),
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
  $('turn-text').textContent = st.result
    ? 'Game over'
    : vsAI
      ? `${COLOR_NAME[st.turn]} to play${st.turn !== human ? ' (computer)' : ''}`
      : `${playerName(st.turn)} (${COLOR_NAME[st.turn]}) to play`;
  $('turn-dot').className = st.turn;
  $('mode-tag').textContent =
    (st.mode === R.CLASSIC ? 'Classic · siege the king' : 'MerciZero · kings can die') +
    (vsAI ? ` · vs ${DIFFICULTIES[difficulty].label}` : ' · pass & play');
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
  if (sh) return doShoot(sh, aim || R.aimCenter(st, sq), 1, true);
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
  const tok = gameToken;
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
  if (tok !== gameToken) return;
  sfx.step();
  progress.onMove({ mine: byHuman, castle: !!a.castle, promo: !!a.promo });
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
  let desc;
  if (a.castle) desc = `${playerName(p.color)} castled ${a.castle === 'K' ? 'kingside' : 'queenside'}.`;
  else if (a.promo) desc = `${playerName(p.color)} moved a pawn to ${R.sqName(a.to)} and promoted it to a ${R.NAMES[a.promoType || 'q'].toLowerCase()}.`;
  else desc = `${playerName(p.color)} moved their ${pieceName(p)} ${R.sqName(a.from)} → ${R.sqName(a.to)}.`;
  commit(next, {
    squares: new Set([a.from, a.to]),
    line: { kind: 'move', a: { f: f.x + 4, r: 4 - f.z }, b: { f: to.x + 4, r: 4 - to.z } },
    desc,
  }, tok);
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

async function doShoot(a, aim, spreadMul, mine = false) {
  const tok = gameToken;
  busy = true;
  refresh();
  const shooter = st.board[a.from];
  const g = groups.get(shooter.id);
  const chance = mine ? R.hitChance(st, a.from, a.to, aim, 120, spreadMul) : 1;
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
  if (tok !== gameToken) return;

  let kill = null;
  let victimDesc = '';
  const hitPiece = res.hit != null ? st.board[res.hit] : null;
  progress.onShot({
    mine,
    shooterType: shooter.type,
    intended: a.to,
    victim: hitPiece,
    victimSq: res.hit,
    friendly: !!hitPiece && hitPiece.color === shooter.color,
    ricochet: !!hitPiece && hitPiece.type === 'k' && st.mode === R.CLASSIC,
    distance: Math.max(Math.abs(R.fileOf(a.to) - R.fileOf(a.from)), Math.abs(R.rankOf(a.to) - R.rankOf(a.from))),
    chance,
  });
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
  const target = st.board[a.to];
  const who = `${playerName(shooter.color)}'s ${pieceName(shooter)}`;
  let desc;
  if (hitPiece && kill == null) desc = `${who} fired at your ${pieceName(target)}, but the bullet ricocheted off a king.`;
  else if (kill == null) desc = `${who} fired at your ${pieceName(target)} on ${R.sqName(a.to)} and missed.`;
  else if (hitPiece.color === shooter.color) desc = `${who} accidentally shot their own ${pieceName(hitPiece)} on ${R.sqName(kill)}.`;
  else if (kill === a.to) desc = `${who} shot your ${pieceName(hitPiece)} on ${R.sqName(kill)}.`;
  else desc = `${who} missed your ${pieceName(target)} but hit your ${pieceName(hitPiece)} on ${R.sqName(kill)}.`;
  const next = R.applyRaw(st, a, kill);
  await wait(kill != null ? 350 : 150);
  commit(next, {
    squares: new Set([a.from, ...(kill != null ? [kill] : [])]),
    line: { kind: 'shoot', hit: kill != null, a: { f: f.x + 4, r: 4 - f.z }, b: { f: res.end.x + 4, r: 4 - res.end.z } },
    desc,
  }, tok);
}

function commit(next, lastInfo, tok = gameToken) {
  if (tok !== gameToken) return; // a new game started while this action was animating
  st = next;
  last = lastInfo;
  lastDesc = lastInfo.desc || '';
  if (vsAI) {
    let diff = 0;
    for (const p of st.board) if (p && p.type !== 'k') diff += (p.color === human ? 1 : -1) * R.VALUE[p.type];
    progress.onMaterial(diff);
  }
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
  const tok = gameToken;
  if (vsAI && st.turn !== human) {
    busy = true;
    refresh();
    $('turn-text').textContent = `${DIFFICULTIES[difficulty].label} is aiming…`;
    await wait(550);
    while (paused && tok === gameToken) await wait(120);
    if (tok !== gameToken) return;
    const a = chooseAction(st, difficulty);
    if (!a) return;
    if (a.kind === 'move') await doMove(a, false);
    else await doShoot(a, R.aimCenter(st, a.to), DIFFICULTIES[difficulty].aim);
    return;
  }
  if (!vsAI) {
    busy = true;
    refresh();
    await wait(handoffOn ? 1100 : 650);
    if (tok !== gameToken) return;
    const id = sqOfId(remembered[st.turn]) >= 0 ? remembered[st.turn] : kingId(st.turn);
    if (handoffOn) {
      pendingTurn = id;
      showHandoff();
    } else beginLocalTurn(id);
    return;
  }
  busy = false;
  if (sqOfId(povId) < 0 || st.board[sqOfId(povId)].color !== human) setPov(kingId(human), { keepView: false });
  refresh();
}

function beginLocalTurn(id) {
  pendingTurn = null;
  viewMode = 'pov';
  busy = false;
  povId = null;
  setPov(id);
  banner(`${playerName(st.turn)}'s turn`);
}

// The cover screen between Pass & Play turns.
function showHandoff(opening = false) {
  const c = st.turn;
  $('ho-glyph').textContent = '♚\uFE0E';
  $('handoff').className = `screen handoff side-${c}`;
  $('ho-name').textContent = playerName(c);
  $('ho-turn').textContent = `${COLOR_NAME[c]} · turn ${Math.floor(st.ply / 2) + 1}`;
  $('ho-recap').textContent = opening
    ? `${names.w} (White) vs ${names.b} (Black). White moves first.`
    : lastDesc
      ? `Last turn: ${lastDesc}`
      : '';
  const k = R.findKing(st, c);
  const threatened = k >= 0 && R.attackedBy(st, k, R.other(c));
  $('ho-alert').classList.toggle('hidden', !threatened);
  $('ho-alert').textContent = st.mode === R.CLASSIC ? '⚠ Your king is in check!' : '⚠ Your king is in the line of fire!';
  $('btn-ready').textContent = `I'm ${playerName(c)}, start my turn`;
  showScreen('handoff');
}
function resumeGame() {
  showScreen(pendingTurn != null ? 'handoff' : 'game');
}
$('btn-ready').addEventListener('click', () => {
  sfx.click();
  showScreen('game');
  beginLocalTurn(pendingTurn);
});
$('btn-ho-pause').addEventListener('click', () => showScreen('pause'));

function gameOver(result) {
  const won = result.winner;
  let title = won ? `${COLOR_NAME[won]} wins` : 'Draw';
  if (!vsAI && won) title = `${playerName(won)} wins!`;
  if (vsAI && won) title = won === human ? 'You win!' : 'The computer wins';
  $('over-title').textContent = title;
  $('over-reason').textContent = result.reason[0].toUpperCase() + result.reason.slice(1) + '.';
  sfx.fanfare(!vsAI || won === human);
  renderSummary(progress.endGame(result));
  const tok = gameToken;
  setTimeout(() => {
    if (tok === gameToken && screen === 'game') showScreen('over');
  }, 1100);
}

// --- Game setup ----------------------------------------------------------------------------

function startGame() {
  sfx.unlock();
  gameToken++;
  tweens.length = 0;
  st = R.newGame(chosenMode);
  vsAI = chosenOpp === 'ai';
  human = vsAI ? (chosenSide === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : chosenSide) : 'w';
  graves = { w: [], b: [] };
  renderGraves();
  last = null;
  lastDesc = '';
  pendingTurn = null;
  busy = false;
  paused = false;
  placeAll();
  remembered.w = kingId('w');
  remembered.b = kingId('b');
  povId = null;
  viewMode = 'pov';
  started = true;
  progress.beginGame({ vsAI, human, difficulty, mode: chosenMode });
  showScreen('game');
  setPov(remembered[viewerColor()]);
  const modeLine = chosenMode === R.CLASSIC ? 'Classic: siege the king' : 'MerciZero: shoot the king';
  if (!vsAI && handoffOn) {
    // Start with the device in White's hands.
    pendingTurn = remembered.w;
    showHandoff(true);
    return;
  }
  banner(vsAI && human === 'b' ? 'You play Black' : modeLine, 1600);
  if (vsAI && human === 'b') nextTurn();
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
  const zoom = (fov / 70) * (settings.sens / 100);
  if (viewMode === 'pov') {
    yaw -= dx * 0.005 * zoom;
    pitch = Math.max(-1.25, Math.min(1.0, pitch - dy * 0.005 * zoom));
  } else {
    ovYaw -= dx * 0.006 * (settings.sens / 100);
    ovPitch = Math.max(0.2, Math.min(1.45, ovPitch + dy * 0.005 * (settings.sens / 100)));
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
  const k = e.key.toLowerCase();
  if (screen === 'title') return leaveTitle();
  if (k === 'escape') {
    // Close the topmost panel first.
    for (const id of ['promo', 'help', 'settings', 'badges']) {
      if (id === 'badges' && !$('shop').classList.contains('hidden')) return closeShop();
      if (id !== 'promo' && !$(id).classList.contains('hidden')) return closeOverlay(id);
    }
    if (screen === 'game') return showScreen('pause');
    if (screen === 'pause') return resumeGame();
    if (screen === 'handoff') return showScreen('pause');
    if (screen === 'setup') return showScreen('main-menu');
    return;
  }
  if (k === 'm') return setMusic(!sfx.music.enabled);
  if (screen !== 'game') return;
  if (k === 'v' || k === 'tab') {
    e.preventDefault();
    setOverview(viewMode !== 'over');
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

// --- Screens: title → main menu → setup → game, plus pause / settings / help overlays ------

const SCREENS = ['title', 'main-menu', 'setup', 'pause', 'over', 'handoff'];
let screen = 'title';
function showScreen(name) {
  screen = name;
  for (const id of SCREENS) $(id).classList.toggle('hidden', id !== name);
  $('hud').classList.toggle('hidden', name !== 'game' && name !== 'pause' && name !== 'over');
  paused = name !== 'game' && name !== 'over';
  $('btn-continue').classList.toggle('hidden', !(started && st && !st.result));
  if (name === 'pause') {
    const who = vsAI ? `vs ${DIFFICULTIES[difficulty].label}, you play ${COLOR_NAME[human]}` : `${names.w} (White) vs ${names.b} (Black)`;
    $('pause-info').textContent = `${st.mode === R.CLASSIC ? 'Classic' : 'MerciZero'} · ${who} · turn ${Math.floor(st.ply / 2) + 1}`;
  }
  if (name === 'main-menu') renderProfile();
  updateMood();
}
function closeOverlay(id) {
  $(id).classList.add('hidden');
}

function selectIn(containerId, attr, value) {
  for (const b of document.querySelectorAll(`#${containerId} .choice`)) b.classList.toggle('selected', b.dataset[attr] === value);
}

// Difficulty cards are generated from the AI's table.
$('diff-choices').innerHTML = Object.entries(DIFFICULTIES)
  .map(([key, d], i) => `<button class="choice" data-diff="${key}"><b>${'★'.repeat(i + 1)}${'☆'.repeat(3 - i)} ${d.label}</b><span>${d.blurb}</span></button>`)
  .join('');

function openSetup(opp) {
  sfx.click();
  chosenOpp = opp;
  $('setup-title').textContent = opp === 'ai' ? 'Play vs Computer' : 'Pass & Play';
  $('ai-options').classList.toggle('hidden', opp !== 'ai');
  $('local-options').classList.toggle('hidden', opp === 'ai');
  fillNames();
  $('opt-handoff').checked = handoffOn;
  selectIn('mode-choices', 'mode', chosenMode);
  selectIn('diff-choices', 'diff', difficulty);
  selectIn('side-choices', 'side', chosenSide);
  showScreen('setup');
}
// Pass & Play player names.
function cleanName(v, fallback) {
  const t = v.replace(/\s+/g, ' ').trim().slice(0, 16);
  return t || fallback;
}
function fillNames() {
  $('name-w').value = names.w;
  $('name-b').value = names.b;
}
function saveNames() {
  savePref('gunmate-name-w', names.w);
  savePref('gunmate-name-b', names.b);
}
function swapNames() {
  [names.w, names.b] = [names.b, names.w];
  saveNames();
  fillNames();
}
for (const c of ['w', 'b']) {
  $(`name-${c}`).addEventListener('input', () => {
    names[c] = cleanName($(`name-${c}`).value, c === 'w' ? 'Player 1' : 'Player 2');
    saveNames();
  });
  // Typing in a name shouldn't trigger game shortcuts (M, V, Q/E...).
  $(`name-${c}`).addEventListener('keydown', (e) => e.stopPropagation());
}
$('btn-swap').addEventListener('click', () => {
  sfx.click();
  swapNames();
});
$('opt-handoff').addEventListener('change', () => {
  handoffOn = $('opt-handoff').checked;
  savePref('gunmate-handoff', handoffOn ? '1' : '0');
});

for (const [id, attr, set] of [
  ['mode-choices', 'mode', (v) => { chosenMode = v; savePref('gunmate-mode', v); }],
  ['diff-choices', 'diff', (v) => { difficulty = v; savePref('gunmate-diff', v); }],
  ['side-choices', 'side', (v) => { chosenSide = v; savePref('gunmate-side', v); }],
]) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('.choice');
    if (!b) return;
    sfx.click();
    set(b.dataset[attr]);
    selectIn(id, attr, b.dataset[attr]);
  });
}

function leaveTitle() {
  if (screen !== 'title') return;
  sfx.unlock();
  sfx.click();
  showScreen('main-menu');
}
$('title').addEventListener('click', leaveTitle);
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) $('press').textContent = 'Tap to start';

$('btn-continue').addEventListener('click', resumeGame);
$('btn-vs-ai').addEventListener('click', () => openSetup('ai'));
$('btn-vs-local').addEventListener('click', () => openSetup('local'));
$('btn-howto').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btn-settings').addEventListener('click', () => $('settings').classList.remove('hidden'));
$('btn-to-title').addEventListener('click', () => showScreen('title'));
$('btn-start').addEventListener('click', startGame);
$('btn-setup-back').addEventListener('click', () => showScreen('main-menu'));
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart').addEventListener('click', startGame);
$('btn-pause-howto').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btn-pause-settings').addEventListener('click', () => $('settings').classList.remove('hidden'));
$('btn-quit').addEventListener('click', () => showScreen('main-menu'));
$('btn-menu').addEventListener('click', () => showScreen('pause'));
$('btn-settings-close').addEventListener('click', () => closeOverlay('settings'));

// Settings panel.
function applySettings() {
  sfx.music.setVolume(settings.musicVol / 100);
  sfx.setSfxVolume(settings.sfxVol / 100);
  $('hint').classList.toggle('hidden', !settings.hints);
}
for (const [id, key, pref] of [['vol-music', 'musicVol', 'gunmate-vol-music'], ['vol-sfx', 'sfxVol', 'gunmate-vol-sfx'], ['sens', 'sens', 'gunmate-sens']]) {
  $(id).value = settings[key];
  $(id).addEventListener('input', () => {
    settings[key] = +$(id).value;
    savePref(pref, settings[key]);
    applySettings();
  });
}
$('vol-sfx').addEventListener('change', () => sfx.gunshot('p'));
for (const [id, key, pref] of [['opt-cover', 'cover', 'gunmate-cover'], ['opt-hints', 'hints', 'gunmate-hints']]) {
  $(id).checked = settings[key];
  $(id).addEventListener('change', () => {
    settings[key] = $(id).checked;
    savePref(pref, settings[key] ? '1' : '0');
    applySettings();
    if (st) refresh();
  });
}
applySettings();

$('btn-view').addEventListener('click', () => setOverview(viewMode !== 'over'));
$('btn-help').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btn-help-close').addEventListener('click', () => $('help').classList.add('hidden'));
function setMusic(on) {
  sfx.music.setEnabled(on);
  $('btn-music').classList.toggle('off', !on);
  $('btn-music').title = on ? 'Music on (M)' : 'Music off (M)';
  savePref('gunmate-music', on ? '1' : '0');
}
setMusic(loadPref('gunmate-music', '1') === '1');
$('btn-music').addEventListener('click', () => setMusic(!sfx.music.enabled));
// Music needs a user gesture before it can start.
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// Battle mood: tense when the side you're playing has its king in an enemy gun's reach.
function updateMood() {
  if (!started || !st || st.result || screen !== 'game') return sfx.music.setMood(0);
  const k = R.findKing(st, viewerColor());
  sfx.music.setMood(k >= 0 && R.attackedBy(st, k, R.other(viewerColor())) ? 2 : 1);
}

$('btn-sound').addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  $('btn-sound').textContent = sfx.muted ? '🔇' : '🔊';
});
$('btn-again').addEventListener('click', () => {
  if (!vsAI) swapNames(); // fair rematch: the other player gets White
  startGame();
});
$('btn-over-menu').addEventListener('click', () => showScreen('main-menu'));
$('btn-over-look').addEventListener('click', () => {
  showScreen('game');
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

// --- XP, levels and badges UI --------------------------------------------------------------

const progress = new Progress((e) => {
  if (e.type === 'xp') xpPop(e.amount, e.label);
  else if (e.type === 'badge') toast(`<span class="t-icon">${e.badge.icon}</span><div><small>Badge unlocked · +${BADGE_XP} XP</small><b>${e.badge.name}</b><span>${e.badge.desc}</span></div>`, 'badge');
  else if (e.type === 'level') {
    toast(`<span class="t-icon lvl">${e.level}</span><div><small>Level up!</small><b>${e.rank}</b><span>You reached level ${e.level}.</span></div>`, 'level');
    sfx.fanfare(true);
  }
});

function toast(html, cls) {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = html;
  $('toasts').appendChild(el);
  sfx.click();
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4400);
}

// Little "+15 XP" floaters during play.
let popStack = 0;
function xpPop(amount, label) {
  if (screen !== 'game' && screen !== 'over') return;
  const el = document.createElement('div');
  el.className = 'xp-pop';
  el.style.top = `${30 + popStack * 5}%`;
  el.innerHTML = `<b>+${amount} XP</b> ${label}`;
  document.body.appendChild(el);
  popStack++;
  setTimeout(() => popStack--, 900);
  setTimeout(() => el.remove(), 1900);
}

function levelInfo(xp) {
  const level = levelOf(xp);
  const lo = xpForLevel(level);
  const hi = xpForLevel(level + 1);
  return { level, rank: rankOf(level), into: xp - lo, need: hi - lo, frac: (xp - lo) / (hi - lo) };
}

function renderProfile() {
  const p = progress.p;
  const L = levelInfo(p.xp);
  const unlocked = Object.keys(p.badges).length;
  $('pf-level').textContent = L.level;
  $('pf-rank').textContent = L.rank;
  $('pf-bar').style.width = `${L.frac * 100}%`;
  $('pf-xp').textContent = `${L.into} / ${L.need} XP`;
  $('pf-badges').textContent = `🏅 ${unlocked}/${BADGES.length}`;
  $('badge-count').textContent = `${unlocked} of ${BADGES.length} unlocked`;
  $('shop-menu-sub').textContent = `💰 ${progress.balance} XP to spend on skins`;
}

function renderBadges() {
  const p = progress.p;
  const s = p.stats;
  const L = levelInfo(p.xp);
  $('bd-level').textContent = L.level;
  $('bd-rank').textContent = L.rank;
  $('bd-bar').style.width = `${L.frac * 100}%`;
  $('bd-xp').textContent = `${p.xp} XP earned · 💰 ${progress.balance} to spend`;
  $('bd-next').textContent = `${L.need - L.into} XP to level ${L.level + 1}`;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const stats = [
    ['Games', s.games], ['Wins', s.wins], ['Losses', s.losses], ['Draws', s.draws],
    ['Kills', s.kills], ['Shots', s.shots], ['Accuracy', `${acc}%`], ['Best streak', s.bestStreak],
  ];
  $('bd-stats').innerHTML = stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  const unlocked = Object.keys(p.badges).length;
  $('bd-count').textContent = `Badges · ${unlocked} of ${BADGES.length}`;
  $('bd-grid').innerHTML = BADGES.map((b) => {
    const at = p.badges[b.id];
    let bar = '';
    if (b.progress && !at) {
      const [cur, goal] = b.progress(s, p);
      bar = `<div class="mini"><div style="width:${Math.min(100, (cur / goal) * 100)}%"></div></div><small>${Math.min(cur, goal)} / ${goal}</small>`;
    }
    const when = at ? `<small>Unlocked ${new Date(at).toLocaleDateString()}</small>` : '';
    return `<div class="badge ${at ? 'got' : 'locked'}"><div class="b-icon">${b.icon}</div><div><b>${b.name}</b><span>${b.desc}</span>${bar}${when}</div></div>`;
  }).join('');
}

function renderSummary(sum) {
  $('over-xp').classList.toggle('hidden', !sum);
  if (!sum) return;
  // Merge repeated lines ("Killed a pawn ×3").
  const lines = [];
  for (const l of sum.xp) {
    const same = lines.find((x) => x.label === l.label);
    if (same) {
      same.amount += l.amount;
      same.n++;
    } else lines.push({ ...l, n: 1 });
  }
  $('ov-lines').innerHTML =
    lines.map((l) => `<li><span>${l.label}${l.n > 1 ? ` ×${l.n}` : ''}</span><b>+${l.amount}</b></li>`).join('') ||
    '<li><span>No XP this game</span><b>+0</b></li>';
  const gained = sum.endXp - sum.startXp;
  $('ov-total').textContent = `+${gained} XP` + (sum.endLevel > sum.startLevel ? ` · Level up! ${sum.startLevel} → ${sum.endLevel}` : '');
  $('ov-badges').innerHTML = sum.badges
    .map((id) => {
      const b = BADGES.find((x) => x.id === id);
      return `<span class="chip" title="${b.desc}">${b.icon} ${b.name}</span>`;
    })
    .join('');
  // Animate the bar from where it started this game.
  const from = levelInfo(sum.startXp);
  const to = levelInfo(sum.endXp);
  $('ov-level').textContent = from.level;
  $('ov-rank').textContent = from.rank;
  const bar = $('ov-bar');
  bar.style.transition = 'none';
  bar.style.width = `${from.frac * 100}%`;
  setTimeout(() => {
    bar.style.transition = 'width 1.2s ease';
    bar.style.width = to.level > from.level ? '100%' : `${to.frac * 100}%`;
    if (to.level > from.level) {
      setTimeout(() => {
        $('ov-level').textContent = to.level;
        $('ov-rank').textContent = to.rank;
        bar.style.transition = 'none';
        bar.style.width = '0%';
        setTimeout(() => {
          bar.style.transition = 'width 0.8s ease';
          bar.style.width = `${to.frac * 100}%`;
        }, 30);
      }, 1250);
    }
  }, 1300);
}

$('btn-badges').addEventListener('click', () => {
  renderBadges();
  $('badges').classList.remove('hidden');
});
$('profile-card').addEventListener('click', () => $('btn-badges').click());
$('btn-badges-close').addEventListener('click', () => closeOverlay('badges'));
$('btn-reset-progress').addEventListener('click', () => {
  if (!confirm('Reset all XP, levels, stats and badges? This can’t be undone.')) return;
  progress.reset();
  applyEquipped();
  renderProfile();
});
renderProfile();

// --- Shop: spend XP on skins ----------------------------------------------------------------

let shopTab = 'pieces';
const preview = {}; // category -> skin id being previewed (not bought / equipped)
let needRebuild = false;

function rebuildPieces() {
  // Never swap meshes mid-animation: the tween would keep moving the old mesh.
  if (tweens.length) {
    needRebuild = true;
    return;
  }
  needRebuild = false;
  if (!st) return;
  placeAll();
  setViewGun();
}

function showSkin(cat, skin) {
  if (cat === 'pieces') {
    setPieceSkin(skin);
    rebuildPieces();
  } else if (cat === 'board') {
    applyBoardSkin(world, skin);
    if (st && started) refresh();
  } else {
    setGunSkin(skin);
    setViewGun();
  }
}
function applyEquipped() {
  for (const c of CATEGORIES) showSkin(c.key, findSkin(c.key, progress.p.equipped[c.key]));
}

function renderShop() {
  $('shop-balance').textContent = progress.balance;
  $('shop-tabs').innerHTML = CATEGORIES.map((c) => `<button class="tab ${c.key === shopTab ? 'on' : ''}" data-tab="${c.key}">${c.label}</button>`).join('');
  const cat = CATEGORIES.find((c) => c.key === shopTab);
  const equipped = progress.p.equipped[shopTab];
  $('shop-grid').innerHTML = cat.items
    .map((sk) => {
      const owned = progress.owns(sk);
      const isEq = sk.id === equipped;
      const can = progress.canBuy(sk);
      let action;
      if (isEq) action = '<span class="state eq">✓ Equipped</span>';
      else if (owned) action = `<button class="act equip" data-equip="${sk.id}">Equip</button>`;
      else if (can.ok) action = `<button class="act buy" data-buy="${sk.id}">Buy · ${sk.price} XP</button>`;
      else action = `<span class="state locked">${sk.level && progress.level < sk.level ? '🔒 ' : ''}${can.why}</span>`;
      const price = owned ? (sk.price ? 'Owned' : 'Free') : `${sk.price} XP${sk.level ? ` · Lv ${sk.level}` : ''}`;
      const dots = swatches(shopTab, sk).map((c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
      return `<div class="skin ${isEq ? 'equipped' : ''} ${preview[shopTab] === sk.id ? 'previewing' : ''} ${owned ? 'owned' : ''}" data-preview="${sk.id}">
        <div class="sw">${dots}</div>
        <div class="info"><b>${sk.name}</b><span>${sk.desc}</span><small>${price}</small></div>
        <div class="buy-col">${action}</div>
      </div>`;
    })
    .join('');
}

function openShop() {
  sfx.click();
  for (const k of Object.keys(preview)) delete preview[k];
  renderShop();
  $('shop').classList.remove('hidden');
  $('main-menu').classList.add('hidden');
}
function closeShop() {
  // Drop any previews of skins that weren't bought and equipped.
  for (const c of CATEGORIES) if (preview[c.key]) showSkin(c.key, findSkin(c.key, progress.p.equipped[c.key]));
  for (const k of Object.keys(preview)) delete preview[k];
  $('shop').classList.add('hidden');
  showScreen('main-menu');
}

$('shop-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (!t) return;
  sfx.click();
  shopTab = t.dataset.tab;
  renderShop();
});
$('shop-grid').addEventListener('click', (e) => {
  const cat = CATEGORIES.find((c) => c.key === shopTab);
  const buyBtn = e.target.closest('[data-buy]');
  const eqBtn = e.target.closest('[data-equip]');
  const card = e.target.closest('[data-preview]');
  if (buyBtn) {
    const sk = cat.items.find((x) => x.id === buyBtn.dataset.buy);
    if (progress.buy(sk)) {
      progress.equip(shopTab, sk);
      delete preview[shopTab];
      showSkin(shopTab, sk);
      sfx.fanfare(true);
      renderProfile();
    }
  } else if (eqBtn) {
    const sk = cat.items.find((x) => x.id === eqBtn.dataset.equip);
    progress.equip(shopTab, sk);
    delete preview[shopTab];
    showSkin(shopTab, sk);
    sfx.click();
  } else if (card) {
    const sk = cat.items.find((x) => x.id === card.dataset.preview);
    preview[shopTab] = sk.id;
    showSkin(shopTab, sk);
    sfx.click();
  }
  renderShop();
});
$('btn-shop').addEventListener('click', openShop);
$('btn-shop-close').addEventListener('click', closeShop);
applyEquipped();

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
  if (needRebuild && tweens.length === 0) rebuildPieces();

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
window.__gunmate = { state: () => st, legal: () => (st ? R.legalActions(st) : []), busy: () => busy, music: sfx.music, progress: () => progress, tile: (i) => { const m = tiles[i].material; return { c: m.color.getHexString(), e: m.emissive.getHexString(), ei: m.emissiveIntensity, r: m.roughness }; }, cam: () => ({ pos: camera.position.toArray().map((v) => +v.toFixed(2)), povId, viewMode, yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2) }) };

// Show the board (slowly orbiting) behind the menu.
st = R.newGame(R.CLASSIC);
placeAll();
viewMode = 'over';
ovPitch = 0.6;
frame();
