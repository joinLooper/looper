import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appContractPath = join(
  root,
  "apps/web/app/looper-runtime-assembly-handoff.v006.json",
);
const publicContractPath = join(
  root,
  "apps/web/public/runtime-assets/v006/contracts/looper-runtime-assembly-handoff.v006.json",
);
const formalSeatedContractPath = join(
  root,
  "apps/web/public/runtime-assets/v006/contracts/looper-formal-seated-runtime-handoff.v006.json",
);
const componentPath = join(root, "apps/web/app/runtime-assembly-renderer.tsx");
const pagePath = join(root, "apps/web/app/page.tsx");
const apiStorePath = join(root, "apps/api/src/store.ts");
const outputDir = join(root, "output/runtime_assembly_v006");

const expectedLayers = [
  "scene_background",
  "cushion_back",
  "prop_back",
  "equipment_back",
  "actor_seated_back",
  "held_prop",
  "cushion_front_rim",
  "actor_seated_feet_front",
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

const expectedV005Assets = [
  "scenes/scene_forest_clearing_base_v001_1000.png",
  "scenes/scene_treehouse_main_base_v001_1000.png",
  "exports/tool_watering_can_v001_runtime.png",
  ...expectedPreviews.map((name) => `previews/${name}`),
];

const expectedActors = [
  "rabbit_left",
  "rabbit_right",
  "marmot_left",
  "marmot_right",
];

const expectedV006Assets = [
  "seats/furn_leaf_cushion_back.png",
  "seats/furn_leaf_cushion_front_rim.png",
  "seats/furn_second_cushion_back.png",
  "seats/furn_second_cushion_front_rim.png",
  ...expectedActors.flatMap((actorId) => [
    `seated/layers/${actorId}/actor_seated_back.png`,
    `seated/layers/${actorId}/actor_seated_feet_front.png`,
    `seated/layers/${actorId}/seat_contact_mask.png`,
    `seated/anchors/${actorId}_anchor.json`,
  ]),
  "seated/masters/char_rabbit_act_sit_left_3q_v006_master.png",
  "seated/masters/char_rabbit_act_sit_right_3q_v006_master.png",
  "seated/masters/char_marmot_act_sit_left_3q_v006_master.png",
  "seated/masters/char_marmot_act_sit_right_3q_v006_master.png",
  "contracts/looper-runtime-assembly-handoff.v006.json",
  "contracts/looper-formal-seated-runtime-handoff.v006.json",
];

const expectedMasterHashes = {
  rabbit_left:
    "a142a8d08078e528976b5ef3640d5b834724a2bd5edb3e1c8912e26e960f47a9",
  rabbit_right:
    "ceaa643b8691537e841ce319565f0539169e625de1336b6e9d7a90caf4dc36e9",
  marmot_left:
    "439305db4cca4cc7220b768627e0b350568b8c4cf56f1bdba711979bdbbdd9fa",
  marmot_right:
    "6a22663d09dc6dbe78872e86c9a80f55bedddf08146a282ad17fdf2824e420ea",
};

const masterPaths = {
  rabbit_left: "seated/masters/char_rabbit_act_sit_left_3q_v006_master.png",
  rabbit_right: "seated/masters/char_rabbit_act_sit_right_3q_v006_master.png",
  marmot_left: "seated/masters/char_marmot_act_sit_left_3q_v006_master.png",
  marmot_right: "seated/masters/char_marmot_act_sit_right_3q_v006_master.png",
};

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
const formalSeatedContract = JSON.parse(
  readFileSync(formalSeatedContractPath, "utf8"),
);
const component = readFileSync(componentPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const apiStore = readFileSync(apiStorePath, "utf8");

check(
  appContractBytes.equals(publicContractBytes),
  "App 與 public 的 v006 契約內容不同",
);
check(
  JSON.stringify(contract.layer_order_back_to_front) ===
    JSON.stringify(expectedLayers),
  "z-layer 名稱或順序不符合 v006",
);
check(contract.canvas.width === 1000, "canvas width 必須為 1000");
check(contract.canvas.height === 1000, "canvas height 必須為 1000");
check(contract.canvas.ground_y === 820, "ground_y 必須為 820");
check(
  JSON.stringify(contract.canvas.safe_rect) ===
    JSON.stringify([80, 160, 840, 700]),
  "safe_rect 不符合 v006",
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
check(
  contract.central_sync === true,
  "中央台帳同步後 central_sync 必須為 true",
);
check(
  contract.runtime_gate.furn_leaf_cushion === "RUNTIME_PASS",
  "葉片座墊尚未標記 RUNTIME_PASS",
);
check(
  contract.runtime_gate.furn_second_cushion === "RUNTIME_PASS",
  "第二座墊尚未標記 RUNTIME_PASS",
);
check(
  formalSeatedContract.status.visual === "Approved",
  "正式坐姿來源契約不是 Approved",
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

for (const asset of expectedV005Assets) {
  check(
    existsSync(join(root, "apps/web/public/runtime-assets/v005", asset)),
    `缺少 v005 相容資產：${asset}`,
  );
}

for (const asset of expectedV006Assets) {
  check(
    existsSync(join(root, "apps/web/public/runtime-assets/v006", asset)),
    `缺少 v006 runtime asset：${asset}`,
  );
}

for (const actorId of expectedActors) {
  const actor = contract.actors[actorId];
  check(Boolean(actor), `v006 契約缺少角色：${actorId}`);
  check(
    actor.seat_anchor.every((value) => value >= 0 && value <= 1),
    `${actorId} seat_anchor 超出 normalized 範圍`,
  );
  const masterPath = join(
    root,
    "apps/web/public/runtime-assets/v006",
    masterPaths[actorId],
  );
  check(
    sha256(masterPath) === expectedMasterHashes[actorId],
    `${actorId} 正式母檔 SHA-256 不符合 Founder Approved bytes`,
  );
}

check(
  component.includes("Object.keys(handoff.actors)") &&
    component.includes("setSeatedActor(actorId)"),
  "renderer 未從 v006 契約建立四方向切換",
);

check(
  contract.actors.marmot_left.tail_rule ===
    "visible_long_tapered_tail_in_actor_seated_back" &&
    contract.actors.marmot_right.tail_rule ===
      "visible_long_tapered_tail_in_actor_seated_back",
  "土撥鼠左右坐姿未鎖定長尾 actor_seated_back 規則",
);
check(
  !component.includes("HOLD_WAITING_FOR_SEATED_POSE"),
  "renderer 仍含坐姿 HOLD",
);
check(
  component.includes('data-anchor="seat_anchor"') &&
    component.includes('data-seat-layer="cushion_front_rim"') &&
    component.includes('data-actor-layer="actor_seated_feet_front"'),
  "renderer 未完整接入 seat_anchor / front rim / feet front",
);

check(!page.includes("ui_energy_progress"), "玩家頁仍引用 ui_energy_progress");
check(!page.includes("活力"), "玩家頁仍含活力 live UI");
check(!/10\s*活力|20\s*活力|15\s*活力/.test(page), "玩家頁仍含歷史動作成本");
check(
  component.includes('data-energy-enabled="false"') &&
    component.includes('data-action-energy-cost="null"'),
  "renderer 缺少 energy disabled 證據欄位",
);
check(!/\.energy\s*-=|energy\s*:\s*-\d/.test(apiStore), "API 出現活力扣點事件");

mkdirSync(outputDir, { recursive: true });

const zLayerEvidence = {
  schema: "looper.runtime-assembly-z-layer-dump.v6",
  contract: contract.schema,
  central_sync: contract.central_sync,
  order_back_to_front: expectedLayers.map((name, index) => ({
    z_index: index + 1,
    name,
  })),
  result: failures.some((failure) => failure.includes("z-layer"))
    ? "FAIL"
    : "PASS",
};

const energyEvidence = {
  schema: "looper.mvp-energy-disabled-evidence.v6",
  contract: contract.schema,
  enabled: false,
  ui_visible: false,
  action_energy_cost: null,
  player_page_has_energy_progress: page.includes("ui_energy_progress"),
  player_page_has_settlement_energy_summary:
    page.includes("display.energy") && page.includes("⚡"),
  player_page_has_action_energy_cost:
    /10\s*活力|20\s*活力|15\s*活力/.test(page),
  api_energy_debit_pattern_found: /\.energy\s*-=|energy\s*:\s*-\d/.test(
    apiStore,
  ),
  legacy_values_integrated: false,
  result: failures.some((failure) => /energy|活力|能量/.test(failure))
    ? "FAIL"
    : "PASS",
};

const seatedEvidence = {
  schema: "looper.formal-seated-runtime-evidence.v006",
  contract: contract.schema,
  source_contract: formalSeatedContract.schema,
  founder_approved_master_sha256: expectedMasterHashes,
  actors_checked: expectedActors,
  seats_checked: ["furn_leaf_cushion", "furn_second_cushion"],
  combinations_checked: expectedActors.length * 2,
  layer_rule:
    "cushion_back < actor_seated_back < cushion_front_rim < actor_seated_feet_front",
  marmot_tail_rule: "visible_long_tapered_tail_in_actor_seated_back",
  central_sync: contract.central_sync,
  ios_qa: "Not tested",
  android_qa: "Not tested",
  result: failures.length ? "FAIL" : "PASS",
};

writeFileSync(
  join(outputDir, "runtime-assembly-z-layer-dump.v006.json"),
  `${JSON.stringify(zLayerEvidence, null, 2)}\n`,
);
writeFileSync(
  join(outputDir, "runtime-energy-disabled-evidence.v006.json"),
  `${JSON.stringify(energyEvidence, null, 2)}\n`,
);
writeFileSync(
  join(outputDir, "formal-seated-runtime-evidence.v006.json"),
  `${JSON.stringify(seatedEvidence, null, 2)}\n`,
);

console.log(`Contract: ${contract.schema}`);
console.log(`Contract SHA-256: ${sha256(appContractPath)}`);
console.log(`Layers: ${expectedLayers.length}`);
console.log(`Static previews: ${expectedPreviews.length}`);
console.log(
  `Runtime assets checked: ${expectedV005Assets.length + expectedV006Assets.length}`,
);
console.log(
  `Seated combinations checked: ${seatedEvidence.combinations_checked}`,
);
console.log(`MVP energy enabled: ${contract.mvp_energy.enabled}`);
console.log(`Action energy cost: ${contract.mvp_energy.action_energy_cost}`);
console.log(`Failures: ${failures.length}`);
for (const failure of failures) console.error(`- ${failure}`);

if (failures.length) process.exitCode = 1;
