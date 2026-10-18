import test from "node:test";
import assert from "node:assert/strict";
import { checklistKey, checklistRowsForDemo, FOREST_ART_FRAMES } from "../src/forest-art-state";

test("all eight B07 illustration states map without inventing reward changes", () => {
  const all = new Set<string>();
  for (const a of [false, true]) for (const b of [false, true]) for (const c of [false, true])
    all.add(checklistKey([a, b, c]));
  assert.deepEqual([...all].sort(), ["000", "001", "010", "011", "100", "101", "110", "111"]);
});

test("approved default checklist is first green checked; demo status updates only two rows", () => {
  assert.equal(checklistKey(checklistRowsForDemo({ missionComplete:false, cared:false })), "100");
  assert.equal(checklistKey(checklistRowsForDemo({ missionComplete:true, cared:false })), "110");
  assert.equal(checklistKey(checklistRowsForDemo({ missionComplete:false, cared:true })), "101");
  assert.equal(checklistKey(checklistRowsForDemo({ missionComplete:true, cared:true })), "111");
});

test("visual PNG stays larger than hit area without changing tappable surface", () => {
  for (const [kind, frame] of Object.entries(FOREST_ART_FRAMES)) {
    assert.ok(frame.width >= 48 && frame.height >= 48, kind);
    assert.ok(frame.left < 0 && frame.top < 0, kind);
  }
});
