import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Port 1420 : celui qu'attend Tauri (`devUrl` de tauri.conf.json).
 *
 * L'API est servie par `apps/server`, le serveur autonome embarqué en sidecar.
 * Le SPA ne connaît donc qu'une seule origine d'API, en dev comme en prod.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    // Doit rester aligné sur les `paths` de tsconfig.json : Vite résout les
    // imports, TypeScript ne fait que les typer.
    alias: {
      "@console/core": fileURLToPath(
        new URL("../../packages/console-core/src", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.CONSOLE_SERVER_PORT ?? 3170}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    // Tauri embarque le bundle : pas de sourcemaps en release.
    sourcemap: !!process.env.TAURI_DEBUG,
    //
    // Pas de `manualChunks` ici, et c'est délibéré.
    //
    // Le découpage vient uniquement des `import()` des écrans lourds
    // (route-tree.tsx et screens/dashboard.tsx) ; Rollup en déduit seul les
    // chunks `run-screen`, `activity-chart` et `missions-data-table`, et
    // l'entrée tombe de 484 à 185 ko gzip.
    //
    // Ajouter un `manualChunks` par-dessus a l'effet inverse de celui qu'on
    // attend : forcer `recharts` et `assistant-ui` dans des chunks nommés les
    // fait remonter en `modulepreload` dans index.html, donc chargés sur
    // *toutes* les routes — mesuré, 865 ko rapatriés sur `/agents`, qui n'en
    // utilise aucun. Si le sujet revient, vérifier `dist/index.html` : il ne
    // doit contenir aucun `rel="modulepreload"`.
  },
});
