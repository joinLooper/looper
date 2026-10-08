# W1B PostgreSQL Implementation & Parity Report

日期：2026-10-08（Asia/Taipei）。本報告取代初始 runtime-blocked 記錄；初始證據保留於 commit `4a6c0955ef8d60c6c289f5d0832ee2fbeca286a2`。R0 已通過並依授權返回 W1B；未進入 W1C。

## A. Source / Branch

- Repository：joinLooper/looper。
- Birthday source：codex/welcome-first-resident，`8653934e4fc9387a5cabf7f77daa5f8ad837245a`。
- W0 final：`425ab07be751824e590587d89434c09e52558412`。
- W1A final / W1B source：`06b64d1906074b8a9b84ded1b6d2818b88d80189`。
- Branch：`codex/app-w1b-postgres-parity`，由 W1A final 建立；14 份 W1A 文件與 scripts 保持 source blob 不變。
- R0 implementation：`e534b4b8360e70ad3fc3a38f3c4cbc3d8513f9d9`。
- W1B implementation HEAD：`32e82bdc6f23fff08428cc7495411e68a5bc95d0`（58 files，含 source、tests 與實跑 evidence）。
- 本報告與 validation JSON 另作 closure commit；Final HEAD 完整 SHA 於最終交付回報列出。
- 未 merge main、rebase、squash、force push 或改寫 W0/W1A history。

## B. PostgreSQL Runtime

真實 **PostgreSQL 17.11**，官方 PostgreSQL Windows 頁面指向的 EDB binary ZIP，SHA-256 `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`，與供應方 checksum 相符。

專案內 `.runtime/postgres17/{binary,data,logs,temp}` 全部 ignored。UTF8、locale C、UTC；僅 `127.0.0.1:55432`。DB `looper_w1b` / role `looper_w1b_test`，非 superuser、不可建立 DB/role、不可 replication。密碼只在 ignored runtime。無 installer、service、registry installation、global PATH/environment 修改，亦未安裝 Docker/Podman/WSL。

非 ASCII 專案路徑使用受 ownership guard 保護、非持久的 W: DOS-device alias；實體檔案仍在專案內。Start/stop/status/reset、foreign-owner rejection、arbitrary-path rejection 已由 R0 實跑。詳見 [R0 report](W1B_R0_PORTABLE_POSTGRES_RUNTIME_REPORT.md) 與 [R0 machine evidence](W1B_R0_RUNTIME_RESULTS.json)。

10/08 恢復工作時發現先前非正常中斷，等待 PostgreSQL fsync recovery 完成並正常關閉；reset helper 在關閉逾時時 fail closed，未刪除使用中的 data。後續只重建具 ownership marker 的 W1B 測試 cluster。完整收尾為 PASS：載入全部 tests 後 checkpoint 125.688 秒，正常關閉完成；helper stop/reset 等待上限調整為 300 秒，保留 fsync 與 fail-closed。最終版本重新 start/status/stop 通過，55432 port 與 W: alias 已釋放。

## C. Schema Implementation

Source-controlled [W1B_POSTGRES_SCHEMA.sql](W1B_POSTGRES_SCHEMA.sql) 由核准 W1A inventory 產生。35 application tables、332 columns、55 FK、112 CHECK、12 trigger-equivalent protections、27 migration metadata rows；保留 source unique/explicit/partial indexes。

SQLite INTEGER → PG bigint；nullable TEXT primary key 依 source NULL 語意映為 nullable UNIQUE，未擅自加 NOT NULL。PG 會為 SQLite rowid alias 對應 INTEGER primary key 多建立實體 index；實體 index 數差異不等於少掉 source uniqueness。7 partial indexes 保留。額外 `w1b_control.queue_counters` 只屬 engine allocator metadata。

## D. Persistence Architecture

API / 原有單一 Store business logic → `PersistenceDatabase` → 既有 SQLite connection 或 isolated PG adapter。Default entry 仍開啟 SQLite。Store 新增可選 database injection；reporting/migrations helper 的 DB type 改為 structural contract。

Pinned `pg@8.16.3` 在 dedicated worker/connection 執行；bounded synchronous bridge 保留原 Store 介面，不複製 Economy、Settlement、Level、Growth、Knowledge 或 Task Code logic。未導入 ORM 或 Supabase JS。詳細設計與重現步驟：[implementation notes](W1B_IMPLEMENTATION_NOTES.md)。

## E. BIGINT Strategy

Per-client int8/numeric integer codec 僅接受 safe integer，API 仍為 number；未修改 pg global parser。測試 0、1、2^31、2^32、MAX_SAFE_INTEGER，以及超界 DB read / binding / codec hard failure。禁止 silent overflow。

## F. Transaction / Writer Lock

