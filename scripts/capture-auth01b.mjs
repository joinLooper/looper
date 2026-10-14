import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer";
const root = process.cwd(),
  dir = resolve("output/auth01b/resume/web-preview");
mkdirSync(dir, { recursive: true });
const require = createRequire(join(root, "apps/merchant/package.json"));
await build({
  stdin: {
    contents: `import {createRoot} from ${JSON.stringify(require.resolve("react-dom/client"))};import Staff from ${JSON.stringify(join(root, "apps/merchant/app/staff-login.tsx"))};createRoot(document.getElementById('root')).render(<Staff/>);`,
    resolveDir: join(root, "apps/merchant"),
    loader: "tsx",
  },
  bundle: true,
  jsx: "automatic",
  platform: "browser",
  outfile: join(dir, "preview.js"),
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_API_URL": '"https://staff-preview.test"',
  },
});
writeFileSync(
  join(dir, "preview.css"),
  readFileSync("apps/merchant/app/globals.css"),
);
const scenarios = [
  "invite",
  "returning",
  "success",
  "expired",
  "revoked",
  "conflict",
  "permission",
  "unknown",
  "disabled",
  "logout",
  "network",
  "cancelled",
];
const mock = `
const scenario=new URLSearchParams(location.search).get('case')||'invite';window.qaCalls=[];
if(location.protocol==='file:')document.addEventListener('click',event=>{if(event.target.closest('button.staff-primary')){event.preventDefault();event.stopImmediatePropagation();const url=new URL(location.href);url.search='?case=success&code=synthetic-code&state='+ 'a'.repeat(64);url.hash='';location.href=url.href;}},true);
window.fetch=async(input,init={})=>{
 const url=String(input);window.qaCalls.push({url,method:init.method||'GET'});let status=200,body={};
 if(scenario==='network')throw new TypeError('synthetic network failure');
 if(url.endsWith('/config'))body={enabled:scenario!=='disabled'};
 else if(url.endsWith('/invitation')){if(scenario==='expired'){status=409;body={code:'STAFF_INVITATION_EXPIRED'}}else body={merchantId:'branch-one',storeName:'青森蔬食・民生店'};}
 else if(url.endsWith('/challenge'))body={authorizationUrl:'https://access.line.me/oauth2/v2.1/authorize?state=synthetic-only'};
 else if(url.endsWith('/session')){const errors={conflict:'ACCOUNT_LINK_CONFLICT',permission:'STAFF_INVITATION_REQUIRED',unknown:'STAFF_COMMIT_OUTCOME_UNKNOWN',revoked:'STAFF_MEMBERSHIP_UNAVAILABLE'};if(errors[scenario]){status=scenario==='unknown'?503:403;body={code:errors[scenario],...(scenario==='unknown'?{operationId:'c'.repeat(64)}:{})}}else body={authenticated:true,merchantId:'branch-one'};}
 else if(url.endsWith('/merchant/context'))body={branches:[{merchantId:'branch-one',storeName:'青森蔬食・民生店',brandDisplayName:'青森蔬食',role:'branch_staff'}]};
 else if(url.endsWith('/auth/logout'))body={authenticated:false};
 return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
};`;
writeFileSync(
  join(dir, "preview.html"),
  `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>AUTH-01B 隔離手機預覽</title><link rel="stylesheet" href="preview.css"><body><div style="position:fixed;top:0;left:0;right:0;z-index:5;text-align:center;font:12px system-ui;padding:6px;background:#f4ebd8">隔離 UI 預覽・模擬 LINE 回應・非真人登入</div><div id="root"></div><script>${mock}</script><script src="preview.js"></script></body></html>`,
);
const server = createServer((req, res) => {
  const file =
    new URL(req.url, "http://localhost").pathname.slice(1) || "preview.html";
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
        : "text/html;charset=utf-8",
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
    ["mobile-9-16", 360, 640],
    ["mobile-9-19.5", 360, 780],
    ["desktop", 1280, 900],
  ])
    for (const scenario of scenarios) {
      const page = await browser.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.url().startsWith("https://access.line.me/")) {
          request.respond({
            status: 200,
            contentType: "text/html",
            body: '<html lang="zh-Hant">隔離 LINE 導向驗證完成</html>',
          });
        } else request.continue();
      });
      const callback = [
        "success",
        "revoked",
        "conflict",
        "permission",
        "unknown",
        "logout",
      ].includes(scenario);
      const suffix = callback
        ? "&code=synthetic-code&state=" + "a".repeat(64)
        : scenario === "cancelled"
          ? "&error=access_denied"
          : ["returning", "disabled", "network"].includes(scenario)
            ? ""
            : "#invite=" + "t".repeat(43);
      await page.goto(
        `http://127.0.0.1:${server.address().port}/?case=${scenario}${suffix}`,
        { waitUntil: "networkidle0" },
      );
      await page.waitForFunction(
        () =>
          !document
            .querySelector("[role=status]")
            ?.textContent.includes("正在確認店員登入"),
      );
      assert.equal(new URL(page.url()).searchParams.has("code"), false);
      assert.equal(new URL(page.url()).searchParams.has("state"), false);
      assert.equal(new URL(page.url()).hash, "");
      if (scenario === "logout") {
        await page.evaluate(() => {
          [...document.querySelectorAll("button")]
            .find((x) => x.textContent === "安全登出")
            .click();
        });
        await page.waitForFunction(() =>
          document
            .querySelector("[role=status]")
            .textContent.includes("已安全登出"),
        );
      }
      const state = await page.evaluate(() => ({
        message: document.querySelector("[role=status]").textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
        verticalOverflow:
          document.documentElement.scrollHeight > innerHeight + 1,
        buttons: [...document.querySelectorAll("button,.staff-actions a")].map(
          (x) => ({
            text: x.textContent,
            height: x.getBoundingClientRect().height,
          }),
        ),
        sessionCalls: window.qaCalls.filter((x) =>
          x.url.endsWith("/line/session"),
        ).length,
        logoutCalls: window.qaCalls.filter((x) =>
          x.url.endsWith("/auth/logout"),
        ).length,
      }));
      assert.equal(errors.length, 0, JSON.stringify(errors));
      assert.equal(state.overflow, false);
      assert.equal(state.verticalOverflow, false, `${size}/${scenario}: vertical overflow`);
      assert.ok(state.buttons.every((x) => x.height >= 44));
      assert.equal(state.sessionCalls, callback ? 1 : 0);
      if (scenario === "unknown") assert.equal(state.buttons.length, 0);
      if (scenario === "disabled") assert.equal(state.buttons.length, 0);
      if (scenario === "logout") assert.equal(state.logoutCalls, 1);
      if (scenario === "success") assert.ok(state.message.includes("登入成功"));
      const expected = {
        invite: "邀請有效",
        returning: "使用 LINE",
        expired: "已過期",
        revoked: "撤銷",
        conflict: "不會合併",
        permission: "尚未取得",
        unknown: "請勿重複",
        disabled: "尚未開放",
        logout: "已安全登出",
        network: "網路連線失敗",
        cancelled: "已取消",
      };
      if (expected[scenario])
        assert.ok(state.message.includes(expected[scenario]), state.message);
      await page.screenshot({
        path: join(dir, `${size}-${scenario}.png`),
        fullPage: true,
      });
      if (scenario === "invite" || scenario === "returning") {
        await page.click("button.staff-primary");
        await page.waitForFunction(
          () => location.origin === "https://access.line.me",
        );
      }
      results.push({ size, width, height, scenario, ...state, errors });
      await page.close();
    }
  writeFileSync(
    join(dir, "results.json"),
    JSON.stringify(
      {
        kind: "AUTH01B_SYNTHETIC_UI_NOT_LIVE_LINE_E2E",
        passed: results.length,
        results,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>店員登入驗證</title><style>body{font:16px system-ui;margin:30px;background:#f4f6f2;color:#253c31}section{display:flex;gap:18px;flex-wrap:wrap}img{max-width:280px;width:100%;border-radius:14px}a{color:#165e45}</style><h1>LINE 店員登入・隔離預覽</h1><p>真實 React 元件＋模擬 API；未使用真實 LINE 憑證。</p><p><a href="preview.html#invite=${"t".repeat(43)}">開啟可操作手機介面</a> · <a href="results.json">36 組驗證結果</a></p><section>${results.map((x) => `<a href="${x.size}-${x.scenario}.png"><img src="${x.size}-${x.scenario}.png" alt="${x.size} ${x.scenario}"><p>${x.size} · ${x.scenario}</p></a>`).join("")}</section></html>`,
  );
  console.log(`AUTH01B browser QA: ${results.length} cases passed`);
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
