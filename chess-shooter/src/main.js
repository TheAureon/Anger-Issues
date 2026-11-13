// Gunmate: chess where pieces shoot instead of capture, played from the pieces' own eyes.
import * as THREE from 'three';
import './style.css';
import * as R from './rules.js';
import { chooseAction, DIFFICULTIES } from './ai.js';
import { buildPiece, buildViewGun, setEnvMap, setPieceSkin, setGunSkin, goldTrim } from './pieces.js';
import { CATEGORIES, findSkin, swatches } from './skins.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildWorld, applyBoardSkin, applyArena } from './world.js';
import { Fx } from './fx.js';
import * as sfx from './audio.js';
import { Minimap } from './minimap.js';
import { icon, pieceIcon, hydrateIcons } from './icons.js';
import {
  Progress, BADGES, BADGE_XP, CONTRACTS, TITLES, PERKS, PRESTIGE_LEVEL, MASTERY_TIERS, MASTERY_REWARDS,
  masteryTier, dayKey, xpForLevel, levelOf, rankOf,
} from './progress.js';
import { puzzleBattle, weeklyBattle, gauntletBattle, puzzleFor, weeklyFor, weekKey, GAUNTLET, GAUNTLET_XP, PUZZLE_XP, WEEKLY_XP } from './challenges.js';
import { TRACKS } from './music.js';
import { LIBRARY, PACKS, WEEKLY_PUZZLE_XP, HINT_COST, goalText, puzzleToBattle, weeklyPuzzle, encodePuzzle, decodePuzzle, parseSq } from './puzzles.js';
import { genDrill, genBestTarget } from './puzzlegen.js';
import { BATTLES, CHAPTERS, starGoals } from './campaign.js';

const $ = (id) => document.getElementById(id);
hydrateIcons();

// --- UsForge leaderboard -------------------------------------------------------------------
// Reports a final score to the UsForge page this game is embedded in. Does nothing when the game
// is opened on its own. UsForge asks for the nickname and shows the board, so the game doesn't.
function sendScoreToUsForge(score) {
  // only when running inside UsForge's page; does nothing when the game is opened on its own
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ usforge: 'score', score: Math.round(score), unit: 'points' }, '*');
  } catch (e) {}
}
window.sendScoreToUsForge = sendScoreToUsForge;
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
const coverRoot = new THREE.Group(); // crates
const smokeRoot = new THREE.Group(); // smoke clouds
scene.add(coverRoot, smokeRoot);
const crateGeo = new THREE.BoxGeometry(0.72, 0.62, 0.72);
const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3c, roughness: 0.85, flatShading: true });
const crateBandMat = new THREE.MeshStandardMaterial({ color: 0x5e3d20, roughness: 0.9, flatShading: true });
const smokeGeo = new THREE.IcosahedronGeometry(0.32, 0);
const smokeMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, transparent: true, opacity: 0.5, depthWrite: false, flatShading: true });
const hintMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
const owMat = new THREE.MeshBasicMaterial({ color: 0x5cc8ff });
const smokeTargetMat = new THREE.MeshBasicMaterial({ color: 0xbfc4cc, transparent: true, opacity: 0.7, depthWrite: false });
let smokeKey = '';
function buildCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(crateGeo, crateMat);
  box.position.y = 0.31;
  box.castShadow = box.receiveShadow = true;
  g.add(box);
  for (const y of [0.08, 0.54]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 0.75), crateBandMat);
    band.position.y = y;
    g.add(band);
  }
  const x = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.07, 0.07), crateBandMat);
  x.position.set(0, 0.31, 0.37);
  x.rotation.z = 0.7;
  g.add(x);
  return g;
}
function renderSmoke() {
  const key = st && st.smoke ? st.smoke.map((c) => c.sq).join(',') : '';
  if (key === smokeKey) return;
  smokeKey = key;
  smokeRoot.clear();
  if (!st || !st.smoke) return;
  for (const c of st.smoke) {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const s = R.sqAt(R.fileOf(c.sq) + df, R.rankOf(c.sq) + dr);
        if (s < 0) continue;
        const w = R.toWorld(s);
        for (let i = 0; i < 2; i++) {
          const m = new THREE.Mesh(smokeGeo, smokeMat);
          m.position.set(w.x + (Math.random() - 0.5) * 0.4, 0.35 + i * 0.45 + Math.random() * 0.2, w.z + (Math.random() - 0.5) * 0.4);
          m.scale.setScalar(0.9 + Math.random() * 0.8);
          m.userData.seed = Math.random() * 10;
          smokeRoot.add(m);
        }
      }
    }
  }
}
scene.add(markerRoot);
const moveGeo = new THREE.CircleGeometry(0.1, 24).rotateX(-Math.PI / 2);
const moveRingGeo = new THREE.RingGeometry(0.25, 0.3, 40).rotateX(-Math.PI / 2);
const moveMat = new THREE.MeshBasicMaterial({ color: 0xc8ffe0, transparent: true, opacity: 0.85, depthWrite: false });
const moveRingMat = new THREE.MeshBasicMaterial({ color: 0x5ee39a, transparent: true, opacity: 0.55, depthWrite: false });
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
  fog: new THREE.Color(0x15161f),
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
// Puzzles, replays and abilities.
const PRACTICE = new Set(['library', 'code', 'test', 'wpuzzle', 'rush']); // no normal XP or contracts
let hintLevel = 0; // 0 none, 1 piece shown, 2 piece + square shown
let oddsPick = null; // { ok, chosen, best, bestDesc } for Odds puzzles
let abilityMode = null; // 'smoke' while choosing where to throw
let replaying = false;
let history = null; // { start, events: [...] } of the current game
let scoped = false; // sniper scope
// Optional variants for normal games (setup screen): cover crates, weather, tactics abilities.
const variants = {
  cover: loadPref('gunmate-v-cover', '0') === '1',
  weather: loadPref('gunmate-v-weather', 'clear'),
  tactics: loadPref('gunmate-v-tactics', '0') === '1',
};
// Per-game opponent and campaign state.
let battle = null; // current campaign battle, or null
let aiLevel = 'normal'; // difficulty key or config object for chooseAction
let aiName = 'Soldier';
let xpLevel = 'normal'; // difficulty key used for XP and badges
// Fog of War: whose eyes the fog follows, and what's hidden from them (refreshed every refresh()).
let fogView = 'w';
let fogHidden = new Set();
let fogVisible = null; // Set of visible squares, or null when there's no fog
const MODE_LABEL = { classic: 'Classic', mercizero: 'MerciZero', fog: 'Fog of War' };
const MODE_LINE = { classic: 'Classic · siege the king', mercizero: 'MerciZero · kings can die', fog: 'Fog of War · shoot the king' };
let gameToken = 0; // bumps on every new game so stale async turns stop
const settings = {
  musicVol: +loadPref('gunmate-vol-music', '70'),
  sfxVol: +loadPref('gunmate-vol-sfx', '90'),
  sens: +loadPref('gunmate-sens', '100'),
  cover: loadPref('gunmate-cover', '1') === '1',
  hints: loadPref('gunmate-hints', '1') === '1',
  killcam: loadPref('gunmate-killcam', '1') === '1',
  track: loadPref('gunmate-track', 'march'),
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
const playerName = (c) => (vsAI ? (c === human ? 'You' : aiName) : names[c] || COLOR_NAME[c]);
const pieceName = (p) => R.NAMES[p.type].toLowerCase();
const possessive = (c) => (playerName(c) === 'You' ? 'Your' : `${playerName(c)}'s`);
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
  const yours = !started ? p.color === 'w' : vsAI ? p.color === human : true;
  if (yours && masteryTier(progress.p.mastery[p.type]) >= 5) goldTrim(g);
  return g;
}

