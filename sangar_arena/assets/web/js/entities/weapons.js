import * as THREE from '../../vendor/three.module.js';

/**
 * Procedural weapon models.
 *
 * Each build function returns a group whose origin sits at the grip, +Z
 * pointing down the barrel, so the same model works as a first-person
 * viewmodel, in a soldier's hand, or slung across their back. A `muzzle`
 * child marks where flashes and tracers spawn.
 */

const MATS = {};
function mat(name, color, roughness, metalness) {
  if (!MATS[name]) {
    MATS[name] = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }
  return MATS[name];
}

const steel = () => mat('steel', 0x2b2e32, 0.42, 0.78);
const darkSteel = () => mat('darkSteel', 0x17191c, 0.36, 0.85);
const polymer = () => mat('polymer', 0x23262a, 0.82, 0.06);
const wood = () => mat('gunwood', 0x6b4326, 0.74, 0.03);
const glass = () => mat('scopeGlass', 0x1b2a33, 0.12, 0.92);

function part(material, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

function tube(material, r, len, x = 0, y = 0, z = 0, axis = 'z') {
  const g = new THREE.CylinderGeometry(r, r, len, 10);
  const m = new THREE.Mesh(g, material);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function common(group, { barrelLen, barrelR, hasStock = true, woodFurniture = false }) {
  const body = woodFurniture ? wood() : polymer();
  // receiver
  group.add(part(steel(), 0.075, 0.10, 0.34, 0, 0.035, 0.06));
  // grip
  group.add(part(body, 0.055, 0.15, 0.07, 0, -0.075, -0.04, 0.28));
  // trigger guard
  group.add(part(darkSteel(), 0.05, 0.012, 0.10, 0, -0.018, 0.01));
  // barrel
  group.add(tube(darkSteel(), barrelR, barrelLen, 0, 0.045, 0.24 + barrelLen / 2));
  // handguard
  group.add(part(body, 0.062, 0.062, barrelLen * 0.62,
    0, 0.038, 0.26 + barrelLen * 0.3));
  if (hasStock) {
    group.add(part(body, 0.055, 0.085, 0.20, 0, 0.028, -0.20));
    group.add(part(body, 0.05, 0.11, 0.055, 0, 0.010, -0.30));
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, 0.24 + barrelLen);
  muzzle.name = 'muzzle';
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  return group;
}

function ironSights(group, z = 0.30) {
  group.add(part(darkSteel(), 0.010, 0.040, 0.012, 0, 0.098, z + 0.22));
  group.add(part(darkSteel(), 0.036, 0.030, 0.012, 0, 0.094, z - 0.20));
}

function magazine(group, { curved = false, long = false, drum = false } = {}) {
  if (drum) {
    const g = new THREE.CylinderGeometry(0.085, 0.085, 0.055, 14);
    const m = new THREE.Mesh(g, polymer());
    m.rotation.z = Math.PI / 2;
    m.position.set(0, -0.085, 0.05);
    group.add(m);
    group.userData.mag = m;
    return;
  }
  const h = long ? 0.24 : 0.17;
  const m = part(polymer(), 0.05, h, 0.075, 0, -h / 2 - 0.02, 0.045,
    curved ? -0.22 : 0);
  group.add(m);
  group.userData.mag = m;
}

function scope(group, { power = 2 } = {}) {
  const len = power > 4 ? 0.30 : 0.22;
  const r = power > 4 ? 0.032 : 0.026;
  const s = tube(darkSteel(), r, len, 0, 0.125, 0.16);
  group.add(s);
  const lens = tube(glass(), r * 0.92, 0.012, 0, 0.125, 0.16 + len / 2);
  group.add(lens);
  const lens2 = tube(glass(), r * 0.92, 0.012, 0, 0.125, 0.16 - len / 2);
  group.add(lens2);
  group.add(part(darkSteel(), 0.02, 0.05, 0.02, 0, 0.098, 0.24));
  group.add(part(darkSteel(), 0.02, 0.05, 0.02, 0, 0.098, 0.08));
  group.userData.scope = s;
}

const BUILDERS = {
  rifle(def) {
    const g = new THREE.Group();
    const woodFurniture = def.id === 'ak_sangar';
    common(g, { barrelLen: 0.40, barrelR: 0.017, woodFurniture });
    magazine(g, { curved: true });
    if (def.scope) scope(g, { power: def.scopeZoom }); else ironSights(g);
    // muzzle brake
    g.add(tube(darkSteel(), 0.022, 0.055, 0, 0.045, 0.66));
    return g;
  },
  smg(def) {
    const g = new THREE.Group();
    common(g, { barrelLen: 0.22, barrelR: 0.015 });
    magazine(g, { long: true });
    if (def.scope) scope(g, { power: def.scopeZoom }); else ironSights(g, 0.18);
    // folding stock
    g.add(part(steel(), 0.012, 0.012, 0.18, 0.03, 0.06, -0.20));
    g.add(part(steel(), 0.012, 0.012, 0.18, -0.03, 0.06, -0.20));
    return g;
  },
  sniper(def) {
    const g = new THREE.Group();
    common(g, { barrelLen: 0.62, barrelR: 0.016, woodFurniture: true });
    magazine(g, {});
    scope(g, { power: def.scopeZoom ?? 6 });
    // bipod
    for (const s of [-1, 1]) {
      g.add(part(darkSteel(), 0.010, 0.16, 0.010, s * 0.035, -0.05, 0.52, 0.32, 0, s * 0.24));
    }
    g.add(part(darkSteel(), 0.03, 0.05, 0.09, 0, 0.03, -0.12));  // cheek rest
    return g;
  },
  marksman(def) {
    const g = new THREE.Group();
    common(g, { barrelLen: 0.50, barrelR: 0.016 });
    magazine(g, { curved: true, long: true });
    scope(g, { power: def.scopeZoom ?? 3.5 });
    return g;
  },
  shotgun() {
    const g = new THREE.Group();
    common(g, { barrelLen: 0.46, barrelR: 0.024, woodFurniture: true });
    // tube magazine under the barrel
    g.add(tube(darkSteel(), 0.019, 0.40, 0, 0.010, 0.42));
    // pump
    g.add(part(wood(), 0.062, 0.055, 0.13, 0, 0.012, 0.38));
    ironSights(g, 0.30);
    return g;
  },
  lmg() {
    const g = new THREE.Group();
    common(g, { barrelLen: 0.54, barrelR: 0.021 });
    magazine(g, { drum: true });
    ironSights(g, 0.34);
    // carry handle + bipod
    g.add(part(steel(), 0.03, 0.05, 0.14, 0, 0.11, 0.10));
    for (const s of [-1, 1]) {
      g.add(part(darkSteel(), 0.011, 0.19, 0.011, s * 0.04, -0.06, 0.56, 0.30, 0, s * 0.26));
    }
    // heat shield
    for (let i = 0; i < 5; i++) {
      g.add(part(darkSteel(), 0.052, 0.008, 0.02, 0, 0.072, 0.36 + i * 0.05));
    }
    return g;
  },
  pistol() {
    const g = new THREE.Group();
    g.add(part(steel(), 0.036, 0.075, 0.19, 0, 0.030, 0.045));
    g.add(part(polymer(), 0.036, 0.13, 0.05, 0, -0.055, -0.03, 0.26));
    g.add(tube(darkSteel(), 0.011, 0.10, 0, 0.030, 0.17));
    g.add(part(darkSteel(), 0.030, 0.010, 0.09, 0, -0.008, 0.06));
    const m = part(polymer(), 0.030, 0.10, 0.042, 0, -0.075, -0.028, 0.26);
    g.add(m);
    g.userData.mag = m;
    g.add(part(darkSteel(), 0.008, 0.014, 0.008, 0, 0.072, 0.13));
    g.add(part(darkSteel(), 0.024, 0.014, 0.008, 0, 0.072, -0.02));
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.030, 0.22);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    return g;
  },
};

/** Builds the 3D model for a weapon definition. */
export function buildWeapon(def) {
  const builder = BUILDERS[def.kind] || BUILDERS.rifle;
  const group = builder(def);
  group.name = `weapon:${def.id}`;
  group.userData.def = def;
  if (!group.userData.muzzle) {
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.045, 0.6);
    group.add(muzzle);
    group.userData.muzzle = muzzle;
  }
  return group;
}

