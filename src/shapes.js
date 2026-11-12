import * as THREE from 'three';
import { mat, mesh, geo } from './materials.js';

/*
 * Body and face shaping for the wardrobe. These are visual: the physics body
 * (colliders, joints, balance) stays the same, so any combination walks and
 * breaks just as reliably.
 *
 * Head-local space: the face points to +z. Each head shape reports where its
 * surface is (front / top / side) so eyes, nose, ears, hair and hats can sit
 * on it.
 */

const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => {
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
};
const dome = (r) => new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);

export const HEAD_SHAPES = {
  round: {
    name: 'Round',
    icon: '⚪',
    front: 0.115,
    top: 0.13,
    side: 0.108,
    geo: () => geo('hs_round', () => new THREE.IcosahedronGeometry(0.12, 1).scale(0.9, 1.08, 0.96)),
  },
  square: {
    name: 'Square',
    icon: '🟫',
    front: 0.105,
    top: 0.12,
    side: 0.1,
    geo: () => geo('hs_square', () => new THREE.BoxGeometry(0.2, 0.24, 0.21)),
  },
  egg: {
    name: 'Egg',
    icon: '🥚',
    front: 0.108,
    top: 0.15,
    side: 0.097,
    geo: () => geo('hs_egg', () => new THREE.IcosahedronGeometry(0.12, 1).scale(0.81, 1.25, 0.92)),
  },
  wide: {
    name: 'Wide',
    icon: '🥔',
    front: 0.114,
    top: 0.11,
    side: 0.138,
    geo: () => geo('hs_wide', () => new THREE.IcosahedronGeometry(0.12, 1).scale(1.15, 0.92, 0.95)),
  },
  can: {
    name: 'Tin can',
    icon: '🥫',
    front: 0.098,
    top: 0.12,
    side: 0.098,
    geo: () => geo('hs_can', () => new THREE.CylinderGeometry(0.105, 0.105, 0.24, 8).rotateY(Math.PI / 8)),
  },
};

const disc = (key, r) => geo(key, () => new THREE.CylinderGeometry(r, r, 0.012, 14).rotateX(Math.PI / 2));

// sclera / pupil geometry per eye style; y offset; scale of spacing.
export const EYES = {
  classic: { name: 'Classic', icon: '👀', sclera: () => geo('sclera', () => new THREE.BoxGeometry(0.046, 0.056, 0.014)), pupil: () => geo('pupil', () => new THREE.BoxGeometry(0.022, 0.028, 0.01)) },
  round: { name: 'Round', icon: '⚫', sclera: () => disc('e_round', 0.027), pupil: () => disc('p_round', 0.012) },
  big: { name: 'Big', icon: '🥺', sclera: () => disc('e_big', 0.037), pupil: () => disc('p_big', 0.017), y: 0.008, spread: 1.12 },
  beady: { name: 'Beady', icon: '•', sclera: null, pupil: () => disc('p_beady', 0.01) },
  sleepy: { name: 'Sleepy', icon: '😪', sclera: () => disc('e_round', 0.027), pupil: () => disc('p_round', 0.012), lids: true },
  cyclops: { name: 'Cyclops', icon: '👁️', sclera: () => disc('e_cyc', 0.052), pupil: () => disc('p_cyc', 0.023), cyclops: true, y: 0.012 },
};

export const NOSES = {
  pointy: { name: 'Pointy', icon: '🔺', geo: () => geo('nose', () => new THREE.ConeGeometry(0.018, 0.05, 4).rotateX(Math.PI / 2)), z: 0.005 },
  round: { name: 'Round', icon: '🔴', geo: () => geo('n_round', () => new THREE.IcosahedronGeometry(0.026, 1)), z: 0 },
  button: { name: 'Button', icon: '🔘', geo: () => geo('n_button', () => new THREE.IcosahedronGeometry(0.014, 1)), z: -0.004 },
  long: { name: 'Long', icon: '🥕', geo: () => geo('n_long', () => new THREE.ConeGeometry(0.016, 0.16, 5).rotateX(Math.PI / 2)), z: 0.06 },
  none: { name: 'None', icon: '🚫', geo: null },
};

