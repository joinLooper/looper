# W1A SQLite → PostgreSQL Parity Report

工作包日期：2026-10-06；收尾驗證：2026-10-07（Asia/Taipei）。本輪交付完整mapping與執行設計，沒有進行正式migration。

## A. Remote Preservation

Gate 0 PASS。來源分支`codex/welcome-first-resident`的核准local Final HEAD與push後fetch／ls-remote查得的remote HEAD一致：

`425ab07be751824e590587d89434c09e52558412`

正常push保存兩個commits：

- `bc6a8cc5935d7c84f7c1b1f9c2b8495b50e0a3a0` — test: close W0 baseline authority and portable browser QA
- `425ab07be751824e590587d89434c09e52558412` — docs: record W0 and W0.1 baseline closure evidence

沒有merge main、squash、rebase、force push或history rewrite。Gate 0當下source branch clean且與origin同步。之後從Final SHA建立`codex/app-w1a-postgres-parity`；本輪工作僅在此分支。W1A交付commit SHA與最終Git狀態於回覆列出；來源branch遠端已保存，W1A分支沒有推送。

[Remote evidence](W1A_REMOTE_PRESERVATION.json)

## B. Current SQLite Inventory

重新以原source在隔離`:memory:`建構，再讀取sqlite_master／PRAGMA；未沿用W0計數。

| 項目                              |           數量 |
| --------------------------------- | -------------: |
| 應用tables（含schema_migrations） |             35 |
| internal sqlite_sequence          |              1 |
| columns                           |            332 |
| triggers                          |             12 |
| explicit／automatic indexes       |         18／63 |
| 全部indexes／其中partial          |          81／7 |
| FK／CHECK                         |        55／112 |
| migrations                        | 27，v1–v27連續 |
| 顯式Store transactions            |             26 |
| JSON／timestamp欄位               |         17／61 |

完整涵蓋Identity、Player state、Growth、Merchant、Mission/Task Code、Economy、Content、Governance。accounts/users、LINE identities、sessions、role/membership、Stars/EXP/Level/Energy/Reduced Motion、growth balances/conversion、reward/ledger/redemption、Knowledge/daily Resident claims、queue、audit與report scope均已定位。

沒有獨立settlement或monthly archive表；現行settlement跨多表，monthly是live read model。Stars expenditure正向流程尚不存在，不因工作包場景清單而新增domain。

[完整schema inventory](W1A_SCHEMA_INVENTORY.json)｜[逐表逐欄與mapping](W1A_SQLITE_POSTGRES_PARITY_MAP.md)

## C. SQLite-specific Findings

DatabaseSync同步store、PRAGMA、BEGIN IMMEDIATE、sqlite_master、migration rebuild／foreign_key_check、datetime('now')、json_valid/extract/set、INSERT OR IGNORE、RAISE(ABORT)、partial indexes、AUTOINCREMENT、INTEGER affinity、GLOB／LIKE／text排序等皆有source位置與PG策略。

隔離探測確認：TEXT PK可收NULL；JSON CHECK遇缺key可因NULL通過；IGNORE會略過CHECK失敗；一般ledger/audit可raw UPDATE；Knowledge immutable trigger拒絕UPDATE/DELETE；queue allocation可隨rollback回復；JSON duplicate key取第一個、數字字串比較與PG直接cast不同。

[八組SQLite behavior evidence](W1A_SQLITE_BEHAVIOR_PROBES.json)

## D. PostgreSQL Mapping Decisions

保留TEXT IDs、原enum/default/FK/unique/check與歷史references。一般integer→bigint、0/1→smallint＋原CHECK；所有17JSON及61timestamp欄位逐欄判斷後保留text，維持raw bytes、既有serializers、offset／legacy值。JSON相容helper、NULL/type preflight與safe-number adapter有明确驗收策略。

初版以固定connection＋transaction-scoped writer lock對準SQLite單writer；完整保留26個顯式邊界及pre-transaction副作用。queue採transactional high-water allocator設計；不能直接用PG非rollback sequence宣稱完全等價。四張DB immutable表保留trigger；一般append-only慣例及redemption交易內link更新另列。

以上是待review的遷移方案；沒有生成／執行PG tables或修改business code。

## E. Parity Risks

- **P0：** async/connection/並發破壞atomicity；ID/JSON/time轉型損失；production帶入demo seed；Data API/credential越過Backend authority。
- **P1：** immutable保護層誤判、redemption合法update受阻；sequence/NULL/IGNORE/JSON coercion差異；lazywrite與雙時鐘；legacy報表缺evidence；誤造不存在的Stars支出／archive功能。
- **P2：** collation/LIKE/NULL排序、cursor及index效能；Node ICU／target PG版本差異。

每項已對應test與停止條件。這些是後續implementation/cutover gate，並非本輪已實作或已解除的production風險。

## F. Seed / Bootstrap Classification

- **A Production Configuration：** core economy、3plans、10levels、disabled diamond recipe；import時以source既有設定為準。
- **B Bootstrap：** migration metadata；explicit one-time platform-admin bootstrap與invitation/audit，不在connection自動建立。
- **C Demo/Test：** user-demo四張account/player/state表、API fakeLINE/cookies、QA居民與capturememoryfixtures；production initializer禁止自動建立。
- **D Backfill：** regeneration修正、v3ledger metadata、v8finalrules、v12brand、v14account、v23sessionpurpose；已v27不能再跑一次或假補歷史timestamp/snapshot。

## G. Supabase Boundary