// Mastery III: coloured tracer rounds per piece type.
const TRACER_COLORS = { p: 0x6dff8a, n: 0xc07bff, b: 0x5ce8ff, r: 0xff5a4a, q: 0xff6ad5, k: 0xffd34d };
function placeAll() {
  for (const g of groups.values()) scene.remove(g);
  groups.clear();
  coverRoot.clear();
  for (const c of (st && st.cover) || []) {
    const w = R.toWorld(c);
    const crate = buildCrate();
    crate.position.set(w.x, 0, w.z);
    crate.rotation.y = (c % 3) * 0.06;
    coverRoot.add(crate);
  }
  smokeKey = 'x';
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
let killcam = null; // { head, dir } while the kill-cam follows a bullet
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
    _euler.set(pitch + swayP, yaw + swayY, 0, 'YXZ');
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

function setPov(id, { keepView = false, stay = false } = {}) {
  const s = sqOfId(id);
  if (s < 0) return;
  const p = st.board[s];
  const changed = id !== povId;
  povId = id;
  remembered[p.color] = id;
  if (stay && viewMode === 'over') {
    // Select the piece without leaving the overview camera (Puzzle Rush, replays).
    setViewGun();
    refresh();
    return;
  }
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
  const hit = R.castRay(st, o, d, 200, skip, fogHidden);
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
      const range = R.rulesOf(st).sliderRange;
      if (aligned && Math.max(df, dr) > range) return `Out of range: ${R.NAMES[t].toLowerCase()}s shoot only ${range} squares.`;
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

const GRAVE_ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4, k: 5 };
const GRAVE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function renderGraves() {
  const lost = { w: 0, b: 0 };
  for (const c of ['w', 'b']) {
    const list = [...graves[c]].sort((x, y) => GRAVE_ORDER[x] - GRAVE_ORDER[y]);
    for (const t of list) lost[c] += GRAVE_VAL[t];
    $(`grave-${c}`).innerHTML = list.map((t) => pieceIcon(t, c)).join('');
  }
  // Material lead shown on the side that lost less.
  const lead = lost.b - lost.w;
  if (lead > 0) $('grave-b').insertAdjacentHTML('beforeend', `<span class="lead">+${lead}</span>`);
  if (lead < 0) $('grave-w').insertAdjacentHTML('beforeend', `<span class="lead">+${-lead}</span>`);
  $('graves').classList.toggle('hidden', !graves.w.length && !graves.b.length);
}

// --- Refresh markers, tiles, HUD, minimap --------------------------------------------------

let current = { from: -1, moves: [], targets: [], coverage: new Set() };

function updateFog() {
  if (st && started && st.mode === R.FOG && !st.result && !replaying) {
    fogVisible = R.visibleSquares(st, fogView);
    fogHidden = R.hiddenEnemySquares(st, fogView);
  } else {
    fogVisible = null;
    fogHidden = new Set();
  }
  hiddenIds.clear();
  for (const s of fogHidden) hiddenIds.add(st.board[s].id);
}
const hiddenIds = new Set();
// What the current viewer can see on a square (hidden enemies read as empty).
const seen = (sq) => (fogHidden.has(sq) ? null : st.board[sq]);
const myTurnsSoFar = () => (human === 'w' ? Math.ceil(st.ply / 2) : Math.floor(st.ply / 2));

function refresh() {
  if (!st) return;
  updateFog();
  for (const d of diamonds) markerRoot.remove(d);
  diamonds = [];
  markerRoot.clear();

  const from = sqOfId(povId);
  const mine = from >= 0 && st.board[from].color === st.turn && humanTurn() && !busy;
  const acts = mine ? R.legalActions(st, from) : [];
  current = {
    from,
    moves: acts.filter((a) => a.kind === 'move').map((a) => a.to),
    targets: acts.filter((a) => a.kind === 'shoot' && !fogHidden.has(a.to)).map((a) => a.to),
    coverage: new Set(from >= 0 && !busy && settings.cover ? R.gunCoverage(st, from) : []),
  };
  for (const s of current.moves) {
    const w = R.toWorld(s);
    const dot = new THREE.Mesh(moveGeo, moveMat);
    const ring = new THREE.Mesh(moveRingGeo, moveRingMat);
    dot.position.set(w.x, 0.012, w.z);
    ring.position.set(w.x, 0.011, w.z);
    markerRoot.add(dot, ring);
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
  if (!fogVisible && k >= 0 && R.attackedBy(st, k, R.other(st.turn))) checkSq = k;

  // Tiles. In fog, squares you can't see are darkened.
  const lastSet = last ? last.squares : new Set();
  for (let s = 0; s < 64; s++) {
    const t = tiles[s];
    t.material.color.copy(t.userData.baseColor);
    if (current.coverage.has(s)) t.material.color.lerp(TINT.cover, 0.22);
    if (lastSet.has(s) && (!fogVisible || fogVisible.has(s))) t.material.color.lerp(TINT.last, 0.4);
    if (s === checkSq) t.material.color.lerp(TINT.check, 0.55);
    if (fogVisible && !fogVisible.has(s)) t.material.color.lerp(TINT.fog, 0.62);
  }

  // Smoke clouds, overwatch, hints and smoke-throw targets.
  renderSmoke();
  const owSquares = new Set();
  for (const c of ['w', 'b']) {
    const ow = st.overwatch && st.overwatch[c];
    if (!ow) continue;
    const rs = sqOfId(ow.id);
    if (rs < 0 || fogHidden.has(rs)) continue;
    for (const q of R.gunCoverage(st, rs)) owSquares.add(q);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 4, 16), owMat);
    ring.rotation.x = Math.PI / 2;
    const w = R.toWorld(rs);
    ring.position.set(w.x, R.DIMS.r.h + 0.25, w.z);
    markerRoot.add(ring);
  }
  for (const q of owSquares) tiles[q].material.color.lerp(TINT.active, 0.3);
  current.hint = null;
  if (battle && battle.hint && hintLevel > 0 && !st.result) {
    const hf = parseSq(battle.hint.from);
    const ht = parseSq(battle.hint.to);
    current.hint = { from: hf, to: hintLevel > 1 ? ht : -1 };
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 4, 24), hintMat);
    r1.rotation.x = Math.PI / 2;
    const w1 = R.toWorld(hf);
    r1.position.set(w1.x, 0.03, w1.z);
    markerRoot.add(r1);
    if (hintLevel > 1 && battle.puzzle && battle.puzzle.aim) {
      const a = battle.puzzle.aim;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), hintMat);
      dot.position.set(a.x, a.y, a.z);
      markerRoot.add(dot);
    }
    if (hintLevel > 1) {
      const w2 = R.toWorld(ht);
      const d = new THREE.Mesh(diamondGeo, hintMat);
      d.position.set(w2.x, (st.board[ht] ? R.DIMS[st.board[ht].type].h : 0.2) + 0.5, w2.z);
      d.scale.setScalar(1.8);
      markerRoot.add(d);
    }
  }
  current.smokeTargets = [];
  if (abilityMode === 'smoke' && mine) {
    current.smokeTargets = R.abilityActions(st, from).filter((a) => a.kind === 'smoke').map((a) => a.to);
    for (const q of current.smokeTargets) {
      const w = R.toWorld(q);
      const m = new THREE.Mesh(moveRingGeo, smokeTargetMat);
      m.position.set(w.x, 0.013, w.z);
      markerRoot.add(m);
    }
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
      ? `${COLOR_NAME[st.turn]} to play${st.turn !== human ? ` (${aiName})` : ''}`
      : `${playerName(st.turn)} (${COLOR_NAME[st.turn]}) to play`;
  $('turn-badge').innerHTML = pieceIcon('k', st.turn);
  $('turn').className = `glass turn-${st.turn}`;
  let tag = MODE_LINE[st.mode] + (vsAI ? ` · vs ${aiName}` : ' · pass & play');
  const extras = [st.cover && 'Cover', st.weather && st.weather.wind && 'Wind', st.weather && st.weather.rain && 'Rain', st.tactics && 'Tactics'].filter(Boolean);
  if (extras.length) tag += ' · ' + extras.join(' · ');
  if (battle) {
    tag = battle.kind ? `${battle.name} · ${MODE_LABEL[st.mode]}` : `Campaign · ${battle.name} · ${MODE_LABEL[st.mode]}`;
    if (battle.goal) tag = `${battle.name} · ${goalText(battle.goal, st)}${st.rules && st.rules.spreadMul === 0 ? ' · sure-shot' : ''}`;
    if (battle.kind === 'rush') tag = `Puzzle Rush · ${battle.prompt}`;
    if (battle.turnLimit) {
      const left = Math.max(0, battle.turnLimit - myTurnsSoFar());
      tag += ` · ${left} turn${left === 1 ? '' : 's'} left`;
    }
  }
  $('mode-tag').textContent = tag;
  $('mode-tag').className = st.mode;

  // Piece card.
  if (from >= 0) {
    const p = st.board[from];
    $('card-icon').innerHTML = pieceIcon(p.type, p.color);
    $('card-title').textContent = R.NAMES[p.type];
    $('card-sq').textContent = `on ${R.sqName(from)}`;
    $('card-move').textContent = R.MOVE_TEXT[p.type];
    $('card-gun').textContent = R.weaponText(p.type, st);
    const nm = current.moves.length;
    const nt = current.targets.length;
    $('card-count').innerHTML = mine
      ? `<span class="cnt mv" title="Squares it can move to">${nm}<small>move${nm === 1 ? '' : 's'}</small></span><span class="cnt tg ${nt ? 'on' : ''}" title="Enemies in range">${nt}<small>target${nt === 1 ? '' : 's'}</small></span>`
      : '';
    const ab = mine && st.tactics ? acts.find((a) => a.kind === 'overwatch' || a.kind === 'smoke') : null;
    $('card-ability').classList.toggle('hidden', !ab);
    if (ab) {
      $('card-ability').textContent = ab.kind === 'overwatch' ? '👁 Overwatch (uses your turn)' : abilityMode === 'smoke' ? '✕ Cancel smoke' : '💨 Throw smoke';
      $('card-ability').classList.toggle('on', abilityMode === 'smoke');
    }
  } else $('card-ability').classList.add('hidden');
  $('minimap').classList.toggle('flip', false);
  minimap.flip = viewerColor() === 'b';
  $('btn-view').classList.toggle('on', viewMode === 'over');
  updateHintButton();
  $('btn-scope').classList.toggle('hidden', !(started && viewMode === 'pov' && !replaying && !(battle && battle.kind === 'rush')));
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
    lastSquares: last ? (fogVisible ? new Set([...last.squares].filter((q) => fogVisible.has(q))) : last.squares) : null,
    last: last && (!fogVisible || [...last.squares].every((q) => fogVisible.has(q))) ? last.line : null,
    fog: fogVisible,
    hidden: fogHidden,
    checkSq: !fogVisible && checkK >= 0 && R.attackedBy(st, checkK, R.other(st.turn)) ? checkK : -1,
    cover: st.cover || null,
    smoke: st.smoke && st.smoke.length ? (q) => R.smokeAt(st, q) : null,
    hint: current.hint || null,
    smokeTargets: current.smokeTargets || null,
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
  const p = seen(s);
  const from = current.from;
  let text = '';
  let cls = '';
  if (p && p.color === viewerColor() && p.id !== povId) {
    text = `${icon('eye')}See through ${R.NAMES[p.type].toLowerCase()}`;
    canvas.style.cursor = 'pointer';
  } else if (current.moves.includes(s)) {
    text = `${icon('boot')}Move to ${R.sqName(s)}`;
    cls = 'move';
    canvas.style.cursor = 'pointer';
  } else if (current.targets.includes(s)) {
    const aim = !hover.fromMap && viewMode === 'pov' && hover.point && hover.pointPiece ? hover.point : R.aimCenter(st, s);
    const key = `${from}-${s}-${aim.x.toFixed(2)}-${aim.y.toFixed(2)}-${aim.z.toFixed(2)}`;
    if (chanceCache.key !== key) chanceCache = { key, v: R.hitChance(st, from, s, aim, 220) };
    text = `${icon('target')}Shoot ${R.NAMES[p.type].toLowerCase()} <b class="pct">${Math.round(chanceCache.v * 100)}%</b>`;
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
  tip.innerHTML = text; // built only from piece names, squares and icons
  tip.className = cls;
  const x = Math.min(window.innerWidth - 240, hover.x + 16);
  tip.style.left = `${x}px`;
  tip.style.top = `${hover.y + 18}px`;
}

// --- Actions -------------------------------------------------------------------------------

function onSquare(sq, aim = null) {
  if (!st || st.result) return;
  if (replaying) return;
  const p = seen(sq);
  const rush = battle && battle.kind === 'rush';
  if (abilityMode === 'smoke' && !busy && humanTurn()) {
    const from0 = sqOfId(povId);
    const a0 = R.abilityActions(st, from0).find((a) => a.kind === 'smoke' && a.to === sq);
    abilityMode = null;
    if (a0) return doAbility(a0, true);
    refresh();
    if (!p || p.color !== viewerColor()) return status('Smoke cancelled.', 'warn');
  }
  if (p && p.color === viewerColor()) {
    if (p.id !== povId || (viewMode !== 'pov' && !rush)) {
      sfx.click();
      setPov(p.id, { stay: rush });
    }
    return;
  }
  if (busy || !humanTurn()) return;
  const from = sqOfId(povId);
  if (from < 0) return;
  const acts = R.legalActions(st, from);
  if (rush) {
    const a = acts.find((x) => x.to === sq && (x.kind === 'move' || x.kind === 'shoot'));
    if (a) return rushPick(a, aim);
    return status('Pick one of your pieces, then its target.', 'warn');
  }
  const mv = acts.find((a) => a.kind === 'move' && a.to === sq);
  if (mv) return doMove(mv, true);
  const sh = acts.find((a) => a.kind === 'shoot' && a.to === sq);
  if (sh) {
    const useAim = aim || R.aimCenter(st, sq);
    if (battle && battle.goal && battle.goal.type === 'odds') oddsPick = gradeOdds(from, sq, useAim);
    return doShoot(sh, useAim, 1, true);
  }
  if (fogHidden.has(sq)) return status('Something is blocking that square in the fog.', 'warn');
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
  if (!replaying && history) history.events.push({ type: 'move', a });
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
  if (!replaying) progress.onMove({ mine: byHuman, castle: !!a.castle, promo: !!a.promo });
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
  if (st.mode === R.FOG && !R.visibleSquares(next, R.other(p.color)).has(a.to)) desc = `${playerName(p.color)} moved a piece somewhere in the fog.`;
  commit(next, {
    squares: new Set([a.from, a.to]),
    line: { kind: 'move', a: { f: f.x + 4, r: 4 - f.z }, b: { f: to.x + 4, r: 4 - to.z } },
    desc,
    action: a,
    by: byHuman ? 'human' : 'ai',
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

async function doShoot(a, aim, spreadMul, mine = false, opts = {}) {
  const tok = gameToken;
  busy = true;
  refresh();
  const shooter = st.board[a.from];
  const g = groups.get(shooter.id);
  const chance = opts.chance ?? (mine && !replaying ? R.hitChance(st, a.from, a.to, aim, 120, spreadMul) : 1);
  const res = opts.forced || R.simulateShot(st, a.from, aim, Math.random, spreadMul);
  if (!replaying && history) history.events.push({ type: 'shoot', a, aim, res, mine, chance, snap: R.clone(st) });
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
  const target0 = res.hit != null ? st.board[res.hit] : null;
  const dist0 = Math.max(Math.abs(R.fileOf(a.to) - R.fileOf(a.from)), Math.abs(R.rankOf(a.to) - R.rankOf(a.from)));
  const lethal = target0 && target0.color !== shooter.color && !(target0.type === 'k' && st.mode === R.CLASSIC);
  const useCam = opts.killcam || (!replaying && settings.killcam && progress.perk('killcam') && lethal && ((mine && dist0 >= 3) || target0.type === 'k') && !fogHidden.has(a.from));
  const tracerColor = mine && masteryTier(progress.p.mastery[shooter.type]) >= 3 ? TRACER_COLORS[shooter.type] : null;
  if (useCam) {
    // Kill-cam: follow the bullet in slow motion.
    killcam = { head: start.clone(), dir: end.clone().sub(start).normalize() };
    await fx.tracer(start, end, 6, tracerColor, (h, d) => {
      killcam.head.copy(h);
      killcam.dir.copy(d);
    });
  } else await fx.tracer(start, end, 38, tracerColor);
  if (tok !== gameToken) return;

  let kill = null;
  let victimDesc = '';
  const hitPiece = res.hit != null ? st.board[res.hit] : null;
  if (!replaying && mine && hitPiece && hitPiece.color !== shooter.color && !(hitPiece.type === 'k' && st.mode === R.CLASSIC)) {
    enemyMaterialShot += LB_MATERIAL[hitPiece.type];
  }
  if (!replaying) progress.onShot({
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
    if (res.cover != null) {
      fx.sparks(end, 12, 0x9a6a3a);
      fx.dust(end, 5);
      status('Blocked! The crate stopped the bullet.', 'warn');
    } else status(res.ground ? 'Missed! The bullet hit the floor.' : 'Missed! The bullet flew past.', 'warn');
  }
  if (killcam) {
    await wait(650);
    killcam = null;
    startTransition(0.45);
  }
  turnTo(g, FORWARD_YAW[shooter.color], 0.4);
  const f = R.toWorld(a.from);
  const target = st.board[a.to];
  const who = `${possessive(shooter.color)} ${pieceName(shooter)}`;
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
    action: a,
    by: mine ? 'human' : 'ai',
  }, tok);
}

function commit(next, lastInfo, tok = gameToken) {
  if (tok !== gameToken) return; // a new game started while this action was animating
  st = next;
  last = lastInfo;
  lastDesc = lastInfo.desc || '';
  if (replaying) {
    busy = false;
    refresh();
    return;
  }
  if (battle && battle.kind === 'rush') {
    refresh();
    rushAfter();
    return;
  }
  if (vsAI) {
    let diff = 0;
    for (const p of st.board) if (p && p.type !== 'k') diff += (p.color === human ? 1 : -1) * R.VALUE[p.type];
    progress.onMaterial(diff);
  }
  let result = R.judge(st) || goalResult(lastInfo);
  if (result) {
    st.result = result;
    busy = false;
    refresh();
    gameOver(result);
    return;
  }
  // Overwatch: a rook watching for exactly this move fires before the turn passes.
  const act = lastInfo.action;
  if (act && act.kind === 'move') {
    const rookSq = R.overwatchShooter(st, st.turn, act.to);
    if (rookSq >= 0) {
      fireOverwatch(rookSq, act.to, tok);
      return;
    }
  }
  afterCommit();
}

function afterCommit() {
  // If the piece we were looking through died, fall back to the king.
  for (const c of ['w', 'b']) if (sqOfId(remembered[c]) < 0) remembered[c] = kingId(c);
  if (sqOfId(povId) < 0) {
    povId = remembered[viewerColor()];
    setViewGun();
    startTransition(0.9);
  }
  const k = R.findKing(st, st.turn);
  if (st.mode !== R.FOG && k >= 0 && R.attackedBy(st, k, R.other(st.turn))) {
    sfx.check();
    if (st.mode === R.CLASSIC) status(`Check! ${COLOR_NAME[st.turn]} king is under siege.`, 'bad');
    else status(`${COLOR_NAME[st.turn]} king is in the line of fire!`, 'bad');
  }
  nextTurn();
}

// Library / code / editor-test / weekly puzzle results on the game-over screen.
function renderPuzzleResult(solved) {
  if (!battle || !['library', 'code', 'test', 'wpuzzle'].includes(battle.kind)) return;
  const el = $('ov-challenge');
  const next = $('btn-next-battle');
  let html = '';
  if (battle.kind === 'library') {
    if (solved) {
      const r = progress.recordLibrary(battle.id, { hints: hintLevel > 0 });
      const n = r.stars;
      html = `<span class="lib-stars">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span> ${n === 3 ? 'Perfect!' : hintLevel ? 'Solve it without hints for more stars.' : 'Solve it first try for 3 stars.'}`;
    } else {
      progress.failLibrary(battle.id);
      html = `Not this time. ${battle.hint ? 'Stuck? Try a hint (top bar).' : ''}`;
    }
    const i = LIBRARY.findIndex((x) => x.id === battle.id);
    const nx = LIBRARY[i + 1];
    if (solved && nx) {
      next.classList.remove('hidden');
      next.lastChild.textContent = 'Next puzzle';
      next.dataset.next = nx.id;
    }
  } else if (battle.kind === 'wpuzzle') {
    html = !solved ? 'The puzzle of the week stays the same until Monday.' : progress.solveWeeklyPuzzle(weekKey()).already ? 'Solved again! (This week’s reward was already claimed.)' : `Puzzle of the week: <b>+${WEEKLY_PUZZLE_XP} XP</b>`;
  } else if (battle.kind === 'test') {
    html = solved ? 'Your puzzle works! Copy its code from the editor to share it.' : 'Your puzzle wasn’t solved this time. Is it possible? Try again or tweak it.';
    next.classList.remove('hidden');
    next.lastChild.textContent = 'Back to the editor';
    next.dataset.next = 'editor';
  } else html = solved ? 'Solved! Share the code with a friend.' : 'Try again: the code always gives the same puzzle.';
  el.innerHTML = html;
  el.classList.remove('hidden');
}

// Odds puzzles: compare the chosen shot's chance with the best shot on the board.
function gradeOdds(from, to, aim) {
  const chosen = R.hitChance(st, from, to, aim, 400);
  let best = { chance: 0 };
  for (const a of R.legalActions(st)) {
    if (a.kind !== 'shoot') continue;
    const c = R.hitChance(st, a.from, a.to, R.aimCenter(st, a.to), 400);
    if (c > best.chance) best = { chance: c, a };
  }
  const bestDesc = best.a ? `${R.NAMES[st.board[best.a.from].type].toLowerCase()} on ${R.sqName(best.a.from)} at the ${R.NAMES[st.board[best.a.to].type].toLowerCase()} on ${R.sqName(best.a.to)}` : '';
  return { ok: chosen >= best.chance - 0.04, chosen, best: best.chance, bestDesc };
}

// Puzzle and battle goals beyond "shoot the king": kill a target, survive, promote, pick the best
// odds, and deadlines.
function goalResult(info) {
  if (!battle) return null;
  const g = battle.goal || { type: 'king', n: battle.turnLimit || 0 };
  const humanActed = st.turn !== human;
  const win = (reason) => ({ winner: human, reason });
  const lose = (reason) => ({ winner: R.other(human), reason });
  if (g.type === 'kill' && !st.board.some((p) => p && p.id === battle.targetId)) return win('target down');
  if (g.type === 'promote' && info.by === 'human' && info.action && info.action.promo) return win('pawn promoted');
  if (g.type === 'odds' && humanActed && oddsPick) {
    const p = oddsPick;
    oddsPick = null;
    return p.ok
      ? win(`${Math.round(p.chosen * 100)}% was the best shot on the board`)
      : lose(`the best shot was ${Math.round(p.best * 100)}% (${p.bestDesc}); you took ${Math.round(p.chosen * 100)}%`);
  }
  if (g.type === 'survive') {
    const enemyTurns = human === 'w' ? Math.floor(st.ply / 2) : Math.ceil(st.ply / 2);
    if (!humanActed && enemyTurns >= g.n) return win(`survived ${g.n} enemy turn${g.n > 1 ? 's' : ''}`);
    return null;
  }
  if (g.n && humanActed && myTurnsSoFar() >= g.n) return lose(g.type === 'kill' ? 'the target survived' : `out of turns: the deadline was ${g.n} turn${g.n > 1 ? 's' : ''}`);
  return null;
}

// A rook on overwatch fires at the enemy piece that just moved into its line.
async function fireOverwatch(from, to, tok, forced = null) {
  busy = true;
  const color = st.board[from].color;
  const g = groups.get(st.board[from].id);
  const res = forced || R.simulateShot(st, from, R.aimCenter(st, to), Math.random, 1);
  if (!replaying && history) history.events.push({ type: 'ow', from, to, res });
  banner('Overwatch!', 1100);
  await turnTo(g, faceYaw(g.position, res.end.x, res.end.z));
  const start = new THREE.Vector3();
  g.userData.gun.getObjectByName('muzzle').getWorldPosition(start);
  fx.muzzleFlash(start);
  sfx.gunshot('r');
  await fx.tracer(start, new THREE.Vector3(res.end.x, res.end.y, res.end.z));
  if (tok !== gameToken) return;
  let kill = null;
  const victim = res.hit != null ? st.board[res.hit] : null;
  if (victim && !(victim.type === 'k' && st.mode === R.CLASSIC)) {
    kill = res.hit;
    const vg = groups.get(victim.id);
    fx.shatter(vg, new THREE.Vector3(res.dir.x, 0, res.dir.z).normalize());
    scene.remove(vg);
    groups.delete(victim.id);
    graves[victim.color].push(victim.type);
    renderGraves();
    sfx.shatter();
    status(`Overwatch hit! ${pieceLabel(victim)} down.`, victim.color === human ? 'bad' : 'good');
  } else status('Overwatch fired and missed.', 'warn');
  turnTo(g, FORWARD_YAW[color], 0.4);
  st = R.applyOverwatch(st, color, kill);
  await wait(300);
  if (tok !== gameToken) return;
  if (replaying) {
    busy = false;
    refresh();
    return;
  }
  const result = R.judge(st) || goalResult({});
  if (result) {
    st.result = result;
    busy = false;
    refresh();
    gameOver(result);
    return;
  }
  afterCommit();
}

// Tactics abilities: rook overwatch, bishop smoke grenade.
async function doAbility(a, byHuman) {
  const tok = gameToken;
  busy = true;
  abilityMode = null;
  if (!replaying && history) history.events.push({ type: 'ability', a });
  const p = st.board[a.from];
  const g = groups.get(p.id);
  if (a.kind === 'overwatch') {
    sfx.click();
    status(`${possessive(p.color)} rook is on overwatch: the first enemy to move into its line gets shot.`, 'warn');
    await tween(0.5, (k) => (g.position.y = Math.sin(Math.PI * k) * 0.15));
  } else {
    const from = g.position.clone().setY(0.8);
    const w = R.toWorld(a.to);
    const to = new THREE.Vector3(w.x, 0.1, w.z);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ color: 0x556b2f, flatShading: true }));
    scene.add(ball);
    await tween(0.55, (k) => {
      ball.position.lerpVectors(from, to, k);
      ball.position.y += Math.sin(Math.PI * k) * 1.2;
    });
    scene.remove(ball);
    sfx.thud();
    fx.dust(to, 10);
    status(`Smoke! Shots through the cloud on ${R.sqName(a.to)} wobble far more.`, 'warn');
  }
  if (tok !== gameToken) return;
  commit(R.applyRaw(st, a), { squares: new Set([a.from]), desc: a.kind === 'overwatch' ? `${playerName(p.color)} put a rook on overwatch.` : `${playerName(p.color)} threw smoke onto ${R.sqName(a.to)}.`, action: a, by: byHuman ? 'human' : 'ai' }, tok);
}

