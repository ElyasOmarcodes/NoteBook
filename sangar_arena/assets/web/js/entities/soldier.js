import * as THREE from '../../vendor/three.module.js';
import { ANIM, TEAM_COLORS } from '../config.js';

/**
 * A soldier: a jointed rig plus a procedural animation state machine.
 *
 * The rig is built from primitives rather than loaded from a GLB so the APK
 * ships with no binary model assets, but the skeleton is a real one — hips,
 * spine, chest, neck, head, two arms and two legs with proper parenting — so
 * every clip below is authored the same way an imported animation would be:
 * per-joint rotations, blended over time. Drop a rigged GLB into
 * `assets/models/` and `loadExternalRig()` will use it instead.
 */

const DEG = Math.PI / 180;

// A pose is a sparse map of jointName -> [rx, ry, rz] in radians, plus the
// optional pseudo-joints `_rootY` (vertical bob) and `_rootPitch` (lean).
function pose(entries) { return entries; }

// =========================================================================
// Clips — each returns a pose for a normalised phase (0..1) or raw time.
// =========================================================================

const CLIPS = {
  [ANIM.IDLE](t) {
    const b = Math.sin(t * 1.7) * 0.5 + 0.5;
    const sway = Math.sin(t * 0.9) * 0.02;
    return pose({
      _rootY: b * 0.012,
      hips: [0, sway * 0.5, 0],
      spine: [0.04, -sway, 0],
      chest: [0.02, sway * 0.6, 0],
      neck: [-0.03, sway * 0.4, 0],
      head: [0, Math.sin(t * 0.5) * 0.06, 0],
      shoulderL: [0, 0, 12 * DEG],
      shoulderR: [0, 0, -12 * DEG],
      armL: [-8 * DEG, 0, 6 * DEG + b * 0.01],
      armR: [-8 * DEG, 0, -6 * DEG - b * 0.01],
      forearmL: [-22 * DEG, 0, 0],
      forearmR: [-22 * DEG, 0, 0],
      thighL: [0, 0, 1.5 * DEG],
      thighR: [0, 0, -1.5 * DEG],
      shinL: [2 * DEG, 0, 0],
      shinR: [2 * DEG, 0, 0],
      footL: [0, 0, 0],
      footR: [0, 0, 0],
    });
  },

  [ANIM.WALK](t) {
    const p = t * 2 * Math.PI;
    const s = Math.sin(p), c = Math.cos(p);
    return pose({
      _rootY: Math.abs(Math.sin(p)) * 0.045 - 0.02,
      _rootRoll: c * 0.03,
      hips: [0.03, -s * 0.10, 0],
      spine: [0.06, s * 0.05, 0],
      chest: [0.02, s * 0.08, 0],
      neck: [-0.04, -s * 0.04, 0],
      head: [0, -s * 0.03, 0],
      shoulderL: [0, 0, 12 * DEG],
      shoulderR: [0, 0, -12 * DEG],
      armL: [-s * 26 * DEG - 6 * DEG, 0, 8 * DEG],
      armR: [s * 26 * DEG - 6 * DEG, 0, -8 * DEG],
      forearmL: [-28 * DEG - Math.max(0, s) * 22 * DEG, 0, 0],
      forearmR: [-28 * DEG - Math.max(0, -s) * 22 * DEG, 0, 0],
      thighL: [s * 34 * DEG, 0, 1.5 * DEG],
      thighR: [-s * 34 * DEG, 0, -1.5 * DEG],
      shinL: [Math.max(0, -s) * 52 * DEG + 4 * DEG, 0, 0],
      shinR: [Math.max(0, s) * 52 * DEG + 4 * DEG, 0, 0],
      footL: [-s * 12 * DEG, 0, 0],
      footR: [s * 12 * DEG, 0, 0],
    });
  },

  [ANIM.RUN](t) {
    const p = t * 2 * Math.PI;
    const s = Math.sin(p), c = Math.cos(p);
    return pose({
      _rootY: Math.abs(Math.sin(p)) * 0.085 - 0.03,
      _rootRoll: c * 0.06,
      _rootPitch: 0.13,
      hips: [0.07, -s * 0.16, 0],
      spine: [0.12, s * 0.09, 0],
      chest: [0.06, s * 0.12, 0],
      neck: [-0.14, -s * 0.05, 0],
      head: [-0.05, -s * 0.04, 0],
      shoulderL: [0, 0, 16 * DEG],
      shoulderR: [0, 0, -16 * DEG],
      armL: [-s * 58 * DEG, 0, 12 * DEG],
      armR: [s * 58 * DEG, 0, -12 * DEG],
      forearmL: [-72 * DEG, 0, 0],
      forearmR: [-72 * DEG, 0, 0],
      thighL: [s * 58 * DEG, 0, 2 * DEG],
      thighR: [-s * 58 * DEG, 0, -2 * DEG],
      shinL: [Math.max(0, -s) * 92 * DEG + 8 * DEG, 0, 0],
      shinR: [Math.max(0, s) * 92 * DEG + 8 * DEG, 0, 0],
      footL: [-s * 20 * DEG, 0, 0],
      footR: [s * 20 * DEG, 0, 0],
    });
  },

  /** Slow, deliberate walk — the "creeping like a cat" gait. */
  [ANIM.SNEAK](t) {
    const p = t * 2 * Math.PI;
    const s = Math.sin(p);
    return pose({
      _rootY: -0.10 + Math.abs(s) * 0.02,
      _rootPitch: 0.16,
      hips: [0.12, -s * 0.06, 0],
      spine: [0.10, s * 0.03, 0],
      chest: [0.04, s * 0.04, 0],
      neck: [-0.16, 0, 0],
      head: [-0.04, 0, 0],
      shoulderL: [0, 0, 14 * DEG],
      shoulderR: [0, 0, -14 * DEG],
      armL: [-18 * DEG, 0, 10 * DEG],
      armR: [-18 * DEG, 0, -10 * DEG],
      forearmL: [-46 * DEG, 0, 0],
      forearmR: [-46 * DEG, 0, 0],
      // High knee lift, slow toe-down placement.
      thighL: [s * 30 * DEG - 8 * DEG, 0, 3 * DEG],
      thighR: [-s * 30 * DEG - 8 * DEG, 0, -3 * DEG],
      shinL: [Math.max(0, -s) * 66 * DEG + 22 * DEG, 0, 0],
      shinR: [Math.max(0, s) * 66 * DEG + 22 * DEG, 0, 0],
      footL: [-14 * DEG - s * 10 * DEG, 0, 0],
      footR: [-14 * DEG + s * 10 * DEG, 0, 0],
    });
  },

  [ANIM.CROUCH_IDLE](t) {
    const b = Math.sin(t * 1.4) * 0.01;
    return pose({
      _rootY: -0.35 + b,
      _rootPitch: 0.12,
      hips: [0.36, 0, 0],
      spine: [0.10, 0, 0],
      chest: [0.05, 0, 0],
      neck: [-0.22, 0, 0],
      head: [-0.06, Math.sin(t * 0.6) * 0.05, 0],
      shoulderL: [0, 0, 14 * DEG],
      shoulderR: [0, 0, -14 * DEG],
      armL: [-14 * DEG, 0, 8 * DEG],
      armR: [-14 * DEG, 0, -8 * DEG],
      forearmL: [-40 * DEG, 0, 0],
      forearmR: [-40 * DEG, 0, 0],
      thighL: [-78 * DEG, 0, 9 * DEG],
      thighR: [-78 * DEG, 0, -9 * DEG],
      shinL: [96 * DEG, 0, 0],
      shinR: [96 * DEG, 0, 0],
      footL: [-18 * DEG, 0, 0],
      footR: [-18 * DEG, 0, 0],
    });
  },

  [ANIM.CROUCH_WALK](t) {
    const p = t * 2 * Math.PI;
    const s = Math.sin(p);
    const base = CLIPS[ANIM.CROUCH_IDLE](0);
    return pose({
      ...base,
      _rootY: -0.35 + Math.abs(s) * 0.03,
      hips: [0.36, -s * 0.08, 0],
      chest: [0.05, s * 0.06, 0],
      armL: [-14 * DEG - s * 10 * DEG, 0, 8 * DEG],
      armR: [-14 * DEG + s * 10 * DEG, 0, -8 * DEG],
      thighL: [-78 * DEG + s * 26 * DEG, 0, 9 * DEG],
      thighR: [-78 * DEG - s * 26 * DEG, 0, -9 * DEG],
      shinL: [96 * DEG - Math.max(0, s) * 30 * DEG, 0, 0],
      shinR: [96 * DEG - Math.max(0, -s) * 30 * DEG, 0, 0],
    });
  },

  [ANIM.PRONE_IDLE](t) {
    const b = Math.sin(t * 1.1) * 0.012;
    return pose({
      _rootY: 0.12,
      _rootPitch: 88 * DEG,
      hips: [0, 0, 0],
      spine: [-14 * DEG, 0, 0],
      chest: [-12 * DEG, 0, 0],
      neck: [-30 * DEG, 0, 0],
      head: [-16 * DEG, Math.sin(t * 0.4) * 0.05, 0],
      shoulderL: [0, 0, 26 * DEG],
      shoulderR: [0, 0, -26 * DEG],
      armL: [-52 * DEG, 22 * DEG, 34 * DEG],
      armR: [-52 * DEG, -22 * DEG, -34 * DEG],
      forearmL: [-72 * DEG + b, 0, 0],
      forearmR: [-72 * DEG - b, 0, 0],
      thighL: [6 * DEG, 0, 14 * DEG],
      thighR: [6 * DEG, 0, -14 * DEG],
      shinL: [-18 * DEG, 0, 0],
      shinR: [-18 * DEG, 0, 0],
      footL: [20 * DEG, 0, 0],
      footR: [20 * DEG, 0, 0],
    });
  },

  [ANIM.PRONE_CRAWL](t) {
    const p = t * 2 * Math.PI;
    const s = Math.sin(p);
    const base = CLIPS[ANIM.PRONE_IDLE](0);
    return pose({
      ...base,
      _rootRoll: s * 0.09,
      armL: [-52 * DEG - s * 26 * DEG, 22 * DEG, 34 * DEG],
      armR: [-52 * DEG + s * 26 * DEG, -22 * DEG, -34 * DEG],
      thighL: [6 * DEG + s * 26 * DEG, 0, 14 * DEG + Math.max(0, s) * 20 * DEG],
      thighR: [6 * DEG - s * 26 * DEG, 0, -14 * DEG - Math.max(0, -s) * 20 * DEG],
      shinL: [-18 * DEG - Math.max(0, s) * 40 * DEG, 0, 0],
      shinR: [-18 * DEG - Math.max(0, -s) * 40 * DEG, 0, 0],
    });
  },

  [ANIM.JUMP]() {
    return pose({
      _rootPitch: -0.08,
      hips: [-0.10, 0, 0],
      spine: [0.06, 0, 0],
      chest: [0.02, 0, 0],
      neck: [-0.06, 0, 0],
      head: [0.04, 0, 0],
      shoulderL: [0, 0, 20 * DEG],
      shoulderR: [0, 0, -20 * DEG],
      armL: [-64 * DEG, 0, 22 * DEG],
      armR: [-64 * DEG, 0, -22 * DEG],
      forearmL: [-40 * DEG, 0, 0],
      forearmR: [-40 * DEG, 0, 0],
      thighL: [-52 * DEG, 0, 6 * DEG],
      thighR: [-18 * DEG, 0, -6 * DEG],
      shinL: [62 * DEG, 0, 0],
      shinR: [26 * DEG, 0, 0],
      footL: [-20 * DEG, 0, 0],
      footR: [-10 * DEG, 0, 0],
    });
  },

  [ANIM.FALL](t) {
    const f = Math.sin(t * 6) * 0.05;
    return pose({
      _rootPitch: 0.10,
      hips: [0.06, 0, 0],
      spine: [-0.04, 0, 0],
      chest: [-0.02, 0, 0],
      neck: [0.10, 0, 0],
      head: [0.06, 0, 0],
      shoulderL: [0, 0, 30 * DEG],
      shoulderR: [0, 0, -30 * DEG],
      armL: [-96 * DEG + f, 0, 30 * DEG],
      armR: [-96 * DEG - f, 0, -30 * DEG],
      forearmL: [-30 * DEG, 0, 0],
      forearmR: [-30 * DEG, 0, 0],
      thighL: [-22 * DEG, 0, 10 * DEG],
      thighR: [-30 * DEG, 0, -10 * DEG],
      shinL: [40 * DEG, 0, 0],
      shinR: [52 * DEG, 0, 0],
      footL: [10 * DEG, 0, 0],
      footR: [10 * DEG, 0, 0],
    });
  },

  /** Absorb the landing — deep on a long drop, shallow on a hop. */
  [ANIM.LAND](p) {
    const k = Math.sin(Math.min(1, p) * Math.PI);
    return pose({
      _rootY: -0.22 * k,
      _rootPitch: 0.24 * k,
      hips: [0.30 * k, 0, 0],
      spine: [0.16 * k, 0, 0],
      chest: [0.08 * k, 0, 0],
      neck: [-0.18 * k, 0, 0],
      head: [-0.06 * k, 0, 0],
      shoulderL: [0, 0, 14 * DEG],
      shoulderR: [0, 0, -14 * DEG],
      armL: [-30 * DEG * k - 8 * DEG, 0, 16 * DEG],
      armR: [-30 * DEG * k - 8 * DEG, 0, -16 * DEG],
      forearmL: [-40 * DEG, 0, 0],
      forearmR: [-40 * DEG, 0, 0],
      thighL: [-70 * DEG * k, 0, 8 * DEG],
      thighR: [-70 * DEG * k, 0, -8 * DEG],
      shinL: [86 * DEG * k + 4 * DEG, 0, 0],
      shinR: [86 * DEG * k + 4 * DEG, 0, 0],
      footL: [-16 * DEG * k, 0, 0],
      footR: [-16 * DEG * k, 0, 0],
    });
  },

  /** Hand-over-hand ladder climb. */
  [ANIM.CLIMB](t) {
    const p = t * 2 * Math.PI;
    const s = Math.sin(p), c = Math.cos(p);
    return pose({
      _rootPitch: -0.10,
      hips: [-0.06, 0, 0],
      spine: [0.05, 0, 0],
      chest: [0.02, s * 0.05, 0],
      neck: [0.12, 0, 0],
      head: [0.10, 0, 0],
      shoulderL: [0, 0, 22 * DEG],
      shoulderR: [0, 0, -22 * DEG],
      armL: [-(110 + s * 55) * DEG, 0, 18 * DEG],
      armR: [-(110 - s * 55) * DEG, 0, -18 * DEG],
      forearmL: [-(28 + Math.max(0, -s) * 40) * DEG, 0, 0],
      forearmR: [-(28 + Math.max(0, s) * 40) * DEG, 0, 0],
      thighL: [-(30 - s * 34) * DEG, 0, 10 * DEG],
      thighR: [-(30 + s * 34) * DEG, 0, -10 * DEG],
      shinL: [(46 + s * 30) * DEG, 0, 0],
      shinR: [(46 - s * 30) * DEG, 0, 0],
      footL: [-8 * DEG + c * 0.05, 0, 0],
      footR: [-8 * DEG - c * 0.05, 0, 0],
    });
  },

  /** The hop-up as the character mounts a low ledge. */
  [ANIM.STEP_UP](p) {
    const k = Math.sin(Math.min(1, p) * Math.PI);
    return pose({
      _rootY: 0.05 * k,
      _rootPitch: 0.16 * k,
      hips: [0.10 * k, 0, 0],
      spine: [0.08 * k, 0, 0],
      chest: [0.03 * k, 0, 0],
      neck: [-0.06 * k, 0, 0],
      head: [0, 0, 0],
      shoulderL: [0, 0, 14 * DEG],
      shoulderR: [0, 0, -14 * DEG],
      armL: [-24 * DEG, 0, 10 * DEG],
      armR: [-24 * DEG, 0, -10 * DEG],
      forearmL: [-36 * DEG, 0, 0],
      forearmR: [-36 * DEG, 0, 0],
      thighL: [-(84 * k) * DEG, 0, 8 * DEG],
      thighR: [(18 * k) * DEG, 0, -8 * DEG],
      shinL: [(70 * k) * DEG, 0, 0],
      shinR: [(10 * k) * DEG, 0, 0],
      footL: [-(20 * k) * DEG, 0, 0],
      footR: [0, 0, 0],
    });
  },

  [ANIM.DEAD](p) {
    const k = Math.min(1, p * 1.6);
    const e = 1 - Math.pow(1 - k, 3);
    return pose({
      _rootY: 0.10 * e,
      _rootPitch: 82 * DEG * e,
      _rootRoll: 22 * DEG * e,
      hips: [0, 0, 0],
      spine: [-10 * DEG * e, 0, 6 * DEG * e],
      chest: [-6 * DEG * e, 0, 0],
      neck: [24 * DEG * e, 12 * DEG * e, 0],
      head: [12 * DEG * e, 0, 0],
      shoulderL: [0, 0, 30 * DEG],
      shoulderR: [0, 0, -30 * DEG],
      armL: [-30 * DEG * e, 40 * DEG * e, 50 * DEG * e],
      armR: [-70 * DEG * e, -20 * DEG * e, -30 * DEG * e],
      forearmL: [-20 * DEG, 0, 0],
      forearmR: [-50 * DEG * e, 0, 0],
      thighL: [16 * DEG * e, 0, 22 * DEG * e],
      thighR: [-6 * DEG * e, 0, -10 * DEG * e],
      shinL: [-40 * DEG * e, 0, 0],
      shinR: [-14 * DEG * e, 0, 0],
      footL: [16 * DEG, 0, 0],
      footR: [16 * DEG, 0, 0],
    });
  },
};

