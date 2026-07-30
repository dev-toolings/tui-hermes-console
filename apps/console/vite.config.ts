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
  },
});
