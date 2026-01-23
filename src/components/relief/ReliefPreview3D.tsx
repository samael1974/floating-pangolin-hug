import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { buildReliefGeometry } from "@/components/relief/reliefGeometry";

type Props = {
  normF32?: Float32Array;
  w?: number;
  h?: number;
  widthMm: number;
  depthMm: number;
  baseMm: number;
  invert?: boolean;
  previewDecimateStep?: number;
};

function SceneMesh({
  normF32,
  w,
  h,
  widthMm,
  depthMm,
  baseMm,
  invert,
  previewDecimateStep,
}: Props) {
  const geometry = React.useMemo(() => {
    if (!normF32 || !w || !h) return null;
    return buildReliefGeometry(normF32, w, h, {
      widthMm,
      depthMm,
      baseMm,
      invert,
      decimateStep: previewDecimateStep ?? 3,
    });
  }, [normF32, w, h, widthMm, depthMm, baseMm, invert, previewDecimateStep]);

  const material = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.85,
        metalness: 0.0,
        color: new THREE.Color("#ECECEC"),
      }),
    []
  );

  if (!geometry) return null;

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const center = new THREE.Vector3();
  bb.getCenter(center);

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[-center.x, 0, center.y]}
      castShadow
      receiveShadow
    />
  );
}

export default function ReliefPreview3D(props: Props) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [eventSource, setEventSource] = React.useState<HTMLElement | null>(null);

  // ✅ l’eventSource deve essere un ELEMENTO reale, non il ref object
  React.useEffect(() => {
    setEventSource(wrapRef.current);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="w-full overflow-hidden rounded-xl bg-white shadow"
      style={{ position: "relative" }}
    >
      <div className="border-b px-4 py-2">
        <h3 className="text-sm font-semibold text-[#1F4E5F]">Preview 3D</h3>
        <p className="text-xs text-slate-500">Ruota con drag • Zoom con rotellina/pinch</p>
      </div>

      <div className="h-[360px] w-full" style={{ touchAction: "none" }}>
        {eventSource && (
          <Canvas
            // ✅ eventi agganciati a wrapper stabile
            eventSource={eventSource}
            eventPrefix="client"
            style={{ touchAction: "none" }}
            shadows
            camera={{ position: [0, 120, 220], fov: 35, near: 0.1, far: 2000 }}
          >
            <ambientLight intensity={0.7} />
            <directionalLight position={[200, 300, 150]} intensity={1.0} castShadow />
            <directionalLight position={[-200, 200, -150]} intensity={0.35} />

            <SceneMesh {...props} />

            {/* ✅ controlli orbit/zoom */}
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.7}
              zoomSpeed={0.9}
              panSpeed={0.6}
            />
          </Canvas>
        )}
      </div>
    </div>
  );
}
