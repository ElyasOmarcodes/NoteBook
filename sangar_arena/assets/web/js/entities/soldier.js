import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';
import { ANIM, TEAM_COLORS } from '../config.js';

/**
 * A soldier: a real rigged human mesh, not a stack of boxes.
 *
 * The body comes from `assets/models/soldier.glb` — a skinned character with a
 * 49-bone Mixamo skeleton (fingers included) and baked Idle / Walk / Run clips.
 * Those clips drive locomotion through an AnimationMixer; everything the clips
 * do not cover — crouch, prone, aiming, reloading, recoil, melee, climbing — is
 * layered on top by rotating the same Mixamo bones after the mixer has run.
 * That gives real skinned deformation for the common motion and full control
 * for the rest.
 */

const DEG = Math.PI / 180;
const MODEL_URL = 'models/soldier.glb';

// ---- shared asset, loaded once and cloned per soldier ---------------------

let assetPromise = null;
let asset = null;

/** Kicks off the model load. Safe to call repeatedly. */
export function preloadSoldier(url = MODEL_URL) {
  if (assetPromise) return assetPromise;
  const loader = new GLTFLoader();
  assetPromise = loader.loadAsync(url).then((gltf) => {
    // The source model stands on the origin facing +Z at roughly 1.8 m; the
    // engine's world uses metres with feet at y = 0, so it drops straight in.
    const clips = {};
    for (const clip of gltf.animations) clips[clip.name.toLowerCase()] = clip;
    asset = { scene: gltf.scene, clips };
    return asset;
  });
  return assetPromise;
}

export function soldierAssetReady() { return asset !== null; }

/**
 * Mixamo bone names, keyed by the short names the rest of the engine uses.
 *
 * The glTF loader sanitises node names, so `mixamorig:Hips` in the file
 * arrives as `mixamorig_Hips` in the scene graph. Matching is done on a
 * normalised form — lower-cased with every separator stripped — so either
 * spelling resolves.
 */
const BONES = {
  hips: 'Hips',
  spine: 'Spine',
  spine1: 'Spine1',
  chest: 'Spine2',
  neck: 'Neck',
  head: 'Head',
  shoulderL: 'LeftShoulder',
  armL: 'LeftArm',
  forearmL: 'LeftForeArm',
  handL: 'LeftHand',
  shoulderR: 'RightShoulder',
  armR: 'RightArm',
  forearmR: 'RightForeArm',
  handR: 'RightHand',
  thighL: 'LeftUpLeg',
  shinL: 'LeftLeg',
  footL: 'LeftFoot',
  thighR: 'RightUpLeg',
  shinR: 'RightLeg',
  footR: 'RightFoot',
};

