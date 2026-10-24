import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const text=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");

test("pnpm 10.13 build authorization keeps Puppeteer postinstall denied",()=>{
  const pkg=JSON.parse(text("../../../package.json"));
  const workspace=text("../../../pnpm-workspace.yaml");
  assert.equal(pkg.packageManager,"pnpm@10.13.1");
  assert.match(workspace,/onlyBuiltDependencies:\s*\n\s*- esbuild\s*\n\s*- sharp/);
  assert.match(workspace,/ignoredBuiltDependencies:\s*\n\s*- puppeteer/);
  assert.match(workspace,/allowBuilds:[\s\S]*?puppeteer: false/);
  assert.doesNotMatch(workspace,/dangerouslyAllowAllBuilds:\s*true/);
});

test("safe local Web exporter has no pnpm install, no blanket script approval",()=>{
  const url=new URL("../scripts/export-web-existing-deps.mjs",import.meta.url);
  execFileSync(process.execPath,["--check",fileURLToPath(url)]);
  const source=text("../scripts/export-web-existing-deps.mjs");
  assert.match(source,/EXPO_NOT_INSTALLED/);
  assert.match(source,/spawnSync\(process\.execPath,command/);
  assert.match(source,/ensure-single-web-viewport\.mjs/);
  assert.match(source,/EXPO_BOOTSTRAP_OR_VIEWPORT_MISSING/);
  assert.doesNotMatch(source,/\bpnpm\s+(?:install|rebuild|approve-builds)/);
  assert.doesNotMatch(source,/--ignore-scripts|dangerouslyAllowAllBuilds/);
});
