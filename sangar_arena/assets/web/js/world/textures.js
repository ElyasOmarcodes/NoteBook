import * as THREE from '../../vendor/three.module.js';
import {
  rng, fbm, cellular, warp, clamp255, lerp, smoothstep,
  crackNetwork, rainStreaks, blotches,
} from './noise.js';

/**
 * Every surface in the arena is painted at runtime.
 *
 * The reference for the whole set is an abandoned refinery: cracked asphalt
 * with oil stains, precast concrete panels streaked by rain, corrugated steel
 * siding whose ribs catch the light, riveted tank plate, and ribbed shipping
 * containers. Each painter below reproduces that surface's actual structure —
 * the crack network, the panel seams, the rib profile, the rivet rows — rather
 * than dusting noise over a flat colour, and each ships a matching normal and
 * roughness map so the light behaves like it does on the real thing.
 */

const cache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function ctx2d(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

/** Fills the canvas from a per-pixel callback returning [r,g,b]. */
function paint(ctx, size, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i += 4) {
      const [r, g, b] = fn(x, y, y * size + x);
      d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// =========================================================================
// Map derivation
// =========================================================================

/**
 * Tangent-space normal map from a height field.
 *
 * Deriving it from an explicit height (rather than from the albedo's
 * luminance) is what stops a painted-on rust stain from reading as a dent.
 */
function normalFromHeight(height, size, strength = 3.0) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => height[((y % size) + size) % size * size
    + (((x % size) + size) % size)];
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i += 4) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      d[i] = clamp255(((dx / len) * 0.5 + 0.5) * 255);
      d[i + 1] = clamp255(((dy / len) * 0.5 + 0.5) * 255);
      d[i + 2] = clamp255(((1 / len) * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Greyscale roughness map from a 0..1 field. */
function mapFromField(field, size) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    const v = clamp255(field[n] * 255);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Reads a painted canvas back as a 0..1 luminance field. */
function luminanceOf(canvas, size) {
  const data = ctx2d(canvas).getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0, n = 0; i < data.length; i += 4, n++) {
    out[n] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  }
  return out;
}

// =========================================================================
// Painters — each returns { albedo, height, rough }
// =========================================================================

/**
 * Weathered asphalt. Dark aggregate-flecked bitumen, a branching crack
 * network, oil stains around where machinery stood, and lighter repair
 * patches — the road surface that runs through the whole yard.
 */
function paintAsphalt(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 5, cells: 5 });
  const fine = fbm(size, seed + 19, { octaves: 4, cells: 26 });
  const stones = cellular(size, seed + 11, Math.round(size / 26));
  // Broad tonal patches: an old surface that has been laid, cut and made good
  // more than once, which is what the reference road actually looks like.
  const patch = warp(size, fbm(size, seed + 3, { octaves: 3, cells: 2 }),
    fbm(size, seed + 5, { octaves: 2, cells: 4 }), size * 0.08);

  paint(ctx, size, (x, y, i) => {
    // Bitumen: dark and close-textured. The old painter pushed hard aggregate
    // through it, which read as gravel rather than as a road.
    let v = 44 + (grain[i] - 0.5) * 16 + (fine[i] - 0.5) * 10;
    // A little aggregate showing where the binder has worn thin. Kept low:
    // pushed hard it reads as gravel rather than as a road.
    v += Math.pow(1 - stones[i], 7) * 20;
    // Patches are a greyer, flatter mix laid over the original.
    const isPatch = smoothstep(0.54, 0.66, patch[i]);
    v = lerp(v, 58 + (fine[i] - 0.5) * 8, isPatch);
    // Wheel polish: two darker, smoother bands where traffic runs.
    const lane = Math.abs(Math.sin((x / size) * Math.PI * 2));
    v -= smoothstep(0.55, 1.0, lane) * 5;
    const warm = 1 + (grain[i] - 0.5) * 0.05;
    return [v * warm, v * 0.985, v * 0.96];
  });

  // Fine cracking, not the branching canyon network the yard has.
  crackNetwork(ctx, size, seed + 31, {
    trunks: 5, maxDepth: 2, width: 1.0, alpha: 0.30, colour: '18,18,20',
  });
  blotches(ctx, size, seed + 41, {
    count: 10, radius: size * 0.07, alpha: 0.16,
    colours: ['26,26,28', '70,68,66'],
  });

  const height = new Float32Array(size * size);
  const lum = luminanceOf(c, size);
  for (let i = 0; i < height.length; i++) height[i] = lum[i] * 0.45 + 0.3;
  const rough = new Float32Array(size * size);
  for (let i = 0; i < rough.length; i++) rough[i] = 0.88 - lum[i] * 0.10;
  return { albedo: c, height, rough, normalStrength: 1.1 };
}

/**
 * Precast concrete panel — the perimeter and dividing walls. Panel joints,
 * form-tie holes, a chipped bottom edge and heavy rain-wash down the face.
 */
