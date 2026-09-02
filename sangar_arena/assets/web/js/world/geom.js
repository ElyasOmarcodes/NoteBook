import * as THREE from '../../vendor/three.module.js';

/**
 * Rescales a BoxGeometry's UVs so the texture tiles at a constant world
 * density on every face. Without this, a 30 m wall and a 1 m crate sharing a
 * material would show wildly different texture scales — and each distinct
 * `repeat` would need its own material, defeating the batcher.
 *
 * BoxGeometry lays faces out as +X, -X, +Y, -Y, +Z, -Z, four vertices each.
 */
export function boxUV(geometry, w, h, d, density = 0.5) {
  const uv = geometry.attributes.uv;
  const spans = [
    [d, h], [d, h],   // +X, -X
    [w, d], [w, d],   // +Y, -Y
    [w, h], [w, h],   // +Z, -Z
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * su * density, uv.getY(i) * sv * density);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Cylinder UVs scaled to circumference x height. */
export function cylinderUV(geometry, radius, height, density = 0.4) {
  const uv = geometry.attributes.uv;
  const circumference = 2 * Math.PI * radius;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * circumference * density, uv.getY(i) * height * density);
  }
  uv.needsUpdate = true;
  return geometry;
}

const boxCache = new Map();

/** Cached unit box; callers scale it through the placement matrix. */
export function unitBox() {
  let g = boxCache.get('unit');
  if (!g) {
    g = new THREE.BoxGeometry(1, 1, 1);
    boxCache.set('unit', g);
  }
  return g;
}

/** A fresh box with world-density UVs baked in. */
export function box(w, h, d, density = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  return boxUV(g, w, h, d, density);
}

/** Axis-aligned bounding box helper used by the collision world. */
export function aabb(cx, cy, cz, w, h, d) {
  return {
    minX: cx - w / 2, maxX: cx + w / 2,
    minY: cy - h / 2, maxY: cy + h / 2,
    minZ: cz - d / 2, maxZ: cz + d / 2,
  };
}
