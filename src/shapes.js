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

/** A low-poly sphere bent by fn(x, y, z) -> [x, y, z]. */
function deform(fn, detail = 2) {
  const g = new THREE.IcosahedronGeometry(0.12, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Where a head's surface is: front (at eye height), top, and side, read off its geometry. */
function measure(g) {
  const p = g.attributes.position;
  let top = 0;
  let side = 0;
  let front = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    top = Math.max(top, y);
    if (Math.abs(y - 0.01) < 0.045) side = Math.max(side, Math.abs(x));
    if (Math.abs(x) < 0.05 && Math.abs(y - 0.024) < 0.05) front = Math.max(front, z);
  }
  return { top, side, front };
}

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
  pear: { name: 'Pear', icon: '🍐', auto: true, geo: () => geo('hs_pear', () => deform((x, y, z) => { const k = 1 + (-y / 0.13) * 0.28; return [x * 0.92 * k, y * 1.05, z * 0.95 * (1 + (-y / 0.13) * 0.12)]; })) },
  acorn: { name: 'Acorn', icon: '🌰', auto: true, geo: () => geo('hs_acorn', () => deform((x, y, z) => { const k = y > 0 ? 1 - (y / 0.12) * 0.55 : 1; return [x * 0.92 * k, y > 0 ? y * 1.35 : y * 1.02, z * 0.96 * k]; })) },
  long: { name: 'Long face', icon: '🐴', auto: true, geo: () => geo('hs_long', () => deform((x, y, z) => [x * 0.84, y < 0 ? y * 1.75 : y * 1.08, z * (y < 0 ? 0.92 : 0.95)])) },
  // A prism has no vertices mid-face to measure, so its surface is given directly.
  hex: { name: 'Hexagon', icon: '⬡', front: 0.097, top: 0.115, side: 0.104, geo: () => geo('hs_hex', () => new THREE.CylinderGeometry(0.112, 0.112, 0.23, 6).rotateY(Math.PI / 6)) },
  pumpkin: {
    name: 'Pumpkin',
    icon: '🎃',
    auto: true,
    geo: () =>
      geo('hs_pumpkin', () =>
        deform((x, y, z) => {
          const rib = 1 + 0.07 * Math.cos(8 * Math.atan2(x, z));
          return [x * 1.05 * rib, y * 0.88, z * 1.0 * rib];
        }, 3),
      ),
  },
  jaw: { name: 'Jawline', icon: '🗿', auto: true, geo: () => geo('hs_jaw', () => deform((x, y, z) => (y < -0.02 ? [x * 1.12, y * 1.15, z * (z > 0 ? 1.12 : 0.95)] : [x * 0.9, y * 1.08, z * 0.96]))) },
  alien: { name: 'Alien', icon: '👽', auto: true, geo: () => geo('hs_alien', () => deform((x, y, z) => (y > 0 ? [x * 1.18, y * 1.3, z * 1.12] : [x * 0.72 * (1 + y * 2), y * 1.1, z * 0.85]))) },
};

