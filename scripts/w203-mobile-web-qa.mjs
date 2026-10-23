/**
 * W2-03 responsive RN-Web QA; supplementary to physical iPhone Expo Go.
 * Intentionally no Android SDK/emulator, no real accounts, no Backend.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { resolve, join, extname, sep } from "node:path";
import puppeteer from "puppeteer";

const root = process.cwd();
const dist = resolve(root, "apps/mobile/dist");
const output = resolve(root, "output/w203-mobile-web");
mkdirSync(output, { recursive: true });
assert.ok(existsSync(join(dist, "index.html")), "Run mobile build:web before QA");

const mediaTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};
const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
    const relative = decodeURIComponent(url.pathname);
    let file = resolve(dist, "." + relative);
    if (file !== dist && !file.startsWith(dist + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(file)) {
        res.writeHead(404).end("Missing static asset");
        return;
      }
      file = join(dist, "index.html");
    }
    res.setHeader("content-type", mediaTypes[extname(file).toLowerCase()] || "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    res.end(readFileSync(file));
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
let browser;
const result = {
  schema: "looper.w203.mobile-web-qa.v1",
  scope: "RN Web desktop Chrome mobile viewport; NOT Android Native or iPhone device",
  android_physical: "DEFERRED_BY_USER",
  android_native: "NOT_RUN",
  ios_physical: "NOT_RUN",
  devices: [],
  status: "FAIL",
};
async function wait(page, id) {
  const selector = '[data-testid="' + id + '"]';
  await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  return selector;
}
async function press(page, id) {
  const selector = await wait(page, id);
  await page.click(selector);
}
async function settle(page, milliseconds = 650) {
  await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
  await new Promise((done) => setTimeout(done, milliseconds));
}
async function artFingerprint(page) {
  return page.$eval('[data-testid="task-journal-art"]', (root) =>
    [root, ...root.querySelectorAll("*")].map((node) => [
      node.getAttribute("src") || "",
      node.currentSrc || "",
      node.style?.backgroundImage || "",
      getComputedStyle(node).backgroundImage || "",
    ].join("|")).join(";"));
}
async function shot(page, label) {
  await page.screenshot({ path: join(output, label + ".png"), fullPage: false });
}
async function geometry(page) {
  return await page.evaluate(() => {
    const selectors = [
      "stump-hotspot", "open-progress", "open-backpack", "open-tools", "sprout-hotspot",
    ];
    const controls = selectors.map((id) => {
      const element = document.querySelector('[data-testid="' + id + '"]');
      if (!element) return { id, missing: true };
      const r = element.getBoundingClientRect();
      return {
        id, x: Math.round(r.left), y: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height),
        inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
        imageCount: element.querySelectorAll("img").length,
      };
    });
    return {
      width: innerWidth,
      height: innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      controls,
    };
  });
}
try {
  browser = await puppeteer.launch({
    headless: true,
    ...(process.env.CI === "true" ? { args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] } : {}),
  });
  for (const [name, width, height] of [
    ["9x16", 360, 640],
    ["9x19_5", 360, 780],
  ]) {
    const page = await browser.newPage();
    const device = { name, width, height, screenshots: [], pageErrors: [], consoleErrors: [] };
    result.devices.push(device);
    page.on("pageerror", (error) => device.pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") device.consoleErrors.push(message.text());
    });
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.goto(base + "/", { waitUntil: "networkidle0", timeout: 45000 });
      await press(page, "enter-forest");
      await wait(page, "stump-hotspot");
      await page.waitForFunction(() => !document.querySelector('[data-testid="scene-loading"]'), { timeout: 20000 });
      await settle(page, 400);
      await shot(page, name + "-forest");
      device.screenshots.push(name + "-forest.png");
      device.forest = await geometry(page);
      assert.equal(device.forest.width, width,
        name + " layout viewport mismatch; mobile viewport meta not applied");
      assert.equal(device.forest.height, height,
        name + " layout height mismatch; mobile emulation drifted");
      assert.equal(device.forest.horizontalOverflow, false, name + " horizontal overflow");
      for (const control of device.forest.controls) {
        assert.equal(control.missing, undefined, name + " missing " + control.id);
        assert.ok(control.width >= 48 && control.height >= 48, name + " undersized " + control.id);
        assert.equal(control.inside, true, name + " clipped " + control.id);
      }
      for (const id of ["stump-hotspot", "open-progress", "open-backpack", "open-tools"]) {
        const control = device.forest.controls.find((x) => x.id === id);
        assert.ok(control.imageCount >= 1, name + " approved prop image missing: " + id);
      }
      await press(page, "open-progress");
      await wait(page, "forest-notebook");
      const notebookBounds = await page.$eval('[data-testid="forest-notebook"]', (el) => {
        const r = el.getBoundingClientRect();
        return { left:r.left, right:r.right, width:r.width, viewport:window.innerWidth };
      });
      assert.ok(notebookBounds.left >= -1 &&
        notebookBounds.right <= notebookBounds.viewport + 1 &&
        notebookBounds.width >= 240,
        name + " mission notebook horizontally clipped: " + JSON.stringify(notebookBounds));
      await wait(page, "task-journal-art");
      await wait(page, "worldbook-page");
      await wait(page, "complete-mission");
      await settle(page);
      await shot(page, name + "-mission-open");
      device.screenshots.push(name + "-mission-open.png");
      const before = await artFingerprint(page);
      await press(page, "complete-mission");
      await page.waitForFunction(() => document.querySelector('[data-testid="mission-feedback"]')?.textContent?.includes("已完成"), { timeout: 12000 });
      await settle(page, 400);
      const after = await artFingerprint(page);
      device.missionVisualStateChanged = before !== after;
      await shot(page, name + "-mission-complete");
      device.screenshots.push(name + "-mission-complete.png");
      await press(page, "open-world-progress");
      await wait(page, "world-progress-summary");
      await wait(page, "task-journal-art");
      await settle(page, 300);
      await shot(page, name + "-world-progress");
      device.screenshots.push(name + "-world-progress.png");
      await press(page, "close-sheet");
      await page.waitForSelector('[data-testid="forest-notebook"]', { hidden: true, timeout: 12000 });
      await press(page, "open-backpack");
      await wait(page, "forest-notebook");
      await settle(page);
      await shot(page, name + "-backpack");
      device.screenshots.push(name + "-backpack.png");
      await press(page, "close-sheet");
      await page.waitForSelector('[data-testid="forest-notebook"]', { hidden: true, timeout: 12000 });
      await press(page, "open-tools");
      await wait(page, "forest-notebook");
      await settle(page, 250);
      await shot(page, name + "-forest-settings");
      device.screenshots.push(name + "-forest-settings.png");
      await press(page, "close-sheet");
      await page.waitForSelector('[data-testid="forest-notebook"]', { hidden: true, timeout: 12000 });
      await press(page, "stump-hotspot");
      await wait(page, "answer-reuse");
      await wait(page, "forest-notebook");
      await wait(page, "knowledge-open-pages");
      await wait(page, "knowledge-page-surface");
      assert.ok(await page.$('[data-testid="forest-scene"]'), name + " lost forest behind knowledge");
      await settle(page, 300);
      await shot(page, name + "-knowledge");
      device.screenshots.push(name + "-knowledge.png");
      await press(page, "answer-single");
      await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-feedback"]')?.textContent?.includes("再想一想"));
      await press(page, "answer-reuse");
      await page.waitForFunction(() => document.querySelector('[data-testid="knowledge-feedback"]')?.textContent?.includes("答對了"));
      await shot(page, name + "-knowledge-complete");
      device.screenshots.push(name + "-knowledge-complete.png");
      await press(page, "close-sheet");
      await page.waitForSelector('[data-testid="forest-notebook"]', { hidden: true });
      assert.ok(await page.$('[data-testid="forest-scene"]'), name + " knowledge close lost forest");

      // Legacy deep-link paths must also render a Forest scene + world panel.
      await page.goto(base + "/progress", { waitUntil: "networkidle0", timeout: 45000 });
      await wait(page, "world-progress-summary");
      await wait(page, "forest-scene");
      await settle(page, 300);
      await shot(page, name + "-direct-progress");
      device.screenshots.push(name + "-direct-progress.png");
      await page.goto(base + "/knowledge", { waitUntil: "networkidle0", timeout: 45000 });
      await wait(page, "answer-reuse");
      await wait(page, "forest-scene");
      await settle(page, 300);
      await shot(page, name + "-direct-knowledge");
      device.screenshots.push(name + "-direct-knowledge.png");
      assert.deepEqual(device.pageErrors, [], name + " uncaught browser error");
      device.status = "PASS";
    } catch (error) {
      device.status = "FAIL";
      device.error = error instanceof Error ? error.message : String(error);
      try {
        await shot(page, name + "-failure");
        device.screenshots.push(name + "-failure.png");
      } catch {}
    } finally {
      await page.close();
    }
  }
  result.status = result.devices.every((device) => device.status === "PASS") ? "PASS" : "FAIL";
} finally {
  if (browser) await browser.close();
  await new Promise((ok) => server.close(ok));
  writeFileSync(join(output, "qa-result.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
}
if (result.status !== "PASS") process.exitCode = 1;
