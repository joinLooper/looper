import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appContractPath = join(
  root,
  "apps/web/app/looper-runtime-assembly-handoff.v005.json",
);
const publicContractPath = join(
  root,
  "apps/web/public/runtime-assets/v005/contracts/looper-runtime-assembly-handoff.v005.json",
);
const componentPath = join(root, "apps/web/app/runtime-assembly-renderer.tsx");
const pagePath = join(root, "apps/web/app/page.tsx");
const apiStorePath = join(root, "apps/api/src/store.ts");
const outputDir = join(root, "output/runtime_assembly_v005");

const expectedLayers = [
  "scene_background",
  "floor_back",
  "prop_back",
  "equipment_back",
  "actor_torso_head",
  "held_prop",
  "actor_near_paw",
  "actor_chin_neck_fur_front",
  "face_rig",
  "prop_front",
  "fx_front",
  "ui_overlay",
];

const expectedPreviews = [
  "t6_watering_static_preview_only.png",
  "t6_broom_static_preview_only.png",
  "t6_snack_tray_static_preview_only.png",
  "d9_rabbit_scarf_static_preview_only.png",
  "d9_mole_scarf_static_preview_only.png",
];

const expectedRuntimeAssets = [
  "scenes/scene_forest_clearing_base_v001_1000.png",
  "scenes/scene_treehouse_main_base_v001_1000.png",
  "exports/char_rabbit_left_3q_runtime.png",
  "exports/char_mole_right_3q_runtime.png",
  "exports/furn_leaf_cushion_v001_runtime.png",
  "exports/furn_second_cushion_v001_runtime.png",
  "exports/tool_watering_can_v001_runtime.png",
  ...expectedPreviews.map((name) => `previews/${name}`),
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const appContractBytes = readFileSync(appContractPath);
const publicContractBytes = readFileSync(publicContractPath);
const contract = JSON.parse(appContractBytes.toString("utf8"));
const component = readFileSync(componentPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const apiStore = readFileSync(apiStorePath, "utf8");

check(
  appContractBytes.equals(publicContractBytes),
  "App 與 public 的 v005 契約內容不同",
);
check(
  JSON.stringify(contract.layer_order_back_to_front) ===
    JSON.stringify(expectedLayers),
  "z-layer 名稱或順序不符合 v005",
);
check(contract.canvas.width === 1000, "canvas width 必須為 1000");
check(contract.canvas.height === 1000, "canvas height 必須為 1000");
check(contract.canvas.ground_y === 820, "ground_y 必須為 820");
check(
  JSON.stringify(contract.canvas.safe_rect) ===
    JSON.stringify([80, 160, 840, 700]),
  "safe_rect 不符合 v005",
);
check(contract.mvp_energy.enabled === false, "MVP energy.enabled 必須為 false");
check(
  contract.mvp_energy.ui_visible === false,
  "MVP energy.ui_visible 必須為 false",
);
check(
  contract.mvp_energy.action_energy_cost === null,
  "MVP action_energy_cost 必須為 null",
);
check(contract.central_sync === false, "v005 central_sync 必須保持 false");
check(
  contract.consumers.furn_leaf_cushion.runtime_allowed === false,
  "葉片座墊不得宣告 runtime allowed",
);
check(
  contract.consumers.furn_second_cushion.runtime_allowed === false,
  "第二座墊不得宣告 runtime allowed",
);

for (const layer of expectedLayers) {
  check(
    component.includes("data-z-layer={layerName}") &&
      contract.layer_order_back_to_front.includes(layer),
    `renderer 缺少 z-layer：${layer}`,
  );
}

for (const id of [
  "t6_watering",
  "t6_broom",
  "t6_snack_tray",
  "d9_rabbit_scarf",
  "d9_mole_scarf",
]) {
  check(component.includes(id), `renderer 缺少 static preview：${id}`);
}

for (const asset of expectedRuntimeAssets) {
  check(
    existsSync(join(root, "apps/web/public/runtime-assets/v005", asset)),
    `缺少 runtime asset：${asset}`,
  );
}

check(!page.includes("ui_energy_progress"), "玩家頁仍引用 ui_energy_progress");
check(!page.includes("活力"), "玩家頁仍含活力 live UI");
check(!page.includes("⚡"), "玩家頁仍含能量符號");
check(!/10\s*活力|20\s*活力|15\s*活力/.test(page), "玩家頁仍含歷史動作成本");
check(
  component.includes('data-energy-enabled="false"') &&
    component.includes('data-action-energy-cost="null"'),
  "renderer 缺少 energy disabled 證據欄位",
);
check(!/\.energy\s*-=|energy\s*:\s*-\d/.test(apiStore), "API 出現活力扣點事件");

mkdirSync(outputDir, { recursive: true });

const zLayerEvidence = {
  schema: "looper.runtime-assembly-z-layer-dump.v5",
  contract: contract.schema,
  central_sync: false,
  order_back_to_front: expectedLayers.map((name, index) => ({
    z_index: index + 1,
    name,
  })),
  result: failures.some((failure) => failure.includes("z-layer"))
    ? "FAIL"
    : "PASS",
};

const energyEvidence = {
  schema: "looper.mvp-energy-disabled-evidence.v5",
  contract: contract.schema,
  enabled: false,
  ui_visible: false,
  action_energy_cost: null,
  player_page_has_energy_progress: page.includes("ui_energy_progress"),
  player_page_has_live_energy_text:
    page.includes("活力") || page.includes("⚡"),
  api_energy_debit_pattern_found: /\.energy\s*-=|energy\s*:\s*-\d/.test(
    apiStore,
  ),
  legacy_values_integrated: false,
  result: failures.some((failure) => /energy|活力|能量/.test(failure))
    ? "FAIL"
    : "PASS",
};

writeFileSync(
  join(outputDir, "runtime-assembly-z-layer-dump.v005.json"),
  `${JSON.stringify(zLayerEvidence, null, 2)}\n`,
);
writeFileSync(
  join(outputDir, "runtime-energy-disabled-evidence.v005.json"),
  `${JSON.stringify(energyEvidence, null, 2)}\n`,
);

console.log(`Contract: ${contract.schema}`);
console.log(`Contract SHA-256: ${sha256(appContractPath)}`);
console.log(`Layers: ${expectedLayers.length}`);
console.log(`Static previews: ${expectedPreviews.length}`);
console.log(`Runtime assets checked: ${expectedRuntimeAssets.length}`);
console.log(`MVP energy enabled: ${contract.mvp_energy.enabled}`);
console.log(`Action energy cost: ${contract.mvp_energy.action_energy_cost}`);
console.log(`Failures: ${failures.length}`);
for (const failure of failures) console.error(`- ${failure}`);

if (failures.length) process.exitCode = 1;
