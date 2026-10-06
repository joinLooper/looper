import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  openDatabase,
  migrateDatabase,
  seedDatabase,
  MIGRATIONS,
} from "../apps/api/src/database.ts";

// Inspection creates only an isolated :memory: database using the unchanged authority.
// Never accepts a database path; no production data or secrets are read.
const root = resolve(import.meta.dirname, "..");
const sourceHead = "425ab07be751824e590587d89434c09e52558412";
const target = resolve(root, "docs/migrations/W1A_SCHEMA_INVENTORY.json");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const walk = (dir) =>
  readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
function checks(sql) {
  const out = [];
  for (const match of sql.matchAll(/\bCHECK\s*\(/gi)) {
    let depth = 1,
      quoted = false,
      i = match.index + match[0].length,
      start = i;
    for (; i < sql.length; i++) {
      if (sql[i] === "'") {
        if (quoted && sql[i + 1] === "'") {
          i++;
          continue;
        }
        quoted = !quoted;
      }
      if (!quoted) {
        if (sql[i] === "(") depth++;
        if (sql[i] === ")" && --depth === 0) break;
      }
    }
    out.push(sql.slice(start, i).trim());
  }
  return out;
}
const domains = {
  configuration: [
    "schema_migrations",
    "economy_settings",
    "level_definitions",
    "merchant_plan_definitions",
    "diamond_recipe_definitions",
  ],
  identity: [
    "accounts",
    "users",
    "account_external_identities",
    "account_sessions",
    "account_invitations",
    "platform_operator_memberships",
    "merchant_operator_memberships",
  ],
  player: ["user_resources"],
  growth: ["user_growth_balances", "plant_growth_logs"],
  merchant: ["merchant_applications", "merchant_brands", "merchants"],
  mission: [
    "missions",
    "mission_enrollments",
    "task_code_windows",
    "task_code_submissions",
  ],
  economy: [
    "reward_events",
    "resource_transactions",
    "redemptions",
    "energy_logs",
    "level_up_logs",
  ],
  content: [
    "knowledge_card_attempts",
    "resident_mission_instances",
    "resident_mission_claim_requests",
    "player_event_queue",
  ],
  governance: [
    "audit_events",
    "task_code_submission_scope_snapshots",
    "platform_operator_status_transitions",
    "platform_operator_role_transitions",
  ],
};
const immutable = new Set([
  "knowledge_card_attempts",
  "task_code_submission_scope_snapshots",
  "platform_operator_status_transitions",
  "platform_operator_role_transitions",
]);
const appendOnly = new Set([
  "reward_events",
  "resource_transactions",
  "redemptions",
  "plant_growth_logs",
  "energy_logs",
  "level_up_logs",
  "audit_events",
]);
const db = openDatabase(":memory:");
try {
  const objects = db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type,name",
    )
    .all();
  const tables = objects
    .filter((o) => o.type === "table" && !o.name.startsWith("sqlite_"))
    .map((o) => {
      const columns = db
        .prepare(`PRAGMA table_xinfo(${quote(o.name)})`)
        .all()
        .map((c) => {
          const json = c.name.endsWith("_json");
          const timestamp = /(?:_at|valid_from|valid_until)$/.test(c.name);
          const bool = [
            "reduced_motion",
            "can_redeem",
            "enabled",
            "is_correct",
          ].includes(c.name);
          const integer = c.type.toUpperCase() === "INTEGER";
          return {
            ...c,
            postgres: {
              type: integer ? (bool ? "smallint" : "bigint") : "text",
              rationale: json
                ? "Preserve original JSON bytes and existing string serializers; per-column validation/query policy in parity map."
                : timestamp
                  ? "Preserve exact historical timestamp lexeme and existing JS time authority; do not auto-convert to timestamptz."
                  : bool
                    ? "Preserve 0/1 (and NULL where allowed), keep current CHECK; no boolean/string adapter drift."
                    : integer
                      ? "Preserve SQLite signed-64-bit range; explicit safe-number adapter required for JS business/API values."
                      : "Preserve text identifiers/enums/strings, with binary-equivalent C collation for equality/order.",
              nullability:
                c.notnull === 1
                  ? "NOT NULL"
                  : c.pk && integer
                    ? "NOT NULL (SQLite INTEGER PRIMARY KEY rowid alias)"
                    : c.pk
                      ? "SQLite TEXT PRIMARY KEY may admit NULL; PG PK needs preflight or explicit exception decision"
                      : "NULL allowed",
              default: c.dflt_value,
              json,
              timestamp,
              booleanRepresentation: bool,
              identity:
                o.name === "player_event_queue" && c.name === "queue_order"
                  ? "bigint PK plus transactional high-water allocator; preserve sqlite_sequence high-water and rollback semantics; no unreviewed native identity substitution"
                  : null,
            },
          };
        });
      const indexes = db
        .prepare(`PRAGMA index_list(${quote(o.name)})`)
        .all()
        .map((i) => ({
          ...i,
          columns: db.prepare(`PRAGMA index_xinfo(${quote(i.name)})`).all(),
          sql: objects.find((x) => x.name === i.name)?.sql ?? null,
          postgres:
            "Recreate ordered key columns, uniqueness and exact partial predicate; SQLite BINARY -> PostgreSQL C; SQLite DESC NULL-last / ASC NULL-first explicitly where nullable.",
        }));
      const triggers = objects.filter(
        (x) => x.type === "trigger" && x.tbl_name === o.name,
      );
      return {
        name: o.name,
        domain:
          Object.entries(domains).find(([, names]) =>
            names.includes(o.name),
          )?.[0] ?? "UNCLASSIFIED",
        sql: o.sql,
        columns,
        primaryKey: columns
          .filter((c) => c.pk)
          .sort((a, b) => a.pk - b.pk)
          .map((c) => c.name),
        foreignKeys: db
          .prepare(`PRAGMA foreign_key_list(${quote(o.name)})`)
          .all(),
        checks: checks(o.sql),
        checkMappings: checks(o.sql).map((predicate) => ({
          sqlite: predicate,
          postgres: predicate.includes("json_")
            ? "text storage plus exact JSON validation/extraction compatibility helper; preserve missing/null/coercion semantics"
            : predicate.includes("GLOB")
              ? "ASCII shape regex plus exact length, not calendar-valid date conversion"
              : "Preserve same boolean predicate and SQL NULL CHECK-pass semantics; bigint/smallint/text columns; preserve trim/length codepoint semantics",
        })),
        uniqueConstraints: indexes.filter((i) => i.origin === "u"),
        indexes,
        triggers,
        recordPolicy:
          o.name === "redemptions"
            ? "INSERT then reward_event_id UPDATE in one settlement transaction; Backend historical record after commit, no immutable trigger"
            : immutable.has(o.name)
              ? "DB-enforced immutable UPDATE/DELETE"
              : appendOnly.has(o.name)
                ? "Backend append-only convention; no immutable UPDATE/DELETE trigger in source"
                : "Mutable/configuration/projection; preserve source writes",
        exposure: "backend-only; no direct mobile/Data API access",
        idempotencyColumns: columns
          .filter((c) => /idempotency|fingerprint/.test(c.name))
          .map((c) => c.name),
        seededRowCount: db
          .prepare(`SELECT COUNT(*) count FROM ${quote(o.name)}`)
          .get().count,
      };
    });
  const sourcePaths = [...walk("apps/api/src"), ...walk("packages/types/src")]
    .filter((p) => p.endsWith(".ts"))
    .sort();
  const sources = sourcePaths.map((path) => ({
    path,
    sha256: hash(readFileSync(resolve(root, path))),
  }));
  const testCases = [],
    methods = [],
    sqliteFindings = [];
  const patterns = {
    DatabaseSync: /\bDatabaseSync\b/,
    pragma: /\bPRAGMA\b/,
    beginImmediate: /BEGIN IMMEDIATE/,
    sqliteCatalog: /sqlite_master/,
    sqliteDatetime: /datetime\(/,
    sqliteJson: /json_(valid|extract|set)\(/,
    insertIgnore: /INSERT OR IGNORE/,
    abortTrigger: /RAISE\(ABORT/,
    sqliteGlob: /\bGLOB\b/,
    sqliteLike: /\bLIKE\b/,
    sqliteError: /ERR_SQLITE|isSqliteConstraintError/,
    rowChanges: /\.changes\b/,
    autoIncrement: /AUTOINCREMENT/,
    positionalParameters: /\?.*(?:["`]|\))/,
    sqliteScalarMin: /\bmin\(current_energy/,
  };
  for (const path of sourcePaths) {
    const source = read(path),
      sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const line = (n) =>
      sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const visit = (n) => {
      if (
        ts.isCallExpression(n) &&
        ["test", "it"].includes(n.expression.getText(sf)) &&
        n.arguments.length &&
        ts.isStringLiteralLike(n.arguments[0])
      )
        testCases.push({
          file: path,
          line: line(n),
          name: n.arguments[0].text,
        });
      if (
        path.endsWith("/store.ts") &&
        (ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n)) &&
        n.body
      ) {
        const body = n.body.getText(sf);
        methods.push({
          name: n.name.getText(sf),
          line: line(n),
          explicitTransaction: /BEGIN IMMEDIATE/.test(body),
          commits: (body.match(/"COMMIT"/g) || []).length,
          rollbacks: (body.match(/"ROLLBACK"/g) || []).length,
          directWriteTargets: [
            ...new Set(
              [
                ...body.matchAll(
                  /\b(?:INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM)\s+([a-z_]+)/g,
                ),
              ].map((m) => m[1]),
            ),
          ].sort(),
          calls: [
            ...new Set(
              [...body.matchAll(/this\.([a-zA-Z]\w*)\(/g)].map((m) => m[1]),
            ),
          ].sort(),
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    source.split(/\r?\n/).forEach((value, i) => {
      for (const [kind, rx] of Object.entries(patterns))
        if (rx.test(value))
          sqliteFindings.push({
            file: path,
            line: i + 1,
            kind,
            source: value.trim(),
          });
    });
  }
  const databaseSource = read("apps/api/src/database.ts");
  const sf = ts.createSourceFile(
    "database.ts",
    databaseSource,
    ts.ScriptTarget.Latest,
    true,
  );
  let migrationNodes = [];
  function findMigrations(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "MIGRATIONS")
      migrationNodes = n.initializer.elements;
    ts.forEachChild(n, findMigrations);
  }
  findMigrations(sf);
  const migrations = MIGRATIONS.map((m, i) => ({
    version: m.version,
    name: m.name,
    line:
      sf.getLineAndCharacterOfPosition(migrationNodes[i].getStart(sf)).line + 1,
    source: migrationNodes[i].getText(sf),
    strategyReference: `W1A_SQLITE_POSTGRES_PARITY_MAP.md#M${String(m.version).padStart(2, "0")}`,
  }));
  const schemaHash = hash(JSON.stringify(objects));
  const before = db
    .prepare(
      "SELECT version,name,applied_at FROM schema_migrations ORDER BY version",
    )
    .all();
  migrateDatabase(db);
  const after = db
    .prepare(
      "SELECT version,name,applied_at FROM schema_migrations ORDER BY version",
    )
    .all();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error("Migration replay changed metadata");
  if (
    hash(
      JSON.stringify(
        db
          .prepare(
            "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name",
          )
          .all(),
      ),
    ) !== schemaHash
  )
    throw Error("Migration replay changed schema");
  const countsBefore = Object.fromEntries(
    tables.map((t) => [
      t.name,
      db.prepare(`SELECT COUNT(*) count FROM ${quote(t.name)}`).get().count,
    ]),
  );
  seedDatabase(db);
  const countsAfter = Object.fromEntries(
    tables.map((t) => [
      t.name,
      db.prepare(`SELECT COUNT(*) count FROM ${quote(t.name)}`).get().count,
    ]),
  );
  if (JSON.stringify(countsBefore) !== JSON.stringify(countsAfter))
    throw Error("Seed replay changed counts");
  const inventory = {
    formatVersion: 1,
    sourceHead,
    inspection:
      "Unchanged source openDatabase(:memory:); fresh bootstrap, not production data inventory or full legacy upgrade proof",
    sqliteVersion: db.prepare("SELECT sqlite_version() version").get().version,
    counts: {
      applicationTables: tables.length,
      internalTables: objects.filter(
        (o) => o.type === "table" && o.name.startsWith("sqlite_"),
      ).length,
      columns: tables.reduce((n, t) => n + t.columns.length, 0),
      triggers: objects.filter((o) => o.type === "trigger").length,
      indexesExplicit: objects.filter((o) => o.type === "index" && o.sql)
        .length,
      indexesAutomatic: objects.filter((o) => o.type === "index" && !o.sql)
        .length,
      indexesTotal: objects.filter((o) => o.type === "index").length,
      partialIndexes: tables.reduce(
        (n, t) => n + t.indexes.filter((i) => i.partial).length,
        0,
      ),
      foreignKeys: tables.reduce((n, t) => n + t.foreignKeys.length, 0),
      checks: tables.reduce((n, t) => n + t.checks.length, 0),
      migrations: migrations.length,
      explicitStoreTransactions: methods.filter((m) => m.explicitTransaction)
        .length,
      apiTestCases: testCases.length,
    },
    domains,
    tables,
    internalObjects: objects.filter(
      (o) => o.name.startsWith("sqlite_") && o.type === "table",
    ),
    migrations,
    methods,
    testCases,
    sqliteFindings,
    sources,
    configurationSeedRows: Object.fromEntries(
      [
        "economy_settings",
        "merchant_plan_definitions",
        "level_definitions",
        "diamond_recipe_definitions",
      ].map((t) => [
        t,
        db
          .prepare(`SELECT * FROM ${quote(t)}`)
          .all()
          .map((r) => {
            const c = { ...r };
            if (c.updated_at) c.updated_at = "<ISO UTC bootstrap timestamp>";
            return c;
          }),
      ]),
    ),
    validation: {
      foreignKeyCheck: db.prepare("PRAGMA foreign_key_check").all(),
      integrityCheck: db.prepare("PRAGMA integrity_check").all(),
      migrationReplayUnchanged: true,
      seedReplayCountsUnchanged: true,
      productionDatabaseOpened: false,
      postgresConnected: false,
    },
    countingNotes: [
      "Application tables include schema_migrations; sqlite_sequence reported separately.",
      "Indexes count includes redundant constraints; no deduplication or redesign.",
      "Methods list includes direct writes and calls; explicitTransaction=false is not proof a caller lacks a transaction.",
      "Per-column type mapping is a parity proposal, not executable DDL.",
    ],
  };
  if (tables.some((t) => t.domain === "UNCLASSIFIED"))
    throw Error("Unclassified table");
  if (migrations.some((m, i) => m.version !== i + 1))
    throw Error("Non-contiguous migrations");
  const serialized = JSON.stringify(inventory, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== serialized)
      throw Error("Inventory differs; regenerate and review");
  } else writeFileSync(target, serialized);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        counts: inventory.counts,
        validation: inventory.validation,
        inventorySha256: hash(serialized),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
