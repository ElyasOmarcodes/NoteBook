import * as THREE from '../../vendor/three.module.js';

/**
 * Reusable structures for the refinery: the pieces that give the yard its
 * silhouette in the reference renders.
 *
 * Each helper writes geometry into the caller's batcher (so the whole map
 * still collapses to a handful of draw calls) and returns the colliders it
 * wants registered. Nothing here is a bare cube: warehouses get eaves and
 * roll-up doors, tanks get riveted courses and a braced lid, containers get
 * corner castings, and the roads get kerbs.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Places `geometry` with a full transform. */
export function place(batcher, mat, geometry, {
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
} = {}) {
  _q.setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  _v.set(x, y, z);
  _m.compose(_v, _q, _s);
  batcher.add(mat, geometry, _m, {});
}

/**
 * A gable roof built as two pitched slabs plus a ridge cap, with the sheet
 * seams running down the slope like real roofing.
 */
export function gableRoof(batcher, {
  x, y, z, w, d, rise, mat = 'roof', overhang = 0.6, thickness = 0.22,
}) {
  const halfD = d / 2 + overhang;
  const slope = Math.hypot(halfD, rise);
  const angle = Math.atan2(rise, halfD);
  const width = w + overhang * 2;

  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(width, thickness, slope);
    // Roofing sheets run up the slope, so the V axis follows `slope`.
    scaleUV(g, width * 0.28, slope * 0.28);
    place(batcher, mat, g, {
      x, y: y + rise / 2, z: z + side * halfD / 2,
      rx: side * angle,
    });
    g.dispose();
  }
  // Ridge cap.
  const cap = new THREE.BoxGeometry(width, 0.16, 0.5);
  scaleUV(cap, width * 0.3, 0.5);
  place(batcher, 'plate', cap, { x, y: y + rise + 0.06, z });
  cap.dispose();

  // Gable ends, so the roof does not read as a floating plank from the side.
  for (const side of [-1, 1]) {
    const tri = triangleWall(w, rise);
    place(batcher, mat, tri, { x: x + side * w / 2, y, z, ry: Math.PI / 2 });
    tri.dispose();
  }
}

/** A flat triangle used for gable ends. */
function triangleWall(w, h) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
  g.translate(0, 0, -0.1);
  scaleUV(g, 0.3, 0.3);
  return g;
}

/** Rescales UVs so every surface tiles at a constant world density. */
export function scaleUV(geometry, su, sv) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * A pyramid skylight — the row of white glazed pyramids on every flat roof in
 * the reference set, and the single most recognisable detail of the place.
 */
export function skylight(group, { x, y, z, w = 2.6, h = 0.9, mat }) {
  const geo = new THREE.ConeGeometry(w * 0.72, h, 4, 1);
  geo.rotateY(Math.PI / 4);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  group.add(mesh);
  return { w, h };
}

/** The kerbed edge of a road: a raised concrete lip plus the pavement behind. */
export function kerb(batcher, { x1, z1, x2, z2, height = 0.16, width = 0.34 }) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return null;
  const angle = Math.atan2(dx, dz);
  const g = new THREE.BoxGeometry(width, height, len);
  scaleUV(g, width * 1.4, len * 0.4);
  place(batcher, 'kerb', g, {
    x: (x1 + x2) / 2, y: height / 2, z: (z1 + z2) / 2, ry: angle,
  });
  g.dispose();
  return { angle, len };
}

/**
 * A storage tank: riveted shell, a domed lid with the cross-braced grid the
 * reference tanks all carry, a guard rail, and the pipe manifold at its foot.
 */