function paintConcrete(size, seed, { panelRows = 2, tint = 1 } = {}) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 6, cells: 3 });
  const fine = fbm(size, seed + 5, { octaves: 4, cells: 24 });
  const blotch = warp(size, fbm(size, seed + 7, { octaves: 3, cells: 3 }),
    fbm(size, seed + 9, { octaves: 2, cells: 5 }), size * 0.06);

  paint(ctx, size, (x, y, i) => {
    let v = 172 + (grain[i] - 0.5) * 28 + (fine[i] - 0.5) * 14;
    // Damp patches: concrete darkens unevenly where it holds water, but only
    // gently — heavy blotching reads as camouflage, not as a wall.
    v -= smoothstep(0.60, 0.86, blotch[i]) * 20;
    const r = v * 1.005 * tint, g = v * 0.998 * tint, b = v * 0.965 * tint;
    return [r, g, b];
  });

  // Panel joints — a recessed dark line with a light lip below it.
  const rowH = size / panelRows;
  ctx.save();
  for (let r = 1; r <= panelRows; r++) {
    const y = r * rowH;
    ctx.fillStyle = 'rgba(96,96,92,0.88)';
    ctx.fillRect(0, y - 4, size, 4);
    ctx.fillStyle = 'rgba(224,222,214,0.55)';
    ctx.fillRect(0, y, size, 3);
  }
  // Vertical joints, offset per row like real panel runs.
  for (let r = 0; r < panelRows; r++) {
    const rand = rng(seed + 100 + r);
    const x = (0.35 + rand() * 0.3) * size;
    ctx.fillStyle = 'rgba(72,72,70,0.6)';
    ctx.fillRect(x, r * rowH, 3, rowH);
  }
  ctx.restore();

  // Form-tie holes: small dark dimples in a regular grid.
  const rand = rng(seed + 13);
  for (let r = 0; r < panelRows; r++) {
    for (let k = 0; k < 4; k++) {
      const x = (k + 0.5) * (size / 4) + (rand() - 0.5) * 8;
      const y = r * rowH + rowH * (0.3 + rand() * 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 5);
      g.addColorStop(0, 'rgba(56,54,50,0.85)');
      g.addColorStop(1, 'rgba(56,54,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  rainStreaks(ctx, size, seed + 17, {
    count: 46, colour: '62,60,54', alpha: 0.34, maxWidth: 7,
  });
  blotches(ctx, size, seed + 19, {
    count: 12, radius: size * 0.06, alpha: 0.13,
    colours: ['104,98,84', '96,100,96', '186,182,172'],
  });

  // Damp and moss along the foot of the wall. Every wall in the reference has
  // it, and without it a concrete panel reads as new rather than abandoned.
  const foot = ctx.createLinearGradient(0, size, 0, size * 0.72);
  foot.addColorStop(0, 'rgba(58,66,48,0.42)');
  foot.addColorStop(0.45, 'rgba(72,76,62,0.18)');
  foot.addColorStop(1, 'rgba(72,76,62,0)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, size * 0.72, size, size * 0.28);
  blotches(ctx, size, seed + 29, {
    count: 14, radius: size * 0.035, alpha: 0.22,
    colours: ['64,74,50', '52,60,44'],
  });

  const height = luminanceOf(c, size);
  const rough = new Float32Array(size * size).fill(0.94);
  return { albedo: c, height, rough, normalStrength: 1.5 };
}

/**
 * Corrugated steel siding — the signature surface of the whole set.
 *
 * The ribs are shaded from an actual sinusoidal profile rather than a linear
 * gradient, so the highlight sits where the sheet's crown is and the shadow in
 * the valley. Fastener rows, vertical dirt washes and rust creeping up from
 * the bottom edge finish it.
 */
function paintCorrugated(size, seed, {
  base = [206, 208, 205], ribs = 46, rust = 0.55, dirt = 0.6, wear = 0.5,
} = {}) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 4, cells: 10 });
  const wash = fbm(size, seed + 3, { octaves: 3, cells: 4 });
  // Where the paint has come off. Low-frequency blobs warped so the edges are
  // ragged: sheet metal loses paint in flakes, not in circles.
  const peel = warp(size, fbm(size, seed + 21, { octaves: 3, cells: 3 }),
    fbm(size, seed + 23, { octaves: 3, cells: 7 }), size * 0.05);
  const period = size / ribs;

  // The reference sheets are narrow trapezoidal ribs, not sine waves: a flat
  // crown, a steep lit flank, a flat valley, a steep shaded flank.
  const profileAt = (t) => {
    if (t < 0.30) return 1;                        // crown
    if (t < 0.44) return 1 - (t - 0.30) / 0.14;    // falling flank
    if (t < 0.74) return 0;                        // valley
    return (t - 0.74) / 0.26;                      // rising flank
  };

  paint(ctx, size, (x, y, i) => {
    const t = (x % period) / period;
    const h = profileAt(t);
    // Light from the upper left: the rising flank catches it, the falling
    // flank is in shadow, and the crown sits between.
    const rising = t >= 0.74 ? 1 : 0;
    const falling = t >= 0.30 && t < 0.44 ? 1 : 0;
    const shade = h * 0.10 + rising * 0.22 - falling * 0.26;

    let v = 1 + shade;
    v *= 0.94 + grain[i] * 0.12;
    // Vertical dirt wash, heavier low down.
    v -= wash[i] * dirt * 0.20 * (0.35 + (y / size) * 0.85);

    let r = base[0] * v, g = base[1] * v, b = base[2] * v;

    // Bare galvanised steel where the paint has gone.
    const bare = smoothstep(0.56, 0.72, peel[i]) * wear;
    r = lerp(r, 196 * v, bare); g = lerp(g, 198 * v, bare); b = lerp(b, 192 * v, bare);

    // Rust climbs from the bottom edge and pools in the valleys, and it eats
    // the bare patches first.
    const low = smoothstep(0.50, 1.0, y / size);
    const inValley = 1 - h;
    const rustAmt = Math.min(1, (low * 0.9 + bare * 0.7) * rust
      * (0.45 + inValley * 0.8) * (0.4 + grain[i] * 1.2));
    r = lerp(r, 138, rustAmt); g = lerp(g, 68, rustAmt); b = lerp(b, 34, rustAmt);
    return [r, g, b];
  });

  // Trim bands: a folded capping at the head of the sheet and a skirt at the
  // foot, which is what gives these walls their horizontal reading.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, 0, size, size * 0.035);
  ctx.fillStyle = 'rgba(30,24,18,0.22)';
  ctx.fillRect(0, size * 0.035, size, size * 0.012);
  ctx.fillStyle = 'rgba(60,40,26,0.26)';
  ctx.fillRect(0, size * 0.955, size, size * 0.045);
  ctx.restore();

  // Fastener rows, one screw per crown, with the stain that runs from it.
  const rows = 7;
  const rand = rng(seed + 7);
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * (size / rows);
    for (let i = 0; i < ribs; i++) {
      const x = (i + 0.15) * period;
      ctx.fillStyle = 'rgba(44,38,32,0.62)';
      ctx.beginPath(); ctx.arc(x, y + (rand() - 0.5) * 2, 1.5, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(0, y, 0, y + size * 0.07);
      g.addColorStop(0, `rgba(126,66,32,${0.34 * rust})`);
      g.addColorStop(1, 'rgba(126,66,32,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 1.4, y, 2.8, size * 0.07);
    }
  }

  rainStreaks(ctx, size, seed + 11, {
    count: 40, colour: '96,58,30', alpha: 0.28 * rust, maxWidth: 3,
  });
  blotches(ctx, size, seed + 13, {
    count: Math.round(20 * rust), radius: size * 0.05, alpha: 0.36,
    colours: ['142,72,30', '104,50,22', '166,104,48'],
  });

  // Height comes from the rib profile alone: the rust must not emboss.
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] = profileAt((x % period) / period);
    }
  }
  const rough = new Float32Array(size * size);
  const lum = luminanceOf(c, size);
  for (let i = 0; i < rough.length; i++) {
    // Painted steel is fairly smooth; rust is not.
    rough[i] = 0.40 + (1 - lum[i]) * 0.48;
  }
  return { albedo: c, height, rough, normalStrength: 3.4, metalness: 0.5 };
}

