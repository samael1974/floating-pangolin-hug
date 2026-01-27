import * as React from "react";
import * as THREE from "three";
import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import type { BaseStyle, OutputMode } from "@/lib/reliefTypes";

type HeightmapState = { normF32: Float32Array; w: number; h: number };

type Props = {
  hmState: HeightmapState | null;
  widthMm: number;
  depthMm: number;
  baseMm: number;
  previewDecimateStep: number;
  baseStyle: BaseStyle;
  // output fisso in app, ma teniamo param per compatibilità se serve
  outputMode?: OutputMode;
};

export default function ReliefPreview3D({
  hmState,
  widthMm,
  depthMm,
  baseMm,
  previewDecimateStep,
  baseStyle,
  outputMode = "relief",
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0); // trasparente

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
    camera.position.set(0, -Math.max(160, widthMm * 1.2), Math.max(120, widthMm * 0.9));
    camera.lookAt(0, 0, 0);

    // LUCI
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.55);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(200, -300, 500);
    scene.add(dir);

    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-250, 200, 250);
    scene.add(fill);

    // “piano” leggero per ombre visive (senza shadow map per semplicità)
    const grid = new THREE.GridHelper(widthMm * 1.2, 12, 0xcccccc, 0xdddddd);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.02;
    scene.add(grid);

    // Mesh
    let mesh: THREE.Mesh | null = null;

    const material = new THREE.MeshStandardMaterial({
      color: 0xe9e9e9,
      roughness: 0.9,
      metalness: 0.0,
    });

    function rebuild() {
      if (!hmState) {
        if (mesh) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          mesh = null;
        }
        return;
      }

      // decimazione preview (semplice): campionamento su griglia
      const step = Math.max(1, Math.floor(previewDecimateStep));
      const w = hmState.w;
      const h = hmState.h;

      if (step > 1) {
        const dw = Math.floor((w - 1) / step) + 1;
        const dh = Math.floor((h - 1) / step) + 1;
        const out = new Float32Array(dw * dh);

        let p = 0;
        for (let iy = 0; iy < h; iy += step) {
          for (let ix = 0; ix < w; ix += step) {
            out[p++] = hmState.normF32[iy * w + ix];
          }
        }

       const outSolid = buildSolidFromHeightmap({
  height01: out,      // prima: normF32: out
  width: dw,          // prima: w: dw
  height: dh,         // prima: h: dh
  outWidthMm: widthMm, // prima: widthMm
  depthMm,
  baseMm,
  baseStyle: baseStyle as any,
});

const geom = outSolid.geometry;

if (mesh) {
  scene.remove(mesh);
  mesh.geometry.dispose();
}

mesh = new THREE.Mesh(geom, material);
// orientamento: Z su, Y “in basso sullo schermo” già ok; ruotiamo per vista più naturale
mesh.rotation.x = 0;
scene.add(mesh);
return;
}

const outSolid2 = buildSolidFromHeightmap({
  height01: hmState.normF32, // prima: normF32
  width: hmState.w,          // prima: w
  height: hmState.h,         // prima: h
  outWidthMm: widthMm,       // prima: widthMm
  depthMm,
  baseMm,
  baseStyle: baseStyle as any,
});

const geom2 = outSolid2.geometry;


      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      mesh = new THREE.Mesh(geom, material);
      scene.add(mesh);
    }

    function resize() {
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : 600;
      const h = parent ? parent.clientHeight : 400;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    // orbit minimal (drag)
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let yaw = 0;
    let pitch = 0.55;
    let dist = Math.max(180, widthMm * 1.3);

    function updateCamera() {
      const cx = dist * Math.cos(pitch) * Math.sin(yaw);
      const cy = -dist * Math.cos(pitch) * Math.cos(yaw);
      const cz = dist * Math.sin(pitch);
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 0, baseMm * 0.25);
    }

    function onDown(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      yaw += dx * 0.006;
      pitch = Math.max(0.15, Math.min(1.35, pitch + dy * 0.006));
      updateCamera();
    }
    function onUp() {
      dragging = false;
    }
    function onWheel(e: WheelEvent) {
      dist = Math.max(60, Math.min(1200, dist + e.deltaY * 0.35));
      updateCamera();
    }

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    resize();
    updateCamera();
    rebuild();

    const ro = new ResizeObserver(() => resize());
    canvas.parentElement && ro.observe(canvas.parentElement);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();

      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel as any);

      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      material.dispose();
      renderer.dispose();
    };
    // rebuild when inputs change:
  }, [hmState, widthMm, depthMm, baseMm, previewDecimateStep, baseStyle]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      {!hmState && (
        <div className="absolute inset-0 grid place-items-center text-xs text-gray-500">
          La preview 3D appare dopo la generazione della heightmap (normF32/w/h).
        </div>
      )}
    </div>
  );
}
