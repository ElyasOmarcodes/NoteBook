import * as THREE from '../../vendor/three.module.js';
import { PHYS } from '../config.js';

/**
 * Collision world for the arena.
 *
 * Bodies are vertical capsules approximated as axis-aligned cylinders, which is
 * all a box-and-tank map needs and keeps the maths cheap enough to run for a
 * dozen soldiers plus every bullet on a mid-range phone. Broadphase is a flat
 * uniform grid over the solids.
 */
export class CollisionWorld {
  constructor(map) {
    this.solids = map.solids;
    this.cylinders = map.cylinders;
    this.ladders = map.ladders;
    this.ammoBoxes = map.ammoBoxes;

    this.cell = 12;
    this.grid = new Map();
    this.solids.forEach((s, i) => this._insert(s, i));
  }

  _key(cx, cz) { return `${cx},${cz}`; }

  _insert(s, index) {
    const x0 = Math.floor(s.minX / this.cell), x1 = Math.floor(s.maxX / this.cell);
    const z0 = Math.floor(s.minZ / this.cell), z1 = Math.floor(s.maxZ / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = this._key(x, z);
        let list = this.grid.get(k);
        if (!list) { list = []; this.grid.set(k, list); }
        list.push(index);
      }
    }
  }

  /** Solids whose cells overlap the given XZ box. */
  query(minX, maxX, minZ, maxZ, out = []) {
    out.length = 0;
    const seen = new Set();
    const x0 = Math.floor(minX / this.cell), x1 = Math.floor(maxX / this.cell);
    const z0 = Math.floor(minZ / this.cell), z1 = Math.floor(maxZ / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const list = this.grid.get(this._key(x, z));
        if (!list) continue;
        for (const i of list) {
          if (seen.has(i)) continue;
          seen.add(i);
          out.push(this.solids[i]);
        }
      }
    }
    return out;
  }

  // ---- character sweep ---------------------------------------------------

  /**
   * Moves a body and resolves collisions.
   *
   * @param {{position: THREE.Vector3, velocity: THREE.Vector3, height: number,
   *          radius: number, onGround: boolean, groundY: number}} body
   * @param {number} dt
   */
  move(body, dt) {
    const r = body.radius;
    const h = body.height;
    const pos = body.position;
    const vel = body.velocity;

    // ---- horizontal, axis by axis so sliding along a wall works ----
    const stepX = vel.x * dt;
    const stepZ = vel.z * dt;

    this._sweepAxis(body, stepX, 0, r, h);
    this._sweepAxis(body, 0, stepZ, r, h);

    // ---- vertical ----
    // The landing test is swept, not point-in-time: a body falling at terminal
    // velocity covers more than a metre per frame, so asking only "is a
    // surface just below my feet *now*" lets it tunnel straight through the
    // ground. Compare against where the feet were before the step instead.
    const prevY = pos.y;
    pos.y += vel.y * dt;

    const feetWere = prevY + PHYS.stepHeight;
    const head = pos.y + h;
    const candidates = this.query(pos.x - r, pos.x + r, pos.z - r, pos.z + r);

    let ground = -Infinity;
    let ceiling = Infinity;
    for (const s of candidates) {
      if (pos.x + r <= s.minX || pos.x - r >= s.maxX) continue;
      if (pos.z + r <= s.minZ || pos.z - r >= s.maxZ) continue;
      if (s.round && !insideRound(s.round, pos.x, pos.z, r * 0.6)) continue;
      if (s.maxY <= feetWere && s.maxY > ground) ground = s.maxY;
      if (s.minY >= head - 0.02 && s.minY < ceiling) ceiling = s.minY;
    }
    for (const c of this.cylinders) {
      const d = Math.hypot(pos.x - c.x, pos.z - c.z);
      if (d > c.r + r) continue;
      if (c.maxY <= feetWere && c.maxY > ground) ground = c.maxY;
      if (c.minY >= head - 0.02 && c.minY < ceiling) ceiling = c.minY;
    }

    body.groundY = ground;
    if (vel.y <= 0 && pos.y <= ground + 0.02) {
      pos.y = ground;
      vel.y = 0;
      body.onGround = true;
    } else {
      body.onGround = false;
    }
    if (pos.y + h > ceiling && vel.y > 0) {
      pos.y = ceiling - h;
      vel.y = 0;
    }
    // Last-resort floor: nothing should ever leave the world.
    if (pos.y < -8) {
      pos.y = this.groundAt(pos.x, pos.z, 60) + 0.05;
      vel.set(0, 0, 0);
      body.onGround = true;
    }
    return body;
  }

  /**
   * One horizontal axis of the sweep, with automatic step-up over low ledges
   * (kerbs, pallets, the first crate of a stack).
   */
  _sweepAxis(body, dx, dz, r, h) {
    if (dx === 0 && dz === 0) return;
    const pos = body.position;
    const nx = pos.x + dx;
    const nz = pos.z + dz;

    const candidates = this.query(nx - r, nx + r, nz - r, nz + r);
    let blockedTop = -Infinity;
    let blocked = false;

    for (const s of candidates) {
      if (nx + r <= s.minX || nx - r >= s.maxX) continue;
      if (nz + r <= s.minZ || nz - r >= s.maxZ) continue;
      if (pos.y + h <= s.minY + 0.001 || pos.y >= s.maxY - 0.001) continue;
      if (s.round && !insideRound(s.round, nx, nz, r * 0.6)) continue;
      blocked = true;
      if (s.maxY > blockedTop) blockedTop = s.maxY;
    }
    if (!blocked) {
      for (const c of this.cylinders) {
        const d = Math.hypot(nx - c.x, nz - c.z);
        if (d >= c.r + r) continue;
        if (pos.y + h <= c.minY || pos.y >= c.maxY) continue;
        blocked = true;
        if (c.maxY > blockedTop) blockedTop = c.maxY;
        // Push out radially so you slide around a tank instead of sticking.
        const push = (c.r + r - d) + 0.001;
        const ux = (nx - c.x) / (d || 1), uz = (nz - c.z) / (d || 1);
        pos.x += ux * push;
        pos.z += uz * push;
        break;
      }
    }

    if (!blocked) {
      pos.x = nx;
      pos.z = nz;
      return;
    }

    // Step-up: if the obstacle's top is within stepHeight and the space above
    // is clear, walk right over it.
    const rise = blockedTop - pos.y;
    if (rise > 0 && rise <= PHYS.stepHeight && body.onGround) {
      const testY = blockedTop + 0.02;
      if (this._clearAt(nx, testY, nz, r, h)) {
        pos.x = nx;
        pos.z = nz;
        pos.y = testY;
        body.stepping = 0.14;
        return;
      }
    }
    // Otherwise: blocked. Kill the velocity on this axis so we do not
    // accumulate a push into the wall.
    if (dx !== 0) body.velocity.x = 0;
    if (dz !== 0) body.velocity.z = 0;
  }

  _clearAt(x, y, z, r, h) {
    const candidates = this.query(x - r, x + r, z - r, z + r);
    for (const s of candidates) {
      if (x + r <= s.minX || x - r >= s.maxX) continue;
      if (z + r <= s.minZ || z - r >= s.maxZ) continue;
      if (y + h <= s.minY + 0.001 || y >= s.maxY - 0.001) continue;
      if (s.round && !insideRound(s.round, x, z, r * 0.6)) continue;
      return false;
    }
    for (const c of this.cylinders) {
      if (Math.hypot(x - c.x, z - c.z) >= c.r + r) continue;
      if (y + h <= c.minY || y >= c.maxY) continue;
      return false;
    }
    return true;
  }

  /** Highest walkable surface under a point — used to drop bots onto roofs. */
  groundAt(x, z, fromY = 200) {
    let best = 0;
    const candidates = this.query(x - 0.2, x + 0.2, z - 0.2, z + 0.2);
    for (const s of candidates) {
      if (x <= s.minX || x >= s.maxX || z <= s.minZ || z >= s.maxZ) continue;
      if (s.maxY <= fromY && s.maxY > best) best = s.maxY;
    }
    for (const c of this.cylinders) {
      if (Math.hypot(x - c.x, z - c.z) > c.r) continue;
      if (c.maxY <= fromY && c.maxY > best) best = c.maxY;
    }
    return best;
  }

  /** The ladder whose climb volume contains this point, if any. */
  ladderAt(x, y, z) {
    for (const l of this.ladders) {
      if (y < l.minY || y > l.maxY) continue;
      if (Math.hypot(x - l.x, z - l.z) <= l.radius) return l;
    }
    return null;
  }

  /** The ammo crate in reach, if any. */
  ammoAt(x, y, z) {
    for (const a of this.ammoBoxes) {
      if (Math.abs(y - a.y) > 2.4) continue;
      if (Math.hypot(x - a.x, z - a.z) <= a.radius) return a;
    }
    return null;
  }

  // ---- ray casting -------------------------------------------------------

  /**
   * Casts a ray against the static world.
   * @returns {{distance:number, point:THREE.Vector3, normal:THREE.Vector3}|null}
   */
  raycast(origin, dir, maxDist) {
    let bestT = maxDist;
    let bestNormal = null;

    // March the broadphase grid rather than testing every solid.
    const minX = Math.min(origin.x, origin.x + dir.x * maxDist);
    const maxX = Math.max(origin.x, origin.x + dir.x * maxDist);
    const minZ = Math.min(origin.z, origin.z + dir.z * maxDist);
    const maxZ = Math.max(origin.z, origin.z + dir.z * maxDist);
    const candidates = this.query(minX, maxX, minZ, maxZ);

    for (const s of candidates) {
      const hit = rayAabb(origin, dir, s);
      if (hit && hit.t >= 0 && hit.t < bestT) {
        if (s.round && !insideRound(s.round,
          origin.x + dir.x * hit.t, origin.z + dir.z * hit.t, 0)) continue;
        bestT = hit.t;
        bestNormal = hit.normal;
      }
    }
    for (const c of this.cylinders) {
      const hit = rayCylinder(origin, dir, c);
      if (hit && hit.t >= 0 && hit.t < bestT) {
        bestT = hit.t;
        bestNormal = hit.normal;
      }
    }

    if (!bestNormal) return null;
    return {
      distance: bestT,
      point: origin.clone().addScaledVector(dir, bestT),
      normal: bestNormal,
    };
  }

  /** True if nothing solid sits between the two points (bot line of sight). */
  visible(from, to) {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.multiplyScalar(1 / dist);
    const hit = this.raycast(from, dir, dist - 0.15);
    return !hit;
  }
}

