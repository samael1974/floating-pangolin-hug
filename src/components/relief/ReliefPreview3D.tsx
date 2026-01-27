import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

type Props = {
  hmState: any; // per ora lo teniamo così (poi lo tipizziamo meglio)
};

export default function ReliefPreview3D({ hmState }: Props) {
  // Se vedi questo in console, il componente è montato correttamente
  console.log("ReliefPreview3D mounted", { hmState });

  // Helpers (assi + griglia) nella preview: tienili ON per ora
  const showHelpers = true;
  const reliefGeometry =
  (hmState as any)?.reliefGeometry ??
  (hmState as any)?.geometry ??
  (hmState as any)?.meshGeometry ??
  null;


  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        {/* Luci base */}
        <ambientLight intensity={1} />
        <directionalLight position={[3, 3, 3]} intensity={1} />

        {/* Assi + griglia (solo preview) */}
        {showHelpers && (
          <>
            <axesHelper args={[50]} />
            <gridHelper args={[200, 20]} />
          </>
        )}

        {/* Cubo di debug: deve essere sempre visibile */}
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial />
        </mesh>

        {/* Controlli mouse */}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
