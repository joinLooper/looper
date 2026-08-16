import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const recursiveFiles = (path) => readdirSync(join(root, path), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).length;

const expectedAssets = {
  dialogue: 51,
  knowledge: 110,
  mission: 53,
  resources: 134,
  restaurant: 39,
  reward: 88,
  settings: 49,
  treehouse: 52,
};
for (const [authority, expected] of Object.entries(expectedAssets)) {
  const path = `apps/web/public/runtime-assets/unified-v001/${authority}`;
  assert.ok(existsSync(join(root, path)), `${authority} formal asset route is missing`);
  assert.equal(recursiveFiles(path), expected, `${authority} formal asset count changed`);
}

const page = read("apps/web/app/page.tsx");
const residentGame = read("apps/web/app/game-runtime/resident-game.tsx");
const forest = read("apps/web/app/forest-logical-runtime.tsx");
const hud = read("apps/web/app/game-runtime/global-hud.tsx");
const focus = read("apps/web/app/game-runtime/focus-manager.ts");
const routes = read("apps/web/app/game-runtime/asset-routes.ts");
const overlays = read("apps/web/app/game-runtime/primary-overlay.tsx");
const treehouse = read("apps/web/app/game-runtime/treehouse-scene.tsx");

assert.match(page, /<ResidentGame\s*\/>/);
assert.doesNotMatch(`${page}\n${residentGame}`, /BottomNavigation|bottom-navigation|SettlementPanel|PlayerEventPanel|ResidentPreviewDialog/);
assert.match(forest, /forest_rabbit_proxy[\s\S]*forest_mole_proxy/);
assert.match(forest, /if \(layer\.layer_id === "forest_rabbit_proxy" \|\| layer\.layer_id === "forest_mole_proxy"\) \{\s*return false;/);
assert.match(hud, /resources\.currentLevel >= 3 \? \([\s\S]*data-energy-asset-route="present"[\s\S]*\) : null/);
assert.equal((residentGame.match(/<GlobalHud\b/g) ?? []).length, 1, "formal runtime must mount one Global HUD");
assert.match(routes, /globalHudFamilies:\s*1/);
assert.match(routes, /bottomNavigation:\s*0/);
assert.match(routes, /proxyCharacters:\s*0/);
assert.match(routes, /legacyRewardCards:\s*0/);
assert.match(routes, /merchantMissionP0:\s*0/);
assert.match(routes, /p1Executable:\s*0/);
assert.doesNotMatch(routes, /qa|preview\.png|screenshot/i, "explicit runtime routes must not bind QA artifacts");
assert.doesNotMatch(routes, /game_mission_board_scene|formal_reference_content_partition|settings_root_reduced_motion/, "flattened reference partitions must not be runtime routes");
assert.match(routes, /flattenedReferencePartitions:\s*0/);
assert.match(focus, /"dialogue"[\s\S]*"treehouse_star_shelf"/);
assert.match(focus, /activePrimaryFocusCount[\s\S]*state\.owner === null \? 0 : 1/);
assert.match(focus, /scene_transition[\s\S]*owner: null/);
assert.match(treehouse, /data-runtime-layer-count="52"/);
assert.match(treehouse, /mole: \(\) => onDialogue\("marmot"\)/);
assert.match(treehouse, /data-character-alias="mole:marmot"/);
assert.match(overlays, /居民 Session 已確認/);
assert.match(overlays, /provider = null · url = null · external_open = false/);
assert.match(overlays, /交易 0 · 任務碼 0 · 獎勵 0 · CO₂e 0/);
assert.doesNotMatch(overlays, /localStorage|sessionStorage/);
assert.match(residentGame, /data-primary-focus-count=\{focus\.owner \? 1 : 0\}/);
assert.match(residentGame, /data-formal-runtime-package-count="9"/);

console.log(JSON.stringify({
  status: "PASS",
  formalAssetPackages: Object.keys(expectedAssets).length + 1,
  globalHudFamilyCount: 1,
  globalFocusOwnerMax: 1,
  bottomNavigationFormalRouteCount: 0,
  proxyCharacterFormalRouteCount: 0,
  legacyRewardCardRouteCount: 0,
  merchantMissionP0RouteCount: 0,
  p1ExecutableRouteCount: 0,
}, null, 2));