for (const hs of Object.values(HEAD_SHAPES)) {
  if (!hs.auto) continue;
  const m = measure(hs.geo());
  // A touch inside the outermost vertex, so features sit on the faces rather than the corners.
  hs.front = m.front * 0.97;
  hs.top = m.top;
  hs.side = m.side * 0.97;
}

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
  pompadour: {
    name: 'Pompadour',
    icon: '🕺',
    build: (m) => {
      const quiff = mesh(new THREE.IcosahedronGeometry(0.07, 1), m);
      quiff.scale.set(1.45, 0.85, 1.2);
      return [cap(m), at(quiff, 0, 0.128, 0.055, -0.3)];
    },
  },
  slick: {
    name: 'Slicked back',
    icon: '🕴️',
    build: (m) => {
      const d = mesh(dome(0.131), m);
      d.scale.set(1, 0.78, 1.12);
      d.position.set(0, 0.035, -0.012);
      return [d, at(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.04), m), 0, 0.02, -0.12, 0.3)];
    },
  },
  curly: {
    name: 'Curly',
    icon: '🌀',
    build: (m) => {
      const out = [];
      const g = new THREE.IcosahedronGeometry(0.036, 0);
      for (let i = 0; i < 34; i++) {
        const y = 1 - (i / 33) * 1.25;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * 2.4;
        const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        if (d.z > 0.4 && d.y < 0.5) continue;
        out.push(at(mesh(g, m), d.x * 0.125, d.y * 0.125 + 0.025, d.z * 0.125));
      }
      return out;
    },
  },
  dreads: {
    name: 'Dreadlocks',
    icon: '🦁',
    build: (m) => {
      const out = [cap(m)];
      const g = new THREE.CapsuleGeometry(0.016, 0.17, 2, 6);
      for (let i = 0; i < 13; i++) {
        const a = (0.3 + (i / 12) * 1.4) * Math.PI; // around the sides and back, not the face
        const x = Math.sin(a) * 0.12;
        const z = Math.cos(a) * 0.12;
        const lock = mesh(g, m);
        lock.position.set(x * 1.05, -0.06, z * 1.05);
        lock.rotation.set(-z * 1.2, 0, x * 1.2);
        out.push(lock);
      }
      return out;
    },
  },
  braids: {
    name: 'Braids',
    icon: '🪢',
    build: (m) => {
      const out = [cap(m)];
      const g = new THREE.IcosahedronGeometry(0.024, 0);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 7; i++) out.push(at(mesh(g, m), s * (0.105 + i * 0.004), -0.02 - i * 0.036, 0.02 + i * 0.006));
        out.push(at(mesh(new THREE.TorusGeometry(0.018, 0.007, 4, 8), mat(0xffd23f)), s * 0.13, -0.27, 0.06, Math.PI / 2));
      }
      return out;
    },
  },
  emo: {
    name: 'Emo fringe',
    icon: '🖤',
    // Swept across one eye, turned to follow the curve of the face.
    build: (m) => [cap(m), at(mesh(new THREE.BoxGeometry(0.075, 0.12, 0.02), m), -0.038, 0.04, 0.106, -0.15, -0.4, -0.5)],
  },
  topknot: {
    name: 'Top knot',
    icon: '🥷',
    build: (m) => {
      const c = cap(m);
      c.scale.y = 0.7;
      return [c, at(mesh(new THREE.IcosahedronGeometry(0.038, 1), m), 0, 0.142, -0.015), at(mesh(new THREE.TorusGeometry(0.026, 0.008, 4, 10), mat(0xd62839)), 0, 0.118, -0.012, Math.PI / 2)];
    },
  },
  mullet: {
    name: 'Mullet',
    icon: '🎸',
    build: (m) => {
      const out = [cap(m), at(mesh(new THREE.BoxGeometry(0.19, 0.17, 0.045), m), 0, -0.07, -0.1, 0.12)];
      for (const s of [-1, 0, 1]) out.push(at(mesh(new THREE.ConeGeometry(0.025, 0.07, 4), m), s * 0.06, -0.17, -0.09, Math.PI - 0.3));
      return out;
    },
  },
  anime: {
    name: 'Anime spikes',
    icon: '🌟',
    build: (m) => {
      const out = [cap(m)];
      const dirs = [[0, 1, 0.3], [0.6, 0.8, 0.1], [-0.6, 0.8, 0.1], [0.4, 0.6, -0.7], [-0.4, 0.6, -0.7], [0, 0.5, -1], [0.9, 0.3, -0.3], [-0.9, 0.3, -0.3], [0.2, 0.75, 0.6], [-0.25, 0.7, 0.6]];
      for (const v of dirs) {
        const d = new THREE.Vector3(...v).normalize();
        const c = mesh(new THREE.ConeGeometry(0.045, 0.17, 5), m);
        c.position.copy(d.clone().multiplyScalar(0.14));
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        out.push(c);
      }
      return out;
    },
  },
  bob: {
    name: 'Bob',
    icon: '💁',
    build: (m) => {
      const d = mesh(dome(0.135), m);
      d.position.y = 0.03;
      return [
        d,
        at(mesh(new THREE.BoxGeometry(0.035, 0.16, 0.17), m), 0.113, -0.025, -0.015),
        at(mesh(new THREE.BoxGeometry(0.035, 0.16, 0.17), m), -0.113, -0.025, -0.015),
        at(mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), m), 0, -0.025, -0.11),
        at(mesh(new THREE.BoxGeometry(0.19, 0.035, 0.03), m), 0, 0.065, 0.105),
      ];
    },
  },
  combover: {
    name: 'Comb-over',
    icon: '🧓',
    build: (m) => {
      const out = [];
      // Thin strands arched over the scalp, combed across from one side.
      for (let i = 0; i < 5; i++) {
        const z = -0.06 + i * 0.03;
        const r = Math.sqrt(Math.max(0.006, 0.131 * 0.131 - z * z));
        out.push(at(mesh(new THREE.TorusGeometry(r, 0.006, 4, 14, Math.PI * 0.8), m), 0, 0.005, z, 0, 0, Math.PI * 0.12));
      }
      for (const s of [-1, 1]) {
        const t = mesh(new THREE.IcosahedronGeometry(0.045, 1), m);
        t.scale.set(0.6, 1, 1);
        out.push(at(t, s * 0.1, 0.02, -0.03));
      }
      return out;
    },
  },
  flattop: {
    name: 'Flat top',
    icon: '🟫',
    build: (m) => [cap(m), at(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), m), 0, 0.15, -0.005)],
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