function insideRound(round, x, z, slack) {
  return Math.hypot(x - round.x, z - round.z) <= round.r + slack;
}

const EPS = 1e-6;

export function rayAabb(o, d, b) {
  let tmin = -Infinity, tmax = Infinity;
  let nAxis = 0, nSign = 1;

  const lo = [b.minX, b.minY, b.minZ];
  const hi = [b.maxX, b.maxY, b.maxZ];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];

  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < EPS) {
      if (oo[a] < lo[a] || oo[a] > hi[a]) return null;
      continue;
    }
    const inv = 1 / dd[a];
    let t1 = (lo[a] - oo[a]) * inv;
    let t2 = (hi[a] - oo[a]) * inv;
    let sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const t = tmin >= 0 ? tmin : tmax;
  const normal = new THREE.Vector3();
  normal.setComponent(nAxis, nSign);
  return { t, normal };
}

export function rayCylinder(o, d, c) {
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < EPS) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const cc = ox * ox + oz * oz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return null;
  const y = o.y + d.y * t;
  if (y < c.minY || y > c.maxY) {
    // Try the flat lid.
    if (Math.abs(d.y) < EPS) return null;
    const tl = (c.maxY - o.y) / d.y;
    if (tl < 0) return null;
    const lx = o.x + d.x * tl, lz = o.z + d.z * tl;
    if (Math.hypot(lx - c.x, lz - c.z) > c.r) return null;
    return { t: tl, normal: new THREE.Vector3(0, 1, 0) };
  }
  const px = o.x + d.x * t, pz = o.z + d.z * t;
  const n = new THREE.Vector3(px - c.x, 0, pz - c.z).normalize();
  return { t, normal: n };
}

/**
 * Ray vs a soldier, split into head / torso / limbs so headshots pay.
 * @returns {{t:number, zone:'head'|'torso'|'limb'}|null}
 */
export function rayBody(o, d, pos, height, radius) {
  const scale = height / 1.78;
  const zones = [
    { zone: 'head', y0: 1.50 * scale, y1: 1.78 * scale, r: radius * 0.62 },
    { zone: 'torso', y0: 0.80 * scale, y1: 1.50 * scale, r: radius * 1.05 },
    { zone: 'limb', y0: 0.00, y1: 0.80 * scale, r: radius * 1.0 },
  ];
  let best = null;
  for (const z of zones) {
    const hit = rayCylinder(o, d, {
      x: pos.x, z: pos.z, r: z.r,
      minY: pos.y + z.y0, maxY: pos.y + z.y1,
    });
    if (hit && hit.t >= 0 && (!best || hit.t < best.t)) {
      best = { t: hit.t, zone: z.zone };
    }
  }
  return best;
}