/** A hand grenade — sphere body, spoon and pin. */
export function buildGrenade(kind = 'frag') {
  const g = new THREE.Group();
  const colours = { frag: 0x3d4a33, flash: 0x8a8d90, smoke: 0x4a5560 };
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 12, 10),
    new THREE.MeshStandardMaterial({
      color: colours[kind] ?? colours.frag, roughness: 0.7, metalness: 0.35,
    }));
  body.scale.set(1, 1.22, 1);
  body.castShadow = true;
  g.add(body);
  g.add(part(darkSteel(), 0.024, 0.030, 0.024, 0, 0.062, 0));
  g.add(part(steel(), 0.008, 0.070, 0.014, 0.025, 0.040, 0));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.016, 0.004, 6, 12), steel());
  ring.position.set(-0.026, 0.058, 0);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  return g;
}

/**
 * The player's own weapon, held in view.
 *
 * Sway, bob, recoil kick and the transition into and out of aimed-down-sights
 * all live here so the shooting feels connected to the movement state.
 */
export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.holder = new THREE.Group();
    this.holder.name = 'viewmodel';
    camera.add(this.holder);

    this.model = null;
    this.def = null;

    // The camera looks down its own -Z, so the weapon lives at negative z and
    // the model is spun 180 degrees to point its muzzle the same way. It is
    // pushed far enough forward that the stock never reaches the near plane —
    // otherwise the receiver fills half the screen.
    this.hipPos = new THREE.Vector3(0.155, -0.20, -0.56);
    this.adsPos = new THREE.Vector3(0.0, -0.115, -0.44);
    this.hipRot = new THREE.Euler(0.03, -0.10, 0.05);
    this.adsRot = new THREE.Euler(0, 0, 0);

    this.ads = 0;             // 0 hip .. 1 aimed
    this.recoil = 0;
    this.recoilRot = 0;
    this.bobPhase = 0;
    this.bob = new THREE.Vector3();
    this.sway = new THREE.Vector2();
    this.swayTarget = new THREE.Vector2();
    this.reloadTilt = 0;
    this.sprintTilt = 0;
  }

  setWeapon(def) {
    if (this.model) {
      this.holder.remove(this.model);
      this.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.def = def;
    this.model = buildWeapon(def);
    this.model.rotation.y = Math.PI;
    // Viewmodels are drawn slightly small so they do not eat the screen.
    this.model.scale.setScalar(0.80);
    // Drawn last and without depth conflicts, so the barrel never pokes
    // through a wall the player is standing against.
    this.model.traverse((o) => { if (o.isMesh) o.renderOrder = 5; });
    this.holder.add(this.model);
    return this.model;
  }

  get muzzleWorld() {
    const m = this.model?.userData?.muzzle;
    if (!m) return this.camera.getWorldPosition(new THREE.Vector3());
    return m.getWorldPosition(new THREE.Vector3());
  }

  kick(strength) {
    this.recoil = Math.min(1.4, this.recoil + strength * 0.35);
    this.recoilRot = Math.min(1.2, this.recoilRot + strength * 0.28);
  }

  /**
   * @param {number} dt
   * @param {object} ctx { speed, sprinting, ads, lookDelta, reloading, crouched }
   */
  update(dt, ctx) {
    const targetAds = ctx.ads ? 1 : 0;
    this.ads += (targetAds - this.ads) * Math.min(1, dt * 12);

    // Idle + movement bob
    this.bobPhase += dt * (2.2 + ctx.speed * 0.9);
    const bobAmount = (0.006 + ctx.speed * 0.0055) * (1 - this.ads * 0.75);
    this.bob.set(
      Math.sin(this.bobPhase) * bobAmount * 1.4,
      Math.abs(Math.cos(this.bobPhase)) * bobAmount - bobAmount * 0.4,
      0,
    );

    // Look sway lags the camera, so fast flicks whip the gun
    this.swayTarget.set(
      THREE.MathUtils.clamp(-(ctx.lookDelta?.x ?? 0) * 0.9, -0.09, 0.09),
      THREE.MathUtils.clamp(-(ctx.lookDelta?.y ?? 0) * 0.9, -0.09, 0.09),
    );
    this.sway.lerp(this.swayTarget, Math.min(1, dt * 9));

    // Sprint holds the weapon across the body, out of the sight line
    const targetSprint = ctx.sprinting && !ctx.ads ? 1 : 0;
    this.sprintTilt += (targetSprint - this.sprintTilt) * Math.min(1, dt * 8);

    const targetReload = ctx.reloading ? 1 : 0;
    this.reloadTilt += (targetReload - this.reloadTilt) * Math.min(1, dt * 9);

    // Recoil decay
    this.recoil *= Math.exp(-dt * 11);
    this.recoilRot *= Math.exp(-dt * 9);

    const pos = this.hipPos.clone().lerp(this.adsPos, this.ads);
    pos.add(this.bob);
    pos.x += this.sway.x * (1 - this.ads * 0.6);
    pos.y += this.sway.y * (1 - this.ads * 0.6);
    pos.z += this.recoil * 0.075;
    pos.x += this.sprintTilt * 0.09;
    pos.y -= this.sprintTilt * 0.05;
    pos.y -= this.reloadTilt * 0.11;
    pos.z -= this.reloadTilt * 0.03;
    this.holder.position.copy(pos);

    this.holder.rotation.x = THREE.MathUtils.lerp(this.hipRot.x, this.adsRot.x, this.ads)
      + this.recoilRot * 0.16 - this.sway.y * 0.5;
    this.holder.rotation.y = THREE.MathUtils.lerp(this.hipRot.y, this.adsRot.y, this.ads)
      + this.sway.x * 0.7 + this.sprintTilt * 0.5;
    this.holder.rotation.z = THREE.MathUtils.lerp(this.hipRot.z, this.adsRot.z, this.ads)
      + this.sprintTilt * 0.42 + this.reloadTilt * 0.30;
  }
}

