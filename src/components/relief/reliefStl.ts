// src/components/relief/reliefStl.ts

export type HeightfieldToStlOptions = {
  widthMm: number;          // larghezza finale in mm (es. 120)
  depthMm: number;          // rilievo massimo in mm (params.depthMm)
  baseMm: number;           // spessore base in mm (params.baseMm)
  invert?: boolean;         // default false
  decimateStep?: number;    // 1=full, 2=mezzo, 3=terzo...
    noBasePlate?: boolean;    // true = niente piastra piatta sotto (modello chiuso)
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sub(a: number[], b: number[]) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: number[], b: number[]) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function normalize(v: number[]) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function triFacet(a: number[], b: number[], c: number[]) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const n = normalize(cross(ab, ac));
  return (
    `facet normal ${n[0]} ${n[1]} ${n[2]}\n` +
    `  outer loop\n` +
    `    vertex ${a[0]} ${a[1]} ${a[2]}\n` +
    `    vertex ${b[0]} ${b[1]} ${b[2]}\n` +
    `    vertex ${c[0]} ${c[1]} ${c[2]}\n` +
    `  endloop\n` +
    `endfacet\n`
  );
}

/**
 * normF32: heightmap normalizzata 0..1 (len = w*h)
 * Ritorna STL ASCII con top surface + base + pareti.
 */
export function heightmapToAsciiStl(
  normF32: Float32Array,
  w: number,
  h: number,
  opts: HeightfieldToStlOptions
): string {
  const step = Math.max(1, Math.floor(opts.decimateStep ?? 1));
  const widthMm = opts.widthMm;
  const heightMm = widthMm * (h / w); // mantiene proporzione
  const dxCount = Math.floor((w - 1) / step) + 1;
  const dyCount = Math.floor((h - 1) / step) + 1;

  const dx = widthMm / (dxCount - 1);
  const dy = heightMm / (dyCount - 1);

  const zBase = 0;
  const depthMm = opts.depthMm;
  const baseMm = opts.baseMm;
  const invert = !!opts.invert;

  function topZ(ix: number, iy: number) {
    const x = clamp(ix * step, 0, w - 1);
    const y = clamp(iy * step, 0, h - 1);
    const v = normF32[y * w + x];
    const t = invert ? 1 - v : v;
    return zBase + baseMm + t * depthMm;
  }

  function bottomZ(ix: number, iy: number) {
    if (opts.noBasePlate) {
      const x = clamp(ix * step, 0, w - 1);
      const y = clamp(iy * step, 0, h - 1);
      const v = normF32[y * w + x];
      const t = invert ? 1 - v : v;
      return zBase + t * depthMm; // fondo "a rilievo", niente piastra piatta
    }
    return zBase; // fondo classico piatto
  }

  let out = "solid relief\n";

  // --- TOP surface ---
  for (let y = 0; y < dyCount - 1; y++) {
    for (let x = 0; x < dxCount - 1; x++) {
      const x0 = x * dx;
      const y0 = y * dy;
      const x1 = (x + 1) * dx;
      const y1 = (y + 1) * dy;

        const z00 = topZ(x, y);
      const z10 = topZ(x + 1, y);
      const z01 = topZ(x, y + 1);
      const z11 = topZ(x + 1, y + 1);


      const p00 = [x0, y0, z00];
      const p10 = [x1, y0, z10];
      const p01 = [x0, y1, z01];
      const p11 = [x1, y1, z11];

      // due triangoli per cella
      out += triFacet(p00, p10, p11);
      out += triFacet(p00, p11, p01);
    }
  }

  // --- BOTTOM ---
  if (opts.noBasePlate) {
    // bottom come heightfield (non un piano): evita la "piastra"
    for (let y = 0; y < dyCount - 1; y++) {
      for (let x = 0; x < dxCount - 1; x++) {
        const x0 = x * dx;
        const y0 = y * dy;
        const x1 = (x + 1) * dx;
        const y1 = (y + 1) * dy;

        const z00 = bottomZ(x, y);
        const z10 = bottomZ(x + 1, y);
        const z01 = bottomZ(x, y + 1);
        const z11 = bottomZ(x + 1, y + 1);

        const p00 = [x0, y0, z00];
        const p10 = [x1, y0, z10];
        const p01 = [x0, y1, z01];
        const p11 = [x1, y1, z11];

        // winding opposto al TOP (normali outward)
        out += triFacet(p00, p11, p10);
        out += triFacet(p00, p01, p11);
      }
    }
  } else {
    // bottom piano classico
    const pA = [0, 0, zBase];
    const pB = [widthMm, 0, zBase];
    const pC = [widthMm, heightMm, zBase];
    const pD = [0, heightMm, zBase];

    out += triFacet(pA, pC, pB);
    out += triFacet(pA, pD, pC);
  }

  // --- SIDES ---
  // Left (x=0)
  for (let y = 0; y < dyCount - 1; y++) {
    const zTop0 = topZ(0, y);
    const zTop1 = topZ(0, y + 1);
    const zBot0 = bottomZ(0, y);
    const zBot1 = bottomZ(0, y + 1);
    
    const top0 = [0, y0, zTop0];
    const top1 = [0, y1, zTop1];
    const bot0 = [0, y0, zBot0];
    const bot1 = [0, y1, zBot1];

    out += triFacet(bot0, top1, top0);
    out += triFacet(bot0, bot1, top1);
  }

  // Right (x=widthMm)
  for (let y = 0; y < dyCount - 1; y++) {
    const y0 = y * dy;
    const y1 = (y + 1) * dy;
    const z0 = sample(dxCount - 1, y);
    const z1 = sample(dxCount - 1, y + 1);

    const top0 = [widthMm, y0, z0];
    const top1 = [widthMm, y1, z1];
    const bot0 = [widthMm, y0, zBase];
    const bot1 = [widthMm, y1, zBase];

    out += triFacet(bot0, top0, top1);
    out += triFacet(bot0, top1, bot1);
  }

  // Front (y=0)
  for (let x = 0; x < dxCount - 1; x++) {
    const x0 = x * dx;
    const x1 = (x + 1) * dx;
    const z0 = sample(x, 0);
    const z1 = sample(x + 1, 0);

    const top0 = [x0, 0, z0];
    const top1 = [x1, 0, z1];
    const bot0 = [x0, 0, zBase];
    const bot1 = [x1, 0, zBase];

    out += triFacet(bot0, top0, top1);
    out += triFacet(bot0, top1, bot1);
  }

  // Back (y=heightMm)
  for (let x = 0; x < dxCount - 1; x++) {
    const x0 = x * dx;
    const x1 = (x + 1) * dx;
    const z0 = sample(x, dyCount - 1);
    const z1 = sample(x + 1, dyCount - 1);

    const top0 = [x0, heightMm, z0];
    const top1 = [x1, heightMm, z1];
    const bot0 = [x0, heightMm, zBase];
    const bot1 = [x1, heightMm, zBase];

    out += triFacet(bot0, top1, top0);
    out += triFacet(bot0, bot1, top1);
  }

  out += "endsolid relief\n";
  return out;
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/sla" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
