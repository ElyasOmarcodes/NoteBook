import * as THREE from '../../vendor/three.module.js';

/**
 * Weapon geometry built the way a modeller would: profiles turned on a lathe
 * for anything round, and bevelled 2D outlines extruded for anything flat.
 *
 * Nothing here is a stacked cube. A barrel is a real turned profile with a
 * step down at the gas block and a crown at the muzzle; a receiver is an
 * outline with a rounded ejection port and a bevelled edge; a magazine is a
 * curved outline swept to thickness. That is what gives these silhouettes the
 * read of a real firearm instead of a toy.
 */

// ---- materials -----------------------------------------------------------

const MATS = {};
function mat(name, spec) {
  if (!MATS[name]) MATS[name] = new THREE.MeshStandardMaterial(spec);
  return MATS[name];
}

export const GUN_MATS = {
  get parkerised() {
    return mat('parkerised', {
      color: 0x24262a, roughness: 0.52, metalness: 0.82,
    });
  },
  get blued() {
    return mat('blued', { color: 0x15171a, roughness: 0.32, metalness: 0.92 });
  },
  get polymer() {
    return mat('polymer', { color: 0x22252a, roughness: 0.78, metalness: 0.04 });
  },
  get wood() {
    return mat('gunwood', { color: 0x6a3f22, roughness: 0.62, metalness: 0.02 });
  },
  get glass() {
    return mat('lens', {
      color: 0x1d3a4a, roughness: 0.06, metalness: 0.2,
      emissive: 0x0a1a24, emissiveIntensity: 0.5,
    });
  },
  get brass() {
    return mat('brass', { color: 0xb08a3a, roughness: 0.35, metalness: 0.9 });
  },
};

// ---- primitives ----------------------------------------------------------

/**
 * Turns a profile on the Z axis. `points` are `[radius, z]` pairs from the
 * breech forward, so a barrel reads as a list of diameters down its length.
 */
export function turned(points, { segments = 16, material } = {}) {
  const pts = points.map(([r, z]) => new THREE.Vector2(Math.max(0.0004, r), z));
  const g = new THREE.LatheGeometry(pts, segments);
  // Lathe spins around Y; the guns are built pointing down +Z.
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material ?? GUN_MATS.blued);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Extrudes a bevelled outline. `outline` is a list of `[z, y]` points in the
 * weapon's side view; the result is `thickness` wide across X.
 */
export function slab(outline, {
  thickness = 0.06, bevel = 0.006, material, curveSegments = 6,
} = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  // The shape is drawn in the ZY plane and extruded along +Z, so it has to be
  // swung a quarter turn to lie along the weapon's axis. It must be -90 deg:
  // +90 mirrors the profile front-to-back, which put every receiver, stock and
  // magazine on the wrong end of the gun.
  g.rotateY(-Math.PI / 2);
  g.translate(thickness / 2, 0, 0);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material ?? GUN_MATS.parkerised);
  mesh.castShadow = true;
  return mesh;
}

/** A rounded-corner outline, for receivers and handguards. */
export function roundedOutline(z0, z1, y0, y1, r = 0.012, steps = 4) {
  const pts = [];
  const arc = (cz, cy, a0, a1) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(z1 - r, y0 + r, -Math.PI / 2, 0);
  arc(z1 - r, y1 - r, 0, Math.PI / 2);
  arc(z0 + r, y1 - r, Math.PI / 2, Math.PI);
  arc(z0 + r, y0 + r, Math.PI, Math.PI * 1.5);
  return pts;
}

/** A tube swept along Z — gas tubes, rails, sling loops. */
export function rod(r, len, { segments = 10, material } = {}) {
  const g = new THREE.CylinderGeometry(r, r, len, segments);
  g.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(g, material ?? GUN_MATS.blued);
  mesh.castShadow = true;
  return mesh;
}

/** A torus ring — trigger guards, barrel bands, scope rings. */
export function ring(r, tube, { material, segments = 14 } = {}) {
  const g = new THREE.TorusGeometry(r, tube, 6, segments);
  const mesh = new THREE.Mesh(g, material ?? GUN_MATS.parkerised);
  mesh.castShadow = true;
  return mesh;
}