async function nextTurn() {
  const tok = gameToken;
  if (vsAI && st.turn !== human) {
    busy = true;
    refresh();
    $('turn-text').textContent = `${aiName} is aiming…`;
    await wait(550);
    while (paused && tok === gameToken) await wait(120);
    if (tok !== gameToken) return;
    const a = chooseAction(st, aiLevel);
    if (!a) return;
    if (a.kind === 'move') await doMove(a, false);
    else if (a.kind === 'shoot') await doShoot(a, R.aimCenter(st, a.to), aiLevel.aim);
    else await doAbility(a, false);
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
  fogView = st.turn; // the fog now follows the player holding the device
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
  const threatened = st.mode !== R.FOG && k >= 0 && R.attackedBy(st, k, R.other(c));
  $('ho-alert').classList.toggle('hidden', !threatened);
  $('ho-alert').textContent = st.mode === R.CLASSIC ? '⚠ Your king is in check!' : '⚠ Your king is in the line of fire!';
  $('btn-ready').textContent = `I'm ${playerName(c)}, start my turn`;
  showScreen('handoff');
}
function resumeGame() {
  showScreen(pendingTurn != null ? 'handoff' : 'game');
}
$('card-ability').addEventListener('click', () => {
  if (busy || !humanTurn() || !st || !st.tactics) return;
  const from = sqOfId(povId);
  const ab = R.abilityActions(st, from)[0];
  if (!ab) return;
  if (ab.kind === 'overwatch') return doAbility(ab, true);
  abilityMode = abilityMode === 'smoke' ? null : 'smoke';
  if (abilityMode) status('Click a highlighted square to throw smoke there.', 'warn');
  refresh();
});
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
  if (vsAI && won) title = won === human ? 'You win!' : `${aiName} wins`;
  if (battle) {
    const k = battle.kind;
    if (k === 'puzzle') title = won === human ? 'Puzzle solved!' : 'Puzzle failed';
    else if (PRACTICE.has(k)) title = won === human ? 'Puzzle solved!' : 'Not quite';
    else if (k === 'weekly') title = won === human ? 'Challenge won!' : 'Challenge lost';
    else if (k === 'gauntlet') title = won === human ? `Round ${battle.round + 1} cleared!` : 'Gauntlet over';
    else title = won === human ? 'Mission complete!' : 'Mission failed';
  }
  $('over-title').textContent = title;
  $('over-reason').textContent = result.reason[0].toUpperCase() + result.reason.slice(1) + '.';
  sfx.fanfare(!vsAI || won === human);
  const sum = progress.endGame(result);
  renderSummary(sum);
  renderBattleResult(sum && sum.campaignResult);
  renderChallengeResult(sum);
  renderPuzzleResult(won === human);
  reportLeaderboardScore(result);
  // Replays: whole game, plus the best shot if there was a good one.
  bestShot = pickBestShot();
  $('btn-replay').classList.toggle('hidden', !(history && history.events.length));
  $('btn-bestshot').classList.toggle('hidden', !bestShot);
  const tok = gameToken;
  setTimeout(() => {
    if (tok === gameToken && screen === 'game') showScreen('over');
  }, 1100);
}