/* ------------------------------------------------------------------ */
/* Style: surface finish, patterns, joints, eye colour, face markings  */
/* ------------------------------------------------------------------ */

export const FINISHES = {
  matte: { name: 'Matte', icon: '🧱', roughness: 1, metalness: 0 },
  satin: { name: 'Satin', icon: '🪵' }, // the skin's own finish
  glossy: { name: 'Glossy', icon: '✨', roughness: 0.12, metalness: 0.05 },
  metallic: { name: 'Metallic', icon: '🔩', roughness: 0.3, metalness: 0.55, sheen: 0.22 },
  glow: { name: 'Glow', icon: '💡', glow: 0.55 },
};

export const PATTERNS = {
  none: { name: 'None', icon: '🚫' },
  stripes: { name: 'Stripes', icon: '🦓' },
  spots: { name: 'Spots', icon: '🐆' },
  camo: { name: 'Camo', icon: '🪖' },
  checker: { name: 'Checker', icon: '🏁' },
  zigzag: { name: 'Zigzag', icon: '⚡' },
  stars: { name: 'Stars', icon: '⭐' },
};

export const JOINT_STYLES = {
  balls: { name: 'Balls', icon: '⚪' },
  big: { name: 'Big balls', icon: '🔵', scale: 1.45 },
  cubes: { name: 'Cubes', icon: '🧊', geo: (r) => geo(`jc${r}`, () => new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6)) },
  gems: { name: 'Gems', icon: '💎', geo: (r) => geo(`jg${r}`, () => new THREE.OctahedronGeometry(r * 1.25, 0)) },
  glow: { name: 'Glowing', icon: '🔆' },
  hidden: { name: 'Hidden', icon: '🫥', hidden: true },
};

export const EYE_COLORS = [null, 0x111111, 0x2a8cff, 0x3fd06a, 0xe8213a, 0x8b5cf6, 0xffc93c, 0xff6fb5, 0x00e5ff];

export const MARKINGS = {
  none: { name: 'None', icon: '🚫' },
  freckles: { name: 'Freckles', icon: '🍪' },
  blush: { name: 'Blush', icon: '😊' },
  warpaint: { name: 'War paint', icon: '🪶' },
  scar: { name: 'Scar', icon: '⚔️' },
  stitches: { name: 'Stitches', icon: '🧵' },
  clown: { name: 'Clown paint', icon: '🎪' },
};

