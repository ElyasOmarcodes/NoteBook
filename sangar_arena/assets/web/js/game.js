import * as THREE from '../vendor/three.module.js';
import { ArenaMap, buildSky } from './world/map.js';
import { CollisionWorld, rayBody } from './systems/physics.js';
import { Effects } from './systems/effects.js';
import { AudioEngine } from './systems/audio.js';
import { TouchControls } from './systems/controls.js';
import { Hud } from './systems/hud.js';
import { LocalPlayer } from './entities/player.js';
import { RemotePlayer } from './entities/remote.js';
import { Bot, BOT_NAMES } from './entities/bot.js';
import { preloadSoldier } from './entities/soldier.js';
import { GrenadeSystem } from './entities/grenade.js';
import { QUALITY, COMBAT, MAP_SIZE, ANIM } from './config.js';

/**
 * Ties the whole engine together: scene, map, the local player, remote peers,
 * training bots, projectiles, HUD and the loop.
 *
 * All outbound traffic goes through `bridge.send`, which the Flutter side
 * picks up; all inbound commands arrive through `handle()`.
 */
export class Game {
  constructor(canvas, bridge) {
    this.canvas = canvas;
    this.bridge = bridge;
    this.running = false;
    this.paused = false;
    this.ready = false;

    this.settings = {
      quality: 'medium', shadows: true, postFx: true, showFps: false,
      renderScale: 1, sensitivity: 1, adsSensitivity: 0.6, invertY: false,
      autoFire: false, leftHanded: false, hudScale: 1,
      masterVolume: 0.9, sfxVolume: 1, musicVolume: 0.4, lang: 'ps',
    };
    this.quality = QUALITY.medium;

    this.remotes = new Map();
    this.bots = [];
    this.teamMode = true;
    this.matchSeconds = 600;
    this.matchRemaining = 600;
    this.selfStats = { kills: 0, deaths: 0 };
    this.teamScores = [0, 0];
    this.mode = 'multiplayer';   // multiplayer | training | freeroam

    this._clock = new THREE.Clock();
    this._accum = 0;
    this._netAccum = 0;
    this._firedSinceReport = 0;
    this._lastTime = 0;
  }

  // =======================================================================
  // boot
  // =======================================================================

  async boot(config) {
    this.config = config;
    Object.assign(this.settings, config.settings ?? {});
    this.quality = QUALITY[this.settings.quality] ?? QUALITY.medium;

    this._progress(0.03, 'Renderer');
    this._initRenderer();

    // The character mesh is a real rigged model; start fetching it now so the
    // world build overlaps the download instead of following it.
    const soldierReady = preloadSoldier().catch((e) => {
      console.error('soldier model failed to load', e);
      this.bridge.send({ t: 'error', message: `model: ${e}` });
    });

    this._progress(0.15, 'World');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const lights = buildSky(this.scene, this.quality);
    this.sun = lights.sun;

    this._progress(0.30, 'Sangar Chowk');
    this.map = new ArenaMap(this.quality).build();
    this.scene.add(this.map.group);
    this.world = new CollisionWorld(this.map);

    this._progress(0.62, 'Effects');
    this.effects = new Effects(this.scene, this.quality);
    this.audio = new AudioEngine();
    this.audio.applySettings(this.settings);
    this.grenades = new GrenadeSystem(
      this.scene, this.world, this.effects, this.audio);

    this._progress(0.75, 'Controls');
    this.hud = new Hud(document, STRINGS[this.settings.lang] ?? STRINGS.ps);
    this.hud.setHudScale(this.settings.hudScale);
    this.hud.setFpsVisible(this.settings.showFps);
    this.controls = new TouchControls(document, this.settings);
    this.controls.setLeftHanded(this.settings.leftHanded);

    this._progress(0.86, 'Soldiers');
    await soldierReady;

    this._progress(0.92, 'Deploying');
    this._spawnLocal(config);

    if (config.mode === 'training' || config.mode === 'freeroam') {
      this.mode = config.mode;
      this.teamMode = false;
      if (config.mode === 'training') this._spawnBots(config.botCount ?? 4);
    }

    this.teamMode = config.mode === 'multiplayer' && config.teamMode !== false;
    this.matchSeconds = config.durationSeconds ?? 600;
    this.matchRemaining = this.matchSeconds;

    window.addEventListener('resize', () => this._resize());
    this._resize();

    this._progress(1.0, 'Ready');
    this.ready = true;
    this.hud.show();
    this.hud.setSelf(config.name ?? 'Player');
    this.bridge.send({ t: 'ready' });
    this.start();
  }

