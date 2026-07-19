import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const puppeteerModule =
  await import("file:///tmp/looper-browser/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js");
const chromiumModule =
  await import("file:///tmp/looper-browser/node_modules/@sparticuz/chromium/build/index.js");
const puppeteer = puppeteerModule.default;
const chromium = chromiumModule.default;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "output/runtime_assembly_v006/screenshots");
mkdirSync(outputDir, { recursive: true });

const externalUrl = process.env.LOOPER_CAPTURE_URL;
const captureUrl = externalUrl ?? "http://127.0.0.1:3000";
let server;

if (!externalUrl) {
  server = spawn(
    process.execPath,
    [
      join(root, "apps/web/node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3000",
    ],
    {
      cwd: join(root, "apps/web"),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Next production server 啟動逾時")),
      10_000,
    );
    const onOutput = (chunk) => {
      const message = chunk.toString();
      if (message.includes("Ready")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on("data", onOutput);
    server.stderr.on("data", onOutput);
    server.once("error", reject);
    server.once("exit", (code) => {
      if (code && code !== 0) reject(new Error(`Next server 結束：${code}`));
    });
  });
}

const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: "/tmp/looper-chromium/archive/chromium",
  env: {
    ...process.env,
    FONTCONFIG_PATH: "/tmp/looper-chromium/root",
    LD_LIBRARY_PATH: "/tmp/looper-chromium/root/lib:/tmp/looper-chromium/root",
  },
  dumpio: true,
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
await page.setRequestInterception(true);
page.on("request", async (request) => {
  const url = request.url();
  if (url === "http://localhost:4000/missions") {
    await request.respond({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
    return;
  }
  if (url === "http://localhost:4000/users/user-demo/state") {
    await request.respond({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "user-demo",
        displayName: "Runtime QA 旅人",
        stars: 600,
        enrollments: [],
      }),
    });
    return;
  }
  await request.continue();
});

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

await clickButton("我的森林");
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
          const seatParts = [...document.querySelectorAll("[data-seat-layer]")];
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
          scene.tail_rule === "visible_long_tapered_tail_in_actor_seated_back"),
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
await browser.close();
server?.kill("SIGTERM");