// One leaderboard, one mode: Classic vs the computer on Soldier (the default difficulty), so all
// scores are comparable. Pass & Play, MerciZero and the other difficulties are not reported.
// Score = 10 points per point of enemy material you shot (pawn 1, knight/bishop 3, rook 5, queen 9)
//       + 500 for a win (+10 for each of your turns under 50, so faster wins score more)
//       + 150 for a draw.
const LEADERBOARD = { mode: R.CLASSIC, difficulty: 'normal' };
const LB_MATERIAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
let reportedGame = -1;
let enemyMaterialShot = 0; // counted per shot, so enemy promotions can't hide your kills
function reportLeaderboardScore(result) {
  if (!vsAI || battle || st.mode !== LEADERBOARD.mode || xpLevel !== LEADERBOARD.difficulty) return;
  if (st.cover || st.weather || st.tactics) return; // variants change the game: not comparable
  if (reportedGame === gameToken) return; // exactly once per game
  reportedGame = gameToken;
  let score = 10 * enemyMaterialShot;
  const myTurns = human === 'w' ? Math.ceil(st.ply / 2) : Math.floor(st.ply / 2);
  if (result.winner === human) score += 500 + 10 * Math.max(0, 50 - myTurns);
  else if (result.winner == null) score += 150;
  if (Number.isFinite(score)) sendScoreToUsForge(score);
}

// --- Game setup ----------------------------------------------------------------------------

// Start a game. With a campaign battle `b`, its position, rules and opponent are used instead of
// the setup screen's choices.
function startGame(b = null) {
  sfx.unlock();
  gameToken++;
  tweens.length = 0;
  battle = b;
  if (b) {
    st = b.state ? R.clone(b.state) : R.fromPlacement(b.placement, b.mode);
    if (b.rules) st.rules = { ...b.rules };
    if (b.sure) st.rules = { ...R.rulesOf(st), spreadMul: 0 };
    if (b.cover) st.cover = [...b.cover];
    if (b.goal && b.goal.type === 'kill') {
      const t = st.board[parseSq(b.goal.target)];
      b.targetId = t ? t.id : -1;
    }
    vsAI = true;
    human = 'w';
    const base = typeof b.ai === 'object' ? b.ai.base : b.ai;
    xpLevel = base;
    aiLevel = { ...DIFFICULTIES[base], ...(typeof b.ai === 'object' && b.ai.aim ? { aim: b.ai.aim } : {}) };
    aiName = b.foe;
  } else {
    if (chosenMode === R.FOG && !progress.perk('fog')) chosenMode = R.CLASSIC;
    st = R.newGame(chosenMode);
    vsAI = chosenOpp === 'ai';
    human = vsAI ? (chosenSide === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : chosenSide) : 'w';
    xpLevel = difficulty;
    aiLevel = { ...DIFFICULTIES[difficulty] };
    aiName = DIFFICULTIES[difficulty].label;
    // Optional variants from the setup screen.
    if (variants.cover) st.cover = R.makeCover();
    const wx = R.makeWeather(variants.weather);
    if (wx) st.weather = wx;
    if (variants.tactics) st.tactics = true;
  }
  // Arena lighting resets each game; rain darkens it.
  showSkin('arena', findSkin('arena', progress.p.equipped.arena));
  if (st.weather && st.weather.rain) {
    world.hemi.intensity *= 0.65;
    world.sun.intensity *= 0.5;
  }
  hintLevel = 0;
  oddsPick = null;
  abilityMode = null;
  setScope(false);
  history = { start: R.clone(st), events: [] };
  fogView = vsAI ? human : 'w';
  const baseFog = world.baseFog || { near: 18, far: 55 };
  scene.fog.near = st.mode === R.FOG ? 7 : baseFog.near;
  scene.fog.far = st.mode === R.FOG ? 26 : baseFog.far;
  graves = { w: [], b: [] };
  renderGraves();
  last = null;
  lastDesc = '';
  enemyMaterialShot = 0;
  pendingTurn = null;
  busy = false;
  paused = false;
  placeAll();
  remembered.w = kingId('w');
  remembered.b = kingId('b');
  povId = null;
  viewMode = 'pov';
  started = true;
  if (b && PRACTICE.has(b.kind)) progress.game = null; // practice: only the puzzle's own rewards
  else progress.beginGame({ vsAI, human, difficulty: xpLevel, mode: st.mode, campaign: b });
  showScreen('game');
  if (b && b.kind === 'rush') viewMode = 'over';
  setPov(remembered[viewerColor()], { stay: !!(b && b.kind === 'rush') });
  if (b && b.puzzle && b.puzzle.pack === 'trick' && b.hint) {
    // Trick shots are about aiming in first person: start in the shooter's eyes, facing the target.
    const fs = parseSq(b.hint.from);
    const ts = parseSq(b.hint.to);
    setPov(st.board[fs].id);
    const w = R.toWorld(fs);
    const t = R.toWorld(ts);
    yaw = faceYaw({ x: w.x, z: w.z }, t.x, t.z);
    pitch = -0.05;
  }
  const modeLine = { classic: 'Classic: siege the king', mercizero: 'MerciZero: shoot the king', fog: 'Fog of War: find the king' }[st.mode];
  if (!vsAI && handoffOn) {
    // Start with the device in White's hands.
    pendingTurn = remembered.w;
    showHandoff(true);
    return;
  }
  if (b && b.kind === 'rush') {
    banner(b.prompt, 900);
    return;
  }
  banner(b ? (b.goal ? goalText(b.goal, st) : b.name) : vsAI && human === 'b' ? 'You play Black' : modeLine, b && b.goal ? 2600 : 1600);
  if (vsAI && human === 'b') nextTurn();
}

// --- Input ---------------------------------------------------------------------------------

