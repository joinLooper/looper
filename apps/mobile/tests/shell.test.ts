import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ANCHORS,
  CHARACTER_SLOTS,
  demoReducer,
  demoJourney,
  fitScene,
  INITIAL_STATE,
  logicalRect,
  RESOURCES,
  sceneVisibility,
} from "../src/model";
test("Lv1 hides rabbit and treehouse; Lv5 exposes only the intended slots", () => {
  assert.deepEqual(sceneVisibility(1), {
    marmot: true,
    rabbit: false,
    treehouseEntrance: false,
  });
  assert.deepEqual(sceneVisibility(5), {
    marmot: true,
    rabbit: true,
    treehouseEntrance: true,
  });
});
test("character sources fail closed until approved transparent assets exist", () => {
  for (const c of Object.values(CHARACTER_SLOTS)) {
    assert.equal(c.source, null);
    assert.equal(c.status, "ART_PENDING");
  }
  assert.equal(CHARACTER_SLOTS.marmot.pose, "自然站姿・雙手輕放身前");
});
test("knowledge feedback can recover from a wrong answer without adding resources", () => {
  let state = demoReducer(INITIAL_STATE, {
    type: "answer",
    answer: "single-use",
  });
  assert.equal(state.answer, "single-use");
  state = demoReducer(state, { type: "answer", answer: "reuse" });
  assert.equal(state.answer, "reuse");
  assert.equal(
    demoReducer(state, { type: "answer", answer: "single-use" }),
    state,
  );
  assert.deepEqual(RESOURCES, { exp: 20, stars: 6, energy: 8 });
});
test("mission completion is idempotent and has no reward calculation", () => {
  const once = demoReducer(INITIAL_STATE, { type: "mission" });
  assert.equal(once.missionComplete, true);
  assert.equal(demoReducer(once, { type: "mission" }), once);
  assert.equal(INITIAL_STATE.missionComplete, false);
  assert.ok(Object.isFrozen(RESOURCES));
});
test("fixture reset returns to Lv1 and clears only the local demo state", () => {
  const state = {
    ...INITIAL_STATE,
    level: 5 as const,
    cared: true,
    reduceMotion: true,
    missionComplete: true,
  };
  assert.deepEqual(demoReducer(state, { type: "reset" }), INITIAL_STATE);
});
test("9:16 and 9:19.5 fit all logical anchors without cropping", () => {
  for (const [w, h] of [
    [360, 640],
    [390, 845],
  ]) {
    const { size, scale } = fitScene(w - 24, h - 280);
    assert.ok(size <= w && size <= h);
    for (const a of [
      ...Object.values(CHARACTER_SLOTS),
      { ...ANCHORS.stump, width: 240, height: 240 },
      { ...ANCHORS.sprout, width: 230, height: 240 },
      { ...ANCHORS.treehouse, width: 300, height: 160 },
    ]) {
      const r = logicalRect(a.x, a.y, a.width, a.height, scale);
      assert.ok(
        r.left >= 0 &&
          r.top >= 0 &&
          r.left + r.width <= size &&
          r.top + r.height <= size,
      );
    }
  }
  assert.ok(
    ANCHORS.stump.x < CHARACTER_SLOTS.marmot.x &&
      CHARACTER_SLOTS.marmot.x < ANCHORS.sprout.x,
  );
});
test("mobile source contains no Backend endpoint, authentication, WebView or network client", () => {
  // Recursively inspect source modules, not directories or QA JSON data registries.
  function scan(dir: string) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const full=dir+"/"+entry.name;
      if (entry.isDirectory()) { scan(full); continue; }
      if (!entry.isFile() || !/\.(?:tsx?|jsx?|mjs|cjs)$/.test(entry.name)) continue;
      const text=fs.readFileSync(full,"utf8");
      assert.doesNotMatch(
        text,
        /api\.joinlooper|railway\.app|supabase|\bfetch\s*\(|axios|XMLHttpRequest|WebView/,
        full
      );
    }
  }
  scan("app");
  scan("src");
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  assert.equal(app.expo.extra.productionApiEnabled, false);
  assert.equal(app.expo.updates.enabled, false);
});
test("all packaged art is existing non-character source with provenance", () => {
  const m = JSON.parse(fs.readFileSync("assets/PROVENANCE.json", "utf8"));
  assert.equal(m.noPrivateCharacterOriginals, true);
  assert.equal(m.noNewCharacterArt, true);
  assert.deepEqual(
    fs
      .readdirSync("assets")
      .filter((f) => f.endsWith(".png"))
      .sort(),
    ["forest-clearing.png", "sprout.png", "stump.png"],
  );
});

test("the local daily journey derives progress from existing demo actions", () => {
  const first = demoJourney(INITIAL_STATE);
  assert.deepEqual(first, {
    completed: 0,
    total: 3,
    next: "knowledge",
    nextLabel: "完成每日知識",
  });
  let state = demoReducer(INITIAL_STATE, { type: "answer", answer: "single-use" });
  assert.equal(demoJourney(state).completed, 0, "wrong answer does not advance");
  state = demoReducer(state, { type: "answer", answer: "reuse" });
  assert.deepEqual([demoJourney(state).completed, demoJourney(state).next], [1, "mission"]);
  state = demoReducer(state, { type: "mission" });
  assert.deepEqual([demoJourney(state).completed, demoJourney(state).next], [2, "sprout"]);
  state = demoReducer(state, { type: "care" });
  assert.deepEqual(demoJourney(state), {
    completed: 3,
    total: 3,
    next: null,
    nextLabel: "今天的示範互動已完成",
  });
  assert.deepEqual(RESOURCES, { exp: 20, stars: 6, energy: 8 });
  assert.equal(demoJourney(demoReducer(state, { type: "reset" })).completed, 0);
});

test("journey handles out-of-order demo actions without granting rewards", () => {
  const state = demoReducer(INITIAL_STATE, { type: "mission" });
  assert.deepEqual([demoJourney(state).completed, demoJourney(state).next], [1, "knowledge"]);
  assert.ok(Object.isFrozen(RESOURCES));
  const forest = fs.readFileSync("app/forest.tsx", "utf8");
  assert.match(forest, /testID="journey-progress"/);
  assert.match(forest, /testID="journey-next"/);
  assert.match(forest, /testID="return-welcome"/);
  assert.match(forest, /pulse\.stopAnimation\(\)/);
});