/**
 * The rifle carry: both hands on the weapon, elbows in, muzzle forward.
 *
 * Locomotion clips animate the arms as if they were empty, which is right for
 * the legs and torso but wrong for anyone holding a rifle. This pose is
 * blended over the arms of every state where the weapon is actually up, so the
 * soldier reads as armed from across the yard.
 */
const CARRY = {
  shoulderL: [0, 0, 16 * DEG],
  shoulderR: [0, 0, -16 * DEG],
  armL: [-58 * DEG, 34 * DEG, 30 * DEG],
  armR: [-46 * DEG, -18 * DEG, -22 * DEG],
  forearmL: [-64 * DEG, 0, -18 * DEG],
  forearmR: [-72 * DEG, 0, 12 * DEG],
};

/** States where the arms follow the clip instead of holding the weapon. */
const CARRY_EXEMPT = new Set([
  ANIM.CLIMB, ANIM.DEAD, ANIM.PRONE_IDLE, ANIM.PRONE_CRAWL, ANIM.FALL,
]);

// ---- upper-body overlays -------------------------------------------------
// These blend on top of whatever the legs are doing, the way an additive
// upper-body layer works in a normal animation graph.

const OVERLAYS = {
  /** Recoil kick: sharp back, quick settle. */
  [ANIM.FIRE](p) {
    const k = p < 0.18 ? p / 0.18 : Math.max(0, 1 - (p - 0.18) / 0.82);
    return {
      weight: 1,
      joints: {
        chest: [-0.09 * k, 0, 0],
        neck: [-0.05 * k, 0, 0],
        armR: [-0.16 * k, 0, 0],
        armL: [-0.10 * k, 0, 0],
        forearmR: [0.12 * k, 0, 0],
        _rootPitch: -0.04 * k,
      },
    };
  },

  /** Mag out, mag in, tap the bolt. */
  [ANIM.RELOAD](p) {
    let armL, forearmL, chest, handLGrip;
    if (p < 0.28) {                    // drop the magazine
      const k = p / 0.28;
      armL = [-40 * DEG - k * 46 * DEG, 20 * DEG * k, 26 * DEG];
      forearmL = [-60 * DEG - k * 30 * DEG, 0, 0];
      chest = [-0.05 * k, 0.10 * k, 0];
      handLGrip = 'mag';
    } else if (p < 0.62) {             // fetch a fresh one from the rig
      const k = (p - 0.28) / 0.34;
      armL = [-86 * DEG + k * 30 * DEG, 20 * DEG - k * 44 * DEG, 26 * DEG];
      forearmL = [-90 * DEG + k * 20 * DEG, 0, 0];
      chest = [-0.05 + k * 0.02, 0.10 - k * 0.16, 0];
      handLGrip = 'mag';
    } else if (p < 0.84) {             // seat it
      const k = (p - 0.62) / 0.22;
      armL = [-56 * DEG - k * 16 * DEG, -24 * DEG + k * 24 * DEG, 26 * DEG];
      forearmL = [-70 * DEG - k * 14 * DEG, 0, 0];
      chest = [-0.03 - k * 0.02, -0.06 + k * 0.06, 0];
      handLGrip = 'mag';
    } else {                           // charge the weapon
      const k = (p - 0.84) / 0.16;
      const pull = Math.sin(k * Math.PI);
      armL = [-72 * DEG + pull * 26 * DEG, pull * 18 * DEG, 26 * DEG];
      forearmL = [-84 * DEG + pull * 30 * DEG, 0, 0];
      chest = [-0.05 * pull, 0.04 * pull, 0];
      handLGrip = 'bolt';
    }
    return { weight: 1, joints: { armL, forearmL, chest }, grip: handLGrip };
  },

  /** Rifle-butt strike. */
  [ANIM.MELEE](p) {
    const wind = Math.min(1, p / 0.3);
    const swing = p > 0.3 ? Math.min(1, (p - 0.3) / 0.28) : 0;
    const back = 1 - Math.max(0, (p - 0.58) / 0.42);
    const k = (wind - swing) * back;
    return {
      weight: 1,
      joints: {
        chest: [0, -0.34 * wind * back + 0.42 * swing * back, 0],
        armR: [-0.5 * wind * back + 0.9 * swing * back, 0, -0.3 * k],
        armL: [-0.7 * wind * back + 0.5 * swing * back, 0, 0.3 * k],
        forearmR: [-1.1 * wind * back + 0.3 * swing * back, 0, 0],
        forearmL: [-1.0 * wind * back + 0.2 * swing * back, 0, 0],
        _rootPitch: 0.10 * swing * back,
      },
    };
  },

  /** Crouch to an ammo crate and top the reserve up. */
  [ANIM.RESUPPLY](p) {
    const k = Math.sin(Math.min(1, p) * Math.PI);
    return {
      weight: 1,
      joints: {
        chest: [0.30 * k, 0.14 * k, 0],
        neck: [0.16 * k, 0, 0],
        armL: [-1.05 * k, 0.30 * k, 0.20 * k],
        armR: [-0.75 * k, -0.15 * k, -0.10 * k],
        forearmL: [-0.55 * k, 0, 0],
        forearmR: [-0.65 * k, 0, 0],
        _rootY: -0.22 * k,
        _rootPitch: 0.26 * k,
      },
    };
  },
};

