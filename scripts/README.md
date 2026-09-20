# Scripts

自動化、資料維護與開發輔助腳本。

## Baseline tests

- `pnpm test`：依序執行 `test:api`、`test:frontend`；任何失敗皆回傳非零 exit code。
- `pnpm test:api`：既有 API tests，负责 Backend、資料交易、經濟、隔離與冪等性。
- `pnpm test:frontend`：以同一 Node test runner／tsx 執行 Web、Admin、Merchant 的所有 `app/**/*.test.ts`，不依賴 shell glob。包含現行 Unified Runtime wiring、canonical API adapter 與 locked Restaurant authority；Knowledge adapter 的 contract test 使用隔離記憶體 Backend 驗證重送不重複入帳。
- `pnpm test:mvp`：保留既有 API-only 相容指令；正式 CI gate 使用 `pnpm test`。

既有 `.github/workflows/ci.yml` 使用 frozen lockfile、完整 baseline tests，build 後執行同一 browser capture runner 並上傳 evidence；沒有另建測試框架或替代產品入口。

## Portable browser capture

在 Windows、macOS 或 Linux 的 repository root 執行：

```text
pnpm install --frozen-lockfile
pnpm exec puppeteer browsers install chrome
pnpm build
pnpm qa:capture-runtime
```

也可直接執行 `node scripts/capture-runtime-assembly.mjs`。Node minimum 保持 repository 原設定；browser tooling 已鎖定版本。

Browser 選擇順序：

1. `LOOPER_CAPTURE_BROWSER_EXECUTABLE`：可選的完整 browser executable path，適用任何 OS。
2. `LOOPER_CAPTURE_BROWSER_CHANNEL`：可選 Puppeteer channel（例如 `chrome`）。
3. Puppeteer 已安裝的 managed Chrome。
4. Puppeteer 的跨平台 `chrome` channel discovery。若不可用，明確提示安裝指令並失敗；不跳過 QA。

例如已安裝 Chrome 的 Windows PowerShell 可使用 `$env:LOOPER_CAPTURE_BROWSER_CHANNEL='chrome'`；這是共用的 channel 選項，runner 沒有 Windows／Unix 寫死路徑。CI 使用 managed Chrome。Linux 主機需具備 Chromium 系統相依套件；若缺少，依 Puppeteer browser install 的平台指引安裝。

Runner 在 `os.tmpdir()` 下用 `mkdtemp` 建立獨立 assembly bundle 與 browser profile，並自動分配 loopback ports。完成或失敗都關閉 browser、QA HTTP server、Next child process、記憶體 Backend，清除自己建立的 temp directory；不使用使用者既有 browser profile、port 3000／4000 或 production database。

### 保留的 assembly workflow

`runtime-assembly-renderer.tsx` 不再由正式首頁掛載。Runner 透過 QA-only esbuild host 載入**未修改的同一元件、CSS、manifest 與 public assets**，驗證 2 個場景 × 4 個角色方向，以及 5 個 static previews。原 layer order、seat gates、tail rule、energy-disabled checks 與 PNG filenames 均保留。沒有把 Deprecated Gameplay 加回 `page.tsx`。

`LOOPER_CAPTURE_URL` 仍可指定外部 **assembly QA renderer** URL；不是要將正式 ResidentGame 首頁當 assembly playground。現行 Unified Runtime smoke 仍由本地 production build 執行，外部 URL 不會跳過它。

### 現行 Unified Runtime evidence

同一 capture 命令會啟動本地 Web production build，透過 browser request interception 將 canonical player API 請求送到既有 Fastify `buildApp` + SQLite `:memory:`，以 QA Session 驗證 Forest／Treehouse、Restaurant locked preview、Mission claim、Knowledge reward 與 reload。Backend 程式與資料模型未改；LINE SDK request 僅在此隔離 browser context 以無作用 fixture 回覆，不宣稱真實 LINE 登入 PASS。可選 `NEXT_PUBLIC_API_URL` 必須與 Web build 時相同。

僅 browser 自動請求的 `/favicon.ico` 由 QA 回覆 204（產品無此檔案），其餘圖片錯誤、console/page errors 或 contract failure 均使 runner 失敗。每次 capture 會等待 image decode，避免把尚未載入的 asset 當 evidence。

### 輸出與 gate

原輸出結構保留：

- `output/runtime_assembly_v006/screenshots/*_runtime_v006.png`：原 13 個 assembly screenshots。
- `output/runtime_assembly_v006/runtime-browser-evidence.v006.json`：原 v6 schema，另記錄 source HEAD、platform、browser 與隔離 QA scope。
- `output/runtime_assembly_v006/screenshots/*_unified.png`：現行 runtime 的四個 Forest viewports、Treehouse、Restaurant、Mission、Knowledge 與 reload。
- `output/runtime_assembly_v006/unified-browser-evidence.json`：現行 runtime assertions、實際 canonical request paths、console errors。
- `output/runtime_assembly_v006/capture-failure.json`：失敗才產生；下次執行先清除舊 failure marker。

兩個 capture 都通過才 exit 0。iOS／Android 裝置與真實 LINE credential 未涵蓋，不得以本 runner 結果宣告 Production 或 Native Auth 驗收完成。
