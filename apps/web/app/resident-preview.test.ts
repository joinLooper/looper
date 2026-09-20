import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_COMING_SOON_NOTICE,
  RESIDENT_PREVIEW_NOTICES,
  residentPreviewNotice,
  restaurantExperienceEnabled,
} from "./resident-preview";

test("resident preview blocks the restaurant transaction experience", () => {
  assert.equal(restaurantExperienceEnabled(true), false);
  assert.equal(restaurantExperienceEnabled(false), true);
});

test("restaurant preview notice matches the resident milestone copy", () => {
  assert.deepEqual(residentPreviewNotice("restaurant"), {
    title: "蔬食餐廳區正在準備中",
    description:
      "城市生活機能尚未開放，之後你可以在這裡完成蔬食任務、累積減碳紀錄與居民獎勵。",
    primaryAction: "先回家看看",
    auxiliary: "第一位居民目前可以先探索自己的空間。",
    icon: "ui_icon_task_code",
  });
});

test("every preview notice has a clear return action", () => {
  for (const notice of Object.values(RESIDENT_PREVIEW_NOTICES)) {
    assert.ok(notice.title.length > 0);
    assert.ok(notice.description.length > 0);
    assert.match(notice.primaryAction, /回|回家|回去/);
  }
});

test("all non-restaurant notices use the shared coming soon copy", () => {
  for (const [id, notice] of Object.entries(RESIDENT_PREVIEW_NOTICES)) {
    if (id === "restaurant") continue;
    assert.equal(notice.title, DEFAULT_COMING_SOON_NOTICE.title);
    assert.equal(notice.description, DEFAULT_COMING_SOON_NOTICE.description);
    assert.equal(
      notice.primaryAction,
      DEFAULT_COMING_SOON_NOTICE.primaryAction,
    );
  }
});

test("Unified Runtime Restaurant preview remains a locked presentation-only world object", () => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  const page = read("./page.tsx");
  const game = read("./game-runtime/resident-game.tsx");
  const overlays = read("./game-runtime/primary-overlay.tsx");
  const restaurant = overlays.slice(
    overlays.indexOf("export function RestaurantOverlay"),
  );
  const manifest = JSON.parse(
    read(
      "./game-runtime/authority/restaurant/restaurant_runtime_manifest.v001.json",
    ),
  );
  const transactions = JSON.parse(
    read(
      "./game-runtime/authority/restaurant/restaurant_transaction_runtime_guard.v001.json",
    ),
  );
  const preview = JSON.parse(
    read(
      "./game-runtime/authority/restaurant/restaurant_preview_runtime_map.v001.json",
    ),
  );
  assert.match(page, /<ResidentGame\s*\/>/);
  assert.doesNotMatch(
    page + game,
    /restaurantExperienceEnabled|TaskCodeDialog/,
  );
  assert.match(
    game,
    /focus\.owner === "restaurant" \? <RestaurantOverlay onClose=\{releaseFocus\} \/>/,
  );
  assert.match(
    restaurant,
    /data-source-world-object="forest_restaurant_construction"/,
  );
  assert.match(restaurant, /交易 0 · 任務碼 0 · 獎勵 0 · CO₂e 0/);
  assert.equal(
    (restaurant.match(/<button\b/g) ?? []).length,
    1,
    "only the close control is executable",
  );
  assert.match(restaurant, /onClick=\{onClose\}/);
  assert.doesNotMatch(
    restaurant,
    /fetch\(|onSubmit|<form|href=|task-code-submissions|redemptions/,
  );
  assert.equal(manifest.interaction_type, "Locked World Object");
  assert.equal(manifest.transaction_path, 0);
  assert.equal(manifest.restaurant_locked_runtime_family_count, 1);
  for (const [key, value] of Object.entries(transactions))
    if (key !== "schema") assert.equal(value, 0, key);
  assert.equal(preview.presentation_only, true);
  for (const [key, value] of Object.entries(preview))
    if (!["schema", "presentation_only"].includes(key))
      assert.equal(value, 0, key);
});
