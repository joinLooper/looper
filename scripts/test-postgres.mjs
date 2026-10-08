import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
if (
  !existsSync(
    new URL("../.runtime/postgres17/credentials.json", import.meta.url),
  )
)
  throw Error(
    "W1B requires a real isolated PostgreSQL 17 runtime. See scripts/W1B_POSTGRES_RUNTIME_README.md; no emulator/skip fallback.",
  );
const directory = fileURLToPath(
  new URL("../apps/api/test-parity/", import.meta.url),
);
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => directory + name);
if (!files.length) throw Error("No PostgreSQL parity tests discovered");
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-concurrency=1", ...files],
  { cwd: root, stdio: "inherit" },
);
process.exit(result.status ?? 1);