/**
 * Roof sheeting — flat panels laid in courses, in the dusty rose, rust red and
 * blue-grey of the reference roofs, with chalky weathering blooms.
 */
function paintRoof(size, seed, base = [150, 118, 122]) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 5, cells: 6 });
  const chalk = warp(size, fbm(size, seed + 5, { octaves: 3, cells: 3 }),
    fbm(size, seed + 6, { octaves: 2, cells: 6 }), size * 0.05);

  const cols = 6, rows = 10;
  const cw = size / cols, ch = size / rows;

  paint(ctx, size, (x, y, i) => {
    const col = Math.floor(x / cw), row = Math.floor(y / ch);
    const sheetRand = ((col * 73 + row * 131) % 17) / 17;
    let v = 0.88 + sheetRand * 0.22 + (grain[i] - 0.5) * 0.20;
    // Chalky white weathering, the most recognisable thing about these roofs.
    const bloom = smoothstep(0.52, 0.80, chalk[i]);
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    r = lerp(r, 226, bloom * 0.65);
    g = lerp(g, 224, bloom * 0.65);
    b = lerp(b, 220, bloom * 0.65);
    return [r, g, b];
  });

  // Seams between sheets, and the raised standing seam highlight.
  ctx.save();
  for (let col = 1; col < cols; col++) {
    const x = col * cw;
    ctx.fillStyle = 'rgba(52,44,44,0.55)';
    ctx.fillRect(x - 1.5, 0, 3, size);
    ctx.fillStyle = 'rgba(238,236,230,0.22)';
    ctx.fillRect(x + 1.5, 0, 2, size);
  }
  for (let row = 1; row < rows; row++) {
    const y = row * ch;
    ctx.fillStyle = 'rgba(48,40,40,0.45)';
    ctx.fillRect(0, y - 1.5, size, 2.5);
  }
  ctx.restore();

  blotches(ctx, size, seed + 9, {
    count: 20, radius: size * 0.07, alpha: 0.30,
    colours: ['124,70,44', '92,74,72', '206,202,196'],
  });
  rainStreaks(ctx, size, seed + 12, {
    count: 22, colour: '74,54,48', alpha: 0.20, maxWidth: 5,
  });

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs((x % cw) - cw / 2) / (cw / 2);
      height[y * size + x] = 0.35 + Math.pow(dx, 6) * 0.65;
    }
  }
  const rough = new Float32Array(size * size).fill(0.62);
  return { albedo: c, height, rough, normalStrength: 3.0, metalness: 0.32 };
}

