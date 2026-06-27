/* Procedurally generated "color study" works used to seed the gallery so the
 * cylinder has something to show before the user has saved anything of their
 * own. Each is built on a canvas, then run through the same palette-extraction
 * + composite path as real uploads. */

import { extractPalette, composeWork } from "./imageProcessing";
import { newId, type Work } from "./db";

type Stop = [number, string]; // [offset 0..1, hex]

interface Recipe {
  title: string;
  bg: Stop[];
  shapes: ShapeSpec[];
}

interface ShapeSpec {
  kind: "circle" | "band" | "arc";
  color: string;
  x: number; // 0..1
  y: number;
  r: number; // 0..1 relative to width
  alpha?: number;
}

const RECIPES: Recipe[] = [
  {
    title: "Tidewater",
    bg: [[0, "#cdd6d3"], [1, "#8fa6a3"]],
    shapes: [
      { kind: "circle", color: "#3d5a5b", x: 0.34, y: 0.42, r: 0.26 },
      { kind: "band", color: "#e7ddcb", x: 0, y: 0.7, r: 1, alpha: 0.9 },
      { kind: "circle", color: "#b9614f", x: 0.68, y: 0.36, r: 0.12 },
    ],
  },
  {
    title: "Ash Bloom",
    bg: [[0, "#e9e6e0"], [1, "#c8c2b8"]],
    shapes: [
      { kind: "arc", color: "#5b5750", x: 0.5, y: 0.55, r: 0.4 },
      { kind: "circle", color: "#a98c6b", x: 0.6, y: 0.5, r: 0.2 },
      { kind: "circle", color: "#d98e7a", x: 0.4, y: 0.62, r: 0.1 },
    ],
  },
  {
    title: "Slate Dusk",
    bg: [[0, "#9aa1ad"], [1, "#4d5360"]],
    shapes: [
      { kind: "band", color: "#2c303a", x: 0, y: 0.62, r: 1 },
      { kind: "circle", color: "#e4b15c", x: 0.7, y: 0.34, r: 0.14 },
      { kind: "circle", color: "#cdd2db", x: 0.32, y: 0.4, r: 0.18, alpha: 0.85 },
    ],
  },
  {
    title: "Quarry",
    bg: [[0, "#d8d2c7"], [1, "#a59b8a"]],
    shapes: [
      { kind: "band", color: "#6c6353", x: 0, y: 0.5, r: 1 },
      { kind: "circle", color: "#3f3a31", x: 0.5, y: 0.5, r: 0.22 },
      { kind: "circle", color: "#b7846a", x: 0.74, y: 0.66, r: 0.12 },
    ],
  },
  {
    title: "Fennel",
    bg: [[0, "#dfe3d6"], [1, "#aeb79c"]],
    shapes: [
      { kind: "circle", color: "#5d6b46", x: 0.4, y: 0.46, r: 0.24 },
      { kind: "arc", color: "#33402a", x: 0.5, y: 0.5, r: 0.42 },
      { kind: "circle", color: "#e8e2d2", x: 0.66, y: 0.4, r: 0.1, alpha: 0.9 },
    ],
  },
  {
    title: "Ember Rest",
    bg: [[0, "#e7d9cd"], [1, "#c79f86"]],
    shapes: [
      { kind: "circle", color: "#8c3f2e", x: 0.5, y: 0.48, r: 0.26 },
      { kind: "circle", color: "#e6a05a", x: 0.5, y: 0.48, r: 0.13 },
      { kind: "band", color: "#3a2a23", x: 0, y: 0.78, r: 1, alpha: 0.9 },
    ],
  },
  {
    title: "Cold Press",
    bg: [[0, "#eceae5"], [1, "#cfd2d1"]],
    shapes: [
      { kind: "band", color: "#243140", x: 0, y: 0.66, r: 1 },
      { kind: "circle", color: "#7d93a3", x: 0.36, y: 0.42, r: 0.2 },
      { kind: "circle", color: "#c4543f", x: 0.68, y: 0.5, r: 0.11 },
    ],
  },
];

function paintRecipe(recipe: Recipe): HTMLCanvasElement {
  const w = 900;
  const h = 1120;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, w * 0.4, h);
  recipe.bg.forEach(([o, c]) => grad.addColorStop(o, c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (const s of recipe.shapes) {
    ctx.save();
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.fillStyle = s.color;
    if (s.kind === "circle") {
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r * w, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === "band") {
      ctx.fillRect(0, s.y * h, w, Math.max(40, s.r * h * 0.34));
    } else if (s.kind === "arc") {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = w * 0.05;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r * w, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Faint grain (blended via a temp canvas so it sits *over* the art).
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = w;
  grainCanvas.height = h;
  const gctx = grainCanvas.getContext("2d")!;
  const grain = gctx.createImageData(w, h);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 60;
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = v;
    grain.data[i + 3] = 255;
  }
  gctx.putImageData(grain, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(grainCanvas, 0, 0);
  ctx.restore();

  return canvas;
}

export function buildSampleWorks(): Work[] {
  const now = Date.now();
  return RECIPES.map((recipe, i) => {
    const artwork = paintRecipe(recipe);
    const palette = extractPalette(artwork);
    const compositeDataUrl = composeWork(artwork, palette);
    const originalDataUrl = artwork.toDataURL("image/jpeg", 0.85);
    return {
      id: newId(),
      // Stagger timestamps so ordering is stable & varied.
      createdAt: now - i * 1000 * 60 * 60 * 7,
      compositeDataUrl,
      originalDataUrl,
      palette,
      title: recipe.title,
    };
  });
}
