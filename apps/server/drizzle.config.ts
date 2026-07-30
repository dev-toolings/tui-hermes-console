import { defineConfig } from "drizzle-kit";

// Bun charge `.env` et `.env.local` du répertoire courant avant d'exécuter le
// script : lancé via `bun run db:generate` depuis `apps/server`, DATABASE_URL
// est déjà dans l'environnement.
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