/**
 * Painted concrete block — the light blue-white block walls on the office
 * blocks, with visible mortar courses.
 */
function paintBlock(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 5, cells: 10 });
  const damp = fbm(size, seed + 4, { octaves: 3, cells: 3 });

  const rows = 10;
  const rowH = size / rows;
  const blockW = size / 5;
  const rand = rng(seed + 2);

  ctx.fillStyle = '#8d9296';
  ctx.fillRect(0, 0, size, size);   // mortar
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (blockW / 2);
    for (let i = -1; i < 6; i++) {
      const x = offset + i * blockW;
      const y = r * rowH;
      const tone = 176 + rand() * 24;
      ctx.fillStyle = `rgb(${tone | 0},${(tone * 1.02) | 0},${(tone * 1.04) | 0})`;
      ctx.fillRect(x + 2, y + 2, blockW - 4, rowH - 4);
      // The bottom of each block picks up grime.
      ctx.fillStyle = `rgba(96,98,96,${0.10 + rand() * 0.14})`;
      ctx.fillRect(x + 2, y + rowH - 6, blockW - 4, 4);
    }
  }

  // Grain and damp over the top.
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0, n = 0; i < img.data.length; i += 4, n++) {
    const v = (grain[n] - 0.5) * 34 - smoothstep(0.55, 0.8, damp[n]) * 26;
    img.data[i] = clamp255(img.data[i] + v);
    img.data[i + 1] = clamp255(img.data[i + 1] + v);
    img.data[i + 2] = clamp255(img.data[i + 2] + v * 0.95);
  }
  ctx.putImageData(img, 0, 0);

  rainStreaks(ctx, size, seed + 8, {
    count: 30, colour: '70,72,70', alpha: 0.26, maxWidth: 5,
  });

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH);
    const offset = (r % 2) * (blockW / 2);
    for (let x = 0; x < size; x++) {
      const lx = (((x - offset) % blockW) + blockW) % blockW;
      const ly = y % rowH;
      const inBlock = lx > 2 && lx < blockW - 2 && ly > 2 && ly < rowH - 2;
      height[y * size + x] = inBlock ? 0.75 : 0.25;
    }
  }
  const rough = new Float32Array(size * size).fill(0.9);
  return { albedo: c, height, rough, normalStrength: 2.4 };
}

/**
 * Riveted tank plate — the storage tanks. Horizontal plate courses, a rivet
 * row along every seam, and long rust weeps beneath them.
 */
function paintTank(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 5, cells: 5 });
  const bands = 5;
  const bh = size / bands;

  paint(ctx, size, (x, y, i) => {
    const local = (y % bh) / bh;
    // Each plate course is very slightly domed, and darkens toward its lap.
    const dome = Math.sin(local * Math.PI) * 0.06;
    let v = 0.86 + dome + (grain[i] - 0.5) * 0.14;
    v -= smoothstep(0.86, 1.0, local) * 0.22;
    const base = 196 * v;
    return [base * 1.005, base * 1.0, base * 0.985];
  });

  const rand = rng(seed + 3);
  for (let b = 1; b <= bands; b++) {
    const y = b * bh;
    ctx.fillStyle = 'rgba(84,82,78,0.80)';
    ctx.fillRect(0, y - 3, size, 3);
    ctx.fillStyle = 'rgba(236,234,228,0.42)';
    ctx.fillRect(0, y, size, 2);
    // Rivets.
    const n = Math.round(size / 14);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (size / n);
      const ry = y - 6 + (rand() - 0.5) * 1.5;
      const g = ctx.createRadialGradient(x - 0.8, ry - 0.8, 0, x, ry, 3.2);
      g.addColorStop(0, 'rgba(232,230,224,0.75)');
      g.addColorStop(0.55, 'rgba(150,148,142,0.55)');
      g.addColorStop(1, 'rgba(70,66,62,0.5)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, ry, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  rainStreaks(ctx, size, seed + 6, {
    count: 40, colour: '118,66,32', alpha: 0.30, maxWidth: 5,
  });
  blotches(ctx, size, seed + 8, {
    count: 22, radius: size * 0.05, alpha: 0.40,
    colours: ['146,80,34', '112,58,26', '176,172,166'],
  });

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const local = (y % bh) / bh;
    const v = 0.5 + Math.sin(local * Math.PI) * 0.25
      - smoothstep(0.9, 1.0, local) * 0.4;
    for (let x = 0; x < size; x++) height[y * size + x] = v;
  }
  const rough = new Float32Array(size * size).fill(0.55);
  return { albedo: c, height, rough, normalStrength: 2.6, metalness: 0.55 };
}

