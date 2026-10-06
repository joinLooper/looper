import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tests = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? tests(path)
      : entry.name.endsWith(".test.ts")
        ? [path]
        : [];
  });
const files = ["web", "admin", "merchant"]
  .flatMap((app) => tests(join(root, "apps", app, "app")))
  .sort();
if (files.length === 0) throw new Error("No frontend tests discovered");
console.log(
  `Frontend baseline: ${files.length} existing test files (Web / Admin / Merchant)`,
);
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
