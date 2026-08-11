import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const buildId = new Date().toISOString();

const buildIdentity = (): Plugin => ({
  name: "hermes-build-identity",
  generateBundle(_options, bundle) {
    const assets = Object.keys(bundle)
      .filter((fileName) => fileName.startsWith("assets/"))
      .map((fileName) => `/${fileName}`);
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: JSON.stringify({ buildId }),
    });
    this.emitFile({
      type: "asset",
      fileName: "precache-manifest.json",
      source: JSON.stringify({ assets }),
    });
  },
});

export default defineConfig({
  define: {
    __HERMES_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react(), tailwindcss(), buildIdentity()],
});