function at(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

// ---- shared assemblies ---------------------------------------------------

/** A turned barrel with a gas block step and a crowned muzzle. */
function barrel(group, { from, to, r = 0.0125, gasBlock = true }) {
  const len = to - from;
  const profile = [
    [0, from],
    [r * 1.45, from],
    [r * 1.45, from + len * 0.08],
    [r * 1.02, from + len * 0.10],
    [r, to - len * 0.06],
    [r * 1.18, to - len * 0.05],
    [r * 1.18, to],
    [r * 0.62, to],
    [0, to],
  ];
  group.add(turned(profile, { segments: 14 }));
  if (gasBlock) {
    const gb = slab(roundedOutline(from + len * 0.55, from + len * 0.68, r, r * 3.1, 0.005),
      { thickness: r * 2.6, material: GUN_MATS.parkerised });
    group.add(gb);
    group.add(at(rod(r * 0.5, len * 0.5), 0, r * 2.2, from + len * 0.4));
  }
}

/** A curved box magazine swept to thickness. */
function magazine(group, {
  z = 0.02, top = -0.012, depth = 0.20, curve = 0.16, width = 0.05, material,
}) {
  const pts = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([z + Math.sin(t * curve) * depth * 0.9, top - t * depth]);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    pts.push([z + 0.062 + Math.sin(t * curve) * depth * 0.9, top - t * depth]);
  }
  group.add(slab(pts, {
    thickness: width, bevel: 0.004,
    material: material ?? GUN_MATS.polymer,
  }));
}

/** Pistol grip: a raked, bevelled slab. */
function grip(group, { z = -0.02, material }) {
  const pts = [
    [z + 0.005, -0.012], [z + 0.062, -0.012],
    [z + 0.040, -0.145], [z - 0.012, -0.145],
  ];
  group.add(slab(pts, { thickness: 0.048, bevel: 0.006, material: material ?? GUN_MATS.polymer }));
}

/** Trigger guard and trigger. */
function triggerGroup(group, z = 0.0) {
  const guard = ring(0.030, 0.005);
  guard.rotation.y = Math.PI / 2;
  group.add(at(guard, 0, -0.028, z + 0.012));
  group.add(at(slab([[z, -0.030], [z + 0.008, -0.030], [z + 0.010, -0.006], [z + 0.002, -0.006]],
    { thickness: 0.012, bevel: 0.002 }), 0, 0, 0));
}

/** Iron sights: a hooded front post and a rear aperture. */
function ironSights(group, { front, rear, height = 0.036 }) {
  const post = slab([[front - 0.006, 0.012], [front + 0.006, 0.012],
    [front + 0.006, height], [front - 0.006, height]],
  { thickness: 0.010, bevel: 0.002 });
  group.add(post);
  const hood = ring(0.014, 0.0035);
  hood.rotation.y = Math.PI / 2;
  group.add(at(hood, 0, height - 0.010, front));

  const leaf = slab([[rear - 0.010, 0.014], [rear + 0.010, 0.014],
    [rear + 0.010, height - 0.006], [rear - 0.010, height - 0.006]],
  { thickness: 0.030, bevel: 0.002 });
  group.add(leaf);
}

/** A telescopic sight on rings. */
function scope(group, { z = 0.06, power = 4 }) {
  const long = power > 4;
  const len = long ? 0.30 : 0.22;
  const r = long ? 0.021 : 0.018;
  const back = z - len / 2, front = z + len / 2;
  const profile = [
    [0, back], [r * 1.55, back], [r * 1.55, back + 0.035],
    [r, back + 0.055], [r, front - 0.075], [r * 1.35, front - 0.055],
    [r * 1.35, front], [0, front],
  ];
  const body = turned(profile, { segments: 16, material: GUN_MATS.parkerised });
  group.add(at(body, 0, 0.062, 0));

  for (const zz of [back + 0.004, front - 0.004]) {
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.28, 16), GUN_MATS.glass);
    lens.rotation.y = zz > z ? 0 : Math.PI;
    group.add(at(lens, 0, 0.062, zz + (zz > z ? 0.001 : -0.001)));
  }
  // Turrets and rings.
  group.add(at(turned([[0, 0], [0.013, 0], [0.013, 0.022], [0, 0.022]],
    { segments: 10, material: GUN_MATS.parkerised }), 0, 0.062, z, -Math.PI / 2, 0, 0));
  for (const zz of [z - len * 0.28, z + len * 0.28]) {
    const rr = ring(r * 1.5, 0.006);
    rr.rotation.y = Math.PI / 2;
    group.add(at(rr, 0, 0.062, zz));
    group.add(at(slab([[zz - 0.010, 0.030], [zz + 0.010, 0.030],
      [zz + 0.010, 0.058], [zz - 0.010, 0.058]], { thickness: 0.020, bevel: 0.002 }), 0, 0, 0));
  }
}

/** Picatinny-style rail on top of the receiver. */
function rail(group, { from, to, y = 0.034 }) {
  group.add(slab(roundedOutline(from, to, y, y + 0.010, 0.003),
    { thickness: 0.021, bevel: 0.002 }));
  const n = Math.max(3, Math.round((to - from) / 0.012));
  for (let i = 0; i < n; i++) {
    const z = from + (i + 0.5) * ((to - from) / n);
    group.add(slab([[z - 0.002, y + 0.002], [z + 0.002, y + 0.002],
      [z + 0.002, y + 0.010], [z - 0.002, y + 0.010]],
    { thickness: 0.023, bevel: 0 }));
  }
}

// ---- the guns ------------------------------------------------------------

/**
 * Kalashnikov pattern: milled receiver, wooden furniture, the long gas tube
 * and the slanted muzzle brake that make its silhouette unmistakable.
 */
function buildAK(def) {
  const g = new THREE.Group();
  const wood = GUN_MATS.wood;

  // Receiver.
  g.add(slab(roundedOutline(-0.09, 0.15, -0.012, 0.032, 0.010),
    { thickness: 0.048, material: GUN_MATS.parkerised }));
  // Dust cover with its rib.
  g.add(slab(roundedOutline(-0.05, 0.13, 0.030, 0.044, 0.006),
    { thickness: 0.044, material: GUN_MATS.parkerised }));

  barrel(g, { from: 0.14, to: 0.40, r: 0.0115 });
  // Slanted muzzle brake.
  g.add(turned([[0, 0.40], [0.019, 0.40], [0.019, 0.455], [0.012, 0.455], [0, 0.455]],
    { segments: 12 }));

  // Wooden handguard, upper and lower.
  g.add(slab(roundedOutline(0.155, 0.30, 0.004, 0.038, 0.010),
    { thickness: 0.050, material: wood }));
  g.add(slab(roundedOutline(0.150, 0.29, -0.030, 0.002, 0.010),
    { thickness: 0.052, material: wood }));
  // Gas tube above the handguard.
  g.add(at(rod(0.0085, 0.15), 0, 0.041, 0.225));

  magazine(g, { z: 0.010, top: -0.014, depth: 0.185, curve: 0.26, width: 0.046, material: wood });
  grip(g, { z: -0.048, material: wood });
  triggerGroup(g, -0.012);

  // Stock: a bevelled wooden blade with a butt plate.
  g.add(slab([[-0.09, -0.006], [-0.09, 0.030], [-0.30, 0.018], [-0.30, -0.048], [-0.09, -0.014]],
    { thickness: 0.044, bevel: 0.006, material: wood }));
  g.add(at(slab([[-0.315, -0.050], [-0.298, -0.050], [-0.298, 0.020], [-0.315, 0.020]],
    { thickness: 0.048, bevel: 0.003 }), 0, 0, 0));

  if (def.scope) scope(g, { z: 0.06, power: def.scopeZoom ?? 4 });
  else ironSights(g, { front: 0.335, rear: 0.055, height: 0.052 });

  g.userData.muzzleZ = 0.455;
  return g;
}

/** AR pattern: flat-top upper, round handguard, collapsible stock. */
function buildAR(def) {
  const g = new THREE.Group();

  g.add(slab(roundedOutline(-0.07, 0.12, -0.010, 0.034, 0.010),
    { thickness: 0.046, material: GUN_MATS.polymer }));
  // Upper receiver with its carry-handle-height flat top.
  g.add(slab(roundedOutline(-0.02, 0.14, 0.030, 0.048, 0.006),
    { thickness: 0.044, material: GUN_MATS.parkerised }));

  barrel(g, { from: 0.14, to: 0.42, r: 0.0105 });
  g.add(turned([[0, 0.42], [0.016, 0.42], [0.016, 0.455], [0.010, 0.455], [0, 0.455]],
    { segments: 12 }));

  // Round free-float handguard with vent slots.
  g.add(at(turned([
    [0, 0.145], [0.026, 0.148], [0.026, 0.320], [0.021, 0.325], [0, 0.325],
  ], { segments: 14, material: GUN_MATS.parkerised }), 0, 0.016, 0));
  for (let i = 0; i < 7; i++) {
    const z = 0.165 + i * 0.021;
    for (const s of [-1, 1]) {
      g.add(at(slab([[z, 0.004], [z + 0.012, 0.004], [z + 0.012, 0.024], [z, 0.024]],
        { thickness: 0.004, bevel: 0, material: GUN_MATS.blued }), s * 0.026, 0, 0));
    }
  }

  rail(g, { from: -0.02, to: 0.32, y: 0.046 });
  magazine(g, { z: 0.008, top: -0.012, depth: 0.175, curve: 0.16, width: 0.044 });
  grip(g, { z: -0.040 });
  triggerGroup(g, -0.010);

  // Buffer tube and collapsible stock.
  g.add(at(rod(0.018, 0.20), 0, 0.014, -0.17));
  g.add(slab([[-0.09, -0.020], [-0.09, 0.036], [-0.24, 0.030], [-0.26, -0.006], [-0.20, -0.040]],
    { thickness: 0.046, bevel: 0.006, material: GUN_MATS.polymer }));

  if (def.scope) scope(g, { z: 0.08, power: def.scopeZoom ?? 3 });
  else ironSights(g, { front: 0.315, rear: 0.030, height: 0.060 });

  g.userData.muzzleZ = 0.455;
  return g;
}

/** Dragunov-pattern marksman rifle: long barrel, skeleton stock, big optic. */
function buildSniper(def) {
  const g = new THREE.Group();
  const wood = GUN_MATS.wood;

  g.add(slab(roundedOutline(-0.10, 0.16, -0.014, 0.034, 0.010),
    { thickness: 0.046, material: GUN_MATS.parkerised }));
  barrel(g, { from: 0.16, to: 0.60, r: 0.0105 });
  g.add(turned([[0, 0.60], [0.017, 0.60], [0.017, 0.645], [0.011, 0.645], [0, 0.645]],
    { segments: 12 }));

  // Slotted wooden handguard.
  g.add(slab(roundedOutline(0.17, 0.34, -0.006, 0.034, 0.012),
    { thickness: 0.052, material: wood }));
  for (let i = 0; i < 3; i++) {
    const z = 0.20 + i * 0.045;
    for (const s of [-1, 1]) {
      g.add(at(slab([[z, 0.002], [z + 0.028, 0.002], [z + 0.028, 0.022], [z, 0.022]],
        { thickness: 0.004, bevel: 0, material: GUN_MATS.blued }), s * 0.027, 0, 0));
    }
  }

  magazine(g, { z: 0.016, top: -0.016, depth: 0.135, curve: 0.20, width: 0.040 });
  grip(g, { z: -0.052, material: wood });
  triggerGroup(g, -0.016);

  // Skeleton stock: a thumbhole frame with a cheek riser.
  g.add(slab([
    [-0.10, -0.010], [-0.10, 0.030], [-0.34, 0.026], [-0.34, -0.040],
    [-0.22, -0.048], [-0.18, -0.016], [-0.13, -0.012],
  ], { thickness: 0.040, bevel: 0.006, material: wood }));
  g.add(at(slab([[-0.30, 0.026], [-0.16, 0.030], [-0.16, 0.056], [-0.30, 0.052]],
    { thickness: 0.036, bevel: 0.005, material: wood }), 0, 0, 0));

  scope(g, { z: 0.075, power: def.scopeZoom ?? 6 });

  // Bipod.
  for (const s of [-1, 1]) {
    g.add(at(rod(0.005, 0.16), s * 0.024, -0.075, 0.36, 0.42, 0, s * 0.22));
  }

  g.userData.muzzleZ = 0.645;
  return g;
}

/** Pump shotgun: tube magazine under a heavy barrel, wooden pump. */
function buildShotgun() {
  const g = new THREE.Group();
  const wood = GUN_MATS.wood;

  g.add(slab(roundedOutline(-0.08, 0.10, -0.010, 0.036, 0.012),
    { thickness: 0.050, material: GUN_MATS.parkerised }));
  barrel(g, { from: 0.10, to: 0.46, r: 0.0165, gasBlock: false });
  // Tube magazine below.
  g.add(at(turned([[0, 0.10], [0.0135, 0.10], [0.0135, 0.42], [0.010, 0.43], [0, 0.43]],
    { segments: 12 }), 0, -0.032, 0));
  // Pump.
  g.add(at(turned([[0, 0.24], [0.030, 0.245], [0.030, 0.345], [0.026, 0.35], [0, 0.35]],
    { segments: 14, material: wood }), 0, -0.030, 0));
  for (let i = 0; i < 8; i++) {
    const z = 0.252 + i * 0.012;
    g.add(at(ring(0.030, 0.0022, { material: wood }), 0, -0.030, z, 0, Math.PI / 2, 0));
  }
  // Barrel band.
  g.add(at(ring(0.020, 0.004), 0, -0.016, 0.40, 0, Math.PI / 2, 0));

  grip(g, { z: -0.036, material: wood });
  triggerGroup(g, -0.010);
  g.add(slab([[-0.08, -0.010], [-0.08, 0.034], [-0.30, 0.020], [-0.30, -0.056], [-0.12, -0.026]],
    { thickness: 0.046, bevel: 0.007, material: wood }));

  ironSights(g, { front: 0.44, rear: 0.06, height: 0.030 });
  g.userData.muzzleZ = 0.46;
  return g;
}

/** Compact SMG: stubby barrel, folding wire stock, vertical magazine. */
function buildSMG(def) {
  const g = new THREE.Group();

  g.add(slab(roundedOutline(-0.06, 0.13, -0.010, 0.038, 0.012),
    { thickness: 0.044, material: GUN_MATS.polymer }));
  barrel(g, { from: 0.13, to: 0.25, r: 0.0095, gasBlock: false });
  g.add(at(turned([[0, 0.16], [0.023, 0.163], [0.023, 0.248], [0.018, 0.252], [0, 0.252]],
    { segments: 12, material: GUN_MATS.parkerised }), 0, 0.012, 0));

  magazine(g, { z: 0.006, top: -0.010, depth: 0.24, curve: 0.10, width: 0.040 });
  grip(g, { z: -0.038 });
  triggerGroup(g, -0.008);
  rail(g, { from: -0.02, to: 0.12, y: 0.040 });

  // Folding wire stock.
  for (const s of [-1, 1]) {
    g.add(at(rod(0.005, 0.17), s * 0.026, 0.012, -0.145));
  }
  g.add(at(slab([[-0.235, -0.014], [-0.220, -0.014], [-0.220, 0.038], [-0.235, 0.038]],
    { thickness: 0.058, bevel: 0.003 }), 0, 0, 0));

  if (def.scope) scope(g, { z: 0.05, power: def.scopeZoom ?? 2 });
  else ironSights(g, { front: 0.235, rear: 0.020, height: 0.052 });

  g.userData.muzzleZ = 0.252;
  return g;
}

/** Belt-fed light machine gun: heavy barrel, box, bipod, carry handle. */
function buildLMG() {
  const g = new THREE.Group();

  g.add(slab(roundedOutline(-0.10, 0.17, -0.016, 0.040, 0.012),
    { thickness: 0.056, material: GUN_MATS.parkerised }));
  barrel(g, { from: 0.17, to: 0.55, r: 0.0135 });
  g.add(turned([[0, 0.55], [0.020, 0.55], [0.020, 0.60], [0.013, 0.60], [0, 0.60]],
    { segments: 12 }));
  // Heat-shield slots along the barrel shroud.
  g.add(at(turned([[0, 0.20], [0.026, 0.203], [0.026, 0.40], [0.021, 0.405], [0, 0.405]],
    { segments: 14, material: GUN_MATS.parkerised }), 0, 0.006, 0));
  for (let i = 0; i < 6; i++) {
    const z = 0.215 + i * 0.030;
    for (const s of [-1, 1]) {
      g.add(at(slab([[z, 0.000], [z + 0.018, 0.000], [z + 0.018, 0.020], [z, 0.020]],
        { thickness: 0.004, bevel: 0, material: GUN_MATS.blued }), s * 0.027, 0, 0));
    }
  }
  // Carry handle.
  g.add(at(slab([[0.18, 0.046], [0.26, 0.046], [0.26, 0.062], [0.18, 0.062]],
    { thickness: 0.016, bevel: 0.003 }), 0, 0, 0));

  // Ammunition box.
  g.add(slab(roundedOutline(-0.02, 0.12, -0.145, -0.020, 0.012),
    { thickness: 0.086, material: GUN_MATS.polymer }));
  grip(g, { z: -0.062 });
  triggerGroup(g, -0.020);
  g.add(slab([[-0.10, -0.014], [-0.10, 0.034], [-0.32, 0.024], [-0.32, -0.052], [-0.14, -0.030]],
    { thickness: 0.050, bevel: 0.007, material: GUN_MATS.polymer }));

  for (const s of [-1, 1]) {
    g.add(at(rod(0.006, 0.22), s * 0.028, -0.100, 0.44, 0.40, 0, s * 0.24));
  }
  ironSights(g, { front: 0.50, rear: 0.03, height: 0.058 });
  g.userData.muzzleZ = 0.60;
  return g;
}

/** Service pistol: slide, frame, magazine well. */
function buildPistol() {
  const g = new THREE.Group();

  // Slide, with the ejection port cut into its side.
  g.add(slab(roundedOutline(-0.055, 0.115, 0.006, 0.048, 0.008),
    { thickness: 0.030, material: GUN_MATS.blued }));
  g.add(at(slab([[0.02, 0.018], [0.062, 0.018], [0.062, 0.040], [0.02, 0.040]],
    { thickness: 0.006, bevel: 0, material: GUN_MATS.parkerised }), 0.013, 0, 0));
  // Serrations.
  for (let i = 0; i < 6; i++) {
    const z = -0.048 + i * 0.008;
    g.add(slab([[z, 0.010], [z + 0.003, 0.010], [z + 0.003, 0.044], [z, 0.044]],
      { thickness: 0.032, bevel: 0 }));
  }
  // Barrel poking out of the slide.
  g.add(at(turned([[0, 0.108], [0.0085, 0.108], [0.0085, 0.128], [0.006, 0.128], [0, 0.128]],
    { segments: 10 }), 0, 0.026, 0));

  // Frame and grip.
  g.add(slab(roundedOutline(-0.050, 0.075, -0.010, 0.008, 0.005),
    { thickness: 0.028, material: GUN_MATS.polymer }));
  g.add(slab([[-0.046, -0.008], [-0.004, -0.008], [0.012, -0.115], [-0.030, -0.118]],
    { thickness: 0.030, bevel: 0.005, material: GUN_MATS.polymer }));
  triggerGroup(g, 0.006);
  // Sights.
  g.add(slab([[0.100, 0.048], [0.108, 0.048], [0.108, 0.060], [0.100, 0.060]],
    { thickness: 0.006, bevel: 0.001 }));
  g.add(slab([[-0.040, 0.048], [-0.030, 0.048], [-0.030, 0.058], [-0.040, 0.058]],
    { thickness: 0.020, bevel: 0.001 }));

  g.userData.muzzleZ = 0.128;
  return g;
}

const BUILDERS = {
  rifle: (def) => (def.id === 'ak_sangar' ? buildAK(def) : buildAR(def)),
  smg: buildSMG,
  sniper: buildSniper,
  marksman: buildSniper,
  shotgun: buildShotgun,
  lmg: buildLMG,
  pistol: buildPistol,
};

/** Builds the model for a weapon definition, with a muzzle anchor attached. */
export function buildWeaponModel(def) {
  const builder = BUILDERS[def.kind] || BUILDERS.rifle;
  const group = builder(def);
  group.name = `weapon:${def.id}`;
  group.userData.def = def;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, def.kind === 'pistol' ? 0.026 : 0.0,
    (group.userData.muzzleZ ?? 0.45) + 0.01);
  muzzle.name = 'muzzle';
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  return group;
}
