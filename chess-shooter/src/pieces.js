// Low-poly chess pieces, each holding a gun. Pieces face -Z (toward Black) when rotation.y = 0.
import * as THREE from 'three';
import { PIECE_SKINS, GUN_SKINS, applySpec } from './skins.js';

const GUN_METAL = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.45, metalness: 0.6, flatShading: true });
const GUN_WOOD = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8, flatShading: true });

// Current skins (set from the shop). Gun materials are shared, so changing them restyles every gun.
let pieceSkin = PIECE_SKINS[0];
let gunSkin = GUN_SKINS[0];
let envMap = null;
export function setEnvMap(tex) {
  envMap = tex;
}
export function setPieceSkin(skin) {
  pieceSkin = skin;
}
export function setGunSkin(skin) {
  gunSkin = skin;
  applySpec(GUN_METAL, skin.metal, envMap);
  applySpec(GUN_WOOD, skin.grip, envMap);
}
const skinned = (spec) => {
  const m = new THREE.MeshStandardMaterial({ flatShading: true });
  applySpec(m, spec, envMap);
  return m;
};

const SEG = 8;
const v2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
const BASE = [[0, 0], [0.34, 0], [0.35, 0.05], [0.3, 0.09], [0.25, 0.13]];

function lathe(pts, mat, segs = SEG) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(v2(pts), segs), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function ico(r, mat, y, detail = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

// Gun lengths and styles per piece type.
const GUNS = {
  p: { len: 0.2, thick: 0.045, stock: false },
  k: { len: 0.24, thick: 0.05, stock: false, drum: true },
  n: { len: 0.3, thick: 0.05, stock: true },
  b: { len: 0.36, thick: 0.045, stock: true, scope: true },
  r: { len: 0.56, thick: 0.05, stock: true, scope: true },
  q: { len: 0.44, thick: 0.055, stock: true, mag: true },
};

export function buildGun(type, trimMat, scale = 1) {
  const g = new THREE.Group();
  const s = GUNS[type];
  const t = s.thick;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(t * 0.42, t * 0.42, s.len, 6), GUN_METAL);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -s.len / 2 - 0.02;
  barrel.castShadow = true;
  g.add(barrel);
  g.add(box(t * 1.5, t * 1.7, 0.14, GUN_METAL, 0, 0, 0.04));
  g.add(box(t * 1.1, 0.11, t * 1.3, s.stock ? GUN_WOOD : GUN_METAL, 0, -0.07, 0.08).rotateX(-0.3));
  if (s.stock) g.add(box(t * 1.3, t * 2, 0.16, GUN_WOOD, 0, -0.015, 0.18));
  if (s.scope) {
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), GUN_METAL);
    sc.rotation.x = Math.PI / 2;
    sc.position.set(0, t * 1.4, -0.02);
    g.add(sc);
  }
  if (s.drum) g.add(new THREE.Mesh(new THREE.CylinderGeometry(t * 1.05, t * 1.05, 0.06, 6), GUN_METAL).rotateX(Math.PI / 2));
  if (s.mag) g.add(box(t * 0.9, 0.12, t * 1.4, GUN_METAL, 0, -0.08, -0.06).rotateX(0.2));
  g.add(box(t * 1.6, t * 0.6, 0.04, trimMat, 0, 0, -0.02)); // coloured band so you can tell sides apart
  const muzzle = new THREE.Object3D();
  muzzle.position.z = -s.len - 0.03;
  muzzle.name = 'muzzle';
  g.add(muzzle);
  g.scale.setScalar(scale);
  return g;
}

