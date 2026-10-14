import { DatabaseSync } from "node:sqlite";
import { configureDatabase, migrateDatabase } from "./database.js";
import { migrateMerchantGoogle } from "./merchant-google-schema.js";
import { migrateMerchantStaff } from "./merchant-staff-schema.js";
if (!process.env.LOOPER_DATABASE_PATH)
  throw Error(
    "Explicit LOOPER_DATABASE_PATH required; no automatic database selection",
  );
const db = new DatabaseSync(process.env.LOOPER_DATABASE_PATH);
try {
  configureDatabase(db);
  migrateDatabase(db);
  migrateMerchantGoogle(db, "sqlite");
  migrateMerchantStaff(db);
  console.log("Explicit LINE staff schema 29 complete; login flags unchanged");
} finally {
  db.close();
}
