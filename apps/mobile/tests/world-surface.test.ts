import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const forest = readFileSync(new URL("../app/forest.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/forest-ui.tsx", import.meta.url), "utf8");

test("W2-05 uses one continuous journal leaf with the approved image unchanged", () => {
  assert.match(ui, /testID="worldbook-page"/);
  assert.match(ui, /testID="task-journal-art"/);
  assert.match(ui, /source=\{artwork\}/);
  assert.match(ui, /marginTop: -52/);
  assert.match(ui, /backgroundColor: "#f8ead0"/);
  assert.match(forest, /artwork=\{sheet === "mission" \|\| sheet === "progress" \? approvedArt\.journal : undefined\}/);
  assert.match(forest, /imageSource=\{approvedArt\.sign\}/);
  assert.doesNotMatch(forest, /require\(.*task_journal_/);
});

test("knowledge is an open book surface, not a dashboard card or duplicate closed-book icon", () => {
  assert.match(ui, /testID="knowledge-open-pages"/);
  assert.match(ui, /testID=\{hasKnowledgePages \? "knowledge-page-surface" : undefined\}/);
  assert.match(ui, /knowledgeCenterSeam/);
  assert.match(forest, /sheet === "knowledge" \? "knowledge"/);
  assert.match(forest, /variant="choice"/);
  assert.equal((forest.match(/variant="choice"/g) || []).length, 2);
  assert.match(forest, /testID="answer-reuse"/);
  assert.match(forest, /testID="answer-single"/);
  assert.match(forest, /testID="knowledge-feedback"/);
  assert.doesNotMatch(forest, /<Page|s\.card/);
});

test("backpack and tools reuse unchanged approved prop sources without new gameplay", () => {
  assert.match(forest, /sheet === "backpack" \? FOREST_PROPS\.backpack/);
  assert.match(forest, /sheet === "tools" \? FOREST_PROPS\.tools/);
  assert.match(ui, /surface = "other"/);
  assert.match(ui, /testID="close-sheet"/);
  assert.doesNotMatch(forest, /dispatch\(\{ type: "(economy|reward|grant)"/);
});
