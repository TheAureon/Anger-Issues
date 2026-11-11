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
};

export const HEAD_SIZES = {
  small: { name: 'Small', icon: '🔹', scale: 0.8 },
  normal: { name: 'Normal', icon: '🙂', scale: 1 },
  big: { name: 'Big', icon: '🎈', scale: 1.35 },
  huge: { name: 'Huge', icon: '🎃', scale: 1.7 },
};

export const PAINT = [0xd9a066, 0xf2c12e, 0xe8213a, 0xff7a3d, 0xff9ccd, 0xc77dff, 0x2a8cff, 0x4dd6e0, 0x3fd06a, 0x86a86b, 0xf4efe8, 0x8d949c, 0x3a3a44, 0x6b4a2a, 0x1c1c22];
