import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seedConfiguration } from "../database.js";
import type { PostgresDatabase } from "./postgres.js";
/** Explicit isolated bootstrap only; a connection never seeds demo accounts. */
export function bootstrapPostgres(
  database: PostgresDatabase,
  schema = "looper_core",
  reset = false,
): void {
  if (!/^(looper_core|w1b_[a-z0-9_]+)$/.test(schema))
    throw new Error("Unsafe isolated schema name");
  if (reset) {
    database.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const control = database
      .prepare("SELECT 1 FROM pg_namespace WHERE nspname='w1b_control'")
      .get();
    if (control)
      database
        .prepare("DELETE FROM w1b_control.queue_counters WHERE schema_name=?")
        .run(schema);
  }
  const artifact = fileURLToPath(
    new URL(
      "../../../../docs/migrations/W1B_POSTGRES_SCHEMA.sql",
      import.meta.url,
    ),
  );
  database.exec(
    readFileSync(artifact, "utf8").replaceAll("looper_core", schema),
  );
  database.exec("BEGIN IMMEDIATE");
  try {
    seedConfiguration(database);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
