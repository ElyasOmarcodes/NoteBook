import * as THREE from '../../vendor/three.module.js';
import { ANIM, PHYS, COMBAT } from '../config.js';
import { Soldier } from './soldier.js';
import { equipOnSoldier, ViewModel } from './weapons.js';

/**
 * The soldier this device controls.
 *
 * Holds the movement state machine (stand / crouch / prone / sprint / sneak /
 * jump / ladder / step-up), the two-weapon loadout with its firing, reloading
 * and optics, grenades, melee, ammo resupply, and the camera that rides on top
 * of all of it.
 */
export class LocalPlayer {
  constructor(scene, world, map, camera, opts) {
    this.scene = scene;
    this.world = world;
    this.map = map;
    this.camera = camera;

    this.id = opts.id;
    this.name = opts.name;
    this.team = opts.team ?? 0;
    this.agent = opts.agent;
    this.settings = opts.settings ?? {};

    // Two weapons carried at once; index 0 is primary, 1 is secondary.
    this.weapons = [opts.primary, opts.secondary];
    this.held = 0;
    this.ammo = this.weapons.map((w) => ({
      mag: w.magazine,
      reserve: w.reserve,
    }));
    this.grenadeDef = opts.grenade;
    this.grenades = opts.grenade?.count ?? 2;

    this.body = {
      position: new THREE.Vector3(0, 1, 0),
      velocity: new THREE.Vector3(),
      height: PHYS.standHeight,
      radius: PHYS.playerRadius,
      onGround: true,
      groundY: 0,
      stepping: 0,
    };

    this.yaw = 0;
    this.pitch = 0;
    this.stance = 'stand';        // stand | crouch | prone
    this.sprinting = false;
    this.sneaking = false;
    this.ads = false;
    this.scoped = false;
    this.onLadder = null;
    this.hp = 100;
    this.alive = true;
    this.spawnProtection = 0;
    this.respawnIn = 0;

    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.meleeTimer = 0;
    this.resupplyTimer = 0;
    this.shotsThisFrame = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.airTimeStart = null;
    this.fallStartY = null;

    // A third-person body so other things (shadows, a chase camera, the lobby
    // preview) have something to draw, hidden from the first-person view.
    this.soldier = new Soldier(this.agent, this.team, { firstPerson: true });
    equipOnSoldier(this.soldier, this.weapons[0], this.weapons[1]);
    scene.add(this.soldier.root);

    this.viewModel = new ViewModel(camera);
    this.viewModel.setWeapon(this.weapons[0]);

    this.thirdPerson = false;
    this._applyBodyVisibility();

    this._tmpDir = new THREE.Vector3();
    this._tmpV = new THREE.Vector3();
  }

  // =======================================================================
  // accessors
  // =======================================================================

  get weapon() { return this.weapons[this.held]; }
  /** Feet position. Kept as a getter so blast and AI code can treat the local
   *  player, remote peers and bots through one interface. */
  get position() { return this.body.position; }
  get height() { return this.body.height; }
  get clip() { return this.ammo[this.held]; }
  get eyeHeight() { return this.body.height + PHYS.eyeOffset; }

  get eye() {
    return this._tmpV.set(
      this.body.position.x,
      this.body.position.y + this.eyeHeight,
      this.body.position.z);
  }

  get speed() {
    return Math.hypot(this.body.velocity.x, this.body.velocity.z);
  }

  /** Compact snapshot sent to peers ~20x a second. */
  netState() {
    return {
      x: round2(this.body.position.x),
      y: round2(this.body.position.y),
      z: round2(this.body.position.z),
      yaw: round3(this.yaw),
      pitch: round3(this.pitch),
      st: this.soldier.state,
      w: this.held,
      hp: Math.round(this.hp),
    };
  }