export function oilTank(batcher, group, { x, z, r, h, railMat }) {
  const seg = 30;

  const shell = new THREE.CylinderGeometry(r, r, h, seg, 1, true);
  scaleUV(shell, 2 * Math.PI * r * 0.16, h * 0.16);
  place(batcher, 'tank', shell, { x, y: h / 2, z });
  shell.dispose();

  // Lid: a very shallow cone so rain runs off, as on the real thing.
  const lid = new THREE.ConeGeometry(r + 0.12, 0.55, seg, 1);
  scaleUV(lid, 6, 1);
  place(batcher, 'plate', lid, { x, y: h + 0.27, z });
  lid.dispose();

  // The lid's bracing grid: two crossing walkways plus a ring.
  for (const rot of [0, Math.PI / 2]) {
    const beam = new THREE.BoxGeometry(r * 2 - 0.4, 0.10, 0.42);
    scaleUV(beam, r * 0.8, 0.4);
    place(batcher, 'plate', beam, { x, y: h + 0.5, z, ry: rot });
    beam.dispose();
  }
  const ring = new THREE.TorusGeometry(r * 0.55, 0.07, 6, 24);
  ring.rotateX(Math.PI / 2);
  scaleUV(ring, 4, 1);
  place(batcher, 'plate', ring, { x, y: h + 0.5, z });
  ring.dispose();

  // Guard rail around the rim.
  const posts = 20;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const post = new THREE.BoxGeometry(0.07, 1.05, 0.07);
    place(batcher, 'plate', post, { x: px, y: h + 1.05, z: pz });
    post.dispose();
  }
  const top = new THREE.TorusGeometry(r, 0.045, 6, seg);
  top.rotateX(Math.PI / 2);
  place(batcher, 'plate', top, { x, y: h + 1.55, z });
  top.dispose();

  // Base manifold: two stub pipes and a flange.
  for (const a of [0.4, 2.6]) {
    const pipe = new THREE.CylinderGeometry(0.26, 0.26, 2.4, 10);
    pipe.rotateZ(Math.PI / 2);
    place(batcher, 'plate', pipe, {
      x: x + Math.cos(a) * (r + 1.0), y: 1.1, z: z + Math.sin(a) * (r + 1.0),
      ry: -a,
    });
    pipe.dispose();
  }
  void group; void railMat;
}

/**
 * A shipping container at real ISO proportions, with corner castings and the
 * end doors picked out.
 */
export function container(batcher, {
  x, y, z, ry = 0, mat = 'containerBlue', len = 12.2, w = 2.44, h = 2.59,
}) {
  const body = new THREE.BoxGeometry(len, h, w);
  scaleUV(body, len * 0.09, h * 0.36);
  place(batcher, mat, body, { x, y: y + h / 2, z, ry });
  body.dispose();

  // Corner castings and the top/bottom rails that frame every container.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const sy of [0, 1]) {
        const c = new THREE.BoxGeometry(0.34, 0.30, 0.30);
        place(batcher, 'plate', c, {
          x: x + Math.cos(ry) * sx * (len / 2 - 0.1) - Math.sin(ry) * sz * (w / 2 - 0.05),
          y: y + (sy ? h - 0.15 : 0.15),
          z: z + Math.sin(ry) * sx * (len / 2 - 0.1) + Math.cos(ry) * sz * (w / 2 - 0.05),
          ry,
        });
        c.dispose();
      }
    }
  }
  // Door end: vertical locking bars.
  for (let i = -1; i <= 1; i += 2) {
    const bar = new THREE.CylinderGeometry(0.05, 0.05, h - 0.5, 6);
    place(batcher, 'plate', bar, {
      x: x + Math.cos(ry) * (len / 2 + 0.03) - Math.sin(ry) * i * 0.5,
      y: y + h / 2,
      z: z + Math.sin(ry) * (len / 2 + 0.03) + Math.cos(ry) * i * 0.5,
      ry,
    });
    bar.dispose();
  }
}

/** A stack of steel drums on a pallet — the yellow clusters in the references. */
export function drumCluster(batcher, { x, z, y = 0, count = 6, mat = 'drum' }) {
  const pallet = new THREE.BoxGeometry(2.2, 0.14, 1.5);
  scaleUV(pallet, 2.4, 1.6);
  place(batcher, 'wood', pallet, { x, y: y + 0.07, z });
  pallet.dispose();

  const cols = 3;
  for (let i = 0; i < count; i++) {
    const cx = x + ((i % cols) - 1) * 0.62;
    const cz = z + (Math.floor(i / cols) - 0.5) * 0.62;
    const drum = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14);
    scaleUV(drum, 2, 1);
    place(batcher, mat, drum, { x: cx, y: y + 0.58, z: cz });
    drum.dispose();
    const rim = new THREE.TorusGeometry(0.29, 0.035, 5, 14);
    rim.rotateX(Math.PI / 2);
    place(batcher, 'plate', rim, { x: cx, y: y + 0.98, z: cz });
    rim.dispose();
  }
}

/** A wooden pallet stack. */
export function palletStack(batcher, { x, z, y = 0, high = 3, ry = 0 }) {
  for (let i = 0; i < high; i++) {
    const slab = new THREE.BoxGeometry(1.2, 0.11, 1.0);
    scaleUV(slab, 1.6, 1.3);
    place(batcher, 'wood', slab, { x, y: y + 0.06 + i * 0.15, z, ry });
    slab.dispose();
    for (const s of [-1, 0, 1]) {
      const foot = new THREE.BoxGeometry(0.16, 0.05, 1.0);
      place(batcher, 'wood', foot, {
        x: x + Math.cos(ry) * s * 0.45, y: y + 0.02 + i * 0.15,
        z: z + Math.sin(ry) * s * 0.45, ry,
      });
      foot.dispose();
    }
  }
}