let down = null;
let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (e.button === 2) {
    setScope(!scoped);
    return;
  }
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
  if (scoped) return scopeFire();
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
  if (k === 'escape' && screen === 'game' && (scoped || abilityMode)) {
    if (scoped) setScope(false);
    if (abilityMode) {
      abilityMode = null;
      refresh();
    }
    return;
  }
  if (k === 'escape') {
    // Close the topmost panel first.
    for (const id of ['promo', 'help', 'settings', 'briefing', 'campaign', 'challenges', 'editor', 'puzzles', 'badges']) {
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
  } else if (k === 'z') {
    setScope(!scoped);
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
    const who = vsAI ? `vs ${aiName}, you play ${COLOR_NAME[human]}` : `${names.w} (White) vs ${names.b} (Black)`;
    $('pause-info').textContent = `${battle ? `${battle.kind ? '' : 'Campaign: '}${battle.name} · ` : ''}${MODE_LABEL[st.mode]} · ${who} · turn ${Math.floor(st.ply / 2) + 1}`;
    renderContracts($('pause-contracts'), true);
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
  const fogLocked = !progress.perk('fog');
  document.querySelector('[data-mode=fog]').classList.toggle('locked', fogLocked);
  $('fog-desc').textContent = fogLocked
    ? `Unlocks at level ${PERKS.fog} (${rankOf(PERKS.fog)}). You're level ${progress.level}.`
    : 'MerciZero rules, but you only see what your pieces can see.';
  if (fogLocked && chosenMode === R.FOG) chosenMode = R.CLASSIC;
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
for (const [id, key] of [['v-cover', 'cover'], ['v-tactics', 'tactics']]) {
  $(id).checked = variants[key];
  $(id).addEventListener('change', () => {
    variants[key] = $(id).checked;
    savePref(`gunmate-v-${key}`, variants[key] ? '1' : '0');
  });
}
$('v-weather').value = variants.weather;
$('v-weather').addEventListener('change', () => {
  variants.weather = $('v-weather').value;
  savePref('gunmate-v-weather', variants.weather);
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
    if (b.classList.contains('locked')) {
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
      return;
    }
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
$('btn-start').addEventListener('click', () => startGame());
$('btn-setup-back').addEventListener('click', () => showScreen('main-menu'));
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart').addEventListener('click', () => {
  if (battle && battle.kind === 'rush') {
    if (rush) rush.running = false;
    return startRush();
  }
  startGame(battle);
});
$('btn-pause-howto').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btn-pause-settings').addEventListener('click', () => $('settings').classList.remove('hidden'));
$('btn-quit').addEventListener('click', () => {
  if (rush && rush.running) {
    rush.running = false;
    $('rush-hud').classList.add('hidden');
  }
  showScreen('main-menu');
});
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

$('btn-sound').innerHTML = icon('volume');
$('btn-sound').addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  $('btn-sound').innerHTML = icon(sfx.muted ? 'mute' : 'volume');
  $('btn-sound').classList.toggle('off', sfx.muted);
});
$('btn-again').addEventListener('click', () => {
  if (battle && battle.kind === 'rush') return startRush();
  if (!vsAI) swapNames(); // fair rematch: the other player gets White
  if (battle) return startGame(battle);
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
  else if (e.type === 'contract') toast(`<span class="t-icon">📋</span><div><small>Contract complete · +${e.contract.xp} XP</small><b>${e.contract.text}</b><span>Daily contract</span></div>`, 'badge');
  else if (e.type === 'reward') toast(`<span class="t-icon">🎁</span><div><small>Chapter ${e.chapter.id} complete</small><b>${e.skin.name} unlocked</b><span>Exclusive skin, equip it in the Shop.</span></div>`, 'level');
  else if (e.type === 'mastery') toast(`<span class="t-icon">${pieceIcon(e.piece, 'w')}</span><div><small>${R.NAMES[e.piece]} mastery ${'I II III IV V'.split(' ')[e.tier - 1]}</small><b>${MASTERY_TIERS[e.tier - 1]} kills with the ${R.NAMES[e.piece].toLowerCase()}</b><span>${e.reward || '+' + 30 * e.tier + ' XP'}</span></div>`, 'badge');
  else if (e.type === 'title') toast(`<span class="t-icon">🎖️</span><div><small>Title unlocked${e.title.xp ? ` · +${e.title.xp} XP` : ''}</small><b>${e.title.name}</b><span>${e.title.desc}</span></div>`, 'level');
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

function levelInfo(rawXp) {
  const xp = rawXp - progress.p.prestigeBase; // level counts from the last prestige
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
  $('pf-prestige').textContent = p.prestige ? ` 💎${p.prestige > 1 ? '×' + p.prestige : ''}` : '';
  $('pf-title').textContent = progress.titleName;
  $('challenges-sub').textContent = `Puzzle ${p.puzzle.last === dayKey() ? '✓' : 'ready'} · ${weeklyFor(weekKey()).name} · Gauntlet ${p.gauntlet.best}/4`;
  $('pf-bar').style.width = `${L.frac * 100}%`;
  $('pf-xp').textContent = `${L.into} / ${L.need} XP`;
  $('pf-badges').innerHTML = `${icon('medal')}${unlocked}/${BADGES.length}`;
  $('badge-count').textContent = `${unlocked} of ${BADGES.length} unlocked`;
  $('shop-menu-sub').textContent = `${progress.balance} XP to spend on skins`;
  $('campaign-sub').textContent = `12 battles · ${progress.campaignStars}/36 stars`;
  renderContractsPanel();
}

function renderBadges() {
  const p = progress.p;
  const s = p.stats;
  const L = levelInfo(p.xp);
  $('bd-level').textContent = L.level;
  $('bd-rank').textContent = L.rank;
  renderProgressionExtras();
  $('bd-bar').style.width = `${L.frac * 100}%`;
  $('bd-xp').textContent = `${p.xp} XP earned · ${progress.balance} to spend`;
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
  if (cat === 'arena') {
    applyArena(world, skin);
    if (st && started && st.mode === R.FOG && !st.result) {
      scene.fog.near = 7;
      scene.fog.far = 26;
    }
    return;
  }
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
      const price = sk.rank
        ? `Free · unlocks at level ${sk.rank}`
        : sk.campaign
          ? `Campaign reward · chapter ${sk.campaign}`
          : sk.prestige
            ? 'Prestige reward'
            : owned
              ? sk.price ? 'Owned' : 'Free'
              : `${sk.price} XP${sk.level ? ` · Lv ${sk.level}` : ''}`;
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


// --- Daily contracts --------------------------------------------------------------------------

function untilMidnight() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = Math.max(0, Math.round((end - now) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
function renderContracts(el, compact = false) {
  const d = progress.daily();
  const rows = d.ids
    .map((id) => {
      const c = CONTRACTS.find((x) => x.id === id);
      const n = Math.min(c.goal, d.progress[id] || 0);
      const done = !!d.done[id];
      return `<div class="ct ${done ? 'done' : ''}">
        <div class="ct-check">${done ? '✓' : ''}</div>
        <div class="ct-body"><span>${c.text}</span>${c.goal > 1 && !done ? `<div class="mini"><div style="width:${(n / c.goal) * 100}%"></div></div>` : ''}</div>
        <div class="ct-xp">${done ? 'Done' : c.goal > 1 ? `${n}/${c.goal}` : ''}<b>+${c.xp}</b></div>
      </div>`;
    })
    .join('');
  el.innerHTML = compact ? `<div class="row-label">Today's contracts</div>${rows}` : rows;
}
function renderContractsPanel() {
  renderContracts($('ct-list'));
  $('ct-reset').textContent = `New in ${untilMidnight()}`;
  $('ct-first').innerHTML = progress.firstWinAvailable
    ? `${icon('star')}<span><b>First win of the day</b> pays double XP</span>`
    : `${icon('star')}<span>First-win bonus claimed. Back tomorrow.</span>`;
  $('ct-first').classList.toggle('claimed', !progress.firstWinAvailable);
}

// --- Campaign -------------------------------------------------------------------------------

const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
let briefBattle = null;

function renderCampaign() {
  const c = progress.p.campaign;
  $('cp-stars').textContent = progress.campaignStars;
  $('cp-chapters').innerHTML = CHAPTERS.map((ch) => {
    const open = progress.chapterUnlocked(ch);
    const list = BATTLES.filter((b) => b.chapter === ch.id);
    const got = list.reduce((a, b) => a + (c.stars[b.id] || 0), 0);
    const rewardOwned = !!progress.p.owned[ch.reward.id];
    const cards = list
      .map((b) => {
        const unlocked = progress.battleUnlocked(b);
        const n = c.stars[b.id] || 0;
        return `<button class="battle ${unlocked ? '' : 'locked'} ${c.won[b.id] ? 'won' : ''}" data-battle="${b.id}" ${unlocked ? '' : 'disabled'}>
          <span class="b-num">${BATTLES.indexOf(b) + 1}</span>
          <b>${b.name}</b>
          <span class="b-foe">${b.foe} · ${MODE_LABEL[b.mode]}</span>
          <span class="b-stars">${unlocked ? starStr(n) : icon('lock') + ' Locked'}</span>
        </button>`;
      })
      .join('');
    return `<section class="chapter ${open ? '' : 'locked'}">
      <div class="ch-head">
        <div><div class="ch-num">Chapter ${ch.id}</div><b>${ch.name}</b><span>${ch.blurb}</span></div>
        <div class="ch-side">${open ? `<span class="ch-stars">★ ${got}/12</span>` : `<span class="ch-lock">${icon('lock')} Needs ${ch.need} ★</span>`}
          <span class="ch-reward ${rewardOwned ? 'got' : ''}">🎁 ${rewardOwned ? 'Reward claimed' : 'Exclusive skin'}</span></div>
      </div>
      <div class="battles">${cards}</div>
    </section>`;
  }).join('');
}
function openCampaign() {
  sfx.click();
  renderCampaign();
  $('campaign').classList.remove('hidden');
}
function openBriefing(b) {
  briefBattle = b;
  const best = progress.p.campaign.stars[b.id] || 0;
  const got = progress.p.campaign;
  $('br-num').textContent = `Chapter ${b.chapter} · Battle ${BATTLES.indexOf(b) + 1}`;
  $('br-name').textContent = b.name;
  $('br-foe').textContent = `Opponent: ${b.foe}`;
  const base = typeof b.ai === 'object' ? b.ai.base : b.ai;
  const tags = [MODE_LABEL[b.mode], `${DIFFICULTIES[base].label} AI`];
  if (typeof b.ai === 'object' && b.ai.aim) tags.push('Sharpshooter');
  if (b.turnLimit) tags.push(`${b.turnLimit}-turn deadline`);
  $('br-tags').innerHTML = tags.map((t) => `<span class="tag">${t}</span>`).join('');
  $('br-blurb').textContent = b.blurb;
  $('br-goals').innerHTML = starGoals(b).map((g, i) => `<li class="${i < best ? 'got' : ''}"><span>${i < best ? '★' : '☆'}</span>${g}</li>`).join('');
  $('btn-br-play').lastChild.textContent = got.won[b.id] ? 'Replay' : 'Deploy';
  $('briefing').classList.remove('hidden');
}
function renderBattleResult(res) {
  $('ov-campaign').classList.toggle('hidden', !res);
  delete $('btn-next-battle').dataset.next;
  $('btn-next-battle').lastChild.textContent = 'Next battle';
  $('ov-challenge').classList.add('hidden');
  const next = battle ? BATTLES[BATTLES.indexOf(battle) + 1] : null;
  $('btn-next-battle').classList.toggle('hidden', !(res && res.stars[0] && next && progress.battleUnlocked(next)));
  if (!res) return;
  $('ov-stars').innerHTML = res.stars.map((g, i) => `<span class="${g ? 'got' : ''}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`).join('');
  $('ov-goals').innerHTML = starGoals(battle).map((g, i) => `<li class="${res.stars[i] ? 'got' : ''}"><span>${res.stars[i] ? '★' : '☆'}</span>${g}</li>`).join('');
  $('ov-reward').innerHTML = res.reward ? `🎁 Chapter complete! <b>${res.reward.name}</b> skin unlocked.` : res.newStars ? `+${res.newStars} new star${res.newStars > 1 ? 's' : ''}` : '';
}

$('btn-campaign').addEventListener('click', openCampaign);
$('btn-campaign-close').addEventListener('click', () => closeOverlay('campaign'));
$('cp-chapters').addEventListener('click', (e) => {
  const el = e.target.closest('[data-battle]');
  if (!el || el.disabled) return;
  sfx.click();
  openBriefing(BATTLES.find((b) => b.id === el.dataset.battle));
});
$('btn-br-back').addEventListener('click', () => closeOverlay('briefing'));
$('btn-br-play').addEventListener('click', () => {
  closeOverlay('briefing');
  closeOverlay('campaign');
  startGame(briefBattle);
});
$('btn-next-battle').addEventListener('click', () => {
  const nx = $('btn-next-battle').dataset.next;
  if (battle && battle.kind === 'library' && nx) {
    const p = LIBRARY.find((x) => x.id === nx);
    if (p) return startGame(puzzleToBattle(p));
  }
  if (battle && battle.kind === 'test') return openEditor();
  if (battle && battle.kind === 'gauntlet') {
    if (gauntletRun) startGame(gauntletBattle(gauntletRun.round, gauntletRun.lost));
    return;
  }
  const next = BATTLES[BATTLES.indexOf(battle) + 1];
  if (next) openBriefing(next);
});


// --- Challenges: daily puzzle, weekly challenge, gauntlet ----------------------------------

let gauntletRun = null; // { round, lost: [piece types] } while a run is going

function untilWeekEnd() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - ((now.getDay() + 6) % 7)));
  const h = Math.max(0, Math.round((end - now) / 3600000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`;
}
function renderChallenges() {
  const day = dayKey();
  const pz = puzzleFor(day);
  const z = progress.p.puzzle;
  const solved = z.last === day;
  $('ch-puzzle').innerHTML = `
    <div class="ch-top"><span class="ch-kicker">Daily puzzle</span><span class="ch-streak ${z.streak && (solved || isYesterday(z.last)) ? 'on' : ''}">${icon('fire')}${solved || isYesterday(z.last) ? z.streak : 0}</span></div>
    <b class="ch-name">${pz.name}</b>
    <p>${pz.blurb}</p>
    <div class="ch-meta"><span class="tag">${MODE_LABEL[pz.mode]}</span><span class="tag">Win within ${pz.turnLimit} turns</span></div>
    <div class="ch-reward">${solved ? '✓ Solved today. New puzzle tomorrow.' : `+${PUZZLE_XP} XP, +20 per streak day`}</div>
    <button class="primary" data-play="puzzle">${solved ? 'Play again' : 'Solve'}</button>`;
  const wk = weekKey();
  const w = weeklyFor(wk);
  const claimed = progress.p.weekly.claimed === wk;
  $('ch-weekly').innerHTML = `
    <div class="ch-top"><span class="ch-kicker">Weekly challenge</span><span class="ch-time">${untilWeekEnd()} left</span></div>
    <b class="ch-name">${w.name}</b>
    <p>${w.desc}</p>
    <div class="ch-meta"><span class="tag">MerciZero</span><span class="tag">vs Soldier</span></div>
    <div class="ch-reward">${claimed ? '✓ Won this week. New rules on Monday.' : `+${WEEKLY_XP} XP for your first win this week`}</div>
    <button class="primary" data-play="weekly">${claimed ? 'Play again' : 'Fight'}</button>`;
  const gt = progress.p.gauntlet;
  const steps = GAUNTLET.map((r, i) => {
    const cls = gauntletRun ? (i < gauntletRun.round ? 'done' : i === gauntletRun.round ? 'now' : '') : i < gt.best ? 'best' : '';
    return `<li class="${cls}"><span>${i + 1}</span>${r.foe}<b>+${GAUNTLET_XP[i]}</b></li>`;
  }).join('');
  const lost = gauntletRun && gauntletRun.lost.length ? `<div class="g-lost">Carrying losses: ${gauntletRun.lost.map((t) => pieceIcon(t, 'w')).join('')}</div>` : '';
  $('ch-gauntlet').innerHTML = `
    <div class="ch-top"><span class="ch-kicker">Gauntlet</span><span class="ch-time">Best ${gt.best}/4${gt.clears ? ` · cleared ${gt.clears}×` : ''}</span></div>
    <b class="ch-name">Four in a row</b>
    <p>Beat Recruit, Soldier, Sniper and Warlord back to back. Pieces you lose stay lost.</p>
    <ol class="g-steps">${steps}</ol>${lost}
    <button class="primary" data-play="gauntlet">${gauntletRun ? `Continue: round ${gauntletRun.round + 1}` : 'Start a run'}</button>
    ${gauntletRun ? '<button class="secondary slim" data-play="gauntlet-new">Abandon and restart</button>' : ''}`;
}
function isYesterday(day) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return day === dayKey(y);
}
$('btn-challenges').addEventListener('click', () => {
  sfx.click();
  renderChallenges();
  $('challenges').classList.remove('hidden');
});
$('btn-challenges-close').addEventListener('click', () => closeOverlay('challenges'));
$('challenges').addEventListener('click', (e) => {
  const b = e.target.closest('[data-play]');
  if (!b) return;
  const what = b.dataset.play;
  closeOverlay('challenges');
  if (what === 'puzzle') startGame(puzzleBattle(dayKey()));
  else if (what === 'weekly') startGame(weeklyBattle(weekKey()));
  else {
    if (what === 'gauntlet-new' || !gauntletRun) gauntletRun = { round: 0, lost: [] };
    startGame(gauntletBattle(gauntletRun.round, gauntletRun.lost));
  }
});

function renderChallengeResult(sum) {
  const el = $('ov-challenge');
  const r = sum && sum.challengeResult;
  el.classList.toggle('hidden', !r);
  if (!r) return;
  let html = '';
  if (r.kind === 'puzzle') {
    html = r.failed ? 'Out of turns. Try again: the puzzle stays the same all day.' : r.already ? 'Solved again! (Today’s reward was already claimed.)' : `${icon('fire')} Streak: <b>${r.streak} day${r.streak > 1 ? 's' : ''}</b>`;
  } else if (r.kind === 'weekly') {
    html = !r.won ? 'The rules stay the same all week. Try again.' : r.already ? 'Won again! (This week’s reward was already claimed.)' : `Weekly reward claimed: <b>+${WEEKLY_XP} XP</b>`;
  } else if (r.kind === 'gauntlet') {
    if (!r.won) {
      html = `Run over at round ${battle.round + 1}. Best: ${progress.p.gauntlet.best}/4.`;
      gauntletRun = null;
    } else if (r.cleared) {
      html = '🏆 <b>Gauntlet cleared!</b> All four computer levels beaten in one run.';
      gauntletRun = null;
    } else {
      const lost = [...battle.lost, ...(sum.lostTypes || [])];
      gauntletRun = { round: battle.round + 1, lost };
      const next = GAUNTLET[gauntletRun.round];
      html = `Next: <b>${next.foe}</b>${lost.length ? `, carrying ${lost.length} lost piece${lost.length > 1 ? 's' : ''}` : ''}.`;
      $('btn-next-battle').classList.remove('hidden');
      $('btn-next-battle').lastChild.textContent = `Round ${gauntletRun.round + 1}: ${next.foe}`;
    }
  }
  el.innerHTML = html;
}

// --- Titles, mastery, prestige (Badges & Stats screen) --------------------------------------

const ROMAN = ['—', 'I', 'II', 'III', 'IV', 'V'];
function renderProgressionExtras() {
  const p = progress.p;
  $('bd-prestige-stars').textContent = p.prestige ? '💎'.repeat(Math.min(p.prestige, 5)) + (p.prestige > 5 ? `×${p.prestige}` : '') : '';
  $('bd-prestige').innerHTML = progress.canPrestige
    ? `<div class="prestige ready"><div><b>Prestige available</b><span>Reset your level to 1 for a 💎, the exclusive Prestige pieces and a title. You keep your XP to spend, skins, badges, campaign and perks.</span></div><button class="primary" id="btn-prestige">💎 Prestige</button></div>`
    : `<div class="prestige"><div><b>Prestige at level ${PRESTIGE_LEVEL}</b><span>${p.prestige ? `Prestiged ${p.prestige}×. ` : ''}You're level ${progress.level}. Prestige resets your level for a 💎 and exclusive rewards.</span></div></div>`;
  const pb = $('btn-prestige');
  if (pb) {
    pb.addEventListener('click', () => {
      if (!confirm('Prestige now? Your level goes back to 1. You keep your XP to spend, skins, badges, campaign progress and rank perks.')) return;
      progress.prestigeNow();
      sfx.fanfare(true);
      renderBadges();
      renderProfile();
    });
  }
  $('bd-titles').innerHTML = [{ id: '', name: 'No title', desc: 'Show only your rank.' }, ...TITLES]
    .map((t) => {
      const got = t.id === '' || p.titles[t.id];
      const on = p.title === t.id;
      return `<button class="title-chip ${got ? '' : 'locked'} ${on ? 'on' : ''}" data-title="${t.id}" ${got ? '' : 'disabled'} title="${t.desc}"><b>${got ? '' : '🔒 '}${t.name}</b><span>${t.desc}</span></button>`;
    })
    .join('');
  $('bd-mastery').innerHTML = ['p', 'n', 'b', 'r', 'q', 'k']
    .map((t) => {
      const kills = p.mastery[t];
      const tier = masteryTier(kills);
      const next = MASTERY_TIERS[tier];
      const prev = tier ? MASTERY_TIERS[tier - 1] : 0;
      const frac = next ? (kills - prev) / (next - prev) : 1;
      const perks = [tier >= 3 ? '<span class="perk on">Tracers</span>' : '<span class="perk">III: tracers</span>', tier >= 5 ? '<span class="perk on">Gold trim</span>' : '<span class="perk">V: gold trim</span>'].join('');
      return `<div class="m-row"><span class="m-icon">${pieceIcon(t, 'w')}</span><div class="m-main"><div class="m-top"><b>${R.NAMES[t]}</b><span class="m-tier t${tier}">${ROMAN[tier]}</span><span class="m-kills">${kills}${next ? ` / ${next}` : ''} kills</span></div><div class="mini"><div style="width:${frac * 100}%"></div></div><div class="m-perks">${perks}</div></div></div>`;
    })
    .join('');
}
$('bd-titles').addEventListener('click', (e) => {
  const b = e.target.closest('[data-title]');
  if (!b || b.disabled) return;
  sfx.click();
  progress.setTitle(b.dataset.title);
  renderProgressionExtras();
  renderProfile();
});

// --- Settings: music track and kill-cam (rank perks) ----------------------------------------

function renderPerkSettings() {
  $('opt-track').innerHTML = TRACKS.map((t) => {
    const ok = progress.rankLevel >= t.rank;
    return `<option value="${t.id}" ${ok ? '' : 'disabled'} ${settings.track === t.id ? 'selected' : ''}>${ok ? '' : '🔒 '}${t.name}${ok ? '' : ` (level ${t.rank})`}</option>`;
  }).join('');
  const locked = TRACKS.filter((t) => progress.rankLevel < t.rank);
  $('track-note').textContent = locked.length ? `More tracks unlock as you rank up` : 'All tracks unlocked';
  const kc = progress.perk('killcam');
  $('opt-killcam').disabled = !kc;
  $('opt-killcam').checked = kc && settings.killcam;
  $('killcam-note').textContent = kc ? 'Follow the bullet on long kills' : `🔒 Unlocks at level ${PERKS.killcam}`;
}
function applyTrack() {
  const t = TRACKS.find((x) => x.id === settings.track);
  sfx.music.setTrack(t && progress.rankLevel >= t.rank ? t.id : 'march');
}
$('opt-track').addEventListener('change', () => {
  settings.track = $('opt-track').value;
  savePref('gunmate-track', settings.track);
  applyTrack();
});
$('opt-killcam').addEventListener('change', () => {
  settings.killcam = $('opt-killcam').checked;
  savePref('gunmate-killcam', settings.killcam ? '1' : '0');
});
$('btn-settings').addEventListener('click', renderPerkSettings);
$('btn-pause-settings').addEventListener('click', renderPerkSettings);
applyTrack();
// Award titles players already qualify for (e.g. collections finished before titles existed).
progress.checkTitles();
renderProfile();

// --- Replays -----------------------------------------------------------------------------------

let bestShot = null;
let replayStop = false;
let replayPaused = false;
let replaySpeed = 1;
let replayRestore = null;

// The most impressive kill you made: long, unlikely, or a king/queen.
function pickBestShot() {
  if (!history) return null;
  let best = null;
  let top = 0;
  for (const e of history.events) {
    if (e.type !== 'shoot' || !e.mine || e.res.hit == null) continue;
    const v = e.snap.board[e.res.hit];
    const sh = e.snap.board[e.a.from];
    if (!v || !sh || v.color === sh.color || (v.type === 'k' && e.snap.mode === R.CLASSIC)) continue;
    const dist = Math.max(Math.abs(R.fileOf(e.res.hit) - R.fileOf(e.a.from)), Math.abs(R.rankOf(e.res.hit) - R.rankOf(e.a.from)));
    const score = dist + (1 - e.chance) * 4 + (v.type === 'k' ? 4 : R.VALUE[v.type] / 3);
    if (score > top) {
      top = score;
      best = e;
    }
  }
  return best;
}

async function runReplay(events, startState, clip = false) {
  replayRestore = { st, last, graves: JSON.parse(JSON.stringify(graves)), povId };
  replaying = true;
  replayStop = false;
  replayPaused = false;
  const tok = ++gameToken;
  tweens.length = 0;
  st = R.clone(startState);
  graves = { w: [], b: [] };
  renderGraves();
  last = null;
  placeAll();
  showScreen('game');
  $('replay-bar').classList.remove('hidden');
  $('replay-pause').textContent = '⏸';
  if (!clip) {
    viewMode = 'over';
  } else {
    // Look through the shooter, then the kill-cam takes over.
    povId = st.board[events[0].a.from].id;
    viewMode = 'pov';
    const w = R.toWorld(events[0].a.from);
    const t = R.toWorld(events[0].a.to);
    yaw = faceYaw({ x: w.x, z: w.z }, t.x, t.z);
    pitch = POV_PITCH;
    setViewGun();
  }
  startTransition();
  refresh();
  await wait(clip ? 700 : 500);
  for (let i = 0; i < events.length; i++) {
    if (replayStop || tok !== gameToken) break;
    while (replayPaused && !replayStop) await wait(100);
    $('replay-step').textContent = clip ? 'Best shot' : `Action ${i + 1} of ${events.length}`;
    const e = events[i];
    if (e.type === 'move') await doMove(e.a, false);
    else if (e.type === 'shoot') await doShoot(e.a, e.aim, 1, false, { forced: e.res, chance: e.chance, killcam: clip });
    else if (e.type === 'ability') await doAbility(e.a, false);
    else if (e.type === 'ow') await fireOverwatch(e.from, e.to, gameToken, e.res);
    await wait(clip ? 1100 : 450 / replaySpeed);
  }
  if (tok === gameToken) endReplay();
}
function endReplay() {
  if (!replaying) return;
  replaying = false;
  killcam = null;
  gameToken++;
  const r = replayRestore;
  st = r.st;
  last = r.last;
  graves = r.graves;
  renderGraves();
  placeAll();
  povId = r.povId;
  viewMode = 'over';
  startTransition();
  busy = false;
  $('replay-bar').classList.add('hidden');
  refresh();
  showScreen('over');
}
$('btn-replay').addEventListener('click', () => history && runReplay(history.events, history.start));
$('btn-bestshot').addEventListener('click', () => bestShot && runReplay([bestShot], bestShot.snap, true));
$('replay-pause').addEventListener('click', () => {
  replayPaused = !replayPaused;
  $('replay-pause').textContent = replayPaused ? '▶' : '⏸';
});
$('replay-speed').addEventListener('click', () => {
  replaySpeed = replaySpeed === 1 ? 2 : replaySpeed === 2 ? 4 : 1;
  $('replay-speed').textContent = `${replaySpeed}×`;
});
$('replay-stop').addEventListener('click', () => {
  replayStop = true;
  replayPaused = false;
});

// --- Puzzle Rush ---------------------------------------------------------------------------------

const RUSH_TIME = 180;
let rush = null; // { left, score, strikes, running, current, lastOk }
const RUSH_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

function startRush() {
  rush = { left: RUSH_TIME, score: 0, strikes: 0, running: true };
  $('rush-hud').classList.remove('hidden');
  nextRushPuzzle();
}
function nextRushPuzzle() {
  const kind = rush.score >= 3 && Math.random() < 0.5 ? 'best' : 'drill';
  let r = null;
  while (!r) r = kind === 'best' ? genBestTarget(Math.random) : genDrill(Math.random);
  rush.current = { kind, r };
  const prompt = kind === 'best' ? 'Shoot the most valuable piece you can' : 'Shoot the king';
  startGame({ kind: 'rush', id: 'rush', name: 'Puzzle Rush', foe: 'Rush', mode: r.st.mode, ai: 'easy', state: r.st, sure: true, prompt });
  updateRushHud();
}
function rushPick(a, aim) {
  const c = rush.current;
  let ok = a.kind === 'shoot';
  if (ok && c.kind === 'drill') ok = a.to === R.findKing(st, 'b');
  if (ok && c.kind === 'best') ok = RUSH_VALUE[st.board[a.to].type] === RUSH_VALUE[st.board[c.r.target].type];
  rush.lastOk = ok;
  rush.lastSolution = { piece: R.NAMES[st.board[c.r.solution.from].type].toLowerCase(), from: c.r.solution.from, to: c.r.solution.to };
  if (a.kind === 'shoot') doShoot(a, aim || R.aimCenter(st, a.to), 1, false);
  else doMove(a, false);
}
function rushAfter() {
  if (!rush || !rush.running) return;
  if (rush.lastOk) {
    rush.score++;
    status(`Correct! ${rush.score} solved.`, 'good');
  } else {
    rush.strikes++;
    sfx.check();
    const sol = rush.lastSolution;
    status(`Wrong: it was the ${sol.piece} on ${R.sqName(sol.from)} → ${R.sqName(sol.to)}.`, 'bad');
  }
  updateRushHud();
  if (rush.strikes >= 3) return endRush('three strikes');
  const go = () => {
    if (!rush || !rush.running) return;
    if (paused) return setTimeout(go, 200);
    nextRushPuzzle();
  };
  setTimeout(go, rush.lastOk ? 450 : 1400);
}
function updateRushHud() {
  if (!rush) return;
  const t = Math.max(0, Math.ceil(rush.left));
  $('rush-hud').innerHTML = `<span class="r-time ${t <= 20 ? 'low' : ''}">⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span><span class="r-score">★ ${rush.score}</span><span class="r-strikes">${'✖'.repeat(rush.strikes)}${'○'.repeat(3 - rush.strikes)}</span>`;
}
function endRush(reason) {
  if (!rush || !rush.running) return;
  rush.running = false;
  const score = rush.score;
  const r = progress.recordRush(score);
  $('rush-hud').classList.add('hidden');
  if (st) st.result = { winner: null, reason };
  busy = false;
  gameToken++;
  $('over-title').textContent = 'Rush over';
  $('over-reason').textContent = `${reason[0].toUpperCase() + reason.slice(1)}.`;
  renderSummary(null);
  renderBattleResult(null);
  $('ov-challenge').innerHTML = `Score <b>${score}</b>${r.best ? ' · new best!' : ` · best ${progress.p.rush.best}`}${score ? ` · +${score * 10} XP` : ''}`;
  $('ov-challenge').classList.remove('hidden');
  $('btn-replay').classList.add('hidden');
  $('btn-bestshot').classList.add('hidden');
  sfx.fanfare(score > 0);
  showScreen('over');
}

// --- Puzzles screen -----------------------------------------------------------------------------

function renderPuzzles() {
  const lib = progress.p.lib;
  const total = LIBRARY.length * 3;
  $('pz-stars').textContent = progress.libStars;
  $('pz-total').textContent = total;
  const wk = weekKey();
  const wp = weeklyPuzzle(wk);
  const wDone = progress.p.wpuzzle === wk;
  $('pz-weekly').innerHTML = `<div class="ch-top"><span class="ch-kicker">Puzzle of the week</span><span class="ch-time">${untilWeekEnd()} left</span></div>
    <b class="ch-name">${goalText(wp.goal)}</b><p>A hard two-mover: sure-shot, and the enemy defends perfectly.</p>
    <div class="ch-reward">${wDone ? '✓ Solved this week' : `+${WEEKLY_PUZZLE_XP} XP`}</div><button class="primary" data-pz="weekly">Solve</button>`;
  $('pz-rush').innerHTML = `<div class="ch-top"><span class="ch-kicker">Puzzle Rush</span><span class="ch-time">Best ${progress.p.rush.best}</span></div>
    <b class="ch-name">3 minutes, 3 strikes</b><p>Quick sure-shot puzzles, one after another. Find the shot fast.</p>
    <div class="ch-reward">+10 XP per puzzle solved</div><button class="primary" data-pz="rush">Start</button>`;
  $('pz-editor').innerHTML = `<div class="ch-top"><span class="ch-kicker">Puzzle editor</span></div>
    <b class="ch-name">Make your own</b><p>Set up a position, pick a goal, test it, and share it as a code.</p>
    <button class="primary" data-pz="editor">Open editor</button>`;
  $('pz-packs').innerHTML = PACKS.map((pk) => {
    const list = LIBRARY.filter((p) => p.pack === pk.id);
    const got = list.reduce((a, p) => a + ((lib[p.id] && lib[p.id].stars) || 0), 0);
    const tiles = list
      .map((p, i) => {
        const n = (lib[p.id] && lib[p.id].stars) || 0;
        return `<button class="pz-tile ${n ? 'done' : ''}" data-lib="${p.id}" title="${goalText(p.goal)}"><b>${i + 1}</b><span>${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span></button>`;
      })
      .join('');
    return `<section class="pz-pack"><div class="pz-head"><span class="pz-icon">${pk.icon}</span><div><b>${pk.name}</b><span>${pk.blurb}</span></div><span class="pz-count">★ ${got}/${list.length * 3}</span></div><div class="pz-tiles">${tiles}</div></section>`;
  }).join('');
}
$('btn-puzzles').addEventListener('click', () => {
  sfx.click();
  renderPuzzles();
  $('pz-code-err').textContent = '';
  $('puzzles').classList.remove('hidden');
});
$('btn-puzzles-close').addEventListener('click', () => closeOverlay('puzzles'));
$('puzzles').addEventListener('click', (e) => {
  const t = e.target.closest('[data-lib],[data-pz]');
  if (!t) return;
  if (t.dataset.lib) {
    closeOverlay('puzzles');
    return startGame(puzzleToBattle(LIBRARY.find((p) => p.id === t.dataset.lib)));
  }
  const what = t.dataset.pz;
  if (what === 'weekly') {
    closeOverlay('puzzles');
    return startGame(puzzleToBattle(weeklyPuzzle(weekKey()), 'wpuzzle'));
  }
  if (what === 'rush') {
    closeOverlay('puzzles');
    return startRush();
  }
  if (what === 'editor') return openEditor();
  if (what === 'code') {
    try {
      const p = decodePuzzle($('pz-code').value);
      closeOverlay('puzzles');
      startGame(puzzleToBattle(p, 'code'));
    } catch (err) {
      $('pz-code-err').textContent = err.message;
    }
  }
});

// --- Puzzle editor ------------------------------------------------------------------------------

const ed = { board: new Array(64).fill(null), cover: new Set(), target: -1, tool: 'wq' };
const ED_TOOLS = ['wk', 'wq', 'wr', 'wb', 'wn', 'wp', 'bk', 'bq', 'br', 'bb', 'bn', 'bp', 'crate', 'target', 'erase'];
function edStandard() {
  ed.board = new Array(64).fill(null);
  const back = 'rnbqkbnr';
  for (let f = 0; f < 8; f++) {
    ed.board[R.sqAt(f, 0)] = { color: 'w', type: back[f] };
    ed.board[R.sqAt(f, 1)] = { color: 'w', type: 'p' };
    ed.board[R.sqAt(f, 6)] = { color: 'b', type: 'p' };
    ed.board[R.sqAt(f, 7)] = { color: 'b', type: back[f] };
  }
  ed.cover.clear();
  ed.target = -1;
}
function edPlacement() {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let gap = 0;
    for (let f = 0; f < 8; f++) {
      const p = ed.board[R.sqAt(f, r)];
      if (!p) {
        gap++;
        continue;
      }
      if (gap) row += gap;
      gap = 0;
      row += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    rows.push(row + (gap ? gap : ''));
  }
  return rows.join('/');
}
function edPuzzle() {
  const goal = { type: $('ed-goal').value, n: Math.max(1, Math.min(30, +$('ed-n').value || 1)) };
  if (goal.type === 'kill') goal.target = ed.target >= 0 ? R.sqName(ed.target) : '';
  return { id: 'test', pack: null, placement: edPlacement(), mode: $('ed-mode').value, sure: $('ed-sure').checked, cover: [...ed.cover].map(R.sqName), goal, ai: $('ed-ai').value, title: $('ed-title').value.trim().slice(0, 40) || 'Custom puzzle' };
}
function edLoad(p) {
  const s0 = R.fromPlacement(p.placement, p.mode);
  ed.board = s0.board.map((x) => (x ? { color: x.color, type: x.type } : null));
  ed.cover = new Set((p.cover || []).map(parseSq));
  ed.target = p.goal.type === 'kill' && p.goal.target ? parseSq(p.goal.target) : -1;
  $('ed-mode').value = p.mode;
  $('ed-goal').value = p.goal.type;
  $('ed-n').value = p.goal.n;
  $('ed-ai').value = p.ai;
  $('ed-sure').checked = !!p.sure;
  $('ed-title').value = p.title || '';
}
function edCheck() {
  const kings = { w: 0, b: 0 };
  for (const p of ed.board) if (p && p.type === 'k') kings[p.color]++;
  if (kings.w !== 1 || kings.b !== 1) return 'Each side needs exactly one king.';
  if ($('ed-goal').value === 'kill' && !(ed.target >= 0 && ed.board[ed.target] && ed.board[ed.target].color === 'b')) return 'Pick a target: choose the 🎯 tool and click a black piece.';
  for (let f = 0; f < 8; f++) for (const r of [0, 7]) {
    const p = ed.board[R.sqAt(f, r)];
    if (p && p.type === 'p') return 'Pawns can’t stand on the first or last rank.';
  }
  return '';
}
function renderEditor() {
  $('ed-board').innerHTML = Array.from({ length: 64 }, (_, i) => {
    const f = i % 8;
    const r = 7 - Math.floor(i / 8);
    const s = R.sqAt(f, r);
    const p = ed.board[s];
    const light = (f + r) % 2 === 1;
    const inner = ed.cover.has(s) ? '<span class="ed-crate">📦</span>' : p ? pieceIcon(p.type, p.color) : '';
    return `<button class="ed-sq ${light ? 'l' : 'd'} ${s === ed.target ? 'target' : ''}" data-sq="${s}" title="${R.sqName(s)}">${inner}</button>`;
  }).join('');
  $('ed-palette').innerHTML = ED_TOOLS.map((t) => {
    const label = t === 'crate' ? '📦' : t === 'target' ? '🎯' : t === 'erase' ? '⌫' : pieceIcon(t[1], t[0]);
    return `<button class="ed-tool ${ed.tool === t ? 'on' : ''}" data-tool="${t}" title="${t === 'crate' ? 'Crate' : t === 'target' ? 'Target (for “kill” goals)' : t === 'erase' ? 'Erase' : (t[0] === 'w' ? 'White ' : 'Black ') + R.NAMES[t[1]].toLowerCase()}">${label}</button>`;
  }).join('');
  $('ed-n-row').classList.toggle('hidden', false);
  $('ed-err').textContent = edCheck();
}
function openEditor() {
  closeOverlay('puzzles');
  if (!ed.board.some(Boolean)) edStandard();
  renderEditor();
  showScreen('main-menu');
  $('editor').classList.remove('hidden');
}
$('ed-board').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sq]');
  if (!b) return;
  const s = +b.dataset.sq;
  const t = ed.tool;
  if (t === 'erase') {
    ed.board[s] = null;
    ed.cover.delete(s);
    if (ed.target === s) ed.target = -1;
  } else if (t === 'crate') {
    if (ed.cover.has(s)) ed.cover.delete(s);
    else {
      ed.cover.add(s);
      ed.board[s] = null;
      if (ed.target === s) ed.target = -1;
    }
  } else if (t === 'target') {
    if (ed.board[s] && ed.board[s].color === 'b') ed.target = ed.target === s ? -1 : s;
  } else {
    const color = t[0];
    const type = t[1];
    if (type === 'k') for (let q = 0; q < 64; q++) if (ed.board[q] && ed.board[q].type === 'k' && ed.board[q].color === color) ed.board[q] = null;
    ed.board[s] = { color, type };
    ed.cover.delete(s);
  }
  sfx.click();
  renderEditor();
});
$('ed-palette').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  ed.tool = b.dataset.tool;
  renderEditor();
});
for (const id of ['ed-goal', 'ed-mode', 'ed-n']) $(id).addEventListener('change', renderEditor);
$('ed-clear').addEventListener('click', () => {
  ed.board = new Array(64).fill(null);
  ed.cover.clear();
  ed.target = -1;
  renderEditor();
});
$('ed-standard').addEventListener('click', () => {
  edStandard();
  renderEditor();
});
$('ed-test').addEventListener('click', () => {
  const err = edCheck();
  if (err) return ($('ed-err').textContent = err);
  progress.unlock('architect');
  closeOverlay('editor');
  startGame(puzzleToBattle(edPuzzle(), 'test'));
});
$('ed-copy').addEventListener('click', async () => {
  const err = edCheck();
  if (err) return ($('ed-err').textContent = err);
  const code = encodePuzzle(edPuzzle());
  $('ed-code').value = code;
  $('ed-code').select();
  try {
    await navigator.clipboard.writeText(code);
    $('ed-err').textContent = 'Code copied. Friends can paste it in Puzzles → Play a code.';
  } catch {
    $('ed-err').textContent = 'Copy the code above and send it to a friend.';
  }
});
$('ed-load').addEventListener('click', () => {
  try {
    edLoad(decodePuzzle($('ed-code').value));
    renderEditor();
  } catch (err) {
    $('ed-err').textContent = err.message;
  }
});
$('ed-close').addEventListener('click', () => closeOverlay('editor'));
for (const id of ['ed-title', 'ed-code']) $(id).addEventListener('keydown', (e) => e.stopPropagation());

