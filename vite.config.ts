import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import path from "path";

export default defineConfig(({ command, mode }) => {
  // ✅ Dyad tagger SOLO in produzione (build), NON in dev
  const enableDyadTagger = command === "build" || mode === "production";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), enableDyadTagger ? dyadComponentTagger() : null].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
