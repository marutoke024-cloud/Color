import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useNavigate } from "react-router-dom";
import type { Work } from "../lib/db";

/* ---- Geometry tuning ---- */
const RADIUS = 5.0;
const CARD_W = 2.3;
const CARD_H = 3.2;
const MIN_SLOTS = 9; // keeps a sparse gallery from looking empty
const CAM_Z = 14.5;
const CAM_FOV = 30;

interface SharedControl {
  target: number; // desired rotation (radians)
  current: number; // smoothed rotation
  dragging: boolean;
  clamp: [number, number] | null;
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

  // Lazy texture load with cover-cropping to the card aspect.
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(work.compositeDataUrl, (tex) => {
      if (!alive) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const img = tex.image as HTMLImageElement;
      const cardAspect = CARD_W / CARD_H;
      const imgAspect = img.width / img.height;
      if (imgAspect > cardAspect) {
        tex.repeat.set(cardAspect / imgAspect, 1);
        tex.offset.set((1 - cardAspect / imgAspect) / 2, 0);
      } else {
        tex.repeat.set(1, imgAspect / cardAspect);
        tex.offset.set(0, (1 - imgAspect / cardAspect) / 2);
      }
      setTexture(tex);
    });
    return () => {
      alive = false;
    };
  }, [work.compositeDataUrl]);

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
      const op = THREE.MathUtils.smoothstep(facing, -0.05, 0.5);
      matRef.current.opacity = op;
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
          // Ignore clicks that were really drags, or on far cards.
          if (control.current.dragging) return;
          if (Math.cos(angle + control.current.current) < 0.6) return;
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
  const slots = Math.max(works.length, MIN_SLOTS);
  const step = (Math.PI * 2) / slots;

  // Set clamp range for sparse galleries (so you can't spin into emptiness).
  useEffect(() => {
    if (works.length < MIN_SLOTS) {
      control.current.clamp = [-(works.length - 1) * step, 0];
    } else {
      control.current.clamp = null;
    }
  }, [works.length, step, control]);

  useFrame(() => {
    const c = control.current;
    if (c.clamp) {
      c.target = THREE.MathUtils.clamp(c.target, c.clamp[0], c.clamp[1]);
    }
    c.current += (c.target - c.current) * 0.09;
  });

  return (
    <>
      {works.map((work, i) => (
        <Card
          key={work.id}
          work={work}
          angle={i * step}
          control={control}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

export default function CylinderGallery({ works }: { works: Work[] }) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const control = useRef<SharedControl>({
    target: 0,
    current: 0,
    dragging: false,
    clamp: null,
  });

  // Wheel + pointer drag → rotation. Native listeners so we can preventDefault.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      control.current.target -= d * 0.0016;
    };

    let lastX = 0;
    let moved = 0;
    const onDown = (e: PointerEvent) => {
      control.current.dragging = true;
      moved = 0;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!control.current.dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      control.current.target += dx * 0.006;
    };
    const onUp = (e: PointerEvent) => {
      // Defer clearing so the click handler can read `dragging` if it was a drag.
      const wasDrag = moved > 6;
      if (wasDrag) {
        control.current.dragging = true;
        setTimeout(() => (control.current.dragging = false), 0);
      } else {
        control.current.dragging = false;
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
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
