import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicRoot = resolve(root, "apps/web/public");
const manifestPath = resolve(
  publicRoot,
  "visual_assets/ui/looper-ui-manifest.fragment.v001.json",
);
const registryPath = resolve(root, "apps/web/app/ui-assets.ts");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const registrySource = await readFile(registryPath, "utf8");
const registryIds = new Set(
  [...registrySource.matchAll(/^\s{2}(ui_[a-z0-9_]+): approved/gm)].map(
    (match) => match[1],
  ),
);

const failures = [];
let stateCount = 0;
let svgTextElementCount = 0;

async function assertFile(path, label) {
  try {
    const file = await stat(path);
    if (!file.isFile()) failures.push(`${label} 不是檔案：${path}`);
  } catch {
    failures.push(`${label} 不存在：${path}`);
  }
}

for (const asset of manifest.assets) {
  if (!registryIds.has(asset.asset_id))
    failures.push(`registry 缺少 ${asset.asset_id}`);

  const masterPath = resolve(publicRoot, asset.master_path);
  await assertFile(masterPath, `${asset.asset_id} master`);
  try {
    const master = await readFile(masterPath);
    const actualHash = createHash("sha256").update(master).digest("hex");
    const expectedHash = asset.content_hash.replace(/^sha256:/, "");
    if (actualHash !== expectedHash)
      failures.push(`${asset.asset_id} master SHA-256 不一致`);
    if (/<text[ >]/i.test(master.toString("utf8"))) svgTextElementCount += 1;
  } catch {
    // Missing files are recorded above.
  }

  const versionRoot = asset.master_path.split("/master/")[0];
  for (const state of asset.states) {
    stateCount += 1;
    const exportPath = resolve(
      publicRoot,
      versionRoot,
      "exports",
      asset.asset_id,
      state,
      `${asset.asset_id}_${state}_${asset.asset_version}.svg`,
    );
    await assertFile(exportPath, `${asset.asset_id}/${state}`);
    try {
      const svg = await readFile(exportPath, "utf8");
      if (/<text[ >]/i.test(svg)) svgTextElementCount += 1;
    } catch {
      // Missing files are recorded above.
    }
  }
}

for (const registryId of registryIds) {
  if (!manifest.assets.some((asset) => asset.asset_id === registryId)) {
    failures.push(`registry 多出 ${registryId}`);
  }
}

if (manifest.assets.length !== 69)
  failures.push(`UI family 應為 69，實際 ${manifest.assets.length}`);
if (stateCount !== 274) failures.push(`UI state 應為 274，實際 ${stateCount}`);
if (svgTextElementCount !== 0)
  failures.push(`發現 ${svgTextElementCount} 份 SVG 含 <text> 元素`);

console.log(`UI families: ${manifest.assets.length}`);
console.log(`UI states: ${stateCount}`);
console.log(`Registry IDs: ${registryIds.size}`);
console.log(`SVG files with baked <text>: ${svgTextElementCount}`);
console.log(`Failures: ${failures.length}`);

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
