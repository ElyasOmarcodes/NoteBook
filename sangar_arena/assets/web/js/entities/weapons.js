import * as THREE from '../../vendor/three.module.js';

/**
 * Procedural weapon models.
 *
 * Each build function returns a group whose origin sits at the grip, +Z
 * pointing down the barrel, so the same model works as a first-person
 * viewmodel, in a soldier's hand, or slung across their back. A `muzzle`
 * child marks where flashes and tracers spawn.
 */

import { buildWeaponModel, GUN_MATS, turned, slab, rod, ring } from './gunsmith.js';

/**
 * Builds the 3D model for a weapon definition.
 *
 * The geometry itself lives in `gunsmith.js`, which turns barrels on a lathe
 * and extrudes bevelled outlines for receivers, magazines and stocks.
 */
export function buildWeapon(def) {
  return buildWeaponModel(def);
}

/** A hand grenade: turned body with a fuse assembly, spoon and pull ring. */
export function buildGrenade(kind = 'frag') {
  const g = new THREE.Group();
  const colours = { frag: 0x3d4a33, flash: 0x8a8d90, smoke: 0x455360 };
  const shell = new THREE.MeshStandardMaterial({
    color: colours[kind] ?? colours.frag, roughness: 0.68, metalness: 0.35,
  });

  // Turned ovoid body — the classic grenade profile, not a sphere.
  const body = turned([
    [0, -0.056], [0.026, -0.052], [0.044, -0.030], [0.050, 0],
    [0.044, 0.032], [0.030, 0.050], [0.016, 0.058], [0, 0.058],
  ], { segments: 14, material: shell });
  body.rotation.x = -Math.PI / 2;   // stand it upright
  g.add(body);

  // Fuse assembly.
  const fuse = turned([[0, 0.056], [0.016, 0.058], [0.016, 0.082], [0, 0.082]],
    { segments: 10, material: GUN_MATS.parkerised });
  fuse.rotation.x = -Math.PI / 2;
  g.add(fuse);

  // Spoon down one side.
  const spoon = slab([[0.052, 0.020], [0.062, 0.020], [0.062, -0.040], [0.052, -0.040]],
    { thickness: 0.014, bevel: 0.002, material: GUN_MATS.parkerised });
  spoon.rotation.x = -Math.PI / 2;
  g.add(spoon);

  // Pull ring.
  const pin = ring(0.014, 0.0032, { material: GUN_MATS.parkerised });
  pin.position.set(-0.024, 0.070, 0);
  g.add(pin);

  void rod;
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
    this.hipPos = new THREE.Vector3(0.150, -0.155, -0.50);
    this.adsPos = new THREE.Vector3(0.0, -0.095, -0.40);
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
    this.model.scale.setScalar(0.85);
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
 * The rigged character's bones are authored in centimetres, so anything
 * parented to a hand has to be scaled up to read at the right size in metres.
 */
const HAND_SCALE = 100;

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
    // The anchor is the rig's right hand bone, whose axes run along the palm.
    // These offsets seat the grip in the fist and swing the barrel forward,
    // and the whole thing is scaled to the model's hand rather than to metres.
    model.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    model.position.set(0, -0.06, 0.02);
    model.scale.setScalar(HAND_SCALE);
    soldier.weaponAnchor.add(model);
    soldier.heldModel = model;
  }
  if (slungDef) {
    const model = buildWeapon(slungDef);
    // Slung muzzle-down across the back, the way a spare weapon is carried.
    model.rotation.set(0.25, Math.PI, -0.55);
    model.position.set(-0.06, 0.02, -0.14);
    model.scale.setScalar(HAND_SCALE * 0.95);
    soldier.slingAnchor.add(model);
    soldier.slungModel = model;
  }
  return soldier;
}
