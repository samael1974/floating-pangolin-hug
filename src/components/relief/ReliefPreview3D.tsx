import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";
import * as THREE from "three";

export type HeightmapState = {
  normF32: Float32Array; // valori 0..1 (o simile)
  w: number;
  h: number;
};

type Props = {
  hmState: HeightmapState | null;
  stlWidthMm: number;
  decimateStep: number;
  depthMm: number;
  baseMm: number;
  outputMode?: any;
  baseStyle: any;
};

/**
 * Crea un solido "tipo STL" da un top (plane deformato):
 * - TOP (come la geometry originale)
 * - BOTTOM (piatto a -baseMm)
 * - WALLS (chiusura sui 4 bordi della griglia)
 *
 * Funziona bene quando topGeo è una PlaneGeometry indicizzata (lo è di default).
 */
function makeSolidFromRelief(topGeo: THREE.BufferGeometry, baseMm: number) {
  const geo = topGeo.clone();

  const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const vertCount = pos.length / 3;

  // TOP positions (copiati)
  const topPos = new Float32Array(pos);

  // BOTTOM positions (stesse X,Y ma Z = -baseMm)
  const botPos = new Float32Array(pos.length);
  const bottomZ = -Math.abs(baseMm);

  for (let i = 0; i < vertCount; i++) {
    botPos[i * 3 + 0] = topPos[i * 3 + 0];
    botPos[i * 3 + 1] = topPos[i * 3 + 1];
    botPos[i * 3 + 2] = bottomZ;
  }

  // Indici del TOP
  const topIndex = geo.index ? (geo.index.array as any) : null;

  const indices: number[] = [];

  // TOP
  if (topIndex) {
    for (let i = 0; i < topIndex.length; i++) indices.push(topIndex[i]);
  } else {
    // non-indexed: triangoli sequenziali
    for (let i = 0; i < vertCount; i++) indices.push(i);
  }

  // BOTTOM (offset = vertCount, winding invertito)
  if (topIndex) {
    for (let i = 0; i < topIndex.length; i += 3) {
      const a = topIndex[i + 0] + vertCount;
      const b = topIndex[i + 1] + vertCount;
      const c = topIndex[i + 2] + vertCount;
      indices.push(a, c, b);
    }
  } else {
    for (let i = 0; i < vertCount; i += 3) {
      indices.push(i + vertCount, i + 2 + vertCount, i + 1 + vertCount);
    }
  }

  // WALLS (MVP): chiudo i 4 bordi se posso ricostruire la griglia
  const params: any = (topGeo as any).parameters;
  const segW = params?.widthSegments ?? 0;
  const segH = params?.heightSegments ?? 0;

  const gridW = segW + 1;
  const gridH = segH + 1;

  // Questa condizione è vera quando il TOP è una PlaneGeometry indicizzata standard
  if (gridW > 1 && gridH > 1 && gridW * gridH === vertCount) {
    const vid = (x: number, y: number) => y * gridW + x;

    // bordo alto (y=0)
    for (let x = 0; x < gridW - 1; x++) {
      const a = vid(x, 0);
      const b = vid(x + 1, 0);
      indices.push(a, b, b + vertCount);
      indices.push(a, b + vertCount, a + vertCount);
    }

    // bordo basso (y=gridH-1)
    for (let x = 0; x < gridW - 1; x++) {
      const a = vid(x, gridH - 1);
      const b = vid(x + 1, gridH - 1);
      indices.push(b, a, a + vertCount);
      indices.push(b, a + vertCount, b + vertCount);
    }

    // bordo sinistro (x=0)
    for (let y = 0; y < gridH - 1; y++) {
      const a = vid(0, y);
      const b = vid(0, y + 1);
      indices.push(b, a, a + vertCount);
      indices.push(b, a + vertCount, b + vertCount);
    }

    // bordo destro (x=gridW-1)
    for (let y = 0; y < gridH - 1; y++) {
      const a = vid(gridW - 1, y);
      const b = vid(gridW - 1, y + 1);
      indices.push(a, b, b + vertCount);
      indices.push(a, b + vertCount, a + vertCount);
    }
  }

  // Unisco TOP+BOTTOM
  const mergedPos = new Float32Array(topPos.length + botPos.length);
  mergedPos.set(topPos, 0);
  mergedPos.set(botPos, topPos.length);

  const solid = new THREE.BufferGeometry();
  solid.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
  solid.setIndex(indices);
  solid.computeVertexNormals();

  return solid;
}

export default function ReliefPreview3D(props: Props): JSX.Element {
  const {
    hmState,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode = "relief",
    baseStyle,
  } = props;

  const showHelpers = true;

  // TOP geometry (piano deformato)
  const reliefTopGeometry = useMemo(() => {
    if (!hmState) return null;

    const { w, h, normF32 } = hmState;

    const step = Math.max(1, Math.floor(decimateStep || 1));

    const width = Math.max(1, stlWidthMm);
    const height = width * (h / w);

    const gridW = Math.floor((w - 1) / step) + 1;
    const gridH = Math.floor((h - 1) / step) + 1;

    const geo = new THREE.PlaneGeometry(width, height, gridW - 1, gridH - 1);
    const pos = geo.attributes.position.array as Float32Array;

    let v = 0;
    for (let iy = 0; iy < gridH; iy++) {
      const srcY = Math.min(h - 1, iy * step);
      for (let ix = 0; ix < gridW; ix++) {
        const srcX = Math.min(w - 1, ix * step);
        const srcIndex = srcY * w + srcX;

        pos[v * 3 + 2] = (normF32[srcIndex] ?? 0) * depthMm;
        v++;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }, [hmState, stlWidthMm, decimateStep, depthMm]);

  // SOLID geometry (tipo STL)
  const reliefSolidGeometry = useMemo(() => {
    if (!reliefTopGeometry) return null;
    return makeSolidFromRelief(reliefTopGeometry, baseMm);
  }, [reliefTopGeometry, baseMm]);

  useEffect(() => {
    console.log("ReliefPreview3D updated", {
      hmState: hmState
        ? { w: hmState.w, h: hmState.h, len: hmState.normF32.length }
        : null,
      stlWidthMm,
      decimateStep,
      depthMm,
      baseMm,
      outputMode,
      baseStyle,
      hasTop: !!reliefTopGeometry,
      hasSolid: !!reliefSolidGeometry,
    });
  }, [
    hmState,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode,
    baseStyle,
    reliefTopGeometry,
    reliefSolidGeometry,
  ]);

  const camDist = Math.max(120, stlWidthMm * 1.1);

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas
        camera={{ position: [0, camDist, camDist], fov: 45, near: 0.1, far: 5000 }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[200, 300, 200]} intensity={1.1} />

        {showHelpers && (
          <>
            <Grid
              infiniteGrid
              fadeDistance={600}
              fadeStrength={3}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[stlWidthMm]} />
          </>
        )}

        {/* SOLIDO "tipo STL" */}
        {reliefSolidGeometry && (
          <mesh geometry={reliefSolidGeometry} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial roughness={0.75} metalness={0.05} />
            <Edges />
          </mesh>
        )}

        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