/**
 * A chain-link fence panel on a low concrete plinth — the yard boundaries in
 * the ground-level reference shot.
 */
export function chainFence(batcher, group, { x1, z1, x2, z2, h = 1.9, mesh }) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;

  // Plinth.
  const plinth = new THREE.BoxGeometry(0.36, 0.55, len);
  scaleUV(plinth, 0.6, len * 0.35);
  place(batcher, 'concrete', plinth, { x: cx, y: 0.27, z: cz, ry: angle });
  plinth.dispose();

  // Rails and posts.
  for (const ry of [0.62, h]) {
    const rail = new THREE.CylinderGeometry(0.045, 0.045, len, 6);
    rail.rotateX(Math.PI / 2);
    place(batcher, 'plate', rail, { x: cx, y: 0.55 + ry, z: cz, ry: angle });
    rail.dispose();
  }
  const posts = Math.max(2, Math.round(len / 2.6));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const post = new THREE.CylinderGeometry(0.055, 0.055, h, 6);
    place(batcher, 'plate', post, {
      x: x1 + dx * t, y: 0.55 + h / 2, z: z1 + dz * t,
    });
    post.dispose();
  }

  // The mesh itself is a transparent plane, so it lives outside the batch.
  const panel = new THREE.PlaneGeometry(len, h - 0.1);
  const m = new THREE.Mesh(panel, mesh);
  m.position.set(cx, 0.55 + h / 2, cz);
  m.rotation.y = angle + Math.PI / 2;
  group.add(m);

  return { angle, len };
}

/** Builds the see-through chain-link material once. */
export function chainLinkMaterial() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(176,180,184,0.95)';
  ctx.lineWidth = 2.2;
  const pitch = size / 8;
  for (let i = -size; i < size * 2; i += pitch) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + size, 0); ctx.lineTo(i, size); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, size };
}

/** A run of pipe on trestles, connecting the tank farm to the plant. */
export function pipeRun(batcher, { x1, z1, x2, z2, y, r = 0.42, supports = true }) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;

  const pipe = new THREE.CylinderGeometry(r, r, len, 12);
  pipe.rotateX(Math.PI / 2);
  scaleUV(pipe, 2 * Math.PI * r * 0.3, len * 0.25);
  place(batcher, 'tank', pipe, { x: cx, y, z: cz, ry: angle });
  pipe.dispose();

  // Flanged joints every few metres.
  const joints = Math.max(1, Math.round(len / 7));
  for (let i = 1; i < joints; i++) {
    const t = i / joints;
    const flange = new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.14, 12);
    flange.rotateX(Math.PI / 2);
    place(batcher, 'plate', flange, {
      x: x1 + dx * t, y, z: z1 + dz * t, ry: angle,
    });
    flange.dispose();
  }

  if (supports) {
    const n = Math.max(2, Math.round(len / 11));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = x1 + dx * t, pz = z1 + dz * t;
      for (const s of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.18, y, 0.18);
        place(batcher, 'plate', leg, {
          x: px + Math.cos(angle) * s * 0.6, y: y / 2,
          z: pz - Math.sin(angle) * s * 0.6,
        });
        leg.dispose();
      }
      const cross = new THREE.BoxGeometry(1.5, 0.14, 0.18);
      place(batcher, 'plate', cross, { x: px, y: y - r - 0.1, z: pz, ry: angle });
      cross.dispose();
    }
  }
}

/** A tall thin smokestack, the plant's landmark on the skyline. */
export function smokestack(batcher, { x, z, h = 26, r = 1.1 }) {
  const body = new THREE.CylinderGeometry(r * 0.78, r, h, 14);
  scaleUV(body, 2 * Math.PI * r * 0.2, h * 0.2);
  place(batcher, 'concrete', body, { x, y: h / 2, z });
  body.dispose();
  for (let i = 1; i <= 3; i++) {
    const band = new THREE.TorusGeometry(r * (1 - i * 0.05), 0.08, 6, 16);
    band.rotateX(Math.PI / 2);
    place(batcher, 'plate', band, { x, y: h * (i / 4), z });
    band.dispose();
  }
}
