import * as THREE from '../../vendor/three.module.js';

// Every surface in the arena is painted at runtime onto a 2D canvas. That keeps
// the APK small (no texture files to ship) while still giving the weathered,
// photo-ish look of the reference screenshots: value noise for grain, streaks
// for rain-wash, blotches for rust, and a matching normal map derived from the
// albedo's luminance so the light actually catches the surface relief.

const cache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/** getImageData is called on every texture canvas, so opt into the fast path. */
function ctx2d(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

// --- deterministic value noise -------------------------------------------
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(size, cells, rnd) {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const out = new Float32Array(size * size);
  const step = size / cells;
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const gy = y / step, y0 = Math.floor(gy), fy = smooth(gy - y0);
    for (let x = 0; x < size; x++) {
      const gx = x / step, x0 = Math.floor(gx), fx = smooth(gx - x0);
      const i00 = y0 * (cells + 1) + x0;
      const a = grid[i00], b = grid[i00 + 1];
      const c = grid[i00 + cells + 1], d = grid[i00 + cells + 2];
      const top = a + (b - a) * fx;
      const bot = c + (d - c) * fx;
      out[y * size + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

function fbm(size, seed, octaves = 5, baseCells = 4) {
  const rnd = mulberry(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(size, cells, rnd);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
    cells *= 2;
    if (cells > size) break;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function tint(ctx, size, noise, base, contrast) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    const v = (noise[n] - 0.5) * contrast;
    d[i] = clamp255(base[0] + v * 255);
    d[i + 1] = clamp255(base[1] + v * 255);
    d[i + 2] = clamp255(base[2] + v * 255);
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

/** Rain streaks running down a vertical surface. */
function streaks(ctx, size, seed, count, alpha, colour) {
  const rnd = mulberry(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const w = 1 + rnd() * 5;
    const top = rnd() * size * 0.4;
    const h = size * (0.25 + rnd() * 0.7);
    const g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, `rgba(${colour}, ${alpha * (0.4 + rnd() * 0.6)})`);
    g.addColorStop(1, `rgba(${colour}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, top, w, h);
  }
  ctx.restore();
}

/** Irregular rust / grime blotches. */
function blotches(ctx, size, seed, count, radius, colours) {
  const rnd = mulberry(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * size, y = rnd() * size;
    const r = radius * (0.35 + rnd() * 1.4);
    const c = colours[(rnd() * colours.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c}, ${0.30 + rnd() * 0.42})`);
    g.addColorStop(0.55, `rgba(${c}, ${0.12 + rnd() * 0.18})`);
    g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Derive a tangent-space normal map from the albedo's luminance. */
function normalFromCanvas(src, strength = 2.2) {
  const size = src.width;
  const sctx = ctx2d(src);
  const s = sctx.getImageData(0, 0, size, size).data;
  const dst = makeCanvas(size);
  const dctx = ctx2d(dst);
  const out = dctx.createImageData(size, size);
  const d = out.data;
  const lum = (i) => (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const xl = (y * size + ((x - 1 + size) % size)) * 4;
      const xr = (y * size + ((x + 1) % size)) * 4;
      const yt = (((y - 1 + size) % size) * size + x) * 4;
      const yb = (((y + 1) % size) * size + x) * 4;
      const dx = (lum(xl) - lum(xr)) * strength;
      const dy = (lum(yt) - lum(yb)) * strength;
      const len = Math.hypot(dx, dy, 1);
      d[i] = clamp255(((dx / len) * 0.5 + 0.5) * 255);
      d[i + 1] = clamp255(((dy / len) * 0.5 + 0.5) * 255);
      d[i + 2] = clamp255(((1 / len) * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  dctx.putImageData(out, 0, 0);
  return dst;
}

function finish(canvas, { repeat = [1, 1], aniso = 4, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// =========================================================================
// Painters
// =========================================================================

function paintConcrete(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 6, 3), [150, 150, 145], 0.55);
  // aggregate speckle
  const rnd = mulberry(seed + 7);
  for (let i = 0; i < size * 3; i++) {
    const x = rnd() * size, y = rnd() * size, r = rnd() * 1.8 + 0.3;
    ctx.fillStyle = `rgba(${90 + rnd() * 70 | 0},${90 + rnd() * 70 | 0},${88 + rnd() * 60 | 0},${0.10 + rnd() * 0.28})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // form-work seams
  ctx.strokeStyle = 'rgba(70,72,70,0.35)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (size / 4) * i);
    ctx.lineTo(size, (size / 4) * i + (mulberry(seed + i)() - 0.5) * 6);
    ctx.stroke();
  }
  streaks(ctx, size, seed + 21, 34, 0.30, '58,58,54');
  blotches(ctx, size, seed + 31, 16, size * 0.10, ['92,84,70', '70,74,70', '120,116,104']);
  return c;
}

function paintCorrugated(size, seed, hue) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 5, 5), hue, 0.30);
  // vertical ribs
  const ribs = 22;
  const w = size / ribs;
  for (let i = 0; i < ribs; i++) {
    const x = i * w;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0.0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.14)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.05)');
    g.addColorStop(1.0, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, size);
  }
  blotches(ctx, size, seed + 5, 40, size * 0.09,
    ['142,68,26', '104,48,20', '166,96,40', '80,44,22']);
  streaks(ctx, size, seed + 9, 48, 0.42, '96,52,24');
  // fastener rows
  const rnd = mulberry(seed + 3);
  ctx.fillStyle = 'rgba(40,36,32,0.55)';
  for (let row = 0; row < 5; row++) {
    const y = (size / 5) * row + 8;
    for (let i = 0; i < ribs; i += 2) {
      ctx.beginPath();
      ctx.arc(i * w + w * 0.5, y + rnd() * 2, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

function paintAsphalt(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 6, 6), [58, 60, 62], 0.42);
  const rnd = mulberry(seed + 11);
  for (let i = 0; i < size * 6; i++) {
    const x = rnd() * size, y = rnd() * size, r = rnd() * 1.4 + 0.25;
    const v = 40 + rnd() * 110 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v - 4},${0.14 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // cracks
  ctx.strokeStyle = 'rgba(24,24,26,0.55)';
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = 0.6 + rnd() * 1.6;
    ctx.beginPath();
    let x = rnd() * size, y = rnd() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) {
      x += (rnd() - 0.5) * 40;
      y += (rnd() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  blotches(ctx, size, seed + 17, 22, size * 0.14, ['30,30,32', '86,84,80', '52,46,38']);
  return c;
}

function paintBrick(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  ctx.fillStyle = '#8d8378';
  ctx.fillRect(0, 0, size, size);
  const rows = 16, rowH = size / rows;
  const rnd = mulberry(seed);
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (size / 16);
    for (let i = -1; i < 8; i++) {
      const x = offset + i * (size / 8) + 2;
      const y = r * rowH + 2;
      const w = size / 8 - 4, h = rowH - 4;
      const base = 128 + rnd() * 46;
      ctx.fillStyle = `rgb(${base | 0},${(base * 0.93) | 0},${(base * 0.85) | 0})`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
      ctx.fillRect(x, y + h - 2, w, 2);
    }
  }
  const nz = fbm(size, seed + 3, 5, 4);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0, n = 0; i < img.data.length; i += 4, n++) {
    const v = (nz[n] - 0.5) * 70;
    img.data[i] = clamp255(img.data[i] + v);
    img.data[i + 1] = clamp255(img.data[i + 1] + v);
    img.data[i + 2] = clamp255(img.data[i + 2] + v);
  }
  ctx.putImageData(img, 0, 0);
  streaks(ctx, size, seed + 13, 26, 0.30, '62,58,50');
  return c;
}

function paintRoof(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 5, 5), [134, 122, 120], 0.34);
  // shingle rows in the dusty-rose of the reference renders
  const rows = 12, rowH = size / rows;
  const rnd = mulberry(seed + 2);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 10; i++) {
      const x = i * (size / 10) + (r % 2) * (size / 20);
      const v = rnd();
      ctx.fillStyle = `rgba(${(150 + v * 40) | 0},${(120 + v * 30) | 0},${(120 + v * 32) | 0},0.55)`;
      ctx.fillRect(x, r * rowH, size / 10 - 1.5, rowH - 1.5);
    }
    ctx.fillStyle = 'rgba(40,34,34,0.30)';
    ctx.fillRect(0, r * rowH + rowH - 2, size, 2);
  }
  blotches(ctx, size, seed + 6, 26, size * 0.10, ['92,74,72', '164,150,146', '120,86,66']);
  return c;
}

function paintTankSteel(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 5, 4), [186, 188, 188], 0.24);
  // horizontal plate seams with riveted edges
  const bands = 6, bh = size / bands;
  const rnd = mulberry(seed + 4);
  for (let b = 0; b < bands; b++) {
    const y = b * bh;
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, size, bh);
    ctx.fillStyle = 'rgba(60,58,56,0.5)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * (size / 40), y + 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  blotches(ctx, size, seed + 8, 20, size * 0.08, ['138,74,34', '96,58,30', '150,152,148']);
  streaks(ctx, size, seed + 12, 30, 0.28, '110,66,34');
  void rnd;
  return c;
}

function paintContainer(size, seed, rgb) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 4, 6), rgb, 0.22);
  const ribs = 16, w = size / ribs;
  for (let i = 0; i < ribs; i++) {
    const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.30)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(i * w, 0, w, size);
  }
  ctx.fillStyle = 'rgba(20,22,24,0.35)';
  ctx.fillRect(0, 0, size, size * 0.05);
  ctx.fillRect(0, size * 0.95, size, size * 0.05);
  blotches(ctx, size, seed + 6, 26, size * 0.07, ['128,64,28', '92,46,22', '176,176,172']);
  return c;
}

function paintWood(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  const planks = 7, pw = size / planks;
  const rnd = mulberry(seed);
  for (let p = 0; p < planks; p++) {
    const base = 120 + rnd() * 40;
    ctx.fillStyle = `rgb(${base | 0},${(base * 0.76) | 0},${(base * 0.50) | 0})`;
    ctx.fillRect(p * pw, 0, pw, size);
    // grain
    ctx.strokeStyle = `rgba(${(base * 0.55) | 0},${(base * 0.40) | 0},${(base * 0.26) | 0},0.45)`;
    for (let g = 0; g < 20; g++) {
      ctx.lineWidth = 0.4 + rnd() * 1.2;
      ctx.beginPath();
      const x = p * pw + rnd() * pw;
      ctx.moveTo(x, 0);
      for (let y = 0; y <= size; y += 24) {
        ctx.lineTo(x + Math.sin(y * 0.03 + p) * 2.5 + (rnd() - 0.5) * 2, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,20,12,0.45)';
    ctx.fillRect(p * pw + pw - 2, 0, 2, size);
  }
  blotches(ctx, size, seed + 3, 12, size * 0.08, ['74,50,28', '150,120,80']);
  return c;
}

function paintMetalPlate(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 5, 8), [110, 114, 118], 0.30);
  // diamond tread
  ctx.strokeStyle = 'rgba(200,204,208,0.22)';
  ctx.lineWidth = 3;
  for (let i = -size; i < size * 2; i += 22) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + size, 0); ctx.lineTo(i, size); ctx.stroke();
  }
  blotches(ctx, size, seed + 4, 18, size * 0.07, ['128,70,32', '70,72,74']);
  return c;
}

function paintGravel(size, seed) {
  const c = makeCanvas(size);
  const ctx = ctx2d(c);
  tint(ctx, size, fbm(size, seed, 6, 8), [104, 100, 92], 0.5);
  const rnd = mulberry(seed + 2);
  for (let i = 0; i < size * 10; i++) {
    const x = rnd() * size, y = rnd() * size, r = 0.6 + rnd() * 2.4;
    const v = 70 + rnd() * 120 | 0;
    ctx.fillStyle = `rgba(${v},${(v * 0.96) | 0},${(v * 0.86) | 0},${0.25 + rnd() * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

const PAINTERS = {
  concrete:   (s) => paintConcrete(s, 101),
  wall:       (s) => paintConcrete(s, 211),
  asphalt:    (s) => paintAsphalt(s, 307),
  gravel:     (s) => paintGravel(s, 401),
  brick:      (s) => paintBrick(s, 509),
  roof:       (s) => paintRoof(s, 601),
  tank:       (s) => paintTankSteel(s, 701),
  wood:       (s) => paintWood(s, 809),
  plate:      (s) => paintMetalPlate(s, 907),
  sidingRed:  (s) => paintCorrugated(s, 1009, [128, 74, 62]),
  sidingBlue: (s) => paintCorrugated(s, 1103, [118, 132, 140]),
  sidingGrey: (s) => paintCorrugated(s, 1201, [138, 140, 138]),
  containerBlue:  (s) => paintContainer(s, 1303, [58, 96, 132]),
  containerRust:  (s) => paintContainer(s, 1409, [128, 72, 44]),
  containerGreen: (s) => paintContainer(s, 1511, [70, 96, 74]),
};

/**
 * Returns `{ map, normalMap }` for a named surface, cached per name+size.
 */
export function surface(name, { size = 256, repeat = [1, 1], aniso = 4, normals = true } = {}) {
  const key = `${name}:${size}`;
  let entry = cache.get(key);
  if (!entry) {
    const painter = PAINTERS[name] || PAINTERS.concrete;
    const albedo = painter(size);
    entry = { albedo, normal: normals ? normalFromCanvas(albedo) : null };
    cache.set(key, entry);
  }
  const map = finish(entry.albedo, { repeat, aniso });
  const normalMap = entry.normal
    ? finish(entry.normal, { repeat, aniso, srgb: false })
    : null;
  return { map, normalMap };
}

/**
 * Builds a standard material for a named surface.
 */
export function material(name, opts = {}) {
  const {
    repeat = [1, 1], aniso = 4, roughness = 0.92, metalness = 0.05,
    color = 0xffffff, normalScale = 0.8, size = 256, ...rest
  } = opts;
  const { map, normalMap } = surface(name, { size, repeat, aniso });
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap, roughness, metalness, color, ...rest,
  });
  if (normalMap) mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  return mat;
}

/**
 * Paints a two-script signboard: Pashto above, Latin below, on weathered steel.
 * Boards are what let a new player learn the callouts, so they are readable
 * from a long way off — big glyphs, high contrast, a stencil-style plate.
 */
export function signTexture(pashto, latin, accent = '#c8562f') {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = ctx2d(c);

  // plate
  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(0, 0, w, h);
  const nz = fbm(256, 55, 5, 4);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = 256;
  const tctx = ctx2d(tmp);
  const img = tctx.createImageData(256, 256);
  for (let i = 0, n = 0; i < img.data.length; i += 4, n++) {
    const v = clamp255(215 + (nz[n] - 0.5) * 110);
    img.data[i] = v; img.data[i + 1] = v - 4; img.data[i + 2] = v - 12;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(tmp, 0, 0, w, h);
  ctx.globalAlpha = 1;

  // accent bands
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 26);
  ctx.fillRect(0, h - 26, w, 26);

  // text
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

  // weathering on top of the paint
  blotches(ctx, w, 77, 26, 60, ['120,70,34', '90,88,80']);
  streaks(ctx, w, 91, 22, 0.22, '80,70,56');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A soft radial sprite used for muzzle flash, smoke and blood puffs. */
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
  g.addColorStop(0, 'rgba(10,10,10,0.95)');
  g.addColorStop(0.35, 'rgba(40,38,36,0.55)');
  g.addColorStop(1, 'rgba(60,58,54,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sky gradient matching the cold overcast of the reference shots. */
export function skyTexture() {
  const c = makeCanvas(512);
  const ctx = ctx2d(c);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#2d6ea8');
  g.addColorStop(0.42, '#7ea9c9');
  g.addColorStop(0.62, '#cfd8dc');
  g.addColorStop(1.00, '#e8e2d6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // thin cloud bands
  const rnd = mulberry(19);
  for (let i = 0; i < 30; i++) {
    const y = rnd() * 260;
    const h = 6 + rnd() * 26;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * 512, y, 60 + rnd() * 200, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
