import { DatabaseSync } from "node:sqlite";
import { configureDatabase, migrateDatabase } from "./database.js";
import { migrateMerchantGoogle } from "./merchant-google-schema.js";
// Explicit local SQLite command. No cloud connection or demo seeding.
if (!process.env.LOOPER_DATABASE_PATH)
  throw new Error("Set an explicit LOOPER_DATABASE_PATH before migration");
const db = new DatabaseSync(process.env.LOOPER_DATABASE_PATH);
try {
  configureDatabase(db);
  migrateDatabase(db);
  migrateMerchantGoogle(db, "sqlite");
  console.log("Merchant Google opt-in migration 28 complete");
} finally {
  db.close();
}
