import {
  loadProductionDatabaseConfig,
  migrateProductionDatabase,
} from "../src/db/production-migration";

await migrateProductionDatabase(loadProductionDatabaseConfig());
