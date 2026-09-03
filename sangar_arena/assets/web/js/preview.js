import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { CHARACTERS, characterId } from './entities/soldier.js';
import { WEAPON_MODELS, preloadWeapons, instanceModel } from './entities/weaponmodels.js';

/**
 * The turntable behind the character and weapon pickers.
 *
 * It is the same file the match loads, spun on a plinth, so what the player
 * chooses in settings is literally what walks onto the map — no painted
 * silhouettes, no separate art to drift out of step.
 *
 * `preview.html?kind=character&id=marine`
 * `preview.html?kind=weapon&id=ak_sangar`
 */
const params = new URLSearchParams(location.search);
const kind = params.get('kind') === 'weapon' ? 'weapon' : 'character';
const id = params.get('id') ?? '';
const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, powerPreference: 'low-power',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.42;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 60);

// A three-point rig: warm key, cool fill, and a rim to lift the silhouette off
// the panel behind it.
scene.add(new THREE.HemisphereLight(0xcdd9ee, 0x3d3931, 1.9));
const key = new THREE.DirectionalLight(0xfff1dc, 3.1);
key.position.set(2.2, 3.0, 2.6);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9fbcff, 0.85);
fill.position.set(-2.6, 1.2, 1.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffd9a8, 1.4);
rim.position.set(-1.2, 2.0, -3.0);
scene.add(rim);

const turntable = new THREE.Group();
scene.add(turntable);

let mixer = null;
let spin = 0;
let dragging = false;
let lastX = 0;
let velocity = 0;

function frame(object, { tilt = 0.14 } = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // Sit the subject on the turntable's origin so it spins about its own axis
  // rather than swinging around the scene.
  object.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  // 1.15 keeps a little air around the silhouette without wasting the panel.
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360) * 1.15;
  camera.position.set(0, box.min.y + size.y * 0.55 + dist * tilt, dist);
  camera.lookAt(0, size.y * 0.52, 0);
}

async function loadCharacter() {
  const def = CHARACTERS[characterId(id)];
  const gltf = await new GLTFLoader().loadAsync(def.url);
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false; });

  // Stand it at a believable height whatever units it was exported in.
  const box = new THREE.Box3().setFromObject(model);
  const span = box.max.y - box.min.y;
  if (span > 0.01) model.scale.setScalar(1.8 / span);

  const clipName = def.clips?.idle;
  const clip = gltf.animations.find(
    (c) => c.name.toLowerCase() === String(clipName).toLowerCase())
    ?? gltf.animations[0];
  if (clip) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play();
    // Let the first pose settle before measuring, or an arms-out bind pose
    // frames the shot instead of the idle stance.
    mixer.update(0.4);
  }
  turntable.add(model);
  frame(model, { tilt: 0.10 });
}

async function loadWeapon() {
  await preloadWeapons();
  const model = instanceModel(WEAPON_MODELS[id]);
  if (!model) throw new Error(`no model for ${id}`);
  // Weapons are authored pointing down +Z; turn the muzzle across the frame.
  model.rotation.y = -Math.PI / 2;
  turntable.add(model);
  frame(model, { tilt: 0.30 });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

// A drag spins it by hand; let go and it drifts back to a slow turn.
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; velocity = 0;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  spin += dx * 0.012;
  velocity = dx * 0.012;
});
const release = () => { dragging = false; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (mixer) mixer.update(dt);
  if (!dragging) {
    velocity *= Math.exp(-dt * 3);
    spin += (0.35 + velocity * 60) * dt * 0.55;
  }
  turntable.rotation.y = spin;
  renderer.render(scene, camera);
}

window.addEventListener('resize', resize);
resize();

(kind === 'weapon' ? loadWeapon() : loadCharacter())
  .then(tick)
  .catch((e) => {
    console.error('preview failed', e);
    document.getElementById('err').style.display = 'grid';
  });
