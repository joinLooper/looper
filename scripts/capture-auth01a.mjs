import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer";

const root = process.cwd(),
  dir = resolve("output/auth01a/web-preview");
mkdirSync(dir, { recursive: true });
const require = createRequire(join(root, "apps/merchant/package.json"));
await build({
  stdin: {
    contents: `import {createRoot} from ${JSON.stringify(require.resolve("react-dom/client"))};import Login from ${JSON.stringify(join(root, "apps/merchant/app/google-login.tsx"))};createRoot(document.getElementById('root')).render(<Login invitation={new URLSearchParams(location.search).get('case')!=='returning'}/>);`,
    resolveDir: join(root, "apps/merchant"),
    loader: "tsx",
  },
  bundle: true,
  jsx: "automatic",
  platform: "browser",
  outfile: join(dir, "preview.js"),
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_API_URL": '"https://auth01a.test"',
  },
});
writeFileSync(
  join(dir, "preview.css"),
  readFileSync("apps/merchant/app/globals.css"),
);
const mock = `
const scenario=new URLSearchParams(location.search).get('case')||'invite';
let callback;let attempt=0;window.qaCalls=[];
window.google={accounts:{id:{initialize:o=>{callback=o.callback;window.qaNonce=o.nonce},renderButton:el=>{const b=document.createElement('button');b.textContent='使用 Google 登入（測試）';b.onclick=()=>callback({credential:'synthetic-preview-only'});el.append(b)}}}};
window.fetch=async(input,init={})=>{
 const url=String(input);window.qaCalls.push({url,method:init.method||'GET'});
 if(scenario==='network'&&attempt++===0)throw new TypeError('Synthetic network failure');
 let body={},status=200;
 if(url.endsWith('/config'))body={enabled:scenario!=='disabled',clientId:'preview-only'};
 else if(url.endsWith('/challenge')){
  if(scenario==='expired'){status=409;body={code:'INVITATION_EXPIRED'}}
  else body={state:'s'.repeat(43),nonce:'n'.repeat(43)};
 }else if(url.endsWith('/session')){
  const codes={conflict:'GOOGLE_ACCOUNT_CONFLICT',permission:'MERCHANT_INVITATION_REQUIRED',unknown:'GOOGLE_COMMIT_OUTCOME_UNKNOWN'};
  if(codes[scenario]){status=scenario==='unknown'?503:403;body={code:codes[scenario]}}
  else body={authenticated:true};
 }
 return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
};`;
writeFileSync(
  join(dir, "preview.html"),
  `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>AUTH-01A 測試預覽</title><link rel="stylesheet" href="preview.css"><body><aside style="position:fixed;top:0;left:0;right:0;z-index:5;padding:8px;text-align:center;font-size:12px;background:#fff">隔離 UI 測試預覽・模擬 Google 元件，未連接真實登入</aside><div id="root"></div><script>${mock}</script><script src="preview.js"></script></body></html>`,
);
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = path === "/" ? "preview.html" : path.slice(1);
  if (!["preview.html", "preview.js", "preview.css"].includes(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "content-type",
    file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : "text/html; charset=utf-8",
  );
  res.end(readFileSync(join(dir, file)));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
const results = [];
try {
  const managed = puppeteer.executablePath();
  browser = await puppeteer.launch({
    ...(process.env.LOOPER_CAPTURE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.LOOPER_CAPTURE_BROWSER_EXECUTABLE }
      : process.env.LOOPER_CAPTURE_BROWSER_CHANNEL
        ? { channel: process.env.LOOPER_CAPTURE_BROWSER_CHANNEL }
        : existsSync(managed)
          ? { executablePath: managed }
          : { channel: "chrome" }),
    ...(process.platform === "linux" && process.env.CI === "true"
      ? { args: ["--no-sandbox", "--disable-setuid-sandbox"] }
      : {}),
    headless: true,
  });
  for (const [size, width, height] of [
    ["desktop", 1280, 900],
    ["mobile-9-16", 360, 640],
    ["mobile-9-19.5", 360, 780],
  ]) {
    for (const scenario of [
      "invite",
      "returning",
      "success",
      "expired",
      "conflict",
      "permission",
      "network",
      "unknown",
    ]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(
        `http://127.0.0.1:${server.address().port}/?case=${scenario}${scenario === "returning" ? "" : "&token=" + "t".repeat(43)}`,
        { waitUntil: "networkidle0" },
      );
      await page.waitForFunction(
        () =>
          !document
            .querySelector("[role=status]")
            ?.textContent.includes("正在確認登入方式"),
      );
      assert.equal(new URL(page.url()).searchParams.has("token"), false);
      if (["success", "conflict", "permission", "unknown"].includes(scenario)) {
        await page.click(".merchant-google-button button");
        await page.waitForFunction(
          () =>
            !document
              .querySelector("[role=status]")
              ?.textContent.includes("正在確認身分"),
        );
      }
      const state = await page.evaluate(() => ({
        message: document.querySelector("[role=status]").textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
        verticalOverflow: document.documentElement.scrollHeight > innerHeight,
        lang: document.documentElement.lang,
        buttons: [...document.querySelectorAll("button")].map((b) => ({
          label: b.textContent,
          height: b.getBoundingClientRect().height,
        })),
        calls: window.qaCalls,
      }));
      const expected = {
        invite: "邀請已驗證",
        returning: "已綁定",
        success: "登入成功",
        expired: "邀請已過期",
        conflict: "帳號與邀請帳號不符",
        permission: "尚未取得店家權限",
        network: "網路連線失敗",
        unknown: "請勿重複送出",
        disabled: "登入成功",
      };
      assert.ok(
        state.message.includes(expected[scenario]),
        `${scenario}: ${state.message}`,
      );
      assert.equal(state.overflow, false);
      assert.equal(state.verticalOverflow, false);
      assert.equal(state.lang, "zh-Hant");
      assert.deepEqual(errors, []);
      for (const b of state.buttons) assert.ok(b.height >= 44);
      const screenshot = `${size}-${scenario}.png`;
      await page.screenshot({ path: join(dir, screenshot), fullPage: true });
      if (scenario === "network") {
        await page.click("button");
        await page.waitForFunction(() =>
          document
            .querySelector("[role=status]")
            .textContent.includes("邀請已驗證"),
        );
      }
      if (scenario === "unknown") assert.equal(state.buttons.length, 0);
      results.push({
        size,
        width,
        height,
        scenario,
        ...state,
        screenshot,
        retryVerified: scenario === "network",
      });
      await page.close();
    }
  }
  writeFileSync(
    join(dir, "results.json"),
    JSON.stringify(
      {
        mode: "real product React component; synthetic provider and API responses; no live Google credential",
        results,
      },
      null,
      2,
    ),
  );
  console.log(`AUTH01A browser QA: ${results.length} cases passed`);
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
