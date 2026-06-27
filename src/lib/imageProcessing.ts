/* Client-side image pipeline: stylized "illustration cut-out" + 5-colour
 * palette extraction + composite (artwork above, palette band below).
 * Everything runs on a <canvas>; no network or ML model required. */

export const PALETTE_SIZE = 5;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.114 * b;
}

/* ---------- Palette extraction (median cut) ---------- */

function medianCut(pixels: number[][], depth: number): number[][] {
  if (depth === 0 || pixels.length === 0) {
    if (pixels.length === 0) return [[235, 235, 232]];
    const sum = pixels.reduce(
      (a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]],
      [0, 0, 0]
    );
    const n = pixels.length;
    return [[Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)]];
  }

  // Find the channel with the greatest range.
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const [r, g, b] of pixels) {
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    gMin = Math.min(gMin, g); gMax = Math.max(gMax, g);
    bMin = Math.min(bMin, b); bMax = Math.max(bMax, b);
  }
  const rRange = rMax - rMin, gRange = gMax - gMin, bRange = bMax - bMin;
  const channel = rRange >= gRange && rRange >= bRange ? 0 : gRange >= bRange ? 1 : 2;

  pixels.sort((a, b) => a[channel] - b[channel]);
  const mid = pixels.length >> 1;
  return [
    ...medianCut(pixels.slice(0, mid), depth - 1),
    ...medianCut(pixels.slice(mid), depth - 1),
  ];
}

export function extractPalette(
  source: HTMLCanvasElement | HTMLImageElement,
  count = PALETTE_SIZE
): string[] {
  // Downsample to keep the median cut cheap.
  const sample = document.createElement("canvas");
  const sw = 96;
  const ratio =
    source instanceof HTMLImageElement
      ? source.naturalHeight / source.naturalWidth
      : source.height / source.width;
  sample.width = sw;
  sample.height = Math.max(1, Math.round(sw * ratio));
  const sctx = sample.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(source, 0, 0, sample.width, sample.height);
  const { data } = sctx.getImageData(0, 0, sample.width, sample.height);

  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; // skip transparent
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  const depth = Math.ceil(Math.log2(count));
  let colors = medianCut(pixels, depth);

  // medianCut yields 2^depth buckets; trim to `count`, preferring spread.
  colors = dedupeAndPick(colors, count);
  // Order by population-ish proxy: darkest-to-lightest reads well as a band.
  colors.sort((a, b) => luminance(b[0], b[1], b[2]) - luminance(a[0], a[1], a[2]));
  return colors.map(([r, g, b]) => rgbToHex(r, g, b));
}

