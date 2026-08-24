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
const layout = read("apps/web/app/layout.tsx");
const residentGame = read("apps/web/app/game-runtime/resident-game.tsx");
const forest = read("apps/web/app/forest-logical-runtime.tsx");
const hud = read("apps/web/app/game-runtime/global-hud.tsx");
const focus = read("apps/web/app/game-runtime/focus-manager.ts");
const routes = read("apps/web/app/game-runtime/asset-routes.ts");
const overlays = read("apps/web/app/game-runtime/primary-overlay.tsx");
const unifiedCss = read("apps/web/app/game-runtime/unified-runtime.css");
const runtimeApi = read("apps/web/app/game-runtime/runtime-api.ts");
const treehouse = read("apps/web/app/game-runtime/treehouse-scene.tsx");
const settingsManifest = read("apps/web/app/game-runtime/authority/settings/settings_runtime_manifest.v001.json");
const supportRuntimeMap = read("apps/web/app/game-runtime/authority/settings/settings_support_runtime_map.v001.json");
const reducedMotionBinding = read("apps/web/app/game-runtime/authority/settings/settings_reduced_motion_persistence_binding.v001.json");

assert.match(page, /<ResidentGame\s*\/>/);
assert.match(layout, /import Script from "next\/script";/, "LIFF SDK must use the Next.js Script authority");
assert.match(layout, /<Script[\s\S]*src="https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js"[\s\S]*strategy="beforeInteractive"[\s\S]*\/>/, "LIFF SDK canonical CDN must load before ResidentGame hydration");
assert.doesNotMatch(layout, /strategy="(?:afterInteractive|lazyOnload)"|setTimeout|appendChild/, "LIFF SDK loader must not introduce a hydration race or retry loop");
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
assert.doesNotMatch(routes, /game_mission_board_scene|formal_reference_content_partition/, "flattened reference partitions must not be runtime routes");
assert.match(routes, /flattenedReferencePartitions:\s*0/);
assert.match(routes, /missionClaimP0:\s*1/);
assert.match(focus, /"dialogue"[\s\S]*"treehouse_star_shelf"/);
assert.match(focus, /activePrimaryFocusCount[\s\S]*state\.owner === null \? 0 : 1/);
assert.match(focus, /scene_transition[\s\S]*owner: null/);
assert.match(treehouse, /data-runtime-layer-count="52"/);
assert.match(treehouse, /mole: \(\) => onDialogue\("marmot"\)/);
assert.match(treehouse, /data-character-alias="mole:marmot"/);
for (const missionCopy of ["今日來訪", "今天回到森林了", "✓ 已完成", "去看看今天的核心樹", "今天的森林已經看過了", "正在把星星送回森林…", "⭐ 已收下"]) {
  assert.ok(overlays.includes(missionCopy), `player Mission copy is missing: ${missionCopy}`);
}
assert.match(overlays, /暫時沒領到，再試一次/);
assert.match(overlays, /className="mission-native-overlay__reward">⭐ 10</);
assert.match(overlays, /領取星星/);
assert.match(overlays, /本週旅程[\s\S]*新的旅程即將開始/);
for (const removedMissionCopy of [
  "Today Slot 1 ·",
  "Today Slot 2 ·",
  "居民 Session 已確認",
  "正在由 Backend 確認領取",
  "Backend 已確認領取",
  "10⭐ · EXP 0 · Energy 0",
  "CO₂e 0 · Item 0",
  "Backend Authority pending",
]) {
  assert.ok(!overlays.includes(removedMissionCopy), `player-visible Mission engineering copy remains: ${removedMissionCopy}`);
}
assert.match(overlays, /data-mission-claim-authority="FROZEN"/);
assert.match(overlays, /data-mission-claim-backend-binding="PASSED"/);
assert.match(overlays, /data-mission-claim-executable-route="1"/);
assert.match(overlays, /data-mission-today-slot="1"[\s\S]*data-mission-today-slot="2"/);
assert.match(overlays, /data-mission-claim-control="formal"/);
assert.match(overlays, /claim_request[\s\S]*claim_pending[\s\S]*backend_success[\s\S]*receiving[\s\S]*failure/);
assert.match(overlays, /coreTree\?\.claimed \? <Image className="mission-native-overlay__stamp-layer"/);
assert.match(overlays, /data-stamp-backend-gated="true"/);
assert.match(runtimeApi, /\/player\/missions\/instances\/\$\{encodeURIComponent\(instanceId\)\}\/claim/);
assert.match(runtimeApi, /playerMutationRequest\(\{ idempotencyKey \}\)/);
assert.match(residentGame, /missionClaimAttemptRef\.current\?\.instanceId === instanceId[\s\S]*missionClaimAttemptRef\.current = attempt/);
assert.match(residentGame, /await claimResidentMission\(instanceId, attempt\.idempotencyKey\)[\s\S]*reconcileClaimedProfile[\s\S]*reconcileClaimedMission/);
assert.match(residentGame, /catch \(error\)[\s\S]*await refreshRuntime\(\)[\s\S]*reconciled\?\.claimed/);
assert.match(hud, /data-stars-reward-destination=\{starsReceiving \? "STARS_HUD_RECEIVING" : "IDLE"\}/);
assert.match(overlays, /forest_rabbit_anchor[\s\S]*sourceOffset: "0,-198"/);
assert.match(overlays, /forest_mole_anchor[\s\S]*sourceOffset: "4,-184"/);
assert.match(overlays, /anchor_rabbit_dialogue[\s\S]*anchor_mole_dialogue/);
assert.match(overlays, /data-responsive-transform="logical-core-safe-clamp"/);
assert.match(overlays, /data-logical-notice-rect="208,420,166,60"/);
assert.match(overlays, /data-browser-center-positioning="0"/);
assert.match(overlays, /data-growth-world-state/);
assert.doesNotMatch(overlays, /core-tree-native-overlay__tree|aria-hidden>🌳/, "Core Tree must not use the emoji/card substitute");
assert.match(overlays, /logout_confirm[\s\S]*logout_processing[\s\S]*logout_failure/);
assert.match(overlays, /onClick=\{\(\) => setView\("logout_confirm"\)\}/);
assert.match(overlays, /確認登出[\s\S]*取消[\s\S]*正在登出[\s\S]*重試/);
for (const settingsCopy of ["動態效果", "標準", "減少", "儲存中…", "這次設定還沒保存"]) {
  assert.ok(overlays.includes(settingsCopy), `player Settings copy is missing: ${settingsCopy}`);
}
assert.match(overlays, /重新播放[\s\S]*重看目前場景/);
assert.match(overlays, /離開目前居民帳號/);
for (const removedSettingsCopy of ["Replay</span>", "只重播呈現", "PERSISTED", "NOT PERSISTED", "SYSTEM DEFAULT", "帳號層保存：", "Auth Authority", "Session 仍保持登入"]) {
  assert.ok(!overlays.includes(removedSettingsCopy), `player-visible Settings engineering copy remains: ${removedSettingsCopy}`);
}
assert.equal((overlays.match(/Customer Support/g) ?? []).length, 0, "Demo v1.0 must not render Customer Support");
assert.equal((overlays.match(/settings-native-overlay__hotspot--support/g) ?? []).length, 0, "Demo v1.0 must not expose a Support executable route");
assert.equal((overlays.match(/provider = null · url = null · external_open = false/g) ?? []).length, 0, "Demo v1.0 must not retain a Support pending placeholder");
assert.doesNotMatch(settingsManifest, /SUPPORT_PENDING|customer_support_destination/);
assert.match(supportRuntimeMap, /"demo_scope_status": "REMOVED_FROM_DEMO_SCOPE"/);
assert.doesNotMatch(supportRuntimeMap, /SUPPORT_DESTINATION_PENDING|IMPLEMENTATION AUTHORITY PENDING/);
assert.match(reducedMotionBinding, /"implementation_authority_status": "PASSED"/);
assert.match(reducedMotionBinding, /204f731a55f843ba1306ee8418b2674b67af2429/);
assert.match(overlays, /交易 0 · 任務碼 0 · 獎勵 0 · CO₂e 0/);
assert.doesNotMatch(overlays, /localStorage|sessionStorage/);
assert.match(overlays, /星星收藏[\s\S]*更多收藏會慢慢出現在這裡/);
assert.match(overlays, /收納櫃[\s\S]*之後找到的物件會放在這裡/);
assert.doesNotMatch(overlays, /Preview · Read-only|只有摘要預覽|Locked／Preview/);
assert.match(overlays, /⭐100[\s\S]*EXP \+50[\s\S]*⚡\+\$\{result\.appliedEnergy\}/);
assert.match(overlays, /EXP \+30/);
assert.doesNotMatch(overlays, /100 Stars · 50 EXP|30 EXP · Stars 0 · Energy 0/);
assert.match(overlays, /每一顆星星，都是你在森林留下的足跡/);
assert.doesNotMatch(forest, /kg CO₂e|種子 \{|植物 \{|樹 \{/);
assert.match(forest, /FIRST_ENTRY_GUIDANCE_HOTSPOTS[\s\S]*hotspot_mission_board[\s\S]*hotspot_treehouse[\s\S]*hotspot_core_tree[\s\S]*hotspot_rabbit/);
assert.match(forest, /setEntryGuidanceActive\(false\), 1800/);
assert.match(unifiedCss, /\.ui-control:active:not\(:disabled\)[\s\S]*scale\(0\.98\)/);
assert.match(unifiedCss, /world-entry-guidance 1\.65s ease-out 1/);
assert.match(unifiedCss, /data-reduced-motion="true"[\s\S]*data-first-entry-guidance="active"[\s\S]*animation: none !important/);
assert.match(unifiedCss, /safe-area-inset-top/);
assert.match(unifiedCss, /treehouse-world-note-overlay[\s\S]*width: min\(43%, 10\.5rem\)/);
assert.match(residentGame, /data-primary-focus-count=\{focus\.owner \? 1 : 0\}/);
assert.match(residentGame, /data-formal-runtime-package-count="9"/);
for (const settingsAssetRoute of [
  "settingsIdle",
  "settingsFocus",
  "settingsPressed",
  "settingsReducedMotion",
]) {
  assert.match(hud, new RegExp(`UNIFIED_RUNTIME_ASSETS\\.hud\\.${settingsAssetRoute}`));
}
assert.doesNotMatch(hud, /⚙/, "Global HUD Settings must use Passed formal assets");

console.log(JSON.stringify({
  status: "PASS",
  liffSdkCdn: "https://static.line-scdn.net/liff/edge/2/sdk.js",
  liffSdkStrategy: "beforeInteractive",
  formalAssetPackages: Object.keys(expectedAssets).length + 1,
  globalHudFamilyCount: 1,
  globalFocusOwnerMax: 1,
  bottomNavigationFormalRouteCount: 0,
  proxyCharacterFormalRouteCount: 0,
  legacyRewardCardRouteCount: 0,
  merchantMissionP0RouteCount: 0,
  missionClaimP0RouteCount: 1,
  engineeringVisibleTermsCount: 0,
  interactionFeedbackDurationMs: 120,
  firstEntryGuidanceDurationMs: 1800,
  customerSupportVisibleCount: 0,
  supportExecutableRouteCount: 0,
  supportPendingPlaceholderCount: 0,
  releaseBlockerCount: 0,
  demoScopeBlockerCount: 0,
  p1ExecutableRouteCount: 0,
}, null, 2));
