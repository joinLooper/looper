import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = (filename: string) =>
  readFileSync(new URL(`../app/${filename}`, import.meta.url), "utf8");

test("knowledge and progress remain inside the Forest world, including deep links", () => {
  const forest = route("forest.tsx");
  const knowledge = route("knowledge.tsx");
  const progress = route("progress.tsx");

  assert.match(forest, /open\("knowledge"\)/);
  assert.match(forest, /setSheet\("progress"\)/);
  assert.match(forest, /initialSheet = null/);
  assert.match(forest, /onClose=\{closeSheet\}/);

  for (const [source, panel] of [[knowledge, "knowledge"], [progress, "progress"]]) {
    assert.match(source, new RegExp('initialSheet="' + panel + '"'));
    assert.match(source, /import Forest from "\.\/forest"/);
    assert.doesNotMatch(source, /<Page|s\.card|<Button|<SafeAreaView/);
  }
  assert.doesNotMatch(forest, /router\.push\("\/(knowledge|progress)"\)/);
});

test("the current Forest game UI keeps canonical art and working demo interactions", () => {
  const forest = route("forest.tsx");
  assert.match(forest, /imageSource=\{FOREST_PROPS\.knowledge\}/);
  assert.match(forest, /imageSource=\{approvedArt\.sign\}/);
  assert.match(forest, /artwork=\{sheet === "mission" \? approvedArt\.journal : undefined\}/);
  assert.match(forest, /testID="answer-reuse"/);
  assert.match(forest, /testID="answer-single"/);
  assert.match(forest, /testID="complete-mission"/);
  assert.match(forest, /testID="world-progress-summary"/);
  assert.match(forest, /testID="knowledge-feedback"/);
  assert.match(forest, /testID="open-world-progress"/);
  assert.doesNotMatch(forest, /dispatch\(\{ type: "(reward|economy|grant)"/);
  assert.match(forest, /reduced=\{reduced\}/);
});