/** `mixamorig:LeftForeArm` and `mixamorig_LeftForeArm` both -> `leftforearm`. */
function normaliseBone(name) {
  return String(name)
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

const BONE_LOOKUP = new Map(
  Object.entries(BONES).map(([short, mixamo]) => [normaliseBone(mixamo), short]),
);

// =========================================================================
// Additive poses layered on top of the baked clips.
//
// Each entry is a per-bone Euler offset in radians, applied after the mixer
// writes the clip pose, so the clip's skinning still drives the mesh and these
// only bend it into the stance the clip does not have.
// =========================================================================

const POSE = {
  /** Rifle at the shoulder: both hands on the weapon, elbows tucked. */
  carry: {
    spine: [0.05, 0, 0],
    chest: [-0.06, -0.30, 0],
    shoulderL: [0, 0, -0.30],
    armL: [-0.55, 0.55, 0.35],
    forearmL: [-1.15, 0, -0.25],
    shoulderR: [0, 0, 0.18],
    armR: [-0.35, -0.25, -0.55],
    forearmR: [-1.35, 0, 0.30],
  },

  /** Aimed down sights: the weapon comes up to the eye line. */
  ads: {
    spine: [0.02, 0, 0],
    chest: [-0.10, -0.16, 0],
    neck: [0.06, 0.10, 0],
    armL: [-0.75, 0.40, 0.30],
    forearmL: [-1.30, 0, -0.20],
    armR: [-0.62, -0.16, -0.35],
    forearmR: [-1.42, 0, 0.20],
  },

  crouch: {
    hips: [0.28, 0, 0],
    spine: [-0.10, 0, 0],
    chest: [-0.08, 0, 0],
    thighL: [-1.15, 0, 0.14],
    shinL: [1.55, 0, 0],
    footL: [-0.42, 0, 0],
    thighR: [-1.15, 0, -0.14],
    shinR: [1.55, 0, 0],
    footR: [-0.42, 0, 0],
  },

  prone: {
    hips: [0.10, 0, 0],
    spine: [-0.22, 0, 0],
    chest: [-0.18, 0, 0],
    neck: [-0.40, 0, 0],
    head: [-0.30, 0, 0],
    armL: [-0.85, 0.55, 0.55],
    forearmL: [-1.25, 0, 0],
    armR: [-0.85, -0.30, -0.55],
    forearmR: [-1.30, 0, 0],
    thighL: [0.10, 0, 0.28],
    shinL: [-0.35, 0, 0],
    thighR: [0.10, 0, -0.28],
    shinR: [-0.35, 0, 0],
  },

  climb: {
    spine: [-0.12, 0, 0],
    chest: [-0.08, 0, 0],
    neck: [0.22, 0, 0],
    shoulderL: [0, 0, -0.35],
    shoulderR: [0, 0, 0.35],
    armL: [-2.10, 0.30, 0.45],
    armR: [-2.10, -0.30, -0.45],
    forearmL: [-0.55, 0, 0],
    forearmR: [-0.55, 0, 0],
    thighL: [-0.60, 0, 0.20],
    thighR: [-0.60, 0, -0.20],
    shinL: [0.95, 0, 0],
    shinR: [0.95, 0, 0],
  },

  dead: {
    hips: [0, 0, 0],
    spine: [-0.20, 0.25, 0.30],
    chest: [-0.15, 0.15, 0.20],
    neck: [0.35, 0.25, 0],
    head: [0.20, 0.15, 0],
    armL: [-0.40, 0.70, 0.90],
    forearmL: [-0.35, 0, 0],
    armR: [-1.10, -0.35, -0.60],
    forearmR: [-0.80, 0, 0],
    thighL: [0.25, 0, 0.40],
    shinL: [-0.70, 0, 0],
    thighR: [-0.10, 0, -0.20],
    shinR: [-0.25, 0, 0],
  },
};

/** One-shot upper-body actions, as a function of normalised phase. */
const ACTIONS = {
  [ANIM.FIRE](p) {
    const k = p < 0.16 ? p / 0.16 : Math.max(0, 1 - (p - 0.16) / 0.84);
    return {
      chest: [-0.10 * k, 0, 0],
      armR: [-0.20 * k, 0, 0],
      armL: [-0.13 * k, 0, 0],
      forearmR: [0.16 * k, 0, 0],
      neck: [-0.06 * k, 0, 0],
    };
  },

  [ANIM.RELOAD](p) {
    // mag out -> fetch -> seat -> charge
    if (p < 0.28) {
      const k = p / 0.28;
      return {
        armL: [-0.55 - k * 0.80, 0.35 + k * 0.30, 0.30],
        forearmL: [-1.10 - k * 0.45, 0, 0],
        chest: [-0.06 - k * 0.10, -0.30 + k * 0.22, 0],
      };
    }
    if (p < 0.62) {
      const k = (p - 0.28) / 0.34;
      return {
        armL: [-1.35 + k * 0.45, 0.65 - k * 0.75, 0.30],
        forearmL: [-1.55 + k * 0.30, 0, 0],
        chest: [-0.16 + k * 0.06, -0.08 - k * 0.16, 0],
      };
    }
    if (p < 0.84) {
      const k = (p - 0.62) / 0.22;
      return {
        armL: [-0.90 - k * 0.20, -0.10 + k * 0.42, 0.30],
        forearmL: [-1.25 - k * 0.18, 0, 0],
        chest: [-0.10 - k * 0.04, -0.24 - k * 0.06, 0],
      };
    }
    const pull = Math.sin(((p - 0.84) / 0.16) * Math.PI);
    return {
      armL: [-1.10 + pull * 0.40, 0.32 + pull * 0.25, 0.30],
      forearmL: [-1.43 + pull * 0.45, 0, 0],
      chest: [-0.14 - pull * 0.06, -0.30 + pull * 0.10, 0],
    };
  },

  [ANIM.MELEE](p) {
    const wind = Math.min(1, p / 0.30);
    const swing = p > 0.30 ? Math.min(1, (p - 0.30) / 0.28) : 0;
    const back = 1 - Math.max(0, (p - 0.58) / 0.42);
    const k = (wind - swing) * back;
    return {
      chest: [0, (-0.45 * wind + 0.55 * swing) * back, 0],
      spine: [0, (-0.20 * wind + 0.25 * swing) * back, 0],
      armR: [(-0.55 * wind + 0.95 * swing) * back, 0, -0.35 * k],
      armL: [(-0.75 * wind + 0.55 * swing) * back, 0, 0.35 * k],
      forearmR: [(-0.90 * wind + 0.35 * swing) * back, 0, 0],
      forearmL: [(-0.85 * wind + 0.25 * swing) * back, 0, 0],
    };
  },

  [ANIM.RESUPPLY](p) {
    const k = Math.sin(Math.min(1, p) * Math.PI);
    return {
      hips: [0.45 * k, 0, 0],
      spine: [0.30 * k, 0.15 * k, 0],
      chest: [0.16 * k, 0.10 * k, 0],
      neck: [0.18 * k, 0, 0],
      armL: [-1.05 * k, 0.35 * k, 0.25 * k],
      forearmL: [-0.60 * k, 0, 0],
      armR: [-0.70 * k, -0.20 * k, -0.20 * k],
      forearmR: [-0.70 * k, 0, 0],
      thighL: [-0.85 * k, 0, 0.12],
      shinL: [1.15 * k, 0, 0],
      thighR: [-0.85 * k, 0, -0.12],
      shinR: [1.15 * k, 0, 0],
    };
  },
};

/** Stances whose additive pose replaces the legs entirely. */
const STANCE_FOR_STATE = {
  [ANIM.CROUCH_IDLE]: 'crouch',
  [ANIM.CROUCH_WALK]: 'crouch',
  [ANIM.PRONE_IDLE]: 'prone',
  [ANIM.PRONE_CRAWL]: 'prone',
  [ANIM.CLIMB]: 'climb',
  [ANIM.DEAD]: 'dead',
};

/** Which baked clip underlies each state, and how fast to play it. */
const CLIP_FOR_STATE = {
  [ANIM.IDLE]: ['idle', 1],
  [ANIM.WALK]: ['walk', 1],
  [ANIM.RUN]: ['run', 1],
  [ANIM.SNEAK]: ['walk', 0.55],
  [ANIM.CROUCH_IDLE]: ['idle', 1],
  [ANIM.CROUCH_WALK]: ['walk', 0.8],
  [ANIM.PRONE_IDLE]: ['idle', 0.6],
  [ANIM.PRONE_CRAWL]: ['walk', 0.5],
  [ANIM.JUMP]: ['idle', 1],
  [ANIM.FALL]: ['idle', 1],
  [ANIM.LAND]: ['idle', 1],
  [ANIM.STEP_UP]: ['walk', 1],
  [ANIM.CLIMB]: ['idle', 1],
  [ANIM.DEAD]: ['idle', 1],
};

export class Soldier {
  /**
   * @param {object} agent agent definition from the Dart catalogue
   * @param {number} team 0 or 1
   */
  constructor(agent, team = 0) {
    this.agent = agent;
    this.team = team;

    this.root = new THREE.Group();
    this.root.name = `soldier:${agent.id}`;

    /** Yaw node — the model is turned by rotating this, not the root. */
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.bones = {};
    this.restQuat = {};
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this.state = ANIM.IDLE;
    this.phase = 0;
    this.overlay = null;
    this.overlayPhase = 0;
    this.overlayDuration = 0;
    this.aimPitch = 0;
    this.ads = 0;
    this.footstepFired = false;
    this.landPhase = 1;
    this.stepPhase = 1;
    this._lastFootBeat = 0;
    this._stanceBlend = {};
    this.ready = false;

    if (asset) this._build();
  }

  /** Builds the visual once the shared asset has loaded. */
  _build() {
    if (this.ready || !asset) return;

    const model = cloneSkinned(asset.scene);
    model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      // Clone the material so per-agent tinting does not leak between players.
      const src = o.material;
      const mat = Array.isArray(src) ? src.map((m) => m.clone()) : src.clone();
      o.material = mat;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        this._tint(m);
      }
    });
    this.body.add(model);
    this.model = model;

    // Cache the bones we drive, and their rest orientation, so the additive
    // layer is always applied relative to the clip pose rather than compounding.
    model.traverse((o) => {
      if (!o.isBone) return;
      const short = BONE_LOOKUP.get(normaliseBone(o.name));
      if (!short || this.bones[short]) return;
      this.bones[short] = o;
      this.restQuat[short] = o.quaternion.clone();
    });

    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of Object.entries(asset.clips)) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      this.actions[name] = action;
    }
    this._setClip('idle', 1);

    // Anchors for the held and slung weapons.
    this.weaponAnchor = this.bones.handR ?? this.body;
    this.slingAnchor = this.bones.chest ?? this.body;

    this.ready = true;
  }

  /**
   * Per-agent look. The source model is a single soldier, so each agent is
   * given its own fatigue colour, skin tone and kit accent, plus a team stripe,
   * to read as a distinct character at a distance.
   */
  _tint(material) {
    const a = this.agent;
    // The model's own texture already carries the fabric, webbing and boots.
    // `color` multiplies it, so a saturated tint would drown that detail and
    // turn the soldier into a flat silhouette: start from white and pull only
    // a little way toward the agent's colour.
    const tint = new THREE.Color(0xffffff)
      .lerp(new THREE.Color(a.outfit ?? 0x3a3f35), 0.34);
    material.color = tint;
    material.roughness = 0.88;
    material.metalness = 0.06;
    // Just enough team glow to tell friend from foe across the yard, without
    // making the character look lit from inside.
    material.emissive = new THREE.Color(TEAM_COLORS[this.team] ?? TEAM_COLORS[0]);
    material.emissiveIntensity = 0.035;
    material.needsUpdate = true;
  }

  // =======================================================================
  // animation
  // =======================================================================

  _setClip(name, timeScale = 1) {
    const next = this.actions[name];
    if (!next) return;
    if (this.currentAction === next) {
      next.timeScale = timeScale;
      return;
    }
    for (const [key, action] of Object.entries(this.actions)) {
      const target = key === name ? 1 : 0;
      action.setEffectiveWeight(
        THREE.MathUtils.lerp(action.getEffectiveWeight(), target, 1));
      if (key === name) action.timeScale = timeScale;
    }
    // Cross-fade rather than snap.
    if (this.currentAction) {
      this.currentAction.crossFadeTo(next, 0.18, false);
    }
    next.reset().setEffectiveWeight(1).play();
    next.timeScale = timeScale;
    this.currentAction = next;
  }

  setState(state) {
    if (this.state === state) return;
    if (state === ANIM.LAND) this.landPhase = 0;
    if (state === ANIM.STEP_UP) this.stepPhase = 0;
    this.state = state;
  }

  playOverlay(name, duration) {
    this.overlay = name;
    this.overlayPhase = 0;
    this.overlayDuration = duration;
  }

  clearOverlay() { this.overlay = null; }

  get overlayBusy() {
    return this.overlay !== null && this.overlayPhase < 1;
  }

  /**
   * @param {number} dt seconds
   * @param {object} ctx { speed, aimPitch, ads }
   */
  update(dt, ctx = {}) {
    if (!this.ready) {
      this._build();
      if (!this.ready) return;
    }

    const speed = ctx.speed ?? 0;
    this.aimPitch = ctx.aimPitch ?? this.aimPitch;
    const targetAds = ctx.ads ? 1 : 0;
    this.ads += (targetAds - this.ads) * Math.min(1, dt * 10);

    // ---- pick and time the baked clip ----
    const [clipName, baseScale] = CLIP_FOR_STATE[this.state] ?? CLIP_FOR_STATE[ANIM.IDLE];
    // The baked walk/run cycles are authored for roughly these speeds, so
    // scaling by the real ground speed keeps the feet from skating.
    let timeScale = baseScale;
    if (clipName === 'walk') timeScale = baseScale * THREE.MathUtils.clamp(speed / 1.6, 0.35, 2.2);
    else if (clipName === 'run') timeScale = baseScale * THREE.MathUtils.clamp(speed / 5.2, 0.5, 1.9);
    this._setClip(clipName, timeScale);

    if (this.mixer) this.mixer.update(dt);

    // ---- footstep beat, taken from the clip's own cycle ----
    if ((clipName === 'walk' || clipName === 'run') && this.currentAction) {
      const clipTime = this.currentAction.time;
      const beat = Math.floor(clipTime * 2 / Math.max(0.1, this.currentAction.getClip().duration) * 2);
      if (beat !== this._lastFootBeat) {
        this._lastFootBeat = beat;
        this.footstepFired = true;
      }
    }

    // ---- transient states ----
    if (this.state === ANIM.LAND) {
      this.landPhase = Math.min(1, this.landPhase + dt / 0.34);
      if (this.landPhase >= 1) this.state = ANIM.IDLE;
    }
    if (this.state === ANIM.STEP_UP) {
      this.stepPhase = Math.min(1, this.stepPhase + dt / 0.24);
      if (this.stepPhase >= 1) this.state = ANIM.WALK;
    }
    if (this.overlay) {
      this.overlayPhase += dt / Math.max(0.05, this.overlayDuration);
      if (this.overlayPhase >= 1) {
        this.overlayPhase = 1;
        this.overlay = null;
      }
    }

    this._applyAdditive(dt);

    // The weapon's grip pose is measured from the posed rig rather than
    // guessed, so it has to wait for the first frame the additive carry pose
    // has actually been written to the bones.
    if (this.alignGrip) { this.alignGrip(); this.alignGrip = null; }
  }

  /**
   * Rotates the Mixamo bones on top of whatever the mixer just wrote.
   *
   * Offsets are accumulated per bone and then applied as a single quaternion
   * multiply, so stance, aim and a one-shot action compose without fighting.
   */
  _applyAdditive(dt) {
    const acc = {};
    const add = (pose, weight) => {
      if (!pose || weight <= 0.001) return;
      for (const [bone, rot] of Object.entries(pose)) {
        const cur = acc[bone] ?? (acc[bone] = [0, 0, 0]);
        cur[0] += rot[0] * weight;
        cur[1] += rot[1] * weight;
        cur[2] += rot[2] * weight;
      }
    };

    const stanceName = STANCE_FOR_STATE[this.state];
    // Blend stances in and out so going prone is a movement, not a snap.
    for (const name of ['crouch', 'prone', 'climb', 'dead']) {
      const target = stanceName === name ? 1 : 0;
      const cur = this._stanceBlend[name] ?? 0;
      const rate = name === 'dead' ? 6 : 9;
      this._stanceBlend[name] = cur + (target - cur) * Math.min(1, dt * rate);
      add(POSE[name], this._stanceBlend[name]);
    }

    // Weapon carry, unless the arms are busy climbing or the soldier is down.
    const carryWeight = (1 - (this._stanceBlend.climb ?? 0))
      * (1 - (this._stanceBlend.dead ?? 0))
      * (this.state === ANIM.RUN ? 0.55 : 1);
    add(POSE.carry, carryWeight * (1 - this.ads));
    add(POSE.ads, carryWeight * this.ads);

    // Landing absorb and the step-up hop.
    if (this.state === ANIM.LAND) {
      const k = Math.sin(this.landPhase * Math.PI);
      add(POSE.crouch, k * 0.55);
    }
    if (this.state === ANIM.STEP_UP) {
      const k = Math.sin(this.stepPhase * Math.PI);
      add({ thighL: [-0.85, 0, 0], shinL: [0.95, 0, 0], hips: [0.12, 0, 0] }, k);
    }

    // The one-shot action.
    if (this.overlay && ACTIONS[this.overlay]) {
      add(ACTIONS[this.overlay](this.overlayPhase), 1);
    }

    // Aim: split the vertical look through the spine so the whole torso tracks.
    if (this.state !== ANIM.DEAD) {
      const pitch = THREE.MathUtils.clamp(this.aimPitch, -1.1, 1.1);
      add({
        spine: [pitch * 0.18, 0, 0],
        chest: [pitch * 0.30, 0, 0],
        neck: [pitch * 0.26, 0, 0],
        head: [pitch * 0.16, 0, 0],
      }, 1);
    }

    const q = _tmpQuat;
    const e = _tmpEuler;
    for (const [name, rot] of Object.entries(acc)) {
      const bone = this.bones[name];
      if (!bone) continue;
      e.set(rot[0], rot[1], rot[2], 'XYZ');
      q.setFromEuler(e);
      bone.quaternion.multiply(q);
    }
  }

  /** Places the world model at a position with a facing. */
  place(position, yaw) {
    this.root.position.copy(position);
    this.body.rotation.y = yaw;
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.dispose();
        }
      }
    });
  }
}

const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();

void DEG;
