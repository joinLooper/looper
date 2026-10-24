/**
 * Local-only safe Expo Web export for dirty Windows Looper worktrees.
 * Runs the already-installed Expo CLI directly, without pnpm run/exec/install,
 * Puppeteer postinstall, or changing package-lock/build approvals.
 *
 * Usage from any folder:
 *   node D:\\Looper-INTEGRATION01\\apps\\mobile\\scripts\\export-web-existing-deps.mjs
 *
 * Output: apps/mobile/dist (Expo build artifacts only). No Git mutations.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const mobile=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const cliCandidates=[
  resolve(mobile,"node_modules/expo/bin/cli"),
  resolve(mobile,"node_modules/expo/bin/cli.js"),
];
const cli=cliCandidates.find(existsSync);
if (!cli) {
  console.error("EXPO_NOT_INSTALLED: Existing apps/mobile/node_modules/expo/bin/cli is missing.");
  console.error("Do not bypass pnpm's install policy. Fix the approved dependency policy first.");
  process.exit(2);
}
const mode=process.argv.includes("--dev")?"--dev":null;
const extraWorkers=process.argv.indexOf("--max-workers");
const workers=extraWorkers===-1?"2":process.argv[extraWorkers+1];
if(!/^[1-8]$/.test(workers||""))throw Error("Invalid --max-workers: choose 1..8");
const command=[cli,"export","--platform","web","--max-workers",workers,...(mode?[mode]:[])];
console.log(JSON.stringify({phase:"EXPO_EXPORT",workspace:mobile,cli,workers,usesPnpmInstall:false}));
const exportResult=spawnSync(process.execPath,command,{
  cwd:mobile,stdio:"inherit",
  env:{...process.env,EXPO_NO_TELEMETRY:"1",PUPPETEER_SKIP_DOWNLOAD:"1"},
  shell:false,
});
if(exportResult.error)throw exportResult.error;
if(exportResult.status!==0) {
  console.error("EXPO_EXPORT_FAILED: check Metro/Babel logs above, not Puppeteer warnings.");
  process.exit(exportResult.status||1);
}
const patcher=resolve(mobile,"scripts/ensure-single-web-viewport.mjs");
if(!existsSync(patcher))throw Error("VIEWPORT_PATCHER_MISSING; export kept for review");
const patch=spawnSync(process.execPath,[patcher],{cwd:mobile,stdio:"inherit",shell:false});
if(patch.error)throw patch.error;
if(patch.status!==0)process.exit(patch.status||1);
const html=resolve(mobile,"dist/index.html");
if(!existsSync(html)||statSync(html).size<100)throw Error("EXPORTED_HTML_MISSING_OR_EMPTY");
const contents=readFileSync(html);
const text=contents.toString("utf8");
if(!/<script\b/i.test(text)||!/name=["']viewport["']/i.test(text)) {
  throw Error("EXPO_BOOTSTRAP_OR_VIEWPORT_MISSING");
}
console.log(JSON.stringify({
  status:"WEB_EXPORT_COMPLETED_FOR_VISUAL_QA_NOT_IPHONE_PASS",
  htmlBytes:contents.length,
  sha256:createHash("sha256").update(contents).digest("hex"),
  output:html,
  mode:mode?"DEV":"PRODUCTION_EXPORT",
},null,2));