每個 `BEGIN IMMEDIATE` → `BEGIN` + `pg_advisory_xact_lock(170027,1)`，同 connection 保持到 COMMIT/ROLLBACK。Standalone writes 同樣取得此 transaction lock。26 個 Store transaction 方法內容經 AST/source body comparison 證明未變，逐方法 target/hash 與 11 個 IGNORE call-site 收錄於 [traceability](W1B_TRANSACTION_TRACEABILITY.json)。

Transaction 內 statement savepoint 重現 SQLite ABORT：單一 statement 失敗不毒化外層 transaction。IGNORE 僅吞 UNIQUE / NOT NULL / CHECK；FK、trigger error 仍拋出，不使用機械式 ON CONFLICT DO NOTHING。

## G. Queue Allocation

Allocator row 的 high-water update 與 queue insert 在同一 transaction；rollback 一起復原。測試 forced rollback 後 order reuse 與 SQLite 一致、failed insert、刪除最高 order 後不重用、explicit order 推進 counter。未使用 SERIAL/BIGSERIAL/ordinary sequence。

## H. JSON / Timestamp Compatibility

17 JSON、61 timestamps 保持 TEXT。JSON helpers 覆蓋核准 SQLite corpus：valid/missing/NULL/malformed/duplicate key/numeric string/numeric/boolean/empty object；json_set 與 scalar-root behavior 亦 dual-run。未對 stored raw TEXT 做 normalize、key reorder 或 duplicate cleanup。Helpers 只支援目前 source 使用的 flat paths，其他 path 明確拒絕。

保留 timestamp raw string、offset、lexicographic behavior、NULL ordering、ASCII lower/LIKE/GLOB。P04/P05 驗證 Knowledge/Resident daily；P15/P19/P27 驗證 merchant date、expiry、Taipei month cutoff。雙 engine 使用同 injected clock 與 deterministic entropy。P27 另外以逐次 clock tape 驗證 confirmedAt/settledAt 分跨月份，並在 UTC、Asia/Taipei 兩個 process TZ 執行；兩次全部資料 SHA-256 一致，詳見 [timezone evidence](W1B_EVIDENCE/timestamp-timezones.json)。

## I. Seed / Bootstrap

連線不自動 seed。Explicit PG bootstrap 只套 schema 與共用 `seedConfiguration`；fresh PG 驗證 accounts/users/identities/sessions 皆零。原 SQLite seed 保留既有 demo/backfill 行為；PG demo fixtures 只由 test harness 顯式呼叫，未混入 production bootstrap。

四張 source DB-level immutable table 保留 UPDATE/DELETE rejection；合法 ledger / settlement link / decision transition 仍可執行，未擴大 immutable 範圍。

## J. P01–P27 Parity Results

**P01–P27：27/27 PASS**（P11 為 N/A WITH AUTHORITY — PASS）。每個 scenario 同 business input 雙 engine 執行，machine exact compare API/Store result 與全部 35 表資料；僅 transport JSON serialization 與 relational row order 正規化，沒有刪除 IDs、timestamps、snapshot 或 economic values。

編號依最新 W1B 工作包：W1A 原 growth 門檻場景併入本批 P14，完整核銷效果由 P15/P17 覆蓋，P16 為 pending 無獎勵。P01/P04/P05/P07/P08/P09 同時包含 account/profile rollback、Knowledge conflict、Resident 未完成與 claim rollback、exact threshold、vegetarian queue 與 overflow 的負向／邊界檢查。

P11 依 authority 驗證 legacy spending routes 維持 410，正式 Stars expenditure 為 N/A WITH AUTHORITY，未新增 spending rule。[Machine results](W1B_PARITY_RESULTS.json)。

## K. Concurrency Results

四組真實獨立 worker/API request/PG connection：同 Knowledge、同 Task Code confirm、同 Resident claim、不同玩家 settlement。控制 connection 暫持 writer lock，確認兩個不同 backend PID 同時等待 advisory lock 再釋放；驗證 reward/EXP/ledger 不重複、balance 不 lost update、queue 次序、idempotency 與 settlement links 原子性。[Machine results](W1B_CONCURRENCY_RESULTS.json)。**4/4 PASS**；same Knowledge / confirm / claim 各只有 1 個 reward，不同玩家 settlement 產生 2 個，各自正確入帳。

## L. Failure Injection Results

五點：reward insert 後、resources update 後、growth 中、audit 前、settlement/task-code link 前。SQLite/PG 各自比較 rollback 前後全部 35 表，再 exact compare retry 結果與 queue。[Machine results](W1B_FAILURE_INJECTION_RESULTS.json)。**5/5 PASS**。另有 real backend termination rollback PASS，沒有自動重送交易。

## M. Existing API Regression

既有 API tests 沒有放寬 assertion；僅 helper DB parameter type 對齊 contract。原有 frontend 不變。Gameplay、economy values、Forest、Treehouse、UI、visual canon/assets 均未修改。正式 root gate 的既有 API **315/315 PASS**、frontend **129/129 PASS**；0 fail、0 skip，SQLite regression 0。