// =========================================================================
// Rig construction
// =========================================================================

function limb(material, w, h, d, taper = 1) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  if (taper !== 1) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0) {
        pos.setX(i, pos.getX(i) * taper);
        pos.setZ(i, pos.getZ(i) * taper);
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function capsule(material, r, len) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function joint(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

export class Soldier {
  /**
   * @param {object} agent agent definition from the Dart catalogue
   * @param {number} team 0 or 1
   */
  constructor(agent, team = 0, opts = {}) {
    this.agent = agent;
    this.team = team;
    this.firstPerson = !!opts.firstPerson;

    this.root = new THREE.Group();
    this.root.name = `soldier:${agent.id}`;

    this.joints = {};
    this.current = {};   // smoothed joint state
    this.scale = agent.female ? 0.955 : 1.0;

    this._buildMaterials();
    this._buildSkeleton();

    // animation state
    this.state = ANIM.IDLE;
    this.phase = 0;
    this.overlay = null;
    this.overlayPhase = 0;
    this.overlayDuration = 0;
    this.aimPitch = 0;
    this.deathTime = 0;
    this.stepPhase = 0;
    this.landPhase = 1;
    this.lastFootstep = 0;
    this.footstepFired = false;

    this.weaponAnchor = this.joints.handR;
    this.slingAnchor = this.joints.chest;
  }

  _buildMaterials() {
    const a = this.agent;
    const mk = (color, rough, metal = 0.02) => new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal,
    });
    // A per-team rim on the outfit so friend and foe read instantly, even
    // through the fog at the far end of the yard.
    this.mat = {
      skin: mk(a.skin ?? 0xc79a72, 0.78),
      outfit: mk(a.outfit ?? 0x3a3f35, 0.86),
      accent: mk(a.accent ?? 0x8e2f26, 0.72),
      hair: mk(a.hair ?? 0x241a14, 0.94),
      boot: mk(0x1d1c1a, 0.86, 0.08),
      gear: mk(0x24262a, 0.70, 0.20),
      glass: new THREE.MeshStandardMaterial({
        color: 0x11151a, roughness: 0.15, metalness: 0.6,
      }),
      team: new THREE.MeshStandardMaterial({
        color: TEAM_COLORS[this.team] ?? TEAM_COLORS[0],
        roughness: 0.55,
        emissive: TEAM_COLORS[this.team] ?? TEAM_COLORS[0],
        emissiveIntensity: 0.22,
      }),
    };
  }

  _buildSkeleton() {
    const M = this.mat;
    const s = this.scale;
    const root = this.root;

    // The body node carries yaw; the rig hangs below it from the hips.
    const body = joint(root, 0, 0, 0);
    this.joints.body = body;

    const hips = joint(body, 0, 0.94 * s, 0);
    this.joints.hips = hips;
    const pelvis = limb(M.outfit, 0.34, 0.24, 0.24);
    pelvis.position.y = -0.04;
    hips.add(pelvis);

    const spine = joint(hips, 0, 0.10, 0);
    this.joints.spine = spine;
    const belly = limb(M.outfit, 0.36, 0.24, 0.235);
    belly.position.y = 0.12;
    spine.add(belly);

    const chest = joint(spine, 0, 0.26, 0);
    this.joints.chest = chest;
    const ribs = limb(M.outfit, 0.44, 0.34, 0.26, 0.86);
    ribs.position.y = 0.15;
    chest.add(ribs);

    // Plate carrier + team stripe
    const carrier = limb(M.gear, 0.40, 0.30, 0.30);
    carrier.position.set(0, 0.16, 0.01);
    chest.add(carrier);
    const stripe = limb(M.team, 0.42, 0.045, 0.31);
    stripe.position.set(0, 0.27, 0.01);
    chest.add(stripe);
    const pouchL = limb(M.gear, 0.11, 0.13, 0.10);
    pouchL.position.set(-0.13, 0.03, 0.17);
    chest.add(pouchL);
    const pouchR = pouchL.clone();
    pouchR.position.x = 0.13;
    chest.add(pouchR);

    const neck = joint(chest, 0, 0.32, 0);
    this.joints.neck = neck;
    const throat = limb(M.skin, 0.11, 0.09, 0.11);
    throat.position.y = 0.03;
    neck.add(throat);

    const head = joint(neck, 0, 0.10, 0);
    this.joints.head = head;
    this._buildHead(head);

    // ---- arms ----
    for (const side of [-1, 1]) {
      const tag = side < 0 ? 'L' : 'R';
      const shoulder = joint(chest, side * 0.235, 0.26, 0);
      this.joints[`shoulder${tag}`] = shoulder;
      const pad = limb(M.outfit, 0.15, 0.14, 0.17);
      shoulder.add(pad);

      const arm = joint(shoulder, 0, -0.06, 0);
      this.joints[`arm${tag}`] = arm;
      const upper = capsule(M.outfit, 0.062, 0.20);
      upper.position.y = -0.13;
      arm.add(upper);

      const forearm = joint(arm, 0, -0.27, 0);
      this.joints[`forearm${tag}`] = forearm;
      const lower = capsule(M.skin, 0.052, 0.18);
      lower.position.y = -0.12;
      forearm.add(lower);
      const glove = limb(M.gear, 0.085, 0.12, 0.10);
      glove.position.y = -0.045;
      forearm.add(glove);

      const hand = joint(forearm, 0, -0.245, 0);
      this.joints[`hand${tag}`] = hand;
      const palm = limb(M.gear, 0.075, 0.10, 0.085);
      hand.add(palm);
    }

    // ---- legs ----
    for (const side of [-1, 1]) {
      const tag = side < 0 ? 'L' : 'R';
      const thigh = joint(hips, side * 0.105, -0.10, 0);
      this.joints[`thigh${tag}`] = thigh;
      const upper = capsule(M.outfit, 0.085, 0.26);
      upper.position.y = -0.19;
      thigh.add(upper);

      const shin = joint(thigh, 0, -0.42, 0);
      this.joints[`shin${tag}`] = shin;
      const lower = capsule(M.outfit, 0.070, 0.26);
      lower.position.y = -0.19;
      shin.add(lower);
      const knee = limb(M.gear, 0.13, 0.12, 0.115);
      knee.position.set(0, -0.03, 0.03);
      shin.add(knee);

      const foot = joint(shin, 0, -0.42, 0);
      this.joints[`foot${tag}`] = foot;
      const boot = limb(M.boot, 0.115, 0.10, 0.26);
      boot.position.set(0, -0.05, 0.045);
      foot.add(boot);
    }

    // scale the whole rig for shorter agents
    body.scale.setScalar(s);

    // Cache a neutral copy so blending always has something to lerp from.
    for (const name of Object.keys(this.joints)) {
      this.current[name] = new THREE.Euler(0, 0, 0);
    }
    this.rootOffset = { y: 0, pitch: 0, roll: 0 };
  }

  _buildHead(head) {
    const M = this.mat;
    const a = this.agent;

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 14, 12), M.skin);
    skull.scale.set(1.0, 1.12, 1.05);
    skull.position.y = 0.10;
    skull.castShadow = true;
    head.add(skull);

    const jaw = limb(M.skin, 0.15, 0.10, 0.16);
    jaw.position.set(0, 0.035, 0.012);
    head.add(jaw);

    // hair / cap
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.121, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      M.hair);
    hair.scale.set(1.0, 1.12, 1.06);
    hair.position.y = 0.105;
    head.add(hair);
    if (a.female) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.hair);
      bun.position.set(0, 0.10, -0.13);
      head.add(bun);
    }

    if (a.beard) {
      const beard = new THREE.Mesh(
        new THREE.SphereGeometry(0.098, 12, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.42),
        M.hair);
      beard.scale.set(1.02, 1.25, 1.06);
      beard.position.set(0, 0.045, 0.012);
      head.add(beard);
    }

    if (a.glasses) {
      const frame = limb(M.glass, 0.19, 0.045, 0.02);
      frame.position.set(0, 0.09, 0.10);
      head.add(frame);
      const arm = limb(M.glass, 0.02, 0.02, 0.14);
      arm.position.set(-0.088, 0.09, 0.035);
      head.add(arm);
      const arm2 = arm.clone();
      arm2.position.x = 0.088;
      head.add(arm2);
    } else {
      // eyes only read at close range, but they sell the face in the lobby
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.017, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.3 }));
        eye.position.set(s * 0.042, 0.095, 0.098);
        head.add(eye);
      }
    }

    // Team beret / helmet band
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.016, 6, 16), M.team);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.115;
    head.add(band);

    this.joints.headMesh = skull;
  }

  // =======================================================================
  // animation driving
  // =======================================================================

  /** Plays a one-shot upper-body action. */
  playOverlay(name, duration) {
    this.overlay = name;
    this.overlayPhase = 0;
    this.overlayDuration = duration;
  }

  clearOverlay() {
    this.overlay = null;
  }

  /** True while a one-shot overlay is still running. */
  get overlayBusy() {
    return this.overlay !== null && this.overlayPhase < 1;
  }

  setState(state) {
    if (this.state === state) return;
    if (state === ANIM.LAND) this.landPhase = 0;
    if (state === ANIM.DEAD) this.deathTime = 0;
    this.state = state;
  }

  /**
   * @param {number} dt seconds
   * @param {object} ctx { speed, moveCycle, aimPitch, blend }
   */
  update(dt, ctx = {}) {
    const speed = ctx.speed ?? 0;
    this.aimPitch = ctx.aimPitch ?? this.aimPitch;

    // Cycle rate is tied to ground speed so the feet never skate.
    const cycleRate = {
      [ANIM.WALK]: 0.62,
      [ANIM.RUN]: 0.46,
      [ANIM.SNEAK]: 0.85,
      [ANIM.CROUCH_WALK]: 0.72,
      [ANIM.PRONE_CRAWL]: 0.55,
      [ANIM.CLIMB]: 0.38,
    }[this.state];

    if (cycleRate) {
      this.phase += (speed * dt) / (cycleRate * 2.2);
    } else if (this.state === ANIM.CLIMB) {
      this.phase += dt * 1.1;
    } else {
      this.phase += dt;
    }

    // Footstep beat: twice per cycle, at the extremes of the stride.
    if (cycleRate && this.state !== ANIM.CLIMB) {
      const beat = Math.floor(this.phase * 2);
      if (beat !== this.lastFootstep) {
        this.lastFootstep = beat;
        this.footstepFired = true;
      }
    }

    let basePose;
    switch (this.state) {
      case ANIM.LAND:
        this.landPhase = Math.min(1, this.landPhase + dt / 0.34);
        basePose = CLIPS[ANIM.LAND](this.landPhase);
        if (this.landPhase >= 1) this.state = ANIM.IDLE;
        break;
      case ANIM.STEP_UP:
        this.stepPhase = Math.min(1, this.stepPhase + dt / 0.22);
        basePose = CLIPS[ANIM.STEP_UP](this.stepPhase);
        if (this.stepPhase >= 1) this.state = ANIM.WALK;
        break;
      case ANIM.DEAD:
        this.deathTime += dt;
        basePose = CLIPS[ANIM.DEAD](this.deathTime);
        break;
      case ANIM.CLIMB:
        basePose = CLIPS[ANIM.CLIMB](this.phase);
        break;
      default:
        basePose = (CLIPS[this.state] || CLIPS[ANIM.IDLE])(this.phase);
    }

    // Overlay progress
    let overlayPose = null;
    if (this.overlay) {
      this.overlayPhase += dt / Math.max(0.05, this.overlayDuration);
      if (this.overlayPhase >= 1) {
        this.overlayPhase = 1;
        overlayPose = OVERLAYS[this.overlay]?.(1);
        this.overlay = null;
      } else {
        overlayPose = OVERLAYS[this.overlay]?.(this.overlayPhase);
      }
    }

    // Sprinting swings the arms; everything else holds the rifle up.
    if (!CARRY_EXEMPT.has(this.state)) {
      const blend = this.state === ANIM.RUN ? 0.45 : 0.92;
      for (const [name, value] of Object.entries(CARRY)) {
        const base = basePose[name] ?? [0, 0, 0];
        basePose[name] = [
          base[0] + (value[0] - base[0]) * blend,
          base[1] + (value[1] - base[1]) * blend,
          base[2] + (value[2] - base[2]) * blend,
        ];
      }
    }

    this._apply(basePose, overlayPose, dt);
  }

  _apply(basePose, overlayPose, dt) {
    // Critically damped-ish smoothing: fast enough to feel responsive, slow
    // enough to hide the pose-to-pose pops when a state changes.
    const k = 1 - Math.exp(-dt * 16);

    const target = { ...basePose };
    if (overlayPose?.joints) {
      for (const [name, value] of Object.entries(overlayPose.joints)) {
        if (name.startsWith('_')) {
          target[name] = (target[name] ?? 0) + value;
          continue;
        }
        const base = target[name] ?? [0, 0, 0];
        target[name] = [
          base[0] + value[0],
          base[1] + value[1],
          base[2] + value[2],
        ];
      }
    }

    for (const [name, value] of Object.entries(target)) {
      if (name.startsWith('_')) continue;
      const j = this.joints[name];
      if (!j) continue;
      j.rotation.x += (value[0] - j.rotation.x) * k;
      j.rotation.y += (value[1] - j.rotation.y) * k;
      j.rotation.z += (value[2] - j.rotation.z) * k;
    }

    const body = this.joints.body;
    const ty = target._rootY ?? 0;
    const tp = target._rootPitch ?? 0;
    const tr = target._rootRoll ?? 0;
    this.rootOffset.y += (ty - this.rootOffset.y) * k;
    this.rootOffset.pitch += (tp - this.rootOffset.pitch) * k;
    this.rootOffset.roll += (tr - this.rootOffset.roll) * k;
    body.position.y = this.rootOffset.y;
    body.rotation.x = this.rootOffset.pitch;
    body.rotation.z = this.rootOffset.roll;

    // Aim: split the vertical look between chest and neck so the whole torso
    // tracks the target rather than the head snapping on its own.
    if (this.state !== ANIM.DEAD) {
      const pitch = THREE.MathUtils.clamp(this.aimPitch, -1.1, 1.1);
      this.joints.chest.rotation.x += pitch * 0.42;
      this.joints.neck.rotation.x += pitch * 0.34;
      this.joints.head.rotation.x += pitch * 0.20;
    }
  }

  /** Places the world model at a position with a facing. */
  place(position, yaw) {
    this.root.position.copy(position);
    this.joints.body.rotation.y = yaw;
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.mat)) m.dispose();
  }
}

