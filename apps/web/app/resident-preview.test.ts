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

test("player preview source gates restaurant reads and mutations centrally", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(restaurantExperienceEnabled\(\)\)/);
  assert.match(
    source,
    /if \(!restaurantExperienceEnabled\(\)\) \{\s*openResidentNotice\("restaurant"\);\s*return;/,
  );
  assert.match(
    source,
    /\{restaurantExperienceEnabled\(\) && taskCodeOpen \? \(/,
  );
});