// --- Hints --------------------------------------------------------------------------------------

function updateHintButton() {
  const can = !!(battle && battle.hint && PRACTICE.has(battle.kind) && battle.kind !== 'rush' && st && !st.result && !replaying);
  $('btn-hint').classList.toggle('hidden', !can);
  if (can) $('btn-hint').title = hintLevel >= 2 ? 'Hint fully shown' : `Hint (${HINT_COST} XP): ${hintLevel ? 'show the square' : 'show the piece'}`;
}
$('btn-hint').addEventListener('click', () => {
  if (!battle || !battle.hint || hintLevel >= 2) return;
  if (!progress.spendXp(HINT_COST)) return status(`A hint costs ${HINT_COST} XP. You have ${progress.balance}.`, 'warn');
  hintLevel++;
  const trick = battle.puzzle && battle.puzzle.aim;
  status(hintLevel === 1 ? `Hint: use the highlighted piece (−${HINT_COST} XP).` : trick ? `Hint: click exactly on the gold dot (−${HINT_COST} XP).` : `Hint: aim for the gold marker (−${HINT_COST} XP).`, 'warn');
  refresh();
});

// --- Sniper scope -------------------------------------------------------------------------------

let breath = 1; // 0..1, drains while you hold Shift
let swayY = 0;
let swayP = 0;
let scopeTimer = 0;
function canScope() {
  return !!(st && started && viewMode === 'pov' && humanTurn() && !busy && !replaying && !(battle && battle.kind === 'rush'));
}
function setScope(on) {
  scoped = !!on && canScope();
  $('scope').classList.toggle('hidden', !scoped);
  $('btn-scope').classList.toggle('on', scoped);
  if (!scoped) {
    swayY = 0;
    swayP = 0;
  }
}
function scopeFire() {
  const r = canvas.getBoundingClientRect();
  const h = pick(r.left + r.width / 2, r.top + r.height / 2);
  if (!h || !h.piece || !current.targets.includes(h.sq)) return status('No target in your sights.', 'warn');
  const from = sqOfId(povId);
  const sh = R.legalActions(st, from).find((a) => a.kind === 'shoot' && a.to === h.sq);
  if (!sh) return;
  setScope(false);
  if (battle && battle.goal && battle.goal.type === 'odds') oddsPick = gradeOdds(from, h.sq, h.point);
  doShoot(sh, h.point, SCOPE_SPREAD, true);
}
const SCOPE_SPREAD = 0.6; // steadier than hip fire
$('btn-scope').addEventListener('click', () => setScope(!scoped));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function updateScope(dt, time) {
  if (scoped && !canScope()) setScope(false);
  if (!scoped) {
    breath = Math.min(1, breath + dt * 0.3);
    return;
  }
  const holding = keys.has('shift') && breath > 0;
  if (holding) breath = Math.max(0, breath - dt * 0.45);
  else breath = Math.min(1, breath + dt * 0.25);
  const amp = holding ? 0.2 : keys.has('shift') ? 1.6 : 1;
  swayY = amp * 0.012 * (Math.sin(time * 0.7) + 0.5 * Math.sin(time * 1.9));
  swayP = amp * 0.009 * (Math.sin(time * 0.9 + 1) + 0.5 * Math.sin(time * 2.3));
  scopeTimer -= dt;
  if (scopeTimer <= 0) {
    scopeTimer = 0.15;
    const r = canvas.getBoundingClientRect();
    const h = pick(r.left + r.width / 2, r.top + r.height / 2);
    const tgt = h && h.piece && current.targets.includes(h.sq);
    $('scope-chance').textContent = tgt ? `${Math.round(R.hitChance(st, sqOfId(povId), h.sq, h.point, 120, SCOPE_SPREAD) * 100)}%` : '';
    $('scope').classList.toggle('on-target', !!tgt);
    $('scope').style.setProperty('--breath', breath.toFixed(2));
  }
}

