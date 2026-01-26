import * as THREE from "three";
import { Brush, Evaluator, INTERSECTION } from "three-bvh-csg";

export type HeightmapState = { normF32: Float32Array; w: number; h: number };

type Args = {
  geom: THREE.BufferGeometry;
  hm: HeightmapState;
  widthMm: number;
  depthMm: number;
  baseMm: number;
  threshold: number; // 0..1
};

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

type P = { x: number; y: number };
type Seg = { a: P; b: P };

function keyP(p: P) {
  return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
}

function polygonArea(pts: P[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function pointInPoly(pt: P, poly: P[]) {
  // ray casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, yi = poly[i]!.y;
    const xj = poly[j]!.x, yj = poly[j]!.y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Marching Squares -> segmenti del contorno in coordinate pixel.
 * Poi stitching -> loops chiusi.
 */
function extractLoopsPx(hm: HeightmapState, threshold: number): P[][] {
  const { normF32, w, h } = hm;
  const th = clamp01(threshold);

  const inside = (x: number, y: number) => (normF32[y * w + x] ?? 0) > th;
  const mid = (x: number, y: number, x2: number, y2: number): P => ({ x: (x + x2) / 2, y: (y + y2) / 2 });

  const segs: Seg[] = [];

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = inside(x, y) ? 1 : 0;
      const b = inside(x + 1, y) ? 1 : 0;
      const c = inside(x + 1, y + 1) ? 1 : 0;
      const d = inside(x, y + 1) ? 1 : 0;
      const code = (a << 3) | (b << 2) | (c << 1) | d;

      const e0 = mid(x, y, x + 1, y);         // top
      const e1 = mid(x + 1, y, x + 1, y + 1); // right
      const e2 = mid(x, y + 1, x + 1, y + 1); // bottom
      const e3 = mid(x, y, x, y + 1);         // left

      switch (code) {
        case 0:
        case 15:
          break;
        case 1:
          segs.push({ a: e3, b: e2 });
          break;
        case 2:
          segs.push({ a: e2, b: e1 });
          break;
        case 3:
          segs.push({ a: e3, b: e1 });
          break;
        case 4:
          segs.push({ a: e0, b: e1 });
          break;
        case 5:
          // ambiguità: due segmenti
          segs.push({ a: e0, b: e3 });
          segs.push({ a: e2, b: e1 });
          break;
        case 6:
          segs.push({ a: e0, b: e2 });
          break;
        case 7:
          segs.push({ a: e0, b: e3 });
          break;
        case 8:
          segs.push({ a: e0, b: e3 });
          break;
        case 9:
          segs.push({ a: e0, b: e2 });
          break;
        case 10:
          // ambiguità: due segmenti
          segs.push({ a: e0, b: e1 });
          segs.push({ a: e2, b: e3 });
          break;
        case 11:
          segs.push({ a: e0, b: e1 });
          break;
        case 12:
          segs.push({ a: e3, b: e1 });
          break;
        case 13:
          segs.push({ a: e2, b: e1 });
          break;
        case 14:
          segs.push({ a: e3, b: e2 });
          break;
      }
    }
  }

  if (segs.length < 3) return [];

  // adjacency
  const adj = new Map<string, P[]>();
  const add = (p: P, q: P) => {
    const k = keyP(p);
    const arr = adj.get(k) ?? [];
    arr.push(q);
    adj.set(k, arr);
  };
  for (const s of segs) {
    add(s.a, s.b);
    add(s.b, s.a);
  }

  const usedEdge = new Set<string>();
  const loops: P[][] = [];

  const edgeKey = (p: P, q: P) => `${keyP(p)}->${keyP(q)}`;

  for (const [k0, nxts0] of adj.entries()) {
    for (const n0 of nxts0) {
      const p0 = adj.get(k0) ? ({ x: Number(k0.split(",")[0]), y: Number(k0.split(",")[1]) } as P) : null;
      if (!p0) continue;
      if (usedEdge.has(edgeKey(p0, n0))) continue;

      const loop: P[] = [];
      let prev: P | null = null;
      let cur: P = p0;
      let nxt: P = n0;

      for (let safety = 0; safety < 200000; safety++) {
        usedEdge.add(edgeKey(cur, nxt));
        loop.push(cur);

        // advance
        const kc = keyP(nxt);
        const options = adj.get(kc) ?? [];
        if (options.length === 0) break;

        // choose next continuing (avoid going back)
        let nn = options[0]!;
        if (prev && options.length > 1) {
          const cand = options.find((p) => keyP(p) !== keyP(prev));
          if (cand) nn = cand;
        }

        prev = cur;
        cur = nxt;
        nxt = nn;

        // closed?
        if (loop.length > 3 && keyP(cur) === keyP(loop[0]!)) {
          loops.push(loop);
          break;
        }
      }
    }
  }

  // pulizia: rimuovi loops troppo piccoli
  return loops.filter((L) => L.length >= 10 && Math.abs(polygonArea(L)) > 5);
}

/**
 * Seleziona:
 * - outer: il loop con area assoluta maggiore
 * - holes: tutti i loops contenuti in outer (tipico O/A/R)
 */
function classifyOuterAndHoles(loops: P[]) {
  return loops;
}

function buildShapeFromLoopsPx(
  hm: HeightmapState,
  widthMm: number,
  threshold: number
): { shape: THREE.Shape; heightMm: number } | null {
  const loopsPx = extractLoopsPx(hm, threshold);
  if (loopsPx.length === 0) return null;

  // ordina per area assoluta decrescente: primo = outer
  loopsPx.sort((A, B) => Math.abs(polygonArea(B)) - Math.abs(polygonArea(A)));
  const outer = loopsPx[0]!;
  const outerArea = polygonArea(outer);

  // tutti i loops (tranne outer) che stanno dentro outer diventano holes
  const holes: P[][] = [];
  for (let i = 1; i < loopsPx.length; i++) {
    const L = loopsPx[i]!;
    // test: punto medio della loop dentro outer
    const probe = L[Math.floor(L.length / 2)]!;
    if (pointInPoly(probe, outer)) holes.push(L);
  }

  // coordinate mm, centered like buildSolidFromHeightmap
  const { w, h } = hm;
  const heightMm = widthMm * (h / w);
  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);
  const x0 = -widthMm / 2;
  const y0 = heightMm / 2;

  const toMm = (p: P) => new THREE.Vector2(x0 + p.x * dx, y0 - p.y * dy);

  // orientamento: Three.Shape vuole outer CCW e holes CW (tipico)
  const outerMm = outer.map(toMm);
  if (outerArea < 0) outerMm.reverse();

  const shape = new THREE.Shape(outerMm);

  for (const H of holes) {
    const a = polygonArea(H);
    const holeMm = H.map(toMm);
    // holes in senso opposto
    if (a > 0) holeMm.reverse();
    shape.holes.push(new THREE.Path(holeMm));
  }

  return { shape, heightMm };
}

/**
 * CSG intersection: geom ∩ extruded(shape with holes)
 * Solo per base flat.
 */
export function applyCutoutToFlatGeometry(args: Args): THREE.BufferGeometry {
  const { geom, hm, widthMm, depthMm, baseMm, threshold } = args;

  const built = buildShapeFromLoopsPx(hm, widthMm, threshold);
  if (!built) return geom;

  const { shape } = built;

  // Cutter: estrusione alta che copre tutto lo Z
  const zHeight = Math.max(2, baseMm + depthMm + 10);
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: zHeight,
    bevelEnabled: false,
    curveSegments: 8,
  });

  // porta il cutter a cavallo di z=0
  extrude.translate(0, 0, -5);

  const modelMesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial());
  const cutterMesh = new THREE.Mesh(extrude, new THREE.MeshStandardMaterial());

  const evaluator = new Evaluator();
  const a = new Brush(modelMesh);
  const b = new Brush(cutterMesh);

  const result = evaluator.evaluate(a, b, INTERSECTION);
  const out = result.geometry.clone();
  out.computeVertexNormals();
  return out;
}