function bodyFor(type, mat, trim) {
  const g = new THREE.Group();
  switch (type) {
    case 'p':
      g.add(lathe([...BASE, [0.16, 0.26], [0.11, 0.38], [0.17, 0.41], [0.06, 0.45], [0, 0.45]], mat));
      g.add(ico(0.13, mat, 0.52, 1));
      break;
    case 'r':
      g.add(lathe([...BASE, [0.23, 0.2], [0.2, 0.6], [0.28, 0.64], [0.28, 0.76], [0.21, 0.76], [0, 0.74]], mat));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.add(box(0.11, 0.09, 0.11, mat, Math.cos(a) * 0.22, 0.8, Math.sin(a) * 0.22));
      }
      g.add(lathe([[0.235, 0.5], [0.235, 0.55]], trim, 8));
      break;
    case 'n': {
      g.add(lathe([...BASE, [0.21, 0.24], [0.18, 0.4], [0, 0.42]], mat));
      const head = new THREE.Group();
      head.add(box(0.22, 0.36, 0.28, mat, 0, 0.56, 0.02).rotateX(-0.25));
      head.add(box(0.18, 0.16, 0.3, mat, 0, 0.72, -0.15).rotateX(0.35));
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), mat);
      earL.position.set(-0.06, 0.86, 0.04);
      const earR = earL.clone();
      earR.position.x = 0.06;
      head.add(earL, earR);
      head.add(box(0.06, 0.34, 0.08, trim, 0, 0.66, 0.15).rotateX(-0.2)); // mane
      head.add(box(0.035, 0.035, 0.035, new THREE.MeshBasicMaterial({ color: 0x111111 }), -0.1, 0.76, -0.1));
      head.add(box(0.035, 0.035, 0.035, new THREE.MeshBasicMaterial({ color: 0x111111 }), 0.1, 0.76, -0.1));
      g.add(head);
      break;
    }
    case 'b':
      g.add(lathe([...BASE, [0.16, 0.28], [0.11, 0.58], [0.19, 0.62], [0.11, 0.67], [0, 0.67]], mat));
      g.add(lathe([[0, 0.66], [0.15, 0.73], [0.165, 0.83], [0.1, 0.94], [0, 0.98]], mat, 7));
      g.add(ico(0.045, trim, 1.0));
      g.add(box(0.03, 0.12, 0.34, trim, 0, 0.82, 0).rotateZ(0.5));
      break;
    case 'q':
      g.add(lathe([...BASE, [0.17, 0.3], [0.12, 0.7], [0.23, 0.82], [0.2, 0.86], [0, 0.86]], mat));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), trim);
        c.position.set(Math.cos(a) * 0.17, 0.92, Math.sin(a) * 0.17);
        c.castShadow = true;
        g.add(c);
      }
      g.add(ico(0.075, mat, 1.06));
      break;
    case 'k':
      g.add(lathe([...BASE, [0.18, 0.3], [0.13, 0.76], [0.24, 0.87], [0.17, 0.95], [0, 0.97]], mat));
      g.add(lathe([[0.2, 0.8], [0.21, 0.84]], trim, 8));
      g.add(box(0.07, 0.3, 0.07, trim, 0, 1.1, 0));
      g.add(box(0.22, 0.07, 0.07, trim, 0, 1.14, 0));
      break;
  }
  return g;
}

const GRIP_RADIUS = { p: 0.16, n: 0.2, b: 0.16, r: 0.22, q: 0.17, k: 0.18 };

export function buildPiece(type, color, dims) {
  const root = new THREE.Group(); // positioned on the board, rotated to face its target
  const mat = skinned(pieceSkin[color].body);
  const trim = skinned(pieceSkin[color].trim);
  const body = bodyFor(type, mat, trim);
  root.add(body);
  const gun = buildGun(type, trim);
  gun.position.set(0.04, dims.h * 0.55, -GRIP_RADIUS[type] + 0.02);
  root.add(gun);
  // Little arm stub holding the gun.
  root.add(box(0.06, 0.06, 0.14, mat, 0.08, dims.h * 0.55 - 0.03, -GRIP_RADIUS[type] + 0.08));
  root.userData = { mat, trim, gun, body, type, color };
  return root;
}

// First-person gun shown at the bottom right of the screen in POV mode, in the current gun skin.
// The standard finish is drawn a little lighter so it doesn't read as a black blob up close.
export function buildViewGun(type, color) {
  const trim = skinned({ ...pieceSkin[color].trim, m: 0 });
  const g = buildGun(type, trim, 1);
  const std = gunSkin === GUN_SKINS[0];
  const metal = skinned(std ? { c: 0x4a4f58, r: 0.55, m: 0.1 } : gunSkin.metal);
  const wood = skinned(std ? { c: 0x8a5a33, r: 0.8 } : gunSkin.grip);
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    if (o.material === GUN_METAL) o.material = metal;
    else if (o.material === GUN_WOOD) o.material = wood;
  });
  return g;
}

// Shard geometries for the "shattered into polygons" death effect.
export const SHARD_GEOS = [
  new THREE.TetrahedronGeometry(0.07),
  new THREE.TetrahedronGeometry(0.05),
  new THREE.OctahedronGeometry(0.05),
  new THREE.BoxGeometry(0.07, 0.05, 0.06),
];

// Piece mastery V: gold trim on this piece.
export function goldTrim(group) {
  const t = group.userData.trim;
  if (t) applySpec(t, { c: 0xffcf4a, r: 0.22, m: 0.95, e: 0x6a4000, ei: 0.25 }, envMap);
}
