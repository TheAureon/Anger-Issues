import * as THREE from 'three';
import { mat, mesh } from './materials.js';

/*
 * Cosmetic accessories for the mannequin. Each builds a small low-poly group
 * in the local space of the part it rides on (head: face toward +z, top at
 * about y = 0.13; chest: front at z = 0.11, top at y = 0.21; pelvis likewise).
 * They're children of the part's mesh, so they travel with that piece: knock
 * the head off and the hat goes with it.
 */

const M = (c, o) => mat(c, o);
const sph = (r, w = 8, h = 6, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

function at(m, x, y, z, rx = 0, ry = 0, rz = 0) {
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

const dome = (r) => sph(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);

export const HATS = {
  none: { name: 'None', icon: '🚫' },
  tophat: {
    name: 'Top hat',
    icon: '🎩',
    build() {
      const g = new THREE.Group();
      const black = M(0x1c1c22, { roughness: 0.5 });
      g.add(at(mesh(cyl(0.17, 0.17, 0.014, 14), black), 0, 0.105, 0));
      g.add(at(mesh(cyl(0.1, 0.095, 0.2, 14), black), 0, 0.21, 0));
      g.add(at(mesh(cyl(0.098, 0.098, 0.035, 14), M(0xc0283a)), 0, 0.135, 0));
      g.rotation.z = 0.08;
      return g;
    },
  },
  cap: {
    name: 'Cap',
    icon: '🧢',
    build() {
      const g = new THREE.Group();
      const red = M(0xd62839, { roughness: 0.7 });
      const d = mesh(dome(0.126), red);
      d.scale.set(1, 0.9, 1);
      g.add(at(d, 0, 0.035, 0));
      g.add(at(mesh(box(0.16, 0.012, 0.12), red), 0, 0.045, 0.13, -0.18));
      g.add(at(mesh(sph(0.014), M(0xffffff)), 0, 0.15, 0));
      return g;
    },
  },
  party: {
    name: 'Party hat',
    icon: '🥳',
    build() {
      const g = new THREE.Group();
      const cone = mesh(new THREE.ConeGeometry(0.07, 0.2, 10), M(0xff4fa3, { roughness: 0.6 }));
      g.add(at(cone, 0.02, 0.21, 0, 0, 0, -0.18));
      for (let i = 0; i < 3; i++) {
        const stripe = mesh(cyl(0.056 - i * 0.017, 0.062 - i * 0.017, 0.012, 10), M([0xffd23f, 0x4dabff, 0x7ed957][i]));
        g.add(at(stripe, 0.02 + (0.03 + i * 0.05) * Math.sin(0.18), 0.15 + i * 0.05, 0, 0, 0, -0.18));
      }
      g.add(at(mesh(sph(0.025), M(0xffd23f)), 0.04, 0.31, 0));
      return g;
    },
  },
  crown: {
    name: 'Crown',
    icon: '👑',
    build() {
      const g = new THREE.Group();
      const gold = M(0xffc93c, { roughness: 0.3, metalness: 0.45, emissive: 0x6a4300, emissiveIntensity: 0.3 });
      const ring = mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.06, 12, 1, true), gold);
      g.add(at(ring, 0, 0.13, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(at(mesh(new THREE.ConeGeometry(0.022, 0.06, 4), gold), Math.sin(a) * 0.098, 0.19, Math.cos(a) * 0.098));
        g.add(at(mesh(sph(0.012, 6, 4), M([0xe8213a, 0x2a8cff, 0x3fd06a][i % 3], { roughness: 0.2 })), Math.sin(a) * 0.103, 0.13, Math.cos(a) * 0.103));
      }
      g.rotation.z = -0.06;
      return g;
    },
  },
  hardhat: {
    name: 'Hard hat',
    icon: '⛑️',
    build() {
      const g = new THREE.Group();
      const yellow = M(0xf2c12e, { roughness: 0.45 });
      g.add(at(mesh(dome(0.135), yellow), 0, 0.03, 0));
      g.add(at(mesh(cyl(0.165, 0.165, 0.012, 14), yellow), 0, 0.035, 0.01));
      g.add(at(mesh(box(0.03, 0.03, 0.27), yellow), 0, 0.15, 0));
      return g;
    },
  },
  cowboy: {
    name: 'Cowboy',
    icon: '🤠',
    build() {
      const g = new THREE.Group();
      const brown = M(0x8a5a2b, { roughness: 0.8 });
      const brim = mesh(cyl(0.24, 0.24, 0.012, 16), brown);
      brim.scale.z = 0.85;
      g.add(at(brim, 0, 0.1, 0));
      g.add(at(mesh(cyl(0.085, 0.1, 0.13, 12), brown), 0, 0.17, 0));
      g.add(at(mesh(cyl(0.101, 0.101, 0.025, 12), M(0x3a2414)), 0, 0.12, 0));
      g.rotation.x = -0.08;
      return g;
    },
  },
  viking: {
    name: 'Viking',
    icon: '🐂',
    build() {
      const g = new THREE.Group();
      g.add(at(mesh(dome(0.132), M(0x8d949c, { metalness: 0.6, roughness: 0.4 })), 0, 0.025, 0));
      g.add(at(mesh(cyl(0.134, 0.134, 0.03, 14), M(0x6b4a2a)), 0, 0.035, 0));
      for (const s of [-1, 1]) {
        g.add(at(mesh(new THREE.ConeGeometry(0.032, 0.15, 6), M(0xf2e6c9, { roughness: 0.6 })), s * 0.15, 0.12, 0, 0, 0, -s * 0.85));
      }
      return g;
    },
  },
  propeller: {
    name: 'Propeller',
    icon: '🚁',
    build() {
      const g = new THREE.Group();
      g.add(at(mesh(dome(0.128), M(0x2a8cff, { roughness: 0.6 })), 0, 0.03, 0));
      g.add(at(mesh(cyl(0.129, 0.129, 0.03, 14), M(0xffd23f)), 0, 0.06, 0));
      g.add(at(mesh(cyl(0.008, 0.008, 0.05, 6), M(0x888888)), 0, 0.17, 0));
      const prop = new THREE.Group();
      prop.position.y = 0.195;
      prop.add(mesh(box(0.22, 0.006, 0.035), M(0xe8213a)));
      prop.add(at(mesh(box(0.035, 0.006, 0.22), M(0x3fd06a)), 0, 0, 0));
      prop.userData.spin = 18; // animated in life.js
      g.add(prop);
      return g;
    },
  },
  chef: {
    name: 'Chef',
    icon: '🧑‍🍳',
    build() {
      const g = new THREE.Group();
      const white = M(0xf8f6f2, { roughness: 0.9 });
      g.add(at(mesh(cyl(0.11, 0.11, 0.07, 12), white), 0, 0.12, 0));
      for (const [x, z] of [[0.04, 0.03], [-0.04, 0.03], [0, -0.045], [0, 0]]) {
        g.add(at(mesh(new THREE.IcosahedronGeometry(0.07, 1), white), x, 0.21, z));
      }
      return g;
    },
  },
  beanie: {
    name: 'Beanie',
    icon: '🧶',
    build() {
      const g = new THREE.Group();
      const knit = M(0xe0a526, { roughness: 1 });
      const d = mesh(dome(0.127), knit);
      d.scale.y = 1.05;
      g.add(at(d, 0, 0.03, 0));
      g.add(at(mesh(cyl(0.13, 0.13, 0.05, 14), M(0xc98a15, { roughness: 1 })), 0, 0.045, 0));
      g.add(at(mesh(new THREE.IcosahedronGeometry(0.038, 1), M(0xf8f6f2, { roughness: 1 })), 0, 0.17, 0));
      return g;
    },
  },
  wizard: {
    name: 'Wizard',
    icon: '🧙',
    build() {
      const g = new THREE.Group();
      const blue = M(0x3b4bc8, { roughness: 0.7 });
      g.add(at(mesh(cyl(0.2, 0.2, 0.012, 16), blue), 0, 0.1, 0));
      g.add(at(mesh(new THREE.ConeGeometry(0.12, 0.38, 12), blue), -0.02, 0.29, 0, 0, 0, 0.12));
      const star = M(0xffd23f, { emissive: 0x8a6a00, emissiveIntensity: 0.6 });
      for (const [x, y, z] of [[0.05, 0.22, 0.08], [-0.04, 0.32, 0.06], [0.0, 0.18, -0.1], [0.07, 0.15, -0.05]]) {
        g.add(at(mesh(new THREE.OctahedronGeometry(0.018, 0), star), x, y, z));
      }
      return g;
    },
  },
  witch: {
    name: 'Witch',
    icon: '🧹',
    build() {
      const g = new THREE.Group();
      const black = M(0x1f1a26, { roughness: 0.7 });
      g.add(at(mesh(cyl(0.23, 0.23, 0.01, 16), black), 0, 0.1, 0));
      g.add(at(mesh(cyl(0.05, 0.1, 0.2, 12), black), 0, 0.2, 0));
      g.add(at(mesh(new THREE.ConeGeometry(0.05, 0.16, 10), black), -0.04, 0.34, 0, 0, 0, 0.6));
      g.add(at(mesh(cyl(0.1, 0.1, 0.03, 12), M(0x7b3fc8)), 0, 0.12, 0));
      g.add(at(mesh(box(0.035, 0.03, 0.01), M(0xffd23f, { metalness: 0.5 })), 0, 0.12, 0.1));
      return g;
    },
  },
  santa: {
    name: 'Santa',
    icon: '🎅',
    build() {
      const g = new THREE.Group();
      const red = M(0xd62839, { roughness: 0.8 });
      const white = M(0xf8f6f2, { roughness: 1 });
      g.add(at(mesh(new THREE.ConeGeometry(0.125, 0.3, 12), red), 0.07, 0.2, 0, 0, 0, -0.65));
      g.add(at(mesh(new THREE.TorusGeometry(0.115, 0.032, 6, 16), white), 0, 0.085, 0, Math.PI / 2));
      g.add(at(mesh(new THREE.IcosahedronGeometry(0.035, 1), white), 0.2, 0.28, 0));
      return g;
    },
  },
  pirate: {
    name: 'Pirate',
    icon: '☠️',
    build() {
      const g = new THREE.Group();
      const black = M(0x15141a, { roughness: 0.7 });
      const brim = mesh(cyl(0.2, 0.2, 0.02, 16), black);
      brim.scale.set(1.25, 1, 0.55);
      g.add(at(brim, 0, 0.12, 0));
      // Upturned front and back: half discs standing up.
      for (const z of [0.05, -0.05]) {
        const half = mesh(new THREE.CircleGeometry(0.17, 14, 0, Math.PI), M(0x15141a, { roughness: 0.7, side: THREE.DoubleSide }));
        half.scale.set(1.35, 0.75, 1);
        g.add(at(half, 0, 0.12, z, z > 0 ? -0.2 : 0.2));
      }
      g.add(at(mesh(sph(0.025, 8, 6), M(0xf8f6f2)), 0, 0.18, 0.08));
      g.add(at(mesh(box(0.42, 0.012, 0.012), M(0xffc93c, { metalness: 0.5 })), 0, 0.125, 0.0));
      return g;
    },
  },
  halo: {
    name: 'Halo',
    icon: '😇',
    build() {
      const g = new THREE.Group();
      const ring = mesh(new THREE.TorusGeometry(0.1, 0.013, 6, 24), M(0xffe27a, { emissive: 0xffc93c, emissiveIntensity: 1.2, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.position.y = 0.25;
      holder.add(ring);
      holder.userData.spin = 0.8;
      g.add(holder);
      return g;
    },
  },
  bunny: {
    name: 'Bunny ears',
    icon: '🐰',
    build() {
      const g = new THREE.Group();
      const white = M(0xf8f6f2, { roughness: 0.9 });
      const pink = M(0xffb3cf, { roughness: 0.9 });
      g.add(at(mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 16, Math.PI), M(0x2b2b33)), 0, 0.03, 0, 0, Math.PI / 2));
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.add(mesh(new THREE.CapsuleGeometry(0.032, 0.17, 3, 8), white));
        ear.add(at(mesh(new THREE.CapsuleGeometry(0.018, 0.14, 3, 6), pink), 0, 0, 0.018));
        g.add(at(ear, s * 0.05, 0.25, 0, 0, 0, -s * 0.18));
      }
      return g;
    },
  },
  sombrero: {
    name: 'Sombrero',
    icon: '🪅',
    build() {
      const g = new THREE.Group();
      const straw = M(0xe8c27a, { roughness: 0.9 });
      g.add(at(mesh(cyl(0.33, 0.33, 0.014, 20), straw), 0, 0.1, 0));
      g.add(at(mesh(new THREE.TorusGeometry(0.33, 0.022, 6, 24), straw), 0, 0.115, 0, Math.PI / 2));
      g.add(at(mesh(cyl(0.07, 0.11, 0.17, 14), straw), 0, 0.19, 0));
      g.add(at(mesh(cyl(0.106, 0.11, 0.03, 14), M(0xd62839)), 0, 0.13, 0));
      g.add(at(mesh(cyl(0.1, 0.104, 0.015, 14), M(0x3fd06a)), 0, 0.155, 0));
      return g;
    },
  },
  beret: {
    name: 'Beret',
    icon: '🎨',
    build() {
      const g = new THREE.Group();
      const red = M(0xb3202f, { roughness: 1 });
      const top = mesh(new THREE.SphereGeometry(0.15, 12, 6), red);
      top.scale.set(1, 0.28, 1);
      g.add(at(top, 0.02, 0.12, -0.01, -0.1, 0, 0.22));
      g.add(at(mesh(cyl(0.008, 0.008, 0.03, 5), red), 0.03, 0.17, 0));
      return g;
    },
  },
  gradcap: {
    name: 'Grad cap',
    icon: '🎓',
    build() {
      const g = new THREE.Group();
      const black = M(0x15141a, { roughness: 0.6 });
      g.add(at(mesh(cyl(0.11, 0.115, 0.07, 14), black), 0, 0.12, 0));
      g.add(at(mesh(box(0.3, 0.015, 0.3), black), 0, 0.165, 0, 0, Math.PI / 4));
      g.add(at(mesh(sph(0.012), M(0xffc93c)), 0, 0.177, 0));
      const gold = M(0xffc93c, { roughness: 0.6 });
      g.add(at(mesh(box(0.006, 0.006, 0.2), gold), 0, 0.175, 0.1));
      g.add(at(mesh(cyl(0.012, 0.018, 0.07, 6), gold), 0, 0.14, 0.205));
      return g;
    },
  },
  cone: {
    name: 'Traffic cone',
    icon: '🚧',
    build() {
      const g = new THREE.Group();
      const orange = M(0xff6a1a, { roughness: 0.6 });
      g.add(at(mesh(box(0.25, 0.02, 0.25), orange), 0, 0.11, 0));
      g.add(at(mesh(new THREE.ConeGeometry(0.115, 0.34, 12), orange), 0, 0.29, 0));
      const white = M(0xf8f6f2, { roughness: 0.5 });
      g.add(at(mesh(cyl(0.072, 0.086, 0.045, 12), white), 0, 0.25, 0));
      g.add(at(mesh(cyl(0.04, 0.052, 0.035, 12), white), 0, 0.34, 0));
      return g;
    },
  },
  fez: {
    name: 'Fez',
    icon: '🟥',
    build() {
      const g = new THREE.Group();
      g.add(at(mesh(cyl(0.075, 0.095, 0.13, 14), M(0xb3202f, { roughness: 0.8 })), 0, 0.17, 0, 0, 0, -0.08));
      g.add(at(mesh(box(0.006, 0.09, 0.006), M(0x15141a)), 0.06, 0.2, 0, 0, 0, 0.3));
      g.add(at(mesh(cyl(0.01, 0.02, 0.04, 6), M(0x15141a)), 0.075, 0.15, 0));
      return g;
    },
  },
  headphones: {
    name: 'Headphones',
    icon: '🎧',
    build() {
      const g = new THREE.Group();
      const dark = M(0x2b2b33, { roughness: 0.4 });
      g.add(at(mesh(new THREE.TorusGeometry(0.135, 0.014, 6, 20, Math.PI), dark), 0, 0.02, 0));
      for (const s of [-1, 1]) {
        g.add(at(mesh(cyl(0.05, 0.05, 0.035, 14), M(0xe8213a, { roughness: 0.35 })), s * 0.13, 0.0, 0, 0, 0, Math.PI / 2));
        g.add(at(mesh(cyl(0.042, 0.042, 0.012, 14), dark), s * 0.108, 0.0, 0, 0, 0, Math.PI / 2));
      }
      return g;
    },
  },
  astronaut: {
    name: 'Astronaut',
    icon: '👨‍🚀',
    build() {
      const g = new THREE.Group();
      const glass = mesh(sph(0.19, 16, 12), M(0xbfe6ff, { opacity: 0.22, roughness: 0.05, metalness: 0.1 }));
      glass.castShadow = false;
      g.add(at(glass, 0, 0.0, 0.01));
      g.add(at(mesh(new THREE.TorusGeometry(0.135, 0.03, 6, 20), M(0xe8e8ec, { roughness: 0.5 })), 0, -0.15, 0, Math.PI / 2));
      g.add(at(mesh(box(0.05, 0.02, 0.02), M(0x2a8cff)), 0.1, 0.14, 0.11, 0, 0, -0.6));
      return g;
    },
  },
};

export const FACES = {
  none: { name: 'None', icon: '🚫' },
  glasses: {
    name: 'Glasses',
    icon: '👓',
    build() {
      const g = new THREE.Group();
      const frame = M(0x222222, { roughness: 0.4 });
      for (const x of [-0.046, 0.046]) g.add(at(mesh(new THREE.TorusGeometry(0.031, 0.006, 5, 14), frame), x, 0.024, 0.119));
      g.add(at(mesh(box(0.03, 0.006, 0.006), frame), 0, 0.03, 0.12));
      return g;
    },
  },
  shades: {
    name: 'Shades',
    icon: '🕶️',
    build() {
      const g = new THREE.Group();
      const lens = M(0x0c0c10, { roughness: 0.1, metalness: 0.4 });
      for (const x of [-0.047, 0.047]) g.add(at(mesh(box(0.058, 0.036, 0.008), lens), x, 0.026, 0.12));
      g.add(at(mesh(box(0.15, 0.008, 0.008), M(0x222222)), 0, 0.044, 0.12));
      return g;
    },
  },
  mustache: {
    name: 'Mustache',
    icon: '🥸',
    build() {
      const g = new THREE.Group();
      const hair = M(0x3a2414, { roughness: 1 });
      for (const s of [-1, 1]) {
        const m = mesh(sph(0.03, 8, 5), hair);
        m.scale.set(1.5, 0.55, 0.6);
        g.add(at(m, s * 0.028, -0.034, 0.112, 0, 0, s * 0.3));
      }
      return g;
    },
  },
  clown: {
    name: 'Clown nose',
    icon: '🤡',
    build() {
      const g = new THREE.Group();
      g.add(at(mesh(sph(0.03, 10, 8), M(0xe8213a, { roughness: 0.25 })), 0, -0.012, 0.14));
      return g;
    },
  },
  patch: {
    name: 'Eye patch',
    icon: '🏴‍☠️',
    build() {
      const g = new THREE.Group();
      const black = M(0x111111, { roughness: 0.8 });
      g.add(at(mesh(cyl(0.032, 0.032, 0.008, 12), black), -0.046, 0.024, 0.118, Math.PI / 2));
      const strap = mesh(new THREE.TorusGeometry(0.124, 0.005, 4, 24), black);
      g.add(at(strap, 0, 0.03, 0, 0.1, 0, 0.45));
      return g;
    },
  },
  monocle: {
    name: 'Monocle',
    icon: '🧐',
    build() {
      const g = new THREE.Group();
      const gold = M(0xffc93c, { roughness: 0.3, metalness: 0.5 });
      g.add(at(mesh(new THREE.TorusGeometry(0.032, 0.005, 5, 14), gold), 0.046, 0.024, 0.12));
      g.add(at(mesh(box(0.003, 0.09, 0.003), gold), 0.075, -0.03, 0.115, 0, 0, 0.3));
      return g;
    },
  },
};

/** A pair of wings on the back that flap gently (animated in life.js). */
function wings(color, style, speed) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  if (style === 'feather') {
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.12, 0.16, 0.34, 0.22, 0.42, 0.12);
    shape.lineTo(0.36, 0.04);
    shape.lineTo(0.4, -0.02);
    shape.lineTo(0.31, -0.07);
    shape.lineTo(0.33, -0.14);
    shape.lineTo(0.22, -0.16);
    shape.lineTo(0.2, -0.24);
    shape.bezierCurveTo(0.1, -0.2, 0.03, -0.1, 0, 0);
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(0.16, 0.18);
    shape.lineTo(0.42, 0.2);
    shape.quadraticCurveTo(0.36, 0.08, 0.4, -0.04);
    shape.quadraticCurveTo(0.3, -0.02, 0.27, -0.12);
    shape.quadraticCurveTo(0.18, -0.06, 0.13, -0.16);
    shape.quadraticCurveTo(0.08, -0.06, 0, 0);
  }
  const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  const m = M(color, { roughness: 0.8, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.06, 0.1, -0.13);
    const w = mesh(geom, m);
    w.scale.x = s;
    hinge.add(w);
    hinge.userData.flap = { base: -s * 0.45, amp: s * 0.22, speed };
    g.add(hinge);
  }
  return g;
}

