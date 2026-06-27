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
  const blurRadius = 1 + Math.round(opts.strength * 2);
  boxBlur(image, w, h, blurRadius);

  const levels = Math.max(3, Math.round(8 - opts.strength * 4)); // posterize
  const edges = sobelEdges(image, w, h);

  posterizeAndShade(image, edges, levels, opts.saturation);

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function boxBlur(image: ImageData, w: number, h: number, r: number) {
  if (r < 1) return;
  const { data } = image;
  const tmp = new Uint8ClampedArray(data);
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horizontal: boolean) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rs = 0, gs = 0, bs = 0, cnt = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const i = (yy * w + xx) * 4;
          rs += src[i]; gs += src[i + 1]; bs += src[i + 2]; cnt++;
        }
        const i = (y * w + x) * 4;
        dst[i] = rs / cnt; dst[i + 1] = gs / cnt; dst[i + 2] = bs / cnt; dst[i + 3] = src[i + 3];
      }
    }
  };
  pass(data, tmp, true);
  pass(tmp, data, false);
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

function posterizeAndShade(
  image: ImageData,
  edges: Float32Array,
  levels: number,
  saturation: number
) {
  const { data } = image;
  const step = 255 / (levels - 1);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let r = Math.round(data[i] / step) * step;
    let g = Math.round(data[i + 1] / step) * step;
    let b = Math.round(data[i + 2] / step) * step;

    if (saturation !== 1) {
      const l = luminance(r, g, b);
      r = clamp(l + (r - l) * saturation);
      g = clamp(l + (g - l) * saturation);
      b = clamp(l + (b - l) * saturation);
    }

    // Ink the strong edges for a drawn outline.
    const e = edges[p];
    if (e > 90) {
      const k = Math.min(0.7, (e - 90) / 320);
      r *= 1 - k; g *= 1 - k; b *= 1 - k;
    }

    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
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
