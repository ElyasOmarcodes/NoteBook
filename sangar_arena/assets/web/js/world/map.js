import * as THREE from '../../vendor/three.module.js';
import { Batcher } from './batcher.js';
import { aabb } from './geom.js';
import { material, signTexture } from './textures.js';
import {
  place, scaleUV, gableRoof, skylight, kerb, oilTank, container,
  drumCluster, palletStack, chainFence, chainLinkMaterial, pipeRun, smokestack,
} from './props.js';
import { rng } from './noise.js';
import { DISTRICTS, MAP_SIZE } from '../config.js';

const HALF = MAP_SIZE / 2;

/**
 * "Sangar Chowk" — a derelict refinery, built to the shape of the reference
 * set: warehouses with corrugated flanks and pitched sheet roofs, flat-roofed
 * plant blocks wearing rows of glazed pyramid skylights, a tank farm linked by
 * pipe trestles, a container yard, and a kerbed asphalt road winding between
 * them, all inside a precast concrete wall.
 *
 * Roof access is deliberately varied — wooden stairs, wooden and steel
 * ladders, and a crate route you step up — and the roofs are joined by
 * catwalks and pipe runs that do not read as routes from the ground.
 */
export class ArenaMap {
  constructor(quality) {
    this.quality = quality;
    this.group = new THREE.Group();
    this.batcher = new Batcher();

    this.solids = [];
    this.cylinders = [];
    this.ladders = [];
    this.ammoBoxes = [];
    this.spawns = [[], []];
    this.places = [];

    /** Meshes that cannot join the opaque batch (glass, fence mesh, signs). */
    this.extras = new THREE.Group();

    this.rand = rng(20260903);

    const chain = chainLinkMaterial();
    this.fenceMat = new THREE.MeshStandardMaterial({
      map: chain.tex, transparent: true, alphaTest: 0.35,
      side: THREE.DoubleSide, roughness: 0.7, metalness: 0.5,
      color: 0xb9bdc2,
    });
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xdfe8ee, roughness: 0.18, metalness: 0.0,
      transparent: true, opacity: 0.72,
      emissive: 0x9fb6c4, emissiveIntensity: 0.18,
    });
    this.windowMat = new THREE.MeshStandardMaterial({
      color: 0x1b2228, roughness: 0.16, metalness: 0.55,
    });
  }

  build() {
    this._ground();
    this._planRoads();
    this._perimeter();

    // Everything inside the wall is laid out from the plan.
    this._plan();

    this._connectors();
    this._clutter();
    this._spawnPoints();

    this.group.add(this.batcher.build(this.quality));
    this.group.add(this.extras);
    return this;
  }

  // =======================================================================
  // primitives
  // =======================================================================

  /** A textured box that also registers a collider. */
  box(mat, w, h, d, x, y, z, opts = {}) {
    const { ry = 0, solid = true, density = 0.3, walkable = true } = opts;
    const g = new THREE.BoxGeometry(w, h, d);
    scaleUV(g, Math.max(w, d) * density, h * density);
    place(this.batcher, mat, g, { x, y, z, ry });
    g.dispose();
    if (solid) this.collide(x, y, z, w, h, d, ry, walkable);
    return this;
  }

  collide(x, y, z, w, h, d, ry = 0, walkable = true) {
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    const b = aabb(x, y, z, w * cos + d * sin, h, w * sin + d * cos);
    b.walkable = walkable;
    this.solids.push(b);
    return b;
  }

  cylinder(x, z, r, minY, maxY) {
    this.cylinders.push({ x, z, r, minY, maxY });
  }

  /** Wooden or steel ladder with a climb volume. */
  addLadder(x, z, fromY, toY, facing, { wood = true, width = 0.8 } = {}) {
    const mat = wood ? 'wood' : 'plate';
    const height = toY - fromY;
    const offX = Math.cos(facing) * width / 2;
    const offZ = -Math.sin(facing) * width / 2;
    for (const s of [1, -1]) {
      const rail = new THREE.BoxGeometry(0.09, height, 0.09);
      place(this.batcher, mat, rail, {
        x: x + offX * s, y: fromY + height / 2, z: z + offZ * s,
      });
      rail.dispose();
    }
    const rungs = Math.max(2, Math.floor(height / 0.31));
    for (let i = 0; i <= rungs; i++) {
      const rung = new THREE.CylinderGeometry(0.028, 0.028, width, 6);
      rung.rotateZ(Math.PI / 2);
      place(this.batcher, mat, rung, {
        x, y: fromY + (height * i) / rungs, z, ry: facing,
      });
      rung.dispose();
    }
    this.ladders.push({
      x, z, minY: fromY - 0.3, maxY: toY + 0.9, radius: 0.95,
      nx: Math.sin(facing), nz: Math.cos(facing),
    });
  }

  /** A wooden stair flight with handrails. */
  addStairs(x, y, z, facing, steps,
    { width = 2.0, rise = 0.34, run = 0.42, mat = 'wood', rails = true } = {}) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    for (let i = 0; i < steps; i++) {
      this.box(mat, width, rise, run + 0.06,
        x + fx * run * (i + 0.5), y + rise * (i + 0.5), z + fz * run * (i + 0.5),
        { ry: facing, density: 1.1 });
    }
    const len = run * steps;
    const top = { x: x + fx * len, y: y + rise * steps, z: z + fz * len };
    if (!rails) return top;
    const ox = Math.cos(facing) * width / 2, oz = -Math.sin(facing) * width / 2;
    for (const s of [1, -1]) {
      for (let i = 0; i <= steps; i += 3) {
        const post = new THREE.BoxGeometry(0.08, 1.0, 0.08);
        place(this.batcher, 'wood', post, {
          x: x + fx * run * i + ox * s, y: y + rise * i + 0.5,
          z: z + fz * run * i + oz * s,
        });
        post.dispose();
      }
      const rail = new THREE.BoxGeometry(0.07, 0.07, Math.hypot(len, rise * steps));
      place(this.batcher, 'wood', rail, {
        x: x + fx * len / 2 + ox * s, y: y + rise * steps / 2 + 0.95,
        z: z + fz * len / 2 + oz * s,
        ry: facing, rx: -Math.atan2(rise * steps, len),
      });
      rail.dispose();
    }
    return top;
  }

  /**
   * A staircase of several flights with a landing at each turn.
   *
   * Climbing four metres in one straight run reads as a ramp with lines drawn
   * on it. Turning at a landing every flight is what makes a stairwell feel
   * like part of a building, and it gives whoever holds the top something
   * worth holding.
   *
   * @returns {{x:number,y:number,z:number}} the top of the last flight
   */
  stairTower(x, y, z, facing, flights,
    { steps = 8, width = 1.8, rise = 0.34, run = 0.42, mat = 'concrete',
      landing = 2.2 } = {}) {
    let at = { x, y, z };
    const fx = Math.sin(facing), fz = Math.cos(facing);
    for (let f = 0; f < flights; f++) {
      at = this.addStairs(at.x, at.y, at.z, facing, steps, { width, rise, run, mat });
      if (f === flights - 1) break;
      // A half-landing between flights: somewhere to stand, somewhere to be
      // caught, and the thing that stops four metres of climb reading as a
      // ramp with lines on it.
      const cx = at.x + fx * landing * 0.5, cz = at.z + fz * landing * 0.5;
      this.box(mat, width + 0.4, 0.26, landing + 0.3, cx, at.y - 0.13, cz,
        { ry: facing, density: 0.9 });
      for (const side of [1, -1]) {
        const ox = Math.cos(facing) * (width / 2 + 0.15);
        const oz = -Math.sin(facing) * (width / 2 + 0.15);
        this.box('plate', 0.09, 1.0, landing, cx + ox * side, at.y + 0.5,
          cz + oz * side, { ry: facing, solid: false, density: 1.0 });
      }
      at = { x: at.x + fx * landing, y: at.y, z: at.z + fz * landing };
    }
    return at;
  }

  /** A narrow plank catwalk between two roofs. */
  addCatwalk(x1, z1, x2, z2, y, { width = 0.95 } = {}) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    this.box('plate', width, 0.12, len, cx, y, cz, { ry: angle, density: 0.9 });
    const ox = Math.cos(angle) * width / 2, oz = -Math.sin(angle) * width / 2;
    for (const s of [1, -1]) {
      const rail = new THREE.CylinderGeometry(0.04, 0.04, len, 6);
      rail.rotateX(Math.PI / 2);
      place(this.batcher, 'plate', rail, {
        x: cx + ox * s, y: y + 0.92, z: cz + oz * s, ry: angle,
      });
      rail.dispose();
      const posts = Math.max(2, Math.round(len / 2.4));
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const post = new THREE.BoxGeometry(0.055, 0.92, 0.055);
        place(this.batcher, 'plate', post, {
          x: x1 + dx * t + ox * s, y: y + 0.46, z: z1 + dz * t + oz * s,
        });
        post.dispose();
      }
    }
  }

  /** A bilingual signboard on posts. */
  addSign(x, y, z, rotY, pashto, latin, colour, { width = 5.2, height = 2.6, posts = true } = {}) {
    const tex = signTexture(pashto, latin, `#${colour.toString(16).padStart(6, '0')}`);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide,
    });
    const nx = Math.sin(rotY) * 0.14, nz = Math.cos(rotY) * 0.14;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    plate.position.set(x + nx * 0.2, y, z + nz * 0.2);
    plate.rotation.y = rotY;
    plate.receiveShadow = true;
    this.extras.add(plate);

    this.box('plate', width, height, 0.16, x - nx, y, z - nz,
      { ry: rotY, density: 0.6 });
    if (posts) {
      const ox = Math.cos(rotY) * (width / 2 - 0.4);
      const oz = -Math.sin(rotY) * (width / 2 - 0.4);
      for (const s of [1, -1]) {
        this.box('plate', 0.18, y, 0.18, x + ox * s, y / 2, z + oz * s,
          { density: 1.0 });
      }
    }
    this.places.push({ x, z, ps: pashto, en: latin });
  }

  /** A row of dark glazing set into a wall. */
  addWindows(x, y, z, w, h, rotY) {
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(g, this.windowMat);
    const nx = Math.sin(rotY) * 0.02, nz = Math.cos(rotY) * 0.02;
    m.position.set(x + nx, y, z + nz);
    m.rotation.y = rotY;
    this.extras.add(m);
    // Mullions.
    const bars = Math.max(2, Math.round(w / 1.3));
    for (let i = 1; i < bars; i++) {
      const bx = -w / 2 + (w / bars) * i;
      this.box('plate', 0.07, h, 0.09,
        x + Math.cos(rotY) * bx + nx * 2, y, z - Math.sin(rotY) * bx + nz * 2,
        { ry: rotY, solid: false, density: 1.4 });
    }
  }

  // =======================================================================
  // ground and roads
  // =======================================================================

  _ground() {
    const size = MAP_SIZE + 60;
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(-Math.PI / 2);
    scaleUV(g, size * 0.18, size * 0.18);
    const mesh = new THREE.Mesh(g, material('yard', {
      repeat: [1, 1], aniso: Math.max(8, this.quality.aniso), normalScale: 0.7,
    }));
    mesh.receiveShadow = true;
    mesh.position.y = -0.02;
    this.group.add(mesh);

    const floor = aabb(0, -1.0, 0, size, 2, size);
    floor.walkable = true;
    this.solids.push(floor);
  }

  /**
   * The roads, traced from the plan.
   *
   * The drawing marks them in highlighter: an inner rectangle around the
   * middle of the compound, a long street down the east side, and spurs west
   * and south. Every run is a strip of asphalt with a kerb down both sides.
   */
  _planRoads() {
    const RUNS = [
      // the inner rectangle
      [-44, -40, -44, 47], [-44, -40, 1, -40], [1, -40, 1, 43], [-44, 47, 1, 47],
      // the east street and the road along the south of the compound
      [64, -89, 64, 43], [1, 43, 98, 43],
      // the western spurs
      [-100, 47, -44, 47], [-98, 47, -98, 90],
      // the northern link, which the plan runs between the two APR rows
      [-44, -76, 64, -76],
    ];
    const WIDTH = 12;
    for (const [x1, z1, x2, z2] of RUNS) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);
      const g = new THREE.PlaneGeometry(WIDTH, len + 1.5);
      g.rotateX(-Math.PI / 2);
      scaleUV(g, WIDTH * 0.22, (len + 1.5) * 0.22);
      place(this.batcher, 'asphalt', g, {
        x: (x1 + x2) / 2, y: 0.015, z: (z1 + z2) / 2, ry: angle,
      });
      g.dispose();
      const nx = Math.cos(angle) * (WIDTH / 2 + 0.2);
      const nz = -Math.sin(angle) * (WIDTH / 2 + 0.2);
      for (const side of [1, -1]) {
        kerb(this.batcher, {
          x1: x1 + nx * side, z1: z1 + nz * side,
          x2: x2 + nx * side, z2: z2 + nz * side,
        });
      }
    }
  }

  /**
   * The compound, laid out from the hand-drawn plan.
   *
   * The plan names each block and its storeys — APR for a flat roof, Room for
   * a pitched iron one — marks the red-painted ones, marks where a wall has a
   * doorway through it, and marks the few places worth putting a stair. This
   * follows it block by block; where the drawing is ambiguous the reference
   * photographs decide.
   */
  _plan() {
    const RED = 'sidingRed';
    const WHT = 'sidingWhite';
    const GRY = 'sidingGrey';

    // ---- north edge -----------------------------------------------------
    // "ARP X3" with the red mark, then "APR X3", then the north-east corner.
    this.apartment({ x: -31, z: -92, w: 56, d: 12, storeys: 3, mat: RED, door: 'south' });
    this.apartment({ x: 37, z: -91, w: 38, d: 12, storeys: 3, mat: WHT, door: 'south' });
    this.apartment({ x: 78, z: -63, w: 20, d: 40, storeys: 3, mat: WHT, door: 'west', ladder: true });

    // Water storage and containers along the north yard.
    for (const [wx, wz, r, h] of [[-76, -74, 7.5, 11], [-29, -76, 6.5, 9.5], [-14, -77, 6.0, 9]]) {
      this._waterStore(wx, wz, r, h);
    }
    this._containerPair(-49, -70, 0);
    this._containerPair(-41, -62, 0);

    // ---- west edge ------------------------------------------------------
    // Two long APR x3 runs, the outer one against the wall.
    this.apartment({ x: -88, z: -6, w: 14, d: 88, storeys: 3, mat: WHT, door: 'east' });
    this.apartment({ x: -59, z: -14, w: 16, d: 72, storeys: 3, mat: GRY, door: 'east' });
    // The plan marks a stair between them. Three flights that actually reach
    // the inner block's roof: a stair that stops short of its target is a
    // decoration, and the last build had three of those.
    this.stairTower(-72, 0, -40, 0, 3,
      { steps: 10, width: 1.9, rise: 0.36, run: 0.42, mat: 'concrete', landing: 2.2 });
    // The bridge from the stair head onto the roof. It begins exactly where
    // the last step ends: a slab that overlaps the top of a flight is a
    // ceiling to walk into, and it stops the climb two steps short.
    this.box('plate', 7.0, 0.26, 3.2, -70.5, 10.80, -21.4, { density: 0.8 });

    // The pipe yard the plan draws as a heap of cylinders, and its crate.
    this._pipeYard(-28, -18);
    this.box('wood', 2.4, 2.0, 2.0, -35, 1.0, -5, { density: 1.0 });

    // ---- east side ------------------------------------------------------
    this.room({ x: 7, z: -70, w: 13, d: 26, storeys: 1, mat: RED, roof: 'roofRed', door: 'west' });
    this.room({ x: 49, z: -62, w: 16, d: 36, storeys: 3, mat: RED, roof: 'roofRed', door: 'west', ladder: true });
    // The middle cluster: 3x, a half-depth 0.5x in red, and a 1x.
    this.room({ x: 24, z: -30, w: 15, d: 26, storeys: 3, mat: WHT, roof: 'roof', door: 'west' });
    this.room({ x: 38, z: -26, w: 10, d: 13, storeys: 1, mat: RED, roof: 'roofRed', door: 'west' });
    this.room({ x: 22, z: -8, w: 13, d: 12, storeys: 1, mat: WHT, roof: 'roof', door: 'north' });
    this._containerPair(47, 10, 0);
    this._containerPair(57, 21, 0);
    // "Bed Room x1", red, hard against the east road.
    this.room({ x: 83, z: 7, w: 16, d: 30, storeys: 1, mat: RED, roof: 'roofRed', door: 'west' });
    this.box('plate', 3.0, 3.0, 0.2, 90, 1.5, -22, { solid: false, density: 0.8 });
    // The plan runs a grille fence the length of the east street.
    this._grilleRun(72, -34, 72, 34);
    this.stairTower(62, 0, -14, Math.PI, 2,
      { steps: 6, width: 1.8, rise: 0.34, run: 0.42, mat: 'concrete', landing: 2.2 });

    // ---- south edge -----------------------------------------------------
    this.room({ x: -55, z: 80, w: 15, d: 36, storeys: 3, mat: WHT, roof: 'roof', door: 'east' });
    this.room({ x: -88, z: 92, w: 20, d: 14, storeys: 3, mat: WHT, roof: 'roofRed', door: 'north' });
    this.room({ x: -75, z: 58, w: 12, d: 10, storeys: 1, mat: RED, roof: 'roofRed', door: 'east' });
    this.apartment({ x: -9, z: 80, w: 18, d: 40, storeys: 3, mat: GRY, door: 'east' });
    this.apartment({ x: 86, z: 76, w: 20, d: 38, storeys: 3, mat: RED, door: 'west', ladder: true });
    for (const [wx, wz, r, h] of [[29, 75, 7.0, 10], [43, 75, 7.0, 10]]) {
      this._waterStore(wx, wz, r, h);
    }

    // ---- the middle -----------------------------------------------------
    // "ARP X1" and "Room x2", the two blocks the plan puts in the centre.
    this.apartment({ x: -11, z: 16, w: 16, d: 16, storeys: 1, mat: WHT, door: 'north' });
    this.room({ x: -26, z: 40, w: 22, d: 22, storeys: 2, mat: RED, roof: 'roofRed', door: 'east' });
    this._containerPair(-44, 30, Math.PI / 2);
    // The green hatched strip: a grille wall splitting the middle.
    this._grilleRun(-8, -30, -8, 8);
    // Stairs the plan marks around the centre blocks.
    // Eleven steps that land exactly on the roof lip, not against the wall.
    this.addStairs(-11, 0, 29.0, Math.PI, 11,
      { width: 2.6, rise: 0.34, run: 0.42, mat: 'concrete' });
    this.addStairs(-3.5, 0, 29.0, Math.PI, 11,
      { width: 2.0, rise: 0.34, run: 0.42, mat: 'concrete' });

    // ---- the walls between the blocks, and the doors through them --------
    // Every run the plan draws in ink, with a way through wherever it puts an
    // orange mark.
    const WALLS = [
      // north yard, between the APR row and the water stores
      [-62, -80, -20, -80, [0.30, 0.72]],
      [-6, -80, 24, -80, [0.5]],
      // the west compound
      [-80, -50, -68, -50, [0.5]],
      [-80, 40, -68, 40, [0.4]],
      // around the middle
      [-44, -4, -20, -4, [0.35, 0.8]],
      [-2, 4, 14, 4, [0.5]],
      [-44, 56, -18, 56, [0.45]],
      // the east yard
      [34, 2, 40, 2, [0.5]],
      [40, -46, 40, -14, [0.55]],
      // the south yard
      [4, 60, 22, 60, [0.5]],
      [52, 58, 74, 58, [0.4, 0.85]],
    ];
    for (const [x1, z1, x2, z2, gaps] of WALLS) {
      this._wallRun(x1, z1, x2, z2, { gaps });
    }

    this.places.push({ x: -31, z: -92, ps: DISTRICTS[0].ps, en: DISTRICTS[0].en });
    this.places.push({ x: 78, z: -63, ps: DISTRICTS[1].ps, en: DISTRICTS[1].en });
    this.places.push({ x: -59, z: -14, ps: DISTRICTS[2].ps, en: DISTRICTS[2].en });
    this.places.push({ x: 86, z: 76, ps: DISTRICTS[3].ps, en: DISTRICTS[3].en });
    this.places.push({ x: -11, z: 16, ps: 'مرکز', en: 'CENTRE' });
  }

  /** A "WS" from the plan: a squat water tank with a lid you can stand on. */
  _waterStore(x, z, r, h) {
    oilTank(this.batcher, this.extras, { x, z, r, h });
    this.cylinder(x, z, r, 0, h);
    const lid = aabb(x, h + 0.3, z, (r + 0.12) * 2, 0.6, (r + 0.12) * 2);
    lid.walkable = true;
    lid.round = { x, z, r: r + 0.12 };
    this.solids.push(lid);
    this.addLadder(x + r - 0.1, z, 0, h + 0.7, -Math.PI / 2, { wood: false });
  }

  /** A "con x2" from the plan: two containers, one on the other. */
  _containerPair(x, z, ry) {
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    const mats = ['containerBlue', 'containerRust'];
    for (let i = 0; i < 2; i++) {
      container(this.batcher, { x, y: i * 2.62, z, ry, mat: mats[i] });
      this.collide(x, i * 2.62 + 1.3, z,
        12.2 * cos + 2.44 * sin, 2.59, 12.2 * sin + 2.44 * cos, 0, true);
    }
  }

  /** The heap of pipes the plan draws, stacked so it can be climbed. */
  _pipeYard(x, z) {
    for (let row = 0; row < 3; row++) {
      const n = 3 - row;
      for (let i = 0; i < n; i++) {
        const px = x + (i - (n - 1) / 2) * 2.6 + row * 0.2;
        const py = 1.1 + row * 2.1;
        pipeRun(this.batcher, { x1: px, z1: z - 6, x2: px, z2: z + 6, y: py, r: 1.1 });
        this.collide(px, py, z, 2.4, 2.2, 12, 0, true);
      }
    }
  }

  /**
   * A run of wall with a doorway in it.
   *
   * The plan marks these in orange: every place a wall or a fence has a way
   * through. A compound whose walls are unbroken is a maze of dead ends, and
   * the orange marks are what keep it a place you can move around in.
   */
  _wallRun(x1, z1, x2, z2, { gaps = [0.5], h = 3.4, mat = 'wall' } = {}) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(dx, dz);
    const DOOR = 2.8;
    // Turn the gap centres into the solid pieces between them.
    const cuts = [...gaps].sort((a, b) => a - b);
    let at = 0;
    const pieces = [];
    for (const g of cuts) {
      const start = Math.max(0, g * len - DOOR / 2);
      if (start > at + 0.4) pieces.push([at, start]);
      at = Math.min(len, g * len + DOOR / 2);
    }
    if (at < len - 0.4) pieces.push([at, len]);

    for (const [a, b] of pieces) {
      const t = (a + b) / 2 / len;
      this.box(mat, 0.5, h, b - a, x1 + dx * t, h / 2, z1 + dz * t,
        { ry, density: 0.3 });
    }
    // A lintel over each doorway, so it reads as a door rather than a gap.
    for (const g of cuts) {
      const above = h - 2.3;
      if (above < 0.2) continue;
      this.box(mat, 0.5, above, DOOR, x1 + dx * g, 2.3 + above / 2, z1 + dz * g,
        { ry, density: 0.3 });
    }
    // Cap rail along the whole run.
    this.box('kerb', 0.8, 0.28, len, (x1 + x2) / 2, h + 0.14, (z1 + z2) / 2,
      { ry, density: 0.9 });
  }

  /** A run of expanded-metal grille, which the plan marks in green. */
  _grilleRun(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(dx, dz);
    // Panels with posts, and a gap in the middle: the plan puts a way through.
    const gap = 3.2;
    for (const side of [-1, 1]) {
      const seg = (len - gap) / 2;
      const t = side * (gap / 2 + seg / 2) / len;
      // Density 2.0 puts the diamond at about 6 cm, which is what chain-link
      // actually measures; at the old 0.5 each one was a quarter-metre wide.
      this.box('mesh', 0.10, 3.0, seg,
        (x1 + x2) / 2 + dx * t, 1.5, (z1 + z2) / 2 + dz * t,
        { ry, density: 2.0 });
    }
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      this.box('plate', 0.34, 3.3, 0.34, x1 + dx * t, 1.65, z1 + dz * t,
        { solid: false, density: 1.2 });
    }
  }

  _perimeter() {
    const wallH = 6.2, t = 0.55;
    const sides = [
      { x: 0, z: -HALF, w: MAP_SIZE, d: t },
      { x: 0, z: HALF, w: MAP_SIZE, d: t },
      { x: -HALF, z: 0, w: t, d: MAP_SIZE },
      { x: HALF, z: 0, w: t, d: MAP_SIZE },
    ];
    for (const s of sides) {
      this.box('wall', s.w, wallH, s.d, s.x, wallH / 2, s.z, { density: 0.16 });
      // Cap rail — the precast walls in the reference all wear one.
      this.box('concrete', s.w + 0.4, 0.38, s.d + 0.4, s.x, wallH + 0.19, s.z,
        { solid: false, density: 0.4 });
    }
    for (let i = -HALF + 6; i < HALF; i += 11) {
      for (const [x, z] of [[i, -HALF], [i, HALF], [-HALF, i], [HALF, i]]) {
        this.box('concrete', 0.95, wallH + 0.55, 0.95, x, (wallH + 0.55) / 2, z,
          { density: 0.55 });
      }
    }

    const inset = HALF - 1.4;
    // One board per district and no more: each name appears exactly once, on
    // the side of the compound it belongs to. They used to be doubled up,
    // once here and once inside the district, so the same name faced you from
    // two directions and told you nothing.
    this.addSign(0, 4.3, -inset, 0, DISTRICTS[0].ps, DISTRICTS[0].en,
      DISTRICTS[0].color, { width: 9.5, height: 4.4, posts: false });
    this.addSign(0, 4.3, inset, Math.PI, DISTRICTS[3].ps, DISTRICTS[3].en,
      DISTRICTS[3].color, { width: 9.5, height: 4.4, posts: false });
    this.addSign(-inset, 4.3, 0, Math.PI / 2, DISTRICTS[2].ps, DISTRICTS[2].en,
      DISTRICTS[2].color, { width: 9.5, height: 4.4, posts: false });
    this.addSign(inset, 4.3, 0, -Math.PI / 2, DISTRICTS[1].ps, DISTRICTS[1].en,
      DISTRICTS[1].color, { width: 9.5, height: 4.4, posts: false });
  }

  // =======================================================================
  // buildings
  // =======================================================================

  /**
   * Flat-roofed plant block: block walls, a clerestory band of glazing, a
   * concrete roof slab with a parapet, and a row of pyramid skylights.
   */
  plantBlock({ x, z, w, d, h, skylights = 3, wall = 'block', ladderSide = 1 }) {
    const t = 0.5;
    this.box(wall, w, h, t, x, h / 2, z - d / 2, { density: 0.16 });
    this.box(wall, w, h, t, x, h / 2, z + d / 2, { density: 0.16 });
    this.box(wall, t, h, d, x - w / 2, h / 2, z, { density: 0.16 });
    this.box(wall, t, h, d, x + w / 2, h / 2, z, { density: 0.16 });

    // Clerestory glazing near the top of the long walls.
    const bandY = h - 1.6;
    this.addWindows(x, bandY, z - d / 2 - 0.28, w - 3, 1.5, 0);
    this.addWindows(x, bandY, z + d / 2 + 0.28, w - 3, 1.5, Math.PI);

    // Roof slab + parapet.
    this.box('concrete', w + 0.5, 0.35, d + 0.5, x, h + 0.17, z, { density: 0.3 });
    const p = 1.0;
    this.box('concrete', w + 0.5, p, 0.3, x, h + 0.35 + p / 2, z - d / 2 - 0.1, { density: 0.6 });
    this.box('concrete', w + 0.5, p, 0.3, x, h + 0.35 + p / 2, z + d / 2 + 0.1, { density: 0.6 });
    this.box('concrete', 0.3, p, d + 0.5, x - w / 2 - 0.1, h + 0.35 + p / 2, z, { density: 0.6 });
    this.box('concrete', 0.3, p, d + 0.5, x + w / 2 + 0.1, h + 0.35 + p / 2, z, { density: 0.6 });

    // Skylights: the row of glazed pyramids that identifies these roofs.
    const spacing = (w - 4) / Math.max(1, skylights);
    for (let i = 0; i < skylights; i++) {
      const sx = x - (w - 4) / 2 + spacing * (i + 0.5);
      // Kerb the skylight sits on.
      this.box('concrete', 3.0, 0.45, 3.0, sx, h + 0.55, z, { density: 0.6 });
      skylight(this.extras, { x: sx, y: h + 0.78, z, w: 3.0, h: 1.0, mat: this.glassMat });
    }

    // Roof plant: a vent stack and a housing for cover.
    this.box('plate', 2.2, 1.1, 1.8, x + w / 4, h + 0.9, z - d / 4, { density: 0.8 });
    const vent = new THREE.CylinderGeometry(0.42, 0.42, 1.5, 12);
    place(this.batcher, 'plate', vent, { x: x - w / 4, y: h + 1.1, z: z + d / 4 });
    vent.dispose();
    this.cylinder(x - w / 4, z + d / 4, 0.42, h + 0.35, h + 1.85);

    if (ladderSide) {
      this.addLadder(x + ladderSide * (w / 2 + 0.35), z + 2, 0, h + 1.4,
        ladderSide > 0 ? -Math.PI / 2 : Math.PI / 2, { wood: false });
    }
    return h;
  }

  /**
   * Warehouse: corrugated flanks, a pitched sheet roof with eaves, a roll-up
   * door, and a walkable deck at eave height.
   */
  warehouse({ x, z, w, d, h, wall = 'sidingGrey', roof = 'roof', rise = 2.6, doorEnd = -1 }) {
    const t = 0.4;
    this.box(wall, w, h, t, x, h / 2, z - d / 2, { density: 0.2 });
    this.box(wall, w, h, t, x, h / 2, z + d / 2, { density: 0.2 });
    this.box(wall, t, h, d, x - w / 2, h / 2, z, { density: 0.2 });
    this.box(wall, t, h, d, x + w / 2, h / 2, z, { density: 0.2 });

    // Walkable deck at eave height, then the pitched roof on top of it.
    this.box('roof', w + 0.9, 0.28, d + 0.9, x, h + 0.14, z,
      { density: 0.3, walkable: true });
    gableRoof(this.batcher, { x, y: h + 0.28, z, w, d, rise, mat: roof });

    // Eave fascia.
    for (const s of [-1, 1]) {
      this.box('plate', w + 1.2, 0.22, 0.28, x, h + 0.05, z + s * (d / 2 + 0.55),
        { solid: false, density: 1.0 });
    }

    // Roll-up door in the gable end.
    const dz = doorEnd * (d / 2 + 0.24);
    this.box('plate', 4.6, 4.2, 0.14, x, 2.1, z + dz, { solid: false, density: 0.7 });
    for (const sign of [-1, 1]) {
      this.box('plate', 0.16, 5.6, 0.1, x + sign * 2.4, 2.6, z + dz * 1.02,
        { solid: false, density: 1.2 });
    }
    // Windows either side of the door.
    this.addWindows(x - 6.5, 3.4, z + dz, 3.0, 1.2, doorEnd > 0 ? Math.PI : 0);
    this.addWindows(x + 6.5, 3.4, z + dz, 3.0, 1.2, doorEnd > 0 ? Math.PI : 0);
    // Long-wall window band.
    this.addWindows(x, h - 1.3, z - d / 2 - 0.24, w - 6, 1.1, 0);
  }

  /** A small site office on stilts, white siding with an orange trim. */
  officeHut({ x, z, w = 7, d = 5, h = 3.2, stilt = 1.4 }) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.box('plate', 0.2, stilt, 0.2,
          x + sx * (w / 2 - 0.4), stilt / 2, z + sz * (d / 2 - 0.4), { density: 1.4 });
      }
    }
    this.box('plate', w, 0.22, d, x, stilt + 0.11, z, { density: 0.6 });
    const y0 = stilt + 0.22;
    this.box('sidingWhite', w, h, 0.28, x, y0 + h / 2, z - d / 2, { density: 0.35 });
    this.box('sidingWhite', w, h, 0.28, x, y0 + h / 2, z + d / 2, { density: 0.35 });
    this.box('sidingWhite', 0.28, h, d, x - w / 2, y0 + h / 2, z, { density: 0.35 });
    this.box('sidingWhite', 0.28, h, d, x + w / 2, y0 + h / 2, z, { density: 0.35 });
    this.box('roofBlue', w + 0.7, 0.2, d + 0.7, x, y0 + h + 0.1, z, { density: 0.4 });
    // Orange fascia trim.
    for (const s of [-1, 1]) {
      this.box('containerRust', w + 0.7, 0.24, 0.16, x, y0 + h - 0.02,
        z + s * (d / 2 + 0.32), { solid: false, density: 1.0 });
    }
    this.addWindows(x, y0 + h * 0.6, z - d / 2 - 0.16, w - 2.2, 1.3, 0);
    this.addStairs(x + w / 2 + 0.4, 0, z, -Math.PI / 2, 5, { width: 1.2, rise: 0.3, run: 0.34 });
  }


  /**
   * A room: four walls under a pitched iron roof, in the storeys the plan
   * gives it.
   *
   * `door` cuts a real opening in one wall — the wall is built as two pieces
   * with a gap — so a player can walk in and fight from inside rather than
   * only around the outside.
   */
  room({ x, z, w, d, storeys = 1, mat = 'sidingWhite', roof = 'roofRed',
    door = 'south', windows = true, ladder = false }) {
    const FLOOR = 3.5;
    const h = FLOOR * storeys;
    const t = 0.42;

    // Walls, with a doorway cut into whichever face the plan opens.
    const wallRun = (side) => {
      const along = side === 'north' || side === 'south' ? w : d;
      const gap = door === side ? 2.6 : 0;
      const seg = (along - gap) / 2;
      const pieces = gap > 0
        ? [[-(gap / 2 + seg / 2), seg], [gap / 2 + seg / 2, seg]]
        : [[0, along]];
      // Above a doorway the wall carries on, so the opening is a door and not
      // a slot to the roof.
      const lintel = gap > 0 ? [[0, gap]] : [];
      for (const [off, len] of pieces) {
        if (side === 'north') this.box(mat, len, h, t, x + off, h / 2, z - d / 2, { density: 0.2 });
        else if (side === 'south') this.box(mat, len, h, t, x + off, h / 2, z + d / 2, { density: 0.2 });
        else if (side === 'west') this.box(mat, t, h, len, x - w / 2, h / 2, z + off, { density: 0.2 });
        else this.box(mat, t, h, len, x + w / 2, h / 2, z + off, { density: 0.2 });
      }
      for (const [off, len] of lintel) {
        const above = h - 2.3;
        if (above <= 0.1) continue;
        if (side === 'north') this.box(mat, len, above, t, x + off, 2.3 + above / 2, z - d / 2, { density: 0.2 });
        else if (side === 'south') this.box(mat, len, above, t, x + off, 2.3 + above / 2, z + d / 2, { density: 0.2 });
        else if (side === 'west') this.box(mat, t, above, len, x - w / 2, 2.3 + above / 2, z + off, { density: 0.2 });
        else this.box(mat, t, above, len, x + w / 2, 2.3 + above / 2, z + off, { density: 0.2 });
      }
    };
    for (const side of ['north', 'south', 'west', 'east']) wallRun(side);

    // Intermediate floors, so a two- or three-storey room has rooms in it.
    for (let f = 1; f < storeys; f++) {
      this.box('plate', w - 0.8, 0.3, d - 0.8, x, f * FLOOR, z, { density: 0.5 });
    }

    // Deck at eave height, then the pitched roof on top of it.
    this.box('roof', w + 0.9, 0.28, d + 0.9, x, h + 0.14, z,
      { density: 0.3, walkable: true });
    gableRoof(this.batcher, { x, y: h + 0.28, z, w, d, rise: 2.4, mat: roof });
    for (const side of [-1, 1]) {
      this.box('plate', w + 1.2, 0.22, 0.28, x, h + 0.04, z + side * (d / 2 + 0.55),
        { solid: false, density: 1.0 });
    }

    if (windows) {
      for (let f = 0; f < storeys; f++) {
        const y = f * FLOOR + 2.3;
        this.addWindows(x, y, z - d / 2 - 0.24, w - 6, 1.1, 0);
        this.addWindows(x, y, z + d / 2 + 0.24, w - 6, 1.1, Math.PI);
      }
    }
    if (ladder) {
      this.addLadder(x + w / 2 + 0.5, z, 0, h + 0.5, -Math.PI / 2, { wood: false });
    }
    return { x, z, w, d, h, top: h + 0.28 };
  }

  /**
   * An apartment: the same shell with a flat roof and a parapet, which is what
   * makes its top a fighting position rather than a slope.
   */
  apartment({ x, z, w, d, storeys = 2, mat = 'sidingWhite', ladder = false,
    door = 'south' }) {
    const FLOOR = 3.5;
    const h = FLOOR * storeys;
    const t = 0.42;
    const wallRun = (side) => {
      const along = side === 'north' || side === 'south' ? w : d;
      const gap = door === side ? 2.6 : 0;
      const seg = (along - gap) / 2;
      const pieces = gap > 0
        ? [[-(gap / 2 + seg / 2), seg], [gap / 2 + seg / 2, seg]]
        : [[0, along]];
      for (const [off, len] of pieces) {
        if (side === 'north') this.box(mat, len, h, t, x + off, h / 2, z - d / 2, { density: 0.2 });
        else if (side === 'south') this.box(mat, len, h, t, x + off, h / 2, z + d / 2, { density: 0.2 });
        else if (side === 'west') this.box(mat, t, h, len, x - w / 2, h / 2, z + off, { density: 0.2 });
        else this.box(mat, t, h, len, x + w / 2, h / 2, z + off, { density: 0.2 });
      }
      if (gap > 0) {
        const above = h - 2.3;
        if (side === 'north') this.box(mat, gap, above, t, x, 2.3 + above / 2, z - d / 2, { density: 0.2 });
        else if (side === 'south') this.box(mat, gap, above, t, x, 2.3 + above / 2, z + d / 2, { density: 0.2 });
        else if (side === 'west') this.box(mat, t, above, gap, x - w / 2, 2.3 + above / 2, z, { density: 0.2 });
        else this.box(mat, t, above, gap, x + w / 2, 2.3 + above / 2, z, { density: 0.2 });
      }
    };
    for (const side of ['north', 'south', 'west', 'east']) wallRun(side);

    for (let f = 1; f < storeys; f++) {
      this.box('plate', w - 0.8, 0.3, d - 0.8, x, f * FLOOR, z, { density: 0.5 });
    }

    // Flat roof and its parapet.
    this.box('concrete', w + 0.6, 0.34, d + 0.6, x, h + 0.17, z,
      { density: 0.34, walkable: true });
    for (const [dx, dz, pw, pd] of [
      [0, -d / 2 - 0.15, w + 0.6, 0.3], [0, d / 2 + 0.15, w + 0.6, 0.3],
      [-w / 2 - 0.15, 0, 0.3, d + 0.6], [w / 2 + 0.15, 0, 0.3, d + 0.6],
    ]) {
      this.box('concrete', pw, 0.9, pd, x + dx, h + 0.79, z + dz, { density: 0.8 });
    }

    for (let f = 0; f < storeys; f++) {
      const y = f * FLOOR + 2.3;
      this.addWindows(x, y, z - d / 2 - 0.24, w - 6, 1.2, 0);
      this.addWindows(x, y, z + d / 2 + 0.24, w - 6, 1.2, Math.PI);
    }
    if (ladder) {
      this.addLadder(x + w / 2 + 0.5, z, 0, h + 0.9, -Math.PI / 2, { wood: false });
    }
    return { x, z, w, d, h, top: h + 0.34 };
  }

  // =======================================================================
  // districts
  // =======================================================================

  /**
   * The step-up route onto the container stacks.
   *
   * Every crate rises a uniform 0.42 m — under PHYS.stepHeight — and they are
   * spaced wider than they are deep and left unrotated. Rotating them looked
   * more casual but grew each collider's axis-aligned envelope until the boxes
   * overlapped, and the sweep then hit the side of the next crate instead of
   * mounting it: the player stalled three crates up.
   */
  _crateSteps(x, z, rot) {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    const rise = 0.42;
    // Slightly closer than the crates are wide, so consecutive tops overlap
    // and there is no gap for the player to drop into mid-climb.
    const spacing = 1.05;
    for (let i = 0; i < 7; i++) {
      const h = rise * (i + 1);
      const size = 1.15;
      this.box('wood', size, h, size,
        x + fx * i * spacing, h / 2, z + fz * i * spacing,
        { ry: rot, density: 1.2 });
    }
  }

  /**
   * An indirect way onto a roof: two containers stacked against a low wall,
   * then a crate on top to bridge the last step.
   */
  _climbRoute(x, z, ry) {
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    for (let i = 0; i < 2; i++) {
      container(this.batcher, { x, y: i * 2.62, z, ry, mat: i ? 'containerRust' : 'containerBlue' });
      this.collide(x, i * 2.62 + 1.3, z,
        12.2 * cos + 2.44 * sin, 2.59, 12.2 * sin + 2.44 * cos, 0, true);
    }
    // The last step: a crate on the stack, level with a single-storey eave.
    const ox = Math.sin(ry) * 4.2, oz = Math.cos(ry) * 4.2;
    this.box('wood', 1.4, 1.1, 1.4, x + ox, 5.24 + 0.55, z + oz, { density: 1.2 });
  }

  /**
   * Roof to roof, and the climbs that are not stairs.
   *
   * The plan only marks a stair in a handful of places; everywhere else the
   * way up is meant to be found — a container against a wall, a pipe stack, a
   * tank lid, and catwalks that carry you on once you are up there.
   */
  _connectors() {
    // North APR roof -> the north-east corner block, over the north street.
    this.addCatwalk(-14, -86, 30, -86, 11.0, { width: 1.0 });
    // The middle room cluster -> the east street's grille line.
    this.addCatwalk(31, -30, 44, -30, 11.0, { width: 0.95 });
    // West APR roof -> the pipe yard, the longest and most exposed crossing.
    this.addCatwalk(-51, -18, -34, -18, 10.8, { width: 0.9 });
    // Water-store lid -> the south APR roof.
    this.addCatwalk(29, 68, 29, 61, 10.4, { width: 0.9 });

    // Container stacks with a crate on top, against a low eave.
    this._climbRoute(-66, 62, 0);
    this._climbRoute(16, -46, Math.PI / 2);
    // The crate run onto the container tops by the east street.
    this._crateSteps(52, 30, 0);
  }

  _clutter() {
    const r = this.rand;

    // Drums and pallets against the buildings, as in the reference yard.
    const drumSpots = [
      [-40, -48], [-26, -46], [46, -22], [66, -50], [-30, 12], [18, 44],
      [70, 12], [-70, -18], [8, 66],
    ];
    for (const [x, z] of drumSpots) {
      drumCluster(this.batcher, { x, z, count: 6, mat: r() < 0.25 ? 'drumBlue' : 'drum' });
      this.collide(x, 0.6, z, 2.3, 1.2, 1.7, 0, true);
    }

    const palletSpots = [
      [-46, -44], [-20, -40], [42, -26], [70, -44], [-24, 16], [24, 40],
      [64, 18], [-66, -24], [14, 70], [-12, -22], [36, 8],
    ];
    for (const [x, z] of palletSpots) {
      palletStack(this.batcher, { x, z, high: 2 + Math.floor(r() * 3), ry: r() * Math.PI });
      this.collide(x, 0.25, z, 1.3, 0.5, 1.1, 0, true);
    }

    // Loose crates for low cover.
    for (let i = 0; i < 46; i++) {
      const x = (r() - 0.5) * (MAP_SIZE - 40);
      const z = (r() - 0.5) * (MAP_SIZE - 40);
      if (Math.hypot(x, z) < 12) continue;
      const s = 0.85 + r() * 0.55;
      this.box('wood', s, s, s, x, s / 2, z, { ry: r() * Math.PI, density: 1.3 });
    }

    // Ammo crates: stand next to one to refill.
    const ammoSpots = [
      [-52, -22], [50, -20], [-46, 22], [52, 22],
      [0, -28], [0, 28], [-28, 0], [28, 0], [0, 7],
    ];
    for (const [x, z] of ammoSpots) {
      this.box('containerGreen', 1.5, 0.85, 0.95, x, 0.42, z, { density: 1.0 });
      this.box('containerGreen', 1.25, 0.14, 0.8, x, 0.92, z,
        { solid: false, density: 1.2 });
      this.ammoBoxes.push({ x, y: 0.85, z, radius: 2.3 });
    }
  }

  _spawnPoints() {
    // Both sides start in the streets, at opposite ends of the compound, with
    // a building between them and the middle so nobody spawns in a sightline.
    const north = [
      [-70, -84], [-30, -80], [10, -84], [46, -84],
      [-84, -46], [-52, -50], [24, -50], [70, -80],
    ];
    const south = [
      [-70, 66], [-30, 70], [12, 66], [50, 62],
      [-86, 74], [-24, 56], [70, 56], [86, 40],
    ];
    for (const [x, z] of north) this.spawns[0].push(new THREE.Vector3(x, 0.6, z));
    for (const [x, z] of south) this.spawns[1].push(new THREE.Vector3(x, 0.6, z));
  }


  /** Picks a spawn far from the given threats. */
  pickSpawn(team, threats = []) {
    const list = this.spawns[team] || this.spawns[0];
    if (!list.length) return new THREE.Vector3(0, 1.2, 0);
    let best = list[0], bestScore = -Infinity;
    for (const p of list) {
      let score = Math.random() * 6;
      for (const t of threats) score += Math.min(p.distanceTo(t), 60);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
  }
}

