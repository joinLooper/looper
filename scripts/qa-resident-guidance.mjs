import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "apps/web/app/page.tsx"), "utf8");
if (page.includes("<ResidentGame")) {
  await import("./qa-unified-runtime.mjs");
  console.log("Legacy guidance route checks superseded by Unified Runtime replay and P0 route guards.");
  process.exit(0);
}
const guidance = readFileSync(
  join(root, "apps/web/app/resident-guidance.ts"),
  "utf8",
);
const dialog = readFileSync(
  join(root, "apps/web/app/resident-guidance-dialog.tsx"),
  "utf8",
);
const css = readFileSync(join(root, "apps/web/app/mobile.css"), "utf8");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

for (const title of [
  "歡迎來到 Looper",
  "這裡是你的家",
  "每次行動，都會留下成長",
  "先從今天的小任務開始",
  "城市生活機能正在準備",
  "開始你的居民生活",
]) {
  check(guidance.includes(title), `缺少正式引導文案：${title}`);
}

check(
  guidance.includes("RESIDENT_GUIDANCE_STEPS") &&
    guidance
      .slice(
        guidance.indexOf("RESIDENT_GUIDANCE_STEPS"),
        guidance.indexOf("] as const;", guidance.indexOf("RESIDENT_GUIDANCE_STEPS")),
      )
      .match(/\n    id: "/g)?.length === 6,
  "居民引導不是正式六步",
);
check(
  guidance.includes("encodeURIComponent(canonicalResidentId)") &&
    !guidance
      .slice(
        guidance.indexOf("function residentGuidanceStorageKey"),
        guidance.indexOf("function hasCompletedResidentGuidance"),
      )
      .includes("displayName"),
  "完成狀態未依 canonical resident ID 安全分區",
);
check(
  guidance.includes('outcome: "completed"') ||
    guidance.includes("ResidentGuidanceOutcome"),
  "缺少完成狀態",
);
check(guidance.includes('"skipped"'), "缺少略過完成狀態");
check(
  page.includes("connection === \"connected\"") ||
    page.includes("shouldAutoStartResidentGuidance"),
  "首次觸發未等待 canonical resident state",
);
check(
  page.includes('mode: "replay"') &&
    page.includes("重新查看居民引導"),
  "設定頁缺少安全重看入口",
);
check(
  page.includes("residentGuidance?.mode === \"first_run\""),
  "手動重看可能覆寫首次完成狀態",
);
check(
  dialog.includes('role="dialog"') &&
    dialog.includes('aria-modal="true"') &&
    dialog.includes('event.key === "Escape"') &&
    dialog.includes('event.key !== "Tab"'),
  "dialog semantics、Escape 或 focus trap 不完整",
);
check(
  dialog.includes("if (!target)") && dialog.includes("setSpotlight(null)"),
  "缺少 spotlight target 的安全 fallback",
);
check(
  css.includes(".reduce-motion .resident-guidance__sheet") &&
    css.includes("@media (prefers-reduced-motion: reduce)"),
  "居民引導未尊重 reduced-motion",
);
check(
  css.includes("max-height: calc(100dvh") &&
    css.includes("overflow-y: auto") &&
    css.includes("env(safe-area-inset-bottom)"),
  "短高度或 WebView bottom sheet 安全區不完整",
);

for (const target of [
  "forest_scene",
  "character_area",
  "core_tree",
  "mission_board",
  "restaurant",
]) {
  check(
    page.includes(`data-guidance-target="${target}"`) ||
      readFileSync(join(root, "apps/web/app/forest-logical-runtime.tsx"), "utf8").includes(`"${target}"`),
    `缺少 spotlight target：${target}`,
  );
}

const autoStartBlock = page.slice(
  page.indexOf("shouldAutoStartResidentGuidance({"),
  page.indexOf("useEffect(() =>", page.indexOf("shouldAutoStartResidentGuidance({") + 1),
);
check(
  !/fetch\(|playerFetch\(|playerMutationRequest\(/.test(autoStartBlock),
  "首次引導觸發含網路或資料寫入",
);

const guidanceHandlers = page.slice(
  page.indexOf("function replayResidentGuidance"),
  page.indexOf("const renderHome"),
);
check(
  !/fetch\(|playerFetch\(|playerMutationRequest\(|setRemoteUser\(/.test(
    guidanceHandlers,
  ),
  "引導控制器含交易、遠端呼叫或正式資源變更",
);
check(
  page.includes("restaurantExperienceEnabled()") &&
    page.includes("{restaurantExperienceEnabled() && taskCodeOpen ? ("),
  "Preview Mode restaurant 零交易 gate 被破壞",
);

for (const forbidden of [
  "user-demo",
  "測試帳號",
  "開發模式",
  "Tester",
  "settlement",
  "transaction",
]) {
  check(
    !guidance.includes(forbidden),
    `居民可見引導出現禁止詞：${forbidden}`,
  );
}

console.log("Resident guidance steps checked: 6");
console.log("Spotlight targets checked: 5");
console.log("Persistence, replay, accessibility and zero-transaction guards checked");
console.log(`Failures: ${failures.length}`);
for (const failure of failures) console.error(`- ${failure}`);
if (failures.length) process.exitCode = 1;
