import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCaptureContext,
  waitForImages,
} from "./runtime-capture-support.mjs";
import { captureUnifiedRuntime } from "./capture-unified-runtime.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "output/runtime_assembly_v006/screenshots");
mkdirSync(outputDir, { recursive: true });
let context;
rmSync(join(dirname(outputDir), "capture-failure.json"), { force: true });
try {
  context = await createCaptureContext(root);
  const page = await context.browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
  const captureUrl = process.env.LOOPER_CAPTURE_URL ?? context.fixtureUrl;
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(captureUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);

  async function clickButton(label) {
    const clicked = await page.evaluate((buttonLabel) => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === buttonLabel,
      );
      button?.click();
      return Boolean(button);
    }, label);
    if (!clicked) throw new Error(`找不到按鈕：${label}`);
    await new Promise((resolve) => setTimeout(resolve, 220));
  }

  await page.waitForSelector(".runtime-assembly");
  await clickButton("顯示接線");

  const assembly = await page.$(".runtime-assembly");
  if (!assembly) throw new Error("找不到 runtime assembly renderer");

  const actorLabels = [
    ["兔兔左 3/4", "rabbit_left"],
    ["兔兔右 3/4", "rabbit_right"],
    ["土撥鼠左 3/4", "marmot_left"],
    ["土撥鼠右 3/4", "marmot_right"],
  ];
  const sceneLabels = [
    ["森林", "forest_clearing"],
    ["樹屋", "treehouse_main"],
  ];
  const sceneRuntimeEvidence = [];
  const screenshots = [];

  for (const [sceneLabel, sceneId] of sceneLabels) {
    await clickButton(sceneLabel);
    for (const [actorLabel, actorId] of actorLabels) {
      await clickButton(actorLabel);
      const filename = `${sceneId}_${actorId}_runtime_v006.png`;
      await waitForImages(page);
      await assembly.screenshot({ path: join(outputDir, filename) });
      screenshots.push({ label: `${sceneLabel} / ${actorLabel}`, filename });
      sceneRuntimeEvidence.push(
        await page.evaluate(
          ({ sceneLabel, actorLabel }) => {
            const canvas = document.querySelector(".runtime-scene-canvas");
            const layers = [...document.querySelectorAll(".runtime-layer")];
            const actorParts = [
              ...document.querySelectorAll("[data-actor-layer]"),
            ];
            const seatParts = [
              ...document.querySelectorAll("[data-seat-layer]"),
            ];
            const actorBack = document.querySelector(
              "[data-actor-layer='actor_seated_back']",
            );
            return {
              label: `${sceneLabel} / ${actorLabel}`,
              scene_id: canvas?.getAttribute("data-scene-id"),
              canvas: canvas?.getAttribute("data-canvas"),
              ground_y: canvas?.getAttribute("data-ground-y"),
              layer_count: layers.length,
              layer_order: layers.map((node) =>
                node.getAttribute("data-z-layer"),
              ),
              actor_id: actorBack?.getAttribute("data-actor-id"),
              seat_anchor: actorBack?.getAttribute("data-seat-anchor"),
              tail_rule: actorBack?.getAttribute("data-tail-rule"),
              actor_layers: actorParts.map((node) =>
                node.getAttribute("data-actor-layer"),
              ),
              seat_layers: seatParts.map((node) =>
                node.getAttribute("data-seat-layer"),
              ),
              seat_gates: seatParts.map((node) =>
                node.getAttribute("data-runtime-gate"),
              ),
              action_energy_costs: [
                ...document.querySelectorAll("[data-action-energy-cost]"),
              ].map((node) => node.getAttribute("data-action-energy-cost")),
            };
          },
          { sceneLabel, actorLabel },
        ),
      );
    }
  }

  const staticPreviewEvidence = [];
  for (const [label, previewId] of [
    ["澆水壺", "t6_watering"],
    ["掃把", "t6_broom"],
    ["點心托盤", "t6_snack_tray"],
    ["兔兔圍巾", "d9_rabbit_scarf"],
    ["土撥鼠圍巾", "d9_mole_scarf"],
  ]) {
    await clickButton(label);
    const filename = `${previewId}_runtime_v006.png`;
    await waitForImages(page);
    await assembly.screenshot({ path: join(outputDir, filename) });
    screenshots.push({ label, filename });
    staticPreviewEvidence.push(
      await page.evaluate((previewLabel) => {
        const preview = document.querySelector(".runtime-static-preview");
        return {
          label: previewLabel,
          preview_id: preview?.getAttribute("data-preview-id"),
          gate: preview?.getAttribute("data-runtime-gate"),
          runtime_mask: preview?.getAttribute("data-runtime-mask"),
        };
      }, label),
    );
  }

  const runtimeEvidence = await page.evaluate(() => {
    const assemblyRoot = document.querySelector(".runtime-assembly");
    const html = document.documentElement.textContent ?? "";
    return {
      contract: assemblyRoot?.getAttribute("data-contract"),
      central_sync: assemblyRoot?.getAttribute("data-central-sync"),
      energy_enabled: assemblyRoot?.getAttribute("data-energy-enabled"),
      action_energy_cost: assemblyRoot?.getAttribute("data-action-energy-cost"),
      live_ui_has_energy_text: html.includes("活力") || html.includes("⚡"),
      live_ui_has_legacy_cost:
        html.includes("10 活力") ||
        html.includes("20 活力") ||
        html.includes("15 活力"),
    };
  });

  const expectedLayerOrder = [
    "scene_background",
    "cushion_back",
    "prop_back",
    "equipment_back",
    "actor_seated_back",
    "held_prop",
    "cushion_front_rim",
    "actor_seated_feet_front",
    "actor_chin_neck_fur_front",
    "face_rig",
    "prop_front",
    "fx_front",
    "ui_overlay",
  ];

  const result = {
    schema: "looper.runtime-assembly-browser-evidence.v6",
    viewport: { width: 430, height: 932, device_scale_factor: 2 },
    source_head: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    platform: process.platform,
    browser: context.browserVersion,
    capture_scope:
      "existing assembly component in isolated QA host; not the product entry",
    screenshots,
    console_errors: consoleErrors,
    scenes: sceneRuntimeEvidence,
    static_previews: staticPreviewEvidence,
    ...runtimeEvidence,
    ios_qa: "Not tested",
    android_qa: "Not tested",
    result:
      consoleErrors.length === 0 &&
      runtimeEvidence.contract === "looper.runtime-assembly-handoff.v6" &&
      runtimeEvidence.central_sync === "true" &&
      runtimeEvidence.live_ui_has_energy_text === false &&
      runtimeEvidence.live_ui_has_legacy_cost === false &&
      runtimeEvidence.energy_enabled === "false" &&
      runtimeEvidence.action_energy_cost === "null" &&
      sceneRuntimeEvidence.length === 8 &&
      sceneRuntimeEvidence.every(
        (scene) =>
          scene.layer_count === 13 &&
          JSON.stringify(scene.layer_order) ===
            JSON.stringify(expectedLayerOrder) &&
          scene.actor_layers.join(",") ===
            "actor_seated_back,actor_seated_feet_front" &&
          scene.seat_layers.join(",") === "cushion_back,cushion_front_rim" &&
          scene.seat_gates.every((gate) => gate === "RUNTIME_V006_PASS") &&
          scene.action_energy_costs.every((cost) => cost === "null") &&
          (!scene.actor_id.startsWith("marmot_") ||
            scene.tail_rule ===
              "visible_long_tapered_tail_in_actor_seated_back"),
      ) &&
      staticPreviewEvidence.length === 5 &&
      staticPreviewEvidence.every(
        (preview) =>
          preview.gate === "static_preview_only" &&
          preview.runtime_mask === "pending",
      )
        ? "PASS"
        : "FAIL",
  };

  writeFileSync(
    join(dirname(outputDir), "runtime-browser-evidence.v006.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  console.log(JSON.stringify(result, null, 2));
  if (result.result !== "PASS")
    throw new Error(
      "Runtime assembly capture failed; see runtime-browser-evidence.v006.json",
    );
  await captureUnifiedRuntime(context.browser, root, outputDir);
} catch (error) {
  writeFileSync(
    join(dirname(outputDir), "capture-failure.json"),
    JSON.stringify({ result: "FAIL", error: error.stack }, null, 2) + "\n",
  );
  throw error;
} finally {
  await context?.cleanup();
}
