import * as THREE from '../../vendor/three.module.js';
import { puffTexture, holeTexture } from '../world/textures.js';

/**
 * Pooled visual effects: tracers, muzzle flashes, impacts, blood, casings,
 * explosions, smoke and bullet-hole decals.
 *
 * Everything is preallocated. Spawning a bullet must never allocate, or the
 * garbage collector will stutter the frame the moment a firefight starts.
 */
export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.time = 0;

    const density = quality.particles;

    // ---- tracers: thin stretched quads, drawn additively ----
    this.tracerCount = Math.round(48 * density) || 24;
    this.tracers = [];
    const tracerGeo = new THREE.PlaneGeometry(1, 1);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd591, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < this.tracerCount; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }

    // ---- sprite pool for flashes, smoke, blood, sparks ----
    this.flashTex = puffTexture('255,246,214', '255,150,40');
    this.smokeTex = puffTexture('190,190,190', '90,90,90');
    this.bloodTex = puffTexture('190,40,32', '90,10,8');
    this.sparkTex = puffTexture('255,240,200', '255,180,60');

    this.spriteCount = Math.round(120 * density) || 60;
    this.sprites = [];
    for (let i = 0; i < this.spriteCount; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.flashTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(material);
      s.visible = false;
      s.frustumCulled = false;
      scene.add(s);
      this.sprites.push({
        sprite: s, life: 0, maxLife: 1,
        vel: new THREE.Vector3(), size0: 1, size1: 1,
        gravity: 0, fade: 1, spin: 0,
      });
    }

    // ---- decals ----
    this.decalTex = holeTexture();
    this.decalMax = quality.decals;
    this.decals = [];
    this.decalIndex = 0;
    const decalGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const decalMat = new THREE.MeshBasicMaterial({
      map: this.decalTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    for (let i = 0; i < this.decalMax; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat.clone());
      m.visible = false;
      scene.add(m);
      this.decals.push({ mesh: m, life: 0 });
    }

    // ---- brass ----
    this.casingCount = Math.round(24 * density) || 12;
    this.casings = [];
    const casingGeo = new THREE.CylinderGeometry(0.008, 0.009, 0.032, 6);
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xc9a227, roughness: 0.35, metalness: 0.9,
    });
    for (let i = 0; i < this.casingCount; i++) {
      const m = new THREE.Mesh(casingGeo, casingMat);
      m.visible = false;
      scene.add(m);
      this.casings.push({
        mesh: m, life: 0,
        vel: new THREE.Vector3(), spin: new THREE.Vector3(),
      });
    }

    // ---- muzzle light (one, reused; a light per shot is far too expensive) ----
    this.muzzleLight = new THREE.PointLight(0xffbb66, 0, 9, 2);
    scene.add(this.muzzleLight);
    this.muzzleLightLife = 0;

    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  _freeSprite() {
    for (let i = 0; i < this.sprites.length; i++) {
      const idx = (this._spriteCursor = (this._spriteCursor + 1) % this.sprites.length);
      if (this.sprites[idx].life <= 0) return this.sprites[idx];
    }
    // All busy: steal the oldest.
    return this.sprites[0];
  }
  _spriteCursor = 0;

  _emit(tex, pos, opts) {
    const s = this._freeSprite();
    s.sprite.material.map = tex;
    s.sprite.material.blending = opts.additive === false
      ? THREE.NormalBlending : THREE.AdditiveBlending;
    s.opacity0 = opts.opacity ?? 1;
    s.sprite.material.opacity = s.opacity0;
    s.sprite.material.color.setHex(opts.color ?? 0xffffff);
    s.sprite.material.needsUpdate = true;
    s.sprite.position.copy(pos);
    s.sprite.visible = true;
    s.life = s.maxLife = opts.life ?? 0.3;
    s.size0 = opts.size0 ?? 0.3;
    s.size1 = opts.size1 ?? 0.5;
    s.gravity = opts.gravity ?? 0;
    s.spin = opts.spin ?? 0;
    if (opts.vel) s.vel.copy(opts.vel); else s.vel.set(0, 0, 0);
    s.sprite.scale.setScalar(s.size0);
    return s;
  }

  // ---- public spawners ---------------------------------------------------

  muzzleFlash(position, direction, scale = 1) {
    this._emit(this.flashTex, position, {
      life: 0.055, size0: 0.42 * scale, size1: 0.14 * scale, opacity: 0.95,
    });
    const smokePos = position.clone().addScaledVector(direction, 0.12);
    this._emit(this.smokeTex, smokePos, {
      life: 0.55, size0: 0.10, size1: 0.55, opacity: 0.20,
      additive: false, color: 0xb9bcc0,
      vel: direction.clone().multiplyScalar(1.4).add(
        new THREE.Vector3(0, 0.5, 0)),
    });
    this.muzzleLight.position.copy(position);
    this.muzzleLight.intensity = 9 * scale;
    this.muzzleLightLife = 0.06;
  }

  tracer(from, to) {
    let slot = null;
    for (const t of this.tracers) if (t.life <= 0) { slot = t; break; }
    if (!slot) slot = this.tracers[0];
    slot.from.copy(from);
    slot.to.copy(to);
    slot.life = 0.055;
    slot.mesh.visible = true;

    const dir = this._v.copy(to).sub(from);
    const len = dir.length();
    slot.mesh.position.copy(from).addScaledVector(dir, 0.5 / (len || 1));
    slot.mesh.position.copy(from).lerp(to, 0.5);
    slot.mesh.scale.set(0.035, len, 1);
    slot.mesh.quaternion.setFromUnitVectors(this._up, dir.normalize());
    // Billboard around the tracer's own axis so it always faces the camera.
    slot.mesh.rotateOnAxis(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
  }

  impact(point, normal, surface = 'concrete') {
    const tints = {
      concrete: 0xd8d2c6, metal: 0xffd08a, wood: 0xc99a5e, dirt: 0x9d8b6c,
    };
    const colour = tints[surface] ?? tints.concrete;
    this._emit(this.sparkTex, point, {
      life: 0.10, size0: 0.22, size1: 0.05, color: colour,
    });
    const puffPos = point.clone().addScaledVector(normal, 0.05);
    this._emit(this.smokeTex, puffPos, {
      life: 0.65, size0: 0.10, size1: 0.62, opacity: 0.34,
      additive: false, color: colour,
      vel: normal.clone().multiplyScalar(1.1),
      gravity: -0.7,
    });
    for (let i = 0; i < (this.quality.particles > 0.7 ? 4 : 2); i++) {
      this._emit(this.sparkTex, point, {
        life: 0.22 + Math.random() * 0.18,
        size0: 0.055, size1: 0.01, color: colour,
        vel: normal.clone().multiplyScalar(2 + Math.random() * 3).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 2.4,
            (Math.random() - 0.5) * 3)),
        gravity: -9,
      });
    }
    this.decal(point, normal);
  }

  blood(point, direction) {
    for (let i = 0; i < (this.quality.particles > 0.7 ? 6 : 3); i++) {
      this._emit(this.bloodTex, point, {
        life: 0.30 + Math.random() * 0.25,
        size0: 0.075, size1: 0.20, opacity: 0.85,
        additive: false, color: 0xb02a22,
        vel: direction.clone().multiplyScalar(1.4 + Math.random() * 2.2).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 1.4,
            (Math.random() - 0.5) * 2)),
        gravity: -7,
      });
    }
  }

  decal(point, normal) {
    const slot = this.decals[this.decalIndex];
    this.decalIndex = (this.decalIndex + 1) % this.decals.length;
    slot.mesh.position.copy(point).addScaledVector(normal, 0.012);
    slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    slot.mesh.rotateZ(Math.random() * Math.PI);
    const s = 0.8 + Math.random() * 0.5;
    slot.mesh.scale.setScalar(s);
    slot.mesh.material.opacity = 1;
    slot.mesh.visible = true;
    slot.life = 22;
  }

  ejectCasing(position, right, up) {
    let slot = null;
    for (const c of this.casings) if (c.life <= 0) { slot = c; break; }
    if (!slot) return;
    slot.mesh.position.copy(position);
    slot.mesh.visible = true;
    slot.life = 1.6;
    slot.vel.copy(right).multiplyScalar(2.2 + Math.random() * 1.4)
      .addScaledVector(up, 1.6 + Math.random());
    slot.spin.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20);
  }

  explosion(position, radius) {
    this._emit(this.flashTex, position, {
      life: 0.14, size0: radius * 0.5, size1: radius * 1.5, opacity: 1,
    });
    const count = Math.round(18 * this.quality.particles);
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize();
      this._emit(this.smokeTex, position, {
        life: 0.9 + Math.random() * 0.9,
        size0: radius * 0.25, size1: radius * (0.9 + Math.random()),
        opacity: 0.5, additive: false, color: 0x8a8378,
        vel: dir.multiplyScalar(3 + Math.random() * 7),
        gravity: -1.4,
      });
    }
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
      this._emit(this.sparkTex, position, {
        life: 0.35 + Math.random() * 0.35,
        size0: 0.10, size1: 0.02, color: 0xffb35c,
        vel: dir.multiplyScalar(8 + Math.random() * 16),
        gravity: -12,
      });
    }
    this.muzzleLight.position.copy(position);
    this.muzzleLight.color.setHex(0xff9040);
    this.muzzleLight.intensity = 40;
    this.muzzleLightLife = 0.22;
  }

  smokeCloud(position, radius) {
    const count = Math.round(26 * this.quality.particles);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;
      const p = position.clone().add(new THREE.Vector3(
        Math.cos(a) * r, Math.random() * 1.2, Math.sin(a) * r));
      this._emit(this.smokeTex, p, {
        life: 7 + Math.random() * 4,
        size0: radius * 0.3, size1: radius * 1.1,
        opacity: 0.55, additive: false, color: 0xd0d0d0,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4, 0.25 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.4),
      });
    }
  }

  // ---- per-frame ---------------------------------------------------------

  update(dt) {
    this.time += dt;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = Math.max(0, t.life / 0.055) * 0.9;
    }

    for (const s of this.sprites) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      const k = 1 - s.life / s.maxLife;
      s.vel.y += s.gravity * dt;
      s.sprite.position.addScaledVector(s.vel, dt);
      s.sprite.scale.setScalar(s.size0 + (s.size1 - s.size0) * k);
      // Long-lived clouds hold their opacity and only fade over the last
      // second; short puffs fade across their whole life.
      const fade = s.maxLife > 2 ? Math.min(1, s.life) : 1 - k;
      s.sprite.material.opacity = s.opacity0 * fade;
      if (s.spin) s.sprite.material.rotation += s.spin * dt;
    }

    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      c.vel.y -= 20 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
    }

    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      if (d.life < 3) d.mesh.material.opacity = d.life / 3;
    }

    if (this.muzzleLightLife > 0) {
      this.muzzleLightLife -= dt;
      this.muzzleLight.intensity *= Math.exp(-dt * 22);
      if (this.muzzleLightLife <= 0) {
        this.muzzleLight.intensity = 0;
        this.muzzleLight.color.setHex(0xffbb66);
      }
    }
  }

  /** Tracers are quads: keep them edge-on to the camera. */
  faceCamera(camera) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      const dir = this._v.copy(t.to).sub(t.from).normalize();
      const toCam = new THREE.Vector3().subVectors(camera.position, t.mesh.position).normalize();
      const side = new THREE.Vector3().crossVectors(dir, toCam).normalize();
      const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      const m = new THREE.Matrix4().makeBasis(side, dir, up);
      t.mesh.quaternion.setFromRotationMatrix(m);
    }
  }
}
