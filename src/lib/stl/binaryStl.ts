// src/lib/stl/binaryStl.ts

export const readBinaryStl = (buffer: ArrayBuffer): { vertices: number[][] } => {
  const dataView = new DataView(buffer);
  let offset = 80; // Skip the header

  const vertexCount = dataView.getUint32(offset, true);
  offset += 4;

  const vertices: number[][] = [];

  for (let i = 0; i < vertexCount * 3; i++) {
    const x = dataView.getFloat32(offset, true);
    offset += 4;
    const y = dataView.getFloat32(offset, true);
    offset += 4;
    const z = dataView.getFloat32(offset, true);
    offset += 4;

    vertices.push([x, y, z]);
  }

  return { vertices };
};