export const TEMPERAMENTS = {
  brave: { name: 'Brave', icon: '🦁' },
  normal: { name: 'Normal', icon: '🙂' },
  scaredy: { name: 'Scaredy-cat', icon: '🐱' },
};
export const ENERGIES = {
  lazy: { name: 'Lazy', icon: '🦥' },
  normal: { name: 'Normal', icon: '🚶' },
  hyper: { name: 'Hyper', icon: '⚡' },
};
export const WALKS = {
  normal: { name: 'Normal', icon: '🚶' },
  robot: { name: 'Robot', icon: '🤖' },
  sneaky: { name: 'Sneaky', icon: '🐾' },
  swagger: { name: 'Swagger', icon: '😎' },
  zombie: { name: 'Zombie', icon: '🧟' },
};

const css = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
const textures = new Map();

/** Two-colour pattern texture (cached). */
function patternTexture(kind, base, ink) {
  const key = `${kind}_${base}_${ink}`;
  let t = textures.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = css(base);
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = css(ink);
  x.strokeStyle = css(ink);
  // A fixed seed keeps the spots/camo identical between rebuilds.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === 'stripes') {
    for (let i = 0; i < 4; i++) x.fillRect(0, i * 32, 128, 13);
  } else if (kind === 'spots') {
    for (let i = 0; i < 14; i++) {
      x.beginPath();
      x.arc(rnd() * 128, rnd() * 128, 5 + rnd() * 8, 0, Math.PI * 2);
      x.fill();
    }
  } else if (kind === 'camo') {
    const tones = [ink, new THREE.Color(base).lerp(new THREE.Color(ink), 0.5).getHex(), new THREE.Color(base).multiplyScalar(0.6).getHex()];
    for (let i = 0; i < 22; i++) {
      x.fillStyle = css(tones[i % 3]);
      x.beginPath();
      const cx = rnd() * 128;
      const cy = rnd() * 128;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const r = 8 + rnd() * 14;
        k ? x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      x.fill();
    }
  } else if (kind === 'checker') {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) if ((i + k) % 2) x.fillRect(i * 32, k * 32, 32, 32);
  } else if (kind === 'zigzag') {
    x.lineWidth = 9;
    for (let row = 0; row < 4; row++) {
      x.beginPath();
      for (let i = 0; i <= 8; i++) x.lineTo(i * 16, row * 32 + 8 + (i % 2) * 14);
      x.stroke();
    }
  } else if (kind === 'stars') {
    for (let i = 0; i < 10; i++) {
      const cx = rnd() * 128;
      const cy = rnd() * 128;
      const r = 7 + rnd() * 5;
      x.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        k ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      x.fill();
    }
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  textures.set(key, t);
  return t;
}

const styled = new Map();

/**
 * The material a body/joint mesh should use for this style: skin colour with
 * the chosen finish, pattern and joint glow. Cached so meshes share it.
 */
export function styleMaterial(base, role, look) {
  const finish = FINISHES[look.finish] || FINISHES.satin;
  const pattern = role === 'body' ? look.pattern || 'none' : 'none';
  const glowJoint = role === 'joint' && look.jointStyle === 'glow';
  if (finish === FINISHES.satin && pattern === 'none' && !glowJoint) return base;
  const key = `${base.uuid}|${look.finish}|${pattern}|${look.patternColor}|${glowJoint}`;
  let m = styled.get(key);
  if (m) return m;
  const color = base.color.getHex();
  m = new THREE.MeshStandardMaterial({
    color: pattern !== 'none' ? 0xffffff : color,
    map: pattern !== 'none' ? patternTexture(pattern, color, look.patternColor ?? 0x1c1c22) : null,
    flatShading: true,
    roughness: finish.roughness ?? base.roughness,
    metalness: finish.metalness ?? base.metalness,
    emissive: base.emissive.clone(),
    emissiveIntensity: base.emissiveIntensity,
  });
  if (finish.sheen) {
    m.emissive.set(color).multiplyScalar(finish.sheen);
    m.emissiveIntensity = 1;
  }
  if (finish.glow) {
    m.emissive.set(color);
    m.emissiveIntensity = finish.glow;
    if (pattern !== 'none') m.emissiveMap = m.map;
  }
  if (glowJoint) {
    m.emissive.set(color);
    m.emissiveIntensity = 1.3;
  }
  styled.set(key, m);
  return m;
}

