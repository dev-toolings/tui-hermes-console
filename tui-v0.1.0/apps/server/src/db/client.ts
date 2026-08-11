import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalDatabase = globalThis as typeof globalThis & {
  hermesConsoleDb?: Database;
  hermesConsoleSql?: ReturnType<typeof postgres>;
};

export function getDatabase(): Database {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_MISSING");
  }

  if (!globalDatabase.hermesConsoleSql) {
    globalDatabase.hermesConsoleSql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }

  globalDatabase.hermesConsoleDb ??= drizzle(globalDatabase.hermesConsoleSql, { schema });
  return globalDatabase.hermesConsoleDb;
}
