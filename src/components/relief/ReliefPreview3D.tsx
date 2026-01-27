import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { OrbitControls, Grid, Edges } from "@react-three/drei";

function makeSolidFromRelief(topGeo: THREE.BufferGeometry, baseMm: number) {
  const geo = topGeo.clone();

  // assicuro che sia indexed (serve per lavorare bene coi triangoli)
  if (!geo.index) geo = geo.toNonIndexed();

  const pos = geo.attributes.position.array as Float32Array;
  const vertCount = pos.length / 3;

  // TOP positions
  const topPos = new Float32Array(pos);

  // BOTTOM positions (stesse X,Y ma Z = -baseMm)
  const botPos = new Float32Array(pos.length);
  for (let i = 0; i < vertCount; i++) {
    botPos[i * 3 + 0] = topPos[i * 3 + 0];
    botPos[i * 3 + 1] = topPos[i * 3 + 1];
    botPos[i * 3 + 2] = -Math.abs(baseMm);
  }

  // Indici del top: se esiste index lo uso, altrimenti triangoli sequenziali
  const topIndex = geo.index
    ? (geo.index.array as Uint16Array | Uint32Array)
    : null;

  const triCount = topIndex ? topIndex.length / 3 : vertCount / 3;

  // Costruisco index per: top + bottom + side walls
  // - top: come originale
  // - bottom: triangoli invertiti (winding opposto)
  // - sides: chiudo il bordo esterno della griglia (approccio MVP)
  const indices: number[] = [];

  // TOP
  if (topIndex) {
    for (let i = 0; i < topIndex.length; i++) indices.push(topIndex[i]);
  } else {
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
    // non-indexed: inverti per terne
    for (let i = 0; i < vertCount; i += 3) {
      indices.push(i + vertCount, i + 2 + vertCount, i + 1 + vertCount);
    }
  }

  // SIDE WALLS (MVP): chiudo il contorno del plane
  // Per farlo in modo affidabile serve sapere gridW/gridH.
  // Qui usiamo un trucco: leggiamo i segmenti dalla PlaneGeometry parameters se presenti.
  const params: any = (topGeo as any).parameters;
  const segW = params?.widthSegments ?? 0;
  const segH = params?.heightSegments ?? 0;

  const gridW = segW + 1;
  const gridH = segH + 1;

  if (gridW > 1 && gridH > 1 && gridW * gridH === vertCount) {
    const vid = (x: number, y: number) => y * gridW + x;

    // bordo alto (y=0)
    for (let x = 0; x < gridW - 1; x++) {
      const a = vid(x, 0);
      const b = vid(x + 1, 0);
      // due triangoli tra top e bottom
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

  // Unisco posizioni TOP+BOTTOM
  const mergedPos = new Float32Array(topPos.length + botPos.length);
  mergedPos.set(topPos, 0);
  mergedPos.set(botPos, topPos.length);

  const solid = new THREE.BufferGeometry();
  solid.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
  solid.setIndex(indices);
  solid.computeVertexNormals();

  return solid;
}



export type HeightmapState = {
  normF32: Float32Array; // valori normalizzati 0..1 (o simile)
  w: number;
  h: number;
};

type Props = {
  hmState: HeightmapState | null;

  // dimensione desiderata (mm)
  stlWidthMm: number;

  // “step” di campionamento: 1 piena risoluzione, 2 metà, 4 più leggero…
  decimateStep: number;

  // profondità rilievo (mm)
  depthMm: number;

  // non usato qui ma arriva dal Wizard
  baseMm: number;

  // tienili "any" finché non importi i tipi reali
  outputMode?: any;
  baseStyle: any;
};

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

  // Griglia/assi sempre ON per debug
  const showHelpers = true;

  // Geometria rilievo (piano deformato dalla heightmap)
  const reliefGeometry = useMemo(() => {
    if (!hmState) return null;

    const { w, h, normF32 } = hmState;

    const step = Math.max(1, Math.floor(decimateStep || 1));

    const width = Math.max(1, stlWidthMm);
    const height = width * (h / w);

    const gridW = Math.floor((w - 1) / step) + 1;
    const gridH = Math.floor((h - 1) / step) + 1;

    const geo = new THREE.PlaneGeometry(width, height, gridW - 1, gridH - 1);

    const pos = geo.attributes.position.array as Float32Array;

    // riempio Z leggendo normF32 in ordine (x,y)
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
      hasReliefGeometry: !!reliefGeometry,
    });
  }, [
    hmState,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode,
    baseStyle,
    reliefGeometry,
  ]);

  // Camera: abbastanza lontana per vedere un piano largo 60–200mm
  const camDist = Math.max(120, stlWidthMm * 1.1);

  // Cubo debug: proporzionato alla scena
  const cubeSize = Math.max(10, stlWidthMm * 0.08);

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas
        camera={{ position: [0, camDist, camDist], fov: 45, near: 0.1, far: 5000 }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[200, 300, 200]} intensity={1.1} />

        {showHelpers && (
          <>
            {/* Griglia “infinita” (molto meglio di gridHelper finito) */}
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

        {/* Rilievo: ruoto il piano per appoggiarlo sulla griglia */}
        {reliefGeometry && (
  <mesh
    geometry={makeSolidFromRelief(reliefGeometry, baseMm)}
    rotation={[-Math.PI / 2, 0, 0]}
  >
    <meshStandardMaterial roughness={0.75} metalness={0.05} />
    <Edges />
  </mesh>
)}

        
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
