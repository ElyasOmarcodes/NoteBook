import * as THREE from '../../vendor/three.module.js';
import { buildGrenade } from './weapons.js';

/**
 * Thrown grenades: ballistic arc, bounces off the world, then frag / flash /
 * smoke on the fuse.
 */
export class GrenadeSystem {
  constructor(scene, world, effects, audio) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.live = [];
    this._models = { frag: null, flash: null, smoke: null };
  }

  _model(kind) {
    if (!this._models[kind]) this._models[kind] = buildGrenade(kind);
    return this._models[kind].clone(true);
  }

  /**
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} direction unit vector
   * @param {object} def grenade definition (damage, radius, fuse)
   * @param {string} ownerId
   * @param {number} power 0..1 throw strength
   */
  throwGrenade(origin, direction, def, ownerId, power = 1) {
    const mesh = this._model(def.id);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const velocity = direction.clone().multiplyScalar(15 * power);
    velocity.y += 3.4;

    const g = {
      mesh,
      def,
      ownerId,
      velocity,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14),
      fuse: def.fuse,
      bounces: 0,
    };
    this.live.push(g);
    return g;
  }

  /**
   * @param {number} dt
   * @param {function} onBlast (position, def, ownerId) => void
   */
  update(dt, onBlast) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.fuse -= dt;

      g.velocity.y -= 22 * dt;
      const step = g.velocity.clone().multiplyScalar(dt);
      const dist = step.length();

      if (dist > 0.0001) {
        const dir = step.clone().normalize();
        const hit = this.world.raycast(g.mesh.position, dir, dist + 0.08);
        if (hit) {
          // Bounce with energy loss, and nudge off the surface so the next
          // cast does not immediately re-hit it.
          g.mesh.position.copy(hit.point).addScaledVector(hit.normal, 0.06);
          const vn = hit.normal.clone().multiplyScalar(
            g.velocity.dot(hit.normal));
          g.velocity.sub(vn.multiplyScalar(1.45));
          g.velocity.multiplyScalar(0.62);
          g.bounces++;
          if (g.bounces < 6 && g.velocity.length() > 1.2) {
            this.audio?.mechanical('click');
          }
        } else {
          g.mesh.position.add(step);
        }
      }

      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;
      g.mesh.rotation.z += g.spin.z * dt;

      if (g.fuse <= 0) {
        this._detonate(g, onBlast);
        this.scene.remove(g.mesh);
        this.live.splice(i, 1);
      }
    }
  }

  _detonate(g, onBlast) {
    const pos = g.mesh.position.clone();
    switch (g.def.id) {
      case 'flash':
        this.effects.explosion(pos, 3.2);
        this.audio?.flashbang();
        break;
      case 'smoke':
        this.effects.smokeCloud(pos, g.def.radius);
        break;
      default:
        this.effects.explosion(pos, g.def.radius);
        this.audio?.explosion(0);
    }
    onBlast?.(pos, g.def, g.ownerId);
  }

  /**
   * Damage falls off with distance and is blocked by cover, so hiding behind a
   * container actually works.
   */
  applyBlast(position, def, targets, world) {
    const results = [];
    for (const t of targets) {
      if (!t.alive) continue;
      const centre = t.position.clone();
      centre.y += (t.height ?? 1.78) * 0.5;
      const d = centre.distanceTo(position);
      if (d > def.radius) continue;
      if (!world.visible(position, centre)) continue;
      const falloff = 1 - d / def.radius;
      const damage = def.damage * falloff * falloff;
      if (damage < 1) continue;
      const dir = centre.clone().sub(position).normalize();
      results.push({ target: t, damage, direction: dir, distance: d });
    }
    return results;
  }

  clear() {
    for (const g of this.live) this.scene.remove(g.mesh);
    this.live.length = 0;
  }
}
