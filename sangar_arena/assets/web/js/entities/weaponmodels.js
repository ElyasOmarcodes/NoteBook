import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

/**
 * Real weapon models.
 *
 * Every entry points at a downloaded, game-ready glTF firearm rather than
 * anything built out of primitives. The files are prepared offline so they all
 * share one convention: origin at the centre of the weapon, +Z down the barrel,
 * +Y up, scaled to the real length of the gun in metres.
 *
 * `grip` is the point in that model space the shooting hand closes around; the
 * loader shifts each model so the group origin lands there, which is the
 * convention the hand anchor, the sling anchor and the viewmodel all expect.
 *
 * Sources and licences are recorded in assets/web/models/weapons/CREDITS.md.
 */
export const WEAPON_MODELS = {
  ak_sangar:     { url: 'models/weapons/ak74.glb',   grip: [0, -0.055, -0.035] },
  m4_kandak:     { url: 'models/weapons/m16.glb',    grip: [0, -0.060, -0.055] },
  mp_toofan:     { url: 'models/weapons/p90.glb',    grip: [0, -0.045, -0.030] },
  svd_hindukush: { url: 'models/weapons/awp.glb',    grip: [0, -0.050, -0.115] },
  dmr_shamshad:  { url: 'models/weapons/scar.glb',   grip: [0, -0.060, -0.075] },
  sg_pekhawar:   { url: 'models/weapons/rem870.glb', grip: [0, -0.030, -0.160] },
  lmg_ghazi:     { url: 'models/weapons/m60.glb',    grip: [0, -0.060, -0.090] },
  pistol_teera:  { url: 'models/weapons/glock.glb',  grip: [0, -0.035, -0.035] },
};

export const GRENADE_MODEL = { url: 'models/weapons/frag.glb', grip: [0, 0, 0] };

const cache = new Map();     // url -> { scene, muzzle: THREE.Vector3 }
let loading = null;

/**
 * Finds the muzzle by taking the centroid of the vertices in the front slice
 * of the barrel, so a flash spawns at the real muzzle of each model rather
 * than at a hand-guessed offset.
 */
function findMuzzle(root) {
  const box = new THREE.Box3().setFromObject(root);
  const front = box.max.z;
  const depth = (box.max.z - box.min.z) * 0.025;
  const v = new THREE.Vector3();
  const sum = new THREE.Vector3();
  let n = 0;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry?.getAttribute('position');
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.z < front - depth) continue;
      sum.add(v); n++;
    }
  });
  return n ? sum.divideScalar(n) : new THREE.Vector3(0, 0, front);
}

/** Loads one weapon file and works out where its muzzle sits. */
async function loadOne(loader, entry) {
  if (cache.has(entry.url)) return cache.get(entry.url);
  const gltf = await loader.loadAsync(entry.url);
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    // The downloaded materials are authored for a lit scene; keep them, but
    // make sure nothing arrives double-sided and flickering.
    if (o.material) o.material.side = THREE.FrontSide;
  });
  const record = { scene, muzzle: findMuzzle(scene) };
  cache.set(entry.url, record);
  return record;
}

/**
 * Fetches every weapon file once, in parallel. Individual failures are
 * tolerated: that weapon simply falls back to the modelled geometry.
 */
export function preloadWeapons() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const entries = [...Object.values(WEAPON_MODELS), GRENADE_MODEL];
  loading = Promise.all(entries.map((e) => loadOne(loader, e).catch((err) => {
    console.warn('weapon model failed', e.url, err);
    return null;
  })));
  return loading;
}

/**
 * Returns a fresh instance of a loaded weapon, positioned so the group origin
 * sits at the grip, or null when the file is not available.
 *
 * @param {object} entry one of WEAPON_MODELS / GRENADE_MODEL
 */
export function instanceModel(entry) {
  const record = entry && cache.get(entry.url);
  if (!record) return null;

  const group = new THREE.Group();
  const model = record.scene.clone(true);
  // Cloning shares materials, which is what we want: one AK material for every
  // AK on the map. Geometry is shared by clone() too.
  model.position.set(-entry.grip[0], -entry.grip[1], -entry.grip[2]);
  group.add(model);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.copy(record.muzzle).sub(new THREE.Vector3(...entry.grip));
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  group.userData.real = true;
  return group;
}

/** True once the file for this weapon id is in memory. */
export function hasModel(id) {
  const entry = WEAPON_MODELS[id];
  return !!(entry && cache.has(entry.url));
}
