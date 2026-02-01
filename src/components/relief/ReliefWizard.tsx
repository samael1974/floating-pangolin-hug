 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/components/relief/ReliefWizard.tsx b/src/components/relief/ReliefWizard.tsx
index f7b8adb83469ddf16ae3311b2fc31f257e1acf9c..f08200b7159b3b1501f07afc01645c97436a4405 100644
--- a/src/components/relief/ReliefWizard.tsx
+++ b/src/components/relief/ReliefWizard.tsx
@@ -146,84 +146,87 @@ export default function ReliefWizard() {
   const dmCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
 
   // ✅ Nome file STL (personalizzabile)
   const [customName, setCustomName] = React.useState<string>("reliefforge");
 
   const [params, setParams] = React.useState<ReliefParams>(() => ({
     projectType: "logo_text",
     depthMm: 3,
     baseMm: 2,
     detail: 0.55,
     smooth: 0.15,
     edge: "sharp",
     outputMode: "relief",
     baseStyle: "flat", // "flat" | "recessed" | "offset"
     cutoutEnabled: false, // disattivato
   }));
 
   // ✅ Heightmap state/status
   const [hmState, setHmState] = React.useState<HeightmapState | null>(null);
   const [hmStatus, setHmStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
   const [fileWarning, setFileWarning] = React.useState<string | null>(null);
 
   // ✅ STL options
   const [stlWidthMm, setStlWidthMm] = React.useState<number>(120);
   const [decimateStep, setDecimateStep] = React.useState<number>(2);
+  const [qualityPreset, setQualityPreset] = React.useState<"lite" | "standard" | "ultra" | null>(null);
+  const [showDonationPrompt, setShowDonationPrompt] = React.useState(false);
 
   const canGenerate = !!file && hmStatus === "ready" && !!hmState;
 
     // ---------------------------
   // Step 2: Cornice + Passepartout (MVP)
   // ---------------------------
   const [matEnabled, setMatEnabled] = React.useState(false);
   const [frameEnabled, setFrameEnabled] = React.useState(false);
 
   const [matParams, setMatParams] = React.useState({
     steps: 3 as 1 | 2 | 3 | 4 | 5 | 6,
     totalBandsMm: 18,
     minBandMm: 6,
     thicknessMm: 2.4,
     stepDropMm: 1.2,
     matDropMm: 2.5,
     reliefGapMm: 0.35,
   });
 
   const [frameParams, setFrameParams] = React.useState({
     solidMm: 2.0,
     frameHeightMm: 18,
     glassMm: 2 as 2 | 3,
     glassClearanceMm: 0.25,
     pocketDepthMm: 3.6,
     lipMm: 3.0,
     pocketRadialMm: 3.0,
   });
 
 
   // ✅ preview url
   React.useEffect(() => {
     if (!file) {
       setPreviewUrl(null);
+      setShowDonationPrompt(false);
       return;
     }
     const url = URL.createObjectURL(file);
     setPreviewUrl(url);
     return () => URL.revokeObjectURL(url);
   }, [file]);
 
   // ✅ UX: quando carichi un file vai su "Immagine"
   React.useEffect(() => {
     if (file) setPreviewTab("image");
   }, [file]);
 
   // ✅ UX: quando hm pronta vai su "Dettagli"
   React.useEffect(() => {
     if (hmStatus === "ready") setPreviewTab("stl");
   }, [hmStatus]);
 
   // ✅ pipeline heightmap (image / depthmap 8-16bit)
   React.useEffect(() => {
     let cancelled = false;
 
     async function run() {
       if (!file) {
         setHmState(null);
         setHmStatus("idle");
@@ -404,314 +407,502 @@ export default function ReliefWizard() {
     return { effW, effH, triangles, mb, isHeavy, suggestedDecimate };
   }
 
   function downloadStl() {
     try {
       if (!hmState) {
         console.warn("Heightmap non pronta: hmState è null");
         alert("Heightmap non pronta. Carica un file e attendi il calcolo.");
         return;
       }
 
       const name = safeFileName(customName);
 
       // ✅ decimazione coerente con slider (export e preview allineati)
       const hmForExport = decimateStep > 1 ? decimateHm(hmState, decimateStep) : hmState;
 
       downloadReliefStlBinary({
         hm: hmForExport,
         widthMm: stlWidthMm,
         depthMm: params.depthMm,
         baseMm: params.baseMm,
         outputMode: params.outputMode,
         baseStyle: params.baseStyle,
         fileName: name,
       });
+      setShowDonationPrompt(true);
     } catch (e: any) {
       console.error("STL: ERROR", e);
       alert(`Errore export STL: ${e?.message ?? String(e)}`);
     }
   }
 
   const openInstructions = React.useCallback(() => {
     setShowInstructions(true);
     requestAnimationFrame(() => {
       document.getElementById("rf-instructions")?.scrollIntoView({
         behavior: "smooth",
         block: "start",
       });
     });
   }, []);
 
   return (
     <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
       {/* Hero / brand */}
       <div className="mb-6">
         <BrandHero />
       </div>
 
-      <div className="grid gap-6 md:grid-cols-[420px_1fr] lg:grid-cols-[460px_1fr]">
-        {/* LEFT */}
-        <div className="space-y-6">
-          {/* Source Mode */}
-          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow">
-            <div className="min-w-[220px]">
-              <div className="text-sm font-semibold">Sorgente</div>
-              <div className="text-xs text-gray-500">
-                Usa <span className="font-medium">Immagine</span> per risultati rapidi. Usa{" "}
-                <span className="font-medium">Depth map</span> se hai già una mappa di profondità (meglio PNG 16-bit).
-              </div>
-            </div>
-
+      <div className="sticky top-0 z-20 -mx-4 mb-4 border-y border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
+        <div className="flex flex-wrap items-center gap-3">
+          <div className="flex items-center gap-2">
+            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sorgente</span>
             <div className="inline-flex overflow-hidden rounded-md border">
               <button
                 type="button"
                 onClick={() => setSourceMode("image")}
-                className={`px-3 py-1.5 text-sm ${
+                className={`px-3 py-1.5 text-xs font-semibold ${
                   sourceMode === "image"
                     ? "bg-[#1F4E5F] text-white"
                     : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                 }`}
               >
                 Immagine
               </button>
 
               <button
                 type="button"
                 onClick={() => setSourceMode("depthmap")}
-                className={`px-3 py-1.5 text-sm ${
+                className={`px-3 py-1.5 text-xs font-semibold ${
                   sourceMode === "depthmap"
                     ? "bg-[#1F4E5F] text-white"
                     : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                 }`}
               >
-                Depth map (8/16-bit)
+                Depth map
               </button>
             </div>
+          </div>
 
-            {/* ✅ Invert sempre visibile */}
-            <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
-              <input
-                type="checkbox"
-                checked={invertDepthMap}
-                onChange={(e) => setInvertDepthMap(e.target.checked)}
-              />
-              <span>Inverti profondità</span>
-              <span className="text-xs text-gray-500">(se viene “al contrario”)</span>
-            </label>
+          <div className="flex items-center gap-2">
+            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Preset</span>
+            <div className="inline-flex overflow-hidden rounded-md border">
+              <button
+                type="button"
+                onClick={() =>
+                  setParams((p) => ({
+                    ...p,
+                    projectType: "logo_text",
+                    depthMm: 3.0,
+                    baseMm: 2.0,
+                    detail: 0.65,
+                    smooth: 0.12,
+                    edge: "sharp",
+                    outputMode: "relief",
+                    baseStyle: "flat",
+                  }))
+                }
+                className={`px-3 py-1.5 text-xs font-semibold ${
+                  params.projectType === "logo_text"
+                    ? "bg-[#1F4E5F] text-white"
+                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
+                }`}
+              >
+                Logo
+              </button>
+
+              <button
+                type="button"
+                onClick={() =>
+                  setParams((p) => ({
+                    ...p,
+                    projectType: "human_face",
+                    depthMm: 4.0,
+                    baseMm: 2.0,
+                    detail: 0.55,
+                    smooth: 0.28,
+                    edge: "round",
+                    outputMode: "relief",
+                    baseStyle: "flat",
+                  }))
+                }
+                className={`px-3 py-1.5 text-xs font-semibold ${
+                  params.projectType === "human_face"
+                    ? "bg-[#1F4E5F] text-white"
+                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
+                }`}
+              >
+                Volto
+              </button>
+
+              <button
+                type="button"
+                onClick={() =>
+                  setParams((p) => ({
+                    ...p,
+                    projectType: "nature_landscape",
+                    depthMm: 5.0,
+                    baseMm: 2.0,
+                    detail: 0.58,
+                    smooth: 0.2,
+                    edge: "round",
+                    outputMode: "relief",
+                    baseStyle: "flat",
+                  }))
+                }
+                className={`px-3 py-1.5 text-xs font-semibold ${
+                  params.projectType === "nature_landscape"
+                    ? "bg-[#1F4E5F] text-white"
+                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
+                }`}
+              >
+                Paesaggio
+              </button>
+            </div>
+          </div>
+
+          <div className="flex items-center gap-2">
+            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Base</span>
+            <div className="inline-flex overflow-hidden rounded-md border">
+              {(["flat", "recessed", "offset"] as const).map((style) => (
+                <button
+                  key={style}
+                  type="button"
+                  onClick={() => setParams((p) => ({ ...p, baseStyle: style }))}
+                  className={`px-3 py-1.5 text-xs font-semibold capitalize ${
+                    params.baseStyle === style
+                      ? "bg-[#1F4E5F] text-white"
+                      : "bg-white text-[#1F4E5F] hover:bg-gray-50"
+                  }`}
+                >
+                  {style === "flat" ? "Flat" : style === "recessed" ? "Recessed" : "Offset"}
+                </button>
+              ))}
+            </div>
+          </div>
+
+          <div className="flex items-center gap-2">
+            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Qualità</span>
+            <div className="inline-flex overflow-hidden rounded-md border">
+              <button
+                type="button"
+                onClick={() => {
+                  setQualityPreset("lite");
+                  setDecimateStep(4);
+                  setStlWidthMm(120);
+                  setParams((p) => ({ ...p, detail: 0.5 }));
+                }}
+                className={`px-3 py-1.5 text-xs font-semibold ${
+                  qualityPreset === "lite"
+                    ? "bg-[#1F4E5F] text-white"
+                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
+                }`}
+              >
+                Lite
+              </button>
+              <button
+                type="button"
+                onClick={() => {
+                  setQualityPreset("standard");
+                  setDecimateStep(2);
+                  setStlWidthMm(120);
+                  setParams((p) => ({ ...p, detail: 0.6 }));
+                }}
+                className={`px-3 py-1.5 text-xs font-semibold ${
+                  qualityPreset === "standard"
+                    ? "bg-[#1F4E5F] text-white"
+                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
+                }`}
+              >
+                Std
+              </button>
+              <button
+                type="button"
+                onClick={() => {
+                  setQualityPreset("ultra");
+                  setDecimateStep(1);
+                  setStlWidthMm(200);
+                  setParams((p) => ({ ...p, detail: 0.75 }));
+                }}
+                className={`px-3 py-1.5 text-xs font-semibold ${
+                  qualityPreset === "ultra"
+                    ? "bg-[#1F4E5F] text-white"
+                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
+                }`}
+              >
+                Ultra
+              </button>
+            </div>
+          </div>
+
+          <div className="ml-auto flex flex-wrap items-center gap-2">
+            <button
+              type="button"
+              onClick={() => setShowInstructions((v) => !v)}
+              className="rounded-md border px-3 py-1.5 text-xs font-semibold text-[#1F4E5F] hover:bg-gray-50"
+            >
+              {showInstructions ? "Chiudi istruzioni" : "Istruzioni"}
+            </button>
+            <button
+              type="button"
+              onClick={downloadStl}
+              disabled={!canGenerate}
+              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
+                canGenerate ? "bg-[#E26D5C] text-white hover:bg-[#d85f50]" : "cursor-not-allowed bg-gray-200 text-gray-500"
+              }`}
+            >
+              Scarica STL
+            </button>
           </div>
+        </div>
+      </div>
 
+      <div className="grid gap-6 md:grid-cols-[420px_1fr] lg:grid-cols-[460px_1fr]">
+        {/* LEFT */}
+        <div className="space-y-6">
           {/* Upload */}
           <div className="space-y-3 rounded-lg bg-white p-4 shadow">
             <div className="flex items-center justify-between gap-3">
               <div>
                 <div className="text-sm font-semibold">1) Carica un file</div>
                 <div className="text-xs text-gray-500">
                   <p>
                     JPG/JPEG/PNG/WEBP. Per Depth map:{" "}
                     <span className="font-medium">PNG 16-bit in scala di grigi</span> consigliato.
                   </p>
                   <p className="mt-1">
                     <button
                       type="button"
                       onClick={openInstructions}
                       className="underline underline-offset-4 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                     >
                       Non sai come ottenerlo? Apri Istruzioni → Depth map
                     </button>
                   </p>
                 </div>
               </div>
 
               {file && (
                 <button
                   type="button"
                   onClick={() => setFile(null)}
                   className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                 >
                   Rimuovi
                 </button>
               )}
             </div>
 
             <input
               type="file"
               accept="image/*"
               onChange={(e) => setFile(e.target.files?.[0] ?? null)}
               className="block w-full text-sm"
             />
 
+            <label className="flex items-center gap-2 text-sm text-gray-700">
+              <input
+                type="checkbox"
+                checked={invertDepthMap}
+                onChange={(e) => setInvertDepthMap(e.target.checked)}
+              />
+              <span>Inverti profondità</span>
+              <span className="text-xs text-gray-500">(se viene “al contrario”)</span>
+            </label>
+
             {/* Warning compatibilità depth map */}
             {fileWarning && (
               <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                 <div className="text-xs font-semibold">⚠️ Attenzione</div>
                 <div className="mt-1 whitespace-pre-line text-xs leading-snug">{fileWarning}</div>
 
                 <div className="mt-3 flex flex-wrap gap-2">
                   <button
                     type="button"
                     onClick={openInstructions}
                     className="rounded-md bg-[#1F4E5F] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                   >
                     📌 Apri istruzioni
                   </button>
 
                   <button
                     type="button"
                     onClick={() => setSourceMode("image")}
                     className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                   >
                     🖼 Passa a modalità Immagine
                   </button>
                 </div>
               </div>
             )}
 
             {file && (
               <div className="text-xs text-gray-600">
                 <div className="font-medium">File:</div>
                 <div className="break-all">{file.name}</div>
                 <div className="mt-1">
                   Stato heightmap:{" "}
                   <span
                     className={`font-medium ${
                       hmStatus === "ready"
                         ? "text-green-700"
                         : hmStatus === "loading"
                         ? "text-amber-700"
                         : hmStatus === "error"
                         ? "text-red-700"
                         : "text-gray-600"
                     }`}
                   >
                     {hmStatus}
                   </span>
                 </div>
               </div>
             )}
           </div>
 
-          {/* Params */}
-<div className="space-y-3 rounded-lg bg-white p-4 shadow">
-  <div>
-    <div className="text-sm font-semibold">2) Parametri bassorilievo</div>
-    <div className="text-xs text-gray-500">
-      I parametri restano attivi anche in modalità Depth map.{" "}
-      <span className="font-medium">Nota:</span> lo STL esportato è sempre{" "}
-      <span className="font-medium">chiuso (manifold)</span>, quindi serve uno{" "}
-      <span className="font-medium">spessore minimo</span>: non è possibile esportare
-      “solo superficie” con base = 0. Se vuoi un risultato molto sottile, imposta una base
-      piccola (es. <span className="font-medium">0.4–1.0 mm</span>).
-    </div>
-  </div>
+          {/* Quick presets */}
+          <div className="space-y-3 rounded-lg bg-white p-4 shadow">
+            <div>
+              <div className="text-sm font-semibold">2) Quick Presets</div>
+              <div className="text-xs text-gray-500">
+                1 click per partire bene: qualità, dimensione e base già impostate.
+              </div>
+            </div>
 
-            {/* Preset rapidi */}
-            <div className="flex flex-wrap gap-2 pt-2">
+            <div className="flex flex-wrap gap-2">
               <button
                 type="button"
-                disabled={!file}
                 onClick={() => {
-                  setParams((p) => ({
-                    ...p,
-                    projectType: "logo_text",
-                    depthMm: 3.0,
-                    baseMm: 2.0,
-                    detail: 0.65,
-                    smooth: 0.12,
-                    edge: "sharp",
-                    outputMode: "relief",
-                    baseStyle: "flat",
-                  }));
-                  setDecimateStep(2);
+                  setQualityPreset("lite");
+                  setDecimateStep(4);
+                  setStlWidthMm(120);
+                  setParams((p) => ({ ...p, detail: 0.5 }));
                 }}
                 className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
-                  file ? "text-[#1F4E5F] hover:bg-gray-50" : "cursor-not-allowed text-gray-400"
+                  qualityPreset === "lite" ? "border-[#1F4E5F] text-[#1F4E5F]" : "text-gray-700 hover:bg-gray-50"
                 }`}
               >
-                Preset: Logo/Testo
+                Lite (STL leggero)
               </button>
-
               <button
                 type="button"
-                disabled={!file}
                 onClick={() => {
-                  setParams((p) => ({
-                    ...p,
-                    projectType: "human_face",
-                    depthMm: 4.0,
-                    baseMm: 2.0,
-                    detail: 0.55,
-                    smooth: 0.28,
-                    edge: "round",
-                    outputMode: "relief",
-                    baseStyle: "flat",
-                  }));
+                  setQualityPreset("standard");
                   setDecimateStep(2);
+                  setStlWidthMm(120);
+                  setParams((p) => ({ ...p, detail: 0.6 }));
                 }}
                 className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
-                  file ? "text-[#1F4E5F] hover:bg-gray-50" : "cursor-not-allowed text-gray-400"
+                  qualityPreset === "standard" ? "border-[#1F4E5F] text-[#1F4E5F]" : "text-gray-700 hover:bg-gray-50"
                 }`}
               >
-                Preset: Volto
+                Standard (bilanciato)
               </button>
-
               <button
                 type="button"
-                disabled={!file}
                 onClick={() => {
-                  setParams((p) => ({
-                    ...p,
-                    projectType: "nature_landscape",
-                    depthMm: 5.0,
-                    baseMm: 2.0,
-                    detail: 0.58,
-                    smooth: 0.2,
-                    edge: "round",
-                    outputMode: "relief",
-                    baseStyle: "flat",
-                  }));
-                  setDecimateStep(3);
+                  setQualityPreset("ultra");
+                  setDecimateStep(1);
+                  setStlWidthMm(200);
+                  setParams((p) => ({ ...p, detail: 0.75 }));
                 }}
                 className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
-                  file ? "text-[#1F4E5F] hover:bg-gray-50" : "cursor-not-allowed text-gray-400"
+                  qualityPreset === "ultra" ? "border-[#1F4E5F] text-[#1F4E5F]" : "text-gray-700 hover:bg-gray-50"
                 }`}
               >
-                Preset: Paesaggio
+                Ultra (max dettaglio)
               </button>
+            </div>
+
+            <div className="space-y-2">
+              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Size</div>
+              <div className="flex flex-wrap gap-2">
+                {[60, 120, 200].map((size) => (
+                  <button
+                    key={size}
+                    type="button"
+                    onClick={() => setStlWidthMm(size)}
+                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
+                      Math.round(stlWidthMm) === size
+                        ? "border-[#1F4E5F] bg-[#1F4E5F]/10 text-[#1F4E5F]"
+                        : "text-gray-700 hover:bg-gray-50"
+                    }`}
+                  >
+                    {size} mm
+                  </button>
+                ))}
+              </div>
+            </div>
 
-              <div className="self-center text-[11px] text-gray-500">1 click per partire bene, poi rifinisci sotto.</div>
+            <div className="space-y-2">
+              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Base</div>
+              <div className="flex flex-wrap gap-2">
+                {[0, 1, 2].map((base) => (
+                  <button
+                    key={base}
+                    type="button"
+                    onClick={() => setParams((p) => ({ ...p, baseMm: base }))}
+                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
+                      Math.abs(params.baseMm - base) < 0.01
+                        ? "border-[#1F4E5F] bg-[#1F4E5F]/10 text-[#1F4E5F]"
+                        : "text-gray-700 hover:bg-gray-50"
+                    }`}
+                  >
+                    {base} mm
+                  </button>
+                ))}
+              </div>
+              <p className="text-[11px] text-gray-500">
+                Base 0 = solo rilievo. Se vuoi uno STL chiuso, usa almeno 0.4–1 mm.
+              </p>
+            </div>
+          </div>
+
+          {/* Params */}
+          <div className="space-y-3 rounded-lg bg-white p-4 shadow">
+            <div>
+              <div className="text-sm font-semibold">3) Parametri bassorilievo</div>
+              <div className="text-xs text-gray-500">
+                I parametri restano attivi anche in modalità Depth map.{" "}
+                <span className="font-medium">Nota:</span> lo STL esportato è sempre{" "}
+                <span className="font-medium">chiuso (manifold)</span>, quindi serve uno{" "}
+                <span className="font-medium">spessore minimo</span>: non è possibile esportare
+                “solo superficie” con base = 0. Se vuoi un risultato molto sottile, imposta una base
+                piccola (es. <span className="font-medium">0.4–1.0 mm</span>).
+              </div>
             </div>
 
             <div className="pt-2">
               <ReliefControls value={params} onChange={setParams} disabled={!file} />
             </div>
           </div>
 
           {/* STL Options */}
           <div className="space-y-4 rounded-lg bg-white p-4 shadow">
             <div>
-              <div className="text-sm font-semibold">3) Genera STL</div>
+              <div className="text-sm font-semibold">4) Genera STL</div>
               <div className="text-xs text-gray-500">STL binario chiuso (stampabile).</div>
             </div>
 
             {/* Nome file */}
             <div className="space-y-2">
               <div className="flex items-center justify-between text-sm">
                 <span className="font-medium">Nome file STL</span>
                 <span className="text-xs text-gray-500">.stl</span>
               </div>
               <input
                 type="text"
                 value={customName}
                 onChange={(e) => setCustomName(e.target.value)}
                 placeholder="es. logo_giovanni_v1"
                 className="w-full rounded-md border px-3 py-2 text-sm"
                 disabled={!file}
               />
               <div className="text-xs text-gray-500">Se vuoto, userò un nome di default.</div>
             </div>
 
             <div className="space-y-2">
               <div className="flex items-center justify-between text-sm">
                 <span className="font-medium">Larghezza STL (mm)</span>
                 <span className="tabular-nums text-gray-700">{Math.round(stlWidthMm)} mm</span>
               </div>
