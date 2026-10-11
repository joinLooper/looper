import fs from "node:fs";
import cp from "node:child_process";
import crypto from "node:crypto";
import ts from "typescript";
const source = "06b64d1906074b8a9b84ded1b6d2818b88d80189";
const inventory = JSON.parse(
  fs.readFileSync("docs/migrations/W1A_SCHEMA_INVENTORY.json", "utf8"),
);
const before = cp.execFileSync(
  "git",
  ["show", source + ":apps/api/src/store.ts"],
  { encoding: "utf8" },
);
const after = fs.readFileSync("apps/api/src/store.ts", "utf8");
function methods(text) {
  const sf = ts.createSourceFile(
    "store.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const result = new Map();
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.body)
      result.set(
        node.name.getText(sf),
        node.body.getText(sf).replace(/\r\n/g, "\n"),
      );
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return result;
}
const original = methods(before),
  current = methods(after);
const methods26 = inventory.methods
  .filter((m) => m.explicitTransaction)
  .map((m) => ({
    name: m.name,
    sourceLine: m.line,
    directWriteTargets: m.directWriteTargets,
    businessBodyUnchanged: original.get(m.name) === current.get(m.name),
    bodySha256: crypto
      .createHash("sha256")
      .update(current.get(m.name))
      .digest("hex"),
    postgresAuthority:
      "postgres-worker.mjs begin(): BEGIN then pg_advisory_xact_lock(170027,1); same connection through COMMIT/ROLLBACK",
  }));
if (methods26.length !== 26 || methods26.some((x) => !x.businessBodyUnchanged))
  throw Error("Transaction authority changed");
const callSites = [];
const ignoreAuthority = {
  merchant_brands: [
    "SQLite v12 historical merchant-to-brand backfill; existing brand is retained",
    "SQLite migration regression; PG fresh v27 does not replay historical backfills",
  ],
  accounts: [
    "SQLite v14 historical account backfill or explicit user-demo fixture; existing account is retained",
    "SQLite migration regression; P01 account rows; fresh PG bootstrap has zero accounts",
  ],
  economy_settings: [
    "Configuration seed; preserve existing core settings/version on repeated seed",
    "PG harness seeds configuration twice; JSON compatibility and schema seed separation",
  ],
  merchant_plan_definitions: [
    "Configuration seed; retain existing plan row by plan key",
    "All dual-run fixtures and P15 merchant settlement",
  ],
  level_definitions: [
    "Configuration seed; retain existing level row by level key",
    "All dual-run fixtures; P06-P09 progression and overflow",
  ],
  diamond_recipe_definitions: [
    "Configuration seed; retain disabled recipe without enabling it",
    "All dual-run fixtures and fresh configuration seed separation",
  ],
  users: [
    "Explicit demo fixture only; preserve existing user-demo row",
    "P01 and all exact 35-table comparisons; fresh PG bootstrap has zero users",
  ],
  user_resources: [
    "Explicit demo fixture only; preserve existing resource balance",
    "P06-P14 and all exact 35-table comparisons",
  ],
  user_growth_balances: [
    "Explicit demo fixture only; preserve existing growth balance",
    "P13-P14, growth rollback injection, and all exact 35-table comparisons",
  ],
  resident_mission_instances: [
    "Daily mission initialization; retain existing player/mission/business-date instance",
    "P05 replay/daily boundary and real concurrent Resident claim",
  ],
};
for (const path of ["apps/api/src/database.ts", "apps/api/src/store.ts"]) {
  const text = cp.execFileSync("git", ["show", source + ":" + path], {
    encoding: "utf8",
  });
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes("INSERT OR IGNORE")) {
      const table = /INSERT OR IGNORE INTO (\w+)/.exec(line)?.[1];
      if (!ignoreAuthority[table])
        throw Error("Unmapped INSERT OR IGNORE call site");
      callSites.push({
        path,
        sourceLine: i + 1,
        statementStart: line.trim(),
        table,
        sqliteAuthority: ignoreAuthority[table][0],
        postgresBehavior:
          "SAVEPOINT; normal INSERT; on 23505/23502/23514 rollback statement and return changes=0; FK/trigger errors propagate",
        proof:
          ignoreAuthority[table][1] +
          "; compatibility.test.ts verifies UNIQUE / NOT NULL / CHECK ignore and FK rejection",
      });
    }
  });
}
fs.writeFileSync(
  "docs/migrations/W1B_TRANSACTION_TRACEABILITY.json",
  JSON.stringify(
    {
      source,
      writerLock: [170027, 1],
      methods: methods26,
      standaloneWrites:
        "Each standalone INSERT/UPDATE/DELETE acquires the same transaction lock; original multi-statement nontransaction boundaries are preserved.",
      insertOrIgnore: callSites,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    unchangedTransactionBodies: methods26.length,
    ignoreCallSites: callSites.length,
  }),
);
