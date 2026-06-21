// src/App.tsx
import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Index";
import NotFound from "./pages/NotFound";

// Code-splitting: le pagine pesanti (three.js, transformers/onnx)
// vengono caricate solo quando l'utente apre la rotta corrispondente.
const Relief = lazy(() => import("./pages/Relief"));
const Depth = lazy(() => import("./pages/Depth"));

const App = () => {
  return (
    <Router>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-slate-500">
            Caricamento…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/relief" element={<Relief />} />
          <Route path="/depth" element={<Depth />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
};

export default App;
