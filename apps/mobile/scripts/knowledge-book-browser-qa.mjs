/** Real Expo Web interaction QA. No reference composites or player APIs.
 * KB_QA_TOOL_ROOT may point to an existing, version-pinned puppeteer installation.
 * node .../knowledge-book-browser-qa.mjs http://127.0.0.1:8097 output/knowledge-book-browser
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
const require = createRequire(process.env.KB_QA_TOOL_ROOT ? resolve(process.env.KB_QA_TOOL_ROOT, "package.json") : import.meta.url);
const puppeteer = require("puppeteer");
const base = process.argv[2] ?? "http://127.0.0.1:8097";
const output = resolve(process.argv[3] ?? "output/knowledge-book-browser");
const viewportOnly = process.argv.includes("--viewport-only");
await mkdir(output, { recursive: true });
const executablePath = [process.env.KB_QA_BROWSER_EXECUTABLE, puppeteer.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));
if (!executablePath) throw Error("BROWSER_NOT_INSTALLED: set KB_QA_BROWSER_EXECUTABLE; no browser download is performed");
const browser = await puppeteer.launch({ headless: true, executablePath });
const evidence = { mode: "REAL_EXPO_WEB", art: "SOURCE_BYTES_UNAVAILABLE", iphone: "NOT_RUN", viewports: [], screenshots: [], failures: [] };
try {
  for (const viewport of [{ width: 360, height: 640, label: "9x16" }, { width: 390, height: 845, label: "9x19_5" }]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const errors = [], ledgerRequests = [], resourceFailures = [], hits = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (/\/player\/|knowledge-cards\/.*answers/.test(request.url())) ledgerRequests.push({ url: request.url(), method: request.method() }); });
    page.on("response", response => { if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) resourceFailures.push({ url: response.url(), status: response.status() }); });
    const selector = id => `[data-testid="${id}"]`;
    const wait = id => page.waitForSelector(selector(id), { visible: true, timeout: 60000 });
    const copy = async id => page.$eval(selector(id), element => element.textContent);
    const click = async id => {
      await wait(id);
      await page.$eval(selector(id), element => element.scrollIntoView({ block: "center" }));
      const box = await page.$eval(selector(id), element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      assert.ok(box.height >= (id.startsWith("kb-option-") ? 56 : 48), `${id} touch height`);
      assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, `${id} within horizontal safe area`);
      hits.push({ id, ...box }); await page.tap(selector(id));
    };
    const capture = async name => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow");
      const file = `${viewport.label}-${name}.png`;
      await page.screenshot({ path: resolve(output, file) });
      const bytes = await readFile(resolve(output, file));
      evidence.screenshots.push({ file, width: viewport.width, height: viewport.height, sha256: createHash("sha256").update(bytes).digest("hex") });
    };
    const top = async () => page.$eval(selector("kb-scroll"), element => { element.scrollTop = 0; });
    await page.goto(base + "/knowledge-book-qa", { waitUntil: "networkidle0" });
    const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(layout.width, viewport.width); assert.equal(layout.height, viewport.height); assert.equal(layout.documentWidth, viewport.width); assert.ok(layout.scrollWidth <= viewport.width);
    if (viewportOnly) { await wait("kb-intro"); evidence.viewports.push({ ...viewport, status: "PASS", layout }); await context.close(); continue; }
    await wait("kb-intro"); await capture("intro");
    await click("kb-fixture-lv1"); await click("kb-open"); await wait("kb-level-locked"); await capture("lv1-locked");
    await click("kb-fixture-lv3"); await click("kb-open"); await wait("kb-paper");
    assert.equal(await copy("kb-paper-state"), "未作答"); await top(); await capture("unanswered");
    assert.equal(await page.$eval(selector("kb-submit"), element => element.getAttribute("aria-disabled")), "true");
    await click("kb-option-0"); assert.equal(await copy("kb-paper-state"), "已選取"); await top(); await capture("selected");
    await click("kb-submit"); await wait("kb-explanation"); assert.equal(await copy("kb-paper-state"), "答對了");
    assert.match(await copy("kb-count"), /已答 1 題/); await top(); await capture("correct");
    await page.$eval(selector("kb-explanation"), element => element.scrollIntoView({ block: "center" })); await capture("correct-explanation");
    await click("kb-complete"); assert.equal(await copy("kb-paper-state"), "已完成"); await top(); await capture("completed");
    await click("kb-close"); await click("kb-review-0"); assert.equal(await copy("kb-paper-state"), "已完成"); assert.match(await copy("kb-count"), /已答 1 題/);
    await click("kb-next"); assert.match(await copy("kb-question"), /飲料/); assert.equal(await page.$(selector("kb-illustration-pending")), null);
    await click("kb-option-0"); await click("kb-submit"); assert.equal(await copy("kb-paper-state"), "再學一點"); assert.match(await copy("kb-count"), /已答 2 題/);
    await top(); await capture("incorrect"); await page.$eval(selector("kb-explanation"), element => element.scrollIntoView({ block: "center" })); await capture("incorrect-explanation");
    await click("kb-complete"); await click("kb-next"); await wait("kb-policy-pending"); await top(); await capture("energy-policy-pending");
    assert.equal(await page.$(selector("kb-submit")), null); assert.match(await copy("kb-count"), /已答 2 題/);
    await click("kb-close"); await click("kb-open"); assert.equal(await copy("kb-paper-state"), "已完成"); assert.match(await copy("kb-count"), /已答 2 題/);
    await click("kb-return-forest"); await page.waitForFunction(() => location.pathname === "/forest");
    // Same-day route memory is also covered by the external-store unit test.
    assert.deepEqual(ledgerRequests, []); assert.deepEqual(errors, []); assert.deepEqual(resourceFailures, []);
    evidence.viewports.push({ ...viewport, status: "PASS", layout, errors, ledgerRequests, resourceFailures, hits, returnForest: "PASS" });
    await context.close();
  }
} catch (error) {
  evidence.failures.push(error.stack ?? String(error)); throw error;
} finally {
  await writeFile(resolve(output, "browser-evidence.json"), JSON.stringify(evidence, null, 2));
  // Some Windows Chrome builds leave the spawned browser alive after CDP close.
  // Bound cleanup to this test's own child process; never touch a user's browser.
  const cleanup = setTimeout(() => { browser.process()?.kill(); }, 10000);
  try { await browser.close(); } finally { clearTimeout(cleanup); }
  console.log(JSON.stringify({ output, viewports: evidence.viewports.length, screenshots: evidence.screenshots.length, failures: evidence.failures }));
}
