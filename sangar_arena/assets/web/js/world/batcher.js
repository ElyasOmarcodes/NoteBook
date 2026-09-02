import * as THREE from '../../vendor/three.module.js';
import * as BGU from '../../vendor/BufferGeometryUtils.js';
import { material } from './textures.js';

/**
 * Collects the whole static map into one merged mesh per material.
 *
 * A yard this size is a few hundred boxes; drawn individually that is a few
 * hundred draw calls, which a mid-range phone will not hold at 60fps. Merging
 * by material trades per-object culling (cheap here — the geometry is all
 * boxes) for a handful of draw calls.
 */
export class Batcher {
  constructor() {
    /** @type {Map<string, {geoms: THREE.BufferGeometry[], opts: object}>} */
    this.buckets = new Map();
  }

  /**
   * @param {string} matName surface name from textures.js
   * @param {THREE.BufferGeometry} geometry already-sized geometry
   * @param {THREE.Matrix4} matrix world placement
   * @param {object} opts material options (uv repeat, colour, roughness…)
   */
  add(matName, geometry, matrix, opts = {}) {
    const key = `${matName}|${JSON.stringify(opts)}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { geoms: [], opts, matName };
      this.buckets.set(key, bucket);
    }
    const g = geometry.clone();
    g.applyMatrix4(matrix);
    // Merging requires identical attribute sets.
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array((g.attributes.position.count) * 2), 2));
    g.deleteAttribute('uv1');
    g.deleteAttribute('uv2');
    bucket.geoms.push(g);
  }

  /** Merges everything and returns a group ready to add to the scene. */
  build(quality) {
    const group = new THREE.Group();
    group.name = 'staticWorld';
    for (const bucket of this.buckets.values()) {
      if (!bucket.geoms.length) continue;
      const merged = BGU.mergeGeometries(bucket.geoms, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mat = material(bucket.matName, {
        aniso: quality.aniso,
        ...bucket.opts,
      });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = quality.shadowMap > 0;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const g of bucket.geoms) g.dispose();
      bucket.geoms.length = 0;
    }
    return group;
  }
}