/** Sky dome and lighting, tuned to the cold overcast of the references. */
export function buildSky(scene, quality) {
  // One flat colour, and it lives on the scene rather than on a sphere.
  //
  // The sky used to be a textured sphere of radius 620 centred on the origin,
  // while the camera's far plane is 700. Stand 90 m from the middle of the map
  // and the far side of that sphere is 710 m away — clipped — and what showed
  // through the hole was the renderer's black clear colour. That is the black
  // void that appeared over roofs and tanks depending on where you stood and
  // which way you looked. A scene background cannot be clipped, and it is the
  // single colour that was asked for.
  const SKY = new THREE.Color(0x8fb6d4);
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY.getHex(), 90, quality.fog);

  const hemi = new THREE.HemisphereLight(0xc6dcee, 0x6a675c, 1.45);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xa8bccd, 0.42));

  // The sun is nailed to one direction over the whole map. It used to be moved
  // to follow the player every frame, so a wall's shadow slid across the
  // ground as you walked past it and nothing lined up.
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.35);
  sun.position.set(120, 190, 84);
  sun.target.position.set(0, 0, 0);
  if (quality.shadowMap > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    sun.shadow.camera.near = 60;
    sun.shadow.camera.far = 520;
    // Wide enough to hold the whole yard, so nothing leaves the frustum as the
    // player crosses the map.
    const s = 150;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    sun.shadow.camera.updateProjectionMatrix();
  }
  scene.add(sun);
  scene.add(sun.target);

  const bounce = new THREE.DirectionalLight(0x9ab0c4, 0.34);
  bounce.position.set(-70, 46, -80);
  scene.add(bounce);

  const sky = null;
  return { sky, sun, hemi };
}