/** Depth of the head's front surface at (x, y), so markings sit on it rather than float. */
function surfaceZ(shapeId, hs, x, y) {
  if (shapeId === 'square') return hs.front;
  const fx = Math.min(0.98, Math.abs(x) / hs.side);
  if (shapeId === 'can' || shapeId === 'hex') return hs.front * Math.sqrt(1 - fx * fx);
  const fy = Math.min(0.98, Math.abs(y) / hs.top);
  return hs.front * Math.sqrt(Math.max(0.05, 1 - fx * fx - fy * fy));
}

/** Face markings, built in head space for a head of this shape. */
export function buildMarkings(kind, hs, shapeId = 'round') {
  const out = [];
  const sx = hs.side / 0.108;
  const put = (m, x, y, lift = 0.003, rz = 0) => {
    const px = x * sx;
    m.position.set(px, y, surfaceZ(shapeId, hs, px, y) + lift);
    // Turn to follow the curve a little.
    m.rotation.set(-y * 2.2, (px / hs.side) * 0.9, rz);
    m.castShadow = false;
    out.push(m);
    return m;
  };
  const flat = (w, h, color, opts) => mesh(new THREE.PlaneGeometry(w, h), mat(color, { roughness: 1, ...opts }), { cast: false });
  const dot = (r, color, opts) => mesh(new THREE.CircleGeometry(r, 8), mat(color, { roughness: 1, ...opts }), { cast: false });
  if (kind === 'freckles') {
    for (const [x, y] of [[0.033, -0.012], [0.047, -0.019], [0.058, -0.008], [0.04, -0.026], [-0.033, -0.012], [-0.047, -0.019], [-0.058, -0.008], [-0.04, -0.026]]) {
      put(dot(0.0045, 0x7a4a26), x, y);
    }
  } else if (kind === 'blush') {
    for (const s of [-1, 1]) put(dot(0.017, 0xff7fa0, { opacity: 0.8 }), s * 0.055, -0.022).scale.set(1.4, 0.8, 1);
  } else if (kind === 'warpaint') {
    for (const s of [-1, 1]) for (const y of [-0.016, -0.03]) put(flat(0.048, 0.007, 0x1a1a1a), s * 0.048, y, 0.003, s * 0.1);
    put(flat(0.012, 0.045, 0xd62839), 0, 0.075);
  } else if (kind === 'scar') {
    put(flat(0.011, 0.085, 0x8a3b2e), 0.046, 0.03, 0.004, -0.35);
    for (let i = 0; i < 4; i++) put(flat(0.022, 0.004, 0x5a2418), 0.033 + i * 0.009, 0.062 - i * 0.022, 0.005, -0.35);
  } else if (kind === 'stitches') {
    put(flat(0.2, 0.004, 0x222222), 0, 0.062);
    for (let i = 0; i < 9; i++) put(flat(0.004, 0.02, 0x222222), -0.08 + i * 0.02, 0.062, 0.004);
  } else if (kind === 'clown') {
    for (const s of [-1, 1]) {
      put(dot(0.034, 0xf8f6f2), s * 0.046, 0.024, 0.001);
      put(flat(0.01, 0.034, 0x2a4fa8), s * 0.046, 0.074);
    }
  }
  return out;
}
