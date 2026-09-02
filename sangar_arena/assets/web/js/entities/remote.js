import * as THREE from '../../vendor/three.module.js';
import { Soldier } from './soldier.js';
import { equipOnSoldier } from './weapons.js';
import { ANIM } from '../config.js';

/**
 * Another player's soldier, driven by network snapshots.
 *
 * Snapshots arrive at 20 Hz over a phone hotspot with jitter, so positions are
 * played back on a short delay and interpolated between the two samples that
 * bracket the render time. That trades ~100 ms of latency for movement that
 * does not teleport.
 */
export class RemotePlayer {
  constructor(scene, { id, name, agent, team, primary, secondary }) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.primary = primary;
    this.secondary = secondary;

    this.soldier = new Soldier(agent, team);
    equipOnSoldier(this.soldier, primary, secondary);
    scene.add(this.soldier.root);

    this.buffer = [];          // { t, pos, yaw, pitch, state, hp }
    this.renderPos = new THREE.Vector3();
    this.renderYaw = 0;
    this.renderPitch = 0;
    this.hp = 100;
    this.alive = true;
    this.speed = 0;
    this.lastPos = new THREE.Vector3();
    this.height = 1.78;
    this.radius = 0.34;

    this.label = makeLabel(name, team);
    this.label.position.y = 2.1;
    this.soldier.root.add(this.label);

    /** Interpolation delay in seconds. */
    this.delay = 0.11;
  }

  /** Feeds one snapshot sample. */
  push(sample, nowMs) {
    const t = nowMs / 1000;
    this.buffer.push({
      t,
      pos: new THREE.Vector3(sample.x ?? 0, sample.y ?? 0, sample.z ?? 0),
      yaw: sample.yaw ?? 0,
      pitch: sample.pitch ?? 0,
      state: sample.st ?? ANIM.IDLE,
      hp: sample.hp ?? 100,
      held: sample.w ?? 0,
      fx: sample.fx ?? 0,
    });
    while (this.buffer.length > 24) this.buffer.shift();
  }

  /** Switches the visible weapon when the peer swaps. */
  setHeld(index) {
    if (this._heldIndex === index) return;
    this._heldIndex = index;
    const held = index === 1 ? this.secondary : this.primary;
    const slung = index === 1 ? this.primary : this.secondary;
    equipOnSoldier(this.soldier, held, slung);
  }

  update(dt, nowMs) {
    const renderTime = nowMs / 1000 - this.delay;

    // Find the pair of samples that bracket the render time.
    let a = null, b = null;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].t <= renderTime) {
        a = this.buffer[i];
        b = this.buffer[i + 1] ?? null;
        break;
      }
    }
    if (!a) a = this.buffer[0];
    if (!a) {
      this.soldier.update(dt, { speed: 0 });
      return;
    }

    if (b) {
      const span = b.t - a.t;
      const k = span > 0.0001
        ? THREE.MathUtils.clamp((renderTime - a.t) / span, 0, 1) : 0;
      this.renderPos.lerpVectors(a.pos, b.pos, k);
      this.renderYaw = lerpAngle(a.yaw, b.yaw, k);
      this.renderPitch = THREE.MathUtils.lerp(a.pitch, b.pitch, k);
      this.hp = b.hp;
      this.setHeld(b.held);
      this._state = b.state;
    } else {
      // Ran out of buffer: extrapolate briefly rather than freezing.
      const lead = Math.min(0.2, renderTime - a.t);
      this.renderPos.copy(a.pos);
      if (this.buffer.length > 1) {
        const prev = this.buffer[this.buffer.length - 2];
        const vel = a.pos.clone().sub(prev.pos)
          .divideScalar(Math.max(0.016, a.t - prev.t));
        this.renderPos.addScaledVector(vel, lead);
      }
      this.renderYaw = a.yaw;
      this.renderPitch = a.pitch;
      this.hp = a.hp;
      this.setHeld(a.held);
      this._state = a.state;
    }

    this.speed = this.renderPos.distanceTo(this.lastPos) / Math.max(dt, 0.001);
    this.lastPos.copy(this.renderPos);
    this.alive = this.hp > 0;

    this.soldier.place(this.renderPos, this.renderYaw);
    this.soldier.setState(this.alive ? this._state : ANIM.DEAD);
    this.soldier.update(dt, {
      speed: this.speed,
      aimPitch: this.renderPitch,
    });

    // Name tags always face the camera and fade with distance.
    this.height = heightFor(this._state);
  }

  faceLabel(camera) {
    this.label.quaternion.copy(camera.quaternion);
    const d = camera.position.distanceTo(this.soldier.root.position);
    this.label.material.opacity = d > 70 ? 0 : (d > 45 ? (70 - d) / 25 : 0.95);
    this.label.visible = this.alive && this.label.material.opacity > 0.02;
  }

  get position() { return this.soldier.root.position; }

  dispose(scene) {
    scene.remove(this.soldier.root);
    this.soldier.dispose();
    this.label.material.map?.dispose();
    this.label.material.dispose();
  }
}

export function heightFor(state) {
  switch (state) {
    case ANIM.CROUCH_IDLE:
    case ANIM.CROUCH_WALK:
      return 1.18;
    case ANIM.PRONE_IDLE:
    case ANIM.PRONE_CRAWL:
      return 0.62;
    case ANIM.DEAD:
      return 0.5;
    default:
      return 1.78;
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** A canvas-drawn name plate above each soldier. */
export function makeLabel(name, team) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '600 30px system-ui, "Noto Sans Arabic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = team === 0 ? '#7fb0ff' : '#ff8a80';
  ctx.fillText(name, 128, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  sprite.scale.set(1.5, 0.38, 1);
  sprite.renderOrder = 10;
  return sprite;
}
