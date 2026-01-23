import React from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { ReliefParams } from "@/components/relief/ReliefControls";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";

type Props = {
  file: File | null;
  params: ReliefParams;
  maxSize?: number; // px (consiglio 256..512)
};

function useHeightmapGeometry(
  file: File | null,
  params: ReliefParams,
  maxSize: number
) {
  const [geom, setGeom] = React.useState<THREE.BufferGeometry | null>(null);
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  React.useEffect(() => {
    let cancelled = false;
    let revokeUrl: string | null = null;

    async function run() {
      if (!file) {
        setGeom(null);
        setStatus("idle");
        return;
      }

      setStatus("loading");

      const url = URL.createObjectURL(file);
      revokeUrl = url;

      const img = new Image();
      img.decoding = "async";
      img.src = url;

      await img.decode().catch(() => {
        return new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Impossibile caricare immagine"));
        });
      });

      if (cancelled) return;

      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = Math.min(1, maxSize / Math.max(iw, ih));
      const w = Math.max(8, Math.round(iw * scale));
      const h = Math.max(8, Math.round(ih * scale));

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const offCtx = off.getContext("2d", { willReadFrequently: true });
      if (!offCtx) throw new Error("Canvas 2D non disponibile");

      offCtx.drawImage(img, 0, 0, w, h);
      const imgData = offCtx.getImageData(0, 0, w, h);

      // ✅ usa la tua pipeline FLOAT
      const hm = buildHeightmapFromImageData(imgData, params, {
        normalize: true,
        invert: false,
      });

      // PlaneGeometry: segmenti = pixel-1
      const geo = new THREE.PlaneGeometry(1, h / w, w - 1, h - 1);

      // sposta i vertici Z in base alla heightmap
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const data = hm.normF32; // 0..1 float
      const depth = params.depthMm; // “altezza” preview in mm (solo scala)

      // Nota: PlaneGeometry è centrata: Y va su/giù.
      // Indici: per ogni vertex i => corrisponde a pixel
      for (let i = 0; i < pos.count; i++) {
        const u = i % w;
        const v = Math.floor(i / w);
        const idx = v * w + u;
        const z = (data[idx] ?? 0) * depth;

        pos.setZ(i, z);
      }

      pos.needsUpdate = true;
      geo.computeVertexNormals();

      if (!cancelled) {
        setGeom(geo);
        setStatus("ready");
      }
    }

    run().catch((e) => {
      console.error(e);
      setStatus("error");
      setGeom(null);
    });

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [file, params.projectType, params.detail, params.smooth, params.edge, params.depthMm, maxSize]);

  return { geom, status };
}

function ReliefMesh({ geom }: { geom: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial
        metalness={0.1}
        roughness={0.8}
        color={"#d1d5db"} // grigio chiaro
      />
    </mesh>
  );
}

export default function ReliefPreview3D({ file, params, maxSize = 256 }: Props) {
  const { geom, status } = useHeightmapGeometry(file, params, maxSize);

  return (
    <div className="rounded-lg bg-white p-6 shadow space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">3B) Preview 3D (prima dello STL)</h2>
          <p className="text-sm text-gray-600">
            Ruota e zooma per vedere subito se i parametri producono una superficie pulita.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {status === "loading"
            ? "Elaborazione…"
            : status === "error"
            ? "Errore"
            : status === "ready"
            ? "Pronto"
            : "In attesa"}
        </div>
      </div>

      <div className="w-full rounded border bg-gray-50 overflow-hidden" style={{ height: 380 }}>
        <Canvas camera={{ position: [1.2, 1.0, 1.2], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 3, 2]} intensity={1.2} />
          <directionalLight position={[-2, 1, -1]} intensity={0.4} />

          {/* un piano base sottile “di appoggio” */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <planeGeometry args={[1.05, 1.05]} />
            <meshStandardMaterial roughness={1} metalness={0} color={"#f3f4f6"} />
          </mesh>

          {geom ? <ReliefMesh geom={geom} /> : null}

          <OrbitControls enablePan enableZoom enableRotate />
        </Canvas>
      </div>

      <div className="text-xs text-gray-500">
        Tip: se vedi “onde” o rumore, abbassa <b>Detail</b> o alza <b>Smoothing</b>.
        Se sembra troppo piatto, aumenta <b>Depth</b>.
      </div>
    </div>
  );
}
