# Post-Demo Production Baseline Report

日期：2026-09-20（Asia/Taipei）  
工作包：W0 Production Baseline Consolidation  
結論：**W0 PARTIAL — CENTRAL REVIEW REQUIRED；不得進入 W1。**

## 1. Source authority 與完整工作樹

| 欄位 | 鎖定值 |
|---|---|
| Repository | `joinLooper/looper` |
| Source branch | `codex/welcome-first-resident` |
| Source HEAD SHA | `8653934e4fc9387a5cabf7f77daa5f8ad837245a` |
| Source commit | Merge pull request #42 from joinLooper/codex/wfr-playable-polish-v001 |
| Source URL | https://github.com/joinLooper/looper/tree/8653934e4fc9387a5cabf7f77daa5f8ad837245a |
| 本地初始狀態 | 空 Git repository，unborn `master`，沒有 commit、remote 或工作檔案 |
| 取得方式 | 只 fetch 指定 branch，建立同名本地 tracking branch；未從 `main` 重建、未 rebase／cherry-pick |
| 取回後狀態 | tracked 修改 0、staged 修改 0、untracked 0；upstream ahead/behind = 0/0 |
| Source tracked files | 1,422；逐檔 Git blob SHA 與 mode 已記錄 |
| 額外 SHA-256 鎖定 | 1,242 個核心程式、runtime contracts、runtime assets、visual assets 與工具鏈檔案 |
| W0 變更界線 | 僅新增本目錄報告／證據；執行產物留在既有 ignored `output/`、依賴與 build cache 目錄 |

SHA-256 為 Windows checkout 實際 bytes；跨平台以各檔案 Git blob SHA 為 canonical authority。

`SOURCE_LOCK.json` 鎖定 source tree、所有 tracked path／Git object、核心檔案 SHA-256、asset counts、v1–v27 migration 名稱與 Forest manifest hash 比對。此清單是來源鎖定，不代表所有歷史素材都批准為 active runtime。最终工作樹與驗證結果另見 `VALIDATION_RESULTS.json` 及證據檔。

Build 曾自動增加 Admin／Merchant 的 next-env.d.ts 宣告，已僅還原這兩個生成檔至 source HEAD；最終 tracked diff 為 0。W0 browser 與兩個本地 QA servers 已關閉，未中斷原有 port 3000 程序。

未修改 Backend、資料模型、Gameplay、資源經濟、Forest、Treehouse、UI、LINE／LIFF；未新增 Native App 或 Supabase migration；未 commit、push、merge、deploy 或建立 W1 工作。

## 2. 驗證方法與結果

本機環境：Windows PowerShell、Node `v24.18.0`，使用 repository 指定的 `pnpm 10.13.1`。PATH 原有 pnpm 是 `11.19.0`，因此命令明確以 `npx --yes pnpm@10.13.1` 啟動。`package.json` 要求 Node >=22.5.0，既有 CI 使用 Node 22；本機驗證不是 Node 22 的重新執行。

| 驗證 | 本輪結果 | 範圍／限制 |
|---|---|---|
| Install | PASS | `npx --yes pnpm@10.13.1 install --frozen-lockfile`；未更新 lockfile |
| Lint | PASS，9/9 packages | 既有 lint 實際為 `tsc --noEmit`，不是額外 ESLint 檢查 |
| Typecheck | PASS，9/9 packages | 既有 `turbo typecheck` |
| Root tests | PASS：315/315，0 fail | `pnpm test` 只涵蓋 API 測試，不包含前端測試檔 |
| 補跑既有前端 tests | **FAIL：127 tests，125 pass／2 fail** | Web、Merchant、Admin 共 16 個既有測試檔；無新增或改写測試 |
| `qa:player-ui` | PASS | 69 UI families、274 states、69 registry IDs、SVG baked text 0 |
| `qa:resident-content` | PASS | 入口為 ResidentGame 時轉交 Unified Runtime 靜態檢查 |
| `qa:resident-guidance` | PASS | 同上；不等於獨立瀏覽器 guidance E2E |
| `qa:runtime-assembly` | PASS | 34 runtime assets、8 seated combinations；保留的 assembly compatibility 檢查 |
| `qa:forest-runtime` | PASS | 入口為 ResidentGame 時轉交 Unified Runtime 靜態檢查 |
| `qa:unified-runtime` | PASS | 資產數量、route／focus／HUD／LIFF loader／copy／source guards |
| Forest layer hashes | PASS，26/26 | 直接以 manifest SHA-256 比對本地圖層，補足舊 forest QA 提前轉交的限制 |
| SQLite migration | PASS | 僅隔離 W0 SQLite：v1–v27，首次與再次執行皆 exit 0 |
| SQLite integrity | PASS | 36 tables、12 triggers；`integrity_check=ok`、`foreign_key_check=[]` |
| Existing browser capture | BLOCKED | `capture-runtime-assembly.mjs` 在 Windows 拋 `ERR_INVALID_FILE_URL_PATH`；寫死 `/tmp/looper-browser` 和 Chromium 路徑 |
| Production build | PASS，9/9 packages | 執行既有 root build；沒有發布。5 個 shared packages 有既有 no-output cache 警告 |
| 補充本地 browser smoke | PASS（有限範圍） | Forest／Treehouse、claim、Reduced Motion reload、logout；隔離 mock identity，不代表真實 LINE 驗收 |
| 真實 LINE／LIFF 裝置驗收 | NOT VERIFIED | 本輪未取得或使用真實 LINE credential；不得以 QA 身分替代正式驗收 |

