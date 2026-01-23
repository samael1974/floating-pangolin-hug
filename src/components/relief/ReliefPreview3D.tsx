"use client";

import React from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const ReliefModel = () => {
  const model = useLoader(GLTFLoader, '/models/relief.glb');

  return <primitive object={model.scene} />;
};

const ReliefPreview3D: React.FC = () => {
  return (
    <Canvas>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      <ReliefModel />
    </Canvas>
  );
};

export default ReliefPreview3D;