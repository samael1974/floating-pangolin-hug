"use client";

import React from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';

const Heightmap = () => {
  const heightmapTexture = useLoader(TextureLoader, '/path/to/your/heightmap.png');

  return (
    <mesh>
      <planeGeometry args={[10, 10]} />
      <meshStandardMaterial map={heightmapTexture} flatShading />
    </mesh>
  );
};

const ReliefHeightmap: React.FC = () => {
  return (
    <Canvas>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <Heightmap />
    </Canvas>
  );
};

export default ReliefHeightmap;