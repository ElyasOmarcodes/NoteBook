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
    this._roads();
    this._perimeter();

    this._plantBlocks();
    this._warehouseRow();
    this._tankFarm();
    this._containerYard();
    this._chowk();
    this._downtown();
    this._frontage();

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
   * The yard's road: an asphalt loop with a kerbed edge, laid as a strip of
   * quads so it can bend around the plant the way the reference road does.
   */
  _roads() {
    const path = [
      [-86, -86], [-20, -86], [40, -78], [82, -52], [86, 8],
      [70, 62], [10, 86], [-52, 84], [-86, 40], [-90, -30], [-86, -86],
    ];
    const width = 13;
    const asphalt = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, z1] = path[i];
      const [x2, z2] = path[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);
      const g = new THREE.PlaneGeometry(width, len + 1.5);
      g.rotateX(-Math.PI / 2);
      scaleUV(g, width * 0.22, (len + 1.5) * 0.22);
      place(this.batcher, 'asphalt', g, {
        x: (x1 + x2) / 2, y: 0.015, z: (z1 + z2) / 2, ry: angle,
      });
      g.dispose();
      asphalt.push({ x1, z1, x2, z2, angle });
    }

    // Kerbs down both sides, stepped up off the asphalt.
    for (const seg of asphalt) {
      const nx = Math.cos(seg.angle) * (width / 2 + 0.2);
      const nz = -Math.sin(seg.angle) * (width / 2 + 0.2);
      for (const s of [1, -1]) {
        kerb(this.batcher, {
          x1: seg.x1 + nx * s, z1: seg.z1 + nz * s,
          x2: seg.x2 + nx * s, z2: seg.z2 + nz * s,
        });
      }
    }

    // A cross street through the middle of the plant.
    for (const [ax, az, bx, bz] of [[-70, 0, 70, 0], [0, -70, 0, 70]]) {
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      const g = new THREE.PlaneGeometry(11, len);
      g.rotateX(-Math.PI / 2);
      scaleUV(g, 11 * 0.22, len * 0.22);
      place(this.batcher, 'asphalt', g, {
        x: (ax + bx) / 2, y: 0.012, z: (az + bz) / 2,
        ry: Math.atan2(dx, dz),
      });
      g.dispose();
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

  /** North-west: the plant blocks with their skylight rows. */
  _plantBlocks() {
    this.plantBlock({ x: -58, z: -58, w: 30, d: 18, h: 9.5, skylights: 3, ladderSide: 1 });
    this.plantBlock({ x: -58, z: -30, w: 24, d: 14, h: 7.0, skylights: 2, ladderSide: -1 });
    this.plantBlock({ x: -22, z: -62, w: 20, d: 16, h: 11.5, skylights: 2, ladderSide: -1 });
    smokestack(this.batcher, { x: -8, z: -74, h: 27, r: 1.15 });
    this.cylinder(-8, -74, 1.15, 0, 27);
    smokestack(this.batcher, { x: -3, z: -74, h: 24, r: 1.0 });
    this.cylinder(-3, -74, 1.0, 0, 24);

    this.officeHut({ x: -36, z: -34 });
    this.places.push({ x: -52, z: -50, ps: DISTRICTS[0].ps, en: DISTRICTS[0].en });
  }

  /** North-east: the warehouse row. */
  _warehouseRow() {
    this.warehouse({ x: 54, z: -62, w: 34, d: 16, h: 7.4, wall: 'sidingRed', roof: 'roofRed', doorEnd: -1 });
    this.warehouse({ x: 54, z: -36, w: 34, d: 16, h: 7.4, wall: 'sidingGrey', roof: 'roof', doorEnd: 1 });
    this.warehouse({ x: 24, z: -30, w: 16, d: 26, h: 6.4, wall: 'sidingBlue', roof: 'roofBlue', doorEnd: 1 });

    // Wooden stair up to the northern warehouse deck, with a landing.
    this.addStairs(30, 0, -70, 0, 22, { width: 2.2 });
    this.box('wood', 3.2, 0.16, 3.2, 30, 7.5, -61.5, { density: 0.9 });


    this.places.push({ x: 54, z: -48, ps: DISTRICTS[1].ps, en: DISTRICTS[1].en });
  }

  /** South-west: the tank farm. */
  _tankFarm() {
    const tanks = [
      { x: -64, z: 34, r: 9.0, h: 12.5 },
      { x: -40, z: 30, r: 9.0, h: 12.5 },
      { x: -62, z: 60, r: 10.5, h: 15.0 },
      { x: -34, z: 58, r: 7.5, h: 10.5 },
    ];
    for (const t of tanks) {
      oilTank(this.batcher, this.extras, t);
      this.cylinder(t.x, t.z, t.r, 0, t.h);
      const lid = aabb(t.x, t.h + 0.3, t.z, (t.r + 0.12) * 2, 0.6, (t.r + 0.12) * 2);
      lid.walkable = true;
      lid.round = { x: t.x, z: t.z, r: t.r + 0.12 };
      this.solids.push(lid);
    }
    // Service ladder up the biggest tank.
    const big = tanks[2];
    this.addLadder(big.x, big.z + big.r + 0.12, 0, big.h + 0.6, 0, { wood: false });

    // Trestle pipe runs, low enough to duck under and high enough to shelter.
    pipeRun(this.batcher, { x1: -74, z1: 20, x2: -20, z2: 20, y: 4.2, r: 0.48 });
    pipeRun(this.batcher, { x1: -74, z1: 23, x2: -20, z2: 23, y: 3.4, r: 0.34 });
    this.collide(-47, 4.2, 20, 54, 0.5, 1.2, 0, true);

    // A high pipe joining two tank lids: the quiet flank route.
    pipeRun(this.batcher, {
      x1: tanks[0].x, z1: tanks[0].z, x2: tanks[2].x, z2: tanks[2].z,
      y: 12.8, r: 0.55, supports: false,
    });
    this.collide((tanks[0].x + tanks[2].x) / 2, 13.1, (tanks[0].z + tanks[2].z) / 2,
      1.4, 0.4, Math.abs(tanks[2].z - tanks[0].z) + 2, 0, true);

    this.places.push({ x: -52, z: 44, ps: DISTRICTS[2].ps, en: DISTRICTS[2].en });
  }

  /** South-east: the container yard. */
  _containerYard() {
    const mats = ['containerBlue', 'containerRust', 'containerGreen'];
    const layout = [
      [34, 30, 0, 2], [34, 34, 0, 1], [50, 26, Math.PI / 2, 2],
      [62, 40, 0, 3], [40, 52, Math.PI / 2, 1], [58, 62, 0, 2],
      [30, 66, 0, 1], [74, 30, Math.PI / 2, 2], [72, 68, 0, 1],
    ];
    let n = 0;
    for (const [cx, cz, ry, stack] of layout) {
      for (let s = 0; s < stack; s++) {
        const y = s * 2.62;
        container(this.batcher, {
          x: cx, y, z: cz, ry, mat: mats[n % 3],
        });
        const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
        this.collide(cx, y + 1.3, cz,
          12.2 * cos + 2.44 * sin, 2.59, 12.2 * sin + 2.44 * cos, 0, true);
        n++;
      }
    }
    // The step-up route: crates rising a uniform 0.42 m onto the stacks.
    this._crateSteps(22, 30, 0);
    this.addLadder(62, 46.5, 0, 8.0, Math.PI, { wood: false });
    this.addCatwalk(62, 44, 58, 34, 7.95, { width: 0.95 });

    this.places.push({ x: 52, z: 46, ps: DISTRICTS[3].ps, en: DISTRICTS[3].en });
  }

  /** The chowk itself: the open crossing at the centre of the plant. */
  _chowk() {
    // Watchtower over the crossroads.
    const tx = 0, tz = 0, th = 11;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.box('plate', 0.38, th, 0.38,
        tx + Math.cos(a) * 2.5, th / 2, tz + Math.sin(a) * 2.5, { density: 1.0 });
    }
    this.box('plate', 6.6, 0.3, 6.6, tx, th + 0.15, tz, { density: 0.6 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.box('plate', 6.6, 1.15, 0.14,
        tx + Math.sin(a) * 3.2, th + 0.9, tz + Math.cos(a) * 3.2,
        { ry: a, solid: false, density: 1.0 });
    }
    this.box('roofBlue', 7.4, 0.18, 7.4, tx, th + 2.3, tz, { solid: false, density: 0.5 });
    this.addLadder(tx + 3.0, tz, 0, th + 0.5, -Math.PI / 2, { wood: false });
    this.places.push({ x: 0, z: 0, ps: 'مرکزي برج', en: 'TOWER' });

    // Fenced compound around the crossing.
    chainFence(this.batcher, this.extras, { x1: -16, z1: -13, x2: 16, z2: -13, mesh: this.fenceMat });
    this.collide(0, 1.2, -13, 32, 2.4, 0.4, 0, false);
    chainFence(this.batcher, this.extras, { x1: -16, z1: 13, x2: 16, z2: 13, mesh: this.fenceMat });
    this.collide(0, 1.2, 13, 32, 2.4, 0.4, 0, false);
  }

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
   * The south quarter: the part of the yard with real height in it.
   *
   * Everything else on this map is a shed on flat ground. Here the ground
   * itself does the work — a raised concrete terrace split by two streets that
   * run at the old grade, so walking along them is walking at the bottom of a
   * 3.6 m canyon with the deck above on both sides. What stands on the deck is
   * deliberately uneven: a single-storey block you can only reach by catwalk,
   * a two-storey with an outside stair, a three-storey with a stairwell, and a
   * shed with nothing at all. Fighting through it means choosing a level.
   */
  _downtown() {
    const DECK = 3.6;                 // terrace height above the yard
    const blocks = [
      { x: -12, z: 46, w: 20, d: 21 },
      { x: -12, z: 76, w: 20, d: 25 },
      { x: 16, z: 46, w: 20, d: 21 },
      { x: 16, z: 76, w: 20, d: 25 },
    ];
    for (const b of blocks) {
      this.box('concrete', b.w, DECK, b.d, b.x, DECK / 2, b.z, { density: 0.34 });
      // A kerb around the lip, so the edge reads before you walk off it.
      for (const [dx, dz, kw, kd] of [
        [0, -b.d / 2, b.w, 0.3], [0, b.d / 2, b.w, 0.3],
        [-b.w / 2, 0, 0.3, b.d], [b.w / 2, 0, 0.3, b.d],
      ]) {
        this.box('kerb', kw, 0.26, kd, b.x + dx, DECK + 0.13, b.z + dz,
          { density: 1.1 });
      }
    }

    // ---- what stands on the deck ----

    // Single storey, flat roof, no way up from the deck: the catwalk only.
    this.box('block', 13, 4.2, 12, -12, DECK + 2.1, 42, { density: 0.4 });
    this.box('roof', 13.6, 0.3, 12.6, -12, DECK + 4.35, 42, { density: 0.5 });

    // Two storeys with an outside stair and a landing at the first floor.
    this.box('sidingGrey', 14, 8.4, 15, -12, DECK + 4.2, 78, { density: 0.42 });
    this.box('roofRed', 14.6, 0.32, 15.6, -12, DECK + 8.56, 78, { density: 0.5 });
    for (let f = 0; f < 2; f++) {
      const y = DECK + 3.0 + f * 3.9;
      for (const zz of [73.5, 78, 82.5]) {
        this.box('plate', 0.12, 1.5, 2.4, -19.05, y, zz,
          { solid: false, density: 1.0 });
      }
    }
    // Two flights up the east face, with a half-landing, onto the first floor
    // gallery and then the roof.
    this.stairTower(-3.4, DECK, 88.0, Math.PI, 2,
      { steps: 6, width: 1.7, rise: 0.34, run: 0.42, mat: 'concrete',
        landing: 2.2 });
    // The gallery has to begin where the stairs end, not overhang them: a slab
    // at head height above the second flight is a ceiling to walk into.
    this.box('plate', 3.2, 0.24, 6.0, -3.4, DECK + 4.05, 77.4, { density: 0.8 });
    this.addLadder(-4.4, 76.0, DECK + 4.2, DECK + 8.8, -Math.PI / 2, { wood: false });

    // Three storeys with a proper stairwell running up the outside.
    this.box('block', 15, 12.6, 14, 16, DECK + 6.3, 46, { density: 0.42 });
    this.box('roof', 15.6, 0.34, 14.6, 16, DECK + 12.77, 46, { density: 0.5 });
    // Three flights climbing the block's east face, landing by landing.
    this.stairTower(25.2, DECK, 37.0, 0, 3,
      { steps: 8, width: 1.7, rise: 0.36, run: 0.42, mat: 'concrete',
        landing: 2.2 });
    // A gallery off the top of the stairs and a ladder onto the roof.
    this.box('plate', 3.4, 0.26, 6.0, 25.2, DECK + 8.5, 52.5, { density: 0.8 });
    this.addLadder(24.2, 53.5, DECK + 8.7, DECK + 12.95, -Math.PI / 2, { wood: false });
    this.box('plate', 8.0, 0.26, 3.0, 20.0, DECK + 12.8, 52.8, { density: 0.8 });

    // A storage shed: low, cluttered, and a dead end if you climb it.
    this.box('sidingBlue', 11, 3.2, 9, 16, DECK + 1.6, 78, { density: 0.45 });
    this.box('roofBlue', 11.6, 0.28, 9.6, 16, DECK + 3.34, 78, { density: 0.5 });
    this.addLadder(16, 73.0, DECK, DECK + 3.7, 0, { wood: false });

    // ---- getting up from the streets ----

    // South end of the north-south street: one long flight.
    this.addStairs(2, 0, 33.5, 0, 11,
      { width: 3.0, rise: 0.34, run: 0.42, mat: 'concrete' });
    this.box('concrete', 4.0, 0.3, 3.0, 2, DECK - 0.15, 39.5, { density: 0.8 });

    // The cross street: a switchback climbing the north deck's flank, laid
    // along the street so neither flight runs into a block.
    this.stairTower(-6.5, 0, 60.0, -Math.PI / 2, 2,
      { steps: 6, width: 1.85, rise: 0.34, run: 0.44, mat: 'concrete',
        landing: 2.2 });

    // South-west corner: a vehicle ramp rather than steps, wide enough to
    // fight over, running up onto the deck clear of the container yard.
    // Each slab is built down to the yard, not floated at its own height —
    // a floating slab is a wall to walk into rather than a step to walk up.
    // Deep slabs on a short pitch: consecutive tops have to overlap by more
    // than the player's radius or the sweep meets the next slab's face
    // instead of its top, and the climb stalls a third of the way up.
    // It runs up the outside of the west block, not into its face: a ramp
    // that ends against a wall is a wall.
    for (let i = 0; i < 12; i++) {
      const top = (DECK * i) / 11 + 0.18;
      this.box('asphalt', 4.6, top, 1.7, -25.4, top / 2, 30.0 + i * 1.05,
        { density: 0.9 });
    }
    // The turn onto the deck at the top.
    this.box('asphalt', 8.0, 0.3, 3.4, -23.6, DECK - 0.15, 42.4, { density: 0.9 });

    // ---- the streets themselves ----
    // Bridges across the north-south street, so the deck is one piece again.
    this.box('plate', 8.6, 0.30, 3.4, 2, DECK - 0.15, 52, { density: 0.7 });
    this.box('plate', 8.6, 0.30, 3.4, 2, DECK - 0.15, 84, { density: 0.7 });
    for (const bz of [52, 84]) {
      for (const s of [-1, 1]) {
        this.box('plate', 8.6, 1.05, 0.12, 2, DECK + 0.5, bz + s * 1.6,
          { solid: false, density: 1.0 });
      }
    }

    // Clutter down in the canyon, for cover and for scale.
    drumCluster(this.batcher, { x: 1.2, z: 44, count: 5 });
    this.collide(1.2, 0.45, 44, 2.2, 0.9, 2.2, 0, true);
    drumCluster(this.batcher, { x: 3.4, z: 70, count: 4, mat: 'drumBlue' });
    this.collide(3.4, 0.45, 70, 1.9, 0.9, 1.9, 0, true);
    palletStack(this.batcher, { x: -0.6, z: 66, high: 4, ry: 0.2 });
    this.collide(-0.6, 0.5, 66, 1.4, 1.0, 1.2, 0, true);
    pipeRun(this.batcher, { x1: -2, z1: 36, x2: -2, z2: 88, y: 2.7, r: 0.20 });

    // Rooflines joined up, so the high ground is a route and not four islands.
    this.addCatwalk(-12, 48.5, -12, 65.5, DECK + 4.5, { width: 1.0 });
    this.addCatwalk(-4.6, 46, 8.4, 46, DECK + 4.5, { width: 1.0 });

    this.places.push({ x: 2, z: 60, ps: 'ښار', en: 'DOWNTOWN' });
  }


  /**
   * The frontage: three apartments and three rooms on every side of the
   * compound, with link walls closing the gaps between them.
   *
   * The plan calls for no empty edge. Each side gets the same six buildings in
   * a different order and at different heights, so a player crossing the map
   * always has a wall to break line of sight and a roof worth climbing to, and
   * no two corners look alike.
   *
   * Colour follows the plan: red is painted iron, plain is white iron, and the
   * grille sections are expanded metal you can shoot through the gaps of.
   */
  _frontage() {
    const SLOTS = [-70, -42, -14, 14, 42, 70];
    // Alternating room / apartment, cycling storeys and colours so that the
    // same six never repeat in the same order on two sides.
    const PLAN = [
      { kind: 'apt',  storeys: 2, mat: 'sidingWhite' },
      { kind: 'room', storeys: 1, mat: 'sidingRed',   roof: 'roofRed' },
      { kind: 'apt',  storeys: 3, mat: 'sidingGrey' },
      { kind: 'room', storeys: 2, mat: 'sidingWhite', roof: 'roof' },
      { kind: 'apt',  storeys: 1, mat: 'mesh' },
      { kind: 'room', storeys: 3, mat: 'sidingRed',   roof: 'roofRed' },
    ];
    const SIDES = [
      // side, fixed coordinate, which way the doors face, plan rotation
      { id: 'north', axis: 'x', at: -86, door: 'south', spin: 0, d: 15 },
      { id: 'east',  axis: 'z', at: 90,  door: 'west',  spin: 2, d: 14 },
      { id: 'south', axis: 'x', at: 94,  door: 'north', spin: 4, d: 9 },
      { id: 'west',  axis: 'z', at: -88, door: 'east',  spin: 1, d: 15 },
    ];

    for (const side of SIDES) {
      const built = [];
      for (let i = 0; i < SLOTS.length; i++) {
        const spec = PLAN[(i + side.spin) % PLAN.length];
        const along = SLOTS[i];
        const horizontal = side.axis === 'x';
        const x = horizontal ? along : side.at;
        const z = horizontal ? side.at : along;
        const w = horizontal ? 22 : side.d;
        const d = horizontal ? side.d : 22;
        // A half-depth building, the plan's 0.5x: full height, half the plan.
        const half = (i === 4);
        const opts = {
          x, z,
          w: half && horizontal ? w * 0.5 : w,
          d: half && !horizontal ? d * 0.5 : d,
          storeys: spec.storeys,
          mat: spec.mat,
          door: side.door,
          ladder: i % 3 === 1,
        };
        const b = spec.kind === 'room'
          ? this.room({ ...opts, roof: spec.roof })
          : this.apartment(opts);
        built.push({ ...b, along, horizontal });
      }

      // Link walls: where there is no building the plan says there is a wall.
      for (let i = 0; i < built.length - 1; i++) {
        const a = built[i], c = built[i + 1];
        const gapMid = (a.along + c.along) / 2;
        const span = (c.along - a.along)
          - (a.horizontal ? a.w + c.w : a.d + c.d) / 2 - 1.2;
        if (span < 1.5) continue;
        if (a.horizontal) {
          this.box('wall', span, 3.4, 0.5, gapMid, 1.7, side.at, { density: 0.3 });
          this.box('kerb', span + 0.4, 0.3, 0.8, gapMid, 3.55, side.at, { density: 0.9 });
        } else {
          this.box('wall', 0.5, 3.4, span, side.at, 1.7, gapMid, { density: 0.3 });
          this.box('kerb', 0.8, 0.3, span + 0.4, side.at, 3.55, gapMid, { density: 0.9 });
        }
      }
    }

    // Ways up that are not stairs: a container against a wall, a stack that
    // reaches a low roof, a tank you can climb from a catwalk. The plan asks
    // for the climb to be found rather than signposted.
    this._climbRoute(-70, -70, 0);
    this._climbRoute(70, 76, Math.PI / 2);
    this._climbRoute(-72, 74, 0);
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

  _connectors() {
    // Plant roof -> warehouse deck, over the north street.
    this.addCatwalk(-43, -58, 37, -62, 9.2, { width: 1.0 });
    // Warehouse deck -> container tops, over the east street.
    this.addCatwalk(60, -28, 62, 22, 7.9, { width: 0.95 });
    // Tank lid -> plant roof, the longest and most exposed crossing.
    this.addCatwalk(-62, 48, -58, -20, 12.0, { width: 0.9 });
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
    const north = [
      [-76, -74], [-60, -78], [-42, -74], [-80, -56],
      [40, -76], [56, -78], [70, -66], [24, -70],
    ];
    const south = [
      [-76, 74], [-60, 78], [-42, 74], [-80, 56],
      [40, 76], [56, 78], [70, 66], [24, 70],
    ];
    for (const [x, z] of north) this.spawns[0].push(new THREE.Vector3(x, 0.6, z));
    for (const [x, z] of south) this.spawns[1].push(new THREE.Vector3(x, 0.6, z));

    // Downtown drops you into the streets between the decks, not on top of
    // them: the climb is meant to be earned.
    const town = [[2, 34.5], [2, 90], [-26, 62], [30, 60]];
    for (let i = 0; i < town.length; i++) {
      const [x, z] = town[i];
      this.spawns[i % 2].push(new THREE.Vector3(x, 0.6, z));
    }
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