/**
 * Shipping container flank — deep trapezoidal ribs, top and bottom rails, and
 * the heavy scuffing these things carry.
 */
function paintContainer(size, seed, base = [46, 88, 128]) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 4, cells: 7 });
  const ribs = 11;
  const period = size / ribs;
  const railH = size * 0.085;

  paint(ctx, size, (x, y, i) => {
    const t = (x % period) / period;
    // Trapezoidal profile: flat crown, sloped flanks, flat valley.
    let profile;
    if (t < 0.18) profile = 1;
    else if (t < 0.34) profile = 1 - (t - 0.18) / 0.16 * 2;
    else if (t < 0.66) profile = -1;
    else if (t < 0.82) profile = -1 + (t - 0.66) / 0.16 * 2;
    else profile = 1;
    const flank = (t > 0.18 && t < 0.34) ? 0.30
      : (t > 0.66 && t < 0.82) ? -0.26 : 0;

    let v = 1 + profile * 0.10 + flank;
    v *= 0.9 + grain[i] * 0.2;

    // The end rails are plain plate, not ribbed.
    const inRail = y < railH || y > size - railH;
    if (inRail) v = 0.78 + grain[i] * 0.18;

    return [base[0] * v, base[1] * v, base[2] * v];
  });

  blotches(ctx, size, seed + 5, {
    count: 26, radius: size * 0.05, alpha: 0.45,
    colours: ['128,64,28', '92,46,22', '188,186,182', '40,40,42'],
  });
  rainStreaks(ctx, size, seed + 9, {
    count: 24, colour: '92,50,24', alpha: 0.26, maxWidth: 3,
  });

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const inRail = y < railH || y > size - railH;
    for (let x = 0; x < size; x++) {
      const t = (x % period) / period;
      let h;
      if (t < 0.18) h = 1;
      else if (t < 0.34) h = 1 - (t - 0.18) / 0.16;
      else if (t < 0.66) h = 0;
      else if (t < 0.82) h = (t - 0.66) / 0.16;
      else h = 1;
      height[y * size + x] = inRail ? 0.9 : h;
    }
  }
  const rough = new Float32Array(size * size).fill(0.66);
  return { albedo: c, height, rough, normalStrength: 5.0, metalness: 0.38 };
}