// --- Weather visuals: rain and a wind indicator ---------------------------------------------------

const RAIN_N = 1400;
const rainPos = new Float32Array(RAIN_N * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0.55 }));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);
for (let i = 0; i < RAIN_N; i++) {
  const x = (Math.random() - 0.5) * 22;
  const z = (Math.random() - 0.5) * 22;
  const y = Math.random() * 12;
  rainPos.set([x, y, z, x, y - 0.35, z], i * 6);
}
function updateWeather(dt) {
  const wx = st && started && screen !== 'main-menu' ? st.weather : null;
  rain.visible = !!(wx && wx.rain);
  if (rain.visible) {
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6;
      let y = rainPos[o + 1] - dt * 14;
      if (y < -0.2) y += 12;
      rainPos[o + 1] = y;
      rainPos[o + 4] = y - 0.35;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  const wind = wx && wx.wind;
  $('wind-hud').classList.toggle('hidden', !wind);
  if (wind) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const fl = Math.hypot(f.x, f.z) || 1;
    const fx = f.x / fl;
    const fz = f.z / fl;
    const rel = Math.atan2(wind.x * -fz + wind.z * fx, wind.x * fx + wind.z * fz);
    $('wind-arrow').style.transform = `rotate(${rel}rad)`;
    $('wind-speed').textContent = `${wx.kph} km/h`;
  }
}