function dedupeAndPick(colors: number[][], count: number): number[][] {
  const seen = new Set<string>();
  const unique: number[][] = [];
  for (const c of colors) {
    const key = `${c[0] >> 3}-${c[1] >> 3}-${c[2] >> 3}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  while (unique.length < count) {
    // Pad by nudging the last colour so the band always has `count` chips.
    const last = unique[unique.length - 1] ?? [200, 200, 198];
    unique.push([
      Math.min(255, last[0] + 12),
      Math.min(255, last[1] + 12),
      Math.min(255, last[2] + 12),
    ]);
  }
  if (unique.length <= count) return unique;
  // Evenly sample down to `count`.
  const step = unique.length / count;
  const picked: number[][] = [];
  for (let i = 0; i < count; i++) picked.push(unique[Math.floor(i * step)]);
  return picked;
}

/* ---------- Stylization (illustration cut-out feel) ---------- */

export interface StylizeOptions {
  /** 0..1 — how flat / poster-like the result is. */
  strength: number;
  /** Slight saturation lift so the artwork pops against neutral paper. */
  saturation: number;
}

const MAX_EDGE = 1280;

export function stylize(
  img: HTMLImageElement,
  opts: StylizeOptions
): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);

  // 1. Strong edge-preserving smoothing — collapses shading into broad, flat
  //    fields (the "thick paint" base) while keeping outlines.
  const passes = 2 + Math.round(opts.strength * 2); // 2..4
  for (let p = 0; p < passes; p++) bilateral(image, w, h, 2, 38);

  // 2. Saturation lift before colours are clustered.
  if (opts.saturation !== 1) applySaturation(image, opts.saturation);

  // 3. Outlines from the smoothed image.
  const edges = sobelEdges(image, w, h);

  // 4. Cluster the image's own colours and snap each pixel to the nearest —
  //    flat cel fields that follow the picture. A generous palette keeps vivid
  //    hues alive; the palette is re-saturated so clustering doesn't dull it.
  const depth = Math.max(4, Math.min(6, 6 - Math.round(opts.strength * 2))); // 64..16
  const palette = saturatePalette(buildPalette(image, w, h, depth), 1.18);
  mapToPalette(image, palette);

  // 5. Soften the boundaries between flat fields so they read as broad brush
  //    strokes rather than hard steps or dither dots.
  softBlur(image, w, h);

  // 6. Lay crisp ink back over the strong edges.
  inkEdges(image, edges, opts.strength);

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Approximate bilateral filter: average neighbours weighted by colour
 *  similarity, so flat areas smooth out but edges are preserved. */
function bilateral(
  image: ImageData,
  w: number,
  h: number,
  radius: number,
  sigmaColor: number
) {
  const { data } = image;
  const src = new Uint8ClampedArray(data);
  const inv = 1 / (2 * sigmaColor * sigmaColor);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = (y * w + x) * 4;
      const cr = src[ci], cg = src[ci + 1], cb = src[ci + 2];
      let rs = 0, gs = 0, bs = 0, ws = 0;
      const y0 = Math.max(0, y - radius), y1 = Math.min(h - 1, y + radius);
      const x0 = Math.max(0, x - radius), x1 = Math.min(w - 1, x + radius);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const i = (yy * w + xx) * 4;
          const dr = src[i] - cr, dg = src[i + 1] - cg, db = src[i + 2] - cb;
          const wgt = Math.exp(-(dr * dr + dg * dg + db * db) * inv);
          rs += src[i] * wgt; gs += src[i + 1] * wgt; bs += src[i + 2] * wgt; ws += wgt;
        }
      }
      data[ci] = rs / ws; data[ci + 1] = gs / ws; data[ci + 2] = bs / ws;
    }
  }
}

function applySaturation(image: ImageData, saturation: number) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2]);
    data[i] = clamp(l + (data[i] - l) * saturation);
    data[i + 1] = clamp(l + (data[i + 1] - l) * saturation);
    data[i + 2] = clamp(l + (data[i + 2] - l) * saturation);
  }
}

function buildPalette(
  image: ImageData,
  w: number,
  h: number,
  depth: number
): number[][] {
  const { data } = image;
  const pixels: number[][] = [];
  // Sample a subset for speed.
  const stepX = Math.max(1, Math.floor(w / 120));
  const stepY = Math.max(1, Math.floor(h / 120));
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 125) continue;
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return medianCut(pixels, depth);
}

/** Push palette colours away from their luminance (chroma boost) so that
 *  clustering averages don't read as muddy. */
function saturatePalette(palette: number[][], f: number): number[][] {
  return palette.map(([r, g, b]) => {
    const l = luminance(r, g, b);
    return [
      clamp(l + (r - l) * f),
      clamp(l + (g - l) * f),
      clamp(l + (b - l) * f),
    ];
  });
}

function mapToPalette(image: ImageData, palette: number[][]) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let best = palette[0], bestD = Infinity;
    for (let k = 0; k < palette.length; k++) {
      const c = palette[k];
      const dr = r - c[0], dg = g - c[1], db = b - c[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = c; }
    }
    data[i] = best[0]; data[i + 1] = best[1]; data[i + 2] = best[2];
  }
}

/** Light 3x3 box blur: softens the seams between flat fields into broad,
 *  brush-like transitions (no dither, no hard steps). */
function softBlur(image: ImageData, w: number, h: number) {
  const { data } = image;
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 4;
          rs += src[i]; gs += src[i + 1]; bs += src[i + 2]; cnt++;
        }
      }
      const i = (y * w + x) * 4;
      data[i] = rs / cnt; data[i + 1] = gs / cnt; data[i + 2] = bs / cnt;
    }
  }
}

function inkEdges(image: ImageData, edges: Float32Array, strength: number) {
  const { data } = image;
  const threshold = 120;
  const maxDarken = 0.3 + strength * 0.2; // 0.3..0.5
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const e = edges[p];
    if (e > threshold) {
      const k = Math.min(maxDarken, (e - threshold) / 380);
      data[i] *= 1 - k; data[i + 1] *= 1 - k; data[i + 2] *= 1 - k;
    }
  }
}

function sobelEdges(image: ImageData, w: number, h: number): Float32Array {
  const { data } = image;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = luminance(data[i], data[i + 1], data[i + 2]);
  }
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] +
        lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] +
        lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

function clamp(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

/* ---------- Composite (artwork + palette band) ---------- */

export function composeWork(
  artwork: HTMLCanvasElement,
  palette: string[]
): string {
  const w = artwork.width;
  const h = artwork.height;
  const bandH = Math.round(w * 0.14);
  const pad = Math.round(w * 0.02);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h + bandH;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(artwork, 0, 0, w, h);

  // Palette band.
  const innerW = w - pad * 2;
  const gap = Math.round(pad * 0.4);
  const chipW = (innerW - gap * (palette.length - 1)) / palette.length;
  const chipH = bandH - pad * 2;
  const y = h + pad;
  palette.forEach((hex, i) => {
    ctx.fillStyle = hex;
    const x = pad + i * (chipW + gap);
    roundRect(ctx, x, y, chipW, chipH, Math.min(chipW, chipH) * 0.12);
    ctx.fill();
  });

  return canvas.toDataURL("image/jpeg", 0.9);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downscaleToDataUrl(
  img: HTMLImageElement,
  maxEdge = 1280,
  quality = 0.86
): string {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
