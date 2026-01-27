"use client";

import React from 'react';
import FramePreview3D from './FramePreview3D';

const ReliefPreview3D: React.FC = () => {
  const frameEnabled = true; // Example value, replace with actual logic
  return (
    <div>
      {/* Other code */}
      <FramePreview3D
        enabled={frameEnabled}
        params={{
          outerWidth: 100,
          outerHeight: 200,
          frameThickness: 5,
          depth: 10,
        }}
      />
    </div>
  );
};

export default ReliefPreview3D;