/** Bleached pallet and crate timber, grey-tan with open grain and knots. */
function paintWood(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const planks = 6;
  const pw = size / planks;
  const rand = rng(seed);
  const fine = fbm(size, seed + 3, { octaves: 4, cells: 20 });

  for (let p = 0; p < planks; p++) {
    const base = 148 + rand() * 34;
    ctx.fillStyle = `rgb(${base | 0},${(base * 0.90) | 0},${(base * 0.74) | 0})`;
    ctx.fillRect(p * pw, 0, pw, size);

    // Grain: long wandering lines along the plank.
    for (let g = 0; g < 26; g++) {
      const x = p * pw + rand() * pw;
      const dark = 0.55 + rand() * 0.3;
      ctx.strokeStyle = `rgba(${(base * dark * 0.7) | 0},${(base * dark * 0.58) | 0},${(base * dark * 0.42) | 0},${0.25 + rand() * 0.3})`;
      ctx.lineWidth = 0.4 + rand() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= size; y += 18) {
        ctx.lineTo(x + Math.sin(y * 0.02 + p * 2.1) * 3 + (rand() - 0.5) * 2, y);
      }
      ctx.stroke();
    }
    // A knot or two.
    if (rand() < 0.6) {
      const kx = p * pw + pw * (0.3 + rand() * 0.4);
      const ky = rand() * size;
      for (let r = 7; r > 0; r--) {
        ctx.strokeStyle = `rgba(84,60,38,${0.10 + (7 - r) * 0.05})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 1.6, r * 2.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Gap between planks.
    ctx.fillStyle = 'rgba(38,28,18,0.55)';
    ctx.fillRect(p * pw + pw - 2.5, 0, 2.5, size);
  }

  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0, n = 0; i < img.data.length; i += 4, n++) {
    const v = (fine[n] - 0.5) * 22;
    img.data[i] = clamp255(img.data[i] + v);
    img.data[i + 1] = clamp255(img.data[i + 1] + v);
    img.data[i + 2] = clamp255(img.data[i + 2] + v);
  }
  ctx.putImageData(img, 0, 0);

  blotches(ctx, size, seed + 11, {
    count: 14, radius: size * 0.06, alpha: 0.20,
    colours: ['74,54,32', '176,170,158'],
  });

  const height = luminanceOf(c, size);
  const rough = new Float32Array(size * size).fill(0.95);
  return { albedo: c, height, rough, normalStrength: 1.8 };
}

/** Rusted steel drum: banded, heavily corroded. */
function paintDrum(size, seed, base = [176, 150, 62]) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 5, cells: 8 });
  const rustField = warp(size, fbm(size, seed + 4, { octaves: 4, cells: 4 }),
    fbm(size, seed + 6, { octaves: 3, cells: 8 }), size * 0.08);

  paint(ctx, size, (x, y, i) => {
    let v = 0.9 + (grain[i] - 0.5) * 0.22;
    // Two rolling hoops around the drum.
    const ring = Math.abs(Math.sin(y / size * Math.PI * 3));
    v += smoothstep(0.94, 1.0, ring) * 0.16;
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    const rust = smoothstep(0.55, 0.88, rustField[i]) * 0.8;
    r = lerp(r, 128, rust); g = lerp(g, 60, rust); b = lerp(b, 28, rust);
    return [r, g, b];
  });

  rainStreaks(ctx, size, seed + 7, {
    count: 28, colour: '96,48,20', alpha: 0.34, maxWidth: 4,
  });

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const ring = Math.abs(Math.sin(y / size * Math.PI * 3));
    const v = 0.5 + smoothstep(0.92, 1.0, ring) * 0.5;
    for (let x = 0; x < size; x++) height[y * size + x] = v;
  }
  const rough = new Float32Array(size * size).fill(0.72);
  return { albedo: c, height, rough, normalStrength: 3.2, metalness: 0.4 };
}

/**
 * The yard's hardstanding: worn concrete slabs with expansion joints, patched
 * asphalt repairs and the oil that soaks into both. This is what the ground
 * actually is in the reference set — not sand.
 */
function paintYard(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 6, cells: 5 });
  const grit = cellular(size, seed + 7, Math.round(size / 14));
  const patch = fbm(size, seed + 3, { octaves: 3, cells: 2 });

  paint(ctx, size, (x, y, i) => {
    let v = 96 + grain[i] * 40;
    v += Math.pow(1 - grit[i], 4) * 46;
    // Asphalt repairs are markedly darker than the slab around them.
    v = lerp(v, 46 + grain[i] * 18, smoothstep(0.54, 0.64, patch[i]));
    return [v * 1.0, v * 0.995, v * 0.975];
  });

  // Slab expansion joints on a 4-square grid.
  ctx.save();
  for (let i = 1; i < 4; i++) {
    const p = (size / 4) * i;
    ctx.fillStyle = 'rgba(46,46,46,0.72)';
    ctx.fillRect(p - 2, 0, 3, size);
    ctx.fillRect(0, p - 2, size, 3);
  }
  ctx.restore();

  crackNetwork(ctx, size, seed + 21, {
    trunks: 8, maxDepth: 3, width: 1.8, colour: '30,30,32', alpha: 0.6,
  });
  blotches(ctx, size, seed + 31, {
    count: 12, radius: size * 0.07, alpha: 0.42,
    colours: ['20,20,22', '30,26,22'],
  });
  blotches(ctx, size, seed + 37, {
    count: 10, radius: size * 0.09, alpha: 0.16,
    colours: ['150,146,134', '108,104,96'],
  });

  const height = luminanceOf(c, size);
  const rough = new Float32Array(size * size).fill(0.93);
  return { albedo: c, height, rough, normalStrength: 2.0 };
}

/** Gravel and dirt hardstanding between the buildings. */
function paintGravel(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const stones = cellular(size, seed, Math.round(size / 12));
  const stones2 = cellular(size, seed + 3, Math.round(size / 26));
  const dirt = fbm(size, seed + 5, { octaves: 5, cells: 4 });

  paint(ctx, size, (x, y, i) => {
    let v = 62 + dirt[i] * 34;
    v += Math.pow(1 - stones[i], 3) * 68;
    v += Math.pow(1 - stones2[i], 5) * 44;
    return [v * 1.01, v * 0.99, v * 0.94];
  });
  blotches(ctx, size, seed + 9, {
    count: 18, radius: size * 0.09, alpha: 0.28,
    colours: ['70,64,54', '132,124,106'],
  });

  const height = luminanceOf(c, size);
  const rough = new Float32Array(size * size).fill(0.97);
  return { albedo: c, height, rough, normalStrength: 3.0 };
}

/** Galvanised walkway plate with a diamond tread. */
function paintPlate(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 4, cells: 10 });
  paint(ctx, size, (x, y, i) => {
    const v = 132 + (grain[i] - 0.5) * 46;
    return [v, v * 1.01, v * 1.03];
  });

  const height = new Float32Array(size * size).fill(0.3);
  const pitch = size / 8;
  ctx.save();
  ctx.strokeStyle = 'rgba(212,216,220,0.30)';
  ctx.lineWidth = 5;
  for (let i = -size; i < size * 2; i += pitch) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + size, 0); ctx.lineTo(i, size); ctx.stroke();
  }
  ctx.restore();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = ((x + y) % pitch) / pitch;
      const b = ((x - y + size * 2) % pitch) / pitch;
      const tread = Math.max(smoothstep(0.42, 0.5, a) * smoothstep(0.58, 0.5, a),
        smoothstep(0.42, 0.5, b) * smoothstep(0.58, 0.5, b));
      height[y * size + x] = 0.3 + tread * 0.7;
    }
  }
  blotches(ctx, size, seed + 4, {
    count: 18, radius: size * 0.05, alpha: 0.35,
    colours: ['128,70,32', '70,72,74'],
  });
  const rough = new Float32Array(size * size).fill(0.5);
  return { albedo: c, height, rough, normalStrength: 3.4, metalness: 0.6 };
}

// =========================================================================
// Registry
// =========================================================================

/**
 * Expanded-metal grille — the mesh panels that fill the openings in the
 * reference walls. Painted as an opaque sheet with the diamond pattern cut
 * dark, so it reads as a screen without needing transparency.
 */
function paintMesh(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const grain = fbm(size, seed, { octaves: 4, cells: 12 });

  paint(ctx, size, (x, y, i) => {
    const v = 96 + (grain[i] - 0.5) * 34;
    return [v * 1.02, v, v * 0.94];
  });

  // The diamond lattice: two sets of diagonals, with the strands catching the
  // light on one side and shading on the other.
  const pitch = size / 22;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [dir, light] of [[1, true], [-1, false]]) {
    ctx.strokeStyle = light ? 'rgba(196,198,192,0.62)' : 'rgba(30,28,26,0.70)';
    ctx.lineWidth = pitch * 0.28;
    for (let k = -size; k < size * 2; k += pitch) {
      ctx.beginPath();
      ctx.moveTo(k, dir > 0 ? 0 : size);
      ctx.lineTo(k + size, dir > 0 ? size : 0);
      ctx.stroke();
    }
  }
  ctx.restore();

  rainStreaks(ctx, size, seed + 5, {
    count: 20, colour: '92,54,28', alpha: 0.24, maxWidth: 3,
  });
  blotches(ctx, size, seed + 9, {
    count: 12, radius: size * 0.05, alpha: 0.26,
    colours: ['128,66,32', '96,48,22'],
  });

  const height = luminanceOf(c, size);
  const rough = new Float32Array(size * size).fill(0.58);
  return { albedo: c, height, rough, normalStrength: 2.6, metalness: 0.55 };
}

const PAINTERS = {
  asphalt:  (s) => paintAsphalt(s, 307),
  gravel:   (s) => paintGravel(s, 401),
  yard:     (s) => paintYard(s, 431),
  concrete: (s) => paintConcrete(s, 101, { panelRows: 2 }),
  wall:     (s) => paintConcrete(s, 211, { panelRows: 3, tint: 0.97 }),
  kerb:     (s) => paintConcrete(s, 233, { panelRows: 1, tint: 1.06 }),
  block:    (s) => paintBlock(s, 509),
  brick:    (s) => paintBlock(s, 517),
  roof:         (s) => paintRoof(s, 601, [146, 120, 126]),
  roofRed:      (s) => paintRoof(s, 613, [140, 84, 70]),
  roofBlue:     (s) => paintRoof(s, 617, [150, 160, 164]),
  tank:     (s) => paintTank(s, 701),
  wood:     (s) => paintWood(s, 809),
  plate:    (s) => paintPlate(s, 907),
  // Colours read straight off the reference walls: a strong red-orange, a
  // faded mint, an off-white and a cold blue-grey, all on the same steel.
  sidingGrey: (s) => paintCorrugated(s, 1201, { base: [188, 200, 206], rust: 0.45, wear: 0.45 }),
  sidingBlue: (s) => paintCorrugated(s, 1103, { base: [176, 208, 202], rust: 0.42, wear: 0.5 }),
  sidingRed:  (s) => paintCorrugated(s, 1009, { base: [196, 80, 50], rust: 0.80, wear: 0.62 }),
  sidingWhite:(s) => paintCorrugated(s, 1307, { base: [228, 228, 220], rust: 0.34, wear: 0.42 }),
  mesh:       (s) => paintMesh(s, 1601),
  containerBlue:  (s) => paintContainer(s, 1303, [46, 88, 128]),
  containerRust:  (s) => paintContainer(s, 1409, [132, 66, 44]),
  containerGreen: (s) => paintContainer(s, 1511, [58, 92, 72]),
  drum:      (s) => paintDrum(s, 1601, [166, 148, 76]),
  drumBlue:  (s) => paintDrum(s, 1607, [46, 84, 152]),
};

function finish(canvas, { repeat = [1, 1], aniso = 4, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Paints (or reuses) a named surface and returns its three maps. */
export function surface(name, { size = 512, repeat = [1, 1], aniso = 4 } = {}) {
  const key = `${name}:${size}`;
  let entry = cache.get(key);
  if (!entry) {
    const painter = PAINTERS[name] || PAINTERS.concrete;
    const built = painter(size);
    entry = {
      albedo: built.albedo,
      normal: normalFromHeight(built.height, size, built.normalStrength ?? 2.5),
      rough: mapFromField(built.rough, size),
      metalness: built.metalness ?? 0.03,
    };
    cache.set(key, entry);
  }
  return {
    map: finish(entry.albedo, { repeat, aniso }),
    normalMap: finish(entry.normal, { repeat, aniso, srgb: false }),
    roughnessMap: finish(entry.rough, { repeat, aniso, srgb: false }),
    metalness: entry.metalness,
  };
}

/** Builds a standard material for a named surface. */
export function material(name, opts = {}) {
  const {
    repeat = [1, 1], aniso = 4, color = 0xffffff, normalScale = 1.0,
    size = 512, roughness, metalness, ...rest
  } = opts;
  const s = surface(name, { size, repeat, aniso });
  const mat = new THREE.MeshStandardMaterial({
    map: s.map,
    normalMap: s.normalMap,
    roughnessMap: s.roughnessMap,
    roughness: roughness ?? 1.0,
    metalness: metalness ?? s.metalness,
    color,
    ...rest,
  });
  mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  return mat;
}

/**
 * A two-script signboard: Pashto above, Latin below, on a weathered steel
 * plate. Boards are how a newcomer learns the callouts, so they stay legible
 * from the far side of the yard.
 */
export function signTexture(pashto, latin, accent = '#c8562f') {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = ctx2d(c);

  ctx.fillStyle = '#e6e2da';
  ctx.fillRect(0, 0, w, h);
  const nz = fbm(256, 55, { octaves: 5, cells: 4 });
  const tmp = makeCanvas(256);
  const tctx = ctx2d(tmp);
  const img = tctx.createImageData(256, 256);
  for (let i = 0, n = 0; i < img.data.length; i += 4, n++) {
    const v = clamp255(214 + (nz[n] - 0.5) * 96);
    img.data[i] = v; img.data[i + 1] = v - 4; img.data[i + 2] = v - 12;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(tmp, 0, 0, w, h);
  ctx.globalAlpha = 1;

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 26);
  ctx.fillRect(0, h - 26, w, 26);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1b1f24';
  ctx.font = '700 150px system-ui, "Noto Sans Arabic", sans-serif';
  ctx.direction = 'rtl';
  ctx.fillText(pashto, w / 2, 210);

  ctx.direction = 'ltr';
  ctx.fillStyle = accent;
  ctx.font = '800 92px system-ui, "Arial Black", sans-serif';
  ctx.fillText(latin, w / 2, 340);

  ctx.strokeStyle = 'rgba(30,34,38,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 40, w - 36, h - 80);

  blotches(ctx, w, 77, { count: 22, radius: 60, alpha: 0.30,
    colours: ['120,70,34', '90,88,80'] });
  rainStreaks(ctx, w, 91, { count: 18, colour: '80,70,56', alpha: 0.22 });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Soft radial sprite for muzzle flash, smoke and blood. */
export function puffTexture(inner = '255,240,200', outer = '255,140,40') {
  const size = 128;
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${inner},1)`);
  g.addColorStop(0.35, `rgba(${outer},0.72)`);
  g.addColorStop(1, `rgba(${outer},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Bullet-hole decal. */
export function holeTexture() {
  const size = 64;
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(8,8,8,0.96)');
  g.addColorStop(0.30, 'rgba(38,36,34,0.62)');
  g.addColorStop(1, 'rgba(60,58,54,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
  // A few radial chips so it does not read as a soft dot.
  const rand = rng(3);
  ctx.strokeStyle = 'rgba(24,22,20,0.55)';
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    ctx.lineWidth = 0.6 + rand();
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(a) * (8 + rand() * 14), 32 + Math.sin(a) * (8 + rand() * 14));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Overcast sky, matching the cold blue of the reference renders. */
export function skyTexture() {
  const c = makeCanvas(512);
  const ctx = ctx2d(c);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#1f5c93');
  g.addColorStop(0.34, '#4f88b4');
  g.addColorStop(0.55, '#9fbcd0');
  g.addColorStop(0.70, '#cfd8dc');
  g.addColorStop(1.00, '#e4ded2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const rand = rng(19);
  for (let i = 0; i < 34; i++) {
    const y = rand() * 300;
    const h = 5 + rand() * 26;
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.13})`;
    ctx.beginPath();
    ctx.ellipse(rand() * 512, y, 60 + rand() * 220, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
