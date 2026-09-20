import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { waitForImages } from "./runtime-capture-support.mjs";

export async function captureUnifiedRuntime(browser, root, outputDir) {
  if (!existsSync(join(root, "apps/web/.next/BUILD_ID")))
    throw new Error("Run `pnpm build` before runtime capture");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      join(root, "apps/web/node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: join(root, "apps/web"),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    },
  );
  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  let app;
  let store;
  let page;
  const errors = [];
  const requests = [];
  const screenshots = [];
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Next startup timeout: " + logs));
      }, 30_000);
      const ready = (chunk) => {
        if (chunk.toString().includes("Ready")) {
          cleanup();
          resolve();
        }
      };
      const failed = (error) => {
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error("Next exited: " + error + "\n" + logs),
        );
      };
      function cleanup() {
        clearTimeout(timer);
        server.stdout.off("data", ready);
        server.off("error", failed);
        server.off("exit", failed);
      }
      server.stdout.on("data", ready);
      server.once("error", failed);
      server.once("exit", failed);
    });
    const { buildApp } = await tsImport(
      pathToFileURL(join(root, "apps/api/src/app.ts")).href,
      import.meta.url,
    );
    const { InMemoryStore } = await tsImport(
      pathToFileURL(join(root, "apps/api/src/store.ts")).href,
      import.meta.url,
    );
    store = new InMemoryStore(":memory:");
    app = await buildApp(store, { playerAppUrl: origin, production: false });
    const session = store.createPlayerSession(
      {
        provider: "line",
        providerSubject: "qa-capture-resident",
        displayName: "QA Resident",
      },
      3600,
    );
    store.setUserResourcesForTest(session.context.userId, {
      currentLevel: 3,
      currentExp: 150,
      currentEnergy: 80,
      maxEnergy: 120,
      nextLevelExp: 330,
      unlockFlags: ["knowledge_card"],
    });
    page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        errors.push(message.text() + " " + (message.location().url ?? ""));
    });
    await page.setRequestInterception(true);
    const apiOrigin = new URL(
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    ).origin;
    page.on("request", (request) => {
      void (async () => {
        const url = new URL(request.url());
        if (url.origin === apiOrigin) {
          requests.push({ method: request.method(), path: url.pathname });
          const response = await app.inject({
            method: request.method(),
            url: url.pathname + url.search,
            headers: {
              ...request.headers(),
              origin,
              cookie: "looper_player_session=" + session.sessionToken,
            },
            ...(request.postData() ? { payload: request.postData() } : {}),
          });
          const headers = Object.fromEntries(
            Object.entries(response.headers)
              .filter(
                ([key]) =>
                  ![
                    "content-length",
                    "transfer-encoding",
                    "set-cookie",
                  ].includes(key),
              )
              .map(([key, value]) => [key, String(value)]),
          );
          await request.respond({
            status: response.statusCode,
            headers,
            body: response.body,
          });
        } else if (
          url.href === "https://static.line-scdn.net/liff/edge/2/sdk.js"
        ) {
          // Authentication is deliberately fixture-owned; this does not claim LINE credential QA.
          await request.respond({
            status: 200,
            contentType: "application/javascript",
            body: "/* QA session supplied by in-memory Backend */",
          });
        } else if (url.origin === origin && url.pathname === "/favicon.ico") {
          await request.respond({ status: 204 });
        } else if (
          url.origin === origin ||
          ["data:", "blob:"].includes(url.protocol)
        )
          await request.continue();
        else {
          errors.push("Unexpected external request: " + url.origin);
          await request.abort();
        }
      })().catch(async (error) => {
        errors.push(error.message);
        if (!request.isInterceptResolutionHandled()) await request.abort();
      });
    });
    const capture = async (name) => {
      await waitForImages(page);
      const state = await page.evaluate(() => ({
        scene: document
          .querySelector("[data-scene]")
          ?.getAttribute("data-scene"),
        focus: Number(
          document
            .querySelector("[data-primary-focus-count]")
            ?.getAttribute("data-primary-focus-count"),
        ),
        reducedMotion: document
          .querySelector("[data-reduced-motion]")
          ?.getAttribute("data-reduced-motion"),
        overflow: document.body.scrollWidth > innerWidth,
        errorOverlay: Boolean(
          document.querySelector("[data-nextjs-dialog], .vite-error-overlay"),
        ),
      }));
      assert.ok(state.focus <= 1);
      assert.equal(state.overflow, false);
      assert.equal(state.errorOverlay, false);
      const filename = name + "_unified.png";
      await page.screenshot({ path: join(outputDir, filename) });
      screenshots.push({ filename, ...state });
    };
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(origin, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-scene="forest"]');
    for (const [width, height] of [
      [390, 844],
      [375, 667],
      [1280, 720],
      [1440, 900],
    ]) {
      await page.setViewport({ width, height });
      await capture(`forest_${width}x${height}`);
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.click('button[aria-label="進入樹屋"]');
    await page.waitForSelector('[data-scene="treehouse"]');
    assert.equal(
      await page.$eval("[data-runtime-layer-count]", (node) =>
        node.getAttribute("data-runtime-layer-count"),
      ),
      "52",
    );
    await capture("treehouse_390x844");
    await page.click('button[aria-label="返回森林"]');
    await page.waitForSelector('[data-scene="forest"]');
    const beforeRestaurant = requests.length;
    const resourcesBefore = store.getUser(session.context.userId).resources;
    await page.click('button[aria-label="蔬食餐廳區施工中"]');
    await page.waitForSelector('[data-focus-owner="restaurant"]');
    assert.equal(
      await page.$$eval(
        '[data-focus-owner="restaurant"] button',
        (nodes) => nodes.length,
      ),
      1,
    );
    await capture("restaurant_locked");
    assert.equal(
      requests.slice(beforeRestaurant).filter((item) => item.method !== "GET")
        .length,
      0,
    );
    assert.deepEqual(
      store.getUser(session.context.userId).resources,
      resourcesBefore,
    );
    await page.click('button[aria-label="關閉蔬食餐廳區施工公告"]');
    await page.click('button[aria-label="查看森林成長"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-focus-owner="core_tree"]'),
    );
    await page.waitForNetworkIdle();
    await page.click('button[aria-label="關閉核心樹成長狀態"]');
    await page.click('button[aria-label="查看任務看板"]');
    await page.waitForSelector('button[aria-label="領取十顆星星"]');
    await page.click('button[aria-label="領取十顆星星"]');
    await page.waitForSelector('[data-mission-backend-state="CLAIMED"]');
    assert.equal(
      store.getUser(session.context.userId).resources.starBalance,
      10,
    );
    await capture("mission_claimed");
    await page.click('button[aria-label="關閉森林任務"]');
    await page.click('button[aria-label="查看永續小知識"]');
    await page.waitForSelector('[role="radio"]');
    await page.click('[role="radio"]');
    await page.click(".knowledge-native-overlay__submit");
    await page.waitForFunction(() =>
      document
        .querySelector(".knowledge-native-overlay__body")
        ?.textContent?.includes("EXP +50"),
    );
    const answered = store.getUser(session.context.userId);
    assert.equal(answered.resources.starBalance, 110);
    assert.equal(answered.resources.currentExp, 200);
    await capture("knowledge_answered");
    await page.click('button[aria-label="關閉每日永續小知識"]');
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('[data-scene="forest"]');
    await page.click('button[aria-label="查看永續小知識"]');
    await page.waitForSelector('[role="radio"][disabled]');
    assert.equal(await page.$(".knowledge-native-overlay__submit"), null);
    assert.equal(
      store
        .listResourceTransactions()
        .filter(
          (item) =>
            item.resourceType === "exp" &&
            item.sourceId.startsWith("knowledge-card-attempt-"),
        ).length,
      1,
    );
    assert.equal(
      store.getUser(session.context.userId).resources.currentExp,
      200,
    );
    await capture("knowledge_completed_reload");
    assert.deepEqual(errors, []);
    const result = {
      result: "PASS",
      scope:
        "production Web build + real Backend with in-memory QA session; no LINE credential or production DB",
      screenshots,
      requests,
      console_errors: errors,
      knowledge_exp_ledger_entries: 1,
      restaurant_mutations: 0,
    };
    writeFileSync(
      join(dirname(outputDir), "unified-browser-evidence.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log("Unified Runtime browser capture: PASS");
  } catch (error) {
    writeFileSync(
      join(dirname(outputDir), "unified-browser-evidence.json"),
      JSON.stringify(
        {
          result: "FAIL",
          error: error.stack,
          screenshots,
          requests,
          console_errors: errors,
          server_log: logs,
        },
        null,
        2,
      ) + "\n",
    );
    throw error;
  } finally {
    await page?.close();
    await app?.close();
    store?.close();
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  }
}
