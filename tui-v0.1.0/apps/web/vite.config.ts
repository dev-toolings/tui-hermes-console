import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Port du SPA : 1470, celui qu'attend Tauri (`devUrl` de tauri.conf.json) et
 * qu'annonce `CONSOLE_APP_ORIGIN`. Pas le 1420 par défaut de Tauri : il est déjà
 * pris par un autre projet local. `CONSOLE_WEB_PORT` (posé par le Makefile) le
 * surcharge — les trois autres doivent alors bouger ensemble.
 *
 * L'API est servie par `apps/server`, le serveur autonome embarqué en sidecar.
 * Le SPA ne connaît donc qu'une seule origine d'API, en dev comme en prod.
 */
const webPort = Number(process.env.CONSOLE_WEB_PORT ?? 1470);
const apiPort = Number(process.env.CONSOLE_SERVER_PORT ?? 3170);

/**
 * Hôte d'écoute du dev server, loopback par défaut, sur le même modèle que
 * `CONSOLE_WEB_PORT` : une seule variable, lue ici et exportée par l'appelant.
 *
 * `CONSOLE_WEB_HOST=0.0.0.0` ouvre le SPA au réseau local, pour le consulter
 * depuis un autre appareil. Ça reste un choix explicite et jamais le défaut :
 * ce serveur n'a ni TLS ni authentification propre, et l'API qu'il proxifie
 * doit alors être ouverte de la même façon (`CONSOLE_SERVER_HOST`) et connaître
 * l'origine LAN (`CONSOLE_DEV_LAN_ORIGIN`, voir apps/server/src/modules/api/origins.ts).
 */
const webHost = process.env.CONSOLE_WEB_HOST ?? "127.0.0.1";
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
    host: webHost,
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      "/docs/installation-utilisation.md": {
        target: `http://127.0.0.1:${apiPort}`,
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