  lookDirection(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cp).normalize();
  }

  // =======================================================================
  // spawning / damage
  // =======================================================================

  spawn(position) {
    this.body.position.copy(position);
    this.body.velocity.set(0, 0, 0);
    this.body.onGround = true;
    this.hp = 100;
    this.alive = true;
    this.stance = 'stand';
    this.body.height = PHYS.standHeight;
    this.spawnProtection = COMBAT.respawnProtection;
    this.respawnIn = 0;
    this.ads = false;
    this.scoped = false;
    this.reloadTimer = 0;
    this.soldier.setState(ANIM.IDLE);
    this._applyBodyVisibility();
    for (let i = 0; i < this.ammo.length; i++) {
      this.ammo[i].mag = this.weapons[i].magazine;
      this.ammo[i].reserve = this.weapons[i].reserve;
    }
    this.grenades = this.grenadeDef?.count ?? 2;
  }

  /** @returns {boolean} true if this killed the player */
  takeDamage(amount, direction) {
    if (!this.alive || this.spawnProtection > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHitDirection = direction ?? null;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.ads = false;
    this.scoped = false;
    this.body.velocity.set(0, 0, 0);
    this.soldier.setState(ANIM.DEAD);
    this.soldier.setVisible(true);
    this.thirdPersonOnDeath = true;
  }

  setHealth(hp) {
    this.hp = hp;
    if (hp <= 0 && this.alive) this.die();
  }

  // =======================================================================
  // per-frame
  // =======================================================================

  /**
   * @param {number} dt
   * @param {object} input from TouchControls
   * @param {object} hooks { onFire, onReloadStart, onMelee, onThrow, onFootstep,
   *                         onResupply, onStanceChange }
   */
  update(dt, input, hooks = {}) {
    this.shotsThisFrame = 0;
    if (this.spawnProtection > 0) this.spawnProtection -= dt;

    if (!this.alive) {
      this._updateDead(dt);
      return;
    }

    this._look(dt, input);
    this._stance(dt, input, hooks);
    this._movement(dt, input, hooks);
    this._weapons(dt, input, hooks);
    this._animate(dt, hooks);
    this._camera(dt);
  }

  _updateDead(dt) {
    this.soldier.place(this.body.position, this.yaw);
    this.soldier.setState(ANIM.DEAD);
    this.soldier.update(dt, { speed: 0 });
    // Ease into a short death-cam looking down at the body.
    const target = this.body.position.clone();
    target.y += 1.1;
    const back = new THREE.Vector3(
      -Math.sin(this.yaw), 0.9, -Math.cos(this.yaw)).multiplyScalar(3.2);
    this.camera.position.lerp(target.clone().add(back), Math.min(1, dt * 3));
    this.camera.lookAt(target);
  }

  _look(dt, input) {
    const look = input.look;
    this.yaw -= look.x;
    this.pitch -= look.y;

    // Recoil pushes the view, then recovers most (not all) of the way back.
    this.pitch += this.recoilPitch * dt * 14;
    this.yaw += this.recoilYaw * dt * 14;
    this.recoilPitch *= Math.exp(-dt * 9);
    this.recoilYaw *= Math.exp(-dt * 9);

    const limit = this.stance === 'prone' ? 0.85 : 1.45;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);
    while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  _stance(dt, input, hooks) {
    if (input.consumePress?.('crouch')) {
      this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
      hooks.onStanceChange?.(this.stance);
    }
    if (input.consumePress?.('prone')) {
      this.stance = this.stance === 'prone' ? 'stand' : 'prone';
      hooks.onStanceChange?.(this.stance);
    }

    const targetHeight = {
      stand: PHYS.standHeight,
      crouch: PHYS.crouchHeight,
      prone: PHYS.proneHeight,
    }[this.stance];

    // Standing up needs headroom; if the ceiling is low, stay down.
    if (targetHeight > this.body.height) {
      const clear = this.world._clearAt(
        this.body.position.x, this.body.position.y,
        this.body.position.z, this.body.radius, targetHeight);
      if (!clear) return;
    }
    this.body.height += (targetHeight - this.body.height) * Math.min(1, dt * 9);
  }

  _movement(dt, input, hooks) {
    const body = this.body;

    // ---- ladders ----
    const ladder = this.world.ladderAt(
      body.position.x, body.position.y, body.position.z);
    const wantsClimb = ladder && (input.move.y > 0.2 || input.move.y < -0.2
      || this.onLadder);
    if (ladder && wantsClimb) {
      this.onLadder = ladder;
      body.velocity.set(0, 0, 0);
      const climb = input.move.y * PHYS.climbSpeed;
      body.position.y += climb * dt;
      // Hug the rails so you cannot drift off sideways mid-climb.
      body.position.x += (ladder.x - body.position.x) * Math.min(1, dt * 6);
      body.position.z += (ladder.z - body.position.z) * Math.min(1, dt * 6);
      body.position.y = THREE.MathUtils.clamp(
        body.position.y, ladder.minY, ladder.maxY);
      body.onGround = false;
      this.soldier.setState(ANIM.CLIMB);
      this.soldier.phase += Math.abs(climb) * dt * 0.9;
      if (input.consumePress?.('jump') || body.position.y >= ladder.maxY - 0.05) {
        // Step off at the top onto the roof.
        this.onLadder = null;
        body.position.x += Math.sin(this.yaw) * 0.7;
        body.position.z += Math.cos(this.yaw) * 0.7;
        body.velocity.y = 1.6;
      }
      return;
    }
    this.onLadder = null;

    // ---- ground movement ----
    const forward = this._tmpDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    let maxSpeed;
    this.sprinting = input.running && this.stance === 'stand'
      && input.move.y > 0.4 && !this.ads;
    this.sneaking = input.sneaking && this.stance === 'stand';

    if (this.stance === 'prone') maxSpeed = PHYS.proneSpeed;
    else if (this.stance === 'crouch') maxSpeed = PHYS.crouchSpeed;
    else if (this.sprinting) maxSpeed = PHYS.runSpeed;
    else if (this.sneaking) maxSpeed = PHYS.sneakSpeed;
    else maxSpeed = PHYS.walkSpeed;
    if (this.ads) maxSpeed *= 0.55;

    const wish = new THREE.Vector3()
      .addScaledVector(forward, input.move.y)
      .addScaledVector(right, -input.move.x);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.001) wish.normalize();

    const accel = body.onGround ? PHYS.accelGround : PHYS.accelAir;
    const control = body.onGround ? 1 : PHYS.airControl;
    const targetX = wish.x * maxSpeed * wishLen;
    const targetZ = wish.z * maxSpeed * wishLen;

    body.velocity.x += (targetX - body.velocity.x)
      * Math.min(1, accel * control * dt / Math.max(1, maxSpeed));
    body.velocity.z += (targetZ - body.velocity.z)
      * Math.min(1, accel * control * dt / Math.max(1, maxSpeed));

    if (body.onGround && wishLen < 0.02) {
      const drop = Math.exp(-PHYS.friction * dt);
      body.velocity.x *= drop;
      body.velocity.z *= drop;
    }

    // ---- jump ----
    if (input.consumePress?.('jump') && body.onGround
        && this.stance === 'stand') {
      body.velocity.y = PHYS.jumpVelocity;
      body.onGround = false;
      this.soldier.setState(ANIM.JUMP);
    }

    // ---- gravity + fall damage bookkeeping ----
    if (!body.onGround) {
      body.velocity.y -= PHYS.gravity * dt;
      body.velocity.y = Math.max(body.velocity.y, -PHYS.terminalFall);
      if (this.fallStartY === null) this.fallStartY = body.position.y;
      this.fallStartY = Math.max(this.fallStartY, body.position.y);
    }

    const wasAirborne = !body.onGround;
    body.stepping = Math.max(0, (body.stepping ?? 0) - dt);
    const beforeStepping = body.stepping;
    this.world.move(body, dt);

    if (body.stepping > beforeStepping) {
      // The sweep just stepped us over a ledge — play the mount.
      this.soldier.stepPhase = 0;
      this.soldier.setState(ANIM.STEP_UP);
      hooks.onFootstep?.('step');
    }

    if (wasAirborne && body.onGround) {
      const drop = (this.fallStartY ?? body.position.y) - body.position.y;
      this.fallStartY = null;
      if (drop > PHYS.maxFallSafe) {
        const damage = (drop - PHYS.maxFallSafe) * PHYS.fallDamagePerMetre;
        hooks.onFallDamage?.(Math.min(100, damage));
      }
      if (drop > 0.8) {
        this.soldier.setState(ANIM.LAND);
        this.soldier.landPhase = Math.max(0, 1 - Math.min(1, drop / 5));
        hooks.onFootstep?.('land');
      }
    }
    if (body.onGround) this.fallStartY = null;

    // Keep the player inside the yard.
    const bound = 105;
    body.position.x = THREE.MathUtils.clamp(body.position.x, -bound, bound);
    body.position.z = THREE.MathUtils.clamp(body.position.z, -bound, bound);
  }

  _weapons(dt, input, hooks) {
    this.fireTimer -= dt;
    this.meleeTimer -= dt;

    // ---- reload ----
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const clip = this.clip;
        const want = this.weapon.magazine - clip.mag;
        const take = Math.min(want, clip.reserve);
        clip.mag += take;
        clip.reserve -= take;
        hooks.onReloadEnd?.();
      }
    }

    // ---- resupply from an ammo crate ----
    const crate = this.world.ammoAt(
      this.body.position.x, this.body.position.y, this.body.position.z);
    this.nearCrate = crate;
    if (crate && this.resupplyTimer <= 0) {
      const needs = this.ammo.some((a, i) =>
        a.reserve < this.weapons[i].reserve);
      if (needs && (input.consumePress?.('use') || this.speed < 0.4)) {
        this.resupplyTimer = 1.1;
        this.soldier.playOverlay(ANIM.RESUPPLY, 1.1);
      }
    }
    if (this.resupplyTimer > 0) {
      this.resupplyTimer -= dt;
      if (this.resupplyTimer <= 0) {
        this.ammo.forEach((a, i) => { a.reserve = this.weapons[i].reserve; });
        if (this.grenadeDef) this.grenades = this.grenadeDef.count;
        hooks.onResupply?.();
      }
    }

    // ---- swap ----
    if (input.consumePress?.('swap') && this.reloadTimer <= 0) {
      this.held = this.held === 0 ? 1 : 0;
      this.viewModel.setWeapon(this.weapon);
      equipOnSoldier(this.soldier, this.weapon, this.weapons[1 - this.held]);
      this.ads = false;
      this.scoped = false;
      this.fireTimer = Math.max(this.fireTimer, 0.35);
      hooks.onSwap?.(this.weapon);
    }

    // ---- optics ----
    if (input.consumePress?.('scope')) {
      if (this.weapon.scope) {
        this.scoped = !this.scoped;
        this.ads = this.scoped;
      } else {
        this.ads = !this.ads;
      }
      hooks.onScope?.(this.scoped);
    }
    if (this.sprinting) { this.ads = false; this.scoped = false; }

    // ---- melee ----
    if (input.consumePress?.('melee') && this.meleeTimer <= 0) {
      this.meleeTimer = COMBAT.meleeCooldown;
      this.soldier.playOverlay(ANIM.MELEE, 0.55);
      hooks.onMelee?.(this.eye.clone(), this.lookDirection());
    }

    // ---- grenade ----
    if (input.consumePress?.('nade') && this.grenades > 0
        && this.meleeTimer <= 0) {
      this.grenades--;
      this.soldier.playOverlay(ANIM.MELEE, 0.45);
      const origin = this.eye.clone().addScaledVector(this.lookDirection(), 0.5);
      hooks.onThrow?.(origin, this.lookDirection().clone(), this.grenadeDef);
    }

    // ---- reload request ----
    if (input.consumePress?.('reload')) this.startReload(hooks);

    // ---- firing ----
    const wantsFire = input.buttons.fire || input.consumePress?.('tapFire');
    if (wantsFire && this.canFire()) {
      if (this.clip.mag <= 0) {
        hooks.onDryFire?.();
        this.startReload(hooks);
      } else {
        this._fire(hooks);
        if (!this.weapon.automatic) input.buttons.fire = false;
      }
    }
  }

  canFire() {
    return this.alive && this.fireTimer <= 0 && this.reloadTimer <= 0
      && this.meleeTimer <= 0 && this.resupplyTimer <= 0 && !this.sprinting
      && !this.onLadder;
  }

  startReload(hooks) {
    if (this.reloadTimer > 0) return;
    const clip = this.clip;
    if (clip.mag >= this.weapon.magazine || clip.reserve <= 0) return;
    this.reloadTimer = this.weapon.reloadSeconds;
    this.soldier.playOverlay(ANIM.RELOAD, this.weapon.reloadSeconds);
    this.ads = false;
    this.scoped = false;
    hooks.onReloadStart?.(this.weapon);
  }

  /** Current cone half-angle, in radians, given stance / movement / optics. */
  currentSpread() {
    let spread = this.weapon.spread;
    if (this.ads) spread *= COMBAT.adsSpreadMultiplier;
    else spread *= COMBAT.hipSpreadMultiplier;
    if (this.stance === 'crouch') spread *= COMBAT.crouchSpreadMultiplier;
    if (this.stance === 'prone') spread *= COMBAT.proneSpreadMultiplier;
    const moveFactor = Math.min(1, this.speed / PHYS.runSpeed);
    spread *= 1 + moveFactor * (COMBAT.moveSpreadMultiplier - 1);
    if (!this.body.onGround) spread *= 1.8;
    return spread;
  }

  _fire(hooks) {
    const weapon = this.weapon;
    this.fireTimer = 60 / weapon.rpm;
    this.clip.mag--;
    this.shotsThisFrame += 1;

    const origin = this.eye.clone();
    const base = this.lookDirection();
    const spread = this.currentSpread();

    const shots = [];
    for (let i = 0; i < (weapon.pellets ?? 1); i++) {
      const dir = base.clone();
      // Gaussian-ish cone: two uniform samples averaged, so the centre is dense.
      const a = Math.random() * Math.PI * 2;
      const r = (Math.random() + Math.random()) / 2 * spread;
      const right = new THREE.Vector3(base.z, 0, -base.x).normalize();
      const up = new THREE.Vector3().crossVectors(right, base).normalize();
      dir.addScaledVector(right, Math.cos(a) * r);
      dir.addScaledVector(up, Math.sin(a) * r);
      dir.normalize();
      shots.push(dir);
    }

    // Recoil: mostly up, with a per-shot horizontal wobble.
    const recoil = weapon.recoil * (this.ads ? 0.62 : 1)
      * (this.stance === 'prone' ? 0.45 : this.stance === 'crouch' ? 0.75 : 1);
    this.recoilPitch += recoil * 0.019;
    this.recoilYaw += (Math.random() - 0.5) * recoil * 0.014;
    this.viewModel.kick(recoil);

    hooks.onFire?.({
      origin, direction: base, shots, weapon,
      muzzle: this.viewModel.muzzleWorld,
    });
    this.soldier.playOverlay(ANIM.FIRE, 0.10);
  }

  _animate(dt, hooks) {
    const s = this.soldier;
    const speed = this.speed;

    // Only pick a locomotion state if a one-shot state is not mid-play.
    const busy = s.state === ANIM.LAND || s.state === ANIM.STEP_UP
      || s.state === ANIM.CLIMB;
    if (!busy) {
      let state;
      if (!this.body.onGround) {
        state = this.body.velocity.y > 0.5 ? ANIM.JUMP : ANIM.FALL;
      } else if (this.stance === 'prone') {
        state = speed > 0.15 ? ANIM.PRONE_CRAWL : ANIM.PRONE_IDLE;
      } else if (this.stance === 'crouch') {
        state = speed > 0.2 ? ANIM.CROUCH_WALK : ANIM.CROUCH_IDLE;
      } else if (speed > PHYS.walkSpeed * 1.15) {
        state = ANIM.RUN;
      } else if (this.sneaking && speed > 0.1) {
        state = ANIM.SNEAK;
      } else if (speed > 0.25) {
        state = ANIM.WALK;
      } else {
        state = ANIM.IDLE;
      }
      s.setState(state);
    }

    s.place(this.body.position, this.yaw);
    s.update(dt, { speed, aimPitch: this.pitch });

    if (s.footstepFired) {
      s.footstepFired = false;
      const onMetal = this.body.groundY > 3.5;
      hooks.onFootstep?.(onMetal ? 'metal' : 'concrete', this.sprinting);
    }

    this.viewModel.update(dt, {
      speed,
      sprinting: this.sprinting,
      ads: this.ads,
      reloading: this.reloadTimer > 0,
      lookDelta: { x: this.recoilYaw, y: this.recoilPitch },
    });
  }

  _camera(dt) {
    const eye = this.eye;
    if (this.thirdPerson) {
      const back = new THREE.Vector3(
        -Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const want = eye.clone().addScaledVector(back, 3.1);
      want.y += 0.55;
      // Do not let the chase camera clip through a wall behind the player.
      const dir = want.clone().sub(eye);
      const dist = dir.length();
      dir.normalize();
      const hit = this.world.raycast(eye, dir, dist);
      // Keep enough distance that the camera never ends up inside the head.
      if (hit) want.copy(eye).addScaledVector(dir, Math.max(1.35, hit.distance - 0.25));
      this.camera.position.lerp(want, Math.min(1, dt * 14));
    } else {
      this.camera.position.copy(eye);
    }
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + Math.PI;
    this.camera.rotation.x = -this.pitch;

    // Field of view narrows with optics, widens a touch when sprinting.
    const zoom = this.scoped ? (this.weapon.scopeZoom ?? 2)
      : this.ads ? 1.28 : 1;
    const targetFov = (this.sprinting ? 82 : 75) / zoom;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();

    this._applyBodyVisibility();
  }

  _applyBodyVisibility() {
    // In first person the world model would fill the screen, but it must still
    // cast a shadow, so hide it from the camera rather than from the light.
    // The root itself always stays visible — hiding it would take the shadow
    // with it — and only the meshes are toggled.
    const show = this.thirdPerson || !this.alive;
    this.soldier.root.visible = true;
    this.soldier.root.traverse((o) => {
      if (o.isMesh) {
        o.visible = show;
        o.castShadow = true;
      }
    });
    this.viewModel.holder.visible = !this.thirdPerson && this.alive;
  }

  setThirdPerson(on) {
    this.thirdPerson = on;
    this._applyBodyVisibility();
  }

  setLoadout({ primary, secondary, grenade }) {
    this.weapons = [primary, secondary];
    this.ammo = this.weapons.map((w) => ({ mag: w.magazine, reserve: w.reserve }));
    this.grenadeDef = grenade;
    this.grenades = grenade?.count ?? 2;
    this.held = 0;
    this.viewModel.setWeapon(primary);
    equipOnSoldier(this.soldier, primary, secondary);
  }

  dispose() {
    this.scene.remove(this.soldier.root);
    this.soldier.dispose();
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }
