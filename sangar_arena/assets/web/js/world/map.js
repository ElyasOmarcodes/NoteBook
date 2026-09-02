import * as THREE from '../../vendor/three.module.js';
import { Batcher } from './batcher.js';
import { box, cylinderUV, aabb } from './geom.js';
import { material, signTexture, skyTexture } from './textures.js';
import { DISTRICTS, MAP_SIZE } from '../config.js';

const HALF = MAP_SIZE / 2;

/**
 * "Sangar Chowk" — a 220 m refinery yard in four named districts.
 *
 * The layout is deliberately readable: an asphalt ring road separates four
 * quadrants, each with its own silhouette (tank farm, warehouse row, container
 * yard, the two-storey chowk building) so a player always knows where they
 * are. Roof access is spread across four different mechanics — wooden stairs,
 * a ladder, a tank service ladder and a step-up crate route — and the roofs are
 * linked by catwalks and a pipe run that are only visible once you are up
 * there.
 */
export class ArenaMap {
  constructor(quality) {
    this.quality = quality;
    this.group = new THREE.Group();
    this.batcher = new Batcher();

    /** Axis-aligned solid volumes. */
    this.solids = [];
    /** Upright cylinders (oil tanks) — cheap radial collision. */
    this.cylinders = [];
    /** Climbable volumes. */
    this.ladders = [];
    /** Ammo crates the player can stand next to to resupply. */
    this.ammoBoxes = [];
    /** Spawn points per team. */
    this.spawns = [[], []];
    /** Named callouts drawn on the minimap. */
    this.places = [];
    /** Board meshes are kept out of the batch so they can use their own map. */
    this.signs = new THREE.Group();
  }

  build() {
    this._ground();
    this._perimeter();
    this._ringRoad();
    this._districtSangar();
    this._districtShamshad();
    this._districtHindukush();
    this._districtRubAlKhali();
    this._connectors();
    this._props();
    this._spawnPoints();

    this.group.add(this.batcher.build(this.quality));
    this.group.add(this.signs);
    return this;
  }

  // =======================================================================
  // primitives
  // =======================================================================

  /**
   * Places a textured box and (unless `solid:false`) registers its collider.
   */
  addBox(mat, w, h, d, x, y, z, opts = {}) {
    const { density = 0.45, solid = true, rotY = 0, walkable = true } = opts;
    const g = box(w, h, d, density);
    const m = new THREE.Matrix4();
    if (rotY) {
      m.makeRotationY(rotY);
      m.setPosition(x, y, z);
    } else {
      m.makeTranslation(x, y, z);
    }
    this.batcher.add(mat, g, m, {});
    g.dispose();
    if (solid) {
      // Rotated colliders are approximated by their axis-aligned envelope,
      // which is fine because everything rotated here is either square in plan
      // or a thin plank.
      const cos = Math.abs(Math.cos(rotY)), sin = Math.abs(Math.sin(rotY));
      const ew = w * cos + d * sin;
      const ed = w * sin + d * cos;
      const solidBox = aabb(x, y, z, ew, h, ed);
      solidBox.walkable = walkable;
      this.solids.push(solidBox);
    }
    return this;
  }

  addCylinder(mat, radius, height, x, y, z, opts = {}) {
    const { segments = 24, density = 0.35, solid = true } = opts;
    const g = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
    cylinderUV(g, radius, height, density);
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    this.batcher.add(mat, g, m, {});
    g.dispose();
    if (solid) {
      this.cylinders.push({
        x, z, r: radius,
        minY: y - height / 2,
        maxY: y + height / 2,
      });
    }
    return this;
  }

  /** A ladder: two rails plus rungs, and a climb volume. */
  addLadder(x, z, fromY, toY, facing, opts = {}) {
    const { width = 0.78, wood = true } = opts;
    const height = toY - fromY;
    const midY = fromY + height / 2;
    const mat = wood ? 'wood' : 'plate';
    const nx = Math.sin(facing), nz = Math.cos(facing);
    // side rails
    const offX = Math.cos(facing) * width / 2;
    const offZ = -Math.sin(facing) * width / 2;
    this.addBox(mat, 0.09, height, 0.09, x + offX, midY, z + offZ, { solid: false, density: 2 });
    this.addBox(mat, 0.09, height, 0.09, x - offX, midY, z - offZ, { solid: false, density: 2 });
    // rungs
    const rungs = Math.max(2, Math.floor(height / 0.32));
    for (let i = 0; i <= rungs; i++) {
      const y = fromY + (height * i) / rungs;
      this.addBox(mat, width, 0.055, 0.06, x, y, z, {
        solid: false, rotY: facing, density: 2,
      });
    }
    this.ladders.push({
      x, z, minY: fromY - 0.3, maxY: toY + 0.9,
      radius: 0.95, nx, nz,
    });
    return this;
  }

  /**
   * A run of wooden steps. `facing` is the direction you walk while climbing.
   */
  addStairs(x, y, z, facing, steps, opts = {}) {
    const { width = 2.0, rise = 0.34, run = 0.42, rail = true } = opts;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    for (let i = 0; i < steps; i++) {
      const sy = y + rise * (i + 0.5);
      const sx = x + fx * run * (i + 0.5);
      const sz = z + fz * run * (i + 0.5);
      this.addBox('wood', width, rise, run + 0.06, sx, sy, sz, {
        rotY: facing, density: 1.6,
      });
    }
    if (rail) {
      const len = run * steps;
      const cx = x + fx * len / 2, cz = z + fz * len / 2;
      const railY = y + rise * steps / 2 + 0.95;
      const ox = Math.cos(facing) * width / 2, oz = -Math.sin(facing) * width / 2;
      for (const s of [1, -1]) {
        const g = box(0.07, 0.07, len, 1.5);
        const m = new THREE.Matrix4();
        m.makeRotationX(Math.atan2(rise * steps, len));
        m.premultiply(new THREE.Matrix4().makeRotationY(facing));
        m.setPosition(cx + ox * s, railY, cz + oz * s);
        this.batcher.add('wood', g, m, {});
        g.dispose();
        // posts
        for (let i = 0; i <= steps; i += 3) {
          const py = y + rise * i + 0.5;
          this.addBox('wood', 0.08, 1.0, 0.08,
            x + fx * run * i + ox * s, py, z + fz * run * i + oz * s,
            { solid: false, density: 2 });
        }
      }
    }
    return this;
  }

  /**
   * A narrow plank catwalk between two roofs. These are the map's quiet
   * shortcuts: from ground level they read as pipework.
   */
  addCatwalk(x1, z1, x2, z2, y, opts = {}) {
    const { width = 0.95, rails = true, mat = 'plate' } = opts;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    this.addBox(mat, width, 0.12, len, cx, y, cz, { rotY: angle, density: 1.1 });
    if (rails) {
      const ox = Math.cos(angle) * width / 2, oz = -Math.sin(angle) * width / 2;
      for (const s of [1, -1]) {
        this.addBox('plate', 0.06, 0.06, len, cx + ox * s, y + 0.92, cz + oz * s,
          { rotY: angle, solid: false, density: 1.5 });
        const posts = Math.max(2, Math.round(len / 2.4));
        for (let i = 0; i <= posts; i++) {
          const t = i / posts;
          this.addBox('plate', 0.06, 0.92, 0.06,
            x1 + dx * t + ox * s, y + 0.46, z1 + dz * t + oz * s,
            { solid: false, density: 2 });
        }
      }
    }
    return this;
  }

  /** A pipe run — decorative from below, walkable if you find the way up. */
  addPipe(x1, z1, x2, z2, y, radius = 0.42) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const g = new THREE.CylinderGeometry(radius, radius, len, 12, 1);
    cylinderUV(g, radius, len, 0.5);
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeRotationY(Math.atan2(dx, dz)));
    m.setPosition((x1 + x2) / 2, y, (z1 + z2) / 2);
    this.batcher.add('tank', g, m, {});
    g.dispose();
    // Walkable top surface, one plank wide.
    const b = aabb((x1 + x2) / 2, y + radius / 2, (z1 + z2) / 2,
      Math.abs(dx) + radius * 2, radius, Math.abs(dz) + radius * 2);
    b.walkable = true;
    this.solids.push(b);
    return this;
  }

  /**
   * A signboard on two posts. Boards carry Pashto above and Latin below so a
   * newcomer picks up the callouts in either script.
   */
  addSign(x, y, z, rotY, pashto, latin, colour, opts = {}) {
    const { width = 5.2, height = 2.6, posts = true } = opts;
    const tex = signTexture(pashto, latin, `#${colour.toString(16).padStart(6, '0')}`);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.86, metalness: 0.06,
      side: THREE.DoubleSide,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    plate.position.set(x, y, z);
    plate.rotation.y = rotY;
    plate.castShadow = false;
    plate.receiveShadow = true;
    this.signs.add(plate);

    // A thin backing box so the board is solid and has depth from the side.
    // It must sit behind the plate along the board's *normal* — offsetting
    // along the tangent instead leaves the printed face inside the box.
    const nx = Math.sin(rotY) * 0.14, nz = Math.cos(rotY) * 0.14;
    this.addBox('plate', width, height, 0.16, x - nx, y, z - nz,
      { rotY, density: 0.9 });
    plate.position.set(x + nx * 0.15, y, z + nz * 0.15);

    if (posts) {
      const ox = Math.cos(rotY) * (width / 2 - 0.4);
      const oz = -Math.sin(rotY) * (width / 2 - 0.4);
      for (const s of [1, -1]) {
        this.addBox('plate', 0.18, y, 0.18, x + ox * s, y / 2, z + oz * s,
          { density: 1.4 });
      }
    }
    this.places.push({ x, z, ps: pashto, en: latin });
    return this;
  }

  // =======================================================================
  // districts
  // =======================================================================

  _ground() {
    const g = new THREE.PlaneGeometry(MAP_SIZE + 40, MAP_SIZE + 40, 1, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * 130, uv.getY(i) * 130);
    }
    const mesh = new THREE.Mesh(g, material('gravel', {
      repeat: [1, 1], aniso: this.quality.aniso, roughness: 0.98,
    }));
    mesh.receiveShadow = true;
    mesh.position.y = -0.02;
    this.group.add(mesh);

    const floor = aabb(0, -1.0, 0, MAP_SIZE + 40, 2, MAP_SIZE + 40);
    floor.walkable = true;
    this.solids.push(floor);
  }

  _perimeter() {
    const wallH = 6.5, t = 0.7;
    const sides = [
      { x: 0, z: -HALF, w: MAP_SIZE, d: t, rot: 0 },
      { x: 0, z: HALF, w: MAP_SIZE, d: t, rot: 0 },
      { x: -HALF, z: 0, w: t, d: MAP_SIZE, rot: 0 },
      { x: HALF, z: 0, w: t, d: MAP_SIZE, rot: 0 },
    ];
    for (const s of sides) {
      this.addBox('wall', s.w, wallH, s.d, s.x, wallH / 2, s.z, { density: 0.35 });
      // capping course
      this.addBox('concrete', s.w + 0.3, 0.34, s.d + 0.3, s.x, wallH + 0.17, s.z,
        { density: 0.6, solid: false });
    }
    // pilasters every 12 m for the precast look of the reference shots
    for (let i = -HALF + 6; i < HALF; i += 12) {
      this.addBox('concrete', 1.0, wallH + 0.5, 1.0, i, (wallH + 0.5) / 2, -HALF, { density: 0.7 });
      this.addBox('concrete', 1.0, wallH + 0.5, 1.0, i, (wallH + 0.5) / 2, HALF, { density: 0.7 });
      this.addBox('concrete', 1.0, wallH + 0.5, 1.0, -HALF, (wallH + 0.5) / 2, i, { density: 0.7 });
      this.addBox('concrete', 1.0, wallH + 0.5, 1.0, HALF, (wallH + 0.5) / 2, i, { density: 0.7 });
    }

    // One large board on the inner face of each perimeter wall.
    const inset = HALF - 1.6;
    this.addSign(0, 4.2, -inset, 0, DISTRICTS[0].ps, DISTRICTS[0].en, DISTRICTS[0].color,
      { width: 9, height: 4.2, posts: false });
    this.addSign(0, 4.2, inset, Math.PI, DISTRICTS[3].ps, DISTRICTS[3].en, DISTRICTS[3].color,
      { width: 9, height: 4.2, posts: false });
    this.addSign(-inset, 4.2, 0, Math.PI / 2, DISTRICTS[2].ps, DISTRICTS[2].en, DISTRICTS[2].color,
      { width: 9, height: 4.2, posts: false });
    this.addSign(inset, 4.2, 0, -Math.PI / 2, DISTRICTS[1].ps, DISTRICTS[1].en, DISTRICTS[1].color,
      { width: 9, height: 4.2, posts: false });
  }

  _ringRoad() {
    // A wide asphalt ring plus two cross streets, laid just above the gravel.
    const roadY = 0.02;
    const w = 14;
    const addRoad = (x, z, sw, sd) => {
      const g = new THREE.PlaneGeometry(sw, sd);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * sw * 0.25, uv.getY(i) * sd * 0.25);
      }
      const m = new THREE.Matrix4().makeTranslation(x, roadY, z);
      this.batcher.add('asphalt', g, m, {});
      g.dispose();
    };
    addRoad(0, -62, MAP_SIZE - 24, w);
    addRoad(0, 62, MAP_SIZE - 24, w);
    addRoad(-62, 0, w, MAP_SIZE - 24);
    addRoad(62, 0, w, MAP_SIZE - 24);
    addRoad(0, 0, MAP_SIZE - 24, w);   // central east-west street
    addRoad(0, 0, w, MAP_SIZE - 24);   // central north-south street
  }

  /** North-west: the chowk itself — a two-storey block and open square. */
  _districtSangar() {
    const cx = -52, cz = -52;

    // Two-storey command block with a walkable roof (the map's best vantage).
    this._building({
      x: cx, z: cz, w: 26, d: 18, h: 9.2,
      wall: 'brick', roof: 'concrete', parapet: 1.1,
      windows: true,
    });
    // Ladder up the east face.
    this.addLadder(cx + 13.4, cz + 4, 0, 9.2, -Math.PI / 2);
    // Second, quieter ladder tucked behind the block.
    this.addLadder(cx - 13.4, cz - 5.5, 0, 9.2, Math.PI / 2);

    // Lower annex you can step onto from the crates, then hop to the block.
    this._building({
      x: cx + 20, z: cz + 15, w: 12, d: 10, h: 4.4,
      wall: 'sidingBlue', roof: 'plate', parapet: 0.5,
    });
    // Crate ladder of opportunity: 0.9 -> 1.8 -> 2.7 -> annex roof.
    this._crateSteps(cx + 26.5, cz + 21.5, 0);

    // Sandbag sangars around the square.
    this._sangarNest(cx + 6, cz + 26, 0);
    this._sangarNest(cx - 20, cz + 20, Math.PI / 4);
    this._sangarNest(cx + 24, cz - 18, -Math.PI / 3);

    this.addSign(cx, 3.0, cz + 26, 0, DISTRICTS[0].ps, DISTRICTS[0].en, DISTRICTS[0].color);
    this.places.push({ x: cx, z: cz, ps: DISTRICTS[0].ps, en: DISTRICTS[0].en });
  }

  /** North-east: the warehouse row with wooden stairs to the long roof. */
  _districtShamshad() {
    const cx = 54, cz = -50;

    this._warehouse({ x: cx, z: cz - 16, w: 34, d: 16, h: 7.6, ridge: 2.4, wall: 'sidingRed' });
    this._warehouse({ x: cx, z: cz + 12, w: 34, d: 16, h: 7.6, ridge: 2.4, wall: 'sidingGrey' });

    // Wooden stair flight up to the northern warehouse roof.
    this.addStairs(cx - 21, 0, cz - 22, 0, 22, { width: 2.2 });
    // Landing that meets the eave.
    this.addBox('wood', 3.0, 0.16, 3.0, cx - 21, 7.6, cz - 13.6, { density: 1.4 });
    this.addBox('wood', 3.0, 0.9, 0.1, cx - 21, 8.1, cz - 15.0, { solid: false, density: 2 });

    // Ladder linking the two warehouse roofs by way of a low store.
    this._building({ x: cx + 22, z: cz, w: 10, d: 12, h: 4.6, wall: 'sidingBlue', roof: 'plate', parapet: 0.4 });
    this.addLadder(cx + 22, cz - 6.4, 0, 4.6, 0);

    this.addSign(cx - 4, 3.0, cz + 26, 0, DISTRICTS[1].ps, DISTRICTS[1].en, DISTRICTS[1].color);
    this.places.push({ x: cx, z: cz, ps: DISTRICTS[1].ps, en: DISTRICTS[1].en });
  }

  /** South-west: the tank farm. Tall, round cover and a service ladder. */
  _districtHindukush() {
    const cx = -54, cz = 50;
    const tanks = [
      { x: cx - 16, z: cz - 14, r: 8.5, h: 12 },
      { x: cx + 6, z: cz - 16, r: 8.5, h: 12 },
      { x: cx - 14, z: cz + 10, r: 10, h: 14.5 },
      { x: cx + 10, z: cz + 8, r: 7, h: 10 },
    ];
    for (const t of tanks) {
      this.addCylinder('tank', t.r, t.h, t.x, t.h / 2, t.z, { segments: 28 });
      // walkable lid + guard rail
      this.addCylinder('plate', t.r + 0.25, 0.4, t.x, t.h + 0.2, t.z,
        { segments: 28, solid: false });
      const lid = aabb(t.x, t.h + 0.2, t.z, (t.r + 0.25) * 2, 0.4, (t.r + 0.25) * 2);
      lid.walkable = true;
      lid.round = { x: t.x, z: t.z, r: t.r + 0.25 };
      this.solids.push(lid);
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        this.addBox('plate', 0.07, 1.0, 0.07,
          t.x + Math.cos(ang) * t.r, t.h + 0.9, t.z + Math.sin(ang) * t.r,
          { solid: false, density: 2 });
      }
      // connecting pipework at the base
      this.addPipe(t.x, t.z, t.x + 6, t.z, 1.6, 0.34);
    }
    // Service ladder up the biggest tank.
    const big = tanks[2];
    this.addLadder(big.x, big.z + big.r + 0.15, 0, big.h + 0.4, 0, { wood: false });
    // High pipe bridge between two tank lids — a quiet flank for anyone who
    // notices it from the roofs.
    this.addPipe(tanks[0].x, tanks[0].z, tanks[2].x, tanks[2].z, 12.3, 0.5);
    this.addCatwalk(tanks[2].x, tanks[2].z + 2, tanks[3].x, tanks[3].z - 2, 12.4,
      { width: 0.9 });

    this.addSign(cx + 2, 3.0, cz - 30, Math.PI, DISTRICTS[2].ps, DISTRICTS[2].en, DISTRICTS[2].color);
    this.places.push({ x: cx, z: cz, ps: DISTRICTS[2].ps, en: DISTRICTS[2].en });
  }

  /** South-east: stacked containers, a maze at ground level. */
  _districtRubAlKhali() {
    const cx = 52, cz = 52;
    const mats = ['containerBlue', 'containerRust', 'containerGreen'];
    const layout = [
      [-18, -16, 0, 2], [-6, -16, 0, 1], [6, -18, Math.PI / 2, 2],
      [-20, 0, Math.PI / 2, 1], [-4, 2, 0, 3], [12, 0, 0, 2],
      [-16, 16, 0, 2], [0, 18, Math.PI / 2, 1], [16, 16, 0, 1],
      [20, -6, Math.PI / 2, 2],
    ];
    let n = 0;
    for (const [ox, oz, rot, stack] of layout) {
      for (let s = 0; s < stack; s++) {
        this.addBox(mats[n % 3], 12.2, 2.9, 2.9,
          cx + ox, 1.45 + s * 2.95, cz + oz, { rotY: rot, density: 0.55 });
        n++;
      }
    }
    // Step-up route: pallet -> crate -> single container -> double stack.
    this._crateSteps(cx - 9, cz - 12, 0);

    // Hidden ladder behind the tallest stack, only visible from the alley.
    this.addLadder(cx - 4, cz + 4.0, 0, 8.85, Math.PI);

    // Catwalk from the container tops toward the warehouse row.
    this.addCatwalk(cx - 4, cz - 1, cx - 4, cz - 14, 8.9, { width: 0.9 });

    this.addSign(cx - 6, 3.0, cz - 30, Math.PI, DISTRICTS[3].ps, DISTRICTS[3].en, DISTRICTS[3].color);
    this.places.push({ x: cx, z: cz, ps: DISTRICTS[3].ps, en: DISTRICTS[3].en });
  }

  /** Cross-map links between the four districts' high ground. */
  _connectors() {
    // Chowk block roof -> warehouse roof, over the north street.
    this.addCatwalk(-39, -48, 37, -66, 8.6, { width: 1.0 });
    // Warehouse roof -> container tops, over the east street.
    this.addCatwalk(60, -34, 56, 36, 8.2, { width: 0.95 });
    // Tank lid -> chowk annex roof, the longest and most exposed crossing.
    this.addPipe(-58, 40, -40, -30, 5.4, 0.45);

    // Central watchtower: the one piece of ground that sees every district.
    const tx = 0, tz = 0;
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.addBox('plate', 0.4, 11, 0.4,
        tx + Math.cos(ang) * 2.4, 5.5, tz + Math.sin(ang) * 2.4, { density: 1.2 });
    }
    this.addBox('plate', 6.4, 0.3, 6.4, tx, 11.1, tz, { density: 0.9 });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      this.addBox('plate', 6.4, 1.1, 0.14,
        tx + Math.sin(ang) * 3.1, 11.8, tz + Math.cos(ang) * 3.1,
        { rotY: ang, solid: false, density: 1.4 });
    }
    this.addLadder(tx + 2.9, tz, 0, 11.4, -Math.PI / 2, { wood: false });
    this.places.push({ x: 0, z: 0, ps: 'مرکزي برج', en: 'TOWER' });
  }

  _props() {
    const rnd = mulberry(4242);
    // Barrels, crates and pallets scattered along the roads for low cover.
    for (let i = 0; i < 90; i++) {
      const x = (rnd() - 0.5) * (MAP_SIZE - 30);
      const z = (rnd() - 0.5) * (MAP_SIZE - 30);
      if (Math.hypot(x, z) < 9) continue;
      const kind = rnd();
      if (kind < 0.34) {
        this.addCylinder('containerRust', 0.34, 0.94, x, 0.47, z,
          { segments: 12, density: 0.9 });
      } else if (kind < 0.72) {
        const s = 0.85 + rnd() * 0.5;
        this.addBox('wood', s, s, s, x, s / 2, z,
          { rotY: rnd() * Math.PI, density: 1.5 });
      } else {
        this.addBox('wood', 1.2, 0.18, 1.0, x, 0.09, z,
          { rotY: rnd() * Math.PI, density: 1.8 });
      }
    }

    // Ammo crates: standing next to one refills your reserve.
    const ammoSpots = [
      [-52, -30], [52, -28], [-52, 28], [52, 30],
      [0, -30], [0, 30], [-30, 0], [30, 0], [0, 6],
    ];
    for (const [x, z] of ammoSpots) {
      this.addBox('containerGreen', 1.4, 0.8, 0.9, x, 0.4, z, { density: 1.2 });
      this.addBox('containerGreen', 1.2, 0.14, 0.75, x, 0.87, z,
        { solid: false, density: 1.4 });
      this.ammoBoxes.push({ x, y: 0.8, z, radius: 2.2 });
    }
  }

  /** A low sandbag position — the "sangar" the map is named for. */
  _sangarNest(x, z, rot) {
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const y = 0.22 + r * 0.42;
      const span = 4.4 - r * 0.3;
      this.addBox('gravel', span, 0.42, 0.55, x, y, z - 1.6,
        { rotY: rot, density: 1.1 });
      this.addBox('gravel', 0.55, 0.42, 3.0, x - span / 2 + 0.3, y, z - 0.2,
        { rotY: rot, density: 1.1 });
      this.addBox('gravel', 0.55, 0.42, 3.0, x + span / 2 - 0.3, y, z - 0.2,
        { rotY: rot, density: 1.1 });
    }
  }

  /**
   * Pallet -> crate -> crate: the manual step-up route onto a roof.
   *
   * Each box is exactly `rise` taller than the one before, and `rise` is kept
   * under PHYS.stepHeight — otherwise the sweep refuses to mount the next
   * crate and the whole route is decorative. The top lands level with a
   * shipping container, so the run continues onto the stacks.
   */
  _crateSteps(x, z, rot) {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    const rise = 0.42;
    const count = 7;
    for (let i = 0; i < count; i++) {
      const h = rise * (i + 1);
      const size = 1.3 - i * 0.05;
      this.addBox('wood', size, h, size,
        x + fx * i * 1.05, h / 2, z + fz * i * 1.05,
        { rotY: rot + i * 0.12, density: 1.5 });
    }
  }

  /** Flat-roofed block with an optional parapet you can crouch behind. */
  _building({ x, z, w, d, h, wall, roof, parapet = 0, windows = false }) {
    const t = 0.45;
    this.addBox(wall, w, h, t, x, h / 2, z - d / 2, { density: 0.4 });
    this.addBox(wall, w, h, t, x, h / 2, z + d / 2, { density: 0.4 });
    this.addBox(wall, t, h, d, x - w / 2, h / 2, z, { density: 0.4 });
    this.addBox(wall, t, h, d, x + w / 2, h / 2, z, { density: 0.4 });
    // roof slab
    this.addBox(roof, w + 0.4, 0.35, d + 0.4, x, h + 0.17, z, { density: 0.5 });
    if (parapet > 0) {
      const p = parapet;
      this.addBox('concrete', w + 0.4, p, 0.28, x, h + 0.35 + p / 2, z - d / 2 - 0.06, { density: 0.9 });
      this.addBox('concrete', w + 0.4, p, 0.28, x, h + 0.35 + p / 2, z + d / 2 + 0.06, { density: 0.9 });
      this.addBox('concrete', 0.28, p, d + 0.4, x - w / 2 - 0.06, h + 0.35 + p / 2, z, { density: 0.9 });
      this.addBox('concrete', 0.28, p, d + 0.4, x + w / 2 + 0.06, h + 0.35 + p / 2, z, { density: 0.9 });
    }
    if (windows) {
      // Dark recessed strips: cheap, and they read as glazing at distance.
      for (let f = 0; f < Math.max(1, Math.floor(h / 4)); f++) {
        const wy = 2.2 + f * 3.6;
        if (wy > h - 1) break;
        this.addBox('plate', w - 3, 1.1, 0.12, x, wy, z - d / 2 - 0.24,
          { solid: false, density: 1.0 });
        this.addBox('plate', w - 3, 1.1, 0.12, x, wy, z + d / 2 + 0.24,
          { solid: false, density: 1.0 });
      }
    }
    // rooftop clutter for cover
    this.addBox('plate', 2.4, 1.2, 2.0, x + w / 4, h + 0.95, z - d / 4, { density: 1.0 });
    this.addCylinder('plate', 0.8, 1.6, x - w / 4, h + 1.15, z + d / 4,
      { segments: 12, density: 0.8 });
  }

  /** Gable-roofed shed, the silhouette that dominates the reference shots. */
  _warehouse({ x, z, w, d, h, ridge, wall }) {
    const t = 0.4;
    this.addBox(wall, w, h, t, x, h / 2, z - d / 2, { density: 0.35 });
    this.addBox(wall, w, h, t, x, h / 2, z + d / 2, { density: 0.35 });
    this.addBox(wall, t, h, d, x - w / 2, h / 2, z, { density: 0.35 });
    this.addBox(wall, t, h, d, x + w / 2, h / 2, z, { density: 0.35 });

    // A flat walkable deck at eave height, with the gable modelled on top so
    // the roof looks pitched but still plays as a usable surface.
    this.addBox('roof', w + 0.6, 0.3, d + 0.6, x, h + 0.15, z, { density: 0.45 });
    const slopes = 5;
    for (let i = 0; i < slopes; i++) {
      const t2 = (i + 0.5) / slopes;
      const y = h + 0.3 + ridge * (1 - Math.abs(0.5 - t2) * 2) * 0.5;
      const width = d * (1 - t2 * 0.0);
      void width;
      this.addBox('roof', w + 0.4, 0.22, d / slopes,
        x, y, z - d / 2 + (d / slopes) * (i + 0.5), { density: 0.5, walkable: true });
    }
    // roll-up door
    this.addBox('plate', 4.4, 4.0, 0.16, x, 2.0, z - d / 2 - 0.22,
      { solid: false, density: 1.0 });
    // eave lip so the roof reads as an object from the ground
    this.addBox('plate', w + 1.2, 0.16, 0.5, x, h + 0.05, z - d / 2 - 0.5,
      { solid: false, density: 1.2 });
  }

  _spawnPoints() {
    // Team 0 holds the north (chowk + warehouses); team 1 the south.
    const north = [
      [-64, -76], [-52, -80], [-40, -74], [-70, -62],
      [46, -78], [58, -74], [66, -64], [40, -70],
    ];
    const south = [
      [-64, 76], [-52, 80], [-40, 74], [-70, 62],
      [46, 78], [58, 74], [66, 64], [40, 70],
    ];
    for (const [x, z] of north) this.spawns[0].push(new THREE.Vector3(x, 1.2, z));
    for (const [x, z] of south) this.spawns[1].push(new THREE.Vector3(x, 1.2, z));
  }

  /** Picks a spawn far from the given threats. */
  pickSpawn(team, threats = []) {
    const list = this.spawns[team] || this.spawns[0];
    if (!list.length) return new THREE.Vector3(0, 1.2, 0);
    let best = list[0], bestScore = -Infinity;
    for (const p of list) {
      let score = Math.random() * 6;
      for (const t of threats) {
        score += Math.min(p.distanceTo(t), 60);
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
  }
}

/** Local copy of the deterministic RNG so prop scatter is stable per build. */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sky dome + directional sun tuned to the cold overcast of the references. */
export function buildSky(scene, quality) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  sky.name = 'sky';
  scene.add(sky);

  scene.fog = new THREE.Fog(0xa8bcc9, 60, quality.fog);

  const hemi = new THREE.HemisphereLight(0xbcd2e2, 0x5c5a52, 1.35);
  scene.add(hemi);

  // Shadowed soldiers were reading as black cut-outs against the yard; a low
  // ambient term keeps them legible without flattening the sunlight.
  scene.add(new THREE.AmbientLight(0x9fb2c4, 0.42));

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
  sun.position.set(72, 120, 46);
  if (quality.shadowMap > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    const s = 90;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.035;
  }
  scene.add(sun);
  scene.add(sun.target);

  const bounce = new THREE.DirectionalLight(0x93a8bb, 0.35);
  bounce.position.set(-60, 40, -70);
  scene.add(bounce);

  return { sky, sun, hemi };
}
