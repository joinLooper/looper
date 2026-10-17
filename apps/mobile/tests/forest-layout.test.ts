import test from "node:test";
import assert from "node:assert/strict";
import { worldRect, FOREST_ENTRIES } from "../src/forest-layout";
import { ANCHORS, CHARACTER_SLOTS } from "../src/model";
test("immersive world targets stay in safe bounds and separate at both phone ratios", () => {
  for (const [width, height] of [
    [336, 592],
    [366, 752],
    [296, 536],
  ]) {
    const items = [
      ...Object.values(FOREST_ENTRIES),
      { ...ANCHORS.sprout, width: 64, height: 78 },
      { ...CHARACTER_SLOTS.marmot, width: 64, height: 112 },
      { ...CHARACTER_SLOTS.rabbit, width: 68, height: 88 },
      { ...ANCHORS.treehouse, width: 112, height: 68 },
    ].map((a) => worldRect(a.x, a.y, a.width, a.height, width, height));
    for (const r of items) {
      assert.ok(r.width >= 48 && r.height >= 48);
      assert.ok(
        r.left >= 0 &&
          r.top >= 0 &&
          r.left + r.width <= width &&
          r.top + r.height <= height,
      );
    }
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i],
          b = items[j];
        const overlap =
          a.left < b.left + b.width &&
          a.left + a.width > b.left &&
          a.top < b.top + b.height &&
          a.top + a.height > b.top;
        assert.equal(overlap, false, `overlap ${i}/${j} at ${width}x${height}`);
      }
  }
});
