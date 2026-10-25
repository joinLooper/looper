/** Reproducible local Expo build mirror for Windows dependencies on another drive.
 * node .../knowledge-book-export.mjs --dependencies D:/Looper-INTEGRATION01 --runtime D:/Looper-Knowledge-B-runtime
 * Copies B source bytes unchanged; never edits the dependency workspace or shared source.
 */
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const argument = name => { const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`); return resolve(args[i + 1]); };
const dependencies = argument("--dependencies"), runtimeBase = argument("--runtime");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
if (parse(dependencies).root.toLowerCase() !== parse(runtimeBase).root.toLowerCase()) throw Error("Runtime and dependencies must be on the same Windows drive");
const runtime = join(runtimeBase, "b-" + Date.now() + "-" + process.pid), mobile = join(runtime, "apps/mobile");
if (existsSync(runtime)) throw Error("Runtime must be fresh");
mkdirSync(mobile, { recursive: true });
for (const file of ["package.json", "pnpm-workspace.yaml"]) copyFileSync(join(root, file), join(runtime, file));
for (const file of ["package.json", "app.json", "tsconfig.json", "expo-env.d.ts"]) copyFileSync(join(root, "apps/mobile", file), join(mobile, file));
for (const folder of ["app", "src", "assets"]) cpSync(join(root, "apps/mobile", folder), join(mobile, folder), { recursive: true, errorOnExist: true });
symlinkSync(join(dependencies, "node_modules"), join(runtime, "node_modules"), "junction");
symlinkSync(join(dependencies, "apps/mobile/node_modules"), join(mobile, "node_modules"), "junction");
const ignored = String.raw`[/\\](output|\.runtime|\.pnpm-store|\.git)[/\\]`;
const config = `const {getDefaultConfig}=require("expo/metro-config");\nconst config=getDefaultConfig(__dirname);\nconfig.watchFolders=${JSON.stringify([runtime, dependencies])};\nconfig.resolver.nodeModulesPaths=${JSON.stringify([join(dependencies, "apps/mobile/node_modules"), join(dependencies, "node_modules")])};\nconfig.resolver.blockList=[...(Array.isArray(config.resolver.blockList)?config.resolver.blockList:[config.resolver.blockList]).filter(Boolean),new RegExp(${JSON.stringify(ignored)})];\nmodule.exports=config;\n`;
writeFileSync(join(mobile, "metro.config.cjs"), config);
const fingerprint = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = join(directory, entry.name);
  return entry.isDirectory() ? fingerprint(file) : [{ file: relative(join(root, "apps/mobile"), file).replaceAll("\\", "/"), sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }];
});
const files = ["app", "src", "assets"].flatMap(folder => fingerprint(join(root, "apps/mobile", folder)));
for (const file of files) if (createHash("sha256").update(readFileSync(join(mobile, file.file))).digest("hex") !== file.sha256) throw Error("Mirror byte mismatch: " + file.file);
const audit = { root, runtime, dependencies, mobile, status: "SOURCE_MIRROR_VERIFIED", files, qaOptIn: true, sourceModified: false };
writeFileSync(join(runtime, "source-mirror.json"), JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ phase: "MIRROR_VERIFIED", runtime, mobile, files: files.length }));
const cli = join(mobile, "node_modules/expo/bin/cli");
const result = spawnSync(process.execPath, [cli, "export", "--platform", "web", "--max-workers", "2"], { cwd: mobile, stdio: "inherit", env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1", EXPO_PUBLIC_ENABLE_KNOWLEDGE_BOOK_QA: "1", EXPO_ROUTER_APP_ROOT: join(mobile, "app") } });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const patch = spawnSync(process.execPath, [join(root, "apps/mobile/scripts/ensure-single-web-viewport.mjs")], { cwd: mobile, stdio: "inherit" });
if (patch.status !== 0) process.exit(patch.status ?? 1);
audit.status = "REAL_EXPO_WEB_EXPORT_PASS";
audit.dist = join(mobile, "dist");
writeFileSync(join(runtime, "source-mirror.json"), JSON.stringify(audit, null, 2));
mkdirSync(join(root, "output/knowledge-book-browser"), { recursive: true });
writeFileSync(join(root, "output/knowledge-book-browser/build.json"), JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ status: audit.status, runtime, dist: audit.dist }));