## N. Toolchain Validation

`w1b-pnpm.ps1` 明確使用 Corepack 的 pnpm 10.13.1，process-only shim 讓 nested pnpm 使用相同版本，結束復原環境。沒有修改 global pnpm 或 execution policy。

Root `pnpm test` 依序包含 `test:api`、`test:frontend`、`test:postgres`。API 的 lint/typecheck 亦透過 `tsconfig.parity.json` 檢查新 parity fixtures/scenarios，仍使用既有 TypeScript 與 Node test runner。Windows 必須先啟動 R0 runtime；無 mock/skip fallback。CI 只新增官方 pinned PG17 container 的 isolated start/stop steps；Windows 未安裝 container runtime。Hosted CI 尚未觸發，不宣稱遠端執行 PASS。

| Gate | Result |
| --- | --- |
| pnpm 10.13.1 install --frozen-lockfile | PASS；lockfile up to date，既有版本未升級 |
| pnpm lint | PASS；含新 parity TypeScript |
| pnpm typecheck | PASS；含新 parity TypeScript |
| pnpm build | PASS；9 tasks，API rebuilt / 8 unchanged cached |
| pnpm test | **488/488 PASS，exit 0，0 fail / skipped / cancelled / todo** |
| API / frontend / PostgreSQL | 315 / 129 / 44 PASS |
| PG suite breakdown | P01–P27 27 + compatibility 8 + concurrency 4 + failure 5 |
| UTC / Asia/Taipei P27 | 各 PASS，完整資料 hash 相同 |
| Portable lifecycle / guards / final stop | PASS；loopback-only，port/alias 已釋放 |
| Source authority / credential scan | PASS；W1A 未變，26 transaction bodies 未變，credentials 未入 Git |

完整 [validation JSON](W1B_VALIDATION_RESULTS.json)、[baseline log](W1B_EVIDENCE/baseline-tests.log.txt) 與 [runtime final cycle](W1B_EVIDENCE/runtime-final-cycle.log.txt) 已提交。API 本次耗時約 4014 秒，受本機 I/O 延遲影響；PG suite 約 134 秒。不是 production throughput benchmark。

## O. Files Changed

- `apps/api/src/persistence/*`：DB contract、PG worker/bridge、BIGINT、SQL/JSON compatibility、explicit bootstrap。
- `apps/api/src/{store,database,monthly-live-report}.ts`：可選 DB injection、structural type、config/demo seed 分離；保留業務 authority。
- `apps/api/src/app.test.ts`：僅測試 helper DB type。
- `apps/api/test-parity/*`：deterministic dual harness、P01–P27、compatibility、real concurrency、failure injection。
- `apps/api/package.json`、`pnpm-lock.yaml`：pinned pg driver/types 及必要 transitive closure，未升級既有 lockfile dependency。
- `apps/api/tsconfig.json` / `tsconfig.parity.json`：build 一併輸出 worker .mjs；lint/typecheck 覆蓋新 parity tests。
- Root package、CI、test-postgres / w1b-ci-pg / w1b-pnpm scripts：正式 gate 與可重現 toolchain。
- generate-w1b-schema / inspect-w1b-authority：從核准 source 產生 schema 與 traceability。
- W1B docs / JSON / evidence：本批實跑結果與限制。
- R0 helpers / README：修正 Windows 全段日誌擷取造成 daemon pipe 不返回的情況；pg_ctl 使用 hidden launcher、其餘 PG CLI 使用 explicit UTF8 pipes、wrapper error 直通，明列 PowerShell 7 要求；重新驗證完整 lifecycle。

完整逐檔清單與 source/evidence SHA-256 收錄於 [validation JSON](W1B_VALIDATION_RESULTS.json)。保存的 console logs 僅去除顯示用行尾空白；測試內容不刪減，DB TEXT parity 未經此處理。

## P. Remaining Risks

同步 PG bridge 阻塞 caller，屬 isolated parity phase，不構成 production throughput/deployment 決定；bounded timeout 會 fail 且不自動 retry。SQL compatibility 對目前 source query corpus，不宣称通用 SQLite emulator。OneDrive-backed runtime 在非正常中斷後可能需要長時間 fsync recovery，須正常 stop 並等待完成；不關閉 fsync 以加速 gate。Hosted Linux CI 設定尚待遠端執行。安裝仍顯示既有 url.parse deprecation 與 sharp build script ignored 訊息，install/build 均 exit 0；未因此擴大 dependency script 授權。

未接觸任何 Supabase/school/舊 joinLooper/真人資料 DB；未建立 Auth/Data API/RLS/Storage/grant anon/authenticated；未部署、未開始 Native App 或 W1C。

## Q. Final Status

**W1B PASS — READY FOR CENTRAL REVIEW**

W1B-R0 已 PASS，並已依授權完成原 W1B。停於中央 Review；未進入 W1C。
