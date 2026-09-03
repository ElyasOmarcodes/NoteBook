/**
 * Noise and pattern primitives for the texture painter.
 *
 * Everything is deterministic: the same seed always paints the same surface,
 * so a texture looks identical on every device in a match.
 */

/** Small, fast, seedable PRNG. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Tiling value noise on a `cells`x`cells` lattice. */
export function valueNoise(size, cells, rand, cellsY = cells) {
  const grid = new Float32Array(cells * cellsY);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(size * size);
  const stepX = size / cells, stepY = size / cellsY;
  const at = (x, y) => grid[((y % cellsY) + cellsY) % cellsY * cells
    + (((x % cells) + cells) % cells)];
  for (let y = 0; y < size; y++) {
    const gy = y / stepY, y0 = Math.floor(gy), fy = smooth(gy - y0);
    for (let x = 0; x < size; x++) {
      const gx = x / stepX, x0 = Math.floor(gx), fx = smooth(gx - x0);
      const a = at(x0, y0), b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      out[y * size + x] = (a + (b - a) * fx)
        + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    }
  }
  return out;
}

/**
 * Fractal sum of value noise. Seamless because every octave tiles.
 *
 * `aspect` stretches the pattern vertically — 3 gives features three times
 * taller than they are wide. Weathering on a vertical surface runs downhill,
 * so round blobs read as paint spatter where streaks read as corrosion. The
 * stretch is done by using fewer grid rows than columns rather than by
 * resampling, which is what keeps the result tiling.
 */
export function fbm(size, seed,
  { octaves = 5, cells = 4, gain = 0.5, aspect = 1 } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, c = cells;
  for (let o = 0; o < octaves && c <= size; o++) {
    const layer = valueNoise(size, c, rand, Math.max(1, Math.round(c / aspect)));
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= gain;
    c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/**
 * Tiling cellular (Worley) noise — the distance to the nearest feature point.
 *
 * This is what makes asphalt aggregate and concrete gravel read as stones
 * rather than as generic fuzz.
 */
export function cellular(size, seed, cells = 16) {
  const rand = rng(seed);
  const px = new Float32Array(cells * cells);
  const py = new Float32Array(cells * cells);
  for (let i = 0; i < px.length; i++) { px[i] = rand(); py[i] = rand(); }
  const out = new Float32Array(size * size);
  const step = size / cells;
  let max = 0;
  for (let y = 0; y < size; y++) {
    const cy = Math.floor(y / step);
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / step);
      let best = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = ((cx + ox) % cells + cells) % cells;
          const gy = ((cy + oy) % cells + cells) % cells;
          const i = gy * cells + gx;
          const fx = (cx + ox + px[i]) * step;
          const fy = (cy + oy + py[i]) * step;
          const d = (fx - x) * (fx - x) + (fy - y) * (fy - y);
          if (d < best) best = d;
        }
      }
      const d = Math.sqrt(best);
      out[y * size + x] = d;
      if (d > max) max = d;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= max || 1;
  return out;
}

/** Warps sample coordinates by a noise field — turns bands into organic marks. */
export function warp(size, field, warpField, amount) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const w = warpField[y * size + x] - 0.5;
      const sx = Math.round(x + w * amount + size) % size;
      const sy = Math.round(y + w * amount * 0.7 + size) % size;
      out[y * size + x] = field[sy * size + sx];
    }
  }
  return out;
}

export const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Draws a branching crack network, the way weathered asphalt actually fails.
 * Returns nothing; it paints straight onto the 2D context.
 */
export function crackNetwork(ctx, size, seed, {
  trunks = 7, maxDepth = 3, width = 1.6, colour = '18,18,20', alpha = 0.75,
} = {}) {
  const rand = rng(seed);
  ctx.save();
  ctx.lineCap = 'round';

  const branch = (x, y, angle, len, depth, w) => {
    if (depth > maxDepth || len < 6) return;
    let cx = x, cy = y, a = angle;
    const steps = Math.max(3, Math.round(len / 9));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.7;
      cx += Math.cos(a) * (len / steps);
      cy += Math.sin(a) * (len / steps);
      ctx.lineTo(cx, cy);
    }
    ctx.strokeStyle = `rgba(${colour},${alpha * (1 - depth * 0.22)})`;
    ctx.lineWidth = w;
    ctx.stroke();
    // A hairline highlight on one side reads as a chipped edge.
    ctx.strokeStyle = `rgba(190,188,182,${0.10 * (1 - depth * 0.3)})`;
    ctx.lineWidth = w * 0.6;
    ctx.stroke();

    const kids = depth === 0 ? 2 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 2);
    for (let k = 0; k < kids; k++) {
      branch(cx, cy, a + (rand() - 0.5) * 1.9, len * (0.45 + rand() * 0.3),
        depth + 1, Math.max(0.4, w * 0.62));
    }
  };

  for (let i = 0; i < trunks; i++) {
    branch(rand() * size, rand() * size, rand() * Math.PI * 2,
      size * (0.18 + rand() * 0.28), 0, width);
  }
  ctx.restore();
}

/** Vertical rain-wash streaks, the dominant weathering on every wall here. */
export function rainStreaks(ctx, size, seed, {
  count = 40, colour = '58,56,50', alpha = 0.3, fromTop = true, maxWidth = 6,
} = {}) {
  const rand = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const w = 1 + rand() * maxWidth;
    const top = fromTop ? rand() * size * 0.25 : rand() * size;
    const h = size * (0.25 + rand() * 0.75);
    const g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, `rgba(${colour},${alpha * (0.5 + rand() * 0.5)})`);
    g.addColorStop(0.7, `rgba(${colour},${alpha * 0.35})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, top, w, h);
  }
  ctx.restore();
}

/** Soft irregular stains — rust blooms, oil, damp. */
export function blotches(ctx, size, seed, {
  count = 22, radius = 40, colours = ['120,66,30'], alpha = 0.4,
} = {}) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = rand() * size, y = rand() * size;
    const r = radius * (0.3 + rand() * 1.6);
    const c = colours[(rand() * colours.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c},${alpha * (0.6 + rand() * 0.4)})`);
    g.addColorStop(0.45, `rgba(${c},${alpha * 0.45})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    // Wrap around the edges so the stain tiles.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.moveTo(x + dx + r, y + dy);
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
}
