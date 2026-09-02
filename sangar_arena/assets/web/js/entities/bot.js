import * as THREE from '../../vendor/three.module.js';
import { Soldier } from './soldier.js';
import { equipOnSoldier } from './weapons.js';
import { ANIM, PHYS, COMBAT } from '../config.js';

/**
 * Training-mode opponents.
 *
 * Deliberately readable rather than clever: patrol, notice, take cover-ish
 * ground, engage in bursts, reload, and die. Enough to practise movement,
 * ranging and weapon handling against.
 */
export class Bot {
  constructor(scene, world, map, { id, name, agent, team, primary, difficulty = 0.5 }) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.world = world;
    this.map = map;
    this.difficulty = difficulty;
    this.weapon = primary;

    this.soldier = new Soldier(agent, team);
    equipOnSoldier(this.soldier, primary, null);
    scene.add(this.soldier.root);

    this.body = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      height: PHYS.standHeight,
      radius: PHYS.playerRadius,
      onGround: true,
      groundY: 0,
    };

    this.hp = 100;
    this.alive = true;
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.state = 'patrol';
    this.target = null;
    this.waypoint = null;
    this.fireCooldown = 0;
    this.burst = 0;
    this.magazine = primary.magazine;
    this.reloadTimer = 0;
    this.reactTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0;
    this.deadTimer = 0;
    this.respawnDelay = 5;
    this.crouching = false;
    this.speed = 0;
    this.height = PHYS.standHeight;
    this.radius = PHYS.playerRadius;

    this.label = null;
  }

  spawn(position) {
    this.body.position.copy(position);
    this.body.velocity.set(0, 0, 0);
    this.hp = 100;
    this.alive = true;
    this.state = 'patrol';
    this.magazine = this.weapon.magazine;
    this.soldier.setState(ANIM.IDLE);
    this.soldier.setVisible(true);
    this.pickWaypoint();
  }

  pickWaypoint() {
    const r = 80;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(
        (Math.random() - 0.5) * r * 2,
        0,
        (Math.random() - 0.5) * r * 2);
      p.y = this.world.groundAt(p.x, p.z, 3) + 0.05;
      if (p.y < 3) { this.waypoint = p; return; }
    }
    this.waypoint = new THREE.Vector3(0, 0, 0);
  }

  get position() { return this.body.position; }

  get eye() {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y + this.body.height + PHYS.eyeOffset,
      this.body.position.z);
  }

  takeDamage(amount, fromDirection) {
    if (!this.alive) return false;
    this.hp -= amount;
    // Being shot at is what makes a bot look for you.
    if (fromDirection) {
      this.yaw = Math.atan2(-fromDirection.x, -fromDirection.z);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deadTimer = 0;
      this.soldier.setState(ANIM.DEAD);
      return true;
    }
    return false;
  }

  /**
   * @param {number} dt
   * @param {Array<{position: THREE.Vector3, team: number, alive: boolean, height: number}>} enemies
   * @param {object} hooks { onShoot(origin, dir, weapon, bot) }
   */
  update(dt, enemies, hooks) {
    if (!this.alive) {
      this.deadTimer += dt;
      this.soldier.place(this.body.position, this.yaw);
      this.soldier.update(dt, { speed: 0 });
      if (this.deadTimer > this.respawnDelay) {
        this.spawn(this.map.pickSpawn(this.team,
          enemies.filter((e) => e.alive).map((e) => e.position)));
      }
      return;
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.magazine = this.weapon.magazine;
    }
    this.fireCooldown -= dt;
    this.strafeTimer -= dt;

    // ---- perception ----
    let best = null, bestDist = Infinity;
    for (const e of enemies) {
      if (!e.alive || e.team === this.team) continue;
      const d = e.position.distanceTo(this.body.position);
      if (d > 90 || d >= bestDist) continue;
      const from = this.eye;
      const to = e.position.clone();
      to.y += e.height * 0.65;
      if (!this.world.visible(from, to)) continue;
      best = e; bestDist = d;
    }

    if (best && !this.target) {
      // Reaction time scales with difficulty — an easy bot hesitates.
      this.reactTimer = 0.55 - this.difficulty * 0.40;
    }
    this.target = best;

    if (this.target) {
      this.state = 'engage';
      this._engage(dt, bestDist, hooks);
    } else {
      this.state = 'patrol';
      this._patrol(dt);
    }

    this.world.move(this.body, dt);
    if (!this.body.onGround) this.body.velocity.y -= PHYS.gravity * dt;

    this.speed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    this._animate(dt);
  }

  _patrol(dt) {
    if (!this.waypoint || this.body.position.distanceTo(this.waypoint) < 2.5) {
      this.pickWaypoint();
    }
    const dir = this.waypoint.clone().sub(this.body.position);
    dir.y = 0;
    const len = dir.length();
    if (len > 0.1) {
      dir.divideScalar(len);
      this.yaw = smoothAngle(this.yaw, Math.atan2(dir.x, dir.z), dt * 3);
      const want = PHYS.walkSpeed * 0.55;
      this.body.velocity.x = dir.x * want;
      this.body.velocity.z = dir.z * want;
    }
    this.crouching = false;
    this.pitch *= 1 - Math.min(1, dt * 3);
  }

  _engage(dt, dist, hooks) {
    const to = this.target.position.clone();
    to.y += this.target.height * 0.62;
    const from = this.eye;
    const dir = to.clone().sub(from);
    const flat = new THREE.Vector3(dir.x, 0, dir.z);
    const flatLen = flat.length();
    this.yaw = smoothAngle(this.yaw, Math.atan2(dir.x, dir.z),
      dt * (5 + this.difficulty * 7));
    this.pitch += (Math.atan2(dir.y, flatLen) - this.pitch)
      * Math.min(1, dt * 7);

    // Hold a working distance: close if far, back off if too close.
    const ideal = this.weapon.range * 0.45;
    const move = new THREE.Vector3();
    if (dist > ideal * 1.3) {
      move.copy(flat).normalize();
    } else if (dist < ideal * 0.45) {
      move.copy(flat).normalize().negate();
    }
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 0.8 + Math.random() * 1.4;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    const side = new THREE.Vector3(flat.z, 0, -flat.x).normalize();
    move.addScaledVector(side, this.strafeDir * 0.8);
    if (move.lengthSq() > 0) move.normalize();

    const want = PHYS.walkSpeed * (0.6 + this.difficulty * 0.35);
    this.body.velocity.x = move.x * want;
    this.body.velocity.z = move.z * want;

    // Crouch at range to steady the shot; stay up in a close fight.
    this.crouching = dist > 28 && Math.random() < 0.02 ? true : this.crouching;
    if (dist < 12) this.crouching = false;
    this.body.height = this.crouching ? PHYS.crouchHeight : PHYS.standHeight;
    this.height = this.body.height;

    if (this.reactTimer > 0) {
      this.reactTimer -= dt;
      return;
    }
    if (this.magazine <= 0) {
      if (this.reloadTimer <= 0) {
        this.reloadTimer = this.weapon.reloadSeconds;
        this.soldier.playOverlay(ANIM.RELOAD, this.weapon.reloadSeconds);
      }
      return;
    }
    if (this.reloadTimer > 0) return;
    if (dist > this.weapon.range * 1.1) return;

    if (this.fireCooldown <= 0) {
      const interval = 60 / this.weapon.rpm;
      this.fireCooldown = interval;
      if (this.burst <= 0) {
        // Fire in bursts with a pause, so a firefight has rhythm.
        this.burst = 3 + Math.floor(Math.random() * 4);
        this.fireCooldown = 0.35 + (1 - this.difficulty) * 0.7;
        return;
      }
      this.burst--;
      this.magazine--;
      this.soldier.playOverlay(ANIM.FIRE, 0.12);

      const aim = to.clone().sub(from).normalize();
      // Accuracy is the difficulty dial: spread shrinks as skill rises.
      const spread = this.weapon.spread * (2.6 - this.difficulty * 2.0);
      aim.x += (Math.random() - 0.5) * spread * 2;
      aim.y += (Math.random() - 0.5) * spread * 2;
      aim.z += (Math.random() - 0.5) * spread * 2;
      aim.normalize();
      hooks.onShoot?.(from, aim, this.weapon, this);
    }
  }

  _animate(dt) {
    let state;
    if (!this.alive) state = ANIM.DEAD;
    else if (!this.body.onGround) state = ANIM.FALL;
    else if (this.speed < 0.25) state = this.crouching ? ANIM.CROUCH_IDLE : ANIM.IDLE;
    else if (this.crouching) state = ANIM.CROUCH_WALK;
    else if (this.speed > PHYS.walkSpeed * 1.2) state = ANIM.RUN;
    else state = ANIM.WALK;

    this.soldier.setState(state);
    this.soldier.place(this.body.position, this.yaw);
    this.soldier.update(dt, { speed: this.speed, aimPitch: this.pitch });
  }

  dispose(scene) {
    scene.remove(this.soldier.root);
    this.soldier.dispose();
  }
}

function smoothAngle(current, target, k) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * Math.min(1, k);
}

/** Names used for training bots, so the kill feed reads naturally. */
export const BOT_NAMES = [
  'Wardak', 'Toorpekai', 'Nangyal', 'Zarghuna', 'Khyber', 'Palwasha',
  'Sarwar', 'Gulalai', 'Hamid', 'Marjan', 'Rashid', 'Shaperai',
];

void COMBAT;