/**
 * If a rigged GLB is dropped into `assets/models/<agentId>.glb`, use it in
 * place of the primitive rig. Joint names are matched case-insensitively
 * against the same skeleton contract used above (hips, spine, chest, neck,
 * head, shoulder/arm/forearm/hand and thigh/shin/foot, each L and R).
 */
export async function loadExternalRig(loader, url, agent, team) {
  const gltf = await loader.loadAsync(url);
  const soldier = Object.create(Soldier.prototype);
  soldier.agent = agent;
  soldier.team = team;
  soldier.root = gltf.scene;
  soldier.joints = {};
  soldier.current = {};
  soldier.scale = 1;
  soldier.mat = {};
  const want = [
    'hips', 'spine', 'chest', 'neck', 'head',
    'shoulderL', 'shoulderR', 'armL', 'armR',
    'forearmL', 'forearmR', 'handL', 'handR',
    'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
  ];
  const byName = new Map();
  gltf.scene.traverse((o) => byName.set(o.name.toLowerCase(), o));
  for (const name of want) {
    const found = byName.get(name.toLowerCase());
    if (found) soldier.joints[name] = found;
  }
  const body = new THREE.Object3D();
  gltf.scene.children.slice().forEach((c) => body.add(c));
  gltf.scene.add(body);
  soldier.joints.body = body;
  soldier.state = ANIM.IDLE;
  soldier.phase = 0;
  soldier.overlay = null;
  soldier.overlayPhase = 0;
  soldier.overlayDuration = 0;
  soldier.aimPitch = 0;
  soldier.deathTime = 0;
  soldier.stepPhase = 0;
  soldier.landPhase = 1;
  soldier.lastFootstep = 0;
  soldier.footstepFired = false;
  soldier.rootOffset = { y: 0, pitch: 0, roll: 0 };
  soldier.weaponAnchor = soldier.joints.handR ?? body;
  soldier.slingAnchor = soldier.joints.chest ?? body;
  return soldier;
}