export const EARS = {
  none: { name: 'None', icon: '🚫' },
  round: { name: 'Round', icon: '👂', geo: () => geo('ear_round', () => new THREE.IcosahedronGeometry(0.038, 1)) },
  elf: { name: 'Elf', icon: '🧝', geo: () => geo('ear_elf', () => new THREE.ConeGeometry(0.026, 0.1, 5)), elf: true },
  big: { name: 'Big', icon: '🐵', geo: () => geo('ear_big', () => new THREE.IcosahedronGeometry(0.06, 1)), big: true },
};

export const HAIR_COLORS = [0x2b1d14, 0x5a3a22, 0xe8c27a, 0xc2552a, 0x9a9a9a, 0xf2f2f2, 0x2a8cff, 0xff6fb5, 0x3fd06a, 0x8b5cf6];

const cap = (m) => {
  const d = mesh(dome(0.128), m);
  d.scale.y = 0.85;
  d.position.y = 0.03;
  return d;
};

export const HAIR = {
  none: { name: 'Bald', icon: '🥚' },
  crew: { name: 'Crew cut', icon: '💈', build: (m) => [cap(m)] },
  mohawk: {
    name: 'Mohawk',
    icon: '🦔',
    build: (m) => {
      const out = [];
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.38;
        const h = 0.09 - Math.abs(a - 0.2) * 0.025;
        const b = mesh(new THREE.BoxGeometry(0.03, h, 0.045), m);
        b.position.set(0, Math.cos(a) * 0.12 + h / 2 * Math.cos(a), Math.sin(a) * 0.12 + (h / 2) * Math.sin(a));
        b.rotation.x = a;
        out.push(b);
      }
      return out;
    },
  },
  afro: {
    name: 'Afro',
    icon: '🌳',
    build: (m) => {
      const out = [];
      const g = new THREE.IcosahedronGeometry(0.075, 1);
      for (let i = 0; i < 26; i++) {
        const y = 1 - (i / 25) * 1.6;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * 2.4;
        const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        if (d.z > 0.45 && d.y < 0.55) continue; // leave the face clear
        const b = mesh(g, m);
        b.position.copy(d.multiplyScalar(0.13)).add(new THREE.Vector3(0, 0.04, -0.01));
        out.push(b);
      }
      return out;
    },
  },
  spiky: {
    name: 'Spiky',
    icon: '⚡',
    build: (m) => {
      const out = [cap(m)];
      const dirs = [[0, 1, 0], [0.5, 0.8, 0.2], [-0.5, 0.8, 0.2], [0.4, 0.75, -0.5], [-0.4, 0.75, -0.5], [0, 0.7, -0.7], [0, 0.85, 0.5], [0.7, 0.55, -0.2], [-0.7, 0.55, -0.2]];
      for (const v of dirs) {
        const d = new THREE.Vector3(...v).normalize();
        const c = mesh(new THREE.ConeGeometry(0.03, 0.1, 5), m);
        c.position.copy(d.clone().multiplyScalar(0.13));
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        out.push(c);
      }
      return out;
    },
  },
  ponytail: {
    name: 'Ponytail',
    icon: '🎀',
    build: (m) => [cap(m), at(mesh(new THREE.CapsuleGeometry(0.035, 0.17, 3, 8), m), 0, -0.04, -0.16, 0.45), at(mesh(new THREE.TorusGeometry(0.03, 0.01, 4, 10), mat(0xd62839)), 0, 0.05, -0.12, 1.2)],
  },
  bowl: {
    name: 'Bowl cut',
    icon: '🥣',
    build: (m) => {
      const d = mesh(dome(0.134), m);
      d.scale.y = 0.95;
      d.position.y = 0.035;
      return [d, at(mesh(new THREE.BoxGeometry(0.2, 0.035, 0.03), m), 0, 0.055, 0.105)];
    },
  },
  long: {
    name: 'Long',
    icon: '💇',
    build: (m) => [cap(m), at(mesh(new THREE.BoxGeometry(0.22, 0.28, 0.04), m), 0, -0.08, -0.1), at(mesh(new THREE.BoxGeometry(0.03, 0.2, 0.13), m), 0.112, -0.04, -0.03), at(mesh(new THREE.BoxGeometry(0.03, 0.2, 0.13), m), -0.112, -0.04, -0.03)],
  },
  pigtails: {
    name: 'Pigtails',
    icon: '👧',
    build: (m) => {
      const out = [cap(m)];
      for (const s of [-1, 1]) {
        out.push(at(mesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 8), m), s * 0.14, -0.04, -0.04, 0, 0, s * 0.35));
        out.push(at(mesh(new THREE.TorusGeometry(0.026, 0.009, 4, 10), mat(0xff6fb5)), s * 0.122, 0.035, -0.04, 0, 0, Math.PI / 2 + s * 0.35));
      }
      return out;
    },
  },
  bun: { name: 'Bun', icon: '🍙', build: (m) => [cap(m), at(mesh(new THREE.IcosahedronGeometry(0.055, 1), m), 0, 0.12, -0.08)] },
  professor: {
    name: 'Professor',
    icon: '🧑‍🏫',
    build: (m) => {
      const out = [];
      const g = new THREE.IcosahedronGeometry(0.05, 1);
      for (const [x, y, z] of [[0.1, 0.02, -0.02], [-0.1, 0.02, -0.02], [0.07, 0.02, -0.08], [-0.07, 0.02, -0.08], [0, 0.0, -0.11]]) {
        const b = mesh(g, m);
        b.position.set(x, y, z);
        b.scale.set(0.7, 1, 1);
        out.push(b);
      }
      return out;
    },
  },
};

