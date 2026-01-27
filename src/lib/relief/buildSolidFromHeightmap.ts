// ==========================
// OFFSET MODE (guscio “CAD-like”)
// ==========================
if (baseStyle === "offset") {
  const t = Math.max(baseMm, 0.8);

  // Top senza baseMm, solo heightmap profondità
  const zTopOffset = (H: number) => {
    const h01 = clamp01(H);
    if (outputMode === "mold") return depthMm * (1 - h01);
    return depthMm * h01;
  };

  // Genera grid 2D di top Z
  const topZ = new Float32Array(w * h);
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      topZ[idx(ix, iy)] = zTopOffset(normF32[idx(ix, iy)] ?? 0);
    }
  }

  // Funzioni di accesso su top
  const getTopZ = (ix: number, iy: number) =>
    topZ[idx(Math.max(0, Math.min(w - 1, ix)), Math.max(0, Math.min(h - 1, iy)))];

  // Calcola bottom = top − t
  const bottomZ = new Float32Array(w * h);
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      bottomZ[idx(ix, iy)] = getTopZ(ix, iy) - t;
    }
  }

  // Trova il min bottomZ per “alzare” a Z=0
  let minB = Infinity;
  for (let i = 0; i < bottomZ.length; i++) {
    if (bottomZ[i] < minB) minB = bottomZ[i];
  }
  const zShift = -minB;

  // Funzioni coordinate
  const getTopPos = (ix: number, iy: number): [number, number, number] => {
    const x = x0 + ix * dx;
    const y = y0 - iy * dy;
    return [x, y, getTopZ(ix, iy) + zShift];
  };
  const getBotPos = (ix: number, iy: number): [number, number, number] => {
    const x = x0 + ix * dx;
    const y = y0 - iy * dy;
    return [x, y, bottomZ[idx(ix, iy)] + zShift];
  };

  // Top faces
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const A = getTopPos(ix, iy);
      const B = getTopPos(ix + 1, iy);
      const C = getTopPos(ix, iy + 1);
      const D = getTopPos(ix + 1, iy + 1);

      pushTri(...A, ...B, ...D);
      pushTri(...A, ...D, ...C);
    }
  }

  // Bottom faces (invertito)
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const A = getBotPos(ix, iy);
      const B = getBotPos(ix + 1, iy);
      const C = getBotPos(ix, iy + 1);
      const D = getBotPos(ix + 1, iy + 1);

      pushTri(...A, ...D, ...B);
      pushTri(...A, ...C, ...D);
    }
  }

  // Side walls: perimetro
  const wallQuad = (
    t1: number[], t2: number[],
    b2: number[], b1: number[]
  ) => {
    pushTri(...t1, ...t2, ...b2);
    pushTri(...t1, ...b2, ...b1);
  };

  // Top edge
  for (let ix = 0; ix < w - 1; ix++) {
    wallQuad(
      getTopPos(ix, 0),
      getTopPos(ix + 1, 0),
      getBotPos(ix + 1, 0),
      getBotPos(ix, 0)
    );
  }
  // Right edge
  for (let iy = 0; iy < h - 1; iy++) {
    wallQuad(
      getTopPos(w - 1, iy),
      getTopPos(w - 1, iy + 1),
      getBotPos(w - 1, iy + 1),
      getBotPos(w - 1, iy)
    );
  }
  // Bottom edge
  for (let ix = w - 1; ix > 0; ix--) {
    wallQuad(
      getTopPos(ix, h - 1),
      getTopPos(ix - 1, h - 1),
      getBotPos(ix - 1, h - 1),
      getBotPos(ix, h - 1)
    );
  }
  // Left edge
  for (let iy = h - 1; iy > 0; iy--) {
    wallQuad(
      getTopPos(0, iy),
      getTopPos(0, iy - 1),
      getBotPos(0, iy - 1),
      getBotPos(0, iy)
    );
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}
