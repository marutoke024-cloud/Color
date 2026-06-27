import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useNavigate } from "react-router-dom";
import type { Work } from "../lib/db";

/* ---- Geometry tuning ---- */
const RADIUS = 5.0;
const CARD_W = 2.3;
const CARD_H = 3.2;
const CAM_Z = 14.5;
const CAM_FOV = 30;
const AUTO_SPEED = 0.0011; // constant slow drift (radians / frame)

/* ---- Card thumbnail (fixed card aspect, uniform palette band) ---- */
const TEX_W = 512;
const TEX_H = Math.round(TEX_W * (CARD_H / CARD_W));
const BAND_H = Math.round(TEX_W * 0.15);
const BAND_FRACTION = 0.14; // must match composeWork() in imageProcessing.ts

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Build a uniform card texture: the artwork (band cropped off the stored
 *  composite) cover-fit into the top, and a fresh, fixed-height palette band
 *  drawn from the work's colours so every card reads identically. */
function buildThumb(img: HTMLImageElement, palette: string[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const artH = TEX_H - BAND_H;
  // The stored composite is artwork + a band of round(width * BAND_FRACTION).
  const srcBand = Math.round(img.width * BAND_FRACTION);
  const srcArtH = Math.max(1, img.height - srcBand);

  // Cover-fit the artwork region into the top of the card.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, TEX_W, artH);
  ctx.clip();
  const s = Math.max(TEX_W / img.width, artH / srcArtH);
  const dw = img.width * s;
  const dh = srcArtH * s;
  ctx.drawImage(
    img,
    0, 0, img.width, srcArtH,
    (TEX_W - dw) / 2, (artH - dh) / 2, dw, dh
  );
  ctx.restore();

  // Palette band.
  const colors = palette.length ? palette : ["#e8e8e4"];
  const pad = Math.round(TEX_W * 0.022);
  const gap = Math.round(pad * 0.55);
  const y = artH + pad;
  const h = BAND_H - pad * 2;
  const innerW = TEX_W - pad * 2;
  const chipW = (innerW - gap * (colors.length - 1)) / colors.length;
  colors.forEach((hex, i) => {
    ctx.fillStyle = hex;
    roundRect(ctx, pad + i * (chipW + gap), y, chipW, h, Math.min(chipW, h) * 0.16);
    ctx.fill();
  });

  return canvas;
}

interface SharedControl {
  target: number; // desired rotation (radians)
  current: number; // smoothed rotation
  moved: number; // px dragged in the current gesture (to tell taps from drags)
}

/* ---- One card on the cylinder wall ---- */
function Card({
  work,
  angle,
  control,
  onOpen,
}: {
  work: Work;
  angle: number;
  control: React.MutableRefObject<SharedControl>;
  onOpen: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const hoverRef = useRef(0);

  // Lazy thumbnail build.
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const tex = new THREE.CanvasTexture(buildThumb(img, work.palette));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = work.compositeDataUrl;
    return () => {
      alive = false;
    };
  }, [work.compositeDataUrl, work.palette]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const eff = angle + control.current.current;
    g.position.x = RADIUS * Math.sin(eff);
    g.position.z = RADIUS * Math.cos(eff);
    g.rotation.y = eff;

    const facing = Math.cos(eff); // 1 at front, <0 at back
    hoverRef.current += ((hovered ? 1 : 0) - hoverRef.current) * 0.15;
    const emphasis = Math.max(0, (facing - 0.25) / 0.75);
    const scale = 0.8 + 0.16 * emphasis + 0.05 * hoverRef.current;
    g.scale.setScalar(scale);
    g.visible = facing > -0.05;

    if (matRef.current) {
      matRef.current.opacity = THREE.MathUtils.smoothstep(facing, -0.05, 0.5);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          // Ignore gestures that were drags, or taps on far/side cards.
          if (control.current.moved > 6) return;
          if (Math.cos(angle + control.current.current) < 0.55) return;
          onOpen(work.id);
        }}
      >
        <planeGeometry args={[CARD_W, CARD_H]} />
        {texture ? (
          <meshBasicMaterial
            ref={matRef}
            map={texture}
            transparent
            depthWrite={false}
            side={THREE.FrontSide}
            toneMapped={false}
          />
        ) : (
          <meshBasicMaterial ref={matRef} color="#ededea" transparent depthWrite={false} />
        )}
      </mesh>
    </group>
  );
}

function Scene({
  works,
  control,
  onOpen,
}: {
  works: Work[];
  control: React.MutableRefObject<SharedControl>;
  onOpen: (id: string) => void;
}) {
  // Even spacing around the full circle → seamless loop for any count.
  const step = (Math.PI * 2) / Math.max(1, works.length);

  useFrame(() => {
    const c = control.current;
    c.target += AUTO_SPEED; // always drifting
    c.current += (c.target - c.current) * 0.09;
  });

  return (
    <>
      {works.map((work, i) => (
        <Card key={work.id} work={work} angle={i * step} control={control} onOpen={onOpen} />
      ))}
    </>
  );
}

export default function CylinderGallery({ works }: { works: Work[] }) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const control = useRef<SharedControl>({ target: 0, current: 0, moved: 0 });

  // Wheel + pointer drag → rotation. No pointer capture, so react-three-fiber
  // still receives pointerup on the cards and can fire onClick for taps.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      control.current.target -= d * 0.0016;
    };

    let dragging = false;
    let lastX = 0;

    const onWinMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      control.current.moved += Math.abs(dx);
      control.current.target += dx * 0.006;
    };
    const onWinUp = () => {
      dragging = false;
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      control.current.moved = 0;
      window.addEventListener("pointermove", onWinMove);
      window.addEventListener("pointerup", onWinUp);
      window.addEventListener("pointercancel", onWinUp);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    };
  }, []);

  return (
    <div ref={wrapRef} className="gallery-stage" style={{ touchAction: "none" }}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, CAM_Z], fov: CAM_FOV }}
        dpr={[1, 2]}
      >
        <Scene works={works} control={control} onOpen={(id) => navigate(`/work/${id}`)} />
      </Canvas>
    </div>
  );
}