export const BEARDS = {
  none: { name: 'None', icon: '🚫' },
  full: {
    name: 'Full beard',
    icon: '🧔',
    build: (m) => {
      const b = mesh(new THREE.IcosahedronGeometry(0.1, 1), m);
      b.scale.set(1.08, 0.78, 0.78);
      return [at(b, 0, -0.075, 0.035)];
    },
  },
  goatee: { name: 'Goatee', icon: '🐐', build: (m) => [at(mesh(new THREE.ConeGeometry(0.03, 0.07, 6), m), 0, -0.1, 0.095, Math.PI)] },
  chinstrap: { name: 'Chin strap', icon: '〰️', build: (m) => [at(mesh(new THREE.TorusGeometry(0.1, 0.014, 5, 16, Math.PI), m), 0, -0.06, 0, Math.PI / 2 - 0.25)] },
  sideburns: {
    name: 'Sideburns',
    icon: '🎸',
    build: (m) => [-1, 1].map((s) => at(mesh(new THREE.BoxGeometry(0.022, 0.08, 0.045), m), s * 0.1, -0.005, 0.03)),
  },
  wizard: {
    name: 'Wizard beard',
    icon: '🧙',
    build: (m) => [at(mesh(new THREE.ConeGeometry(0.075, 0.3, 8), m), 0, -0.2, 0.07, Math.PI - 0.15), at(mesh(new THREE.IcosahedronGeometry(0.075, 1), m), 0, -0.07, 0.05)],
  },
};

/* Body builds: per-part [x, y, z] scale of the visible body mesh. */
const L = (k) => [k, 1, k];
export const BUILDS = {
  slim: { name: 'Slim', icon: '🦒', chest: [0.72, 1, 0.72], pelvis: [0.78, 1, 0.8], upperArm: L(0.68), forearm: L(0.68), thigh: L(0.72), shin: L(0.72), hand: [0.85, 1, 0.85] },
  normal: { name: 'Normal', icon: '🧍' },
  chunky: { name: 'Chunky', icon: '🐻', chest: [1.42, 1, 1.5], pelvis: [1.42, 1.08, 1.42], upperArm: L(1.45), forearm: L(1.4), thigh: L(1.32), shin: L(1.28), hand: [1.2, 1, 1.2] },
  buff: { name: 'Buff', icon: '💪', chest: [1.6, 1.08, 1.35], pelvis: [0.95, 1, 1], upperArm: L(1.8), forearm: L(1.6), thigh: L(1.3), shin: L(1.1), hand: [1.3, 1.1, 1.3] },
  round: { name: 'Round belly', icon: '🫃', chest: [1.35, 1, 1.95], pelvis: [1.45, 1.12, 1.8], upperArm: L(0.95), forearm: L(0.95) },
};

export const FEET = {
  tiny: { name: 'Tiny', icon: '🩴', scale: [0.7, 0.8, 0.65] },
  normal: { name: 'Normal', icon: '👞', scale: [1, 1, 1] },
  clown: { name: 'Clown shoes', icon: '🤡', scale: [1.55, 1.15, 1.9] },
};

/** Which build entry a part uses (upperArmL -> upperArm). */
export function buildScale(build, partName) {
  const b = BUILDS[build];
  if (!b) return null;
  const key = partName.replace(/[LR]$/, '');
  return b[key] || null;
}

export { at as place };
export { mesh };