全部35authoritative tables Backend-only，建議專用未exposed schema，未使用時關閉Data API。future公開僅能另review最少欄位projection＋grants/RLS；目前LINE/account IDs不能直接套auth.uid()。service-role／secret／DBpassword只留Server。Supabase Auth及Native credential未導入。

[Supabase Exposure Plan](W1A_SUPABASE_BOUNDARY.md)

## H. Parity Test Plan Summary

P01–P27完整列出inputs／assertions／既有source test anchors；重用315 tests與fixtures，沒有另一套business oracle。設計固定global/injected clocks與entropy、同event SQLite/PG雙跑、逐step response/row delta、最後35表typed raw snapshot exact comparison。

現有tests直接耦合SQLite，文件明確指出未來fixture/inspection/async adapter接縫；不宣稱改環境變數即可跑PG。另列multi-process races、所有constraint/trigger、sequence/JSON/Unicode邊緣組。P11正式Stars支出不存在，以N/A-with-authority＋現有410/DDL負向驗證處理，不發明扣款規則。

[Parity Test Plan](W1A_PARITY_TEST_PLAN.md)

## I. Data Migration / Rollback Plan

涵蓋一致backup/restore rehearsal、封鎖含lazywrite的GET與所有writers、read-only export、typed raw checksums、55FK dependency ordering與merchant/applicationcycle、FK-safeimport/VALIDATE、ledger/balance/count/reconciliation、單一authority cutover及post-cutover驗收。

保留全部IDs/keys/timestamps/ruleversions/snapshots/references；demo排除需完整dependency manifest。PG有新寫入後不得直接切回舊SQLite；需重新freeze、雙邊backup、受控逆向replay或forwardfix。

[Data Migration / Rollback Plan](W1A_DATA_MIGRATION_PLAN.md)

## J. Files Changed

本輪新增，既有tracked files沒有修改：

| 檔案                                 | 原因                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| W1A_SQLITE_POSTGRES_PARITY_MAP.md    | domain、全欄位／constraints、27migration、SQLite→PG行為、JSON/time/seed/risk |
| W1A_SCHEMA_INVENTORY.json            | 可重現的raw schema、source hashes、migration source、tests/methods inventory |
| W1A_PARITY_TEST_PLAN.md              | 27場景、single-runner策略、原tests/fixtures、PG未執行界線                    |
| W1A_DATA_MIGRATION_PLAN.md           | 未來backup→freeze→import→verify→cutover與rollback設計                        |
| W1A_SUPABASE_BOUNDARY.md             | 全表Backend-only、futureRLS／credential／Auth邊界                            |
| W1A_REMOTE_PRESERVATION.json         | Gate0 push/fetch/ls-remote證據                                               |
| W1A_SQLITE_BEHAVIOR_PROBES.json      | 八組隔離SQLite語意實測                                                       |
| W1A_VALIDATION_RESULTS.json          | counts／coverage／source scope／API結果及launcher限制                        |
| W1A_EVIDENCE/                        | API PASS log、pnpm launcher failure、inventory check log                     |
| W1A_REPORT.md                        | A–M中央review交付摘要                                                        |
| ../../scripts/inspect-w1a-schema.mjs | 僅memoryDB的schema/AST inspection與deterministic --check                     |
| ../../scripts/probe-w1a-sqlite.mjs   | 僅memoryDB／savepoint的SQLite語意探測，不含新的業務計算                      |

前十項位於docs/migrations；scripts不接受production DB path，不連外DB。無package/lock/CI/Backend/Gameplay/Economy/UI/Forest修改。

## K. Validation

- Gate0 remote preservation：PASS；final再查remote仍為425ab07…。
- inventory generation及`--check`可重現：PASS。
- SQLite integrity_check=ok；foreign_key_check空；27migration replay metadata/schema不變；seed replay counts不變。
- 8組SQLite behavior probes：PASS，包含JSON truth-table corpus。
- 315既有API tests：315PASS、0FAIL、0SKIP（同Node/tsx runner，136.0秒）。
- 五份必要文件、35表、332欄、27migration、27scenario、所有表Backend-only、source anchors／檔案連結一致性：PASS。
- 分析scripts `node --check`：PASS；本輪scripts/docs Prettier檢查：PASS。
- 19份API/types source SHA-256核對一致；Git既有tracked files diff為空。
- `pnpm test:api` launcher：**未執行到tests便失敗**。環境fallback pnpm觸發自動install，無TTY而停止並出現Windows libuv assertion；改以同一Node/tsx suite取得上列PASS，沒有改依賴／CI。完整失敗log保留。
- PostgreSQL parity、liveSupabase、productionbuild/browser/runtimeQA：本輪未執行；W0已驗證產品source完全未變，本輪驗證針對analysis artifacts與SQLite oracle。沒有將SQLite PASS宣稱PG PASS。

[Validation JSON](W1A_VALIDATION_RESULTS.json)｜[API test log](W1A_EVIDENCE/API_TESTS.log.txt)

## L. Remaining Questions / Blockers

W1A分析交付沒有未完成項目。中央需review保守text型別、writer serialization與queue allocator策略。後續實作/正式搬遷前，須取得target確切PG版本/pool/roles、真實DB路徑與資料preflight、demo dependency分類、maintenance/RTO/retention與rollback演練結果；這些尚未驗證，不授權現在去建productionproject或搬資料。

目前環境pnpm launcher需在下一次正式CI/開發包確認；W1A以既有runner直接驗證通過。PG adapter與雙資料庫實測屬後續授權工作。沒有開始W1B。

## M. Final Status

**W1A PASS — READY FOR CENTRAL REVIEW**