Install 顯示 `Ignored build scripts: esbuild, sharp` 警告。未因此變更依賴批准設定；後续實際 tests／build 的結果才是本機可執行性的證據。不得把安裝警告或既有腳本輸出的 `releaseBlockerCount: 0` 解讀成 Production Ready。

兩個前端失敗的定位：

1. `apps/web/app/knowledge-card-flow.test.ts:85`：要求 `page.tsx` 含 `/missions`、`/merchants` 等舊內嵌請求；現行 page 只掛載 `ResidentGame`，請求由 `game-runtime/runtime-api.ts` 提供。實際失敗為 `missing canonical route /missions`。
2. `apps/web/app/resident-preview.test.ts:47`：要求 page 含 `restaurantExperienceEnabled()` 舊 guard；現行入口由 Unified Runtime 控制 Restaurant locked preview。

這兩项是與已替換入口結構不一致的測試斷言；靜態檢查不能單獨證明 runtime 完全正確。W0 保留失敗，不刪除測試、不恢復舊 Gameplay；中央需決定後續如何更新測試 authority 與 CI coverage。

同一 source HEAD 的 GitHub 歷史結果（2026-08-24，與本輪重跑分列）：

- [CI verify：success](https://github.com/joinLooper/looper/actions/runs/32731887433/job/97445715599)
- [Backend Tests：success](https://github.com/joinLooper/looper/actions/runs/32731887434/job/97445715073)

既有 CI install 使用 `--no-frozen-lockfile`，本輪使用 frozen lockfile。既有 closure 文件的 315/315、瀏覽器 PASS 與部署狀態是歷史證據，不能冒充本輪執行或目前 production 状態。

### 本輪補充瀏覽器 smoke evidence

使用 [vercel:agent-browser 技能](C:/Users/deyi2/.codex/plugins/cache/openai-curated-remote/vercel/0.21.4/skills/agent-browser/SKILL.md) 的 CLI 流程，隔離 Chrome session。內建瀏覽器工具無法啟動（Windows sandbox helper 的 apply deny-read ACLs 錯誤），故以 CLI 完成。

既有 port 3000 有其他程序，未中斷。Web production build 在 loopback port 3003 執行；以既有 qa-unified-runtime-server.ts 的 output/ 暫存副本調整 import path 與 player origin，改用 .mts 保持 ESM，API 為 loopback port 4000、SQLite :memory:。這不是新增產品入口或 production mock 開關。

- 390×844：Forest／Treehouse screenshots 已目視檢查，場景與互動可見；Treehouse contract 52 layers，載入 images 39、broken 0。
- 375×667、1280×720、1440×900：保存 Forest screenshot 與 DOM diagnostics；broken images 0、framework error overlay false、body width 未超出 viewport。
- Core Tree open 後 Mission 可 claim；Stars 0→10、顯示已收下，reload 後仍為 10。
- Reduced Motion 標準→減少，reload 後 data-reduced-motion=true；保留 Backend account preference。
- Logout 回到 LINE gate；沒有使用真實 LINE credential。真實 LIFF、線上部署與完整逐狀態視覺回歸仍未驗證。
- 圖片、browser snapshots、console／errors 輸出及原始驗證 logs 保存於 evidence/。這些是本輪 smoke evidence；不能把 backend mock login 當 LINE SDK exchange 成功。

## 3. Database 現況

**目前程式實作為 Node `node:sqlite`／`DatabaseSync`，沒有發現已接入 Supabase 的 adapter、SDK dependency、連線設定或 migrations。** 本輪沒有連線 Supabase，也沒有建立任何 Supabase 資源。

核心來源：`apps/api/src/database.ts`、`store.ts`、`migrate.ts`、`index.ts`。`InMemoryStore` 雖然名稱如此，constructor 實際呼叫 `openDatabase(databasePath)`；無參數時使用 `LOOPER_DATABASE_PATH`，否則為 repository `.data/looper-dev.sqlite`。只有明確傳入 `:memory:` 的測試／QA 才是 SQLite memory database，不能根據 class 名稱判斷正式資料只是記憶體。

`openDatabase` 會配置 foreign keys、5,000 ms busy timeout，依序 migrate 並 seed；交易使用 `BEGIN IMMEDIATE`，migration 寫入 `schema_migrations`，每版檢查 foreign keys，失敗 rollback。W0 隔離 DB 的 SQLite version 為 `3.53.1`、journal mode 為 `delete`。這些是本機 runtime 觀察，不能推定線上 DB 的 engine version／journal mode。

重要 persistence domain：

- Canonical `accounts`／`users`、`account_external_identities`、分 purpose 的 `account_sessions`；Session 保存 token hash，玩家 profile 沿用既有 canonical ID。
- `user_resources`、`user_growth_balances`、reward／resource ledger、growth events、level progression。
- Merchant brand／branch／membership／invitations、Mission／Task Code submission／decision、settlement links、reporting scope snapshots、audit。
- Knowledge answers 與每日 reward、Resident mission instances／claim request、Reduced Motion account preference。

`seedDatabase` 每次 open 會 seed `user-demo` 和既有 economy／level definitions，也含調整舊 energy interval 的 SQL；這不是 LIFF 登入 fallback，但正式資料初始化／遷移前必須審核 seed 行為，不能原樣將 demo seed 當正式用戶移入新資料庫。

初始 workspace 沒有 `.env` 或 `.data`；本輪只新建 `output/w0-baseline/migration-check.sqlite` 等隔離驗證檔。**部署中的實際 database path、volume、最新 applied schema、資料量、備份與還原狀態尚未驗證。** 不能宣稱 Birthday production data 已備份或可直接搬遷。

### v1–目前最新 v27：鎖定原有版本，不改寫歷史

| 版本 | Migration 名稱 |
|---|---|
| 1 | initial_core_economy_schema |
| 2 | core_economy_integrity_constraints |
| 3 | resource_ledger_growth_integrity |
| 4 | level_runtime_integrity |
| 5 | admin_economy_settings_management |
| 6 | mvp_task_code_thin_slice |
| 7 | task_code_submission_decisions |
| 8 | finalized_core_economy_rules |
| 9 | finalized_star_settlement_snapshot |
| 10 | task_code_submission_settlement_links |
| 11 | player_event_queue |
| 12 | merchant_brand_branch_model |
| 13 | nullable_branch_application_reference |
| 14 | canonical_account_identities |
| 15 | merchant_membership_scope_exclusivity |
| 16 | merchant_invitation_sessions |
| 17 | canonical_reporting_timestamps |
| 18 | task_code_reporting_scope_snapshots |
| 19 | platform_operator_rbac |
| 20 | platform_operator_invitation_support |
| 21 | platform_operator_status_transitions |
| 22 | platform_operator_role_transitions |
| 23 | player_identity_and_session |
| 24 | knowledge_card_reward_persistence |
| 25 | unified_knowledge_daily_rewards |
| 26 | resident_non_merchant_mission_claim_authority |
| 27 | reduced_motion_durable_persistence |

## 4. 盤點、分類與沿用界線

分類是「責任層」判斷；同一領域可保留業務規則，同時標記未來需替換的平台層。`MIGRATE` 是後續待中央核准的搬遷需求，不表示本輪執行或已選定 Supabase。

| 分類 | 項目／來源 | 決定 |
|---|---|---|
| KEEP | Backend／API：`apps/api/src/app.ts`、`store.ts`、`economy.ts`、reporting modules | 保留已存在業務流程、驗證、原子交易、冪等性與讀取模型；殘留 header-only 路由另列 blocker |
| KEEP | `packages/types/src/index.ts` | 共用 API／domain contracts 的基線，Native 不得另造不相容資料模型 |
| KEEP | Canonical Resident Identity／Player Session | account/user ID、external identity mapping、session purpose／expiry／revocation 與跨居民隔離語义沿用 |
| KEEP | Stars／EXP／Level／Energy／CO₂e／Growth | `economy.ts`、`store.ts`、schema 與共用 types 為 authority；保留 ledger、成長換算與 level thresholds，不重做經濟 |
| KEEP | Merchant／Mission／Task Code | 既有 merchant brand/branch scope、核銷決策、重送與 settlement 機制；Birthday runtime 未開放不等於 Backend 不存在 |
| KEEP | Ledger／Audit／Settlement | append-only／immutable snapshots、source 唯一性、transaction rollback、report timezone 與歷史 references |
| KEEP | Forest／Treehouse Runtime | 現有構圖、390×844 logical space、場景切換、hotspots、anchors、層序、dialogue、Global HUD／Focus |
| KEEP | Runtime manifests／approved asset authority | 以 source lock 與 active manifest／route binding 沿用；不重匯出、不重繪、不以 QA screenshots 取代素材 |
| REPLACE FOR APP | LIFF loader／bootstrap／登入入口 | 精確位置見下一節；只標記，未修改 |
| REPLACE FOR APP | Next／DOM 平台層 | `next/image`、`next/script`、browser fetch cookie／Origin、CSS safe-area、window media query／events 的執行平台需適配；不代表重設 UI 或重製 Forest |
| MIGRATE | SQLite-specific repository／schema runner／部署 volume | 未來資料平台需搬遷交易、constraints、indexes、immutable triggers 與 migrate/seed 邊界；不重新設計 domain |
| MIGRATE | 真實 resident／merchant／ledger／audit／settlement 資料 | 待確認線上 authority 與備份後，保留 IDs、FK、時間、idempotency keys、餘額及歷史；本輪未搬資料 |
| MIGRATE | Runtime asset packaging／loading | App 資產封裝與載入管線需對應已鎖定 PNG／manifest；圖像與構圖維持 authority |
| BIRTHDAY-ONLY | Welcome First Resident demo scope／locked previews | Restaurant 交易與 Merchant Mission route 為 0；weekly/P1 store/inventory/chest 未開放，Support 移出 Demo。限制保留至中央另行決定，不自動開啟 |
| BIRTHDAY-ONLY | Demo fixtures／historical evidence／legacy assembly | `qa-unified-runtime-server.ts`、`user-demo` seed、舊 assembly handoff 與 QA screenshot 為驗證／歷史資產，不可當正式身分、active UI 或線上驗收證明 |
| BLOCKER | 尚未收斂的驗證與 production boundaries | 詳見 W1 前置阻塞；不得把 Demo scope blocker=0 當正式 App 完成 |

### Runtime 現況與 assets

正式入口 `apps/web/app/page.tsx` → `game-runtime/resident-game.tsx`。Forest 使用 `forest-logical-runtime.tsx`／`forest-runtime.ts`／`forest-runtime-contracts/*.v2.json`；Treehouse 使用 `game-runtime/treehouse-scene.tsx`／`authority/treehouse/*`。統一 asset routes 在 `game-runtime/asset-routes.ts`，各系統的正式 manifest／registry／focus／reduced-motion contracts 位於 `game-runtime/authority/`。

| Authority | 鎖定檔案數 |
|---|---:|
| Forest `public/runtime-assets/forest-v002` | 28（scene manifest 26 layers 已逐一 hash） |
| Unified dialogue | 51 |
| Unified knowledge | 110 |
| Unified mission | 53 |
| Unified resources | 134 |
| Unified restaurant | 39 |
| Unified reward | 88 |
| Unified settings | 49 |
| Unified treehouse | 52 |

以上為 package inventory，不代表所有檔案同時掛載；包括 reference／reserved assets。active routes 仍以 `asset-routes.ts`、scene manifests 和 source guards 為準。歷史 `runtime-assets/v005`／`v006` 與 `public/visual_assets` 保留在 source lock，不自動升為 Unified Runtime authority。Forest 高密度版本在既有 manifest 中為 P1 deferred；本輪不重製。

現行 scope：一組 Global HUD、至多一個 primary focus；Forest／Treehouse 共用。Today Slot 1 `resident-daily-arrival` 零獎勵；Slot 2 `resident-daily-core-tree-check` 由 Backend 確認當天 Core Tree open，claim 僅發 10 Stars，不發 EXP／Energy／CO₂e／items。日期依 Asia/Taipei，claim 重試沿用 idempotency key，Stamp／HUD 需等待 Backend truth。Knowledge 與 Reduced Motion persistence 已有實作，不能用舊文件中的 pending 項目重新開發。

## 5. LIFF → App 待替換層（本輪修改 0）

| 位置 | 現況 | 後續 App 邊界 |
|---|---|---|
| `apps/web/app/layout.tsx:20` | Next Script，LINE CDN `/liff/edge/2/sdk.js`，`beforeInteractive` | 平台 SDK 載入與啟動生命週期 |
| `apps/web/app/player-session-flow.ts:42` | `LiffClient`、init/isInClient/isLoggedIn/login/getIDToken、LINE session exchange | App credential acquisition／redirect lifecycle；不可直接信任前端 subject |
| `apps/web/app/game-runtime/resident-game.tsx:25`、`:150` | LIFF env、window.liff、自動登入、gate／錯誤文案 | Native app boot／登入 gate；保留 canonical account 綁定 |
| `apps/api/src/player-identity.ts:51` | LINE verify endpoint、aud／iss／expiry／timeout | 既有 `PlayerIdentityVerifier` 可作 provider 接口；新 credential flow 待中央決定，不能視為已支援 Native OAuth |
| `apps/api/src/app.ts:177` | `POST /auth/player/line/session`、HttpOnly cookie、exact Origin／CORS | App Session transport／cookie或 token policy 需明確定義，不能移除驗證以讓 App 通過 |
| `apps/web/app/player-session-flow.ts:9`、`game-runtime/runtime-api.ts` | browser `credentials: include`、fetch、request idempotency | App networking／session storage adapter，domain payload 保留 |
| `.env.example`／`docs/integration/C1_PLAYER_AUTH.md` | `NEXT_PUBLIC_LINE_LIFF_ID`、`LINE_LOGIN_CHANNEL_ID`、`LOOPER_PLAYER_APP_URL` | 部署設定／callback／Origin authority；本輪沒有更動或新增 LINE Channel |
| `scripts/qa-unified-runtime.mjs`、`player-session-flow.test.ts` | QA 明確鎖定 LIFF CDN 與 bootstrap 行為 | 將來替換平台時同步核准測試 authority；W0 不改 |

沒有 npm LIFF package；目前 LIFF SDK 由 CDN 載入。LINE identity mapping 不應隨 LIFF presentation shell 移除，否則會破壞既有居民歷史關係。

## 6. W1 前置阻塞與中央 Review

| ID | 阻塞／缺口 | 解除條件；W0 不實作 |
|---|---|---|
| B01 | 補跑前端 tests 2 fail，root/CI 未涵蓋這批測試 | 中央確認 Unified Runtime 的測試 authority 與後續修正範圍；避免為舊測試恢復舊 gameplay |
| B02 | Browser capture 不可攜，真實 LINE／LIFF 驗收未重跑 | 核准可重現的 browser runner／device QA；歷史截圖不等於本輪 PASS |
| B03 | 部署 DB／備份／還原／資料 inventory 未驗證，production persistence target 未決 | 確認線上資料 authority、read-only inventory／backup evidence，再批准遷移設計；不得假設 Supabase |
| B04 | 8 處 legacy API 仍只依 caller 提供的 `x-looper-role` | 正式 App／API exposure 前需審核並接正式 Session／RBAC；程式內未見 production 關閉 gate |
| B05 | App credential／Session transport／Origin 平台契約未決 | 中央核准替換範圍，保留 account/user IDs 與安全隔離 |
| B06 | Bootstrap seed 與 migration 混在每次 database open；`user-demo` seed 未分環境 | 核准正式初始化、部署／migration entry 與 demo fixtures 邊界；不直接複製為正式居民 |
| B07 | API 未見 login rate limiter；production edge policy 未驗證 | 正式曝光前確認 API／edge 實際限流責任與驗收；不宣稱外部已配置 |
| B08 | 中央 Review 尚未批准 W0 基線與 W1 範圍 | **等待中央 Review；沒有自動開始 W1** |

B04 的精確既有路由：`POST /admin/merchant-brands/:brandId/branches`、`POST/GET /admin/accounts`、`POST/GET /admin/merchant-operator-memberships`、`GET /admin/reports/task-code/monthly-live`、`POST /admin/account-invitations`、`GET /merchant/redemptions`。見 `app.ts:81` 及呼叫處 369、381、395、408、424、449、460、696。這是讀碼確認的應用層邊界，未對線上部署做漏洞探測，也未假定外部 gateway 存在或不存在。

`POST /redemptions` 與 `POST /admin/reward-events` 現在回 410，已永久關閉 legacy economic writes；不得按舊文件誤判仍可寫入而重做這一層。README 的早期 MVP reward 敘述也不能凌駕目前 `economy.ts` 與 backend tests。

W0 PARTIAL 表示已建立可追溯來源／範圍與驗證證據，但測試與正式環境證據缺口仍在；它不是 Birthday 成果 FAIL，也不是 Production Ready。未執行任何 W1 開發。


