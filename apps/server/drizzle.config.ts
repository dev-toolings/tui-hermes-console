import { defineConfig } from "drizzle-kit";

// Les scripts du workspace chargent explicitement `apps/server/.env.local`
// avant d'entrer dans le filtre `server`. Sans cela, Bun résout l'environnement
// depuis la racine du monorepo avant de changer le répertoire du package.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run Drizzle commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