export const OUTFITS = {
  none: { name: 'None', icon: '🚫' },
  bowtie: {
    name: 'Bow tie',
    icon: '🎀',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const red = M(0xd62839, { roughness: 0.5 });
      for (const s of [-1, 1]) g.add(at(mesh(new THREE.ConeGeometry(0.03, 0.06, 4), red), s * 0.035, 0.18, 0.105, 0, 0, s * Math.PI / 2));
      g.add(at(mesh(sph(0.016), red), 0, 0.18, 0.11));
      return g;
    },
  },
  necktie: {
    name: 'Necktie',
    icon: '👔',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const blue = M(0x2a4fa8, { roughness: 0.6 });
      g.add(at(mesh(box(0.04, 0.035, 0.02), blue), 0, 0.185, 0.105));
      const tie = mesh(new THREE.CylinderGeometry(0.028, 0.045, 0.26, 4), blue);
      tie.scale.z = 0.25;
      g.add(at(tie, 0, 0.04, 0.108, 0, Math.PI / 4));
      g.add(at(mesh(box(0.05, 0.012, 0.012), M(0xffd23f)), 0, 0.09, 0.115, 0, 0, 0.5));
      return g;
    },
  },
  cape: {
    name: 'Cape',
    icon: '🦸',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const red = M(0xc0283a, { roughness: 0.7, side: THREE.DoubleSide });
      const cape = mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 8, 1, true, Math.PI * 0.6, Math.PI * 0.8), red);
      g.add(at(cape, 0, -0.17, 0.02));
      g.add(at(mesh(sph(0.025), M(0xffd23f, { metalness: 0.5, roughness: 0.3 })), 0, 0.19, 0.1));
      return g;
    },
  },
  scarf: {
    name: 'Scarf',
    icon: '🧣',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const red = M(0xe0452b, { roughness: 1 });
      const ring = mesh(new THREE.TorusGeometry(0.075, 0.032, 6, 12), red);
      g.add(at(ring, 0, 0.22, 0, Math.PI / 2));
      g.add(at(mesh(box(0.06, 0.2, 0.025), red), 0.05, 0.11, 0.1, 0, 0, 0.15));
      for (let i = 0; i < 3; i++) g.add(at(mesh(box(0.062, 0.015, 0.027), M(0xf8f6f2)), 0.05 + 0.006 * i, 0.16 - i * 0.05, 0.1, 0, 0, 0.15));
      return g;
    },
  },
  tutu: {
    name: 'Tutu',
    icon: '🩰',
    part: 'pelvis',
    build() {
      const g = new THREE.Group();
      const pink = M(0xff9ccd, { roughness: 0.8, side: THREE.DoubleSide });
      g.add(at(mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.09, 14, 1, true), pink), 0, -0.04, 0));
      g.add(at(mesh(new THREE.TorusGeometry(0.29, 0.02, 4, 18), M(0xffbfe0)), 0, -0.085, 0, Math.PI / 2));
      return g;
    },
  },
  backpack: {
    name: 'Backpack',
    icon: '🎒',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const green = M(0x3f8a4a, { roughness: 0.8 });
      g.add(at(mesh(box(0.26, 0.3, 0.12), green), 0, -0.01, -0.17));
      g.add(at(mesh(box(0.26, 0.08, 0.13), M(0x2f6a38)), 0, 0.11, -0.17));
      g.add(at(mesh(box(0.14, 0.1, 0.03), M(0x2f6a38)), 0, -0.07, -0.245));
      for (const s of [-1, 1]) g.add(at(mesh(box(0.035, 0.36, 0.02), M(0x222222)), s * 0.11, 0, 0.1));
      return g;
    },
  },
  tuxedo: {
    name: 'Tuxedo',
    icon: '🤵',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const black = M(0x17161c, { roughness: 0.5 });
      const shell = mesh(new THREE.CylinderGeometry(0.215, 0.175, 0.43, 8, 1, true), M(0x17161c, { roughness: 0.5, side: THREE.DoubleSide }));
      shell.scale.z = 0.62;
      g.add(at(shell, 0, 0, 0));
      g.add(at(mesh(box(0.1, 0.4, 0.012), M(0xf8f6f2, { roughness: 0.6 })), 0, -0.01, 0.112));
      for (const s of [-1, 1]) g.add(at(mesh(box(0.05, 0.22, 0.012), black), s * 0.055, 0.08, 0.118, 0, 0, s * 0.35));
      for (const s of [-1, 1]) g.add(at(mesh(new THREE.ConeGeometry(0.022, 0.045, 4), black), s * 0.026, 0.185, 0.12, 0, 0, s * Math.PI / 2));
      for (const y of [0.0, -0.07, -0.14]) g.add(at(mesh(sph(0.009, 6, 4), black), 0, y, 0.12));
      return g;
    },
  },
  lifevest: {
    name: 'Life vest',
    icon: '🦺',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const orange = M(0xff6a1a, { roughness: 0.7 });
      for (const s of [-1, 1]) {
        const panel = mesh(box(0.2, 0.38, 0.09), orange);
        g.add(at(panel, s * 0.11, -0.01, 0.06, 0, s * -0.12));
      }
      g.add(at(mesh(box(0.42, 0.38, 0.06), orange), 0, -0.01, -0.09));
      const strip = M(0xd8e0e6, { roughness: 0.3, metalness: 0.5, emissive: 0x606a70, emissiveIntensity: 0.4 });
      for (const y of [0.06, -0.1]) g.add(at(mesh(box(0.44, 0.03, 0.26), strip), 0, y, -0.015));
      g.add(at(mesh(box(0.03, 0.2, 0.012), M(0x222222)), 0, -0.05, 0.106));
      return g;
    },
  },
  sash: {
    name: 'Sash',
    icon: '🎗️',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const band = M(0xffc93c, { roughness: 0.5, side: THREE.DoubleSide });
      const front = mesh(box(0.07, 0.55, 0.012), band);
      g.add(at(front, 0, 0, 0.112, 0, 0, 0.7));
      const back = mesh(box(0.07, 0.55, 0.012), band);
      g.add(at(back, 0, 0, -0.108, 0, 0, -0.7));
      g.add(at(mesh(new THREE.TorusGeometry(0.03, 0.01, 5, 10), M(0xd62839)), 0.1, -0.13, 0.12));
      return g;
    },
  },
  angelwings: {
    name: 'Angel wings',
    icon: '🪽',
    part: 'chest',
    build() {
      return wings(0xf8f6f2, 'feather', 1.4);
    },
  },
  devilwings: {
    name: 'Devil wings',
    icon: '😈',
    part: 'chest',
    build() {
      return wings(0x7a1420, 'bat', 3);
    },
  },
  jetpack: {
    name: 'Jetpack',
    icon: '🚀',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const metal = M(0xb8c0c8, { metalness: 0.8, roughness: 0.3 });
      for (const s of [-1, 1]) {
        g.add(at(mesh(new THREE.CapsuleGeometry(0.055, 0.2, 3, 10), metal), s * 0.07, 0.0, -0.18));
        g.add(at(mesh(new THREE.ConeGeometry(0.045, 0.06, 10), M(0x444a52, { metalness: 0.7 })), s * 0.07, -0.17, -0.18, Math.PI));
        const flame = mesh(new THREE.ConeGeometry(0.035, 0.14, 8), M(0xffa13a, { emissive: 0xff6a00, emissiveIntensity: 1.6 }));
        flame.castShadow = false;
        const holder = new THREE.Group();
        holder.position.set(s * 0.07, -0.21, -0.18);
        holder.add(at(flame, 0, -0.06, 0, Math.PI));
        holder.userData.flicker = true;
        g.add(holder);
      }
      g.add(at(mesh(box(0.2, 0.12, 0.04), M(0xd62839)), 0, 0.02, -0.125));
      for (const s of [-1, 1]) g.add(at(mesh(box(0.035, 0.36, 0.02), M(0x222222)), s * 0.11, 0, 0.1));
      return g;
    },
  },
  grassskirt: {
    name: 'Grass skirt',
    icon: '🌴',
    part: 'pelvis',
    build() {
      const g = new THREE.Group();
      const greens = [M(0x6aa84f, { roughness: 1 }), M(0x8bbf5a, { roughness: 1 }), M(0x4f8a3a, { roughness: 1 })];
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const blade = mesh(box(0.035, 0.26, 0.006), greens[i % 3]);
        const p = new THREE.Group();
        p.position.set(Math.sin(a) * 0.15, -0.02, Math.cos(a) * 0.11);
        p.rotation.y = a;
        p.add(at(blade, 0, -0.12, 0, 0.18));
        g.add(p);
      }
      g.add(at(mesh(new THREE.TorusGeometry(0.155, 0.015, 4, 20), M(0xe8c27a)), 0, -0.01, 0, Math.PI / 2));
      g.children[g.children.length - 1].scale.set(1, 0.72, 1);
      return g;
    },
  },
  armor: {
    name: 'Armor',
    icon: '🛡️',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      // Only half metallic: there's no environment to reflect, so full metal renders black.
      const steel = M(0xd5dbe2, { metalness: 0.4, roughness: 0.32, emissive: 0x30363c, emissiveIntensity: 0.4 });
      const plate = mesh(new THREE.CylinderGeometry(0.218, 0.178, 0.42, 8, 1, true), M(0xd5dbe2, { metalness: 0.4, roughness: 0.32, emissive: 0x30363c, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
      plate.scale.z = 0.66;
      g.add(at(plate, 0, 0, 0));
      for (const s of [-1, 1]) {
        const pad = mesh(dome(0.085), steel);
        g.add(at(pad, s * 0.23, 0.17, 0, 0, 0, -s * 0.5));
      }
      g.add(at(mesh(box(0.02, 0.36, 0.02), M(0xaab3bc, { metalness: 0.4, roughness: 0.3 })), 0, 0, 0.13));
      for (const [x, y] of [[0.12, 0.14], [-0.12, 0.14], [0.1, -0.15], [-0.1, -0.15]]) g.add(at(mesh(sph(0.012, 6, 4), M(0xffc93c, { metalness: 0.6 })), x, y, 0.125));
      return g;
    },
  },
  barrel: {
    name: 'Barrel',
    icon: '🛢️',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const wood = M(0x9a6a3a, { roughness: 0.9, side: THREE.DoubleSide });
      const b = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 14, 3, true), wood);
      // Bulge the middle like a real barrel.
      const pos = b.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const k = 1 + 0.12 * (1 - (y / 0.25) ** 2);
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
      b.geometry.computeVertexNormals();
      g.add(at(b, 0, -0.17, 0));
      for (const y of [0.03, -0.17, -0.37]) {
        const r = 0.25 * (1 + 0.12 * (1 - ((y + 0.17) / 0.25) ** 2));
        g.add(at(mesh(new THREE.TorusGeometry(r + 0.004, 0.012, 4, 20), M(0x55595f, { metalness: 0.6 })), 0, y, 0, Math.PI / 2));
      }
      return g;
    },
  },
  lei: {
    name: 'Flower lei',
    icon: '🌺',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      const colors = [0xff4d6d, 0xffd23f, 0xff8c42, 0xc77dff, 0xffffff];
      // A loop around the neck that drapes down over the chest at the front.
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const front = Math.max(0, Math.cos(a));
        const f = mesh(new THREE.IcosahedronGeometry(0.03, 0), M(colors[i % colors.length], { roughness: 0.7 }));
        f.position.set(Math.sin(a) * (0.17 - front * 0.06), 0.21 - front * front * 0.13, Math.cos(a) * 0.1 + front * 0.035);
        g.add(f);
      }
      return g;
    },
  },
  medal: {
    name: 'Medal',
    icon: '🥇',
    part: 'chest',
    build() {
      const g = new THREE.Group();
      for (const s of [-1, 1]) g.add(at(mesh(box(0.028, 0.14, 0.008), M(s > 0 ? 0xd62839 : 0x2a4fa8)), s * 0.022, 0.12, 0.112, 0, 0, s * 0.35));
      g.add(at(mesh(cyl(0.042, 0.042, 0.012, 16), M(0xffc93c, { metalness: 0.5, roughness: 0.3, emissive: 0x6a4300, emissiveIntensity: 0.3 })), 0, 0.03, 0.12, Math.PI / 2));
      g.add(at(mesh(new THREE.OctahedronGeometry(0.018, 0), M(0xffe9a0, { metalness: 0.4 })), 0, 0.03, 0.13));
      return g;
    },
  },
};

export const HEAD_SIZES = {
  small: { name: 'Small', icon: '🔹', scale: 0.8 },
  normal: { name: 'Normal', icon: '🙂', scale: 1 },
  big: { name: 'Big', icon: '🎈', scale: 1.35 },
  huge: { name: 'Huge', icon: '🎃', scale: 1.7 },
};

export const PAINT = [0xd9a066, 0xf2c12e, 0xe8213a, 0xff7a3d, 0xff9ccd, 0xc77dff, 0x2a8cff, 0x4dd6e0, 0x3fd06a, 0x86a86b, 0xf4efe8, 0x8d949c, 0x3a3a44, 0x6b4a2a, 0x1c1c22];