/**
 * Attaches a weapon model to a soldier's right hand, and slings the other one
 * across their back — so the two-weapon loadout is visible on every player.
 */
export function equipOnSoldier(soldier, heldDef, slungDef) {
  if (soldier.heldModel) {
    soldier.weaponAnchor.remove(soldier.heldModel);
    soldier.heldModel.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    soldier.heldModel = null;
  }
  if (soldier.slungModel) {
    soldier.slingAnchor.remove(soldier.slungModel);
    soldier.slungModel.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    soldier.slungModel = null;
  }

  if (heldDef) {
    const model = buildWeapon(heldDef);
    // The hand inherits the carry pose's arm and forearm bend, which tips the
    // grip up and inward; this cancels it so the barrel sits level and points
    // where the soldier is facing.
    model.rotation.set(1.02, -0.30, -0.18);
    model.position.set(-0.02, -0.10, 0.05);
    model.scale.setScalar(0.98);
    soldier.weaponAnchor.add(model);
    soldier.heldModel = model;
  }
  if (slungDef) {
    const model = buildWeapon(slungDef);
    model.rotation.set(0.18, 0, -0.55);
    model.position.set(-0.04, 0.10, -0.19);
    model.scale.setScalar(0.92);
    soldier.slingAnchor.add(model);
    soldier.slungModel = model;
  }
  return soldier;
}
