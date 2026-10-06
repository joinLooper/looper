# W0.1 Baseline Closure Report

**W0 PASS — READY FOR CENTRAL REVIEW**

日期：2026-09-20（Asia/Taipei）

- Repository：`joinLooper/looper`
- Source branch：`codex/welcome-first-resident`
- Source HEAD：`8653934e4fc9387a5cabf7f77daa5f8ad837245a`
- Tested implementation HEAD：`bc6a8cc5935d7c84f7c1b1f9c2b8495b50e0a3a0`
- 本目錄的提交只加入報告／evidence；不再修改已測試的程式碼。完整交付版會列出其後的 Final HEAD 與最終工作樹狀態。
- 範圍：僅 Stale frontend test authority 與 Browser QA portability closure。

## Changed files 與每項原因

修正 commit 的全部 10 個檔案如下；沒有修改 product runtime source。

| 檔案 | 修改原因 |
|---|---|
| `apps/web/app/knowledge-card-flow.test.ts` | 以 `page → ResidentGame → runtime-api` 取代舊 page 內嵌 route 假設；新增 canonical adapter 與 Backend 冪等契約驗證 |
| `apps/web/app/resident-preview.test.ts` | 改驗證目前 RestaurantOverlay 與 locked runtime contracts，不再要求舊 page guard |
| `package.json` | root test 串接 API／frontend；新增明確子命令、capture 入口；只加入版本鎖定的 QA devDependencies |
| `pnpm-lock.yaml` | 僅新增 QA dependency closure；所有原有 importer、package、snapshot entries 保持原值，沒有產品依賴升級 |
| `.github/workflows/ci.yml` | 既有 verify job 改用完整 root test 與 frozen install；build 後安裝 capture browser、執行同一 runner、上傳 evidence |
| `scripts/test-frontend.mjs` | 跨平台列舉三個前端的既有 `.test.ts`，交給既有 Node test runner／tsx，避免 shell glob 差異並傳遞失敗 exit code |
| `scripts/capture-runtime-assembly.mjs` | 去除 Unix path／browser assumptions；保留原 8+5 capture assertions、schema 與 filenames；整體失敗必須 exit 非零 |
| `scripts/runtime-capture-support.mjs` | 共用 portable temp/profile/browser lifecycle、loopback QA host、image readiness 與清理；載入未修改的 assembly 元件 |
| `scripts/capture-unified-runtime.mjs` | 同一 runner 內補足現在正式入口的自動 evidence：真實 Web build + 隔離 Backend，沒有另一套 test framework |
| `scripts/README.md` | 記錄正式 baseline commands、browser 安裝／選擇、輸出結構與 QA／真實 credential 的界線 |

另提交 W0 歷史基線資料與本 W0.1 evidence。歷史 W0 報告的 PARTIAL 保留作為當時結果；本報告依 W0.1 核准範圍完成 closure，不回寫歷史驗證結果。

## 兩個 stale tests 如何對準 authority

### Knowledge

- 驗證 page 僅掛載 `ResidentGame`，不把 fetch、舊 Restaurant guard 或 assembly 放回首頁。
- 驗證 `ResidentGame` 使用 `runtime-api`、將 `submitKnowledge` 接至 `KnowledgeBoardOverlay`，並使用 Backend 回傳的完整 user profile；沒有前端樂觀累加 EXP／Stars。
- 執行真正的 `fetchResidentRuntime()`，驗證四個 canonical read routes、`credentials: include` 與 `cache: no-store`。
- 執行真正的 `answerDailyKnowledge()`，透過 fetch adapter 送到現有 `buildApp` + SQLite `:memory:`，不是以假的 reward 計算器模擬結果。
- 首次正確答案由 EXP 150→200、Stars 0→100；相同 idempotency key 重送、同日不同 key 重送均維持相同餘額；改答案衝突為 409。Knowledge EXP ledger 與 reward event 各只有一筆。
- 同時保留 API 既有的 concurrent、rollback、cross-resident 與 daily authority tests。沒有修改任何 reward 規則。

### Restaurant

- 驗證 `ResidentGame` 的 restaurant focus 只掛載 `RestaurantOverlay`。
- 檢查正式 world object／attachment，overlay 唯一可執行 button 是關閉，沒有表單、fetch、merchant transaction 或 reward write。
- 讀取現有 restaurant manifest、transaction guard、preview map，確認 locked world object、presentation-only，以及交易／任務碼／reward／Stars／CO₂e／persistence 等 routes 或 mutations 均為 0。
- 真正 browser capture 再打開 locked preview，確認只有 close button、Backend resources 不变且沒有 mutation request。
- 沒有恢复 `restaurantExperienceEnabled()` 到正式入口，也沒有開啟 Birthday locked 店家交易。

## Root／Frontend／CI coverage

`pnpm test` → `pnpm run test:api` → `pnpm run test:frontend`。

- API：既有 315 tests，繼續負責 Backend invariants、交易與安全隔離。
- Frontend：自動發現 Web／Admin／Merchant 共 16 個既有測試檔；修正與補強後為 129 tests，涵蓋 renderer wiring、純前端 flows、canonical adapter contract。
- 沿用 Node test runner 和 tsx；沒有再建另一套 Jest／Vitest 系統。
- `pnpm test:mvp` 保留為 API-only 相容指令；正式 CI 已切到 `pnpm test`，所以未來 frontend failure 會使 baseline／verify job 失敗。
- CI 仍是原 verify workflow；另加三個 browser install／capture／artifact steps，不重新配置整個 CI。
- 本輪沒有 push，因此沒有宣稱新 commit 的 GitHub Actions 已執行。相同 gate 命令已在目前 Windows 實際通過。