// --- Main loop -----------------------------------------------------------------------------

const clock = new THREE.Clock();
let mapTimer = 0;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
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
  const targetFov = scoped ? 18 : viewMode === 'pov' ? fov : 50;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
  desiredPose(_pos, _quat);
  if (killcam) {
    _pos.copy(killcam.head).addScaledVector(killcam.dir, -0.9);
    _pos.y += 0.12;
    _m.lookAt(_pos, killcam.head.clone().addScaledVector(killcam.dir, 2), _up);
    _quat.setFromRotationMatrix(_m);
  }
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
  for (const [id, g] of groups) g.visible = !(viewMode === 'pov' && id === povId && blend > 0.55) && !hiddenIds.has(id);

  // Markers.
  for (const d of diamonds) {
    d.rotation.y = time * 2.5;
    d.position.y = d.userData.baseY + Math.sin(time * 4) * 0.04;
  }
  moveMat.opacity = 0.75 + Math.sin(time * 4) * 0.15;
  moveRingMat.opacity = 0.4 + Math.sin(time * 4) * 0.15;
  ringMat.color.setHSL(0.01, 1, 0.5 + Math.sin(time * 6) * 0.1);

  fx.update(dt);
  updateScope(dt, time);
  updateWeather(dt);
  if (rush && rush.running && screen === 'game' && !paused) {
    const before = Math.ceil(rush.left);
    rush.left -= Math.min(rawDt, 1); // real time, so slow devices don't get extra time
    if (Math.ceil(rush.left) !== before) updateRushHud();
    if (rush.left <= 0) endRush('time up');
  }
  for (const m of smokeRoot.children) {
    m.rotation.y += dt * 0.3;
    m.position.y += Math.sin(clock.elapsedTime * 0.8 + m.userData.seed) * dt * 0.05;
  }
  if (needRebuild && tweens.length === 0) rebuildPieces();

  // Minimap view cone follows the camera.
  mapTimer += dt;
  if (st && mapTimer > 0.06) {
    mapTimer = 0;
    drawMap();
  }

  renderer.clear();
  renderer.render(scene, camera);
  if (viewGun && viewMode === 'pov' && blend > 0.8 && !killcam && !scoped) {
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
window.__gunmate = { state: () => st, legal: () => (st ? R.legalActions(st) : []), busy: () => busy, music: sfx.music, progress: () => progress, start: (b) => startGame({ kind: 'test', name: 'Test', foe: 'Test', ai: 'easy', mode: R.MERCIZERO, ...b }), killcam: () => !!killcam, project: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; }, battle: () => battle, fog: () => ({ hidden: [...fogHidden], hiddenGroups: [...groups.values()].filter((g) => !g.visible).length }), tile: (i) => { const m = tiles[i].material; return { c: m.color.getHexString(), e: m.emissive.getHexString(), ei: m.emissiveIntensity, r: m.roughness }; }, cam: () => ({ pos: camera.position.toArray().map((v) => +v.toFixed(2)), povId, viewMode, yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2) }) };

// Show the board (slowly orbiting) behind the menu.
st = R.newGame(R.CLASSIC);
placeAll();
viewMode = 'over';
ovPitch = 0.6;
frame();
