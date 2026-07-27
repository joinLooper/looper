import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = join(root, "apps/web/app/forest-runtime-contracts");
const assets = join(root, "apps/web/public/runtime-assets/forest-v002");
const app = readFileSync(join(root, "apps/web/app/page.tsx"), "utf8");
const runtime = readFileSync(
  join(root, "apps/web/app/forest-logical-runtime.tsx"),
  "utf8",
);
const runtimeConfig = readFileSync(
  join(root, "apps/web/app/forest-runtime.ts"),
  "utf8",
);
const css = readFileSync(join(root, "apps/web/app/mobile.css"), "utf8");
const guidance = readFileSync(
  join(root, "apps/web/app/resident-guidance.ts"),
  "utf8",
);

const load = (name) =>
  JSON.parse(readFileSync(join(contracts, name), "utf8"));
const scene = load("forest_scene_manifest.v2.json");
const transforms = load("forest_transform_map.v2.json");
const anchors = load("forest_anchor_map.v2.json");
const hotspots = load("forest_hotspot_map.v2.json");
const responsive = load("forest_responsive_map.v2.json");
const states = load("forest_state_map.v2.json");
const preload = load("forest_preload_map.v2.json");
const density = load("forest_density_status.v2.json");

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

check(scene.schema_version === "2.0.0", "scene manifest schema");
check(scene.logical_canvas === "390x844", "logical canvas");
check(scene.logical_density === 1, "logical density");
check(scene.layers.length === 26, "26 formal layers");
check(new Set(scene.layers.map((layer) => layer.layer_id)).size === 26, "unique layer IDs");
check(scene.composition_lock.transform_changes === 0, "transform lock");
check(scene.composition_lock.anchor_changes === 0, "anchor lock");
check(scene.composition_lock.hotspot_changes === 0, "hotspot lock");

const transformById = new Map(
  transforms.layers.map((layer) => [layer.layer_id, layer]),
);
for (const layer of scene.layers) {
  const path = join(assets, ...layer.route.split("/"));
  const transform = transformById.get(layer.layer_id);
  check(existsSync(path), `asset missing: ${layer.route}`);
  check(existsSync(path) && sha256(path) === layer.sha256, `asset SHA: ${layer.layer_id}`);
  check(Boolean(transform), `transform missing: ${layer.layer_id}`);
  check(transform?.x === layer.x, `x changed: ${layer.layer_id}`);
  check(transform?.y === layer.y, `y changed: ${layer.layer_id}`);
  check(transform?.scale === layer.scale, `scale changed: ${layer.layer_id}`);
  check(
    JSON.stringify(transform?.pivot) === JSON.stringify(layer.pivot),
    `pivot changed: ${layer.layer_id}`,
  );
  check(transform?.["z-index"] === layer.z_index, `z-index changed: ${layer.layer_id}`);
  check(transform?.visibility === layer.visibility, `visibility changed: ${layer.layer_id}`);
}

const hotspotEntries = Object.entries(hotspots.hotspots);
check(hotspotEntries.length === 8, "7 scene hotspots plus settings");
check(hotspots.static_overlap_check.pairs_checked === 28, "28 hotspot pairs");
check(hotspots.static_overlap_check.status === "pass", "hotspot overlap status");
check(
  hotspots.static_overlap_check.pair_results.every((pair) => pair.overlap_area === 0),
  "hotspot overlaps are zero",
);
for (const [id, hotspot] of hotspotEntries) {
  check(hotspot.width >= 44 && hotspot.height >= 44, `minimum hotspot size: ${id}`);
  check(runtime.includes(id), `runtime hotspot: ${id}`);
}

check(anchors.schema_version === "2.0.0", "anchor map schema");
check(responsive.schema_version === "2.0.0", "responsive map schema");
check(states.schema_version === "2.0.0", "state map schema");
check(preload.schema_version === "2.0.0", "preload map schema");
check(states.dynamic_values_baked === false, "no dynamic values baked");
check(states.machines.core_tree.states.growth_available.asset === null, "growth_available reserved");
check(states.machines.core_tree.states.growth_reached.asset === null, "growth_reached reserved");
check(states.machines.restaurant.states.future_open.asset === null, "future_open reserved");
check(states.machines.restaurant.default === "locked", "restaurant locked");
check(preload.categories.initial_critical.length === 11, "initial critical list");
check(preload.categories.initial_secondary.length === 6, "initial secondary list");
check(preload.categories.state_triggered.length === 6, "state-triggered list");
check(density.logical_density === 1, "density map logical 1x");
check(density.native_2x_status === "deferred_source_missing", "native 2x deferred");
check(density.native_3x_status === "deferred_source_missing", "native 3x deferred");

for (const target of [
  "forest_scene",
  "character_area",
  "core_tree",
  "mission_board",
  "restaurant",
]) {
  check(guidance.includes(`target: "${target}"`), `guidance target: ${target}`);
  check(runtime.includes(`"${target}"`), `runtime guidance target: ${target}`);
}
check(guidance.match(/\n    id: "/g)?.length === 6, "six guidance steps");
check(guidance.includes("looper.web.residentGuidance.v1"), "persistence namespace retained");
check(app.includes("forestCriticalReady"), "guidance waits for critical assets");
check(app.includes('setScreen("forest")'), "guidance opens forest");
check(app.includes("missionUnread={Boolean(missionTask"), "mission canonical-derived state");
check(app.includes("level: player.level"), "real level");
check(app.includes("exp: player.exp"), "real EXP");
check(app.includes("stars: player.stars"), "real stars");
check(app.includes("growth: player.growth"), "real growth");
check(app.includes(": null"), "safe loading state without a mock player");
check(!runtime.includes("user-demo"), "no demo player state");
check(!runtime.includes("@2x") && !runtime.includes("@3x"), "no interpolated density route");
check(runtime.includes("sceneOnly=\"treehouse_main\""), "treehouse route retained");
check(runtime.includes("onOpenKnowledge"), "knowledge route retained");
check(runtime.includes("onOpenMissions"), "mission route retained");
check(runtime.includes("onOpenRestaurant"), "locked restaurant route retained");
check(!runtime.includes("task-code"), "restaurant has no task-code path");
check(!runtime.includes("settlement"), "restaurant has no settlement path");
check(app.includes('screen !== "forest" ? <nav'), "old bottom navigation disabled on forest");
check(!runtime.includes("/runtime-assets/v005"), "old forest assets absent from formal scene");
check(!runtime.includes("candidate"), "candidate character absent");
check(!runtime.includes("notification"), "notification center absent");
check(css.includes("pointer-events: none"), "decorative layers do not intercept");
check(css.includes(".forest-logical-hotspot:focus-visible"), "hotspot visible focus");
check(css.includes("@media (min-width: 48rem)"), "desktop core canvas policy");
check(css.includes("prefers-reduced-motion: reduce"), "system reduced motion");
check(css.includes(".reduce-motion .forest-hud-live__meter"), "player reduced motion");
check(runtimeConfig.includes("initialCriticalPromise"), "critical preload cache");

console.log(`Forest logical runtime checks: ${checks}`);
console.log(`Formal layers checked: ${scene.layers.length}`);
console.log(`Hotspot pairs checked: ${hotspots.static_overlap_check.pairs_checked}`);
console.log(`Failures: ${failures.length}`);
for (const failure of failures) console.error(`- ${failure}`);
if (failures.length) process.exitCode = 1;