  _progress(value, note) {
    const fill = document.getElementById('boot-fill');
    const text = document.getElementById('boot-note');
    if (fill) fill.style.width = `${Math.round(value * 100)}%`;
    if (text) text.textContent = note;
    if (value >= 1) {
      const boot = document.getElementById('boot');
      boot?.classList.add('gone');
      setTimeout(() => boot?.remove(), 600);
    }
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality.pixelRatio > 1,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(
      window.devicePixelRatio || 1,
      this.quality.pixelRatio * (this.settings.renderScale ?? 1)));
    this.renderer.shadowMap.enabled = this.settings.shadows
      && this.quality.shadowMap > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = this.settings.postFx
      ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.05;
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _spawnLocal(config) {
    this.player = new LocalPlayer(this.scene, this.world, this.map, this.camera, {
      id: config.id,
      name: config.name,
      team: config.team ?? 0,
      agent: config.agent,
      primary: config.primary,
      secondary: config.secondary,
      grenade: config.grenade,
      settings: this.settings,
    });
    this.player.spawn(this.map.pickSpawn(config.team ?? 0));
  }

  _spawnBots(count) {
    for (let i = 0; i < count; i++) {
      const agent = this.config.agentPool?.[i % (this.config.agentPool?.length || 1)]
        ?? this.config.agent;
      const bot = new Bot(this.scene, this.world, this.map, {
        id: `bot${i}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        agent,
        team: 1,
        primary: this.config.botWeapon ?? this.config.primary,
        difficulty: this.config.botDifficulty ?? 0.5,
      });
      bot.spawn(this.map.pickSpawn(1, [this.player.body.position]));
      this.bots.push(bot);
    }
  }

  // =======================================================================
  // loop
  // =======================================================================

  start() {
    if (this.running) return;
    this.running = true;
    this._clock.start();
    this._lastTime = performance.now();
    const step = (now) => {
      if (!this.running) return;
      requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - this._lastTime) / 1000);
      this._lastTime = now;
      if (!this.paused) this.tick(dt);
    };
    requestAnimationFrame(step);
  }

  stop() { this.running = false; }

  tick(dt) {
    const input = this._readInput();

    this.player.update(dt, input, this._playerHooks());

    for (const bot of this.bots) {
      bot.update(dt, this._botTargets(), { onShoot: (o, d, w, b) => this._botShot(o, d, w, b) });
    }

    const now = performance.now();
    for (const r of this.remotes.values()) {
      r.update(dt, now);
      r.faceLabel(this.camera);
    }

    this.grenades.update(dt, (pos, def, ownerId) => this._blast(pos, def, ownerId));
    this.effects.update(dt);
    this.effects.faceCamera(this.camera);

    // The shadow camera follows the player so the map's shadow budget is spent
    // where it is actually visible.
    if (this.sun?.castShadow) {
      const p = this.player.body.position;
      this.sun.position.set(p.x + 72, 120, p.z + 46);
      this.sun.target.position.set(p.x, 0, p.z);
      this.sun.target.updateMatrixWorld();
    }

    this._clock.getDelta();
    if (this.matchRunning) {
      this.matchRemaining = Math.max(0, this.matchRemaining - dt);
    }

    this._updateHud(dt);
    this._reportState(dt);

    this.controls.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  _readInput() {
    const adsFactor = this.player?.scoped
      ? 1 : (this.player?.ads ? 0.5 : 0);
    this.controls.consumeLook(adsFactor);
    // Auto fire keeps the trigger down whenever the reticle is on a target.
    if (this.settings.autoFire && this._reticleOnEnemy()) {
      this.controls.buttons.fire = true;
    }
    return this.controls;
  }

  _reticleOnEnemy() {
    if (!this.player?.alive) return false;
    const origin = this.player.eye.clone();
    const dir = this.player.aimDirection(origin);
    const target = this._traceActors(origin, dir, 90);
    return !!target;
  }

  _playerHooks() {
    return {
      onFire: (shot) => this._playerFire(shot),
      onDryFire: () => this.audio.dryFire(),
      onReloadStart: () => {
        this.audio.mechanical('magOut');
        setTimeout(() => this.audio.mechanical('magIn'), 700);
        setTimeout(() => this.audio.mechanical('bolt'), 1200);
      },
      onSwap: () => this.audio.mechanical('bolt'),
      onScope: () => this.audio.mechanical('click'),
      onMelee: (origin, dir) => this._melee(origin, dir),
      onThrow: (origin, dir, def) => {
        this.grenades.throwGrenade(origin, dir, def, this.player.id);
        this.bridge.send({
          t: 'nade',
          x: origin.x, y: origin.y, z: origin.z,
          dx: dir.x, dy: dir.y, dz: dir.z,
          k: def.id,
        });
      },
      onFootstep: (surface, running) =>
        this.audio.footstep(surface, 0, running),
      onResupply: () => this.audio.pickup(),
      onFallDamage: (amount) => this._selfDamage(amount, null, 'fall'),
      onStanceChange: () => this.audio.mechanical('click'),
    };
  }

  // =======================================================================
  // shooting
  // =======================================================================

  _playerFire({ shots, weapon, muzzle, origin }) {
    this.audio.shot(weapon, 0);
    const dir0 = shots[0];
    this.effects.muzzleFlash(muzzle, dir0, weapon.kind === 'shotgun' ? 1.4 : 1);
    const right = new THREE.Vector3(dir0.z, 0, -dir0.x).normalize();
    this.effects.ejectCasing(muzzle, right, new THREE.Vector3(0, 1, 0));
    this._firedSinceReport += 1;

    for (const dir of shots) {
      const hit = this._trace(origin, dir, weapon.range * 1.6, weapon);
      const end = hit ? hit.point
        : origin.clone().addScaledVector(dir, weapon.range * 1.4);
      this.effects.tracer(muzzle, end);

      if (!hit) continue;
      if (hit.actor) {
        const zone = hit.zone;
        const mult = zone === 'head' ? COMBAT.headMultiplier
          : zone === 'limb' ? COMBAT.limbMultiplier : COMBAT.torsoMultiplier;
        // Range falloff: past the weapon's rated range damage tails off fast.
        const over = Math.max(0, hit.distance - weapon.range);
        const falloff = Math.max(0.35, 1 - over / (weapon.range * 0.8));
        const damage = weapon.damage * mult * falloff;

        this.effects.blood(hit.point, dir);
        this.hud.hitMarker();
        this.audio.hitMarker();
        this._damageActor(hit.actor, damage, dir, weapon, zone === 'head');
      } else {
        this.effects.impact(hit.point, hit.normal, hit.surface);
        this.audio.impact(hit.distance);
      }
    }
  }

  _botShot(origin, dir, weapon, bot) {
    this.audio.shot(weapon, origin.distanceTo(this.player.eye));
    this.effects.muzzleFlash(origin, dir, 0.9);
    const hit = this._trace(origin, dir, weapon.range * 1.5, weapon, bot);
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, weapon.range);
    this.effects.tracer(origin, end);
    if (!hit) return;
    if (hit.actor === this.player) {
      const mult = hit.zone === 'head' ? COMBAT.headMultiplier
        : hit.zone === 'limb' ? COMBAT.limbMultiplier : 1;
      this._selfDamage(weapon.damage * mult, dir, bot.name);
      this.effects.blood(hit.point, dir);
    } else if (hit.actor) {
      this.effects.blood(hit.point, dir);
    } else {
      this.effects.impact(hit.point, hit.normal, hit.surface);
      this.audio.impact(origin.distanceTo(this.player.eye));
    }
  }

  /** Ray against the world and every actor; returns the nearest. */
  _trace(origin, dir, maxDist, weapon, shooter = null) {
    const worldHit = this.world.raycast(origin, dir, maxDist);
    const limit = worldHit ? worldHit.distance : maxDist;
    const actorHit = this._traceActors(origin, dir, limit, shooter);
    if (actorHit) return actorHit;
    if (worldHit) {
      return {
        point: worldHit.point,
        normal: worldHit.normal,
        distance: worldHit.distance,
        surface: 'concrete',
        actor: null,
      };
    }
    void weapon;
    return null;
  }

  _traceActors(origin, dir, maxDist, shooter = null) {
    let best = null;
    const consider = (actor, pos, height, radius) => {
      if (actor === shooter) return;
      if (!actor.alive) return;
      const hit = rayBody(origin, dir, pos, height ?? 1.78, radius ?? 0.34);
      if (!hit || hit.t < 0 || hit.t > maxDist) return;
      if (best && hit.t >= best.distance) return;
      best = {
        actor, zone: hit.zone, distance: hit.t,
        point: origin.clone().addScaledVector(dir, hit.t),
        normal: dir.clone().negate(),
        surface: 'body',
      };
    };

    for (const r of this.remotes.values()) {
      if (this.teamMode && r.team === this.player.team && shooter === null) continue;
      consider(r, r.position, r.height, r.radius);
    }
    for (const b of this.bots) {
      consider(b, b.body.position, b.body.height, b.body.radius);
    }
    if (shooter && shooter !== this.player) {
      consider(this.player, this.player.body.position,
        this.player.body.height, this.player.body.radius);
    }
    return best;
  }

  _melee(origin, dir) {
    this.audio.mechanical('bolt');
    const hit = this._traceActors(origin, dir, COMBAT.meleeRange);
    if (!hit) return;
    this.effects.blood(hit.point, dir);
    this.hud.hitMarker();
    this.audio.hitMarker();
    this._damageActor(hit.actor, COMBAT.meleeDamage, dir,
      { id: 'melee', damage: COMBAT.meleeDamage }, false);
  }

  _damageActor(actor, damage, direction, weapon, headshot) {
    if (actor instanceof RemotePlayer) {
      // Peers are authoritative about their own health: report and let the
      // host resolve it.
      this.bridge.send({
        t: 'hit',
        target: actor.id,
        dmg: damage,
        weapon: weapon.id,
        head: headshot,
        dir: [direction.x, direction.y, direction.z],
      });
      return;
    }
    if (actor instanceof Bot) {
      const killed = actor.takeDamage(damage, direction);
      if (killed) {
        this.selfStats.kills++;
        this.bridge.send({
          t: 'soloKill', victim: actor.name, head: headshot,
        });
        this.hud.killToast({
          killerName: this.player.name,
          victimName: actor.name,
          headshot,
          killerTeam: this.player.team,
          victimTeam: actor.team,
          selfName: this.player.name,
        });
      }
    }
  }

  _selfDamage(amount, direction, sourceName) {
    if (!this.player.alive) return;
    const killed = this.player.takeDamage(amount, direction);
    this.audio.hurt();
    this.hud.damageFlash();
    if (killed) {
      this.selfStats.deaths++;
      this.bridge.send({ t: 'soloDeath', killer: sourceName ?? '?' });
      this._beginRespawn(sourceName);
    }
  }

  _beginRespawn(killerName) {
    // Two deaths can be reported for the same life — a fall and an incoming
    // damage message in the same frame, say — and two live countdowns would
    // respawn the player twice, the second time out from under them.
    if (this._respawnTimer) clearInterval(this._respawnTimer);
    const delay = this.config.respawnSeconds ?? 5;
    this.player.respawnIn = delay;
    this.hud.showRespawn(
      killerName ? `${killerName}` : '', delay);
    const tick = setInterval(() => {
      this.player.respawnIn -= 0.25;
      if (this.player.respawnIn <= 0) {
        clearInterval(tick);
        this._respawnTimer = null;
        this.hud.hideRespawn();
        const threats = [
          ...Array.from(this.remotes.values()).map((r) => r.position),
          ...this.bots.map((b) => b.body.position),
        ];
        this.player.spawn(this.map.pickSpawn(this.player.team, threats));
      } else {
        this.hud.showRespawn(killerName ?? '', this.player.respawnIn);
      }
    }, 250);
    this._respawnTimer = tick;
  }

  /** Stops a pending respawn — the match ended, or the player left. */
  _cancelRespawn() {
    if (this._respawnTimer) {
      clearInterval(this._respawnTimer);
      this._respawnTimer = null;
    }
    this.hud.hideRespawn();
  }

  _blast(position, def, ownerId) {
    const targets = [
      ...Array.from(this.remotes.values()),
      ...this.bots,
      this.player,
    ];
    const results = this.grenades.applyBlast(position, def, targets, this.world);
    for (const r of results) {
      if (r.target === this.player) {
        if (def.id === 'flash') {
          this.hud.flashbang(3.4 * (1 - r.distance / def.radius));
        } else if (def.damage > 0) {
          this._selfDamage(r.damage, r.direction, 'Grenade');
        }
      } else if (ownerId === this.player.id && def.damage > 0) {
        this._damageActor(r.target, r.damage, r.direction,
          { id: def.id, damage: def.damage }, false);
      }
    }
  }

  _botTargets() {
    const list = [{
      position: this.player.body.position,
      team: this.player.team,
      alive: this.player.alive,
      height: this.player.body.height,
    }];
    for (const r of this.remotes.values()) {
      list.push({
        position: r.position, team: r.team, alive: r.alive, height: r.height,
      });
    }
    return list;
  }

  // =======================================================================
  // HUD + reporting
  // =======================================================================

  _updateHud(dt) {
    const p = this.player;
    this.hud.setHealth(p.hp);
    this.hud.setAmmo(p.clip.mag, p.clip.reserve,
      this.settings.lang === 'ps' ? (p.weapon.namePs ?? p.weapon.id) : p.weapon.nameEn ?? p.weapon.id);
    this.hud.setGrenades(p.grenades);
    this.hud.setScopeAvailable(true);
    this.hud.setScope(p.scoped);
    this.hud.setSpread(Math.min(1, p.currentSpread() / 0.12));
    this.hud.setStats(this.selfStats.kills, this.selfStats.deaths);
    this.hud.setTeamScores(this.teamScores[0], this.teamScores[1], this.teamMode);
    this.hud.setClock(this.matchRemaining);
    this.hud.tickFps(dt);

    // Context prompt for ladders and ammo crates.
    let prompt = '';
    const strings = STRINGS[this.settings.lang] ?? STRINGS.ps;
    if (p.onLadder) prompt = strings.climb;
    else if (p.nearCrate) prompt = strings.resupply;
    this.hud.setPrompt(prompt);

    const others = [];
    for (const r of this.remotes.values()) {
      if (!r.alive) continue;
      others.push({ x: r.position.x, z: r.position.z, team: r.team });
    }
    for (const b of this.bots) {
      if (!b.alive) continue;
      others.push({ x: b.body.position.x, z: b.body.position.z, team: b.team });
    }
    this.hud.drawMinimap({
      mapSize: MAP_SIZE,
      self: p.body.position,
      yaw: p.yaw,
      others,
      places: this.map.places,
      teamMode: this.teamMode,
    });
  }

  _reportState(dt) {
    this._netAccum += dt;
    if (this._netAccum < 0.05) return;
    this._netAccum = 0;
    this.bridge.send({
      t: 'state',
      s: this.player.netState(),
      fired: this._firedSinceReport,
      hp: Math.round(this.player.hp),
      kills: this.selfStats.kills,
      deaths: this.selfStats.deaths,
    });
    this._firedSinceReport = 0;
  }

  // =======================================================================
  // inbound commands from Flutter
  // =======================================================================

  handle(msg) {
    switch (msg.t) {
      case 'settings':
        this.applySettings(msg.settings ?? {});
        break;
      case 'pause':
        this.paused = !!msg.value;
        break;
      case 'resumeAudio':
        this.audio.resume();
        break;
      case 'snap':
        this._applySnapshot(msg);
        break;
      case 'roster':
        this._applyRoster(msg.players ?? []);
        break;
      case 'dmg':
        this._applyRemoteDamage(msg);
        break;
      case 'respawn':
        this.player.setHealth(msg.hp ?? 100);
        break;
      case 'kill':
        this._applyKill(msg);
        break;
      case 'nade':
        this._applyRemoteGrenade(msg);
        break;
      case 'clock':
        this.matchRemaining = msg.seconds ?? this.matchRemaining;
        this.matchRunning = msg.running !== false;
        break;
      case 'scores':
        this.teamScores = msg.scores ?? this.teamScores;
        break;
      case 'thirdPerson':
        this.player.setThirdPerson(!!msg.value);
        break;
      case 'teleport':
        // Used by free-roam mode to drop the player at a chosen callout, and
        // by the automated map tour.
        this.player.body.position.set(msg.x ?? 0, msg.y ?? 1.2, msg.z ?? 0);
        this.player.body.velocity.set(0, 0, 0);
        if (msg.yaw !== undefined) this.player.yaw = msg.yaw;
        if (msg.pitch !== undefined) this.player.pitch = msg.pitch;
        break;
      case 'end':
        this._cancelRespawn();
        this.paused = true;
        break;
      default:
        break;
    }
  }

  applySettings(next) {
    Object.assign(this.settings, next);
    this.audio.applySettings(this.settings);
    this.hud.setHudScale(this.settings.hudScale ?? 1);
    this.hud.setFpsVisible(!!this.settings.showFps);
    this.hud.setStrings(STRINGS[this.settings.lang] ?? STRINGS.ps);
    this.controls.setLeftHanded(!!this.settings.leftHanded);
    const q = QUALITY[this.settings.quality] ?? QUALITY.medium;
    this.quality = q;
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(
        window.devicePixelRatio || 1,
        q.pixelRatio * (this.settings.renderScale ?? 1)));
      this.renderer.shadowMap.enabled = !!this.settings.shadows && q.shadowMap > 0;
      this.renderer.toneMapping = this.settings.postFx
        ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    }
    if (this.scene?.fog) this.scene.fog.far = q.fog;
  }

  _applyRoster(players) {
    const seen = new Set();
    for (const p of players) {
      if (p.id === this.config.id) continue;
      seen.add(p.id);
      if (!this.remotes.has(p.id)) {
        this.remotes.set(p.id, new RemotePlayer(this.scene, {
          id: p.id, name: p.name, agent: p.agent, team: p.team,
          primary: p.primary, secondary: p.secondary,
        }));
      } else {
        this.remotes.get(p.id).team = p.team;
      }
    }
    for (const [id, r] of Array.from(this.remotes.entries())) {
      if (!seen.has(id)) {
        r.dispose(this.scene);
        this.remotes.delete(id);
      }
    }
  }

  _applySnapshot(msg) {
    const now = performance.now();
    for (const s of msg.p ?? []) {
      if (s.id === this.config.id) continue;
      const r = this.remotes.get(s.id);
      if (!r) continue;
      r.push(s, now);
      r.team = s.team ?? r.team;
    }
  }

  _applyRemoteDamage(msg) {
    const dir = msg.dir
      ? new THREE.Vector3(msg.dir[0], msg.dir[1], msg.dir[2]) : null;
    const hp = msg.hp ?? this.player.hp;
    const lost = this.player.hp - hp;
    this.player.setHealth(hp);
    if (lost > 0) {
      this.audio.hurt();
      this.hud.damageFlash();
    }
    if (hp <= 0) {
      this.selfStats.deaths++;
      this._beginRespawn(msg.fromName);
    }
    void dir;
  }

  _applyKill(msg) {
    this.hud.killToast({
      killerName: msg.killerName,
      victimName: msg.victimName,
      headshot: !!msg.headshot,
      killerTeam: msg.killerTeam ?? 0,
      victimTeam: msg.victimTeam ?? 1,
      selfName: this.config.name,
    });
    if (msg.killerId === this.config.id) this.selfStats.kills++;
    if (this.teamMode) {
      const t = msg.killerTeam ?? 0;
      this.teamScores[t] = (this.teamScores[t] ?? 0) + 1;
    }
    const victim = this.remotes.get(msg.victimId);
    if (victim) victim.soldier.setState(ANIM.DEAD);
  }

  _applyRemoteGrenade(msg) {
    const origin = new THREE.Vector3(msg.x, msg.y, msg.z);
    const dir = new THREE.Vector3(msg.dx, msg.dy, msg.dz);
    const def = GRENADE_DEFS[msg.k] ?? GRENADE_DEFS.frag;
    this.grenades.throwGrenade(origin, dir, def, msg.from ?? 'peer');
  }

  dispose() {
    this.stop();
    this._cancelRespawn();
    for (const r of this.remotes.values()) r.dispose(this.scene);
    for (const b of this.bots) b.dispose(this.scene);
    this.player?.dispose();
    this.renderer?.dispose();
  }
}

/** Fallback grenade stats for peer-thrown grenades. */
const GRENADE_DEFS = {
  frag: { id: 'frag', damage: 110, radius: 7, fuse: 3, count: 2 },
  flash: { id: 'flash', damage: 0, radius: 12, fuse: 2, count: 2 },
  smoke: { id: 'smoke', damage: 0, radius: 9, fuse: 1.5, count: 2 },
};

/** In-world strings the engine needs without a round trip to Flutter. */
const STRINGS = {
  ps: {
    eliminated: 'وویشت',
    climb: 'د پورته کېدو لپاره مخ ته حرکت وکړئ',
    resupply: 'د مرمیو د ډکولو لپاره ودرېږئ',
  },
  en: {
    eliminated: 'eliminated',
    climb: 'Push forward to climb',
    resupply: 'Stand still to resupply',
  },
};