@@ -736,59 +927,66 @@ export default function ReliefWizard() {
                 type="range"
                 min={1}
                 max={6}
                 step={1}
                 value={decimateStep}
                 onChange={(e) => setDecimateStep(Number(e.target.value))}
                 className="w-full"
                 disabled={!file}
               />
               <div className="text-xs text-gray-500">
                 Suggerimento: x2–x3 è un buon compromesso. Più alto = più leggero, meno dettaglio.
               </div>
             </div>
 
             <div className="flex flex-col gap-2 pt-2">
               <button
                 type="button"
                 onClick={downloadStl}
                 disabled={!canGenerate}
                 className={`rounded-md px-4 py-2 text-sm font-semibold ${
                   canGenerate ? "bg-[#E26D5C] text-white hover:bg-[#d85f50]" : "cursor-not-allowed bg-gray-200 text-gray-500"
                 }`}
               >
                 Scarica STL
               </button>
-
-              <a
-                href="https://www.paypal.me/federicocordioli72"
-                target="_blank"
-                rel="noreferrer"
-                className="rounded-md border px-4 py-2 text-center text-sm hover:bg-gray-50"
-              >
-                Dona su PayPal
-              </a>
+              {showDonationPrompt && (
+                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
+                  <div className="font-semibold">Ti ha evitato Blender o booleane?</div>
+                  <div className="mt-1">
+                    Offrimi un caffè: anche 1–2€ fanno la differenza.{" "}
+                    <a
+                      href="https://www.paypal.me/federicocordioli72"
+                      target="_blank"
+                      rel="noreferrer"
+                      className="font-semibold underline underline-offset-2"
+                    >
+                      Supporta su PayPal
+                    </a>
+                  </div>
+                </div>
+              )}
             </div>
           </div>
         </div>
 
         {/* RIGHT */}
         <div className="self-start md:sticky md:top-4">
           <div className="space-y-4 rounded-lg bg-white p-4 shadow">
             <div className="flex items-center justify-between gap-3">
               <div>
                 <div className="text-sm font-semibold">Anteprime</div>
                 <div className="text-xs text-gray-500">Il 3D resta visibile mentre modifichi i parametri.</div>
               </div>
 
               <div className="text-xs">
                 {hmStatus === "ready" ? (
                   <span className="rounded-full bg-green-100 px-2 py-1 font-medium text-green-800">Heightmap pronta</span>
                 ) : hmStatus === "loading" ? (
                   <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">Calcolo…</span>
                 ) : hmStatus === "error" ? (
                   <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-800">Errore</span>
                 ) : (
                   <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">In attesa</span>
                 )}
               </div>
             </div>
@@ -900,51 +1098,51 @@ export default function ReliefWizard() {
                       <div className="font-semibold text-gray-900">1) Scegli la sorgente</div>
                       <ul className="mt-2 list-disc space-y-1 pl-4">
                         <li>
                           <span className="font-semibold">Immagine</span>: consigliata per iniziare (più tollerante).
                         </li>
                         <li>
                           <span className="font-semibold">Depth map</span>: usala se hai già una mappa di profondità (più controllo).
                         </li>
                       </ul>
 
                       <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                         <div className="font-semibold">Depth map: formato consigliato</div>
                         <div className="mt-1">
                           PNG <span className="font-semibold">grayscale</span> <span className="font-semibold">16-bit</span>. Evita 32-bit/float/HDR o PNG RGB.
                         </div>
                       </div>
                     </div>
 
                     <div className="rounded-md border bg-gray-50 p-3">
                       <div className="font-semibold text-gray-900">2) Regola i parametri</div>
                       <ul className="mt-2 list-disc space-y-1 pl-4">
                         <li>
                           <span className="font-semibold">Altezza rilievo</span>: quanto “sporge” il bassorilievo (mm).
                         </li>
                         <li>
