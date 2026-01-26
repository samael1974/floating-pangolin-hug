import * as THREE from "three";

export function applyCutoutToFlatGeometry(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  // Cutout disabilitato: per ora ritorna la geometria così com'è.
  return geo;
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// punti su griglia "mezzo pixel": (x2, y2) sono interi.
type P2 = { x2: number; y2: number };
type Seg2 = { a: P2; b: P2 };
type P = { x: number; y: number };

function key2(p: P2) {
  return `${p.x2},${p.y2}`;
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
    const xi = poly[i]!.x,
      yi = poly[i]!.y;
    const xj = poly[j]!.x,
      yj = poly[j]!.y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function stats01(arr: Float32Array) {
  let mn = Number.POSITIVE_INFINITY;
  let mx = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] ?? 0;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { min: mn, max: mx };
}

/**
 * Guard-rail: se il bordo è "inside" in modo significativo,
 * significa che la silhouette NON è separata (tipico delle foto),
 * quindi il cutout diventa spesso il rettangolo.
 *
 * Logica corretta:
 * - vogliamo che il bordo sia "quasi tutto fuori" => insideBorder/totalBorder < 5%
 * - se è così -> OK (background presente) => ritorna TRUE
 */
function borderLooksLikeBackground(hm: HeightmapState, th: number) {
  const { normF32, w, h } = hm;
  let insideBorder = 0;
  let totalBorder = 0;

  const isIn = (x: number, y: number) => (normF32[y * w + x] ?? 0) > th;

  // top + bottom
  for (let x = 0; x < w; x++) {
    totalBorder += 2;
    if (isIn(x, 0)) insideBorder++;
    if (isIn(x, h - 1)) insideBorder++;
  }
  // left + right (senza doppio conteggio angoli)
  for (let y = 1; y < h - 1; y++) {
    totalBorder += 2;
    if (isIn(0, y)) insideBorder++;
    if (isIn(w - 1, y)) insideBorder++;
  }

  const frac = totalBorder ? insideBorder / totalBorder : 1;

  // ✅ TRUE = il bordo sembra background (quasi tutto "fuori")
  return frac < 0.05;
}

/**
 * Marching Squares: segmenti in coordinate "mezzo pixel" (x2/y2 interi)
 * + stitching robusto.
 */
function extractLoopsPx(hm: HeightmapState, threshold: number): P2[][] {
  const { normF32, w, h } = hm;
  const th = clamp01(threshold);

  const bkgOk = borderLooksLikeBackground(hm, th);
  if (!bkgOk) {
    console.warn("[CUTOUT] Guard-rail: bordo NON sembra background → cutout SKIP", {
      w,
      h,
      threshold: th,
    });
    return [];
  }

  const v = (x: number, y: number) => clamp01(normF32[y * w + x] ?? 0);
  const inside = (x: number, y: number) => v(x, y) > th;

  // midpoints in x2/y2 (unità = mezzo pixel)
  const eTop = (x: number, y: number): P2 => ({ x2: 2 * x + 1, y2: 2 * y });
  const eRight = (x: number, y: number): P2 => ({ x2: 2 * (x + 1), y2: 2 * y + 1 });
  const eBottom = (x: number, y: number): P2 => ({ x2: 2 * x + 1, y2: 2 * (y + 1) });
  const eLeft = (x: number, y: number): P2 => ({ x2: 2 * x, y2: 2 * y + 1 });

  const segs: Seg2[] = [];

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = inside(x, y) ? 1 : 0;
      const b = inside(x + 1, y) ? 1 : 0;
      const c = inside(x + 1, y + 1) ? 1 : 0;
      const d = inside(x, y + 1) ? 1 : 0;
      const code = (a << 3) | (b << 2) | (c << 1) | d;

      if (code === 0 || code === 15) continue;

      const t = eTop(x, y);
      const r = eRight(x, y);
      const bt = eBottom(x, y);
      const l = eLeft(x, y);

      // Asymptotic decider per 5/10
      const center = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) * 0.25;
      const centerIn = center > th;

      switch (code) {
        case 1: segs.push({ a: l, b: bt }); break;
        case 2: segs.push({ a: bt, b: r }); break;
        case 3: segs.push({ a: l, b: r }); break;
        case 4: segs.push({ a: t, b: r }); break;

        case 5:
          if (centerIn) {
            segs.push({ a: t, b: r });
            segs.push({ a: l, b: bt });
          } else {
            segs.push({ a: t, b: l });
            segs.push({ a: bt, b: r });
          }
          break;

        case 6: segs.push({ a: t, b: bt }); break;
        case 7: segs.push({ a: t, b: l }); break;
        case 8: segs.push({ a: t, b: l }); break;
        case 9: segs.push({ a: t, b: bt }); break;

        case 10:
          if (centerIn) {
            segs.push({ a: t, b: l });
            segs.push({ a: bt, b: r });
          } else {
            segs.push({ a: t, b: r });
            segs.push({ a: l, b: bt });
          }
          break;

        case 11: segs.push({ a: t, b: r }); break;
        case 12: segs.push({ a: l, b: r }); break;
        case 13: segs.push({ a: bt, b: r }); break;
        case 14: segs.push({ a: l, b: bt }); break;
      }
    }
  }

  if (segs.length < 3) {
    console.warn("[CUTOUT] Nessun segmento (segs<3) → cutout SKIP");
    return [];
  }

  // adjacency
  const adj = new Map<string, P2[]>();
  const add = (p: P2, q: P2) => {
    const k = key2(p);
    const arr = adj.get(k) ?? [];
    arr.push(q);
    adj.set(k, arr);
  };
  for (const s of segs) {
    add(s.a, s.b);
    add(s.b, s.a);
  }

  const used = new Set<string>();
  const edgeKey = (p: P2, q: P2) => `${key2(p)}->${key2(q)}`;

  const loops: P2[][] = [];

  for (const [k0, neigh] of adj.entries()) {
    const [sx2, sy2] = k0.split(",").map((n) => Number(n));
    const start: P2 = { x2: sx2!, y2: sy2! };

    for (const n0 of neigh) {
      if (used.has(edgeKey(start, n0))) continue;

      const loop: P2[] = [];
      let prev: P2 | null = null;
      let cur: P2 = start;
      let nxt: P2 = n0;

      for (let safety = 0; safety < 200000; safety++) {
        used.add(edgeKey(cur, nxt));
        loop.push(cur);

        const options = adj.get(key2(nxt)) ?? [];
        if (options.length === 0) break;

        let nn = options[0]!;
        if (prev && options.length > 1) {
          const cand = options.find((p) => key2(p) !== key2(prev));
          if (cand) nn = cand;
        }

        prev = cur;
        cur = nxt;
        nxt = nn;

        if (loop.length > 6 && key2(cur) === key2(loop[0]!)) {
          loops.push(loop);
          break;
        }
      }
    }
  }

  const clean = loops.filter((L) => L.length >= 20);
  console.log("[CUTOUT] loops estratti", { segs: segs.length, loops: clean.length });

  return clean;
}

