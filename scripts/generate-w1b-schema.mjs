import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const inventoryPath = "docs/migrations/W1A_SCHEMA_INVENTORY.json";
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const compat = readFileSync(
  "apps/api/src/persistence/postgres-compat.sql",
  "utf8",
)
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n");
export function translateChecks(sql) {
  return sql
    .replace(
      /json_extract\(([^,]+),\s*('[^']+')\)\s*(>=|<=|<>|>|<|=)\s*(\d+)/g,
      (_, doc, path, op, rhs) =>
        `sqlite_json_compare_number(${doc},${path},'${op}',${rhs})`,
    )
    .replace(/json_valid\(([^)]+)\)/g, "(sqlite_json_valid($1) = 1)")
    .replace(/(\w+) GLOB ('[^']+')/g, "sqlite_glob($1,$2)");
}
let sql = `-- Generated from approved W1A v27 inventory; regenerate with node scripts/generate-w1b-schema.mjs.\n-- SQLite nullable TEXT primary keys are UNIQUE here, preserving NULL semantics.\n-- 35 application tables. Allocator metadata lives in a separate internal schema.\nBEGIN;\nSELECT pg_advisory_xact_lock(170027,1);\nCREATE SCHEMA IF NOT EXISTS w1b_control;\nREVOKE ALL ON SCHEMA w1b_control FROM PUBLIC;\nCREATE TABLE IF NOT EXISTS w1b_control.queue_counters(schema_name text PRIMARY KEY,high_water bigint NOT NULL);\nCREATE SCHEMA looper_core;\nREVOKE ALL ON SCHEMA looper_core FROM PUBLIC;\nSET search_path TO looper_core,pg_catalog;\nINSERT INTO w1b_control.queue_counters VALUES ('looper_core',0);\n${compat}\n`;
for (const table of inventory.tables) {
  let ddl = table.sql
    .replace(/\bINTEGER\b/g, "bigint")
    .replace(/\bTEXT\b/g, 'text COLLATE "C"');
  for (const column of table.columns)
    if (column.pk && column.type === "TEXT" && !column.notnull)
      ddl = ddl.replace(
        new RegExp(`\\b${column.name} text COLLATE "C" PRIMARY KEY`),
        `${column.name} text COLLATE "C" UNIQUE`,
      );
  ddl = ddl.replace(
    "bigint PRIMARY KEY AUTOINCREMENT",
    "bigint DEFAULT next_queue_order() PRIMARY KEY",
  );
  ddl = ddl.replace(
    / REFERENCES \w+\(\w+\)(?: ON DELETE (?:CASCADE|SET NULL|NO ACTION|RESTRICT))?/g,
    "",
  );
  sql += translateChecks(ddl) + ";\n\n";
}
for (const table of inventory.tables) {
  for (const fk of table.foreignKeys)
    sql += `ALTER TABLE ${table.name} ADD FOREIGN KEY (${fk.from}) REFERENCES ${fk.table}(${fk.to}) ON UPDATE ${fk.on_update} ON DELETE ${fk.on_delete};\n`;
  for (const idx of table.indexes.filter((x) => x.sql))
    sql += translateChecks(idx.sql) + ";\n";
  for (const trigger of table.triggers) {
    const match =
      /CREATE TRIGGER (\w+)\s+BEFORE ([\s\S]+?) ON (\w+)\s+(?:WHEN ([\s\S]+?)\s+)?BEGIN\s+SELECT RAISE\(ABORT, '([^']+)'\);\s+END/.exec(
        trigger.sql,
      );
    if (!match) throw Error("Unmapped trigger: " + trigger.name);
    const [, name, event, on, when, message] = match;
    sql += `CREATE FUNCTION ${name}_fn() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  PERFORM pg_advisory_xact_lock(170027,1);\n  ${when ? `IF ${when} THEN ` : ""}RAISE EXCEPTION '${message}' USING ERRCODE='P0001';${when ? " END IF;" : ""}\n  RETURN NEW;\nEND $$;\nCREATE TRIGGER ${name} BEFORE ${event} ON ${on} FOR EACH ROW EXECUTE FUNCTION ${name}_fn();\n`;
  }
}
for (const migration of inventory.migrations)
  sql += `INSERT INTO schema_migrations VALUES (${migration.version},'${migration.name}',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));\n`;
sql += "COMMIT;\n";
writeFileSync("docs/migrations/W1B_POSTGRES_SCHEMA.sql", sql);
writeFileSync(
  "docs/migrations/W1B_SCHEMA_SOURCE.json",
  JSON.stringify(
    {
      approvedInventory: inventoryPath,
      inventorySha256: createHash("sha256")
        .update(
          readFileSync(inventoryPath, "utf8")
            .replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n"),
        )
        .digest("hex"),
      inventoryHashNormalization:
        "UTF8 with LF line endings and no BOM; stable across Git checkouts",
      tables: inventory.tables.length,
      columns: inventory.tables.reduce((n, t) => n + t.columns.length, 0),
      foreignKeys: inventory.tables.reduce(
        (n, t) => n + t.foreignKeys.length,
        0,
      ),
      checks: inventory.tables.reduce((n, t) => n + t.checks.length, 0),
      protections: inventory.tables.reduce((n, t) => n + t.triggers.length, 0),
    },
    null,
    2,
  ) + "\n",
);
console.log("Generated W1B v27 SQL from approved inventory");