-                          <span className="font-semibold">Spessore base</span>: imposta <span className="font-semibold">0</span> se vuoi solo il modello.
+                          <span className="font-semibold">Spessore base</span>: tienilo basso (0.4–1 mm) se vuoi un rilievo molto sottile.
                         </li>
                         <li>
                           <span className="font-semibold">Decimazione</span>: x2–x3 consigliato.
                         </li>
                       </ul>
 
                       <div className="mt-3 rounded-md border border-gray-200 bg-white p-2">
                         <div className="font-semibold">Tip rapido</div>
                         <div className="mt-1">
                           Se il rilievo viene “al contrario”, attiva <span className="font-semibold">Inverti profondità</span>.
                         </div>
                       </div>
                     </div>
                   </div>
 
                   <div className="mt-3 rounded-md border bg-white p-3">
                     <div className="font-semibold text-gray-900">3) Scarica lo STL</div>
                     <div className="mt-1">
                       Premi <span className="font-semibold">Scarica STL</span>: otterrai uno STL <span className="font-semibold">chiuso (manifold)</span>.
                     </div>
 
                     <div className="mt-2 flex flex-wrap gap-2">
                       <a
                         href="https://chatgpt.com/g/g-69416cfae0f881918529c92c5f1e0ce9-depth-map-generator-v2"
                         target="_blank"
 
EOF
)