## Browser runner portability

已移除 `/tmp/looper-browser`、`/tmp/looper-chromium`、固定 Unix executable、`FONTCONFIG_PATH` 和 `LD_LIBRARY_PATH` 假設。

- 使用 `os.tmpdir()`／`mkdtemp()`，每次獨立 browser profile，loopback port 自動分配。
- Browser 可使用 managed Chrome、Puppeteer 跨平台 channel discovery，或通用 env override；沒有單一 OS 的硬編碼 executable path。
- 標準安裝方式：`pnpm exec puppeteer browsers install chrome`。當前 Windows 最終執行使用 runner 自動找到的 Chrome，不需本機特製程式或路徑補丁。
- 不可用時明確失敗並提示安裝；負向驗證 exit 1、temp directory 洩漏 0。
- 以隔離 QA host 掛載**原本的 RuntimeAssemblyRenderer + 原 CSS／manifest／assets**。保留 2 場景 × 4 角色方向與 5 previews，共 13 張原名 screenshots、v6 evidence schema、layer／seat／tail／energy guards。
- 同一命令再執行現在的 production Web build，記錄四個 Forest viewports、Treehouse、Restaurant、Mission、Knowledge answer／reload，共 9 張額外 screenshots。
- API 請求只進入隔離 memory Backend；沒有 production DB 或真實 LINE credential。LINE SDK 與不存在的 favicon 僅在 QA browser context 回覆 fixture／204；其他 console errors、破圖或 assertion failure 都會讓 gate 失敗。
- 成功或失敗會關閉本輪 browser／Next／QA host／Backend 並清除專用 temp directory。最終沒有殘留 `looper-runtime-capture-*` 目錄。

原輸出：`output/runtime_assembly_v006/screenshots/`、`runtime-browser-evidence.v006.json`。本輪有效輸出已複製到本目錄 `evidence/` 並提供 checksum。

## 完整 validation results

Windows、Node `v24.18.0`、pnpm `10.13.1`。既有 runtime dependency 仍為 Next `16.2.10`、React `19.2.7`、Fastify `5.10.0`。

| 驗證 | 結果 |
|---|---|
| Frozen install | PASS；原有 runtime dependency entries 未變 |
| Lint | PASS，9/9 packages |
| Typecheck | PASS，9/9 packages |
| API tests（由 root gate 執行） | PASS，315/315，0 fail |
| Frontend tests（由 root gate 執行） | PASS，129/129，0 fail |
| Root `pnpm test` | PASS，合計 444 tests；exit 0 |
| `qa:player-ui` | PASS |
| `qa:resident-content` | PASS |
| `qa:resident-guidance` | PASS |
| `qa:runtime-assembly` | PASS |
| `qa:forest-runtime` | PASS |
| `qa:unified-runtime` | PASS |
| Production build | PASS，9/9 packages |
| Browser capture runner | PASS，Windows 正式命令 exit 0，38.0 秒 |
| Assembly browser evidence | PASS，8 scenes＋5 previews、13 screenshots |
| Unified Runtime browser evidence | PASS，9 screenshots、console errors 0、Knowledge EXP ledger 1、Restaurant mutations 0 |
| Missing-browser negative check | PASS：預期 exit 1、提示安裝方法、temp 洩漏 0 |
| Source／dependency scope audit | PASS：1,240 個 retained source hashes 不變；原 lock entries 未變 |

Resident-content／guidance／forest 的既有靜態 QA 會轉交 Unified Runtime guard，並非三套獨立 E2E；本輪 browser evidence 是另有實際執行的同一 capture workflow。Browser 功能採樣不宣稱所有視覺狀態的 pixel regression 已完成。

Build 產生的 Admin／Merchant `next-env.d.ts` 已還原，不包含在修正 commit。既有 shared package build 的 no-output cache 警告與 sharp lifecycle 警告未影響以上檢查，不因此更改產品設定。

## Product behavior 與資料界線

**Product behavior 沒有變更。** Backend、`packages/types`、資料模型／migration v1–v27、資源經濟、Gameplay、Forest／Treehouse runtime、approved assets、LINE／LIFF production code 全部未修改。測試只在 memory／隔離 test database 操作；没有進行 production migration。

沒有 SQLite→PostgreSQL、Supabase、apps/mobile、React Native、Expo、Native Login、Deep Link、security route 改造、rate limiting 或 production deploy。沒有開始 W1。

## Remaining known issues

- 真實 LINE／Native credential 與裝置級驗收：依本批指示延至 App Auth，不是本輪 W0 PASS 阻塞。
- Production DB inventory／backup、persistence migration 決策、demo seed、legacy admin security、rate limiting：保留為 W1／W2／Production Security 後續工作，本輪不修。
- macOS／Linux runner 尚未在本機實跑；程式與設定已可攜，既有 Linux CI 已接同一 runner，待未來 push／PR 執行。不以 Windows PASS 冒稱其他 OS 已實測。
- 沒有部署或推送。中央 Review 尚待進行。

## Evidence

- `VALIDATION_RESULTS.json`：source／tested commit、所有指令結果、變更檔案 blob SHA／SHA-256。
- `evidence/`：完整最終 logs、22 張自動 capture PNG、兩個 browser JSON、負向檢查、scope audit、還原的生成檔 diff。
- `SHA256SUMS.txt`：逐檔 evidence checksum。
- 上游 `../w0-production-baseline/`：保留 W0 當時的來源 lock 與 PARTIAL 原始證據。

Commit 使用每次命令限定的 `Codex <codex@localhost>` 作者（此 repository 原先沒有 Git 作者設定）；沒有更動 global Git 設定。

**W0 PASS — READY FOR CENTRAL REVIEW**
