import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = join(root, "apps/web/app/page.tsx");
const rendererPath = join(root, "apps/web/app/runtime-assembly-renderer.tsx");
const noticesPath = join(root, "apps/web/app/resident-preview.ts");
const matrixPath = join(
  root,
  "docs/milestones/WELCOME_FIRST_RESIDENT_CONTENT_COMPLETENESS.md",
);

const page = readFileSync(pagePath, "utf8");
const renderer = readFileSync(rendererPath, "utf8");
const notices = readFileSync(noticesPath, "utf8");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

for (const rendererName of [
  "renderHome",
  "renderMissions",
  "renderExchange",
  "renderForest",
  "renderSettings",
]) {
  check(page.includes(rendererName), `缺少 Player screen renderer：${rendererName}`);
}

for (const noticeId of [
  "restaurant",
  "weekly_missions",
  "notifications",
  "forest_tools",
  "inventory",
  "vouchers",
  "support",
  "text_size",
  "accessibility_help",
]) {
  check(
    notices.includes(`${noticeId}:`),
    `中央施工 notice registry 缺少：${noticeId}`,
  );
}

check(
  notices.includes('title: "這個區域還在準備中"') &&
    notices.includes(
      'description: "Looper 世界正在慢慢長大，這項功能之後會再開放。"',
    ) &&
    notices.includes('primaryAction: "先回去看看"'),
  "一般施工狀態未使用核准的統一文案",
);
check(
  notices.includes('title: "蔬食餐廳區正在準備中"'),
  "蔬食餐廳專用文案遺失",
);

check(!page.includes("user-demo"), "Player runtime 出現 user-demo");
check(!page.includes("Math.random"), "Player runtime 出現隨機展示資料");
check(
  !/NT\$\s*\{?voucher|price:\s*\d+/.test(page),
  "星星兌換仍含未核准的固定面額或價格",
);
check(
  page.includes("dailyArrivalTask") &&
    page.includes("buildResidentGrowthView") &&
    page.includes("resident-profile-card"),
  "首頁缺少今日來訪、canonical 成長或居民身份內容",
);
check(
  renderer.includes("runtime-character-hotspot") &&
    renderer.includes("onActorInteract"),
  "角色本體缺少可點擊互動",
);

for (const source of [page, renderer]) {
  const buttonTags = [...source.matchAll(/<button\b[\s\S]*?>/g)].map(
    (match) => match[0],
  );
  for (const tag of buttonTags) {
    check(
      tag.includes("onClick=") ||
        tag.includes("disabled=") ||
        tag.includes('type="submit"'),
      `可見 button 缺少結果：${tag.replace(/\s+/g, " ").slice(0, 90)}`,
    );
  }
}

for (const match of page.matchAll(/src="(\/[^"]+)"/g)) {
  const publicPath = join(root, "apps/web/public", match[1].slice(1));
  check(existsSync(publicPath), `Player 靜態素材不存在：${match[1]}`);
}

check(
  page.includes("if (restaurantExperienceEnabled())") &&
    page.includes("if (!restaurantExperienceEnabled())") &&
    page.includes("{restaurantExperienceEnabled() && taskCodeOpen ? ("),
  "Preview Mode 的 restaurant read/mutation/modal gate 不完整",
);
check(existsSync(matrixPath), "Resident Content Completeness Matrix 不存在");

console.log("Resident screens checked: 5");
console.log("Central notice entries checked: 9");
console.log("Static Player asset references checked");
console.log(`Failures: ${failures.length}`);

for (const failure of failures) console.error(`- ${failure}`);
if (failures.length) process.exitCode = 1;
