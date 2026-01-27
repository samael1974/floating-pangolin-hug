import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
const showHelpers = true;

type Props = {
  // metti i tuoi props veri qui, anche se non li usi nel debug
  hmState: any;
};

export default function ReliefPreview3D({ hmState }: Props) {
  // LOG: se questo non stampa, il componente non viene montato
  console.log("ReliefPreview3D mounted", { hmState });

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[3, 3, 3]} intensity={1} />
        <axesHelper args={[50]} />
        <gridHelper args={[200, 20]} />

        {/* Debug object ALWAYS visible */}
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial />
        </mesh>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
