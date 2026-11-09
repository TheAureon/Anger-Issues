// The battlefield: a low-poly board on a plateau, with rocks, pines and a sky dome.
import * as THREE from 'three';
import { applySpec } from './skins.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function buildWorld(scene) {
  const rand = rng(1234);
  scene.background = new THREE.Color(0x9fc4d8);
  scene.fog = new THREE.Fog(0x9fc4d8, 18, 55);

  const hemi = new THREE.HemisphereLight(0xdcefff, 0x5a4a3a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Board tiles: top surface at y = 0.
  const tiles = [];
  const tileGeo = new THREE.BoxGeometry(0.98, 0.2, 0.98);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 1;
      const m = new THREE.Mesh(tileGeo, flat(light ? 0xd9c49b : 0x6f5034, { roughness: 0.7 }));
      m.position.set(f - 3.5, -0.1, 3.5 - r);
      m.receiveShadow = true;
      m.userData.baseColor = m.material.color.clone();
      m.userData.light = light;
      scene.add(m);
      tiles[r * 8 + f] = m;
    }
  }
  // Frame with file/rank labels.
  const frameMat = flat(0x3d2a1c);
  const frame = new THREE.Group();
  const bar = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), frameMat);
    m.position.set(x, -0.11, z);
    m.receiveShadow = true;
    m.castShadow = true;
    frame.add(m);
  };
  bar(9, 0.5, 0, 4.25);
  bar(9, 0.5, 0, -4.25);
  bar(0.5, 8, 4.25, 0);
  bar(0.5, 8, -4.25, 0);
  scene.add(frame);
  const label = (text, x, z, rot) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#e8d7b0';
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.025, z);
    scene.add(m);
  };
  for (let i = 0; i < 8; i++) {
    label('abcdefgh'[i], i - 3.5, 4.25, 0);
    label('abcdefgh'[i], i - 3.5, -4.25, Math.PI);
    label(String(i + 1), -4.25, 3.5 - i, 0);
    label(String(i + 1), 4.25, 3.5 - i, Math.PI);
  }

  // Plateau under the board.
  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 9, 1.2, 9), flat(0x7d8a5a));
  plateau.position.y = -0.85;
  plateau.receiveShadow = true;
  scene.add(plateau);

  // Rolling low-poly ground.
  const groundGeo = new THREE.PlaneGeometry(140, 140, 46, 46);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = Math.hypot(x, z);
    const hills = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 2.2 + Math.sin((x + z) * 0.05) * 3;
    const lift = Math.max(0, d - 14) * 0.12;
    pos.setY(i, -1.6 + (d > 10 ? (hills + lift) * Math.min(1, (d - 10) / 10) : 0) + (rand() - 0.5) * 0.4);
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, flat(0x6f8a4c));
  ground.receiveShadow = true;
  scene.add(ground);

  const groundY = (x, z) => {
    const d = Math.hypot(x, z);
    const hills = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 2.2 + Math.sin((x + z) * 0.05) * 3;
    const lift = Math.max(0, d - 14) * 0.12;
    return -1.6 + (d > 10 ? (hills + lift) * Math.min(1, (d - 10) / 10) : 0);
  };

  // Pines and rocks around the arena.
  const trunkMat = flat(0x5b3d26);
  const leafMats = [flat(0x2f5d3a), flat(0x3a6b40), flat(0x2a4f36)];
  const rockMat = flat(0x8a8780);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5);
  const coneGeo = new THREE.ConeGeometry(1, 1.6, 6);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const d = 11 + rand() * 30;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = groundY(x, z);
    const s = 0.8 + rand() * 1.2;
    if (rand() < 0.7) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.5;
      tree.add(trunk);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(coneGeo, leafMats[(i + k) % 3]);
        c.scale.setScalar(1 - k * 0.25);
        c.position.y = 1.4 + k * 0.8;
        c.castShadow = true;
        tree.add(c);
      }
      tree.position.set(x, y, z);
      tree.scale.setScalar(s);
      tree.rotation.y = rand() * 6;
      scene.add(tree);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 * s, 0), rockMat);
      rock.position.set(x, y + 0.2, z);
      rock.scale.y = 0.6 + rand() * 0.5;
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      rock.castShadow = true;
      scene.add(rock);
    }
  }
  // A few rocks on the plateau edge for cover-y atmosphere.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rand() * 0.3, 0), rockMat);
    rock.position.set(Math.cos(a) * 6.6, -0.2, Math.sin(a) * 6.6);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  // Clouds.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false });
  for (let i = 0; i < 12; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rand() * 1.2, 0), cloudMat);
      p.position.set(k * 1.4 - 2, rand() * 0.6, rand() - 0.5);
      cl.add(p);
    }
    const a = rand() * Math.PI * 2;
    cl.position.set(Math.cos(a) * (30 + rand() * 20), 14 + rand() * 8, Math.sin(a) * (30 + rand() * 20));
    cl.scale.set(1.6, 0.8, 1);
    scene.add(cl);
  }

  return { tiles, sun, frameMat };
}

// Restyle the board for a shop skin. Tiles keep their own materials; refresh() tints from baseColor.
export function applyBoardSkin(world, skin) {
  for (const t of world.tiles) {
    applySpec(t.material, t.userData.light ? skin.light : skin.dark);
    t.userData.baseColor.copy(t.material.color);
  }
  applySpec(world.frameMat, skin.frame);
}