function buildShapeFromLoopsPx(
  hm: HeightmapState,
  widthMm: number,
  threshold: number
): THREE.Shape | null {
  const loops2 = extractLoopsPx(hm, threshold);
  if (loops2.length === 0) return null;

  // P2 -> P (px)
  const loopsPx: P[][] = loops2.map((L) => L.map((p) => ({ x: p.x2 / 2, y: p.y2 / 2 })));

  // outer = area abs max
  loopsPx.sort((A, B) => Math.abs(polygonArea(B)) - Math.abs(polygonArea(A)));
  const outer = loopsPx[0]!;
  const outerArea = polygonArea(outer);

  const holes: P[][] = [];
  for (let i = 1; i < loopsPx.length; i++) {
    const L = loopsPx[i]!;
    const probe = L[Math.floor(L.length / 2)]!;
    if (pointInPoly(probe, outer)) holes.push(L);
  }

  // coord mm centered come buildSolidFromHeightmap
  const { w, h } = hm;
  const heightMm = widthMm * (h / w);
  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);
  const x0 = -widthMm / 2;
  const y0 = heightMm / 2;

  const toMm = (p: P) => new THREE.Vector2(x0 + p.x * dx, y0 - p.y * dy);

  let outerMm = outer.map(toMm);
  if (outerArea < 0) outerMm = outerMm.reverse();

  const shape = new THREE.Shape(outerMm);

  for (const H of holes) {
    const a = polygonArea(H);
    let holeMm = H.map(toMm);
    if (a > 0) holeMm = holeMm.reverse();
    shape.holes.push(new THREE.Path(holeMm));
  }

  console.log("[CUTOUT] shape OK", { holes: shape.holes.length, threshold });

  return shape;
}

/**
 * CSG intersection: geom ∩ extruded(shape)
 * Solo per base flat.
 */
export function applyCutoutToFlatGeometry(args: Args): THREE.BufferGeometry {
  const { geom, hm, widthMm, depthMm, baseMm, threshold } = args;

  // DEBUG range hm
  const { min, max } = stats01(hm.normF32);
  console.log("[CUTOUT] start", { w: hm.w, h: hm.h, threshold, min, max, baseMm, depthMm });

  const shape = buildShapeFromLoopsPx(hm, widthMm, threshold);
  if (!shape) {
    console.warn("[CUTOUT] buildShapeFromLoopsPx() => null → cutout SKIP");
    return geom;
  }

  const zHeight = Math.max(5, baseMm + depthMm + 20);

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: zHeight,
    bevelEnabled: false,
    curveSegments: 8,
    steps: 1,
  });

  extrude.translate(0, 0, -10);

  // tre-bvh-csg: meglio non-indexed
  const aGeom = geom.index ? geom.toNonIndexed() : geom.clone();
  const bGeom = extrude.index ? extrude.toNonIndexed() : extrude;

  const modelMesh = new THREE.Mesh(aGeom, new THREE.MeshStandardMaterial());
  const cutterMesh = new THREE.Mesh(bGeom, new THREE.MeshStandardMaterial());

  const evaluator = new Evaluator();
  const A = new Brush(modelMesh);
  const B = new Brush(cutterMesh);

  console.time("[CUTOUT] CSG");
  const result = evaluator.evaluate(A, B, INTERSECTION);
  console.timeEnd("[CUTOUT] CSG");

  const out = result.geometry.clone();

  out.deleteAttribute("normal");
  out.computeVertexNormals();

  console.log("[CUTOUT] DONE", {
    pos: out.getAttribute("position")?.count ?? 0,
  });

  return out;
}
