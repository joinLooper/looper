# W1A SQLite → PostgreSQL Schema / Behavior Parity Map

日期：2026-10-06（Asia/Taipei）。這是 mapping／驗證設計，沒有 PostgreSQL DDL 執行、正式資料搬遷或 Supabase project。

## Authority 與 Gate 0

- Repository：joinLooper/looper；來源分支：`codex/welcome-first-resident`。
- W0 source：`8653934e4fc9387a5cabf7f77daa5f8ad837245a`。
- W0.1 implementation：`bc6a8cc5935d7c84f7c1b1f9c2b8495b50e0a3a0`。
- W0.1 Final／本輪 source：`425ab07be751824e590587d89434c09e52558412`。
- Gate 0 已正常 push 上述兩個 commits；fetch、remote-tracking ref 與 `ls-remote` 均核對為 Final SHA。來源工作樹 clean，無 merge／rebase／force push。
- W1A 工作分支：`codex/app-w1a-postgres-parity`，從 Final SHA 建立。
- 程式 authority：`apps/api/src/{database,store,economy,app,monthly-live-report,reporting-eligibility,player-identity}.ts`、`packages/types/src/index.ts` 及既有 API tests。JSON inventory 保存每份 source SHA-256、315 個測試名稱／位置、完整 migration source。

## 新盤點結果與讀法

`node --import tsx scripts/inspect-w1a-schema.mjs` 只呼叫原 `openDatabase(':memory:')`，從 sqlite_master 與 PRAGMA 讀出 schema，再驗證 migration／seed replay；不開啟 `.data` 或任何正式 DB。

| 項目                              |        實測數量 |
| --------------------------------- | --------------: |
| 應用表（含 schema_migrations）    |              35 |
| SQLite 內部表 sqlite_sequence     |               1 |
| 欄位（應用表）                    |             332 |
| PK                                |           35 組 |
| FK                                | 55 組，均為單欄 |
| CHECK                             |          112 個 |
| Explicit indexes                  |              18 |
| Automatic PK／UNIQUE indexes      |              63 |
| 全部 indexes                      |              81 |
| Partial indexes（已包含在 18 內） |               7 |
| Triggers                          |              12 |
| Migrations                        | 27（1–27 連續） |
| Store 顯式 BEGIN IMMEDIATE 邊界   |              26 |
| 既有 API test cases               |             315 |

W0 所稱 36 tables 包含 sqlite_sequence。本輪重新查詢後以 35＋1 分開報告；不能將 36 解讀為 36 個 domain tables。沒有單獨的 settlement、monthly_report、seedling 或 plant entity table：settlement 是 redemptions／reward_events／submission links／ledger 的既有組合；growth 是 integer counters＋logs；monthly report 是現算 read model。

[W1A_SCHEMA_INVENTORY.json](W1A_SCHEMA_INVENTORY.json) 是逐欄完整清單：原 DDL、notnull、defaults、PK ordinal、FK action、UNIQUE keys、index predicate／排序／collation、trigger SQL、每欄 PostgreSQL 建議型別。附錄提供所有表與 JSON／timestamp 欄位的可讀索引。此為 fresh v27 schema inventory，不宣稱已掃描實際 production rows 或每條歷史 upgrade 分支。

## PostgreSQL 決策（preserve semantics first）

1. 保留所有表名、欄名、ID、歷史 FK／logical references、enum 值、nullable 欄、defaults、idempotency 範圍及 schema_migrations 原紀錄。TEXT IDs 留 `text`，不全面轉 UUID。
2. 數值一般用 `bigint` 保留 SQLite integer 範圍；0/1 欄用 `smallint`＋原 CHECK（reduced_motion 可 NULL）。不轉浮點金額；CO₂e 繼續以 gram 儲存，800 g 的呈現才是 0.8 kg。driver 取得 bigint／SUM 可能為字串，必須有明確 safe-number conversion；超出 JS safe integer 的歷史值無損匯出，但不得默默 rounding 後進 business logic。
3. 所有 timestamp 本次 mapping 留 `text`；業務日期亦留文字＋相同格式 CHECK。保留既有 UTC ISO 毫秒、offset 字串或 legacy NULL／缺值；`schema_migrations.applied_at` 的 UTC `YYYY-MM-DD HH:mm:ss` 也保留。timestamptz 能保留 instant 卻不能保留原字串／offset 表示法；若後續要增 typed projection 必須另驗證，不能覆寫 raw authority。[PostgreSQL Date/Time](https://www.postgresql.org/docs/current/datatype-datetime.html)
4. 17 個 JSON 欄逐一評估後選擇 `text`，原因見專節。不是全域改 jsonb，也不是增加原本不存在的全欄 json_valid CHECK。Backend 仍使用 JSON.parse／JSON.stringify／stableStringify。
5. 常數 defaults 原值搬入；不要把 Backend timestamp、ID generation、business-date decision 偷換成 DB defaults／now()。PG text equality／排序採 C collation；NULL 排序顯式對準 SQLite。中文／大小寫查詢另外做 compatibility test。
6. NOT NULL 與 UNIQUE 保留原範圍。注意 SQLite non-STRICT TEXT PRIMARY KEY 在未宣告 NOT NULL 時能收 NULL；PG PK 隱含 NOT NULL。[SQLite PK 行為](https://www.sqlite.org/lang_createtable.html)／[PG constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)。正式搬遷前逐表證明 ID 非 NULL、型別正確；若出現例外，停止並中央裁決，不能生成新 ID 或丟棄列。預期 canonical domain 使用非空 ID，但不把它誤寫成 SQLite 已有強約束。
7. 保留 55 FK 的 ON DELETE CASCADE／NO ACTION、ON UPDATE NO ACTION 與原 nullable 關係。歷史 snapshot 的 brand／merchant 文字欄沒有 FK，不補 FK 指向 current master；`source_id`、audit actor／entity 等 logical references 也不擅加 FK。
8. 保留原 enum CHECK 與 CHECK 的 SQL NULL 三值語意。沒有 new enum types、表合併或 ledger 正規化。所有跨表 trigger 保留適用欄位與排除自身的 UPDATE 條件。

## SQLite-specific → PostgreSQL → risk → test

只列 source 中存在或實際 schema 必然使用的行為；完整 occurrence 在 inventory.sqliteFindings。

| 現行 SQLite／source                                                            | PostgreSQL 對應策略                                                                                                                                                                                      | Parity risk                                                                               | 必須驗證                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| DatabaseSync；同步 prepare/get/all/run；`?` 參數                               | Server PG pool；每個 transaction 固定同一 client；參數轉 `$1…`；all→rows、get→首列或 undefined、run.changes→rowCount                                                                                     | 同步 store 與 app 呼叫不能僅換 driver；async 漏 await 或換 connection 會破壞原子性        | 同一組 API contract；rollback、無回應提前 commit；每個 .changes 判斷                   |
| PRAGMA foreign_keys ON／busy_timeout 5000                                      | 正常 FK always enforced；有界 lock wait，timeout 與 retry policy 由 adapter 對應                                                                                                                         | PG 錯誤碼不同；不可吞 FK failure                                                          | 父子刪除、timeout、409／400／500 邊界                                                  |
| BEGIN IMMEDIATE／COMMIT／ROLLBACK                                              | 同一 PG transaction；初版 writer-serialization compatibility lock，見下一節                                                                                                                              | SQLite 單 writer 與 PG MVCC 行為不同                                                      | 多 connection／多 process 重播、last-super-admin、membership cross-scope               |
| sqlite_master／PRAGMA table_info、foreign_key_check                            | pg_catalog／information_schema；constraints VALIDATE＋明確 FK anti-join                                                                                                                                  | 不能字串比對 PG DDL 判斷 migration                                                        | 35 表／332 欄／全部 constraints introspection；no orphan                               |
| PRAGMA foreign_keys OFF＋legacy_alter_table 重建                               | PG transactional ALTER 或 staging rebuild；僅 migration owner 操作，FK 延後建立／VALIDATE，不用 session_replication_role 關閉保護                                                                        | 重建可能丟 trigger／index；PG DDL 失敗 transaction 整體 aborted                           | migration rollback、保留歷史 rows、trigger/index 重建完整                              |
| migration `datetime('now')`                                                    | 僅新 migration metadata 在 server 產相同 UTC 秒格式；舊值 raw import                                                                                                                                     | PG now() 固定 transaction 時刻且輸出格式不同                                              | format、replay 不重写 applied_at                                                       |
| json_valid／json_extract／json_set（economy setting CHECK、v2／seed backfill） | text storage＋狹窄 JSON compatibility expression/helper；僅 backfill 需要修改指定 key，保留其他值                                                                                                        | 缺 key→NULL，CHECK 可能通過；JSON type／數字字串與 PG cast 不等價                         | malformed／missing／null／numeric-string／bool／array、1200→120、有自訂 key 的回填     |
| INSERT OR IGNORE（seeds、brand/account backfill、daily instance）              | canonical 有效輸入用明確 unique conflict target DO NOTHING並讀回row；若要求原IGNORE全部行為，用每statement savepoint／相容validator只略過原本被IGNORE的UNIQUE/PK/NOT NULL/CHECK，FK與trigger ABORT仍失敗 | SQLite IGNORE 也忽略 CHECK／NOT NULL；PG ON CONFLICT 不等同                               | duplicate key、different payload、invalid row、FK failure；不能用 UPSERT 覆寫 snapshot |
| RAISE(ABORT)、BEFORE UPDATE/DELETE trigger                                     | row-level PL/pgSQL RAISE EXCEPTION，保留 message／目的；adapter 轉原 domain error                                                                                                                        | SQLite statement abort 與 PG transaction aborted 不同                                     | rollback 後再 retry；immutable 四表 UPDATE／DELETE                                     |
| 部分 unique indexes，NULL distinct                                             | PG partial unique indexes＋原 predicate；預設 NULL distinct                                                                                                                                              | 不可改 NULLS NOT DISTINCT／省略 predicate                                                 | active window 唯一、NULL membership scope、optional decision key                       |
| INTEGER／TEXT affinity，非 STRICT 表                                           | canonical bigint／smallint／text；export 額外保留 typeof／raw bytes，異型資料 fail preflight                                                                                                             | SQLite 可能存 REAL/TEXT 於 INTEGER；PG text 不接受 NUL，UTF-8 非法資料亦須處理            | 逐欄 typeof、64-bit、safe integer、NULL PK、NUL／UTF-8 audit                           |
| queue_order INTEGER PRIMARY KEY AUTOINCREMENT、sqlite_sequence                 | PG bigint PK＋transactional high-water allocator（技術 metadata，不是新 domain）；import SQLite 高水位                                                                                                   | PG sequence nextval 不會隨 rollback 回復；不能直接用 identity 宣稱完全等價                | 失敗後 retry、刪最大值再新增、explicit import ID、序列耗盡、歷史高水位                 |
| INTEGER PRIMARY KEY（level／schema version）                                   | bigint PK，保持 Backend 顯式給值                                                                                                                                                                         | 不能自動產新 level/version                                                                | 原值與 NOT NULL、重複拒絕                                                              |
| scalar `min(current_energy, CASE…)` v8                                         | LEAST（目前非 NULL input）；NULL 行為須案例確認                                                                                                                                                          | aggregate MIN 與 scalar min 不同                                                          | Lv1–10 clamp、NULL 非法資料 gate                                                       |
| `GLOB` business_date pattern；audit `NOT GLOB`                                 | 固定長度 date shape→ASCII regex＋length 10；audit prefix採 case-sensitive prefix／轉义 regex                                                                                                             | GLOB *、? 與 SQL LIKE %、_ 不同；現行日期 CHECK 只查形狀，不驗日曆                        | invalid shape、shape-valid invalid date、literal underscore、大小寫                    |
| `lower(display_name) LIKE lower(?)`                                            | ASCII-only fold compatibility（translate A–Z），LIKE 指定無 escape 或等價匹配                                                                                                                            | PG Unicode lower／預設 backslash escape 會改搜尋結果                                      | 中文、Å/å、百分號、底線、反斜線、SQL injection 參數化                                  |
| ORDER BY text／DESC、stable cursor                                             | C collation＋ASC NULLS FIRST／DESC NULLS LAST；既有排序 tie-break 原樣                                                                                                                                   | PG NULL／collation 不同；部分 ledger query 只按 created_at，同 timestamp 沒承諾 tie order | 同 timestamp 多筆、nullable expiry、cursor forward/backward、不重複漏列                |
| length(trim(reason))／replace／文字串接 `                                      |                                                                                                                                                                                                          | `                                                                                         | 保留空白 trimming、codepoint 長度、replace escaping、串接 NULL 語意                    | JS trim 比 SQL trim 寬；不要統一「修好」 | ASCII space／tab／emoji／500 codepoints、legacy sourceId 引號 |
| ERR_SQLITE_CONSTRAINT／message 判斷                                            | 有範圍的 PG SQLSTATE 23505／23503／23514／23502／trigger code adapter                                                                                                                                    | 不可把所有 database error 都翻成 409；transaction error 後須 rollback                     | 原各 endpoint errors、connection failure不冒充 replay                                  |
| migration version rows＋每版 transaction                                       | PG migration owner＋migration lock；版本 metadata 與 DDL 同 commit                                                                                                                                       | 27 個 SQLite歷史版本不是 PG fresh schema 的 27 次重播命令                                 | no-op replay、失敗沒有半張表或版本列                                                   |

JSON CHECK compatibility 的具體需求：保留第一個同名JSON key的SQLite extraction行為；JSON boolean轉0/1、missing/null轉SQL NULL；數字以數值比較，文字/array/object依原SQLite storage-class comparison規則判定。先以SQLite產生truth-table corpus，再實作小型PG validation helper，不能直接value_json::jsonb ->> key再numeric cast。一般正常configuration仍通過原Backend更嚴格的validator。這是有明確input/output oracle的待實作compatibility層，未宣称已在PG验证。

上述 IGNORE、json coercion、affinity 邊緣行為列入 W1B 實作驗收。不能只在 happy path 全綠時宣称 raw SQL 行為完全等價。[SQLite conflict](https://www.sqlite.org/lang_conflict.html)、[SQLite AUTOINCREMENT](https://www.sqlite.org/autoinc.html)、[PG sequence rollback](https://www.postgresql.org/docs/current/functions-sequence.html)。

## Transaction semantics、idempotency、ledger

### 初版 PG concurrency 策略

26 個顯式 transaction 逐一保留，完整方法／呼叫鏈於 inventory.methods 與附錄。`BEGIN` 後在任何讀取前取得專用 `pg_advisory_xact_lock`（固定命名空間的 writer lock），使用 READ COMMITTED，所有受支援 writer 必須遵守，包括 background／lazy writes。這是初版相容策略，避免 PG row lock 只鎖到既有 row、卻漏掉尚不存在的 identity／idempotency／brand-scope rows。對每次 mutation 的 lock、唯一約束、rowCount 判斷均需測試；後續改細粒度鎖是獨立優化。[PG isolation](https://www.postgresql.org/docs/current/transaction-iso.html)、[PG locking](https://www.postgresql.org/docs/current/explicit-locking.html)

Backend 用同一 connection 傳遞 transaction context；`redeemInTransaction`、`applyRewardEvent`、`settleGrowthLedger`、audit 等不得自行 commit／從 pool 換 connection。LINE verifier 等外部呼叫在持鎖前完成。唯一鍵 race 先 rollback 再完整讀回／重播；40001／40P01 若發生只重試完整 transaction，使用相同 request fingerprint。重試次數／等待上限要固定且可觀測；不能跨 midnight 重算原已固定的 business input。不要使用 session-level lock 配合 transaction pooling。

單次有效 task-code confirm 的原子集合：confirmed state＋decision audit → enrollment → redemption insert → reward event＋rule snapshot → Stars／EXP／Level／Energy／Growth balances＋resource_transactions＋growth／level／energy logs＋player_event_queue → redemption reward link＋enrollment completion → submission settled_at／links＋settlement audit。全部由 `decideTaskCodeSubmission` 2391 的 transaction 包住。正常 confirm 不留下半完成 confirmed；legacy confirmed recovery 仍使用原 decision key。expired 清理在 transaction 前，是獨立 durable side effect，不能在 conflict 時一併吞掉。

Knowledge：daily effective version=`${baseCardVersion}:YYYY-MM-DD`、attempt＋reward＋ledger＋events＋audit 一起 commit；同 key 改 payload、同日改答案409。Resident claim：REQUEST／CLAIM_PENDING 到 BACKEND_SUCCESS／CLAIMED、result_json＋reward＋audit 同一 transaction；失敗沒有留下 request 或 pending reward。

Idempotency 不是全庫一個統一範圍：accounts.creation_idempotency_key nullable unique；invitations.creation_idempotency_key global unique；reward_events／redemptions／task_code_submissions／knowledge_card_attempts 的 key 各自 global unique；decision key partial unique；resident_mission_claim_requests 是 `(user_id,idempotency_key)`；player_event_queue resolution key unique；platform status/role transition 各表 unique。另保留 reward `(source_type,source_id,user_id)`、Knowledge `(user_id,card_id,card_version)`、Resident `(user_id,mission_id,business_date)` 與 ledger 七欄 composite key。所有 exact keys 在 inventory.uniqueConstraints／indexes，不能調整 namespace。重播 audit 可能合法新增（redemption.replayed），不要用「所有表都不能增加」當通用 assertion。

### 已存在的非顯式 transaction 行為

- `getUser` 1978 → `applyEnergyRegeneration` 3767：可能更新 resources、寫 ledger／energy log／audit；在既有外層 transaction 內就隨外層，獨立 GET 時目前沒有顯式 atomic wrapper。不要把 SELECT request 導到 read replica。
- `getPlayerSessionContext` 1681 可 touch last_used_at 並 getUser；merchant session resolver uses nowIso，player session使用 injected currentTime。
- `getResidentMissionBoardState` 2914 會 ensure daily instance（INSERT OR IGNORE），不是純讀取。
- `createTaskCodeWindow` 2013、`submitMerchantApplication` 2617、`acceptMission` 2798 及 expiry helper 有 autocommit writes。PG port 必須盤點這些 await 引入的 interleaving；現有 failure boundary 保留為 oracle，不擅自把所有請求改成單 transaction。
- 此區列為實作 P0／P1 接口風險。若 W1B 要把獨立 regeneration 多次 writes 新增 atomic wrapper，須明確提出 failure-behavior delta 供 review；本批不修改。

### Immutable 的實際保護層

DB 強制 UPDATE／DELETE 不可變共四表（8 triggers）：knowledge_card_attempts、task_code_submission_scope_snapshots、platform_operator_status_transitions、platform_operator_role_transitions。另4triggers是 membership brand／scope guards。

resource_transactions、reward_events、audit_events、plant_growth_logs、energy_logs、level_up_logs 目前是 Backend append-only 慣例，沒有同等 DB immutable trigger；不可宣稱 SQLite 已強制。PG 至少保留原四表 trigger。Server role 對一般 ledger 可規劃 INSERT／SELECT only，擋住非預期改寫；其 FK CASCADE、owner restore 路徑與 source慣例需分開測試，這不是已存在的 immutable guarantee。

redemptions 特例：同一 settlement transaction 先 INSERT 再 UPDATE reward_event_id，不能把整張表設為不可 UPDATE；只在交易結束後視為歷史結果。reward snapshot只記錄當時規則，replay／monthly report不拿現在設定回算。reporting scope snapshot無 current-master FK，品牌改名後仍用原字串。

## JSON 逐欄決策

PG `json` 驗證且保留輸入表示，`jsonb` 會正規化結構並改變原序列化表示；兩者都會對現有 TEXT 加入更強型別門檻。本輪選 text 保留原資料及字串契約。[PG JSON types](https://www.postgresql.org/docs/current/datatype-json.html)

| SQLite 欄位                                    | PG        | validation／query／immutability 決策                                                                                                                                                                                       |
| ---------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| economy_settings.value_json                    | text      | 唯一有 DB json_valid／extract 條件的 JSON 欄；僅 key=core 的原 CHECK；Backend validateEconomySettings更嚴。PG helper 必須重現 missing→NULL、型別比較，不直接加 required-key CHECK。v2/seed json_set改指定key；不改其他keys |
| level_definitions.unlock_flags_json            | text      | Backend validateLevelDefinitions陣列／字串；DB 無 JSON CHECK；configuration可改，保留陣列順序                                                                                                                              |
| user_resources.unlock_flags_json               | text      | current projection；JSON.parse陣列＋Set 合併；不可由 jsonb 排序或去重替代                                                                                                                                                  |
| level_up_logs.unlock_flags_json                | text      | 歷史當次 unlock flags；Backend append-only，byte preserve                                                                                                                                                                  |
| merchant_applications.vegetarian_offering_json | text      | API meal-type驗證；DB無JSON CHECK；保持字串陣列及順序                                                                                                                                                                      |
| merchant_applications.business_hours_json      | text      | Backend星期完整性、開店時段／其他欄驗證；不重新解析成PG interval                                                                                                                                                           |
| merchants.vegetarian_offering_json             | text      | 從核准資料copy；與application內容、排序一致                                                                                                                                                                                |
| merchants.business_hours_json                  | text      | 保留週計畫；時段是local HH:mm字串，不能轉UTC                                                                                                                                                                               |
| reward_events.logical_request_json             | text      | stableStringify冪等fingerprint；legacy v2拼接表示也保留；不可重序列化造成不同payload                                                                                                                                       |
| reward_events.reward_payload_json              | text      | 歷史正式reward；reporting解析JSON且驗證數值；不重新計算                                                                                                                                                                    |
| reward_events.growth_summary_json              | text      | 歷史conversion結果；不從當前balance覆寫                                                                                                                                                                                    |
| reward_events.level_summary_json               | text      | 歷史level/chest結果；不從新版definitions重算                                                                                                                                                                               |
| reward_events.rule_snapshot_json               | text NULL | legacy缺snapshot仍NULL；malformed值原樣匯出並由report eligibility分類；不補現在規則                                                                                                                                        |
| resource_transactions.metadata_json            | text      | ledger metadata；Backend parse，DB無JSON CHECK；不加新的結構約束                                                                                                                                                           |
| audit_events.metadata_json                     | text      | audit evidence、可能含稽核actor/scope；只Server；原始bytes及serializers保留                                                                                                                                                |
| player_event_queue.payload_json                | text      | level/home event payload；queue狀態可更新但payload不重建；不將既有事件換成新runtime內容                                                                                                                                    |
| resident_mission_claim_requests.result_json    | text NULL | REQUEST時NULL；成功存完整result供replay，狀態CHECK要求非NULL但不驗JSON；保存bytes、replay不重算餘額                                                                                                                        |

所有17欄逐欄含 NULL／default／FK等於JSON inventory。jsonb僅可作將來非authority查詢projection，不能替換上述欄位。經查現在只有economy設定在SQLite SQL內做JSON key extraction；其他query以TypeScript解析。

## Time／timezone／numeric authority

所有61個timestamp欄位（依本輪逐欄清單）採原TEXT，另有resident business_date、merchant timezone、scope reporting_timezone。

- `nowIso()`／`Date.now()`：全域時鐘，store中多處使用；`currentTime()`：StoreOptions注入，Knowledge／Resident／decision／report cutoff等使用。parity harness必須同時固定兩個時鐘，不能只傳 options.now。
- Task window 2h，confirmation 5min；`valid_until <= now`、`confirmation_expires_at <= now` 的等號邊界；submission expiry的 `expired_at` 寫入首次清理時傳入的 now（觀測／處理時間），**不是** confirmation_expires_at；兩者僅在準時處理時相同。允許legacy expired_at NULL，不能回填猜測值。
- confirmed_at 與 settlementEffectiveAt 是不同 currentTime 呼叫；可跨台北月界。reward rule用settlement occurrence instant＋merchant.timezone，redemption.created_at可由另一全域時鐘產生。不可合併這些欄。
- Knowledge `card_version`綁台北business date；resident `(user,mission,business_date)`在台北00:00換日。跨日重播遵循各自source檢查，不能全域共用一套策略。
- Monthly：`packages/types`算 Asia/Taipei `[startAtInclusive,endAtExclusive)`；cutoff為 inclusive `<=`。submission數看submitted_at，settled數看settled_at，rejected／expired各自timestamp；pending-at-cutoff可含上月。只能live當月，沒有archived monthly-report表。legacy缺scope/snapshot/時間應列data-quality排除，不用current master補齊。
- 金額／EXP／Energy／carbon皆integer；current_exp累計，max level持續累計，API nextLevelExp可null但DB存當前threshold。Energy Lv1/2為0，Lv3起120，regeneration120秒ticks，hard cap，overflow_pending保留歷史欄但正常新增為0。
- Growth800g累計，2000g→seed、5seed→plant、5plant→tree；扣款／加款 conversion pair與conversion_id保留。不因名稱「seedling／young tree」新增entity。
- merchant plans sprout/grove/forest的400/500/600設定與正式base Stars reward不同；正式general/star＋Monday／農曆初一十五判定由economy.ts，designated overlap不疊加。保留Node Intl/ICU算日期，不改SQL農曆演算法。
- Stars expenditure沒有正式可用business endpoint／方法；resource_transactions有consume enum不代表已實作商店扣款。不得為27-case requirement發明spend規則。詳見test plan P11。

## Migrations v1–v27：逐版策略

目前多版呼叫同一最新 createSchemaSql；下列是歷史意義／backfill策略，不是重新在PG對v27資料跑舊轉換。未來正式搬遷只接受已驗證v27 snapshot；新PG建final parity schema，原27列schema_migrations作provenance原樣搬移，PG部署歷程獨立技術紀錄，不偽造已跑過27次PG migration。

| Ref／version        | 原 migration name                             | PostgreSQL 對應與必要驗證                                                                                                                                  |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="M01"></a>M01 | initial_core_economy_schema                   | final表／FK／CHECK／indexes基線；空庫建schema不帶demo；注意現在v1呼叫最新builder，並非原v1快照                                                             |
| <a id="M02"></a>M02 | core_economy_integrity_constraints            | legacy table rebuild、mission_type、logical_request_json、resources約束及1200→120修正；PG staging＋validate；引用原legacy fixtures，不重算v27              |
| <a id="M03"></a>M03 | resource_ledger_growth_integrity              | 舊ledger標legacy，conversion_id=''、type=none；不偽造balance等式或conversion歷史；保留exemption                                                            |
| <a id="M04"></a>M04 | level_runtime_integrity                       | energy_logs新增level_up_refill允許值；PG CHECK包含現行enum，舊列不改                                                                                       |
| <a id="M05"></a>M05 | admin_economy_settings_management             | version>=1 default1與updated_by defaultsystem；保留expectedVersion CAS與audit transaction                                                                  |
| <a id="M06"></a>M06 | mvp_task_code_thin_slice                      | task windows/submissions＋partial active unique；pending不生reward                                                                                         |
| <a id="M07"></a>M07 | task_code_submission_decisions                | nullable actor／decision key＋非NULL partial unique；保留confirm/reject衝突                                                                                |
| <a id="M08"></a>M08 | finalized_core_economy_rules                  | 曾重置core規則／level表、energy cap/interval/overflow/flags；PG新庫用final config，v27匯入不再次clamp，不補ledger/chests；legacyfixture獨立比對            |
| <a id="M09"></a>M09 | finalized_star_settlement_snapshot            | category general、timezone Taipei defaults；rule_version/snapshot nullable；不補舊reward snapshot                                                          |
| <a id="M10"></a>M10 | task_code_submission_settlement_links         | settled status、settled_at/redemption/reward links；舊資料NULL保留；confirmed recovery contract                                                            |
| <a id="M11"></a>M11 | player_event_queue                            | durable ordered queue；event key與resolution key唯一、狀態CHECK；高水位allocator，rollback不消耗成功序列                                                   |
| <a id="M12"></a>M12 | merchant_brand_branch_model                   | stable `merchant-brand-${merchantId}`、main branch；原merchant ID不變；create品牌後回填FK、再validate                                                      |
| <a id="M13"></a>M13 | nullable_branch_application_reference         | merchants.application_id可NULL但非NULL unique；保留application↔merchant循環關係                                                                            |
| <a id="M14"></a>M14 | canonical_account_identities                  | 既有users.id→accounts.id並users.account_id一對一；有舊membership資料時source會拒絕，不能猜人員對應或丟列                                                   |
| <a id="M15"></a>M15 | merchant_membership_scope_exclusivity         | partial unique去掉role；brand/branch不得重疊；重複/overlap資料source拒絕，PG同樣preflight停止；跨row trigger加writer lock防race                            |
| <a id="M16"></a>M16 | merchant_invitation_sessions                  | hash-only invitations/sessions、uniquehash/key、expiry/revoke；保留purpose隔離與token不落明文                                                              |
| <a id="M17"></a>M17 | canonical_reporting_timestamps                | nullable expired_at＋三個report partial indexes；不回填legacy clocks；保留独立confirmed/settled時間                                                        |
| <a id="M18"></a>M18 | task_code_reporting_scope_snapshots           | submission 1:1 snapshot＋immutable兩trigger；新submission原子capture；舊submission不backfill、replay也不補                                                 |
| <a id="M19"></a>M19 | platform_operator_rbac                        | accounts一對一platformmembership、finite角色與status、索引；不改permission matrix                                                                          |
| <a id="M20"></a>M20 | platform_operator_invitation_support          | purpose default merchant_operator；legacy保持merchant語意；不能把LINE玩家塞入invitation流                                                                  |
| <a id="M21"></a>M21 | platform_operator_status_transitions          | status change evidence immutable＋idempotency＋session revokedcount；preserve last-super-admin安全與rollback                                               |
| <a id="M22"></a>M22 | platform_operator_role_transitions            | role transition immutable、invitation FK必填、platform sessions撤銷與新角色重新登入；完整transaction                                                       |
| <a id="M23"></a>M23 | player_identity_and_session                   | external(provider,subject)唯一；session purpose與invitation-null CHECK；legacysession由invitation JOIN推purpose，需preflight orphan，不可innerjoin靜默掉列 |
| <a id="M24"></a>M24 | knowledge_card_reward_persistence             | attempts unique key/user-card-version、immutable pair、reward FK與50/30 CHECK                                                                              |
| <a id="M25"></a>M25 | unified_knowledge_daily_rewards               | source rebuild attempts並保留原欄／trigger；現行daily effectiveVersion由Backend，不重寫舊version、不補reward                                               |
| <a id="M26"></a>M26 | resident_non_merchant_mission_claim_authority | daily instances／claim request composite uniqueness與state CHECK；result replay、claim10Stars原子；無seed mission instances                                |
| <a id="M27"></a>M27 | reduced_motion_durable_persistence            | nullable 0/1 preference與updated_at；NULL=系統fallback，不backfill false；A/B isolation與last successful write wins                                        |

完整原始migration函式及line位於JSON，不只根據migration名稱判斷。upgrade fixture來源見[Parity test plan](W1A_PARITY_TEST_PLAN.md)。

## Seed／bootstrap 分類

| 類別                            | Source／內容                                                                                                                                                        | PG planning                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A Production Configuration Seed | seedDatabase：core economy、3 merchant plans、10 levels、disabled starter-diamond recipe                                                                            | 全新環境explicit config bootstrap；移轉環境以匯入既有設定為準，不能INSERT後覆寫客製version；disabled recipe維持disabled |
| B Required Bootstrap            | schema_migrations technical metadata；明確CLI bootstrapInitialPlatformAdmin建立首位super_admin＋invitation＋audit                                                   | migration metadata與可選one-time admin setup分離；已有admin不得重建。Backend不應每次connection建立account               |
| C Demo／Test Fixture            | seedDatabase的user-demo account/users/resources/growth；API setup fakeLINE、自動cookies、onboardMerchant；qa-unified-runtime-server的qa-*；W0 capturememoryfixtures | production initializer不得建立任何此類居民；既有demo相依列先做完整closure manifest，不能只刪一個user導致FK/帳本缺口     |
| D Migration Backfill            | v2/seed1200→120；v3legacy metadata；v8finalrules；v12brand；v14account；v23sessionpurpose                                                                           | 一次性、版本化、可回放稽核；v27匯入不得再次執行、不得補v17時間或v18scope                                                |

現行 `openDatabase` 每次都 migrate＋seed，seed沒有整體transaction且夾帶 backfill／demo。未來PG需拆 open/connect、versioned migrate、configuration seed、authorized bootstrap、fixture tools；本輪只設計，source未改。

## Parity risks

| 優先 | 風險                                                                                        | 收斂／後續驗收                                                                             |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P0   | 同步SQLite→async PG遺失transaction context／增加interleaving，導致部分reward或重複reward    | 同connection、writerlock、26transaction caller鏈、multi-process barrier、全部failurepoints |
| P0   | 轉型重寫ID／JSON／time，丟歷史reference或snapshot                                           | text first、raw checksum、NULLPK／typeof／NUL preflight；異常停止，無silent repair         |
| P0   | 誤把seedDatabase帶入production，自動造user-demo／重置規則                                   | A–D分離、import以歷史配置為準；explicitfixture只test                                       |
| P0   | Supabase Data API／secret讓client可寫economy或跨商戶                                        | 所有35表Backend-only、private schema、Server credential；見boundary文件                    |
| P1   | 誤稱ledger已DB immutable，或新增trigger阻斷redemption同transaction link update／FK cascades | 4強制表＋一般append-only慣例分開；逐write grants矩陣與mutation probes                      |
| P1   | PG序列rollback、nullable UNIQUE／PK、CHECK NULL、IGNORE、JSON extraction coercion差異       | 技術allocator與typed preflight、原DB probe corpus、adapter SQLSTATE mapping                |
| P1   | 讀取會regen／建daily instance、兩個時鐘、legacy reporting缺evidence                         | read path inventory、固定global+injected clocks、月界／data-quality tests                  |
| P1   | Stars expenditure／monthly archive被誤當成現成domain                                        | 標為source不存在，測現有關閉route及負向行為，不新增規則                                    |
| P2   | C collation／LIKE／NULL order影響搜尋與cursor；index stats影響效能                          | Unicode/escape/tie-case corpus＋後續EXPLAIN，不先優化重設                                  |
| P2   | runtime Node/ICU／Supabase PG版本不同                                                       | W1B固定版本，calendar golden dates與target capability確認；不假設PG18已提供於hosting       |

W1A PASS代表mapping／計畫完整，**不代表PG parity suite已跑過或可切production**。上述是W1B實作／正式cutover驗收風險，尚未建立目標DB。中央需review本文件的保守型別、writer lock與allocator方案；若要改採jsonb/timestamptz/identity屬明確調整，不可當成語法替換。

## 自動產生附錄：完整 table／column／transaction 索引

此附錄以同一JSON inventory產生；逐constraints原SQL請讀JSON，沒有省略任何欄位。

### account_external_identities

Domain：identity；PK：id；FK：1；CHECK：2；indexes：3。

Policy：Mutable/configuration/projection; preserve source writes。

| Column           | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ---------------- | ------ | ------------------------ | ------- | -------------------- |
| id               | TEXT   | 0 / 1                    | —       | text                 |
| account_id       | TEXT   | 1 / 0                    | —       | text                 |
| provider         | TEXT   | 1 / 0                    | —       | text                 |
| provider_subject | TEXT   | 1 / 0                    | —       | text                 |
| created_at       | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| updated_at       | TEXT   | 1 / 0                    | —       | text (timestamp raw) |

FK：account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_account_external_identities_2 (provider, provider_subject)；sqlite_autoindex_account_external_identities_1 (id)。

### account_invitations

Domain：identity；PK：id；FK：1；CHECK：2；indexes：3。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                   | SQLite | NOT NULL flag / PK order | Default             | PG proposal          |
| ------------------------ | ------ | ------------------------ | ------------------- | -------------------- |
| id                       | TEXT   | 0 / 1                    | —                   | text                 |
| account_id               | TEXT   | 1 / 0                    | —                   | text                 |
| purpose                  | TEXT   | 1 / 0                    | 'merchant_operator' | text                 |
| token_hash               | TEXT   | 1 / 0                    | —                   | text                 |
| status                   | TEXT   | 1 / 0                    | —                   | text                 |
| expires_at               | TEXT   | 1 / 0                    | —                   | text (timestamp raw) |
| redeemed_at              | TEXT   | 0 / 0                    | —                   | text (timestamp raw) |
| revoked_at               | TEXT   | 0 / 0                    | —                   | text (timestamp raw) |
| created_by_actor_id      | TEXT   | 1 / 0                    | —                   | text                 |
| creation_idempotency_key | TEXT   | 1 / 0                    | —                   | text                 |
| created_at               | TEXT   | 1 / 0                    | —                   | text (timestamp raw) |
| updated_at               | TEXT   | 1 / 0                    | —                   | text (timestamp raw) |

FK：account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_account_invitations_3 (creation_idempotency_key)；sqlite_autoindex_account_invitations_2 (token_hash)；sqlite_autoindex_account_invitations_1 (id)。

### account_sessions

Domain：identity；PK：id；FK：2；CHECK：2；indexes：3。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                     | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| -------------------------- | ------ | ------------------------ | ------- | -------------------- |
| id                         | TEXT   | 0 / 1                    | —       | text                 |
| account_id                 | TEXT   | 1 / 0                    | —       | text                 |
| purpose                    | TEXT   | 1 / 0                    | —       | text                 |
| token_hash                 | TEXT   | 1 / 0                    | —       | text                 |
| expires_at                 | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| revoked_at                 | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| created_from_invitation_id | TEXT   | 0 / 0                    | —       | text                 |
| last_used_at               | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| created_at                 | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| updated_at                 | TEXT   | 1 / 0                    | —       | text (timestamp raw) |

FK：created_from_invitation_id → account_invitations.id [DELETE NO ACTION; UPDATE NO ACTION]；account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_account_sessions_2 (token_hash)；sqlite_autoindex_account_sessions_1 (id)。

### accounts

Domain：identity；PK：id；FK：0；CHECK：1；indexes：2。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                   | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------------ | ------ | ------------------------ | ------- | -------------------- |
| id                       | TEXT   | 0 / 1                    | —       | text                 |
| display_name             | TEXT   | 1 / 0                    | —       | text                 |
| status                   | TEXT   | 1 / 0                    | —       | text                 |
| created_at               | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| updated_at               | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| creation_idempotency_key | TEXT   | 0 / 0                    | —       | text                 |

FK：無。

Unique（含PK index）：sqlite_autoindex_accounts_2 (creation_idempotency_key)；sqlite_autoindex_accounts_1 (id)。

### audit_events

Domain：governance；PK：id；FK：0；CHECK：1；indexes：1。

Policy：Backend append-only convention; no immutable UPDATE/DELETE trigger in source。

| Column        | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------- | ------ | ------------------------ | ------- | -------------------- |
| id            | TEXT   | 0 / 1                    | —       | text                 |
| actor_role    | TEXT   | 1 / 0                    | —       | text                 |
| actor_id      | TEXT   | 1 / 0                    | —       | text                 |
| action        | TEXT   | 1 / 0                    | —       | text                 |
| entity_type   | TEXT   | 1 / 0                    | —       | text                 |
| entity_id     | TEXT   | 1 / 0                    | —       | text                 |
| created_at    | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| metadata_json | TEXT   | 1 / 0                    | —       | text (JSON raw)      |

FK：無。

Unique（含PK index）：sqlite_autoindex_audit_events_1 (id)。

### diamond_recipe_definitions

Domain：configuration；PK：id；FK：0；CHECK：5；indexes：1。

Policy：Mutable/configuration/projection; preserve source writes。

| Column               | SQLite  | NOT NULL flag / PK order | Default | PG proposal |
| -------------------- | ------- | ------------------------ | ------- | ----------- |
| id                   | TEXT    | 0 / 1                    | —       | text        |
| label                | TEXT    | 1 / 0                    | —       | text        |
| required_plant_count | INTEGER | 1 / 0                    | —       | bigint      |
| required_level       | INTEGER | 1 / 0                    | —       | bigint      |
| required_stars       | INTEGER | 1 / 0                    | —       | bigint      |
| required_energy      | INTEGER | 1 / 0                    | —       | bigint      |
| enabled              | INTEGER | 1 / 0                    | —       | smallint    |

FK：無。

Unique（含PK index）：sqlite_autoindex_diamond_recipe_definitions_1 (id)。

### economy_settings

Domain：configuration；PK：key；FK：0；CHECK：2；indexes：1。

Policy：Mutable/configuration/projection; preserve source writes。

| Column     | SQLite  | NOT NULL flag / PK order | Default  | PG proposal          |
| ---------- | ------- | ------------------------ | -------- | -------------------- |
| key        | TEXT    | 0 / 1                    | —        | text                 |
| value_json | TEXT    | 1 / 0                    | —        | text (JSON raw)      |
| version    | INTEGER | 1 / 0                    | 1        | bigint               |
| updated_at | TEXT    | 1 / 0                    | —        | text (timestamp raw) |
| updated_by | TEXT    | 1 / 0                    | 'system' | text                 |

FK：無。

Unique（含PK index）：sqlite_autoindex_economy_settings_1 (key)。

### energy_logs

Domain：economy；PK：id；FK：1；CHECK：6；indexes：1。

Policy：Backend append-only convention; no immutable UPDATE/DELETE trigger in source。

| Column          | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| --------------- | ------- | ------------------------ | ------- | -------------------- |
| id              | TEXT    | 0 / 1                    | —       | text                 |
| user_id         | TEXT    | 1 / 0                    | —       | text                 |
| event_type      | TEXT    | 1 / 0                    | —       | text                 |
| amount          | INTEGER | 1 / 0                    | —       | bigint               |
| energy_before   | INTEGER | 1 / 0                    | —       | bigint               |
| energy_after    | INTEGER | 1 / 0                    | —       | bigint               |
| overflow_before | INTEGER | 1 / 0                    | —       | bigint               |
| overflow_after  | INTEGER | 1 / 0                    | —       | bigint               |
| source_type     | TEXT    | 1 / 0                    | —       | text                 |
| source_id       | TEXT    | 1 / 0                    | —       | text                 |
| created_at      | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_energy_logs_1 (id)。

### knowledge_card_attempts

Domain：content；PK：id；FK：2；CHECK：3；indexes：5。

Policy：DB-enforced immutable UPDATE/DELETE。

| Column             | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------ | ------- | ------------------------ | ------- | -------------------- |
| id                 | TEXT    | 0 / 1                    | —       | text                 |
| user_id            | TEXT    | 1 / 0                    | —       | text                 |
| card_id            | TEXT    | 1 / 0                    | —       | text                 |
| card_version       | TEXT    | 1 / 0                    | —       | text                 |
| selected_option_id | TEXT    | 1 / 0                    | —       | text                 |
| is_correct         | INTEGER | 1 / 0                    | —       | smallint             |
| reward_exp         | INTEGER | 1 / 0                    | —       | bigint               |
| idempotency_key    | TEXT    | 1 / 0                    | —       | text                 |
| answered_at        | TEXT    | 1 / 0                    | —       | text (timestamp raw) |
| reward_event_id    | TEXT    | 1 / 0                    | —       | text                 |

FK：reward_event_id → reward_events.id [DELETE NO ACTION; UPDATE NO ACTION]；user_id → users.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_knowledge_card_attempts_4 (user_id, card_id, card_version)；sqlite_autoindex_knowledge_card_attempts_3 (reward_event_id)；sqlite_autoindex_knowledge_card_attempts_2 (idempotency_key)；sqlite_autoindex_knowledge_card_attempts_1 (id)。

### level_definitions

Domain：configuration；PK：level；FK：0；CHECK：4；indexes：0。

Policy：Mutable/configuration/projection; preserve source writes。

| Column              | SQLite  | NOT NULL flag / PK order | Default | PG proposal     |
| ------------------- | ------- | ------------------------ | ------- | --------------- |
| level               | INTEGER | 0 / 1                    | —       | bigint          |
| required_total_exp  | INTEGER | 1 / 0                    | —       | bigint          |
| reward_stars        | INTEGER | 1 / 0                    | —       | bigint          |
| max_energy_increase | INTEGER | 1 / 0                    | —       | bigint          |
| unlock_flags_json   | TEXT    | 1 / 0                    | —       | text (JSON raw) |

FK：無。

Unique（含PK index）：INTEGER PRIMARY KEY（rowid alias，無額外PK index）。

### level_up_logs

Domain：economy；PK：id；FK：1；CHECK：5；indexes：1。

Policy：Backend append-only convention; no immutable UPDATE/DELETE trigger in source。

| Column            | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ----------------- | ------- | ------------------------ | ------- | -------------------- |
| id                | TEXT    | 0 / 1                    | —       | text                 |
| user_id           | TEXT    | 1 / 0                    | —       | text                 |
| previous_level    | INTEGER | 1 / 0                    | —       | bigint               |
| new_level         | INTEGER | 1 / 0                    | —       | bigint               |
| reward_stars      | INTEGER | 1 / 0                    | —       | bigint               |
| max_energy_before | INTEGER | 1 / 0                    | —       | bigint               |
| max_energy_after  | INTEGER | 1 / 0                    | —       | bigint               |
| unlock_flags_json | TEXT    | 1 / 0                    | —       | text (JSON raw)      |
| source_type       | TEXT    | 1 / 0                    | —       | text                 |
| source_id         | TEXT    | 1 / 0                    | —       | text                 |
| created_at        | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_level_up_logs_1 (id)。

### merchant_applications

Domain：merchant；PK：id；FK：1；CHECK：1；indexes：2。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                   | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------------ | ------ | ------------------------ | ------- | -------------------- |
| id                       | TEXT   | 0 / 1                    | —       | text                 |
| store_name               | TEXT   | 1 / 0                    | —       | text                 |
| contact_name             | TEXT   | 1 / 0                    | —       | text                 |
| contact_line_id          | TEXT   | 1 / 0                    | —       | text                 |
| phone                    | TEXT   | 1 / 0                    | —       | text                 |
| email                    | TEXT   | 1 / 0                    | —       | text                 |
| address                  | TEXT   | 1 / 0                    | —       | text                 |
| store_category           | TEXT   | 1 / 0                    | —       | text                 |
| other_store_category     | TEXT   | 1 / 0                    | —       | text                 |
| vegetarian_offering_json | TEXT   | 1 / 0                    | —       | text (JSON raw)      |
| other_meal_type          | TEXT   | 1 / 0                    | —       | text                 |
| business_hours_json      | TEXT   | 1 / 0                    | —       | text (JSON raw)      |
| status                   | TEXT   | 1 / 0                    | —       | text                 |
| submitted_at             | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| reviewed_at              | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| review_note              | TEXT   | 0 / 0                    | —       | text                 |
| merchant_id              | TEXT   | 0 / 0                    | —       | text                 |

FK：merchant_id → merchants.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_merchant_applications_2 (merchant_id)；sqlite_autoindex_merchant_applications_1 (id)。

### merchant_brands

Domain：merchant；PK：id；FK：0；CHECK：1；indexes：1。

Policy：Mutable/configuration/projection; preserve source writes。

| Column       | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------ | ------ | ------------------------ | ------- | -------------------- |
| id           | TEXT   | 0 / 1                    | —       | text                 |
| display_name | TEXT   | 1 / 0                    | —       | text                 |
| legal_name   | TEXT   | 0 / 0                    | —       | text                 |
| status       | TEXT   | 1 / 0                    | —       | text                 |
| created_at   | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| updated_at   | TEXT   | 1 / 0                    | —       | text (timestamp raw) |

FK：無。

Unique（含PK index）：sqlite_autoindex_merchant_brands_1 (id)。

### merchant_operator_memberships

Domain：identity；PK：id；FK：3；CHECK：3；indexes：3。

Policy：Mutable/configuration/projection; preserve source writes。

| Column      | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ----------- | ------ | ------------------------ | ------- | -------------------- |
| id          | TEXT   | 0 / 1                    | —       | text                 |
| account_id  | TEXT   | 1 / 0                    | —       | text                 |
| brand_id    | TEXT   | 1 / 0                    | —       | text                 |
| merchant_id | TEXT   | 0 / 0                    | —       | text                 |
| role        | TEXT   | 1 / 0                    | —       | text                 |
| status      | TEXT   | 1 / 0                    | —       | text                 |
| created_at  | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| updated_at  | TEXT   | 1 / 0                    | —       | text (timestamp raw) |

FK：merchant_id → merchants.id [DELETE CASCADE; UPDATE NO ACTION]；brand_id → merchant_brands.id [DELETE CASCADE; UPDATE NO ACTION]；account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：idx_memberships_branch_scope_unique (account_id, brand_id, merchant_id) [partial；predicate見JSON]；idx_memberships_brand_scope_unique (account_id, brand_id) [partial；predicate見JSON]；sqlite_autoindex_merchant_operator_memberships_1 (id)。

### merchant_plan_definitions

Domain：configuration；PK：plan；FK：0；CHECK：2；indexes：1。

Policy：Mutable/configuration/projection; preserve source writes。

| Column             | SQLite  | NOT NULL flag / PK order | Default | PG proposal |
| ------------------ | ------- | ------------------------ | ------- | ----------- |
| plan               | TEXT    | 0 / 1                    | —       | text        |
| label              | TEXT    | 1 / 0                    | —       | text        |
| reward_star_amount | INTEGER | 1 / 0                    | —       | bigint      |

FK：無。

Unique（含PK index）：sqlite_autoindex_merchant_plan_definitions_1 (plan)。

### merchants

Domain：merchant；PK：id；FK：3；CHECK：4；indexes：3。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                   | SQLite  | NOT NULL flag / PK order | Default       | PG proposal          |
| ------------------------ | ------- | ------------------------ | ------------- | -------------------- |
| id                       | TEXT    | 0 / 1                    | —             | text                 |
| application_id           | TEXT    | 0 / 0                    | —             | text                 |
| brand_id                 | TEXT    | 1 / 0                    | —             | text                 |
| branch_code              | TEXT    | 1 / 0                    | 'main'        | text                 |
| store_name               | TEXT    | 1 / 0                    | —             | text                 |
| address                  | TEXT    | 1 / 0                    | —             | text                 |
| store_category           | TEXT    | 1 / 0                    | —             | text                 |
| other_store_category     | TEXT    | 1 / 0                    | —             | text                 |
| vegetarian_offering_json | TEXT    | 1 / 0                    | —             | text (JSON raw)      |
| other_meal_type          | TEXT    | 1 / 0                    | —             | text                 |
| business_hours_json      | TEXT    | 1 / 0                    | —             | text (JSON raw)      |
| status                   | TEXT    | 1 / 0                    | —             | text                 |
| can_redeem               | INTEGER | 1 / 0                    | —             | smallint             |
| merchant_plan            | TEXT    | 1 / 0                    | —             | text                 |
| reward_star_amount       | INTEGER | 1 / 0                    | —             | bigint               |
| reward_category          | TEXT    | 1 / 0                    | 'general'     | text                 |
| timezone                 | TEXT    | 1 / 0                    | 'Asia/Taipei' | text                 |
| created_at               | TEXT    | 1 / 0                    | —             | text (timestamp raw) |

FK：merchant_plan → merchant_plan_definitions.plan [DELETE NO ACTION; UPDATE NO ACTION]；brand_id → merchant_brands.id [DELETE NO ACTION; UPDATE NO ACTION]；application_id → merchant_applications.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：idx_merchants_brand_branch_code (brand_id, branch_code)；sqlite_autoindex_merchants_2 (application_id)；sqlite_autoindex_merchants_1 (id)。

### mission_enrollments

Domain：mission；PK：user_id, mission_id；FK：2；CHECK：1；indexes：1。

Policy：Mutable/configuration/projection; preserve source writes。

| Column       | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------ | ------ | ------------------------ | ------- | -------------------- |
| user_id      | TEXT   | 1 / 1                    | —       | text                 |
| mission_id   | TEXT   | 1 / 2                    | —       | text                 |
| status       | TEXT   | 1 / 0                    | —       | text                 |
| accepted_at  | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| completed_at | TEXT   | 0 / 0                    | —       | text (timestamp raw) |

FK：mission_id → missions.id [DELETE CASCADE; UPDATE NO ACTION]；user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_mission_enrollments_1 (user_id, mission_id)。

### missions

Domain：mission；PK：id；FK：1；CHECK：0；indexes：2。

Policy：Mutable/configuration/projection; preserve source writes。

| Column       | SQLite | NOT NULL flag / PK order | Default           | PG proposal          |
| ------------ | ------ | ------------------------ | ----------------- | -------------------- |
| id           | TEXT   | 0 / 1                    | —                 | text                 |
| merchant_id  | TEXT   | 1 / 0                    | —                 | text                 |
| mission_type | TEXT   | 1 / 0                    | 'vegetarian_meal' | text                 |
| title        | TEXT   | 1 / 0                    | —                 | text                 |
| description  | TEXT   | 1 / 0                    | —                 | text                 |
| created_at   | TEXT   | 1 / 0                    | —                 | text (timestamp raw) |

FK：merchant_id → merchants.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_missions_2 (merchant_id, mission_type)；sqlite_autoindex_missions_1 (id)。

### plant_growth_logs

Domain：growth；PK：id；FK：1；CHECK：4；indexes：1。

Policy：Backend append-only convention; no immutable UPDATE/DELETE trigger in source。

| Column        | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ------------- | ------- | ------------------------ | ------- | -------------------- |
| id            | TEXT    | 0 / 1                    | —       | text                 |
| user_id       | TEXT    | 1 / 0                    | —       | text                 |
| source_type   | TEXT    | 1 / 0                    | —       | text                 |
| source_id     | TEXT    | 1 / 0                    | —       | text                 |
| event_type    | TEXT    | 1 / 0                    | —       | text                 |
| conversion_id | TEXT    | 1 / 0                    | ''      | text                 |
| quantity      | INTEGER | 1 / 0                    | —       | bigint               |
| before_count  | INTEGER | 1 / 0                    | —       | bigint               |
| after_count   | INTEGER | 1 / 0                    | —       | bigint               |
| created_at    | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_plant_growth_logs_1 (id)。

### platform_operator_memberships

Domain：identity；PK：id；FK：2；CHECK：2；indexes：4。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| --------------------- | ------ | ------------------------ | ------- | -------------------- |
| id                    | TEXT   | 0 / 1                    | —       | text                 |
| account_id            | TEXT   | 1 / 0                    | —       | text                 |
| role                  | TEXT   | 1 / 0                    | —       | text                 |
| status                | TEXT   | 1 / 0                    | —       | text                 |
| created_at            | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| updated_at            | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| granted_by_account_id | TEXT   | 0 / 0                    | —       | text                 |

FK：granted_by_account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]；account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_platform_operator_memberships_2 (account_id)；sqlite_autoindex_platform_operator_memberships_1 (id)。

### platform_operator_role_transitions

Domain：governance；PK：id；FK：4；CHECK：5；indexes：2。

Policy：DB-enforced immutable UPDATE/DELETE。

| Column                         | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------------------ | ------- | ------------------------ | ------- | -------------------- |
| id                             | TEXT    | 0 / 1                    | —       | text                 |
| membership_id                  | TEXT    | 1 / 0                    | —       | text                 |
| target_account_id              | TEXT    | 1 / 0                    | —       | text                 |
| actor_account_id               | TEXT    | 1 / 0                    | —       | text                 |
| from_role                      | TEXT    | 1 / 0                    | —       | text                 |
| to_role                        | TEXT    | 1 / 0                    | —       | text                 |
| reason                         | TEXT    | 1 / 0                    | —       | text                 |
| idempotency_key                | TEXT    | 1 / 0                    | —       | text                 |
| revoked_platform_session_count | INTEGER | 1 / 0                    | —       | bigint               |
| invitation_id                  | TEXT    | 1 / 0                    | —       | text                 |
| created_at                     | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：invitation_id → account_invitations.id [DELETE NO ACTION; UPDATE NO ACTION]；actor_account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]；target_account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]；membership_id → platform_operator_memberships.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_platform_operator_role_transitions_2 (idempotency_key)；sqlite_autoindex_platform_operator_role_transitions_1 (id)。

### platform_operator_status_transitions

Domain：governance；PK：id；FK：4；CHECK：5；indexes：2。

Policy：DB-enforced immutable UPDATE/DELETE。

| Column                         | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------------------ | ------- | ------------------------ | ------- | -------------------- |
| id                             | TEXT    | 0 / 1                    | —       | text                 |
| membership_id                  | TEXT    | 1 / 0                    | —       | text                 |
| target_account_id              | TEXT    | 1 / 0                    | —       | text                 |
| actor_account_id               | TEXT    | 1 / 0                    | —       | text                 |
| from_status                    | TEXT    | 1 / 0                    | —       | text                 |
| to_status                      | TEXT    | 1 / 0                    | —       | text                 |
| reason                         | TEXT    | 1 / 0                    | —       | text                 |
| idempotency_key                | TEXT    | 1 / 0                    | —       | text                 |
| revoked_platform_session_count | INTEGER | 1 / 0                    | —       | bigint               |
| invitation_id                  | TEXT    | 0 / 0                    | —       | text                 |
| created_at                     | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：invitation_id → account_invitations.id [DELETE NO ACTION; UPDATE NO ACTION]；actor_account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]；target_account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]；membership_id → platform_operator_memberships.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_platform_operator_status_transitions_2 (idempotency_key)；sqlite_autoindex_platform_operator_status_transitions_1 (id)。

### player_event_queue

Domain：content；PK：queue_order；FK：2；CHECK：4；indexes：4。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                     | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| -------------------------- | ------- | ------------------------ | ------- | -------------------- |
| queue_order                | INTEGER | 0 / 1                    | —       | bigint               |
| id                         | TEXT    | 1 / 0                    | —       | text                 |
| user_id                    | TEXT    | 1 / 0                    | —       | text                 |
| source_reward_event_id     | TEXT    | 1 / 0                    | —       | text                 |
| event_key                  | TEXT    | 1 / 0                    | —       | text                 |
| event_type                 | TEXT    | 1 / 0                    | —       | text                 |
| event_level                | INTEGER | 0 / 0                    | —       | bigint               |
| scene_id                   | TEXT    | 0 / 0                    | —       | text                 |
| event_name                 | TEXT    | 1 / 0                    | —       | text                 |
| payload_json               | TEXT    | 1 / 0                    | —       | text (JSON raw)      |
| status                     | TEXT    | 1 / 0                    | —       | text                 |
| created_at                 | TEXT    | 1 / 0                    | —       | text (timestamp raw) |
| resolved_at                | TEXT    | 0 / 0                    | —       | text (timestamp raw) |
| resolution_idempotency_key | TEXT    | 0 / 0                    | —       | text                 |

FK：source_reward_event_id → reward_events.id [DELETE CASCADE; UPDATE NO ACTION]；user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_player_event_queue_3 (resolution_idempotency_key)；sqlite_autoindex_player_event_queue_2 (event_key)；sqlite_autoindex_player_event_queue_1 (id)。

### redemptions

Domain：economy；PK：id；FK：4；CHECK：4；indexes：3。

Policy：INSERT then reward_event_id UPDATE in one settlement transaction; Backend historical record after commit, no immutable trigger。

| Column          | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| --------------- | ------- | ------------------------ | ------- | -------------------- |
| id              | TEXT    | 0 / 1                    | —       | text                 |
| idempotency_key | TEXT    | 1 / 0                    | —       | text                 |
| user_id         | TEXT    | 1 / 0                    | —       | text                 |
| mission_id      | TEXT    | 1 / 0                    | —       | text                 |
| merchant_id     | TEXT    | 1 / 0                    | —       | text                 |
| stars_granted   | INTEGER | 1 / 0                    | —       | bigint               |
| energy_granted  | INTEGER | 1 / 0                    | —       | bigint               |
| exp_granted     | INTEGER | 1 / 0                    | —       | bigint               |
| carbon_grams    | INTEGER | 1 / 0                    | —       | bigint               |
| reward_event_id | TEXT    | 0 / 0                    | —       | text                 |
| created_at      | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：reward_event_id → reward_events.id [DELETE NO ACTION; UPDATE NO ACTION]；merchant_id → merchants.id [DELETE NO ACTION; UPDATE NO ACTION]；mission_id → missions.id [DELETE NO ACTION; UPDATE NO ACTION]；user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_redemptions_3 (reward_event_id)；sqlite_autoindex_redemptions_2 (idempotency_key)；sqlite_autoindex_redemptions_1 (id)。

### resident_mission_claim_requests

Domain：content；PK：id；FK：3；CHECK：2；indexes：4。

Policy：Mutable/configuration/projection; preserve source writes。

| Column              | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------- | ------ | ------------------------ | ------- | -------------------- |
| id                  | TEXT   | 0 / 1                    | —       | text                 |
| user_id             | TEXT   | 1 / 0                    | —       | text                 |
| mission_instance_id | TEXT   | 1 / 0                    | —       | text                 |
| idempotency_key     | TEXT   | 1 / 0                    | —       | text                 |
| request_fingerprint | TEXT   | 1 / 0                    | —       | text                 |
| status              | TEXT   | 1 / 0                    | —       | text                 |
| reward_event_id     | TEXT   | 0 / 0                    | —       | text                 |
| result_json         | TEXT   | 0 / 0                    | —       | text (JSON raw)      |
| created_at          | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| completed_at        | TEXT   | 0 / 0                    | —       | text (timestamp raw) |

FK：reward_event_id → reward_events.id [DELETE NO ACTION; UPDATE NO ACTION]；mission_instance_id → resident_mission_instances.id [DELETE CASCADE; UPDATE NO ACTION]；user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_resident_mission_claim_requests_3 (user_id, idempotency_key)；sqlite_autoindex_resident_mission_claim_requests_2 (reward_event_id)；sqlite_autoindex_resident_mission_claim_requests_1 (id)。

### resident_mission_instances

Domain：content；PK：id；FK：2；CHECK：8；indexes：4。

Policy：Mutable/configuration/projection; preserve source writes。

| Column           | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ---------------- | ------ | ------------------------ | ------- | -------------------- |
| id               | TEXT   | 0 / 1                    | —       | text                 |
| user_id          | TEXT   | 1 / 0                    | —       | text                 |
| mission_id       | TEXT   | 1 / 0                    | —       | text                 |
| business_date    | TEXT   | 1 / 0                    | —       | text                 |
| state            | TEXT   | 1 / 0                    | —       | text                 |
| completion_state | TEXT   | 1 / 0                    | —       | text                 |
| completion_truth | TEXT   | 1 / 0                    | —       | text                 |
| completed_at     | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| claim_state      | TEXT   | 1 / 0                    | —       | text                 |
| claimed_at       | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| reward_event_id  | TEXT   | 0 / 0                    | —       | text                 |
| created_at       | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| updated_at       | TEXT   | 1 / 0                    | —       | text (timestamp raw) |

FK：reward_event_id → reward_events.id [DELETE NO ACTION; UPDATE NO ACTION]；user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_resident_mission_instances_3 (user_id, mission_id, business_date)；sqlite_autoindex_resident_mission_instances_2 (reward_event_id)；sqlite_autoindex_resident_mission_instances_1 (id)。

### resource_transactions

Domain：economy；PK：id；FK：1；CHECK：8；indexes：2。

Policy：Backend append-only convention; no immutable UPDATE/DELETE trigger in source。

| Column           | SQLite  | NOT NULL flag / PK order | Default  | PG proposal          |
| ---------------- | ------- | ------------------------ | -------- | -------------------- |
| id               | TEXT    | 0 / 1                    | —        | text                 |
| user_id          | TEXT    | 1 / 0                    | —        | text                 |
| resource_type    | TEXT    | 1 / 0                    | —        | text                 |
| amount           | INTEGER | 1 / 0                    | —        | bigint               |
| balance_before   | INTEGER | 1 / 0                    | —        | bigint               |
| balance_after    | INTEGER | 1 / 0                    | —        | bigint               |
| transaction_kind | TEXT    | 1 / 0                    | 'legacy' | text                 |
| conversion_id    | TEXT    | 1 / 0                    | ''       | text                 |
| conversion_type  | TEXT    | 1 / 0                    | 'none'   | text                 |
| source_type      | TEXT    | 1 / 0                    | —        | text                 |
| source_id        | TEXT    | 1 / 0                    | —        | text                 |
| idempotency_key  | TEXT    | 1 / 0                    | —        | text                 |
| created_at       | TEXT    | 1 / 0                    | —        | text (timestamp raw) |
| metadata_json    | TEXT    | 1 / 0                    | —        | text (JSON raw)      |

FK：user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_resource_transactions_2 (user_id, resource_type, source_type, source_id, transaction_kind, conversion_id, conversion_type)；sqlite_autoindex_resource_transactions_1 (id)。

### reward_events

Domain：economy；PK：id；FK：3；CHECK：1；indexes：3。

Policy：Backend append-only convention; no immutable UPDATE/DELETE trigger in source。

| Column               | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| -------------------- | ------ | ------------------------ | ------- | -------------------- |
| id                   | TEXT   | 0 / 1                    | —       | text                 |
| source_type          | TEXT   | 1 / 0                    | —       | text                 |
| source_id            | TEXT   | 1 / 0                    | —       | text                 |
| user_id              | TEXT   | 1 / 0                    | —       | text                 |
| merchant_id          | TEXT   | 0 / 0                    | —       | text                 |
| mission_id           | TEXT   | 0 / 0                    | —       | text                 |
| idempotency_key      | TEXT   | 1 / 0                    | —       | text                 |
| logical_request_json | TEXT   | 1 / 0                    | —       | text (JSON raw)      |
| reward_payload_json  | TEXT   | 1 / 0                    | —       | text (JSON raw)      |
| growth_summary_json  | TEXT   | 1 / 0                    | —       | text (JSON raw)      |
| level_summary_json   | TEXT   | 1 / 0                    | —       | text (JSON raw)      |
| rule_version         | TEXT   | 0 / 0                    | —       | text                 |
| rule_snapshot_json   | TEXT   | 0 / 0                    | —       | text (JSON raw)      |
| created_at           | TEXT   | 1 / 0                    | —       | text (timestamp raw) |

FK：mission_id → missions.id [DELETE NO ACTION; UPDATE NO ACTION]；merchant_id → merchants.id [DELETE NO ACTION; UPDATE NO ACTION]；user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_reward_events_3 (source_type, source_id, user_id)；sqlite_autoindex_reward_events_2 (idempotency_key)；sqlite_autoindex_reward_events_1 (id)。

### schema_migrations

Domain：configuration；PK：version；FK：0；CHECK：0；indexes：0。

Policy：Mutable/configuration/projection; preserve source writes。

| Column     | SQLite  | NOT NULL flag / PK order | Default  | PG proposal          |
| ---------- | ------- | ------------------------ | -------- | -------------------- |
| version    | INTEGER | 0 / 1                    | —        | bigint               |
| name       | TEXT    | 1 / 0                    | 'legacy' | text                 |
| applied_at | TEXT    | 1 / 0                    | —        | text (timestamp raw) |

FK：無。

Unique（含PK index）：INTEGER PRIMARY KEY（rowid alias，無額外PK index）。

### task_code_submission_scope_snapshots

Domain：governance；PK：submission_id；FK：1；CHECK：4；indexes：3。

Policy：DB-enforced immutable UPDATE/DELETE。

| Column              | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------- | ------ | ------------------------ | ------- | -------------------- |
| submission_id       | TEXT   | 0 / 1                    | —       | text                 |
| snapshot_version    | TEXT   | 1 / 0                    | —       | text                 |
| captured_at         | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| reporting_timezone  | TEXT   | 1 / 0                    | —       | text                 |
| brand_id            | TEXT   | 1 / 0                    | —       | text                 |
| brand_display_name  | TEXT   | 1 / 0                    | —       | text                 |
| merchant_id         | TEXT   | 1 / 0                    | —       | text                 |
| branch_code         | TEXT   | 1 / 0                    | —       | text                 |
| branch_display_name | TEXT   | 1 / 0                    | —       | text                 |

FK：submission_id → task_code_submissions.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_task_code_submission_scope_snapshots_1 (submission_id)。

### task_code_submissions

Domain：mission；PK：id；FK：6；CHECK：1；indexes：9。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                   | SQLite | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------------ | ------ | ------------------------ | ------- | -------------------- |
| id                       | TEXT   | 0 / 1                    | —       | text                 |
| task_code_window_id      | TEXT   | 1 / 0                    | —       | text                 |
| merchant_id              | TEXT   | 1 / 0                    | —       | text                 |
| mission_id               | TEXT   | 1 / 0                    | —       | text                 |
| user_id                  | TEXT   | 1 / 0                    | —       | text                 |
| status                   | TEXT   | 1 / 0                    | —       | text                 |
| submitted_at             | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| confirmation_expires_at  | TEXT   | 1 / 0                    | —       | text (timestamp raw) |
| confirmed_at             | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| rejected_at              | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| expired_at               | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| settled_at               | TEXT   | 0 / 0                    | —       | text (timestamp raw) |
| idempotency_key          | TEXT   | 1 / 0                    | —       | text                 |
| decided_by               | TEXT   | 0 / 0                    | —       | text                 |
| decision_idempotency_key | TEXT   | 0 / 0                    | —       | text                 |
| redemption_id            | TEXT   | 0 / 0                    | —       | text                 |
| reward_event_id          | TEXT   | 0 / 0                    | —       | text                 |

FK：reward_event_id → reward_events.id [DELETE NO ACTION; UPDATE NO ACTION]；redemption_id → redemptions.id [DELETE NO ACTION; UPDATE NO ACTION]；user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]；mission_id → missions.id [DELETE CASCADE; UPDATE NO ACTION]；merchant_id → merchants.id [DELETE CASCADE; UPDATE NO ACTION]；task_code_window_id → task_code_windows.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：idx_task_code_submissions_decision_idempotency_key (decision_idempotency_key) [partial；predicate見JSON]；sqlite_autoindex_task_code_submissions_5 (reward_event_id)；sqlite_autoindex_task_code_submissions_4 (redemption_id)；sqlite_autoindex_task_code_submissions_3 (decision_idempotency_key)；sqlite_autoindex_task_code_submissions_2 (idempotency_key)；sqlite_autoindex_task_code_submissions_1 (id)。

### task_code_windows

Domain：mission；PK：id；FK：1；CHECK：3；indexes：2。

Policy：Mutable/configuration/projection; preserve source writes。

| Column      | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ----------- | ------- | ------------------------ | ------- | -------------------- |
| id          | TEXT    | 0 / 1                    | —       | text                 |
| merchant_id | TEXT    | 1 / 0                    | —       | text                 |
| code_hash   | TEXT    | 1 / 0                    | —       | text                 |
| code_length | INTEGER | 1 / 0                    | —       | bigint               |
| valid_from  | TEXT    | 1 / 0                    | —       | text (timestamp raw) |
| valid_until | TEXT    | 1 / 0                    | —       | text (timestamp raw) |
| status      | TEXT    | 1 / 0                    | —       | text                 |
| created_at  | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：merchant_id → merchants.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：idx_task_code_windows_one_active_per_merchant (merchant_id) [partial；predicate見JSON]；sqlite_autoindex_task_code_windows_1 (id)。

### user_growth_balances

Domain：growth；PK：user_id；FK：1；CHECK：6；indexes：1。

Policy：Mutable/configuration/projection; preserve source writes。

| Column               | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| -------------------- | ------- | ------------------------ | ------- | -------------------- |
| user_id              | TEXT    | 0 / 1                    | —       | text                 |
| carbon_total_grams   | INTEGER | 1 / 0                    | —       | bigint               |
| carbon_balance_grams | INTEGER | 1 / 0                    | —       | bigint               |
| seed_count           | INTEGER | 1 / 0                    | —       | bigint               |
| plant_count          | INTEGER | 1 / 0                    | —       | bigint               |
| tree_count           | INTEGER | 1 / 0                    | —       | bigint               |
| version              | INTEGER | 1 / 0                    | —       | bigint               |
| updated_at           | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_user_growth_balances_1 (user_id)。

### user_resources

Domain：player；PK：user_id；FK：1；CHECK：9；indexes：1。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                        | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ----------------------------- | ------- | ------------------------ | ------- | -------------------- |
| user_id                       | TEXT    | 0 / 1                    | —       | text                 |
| star_balance                  | INTEGER | 1 / 0                    | —       | bigint               |
| current_energy                | INTEGER | 1 / 0                    | —       | bigint               |
| max_energy                    | INTEGER | 1 / 0                    | —       | bigint               |
| energy_regen_interval_seconds | INTEGER | 1 / 0                    | —       | bigint               |
| energy_last_updated_at        | TEXT    | 1 / 0                    | —       | text (timestamp raw) |
| energy_overflow_pending       | INTEGER | 1 / 0                    | —       | bigint               |
| current_exp                   | INTEGER | 1 / 0                    | —       | bigint               |
| current_level                 | INTEGER | 1 / 0                    | —       | bigint               |
| next_level_exp                | INTEGER | 1 / 0                    | —       | bigint               |
| unlock_flags_json             | TEXT    | 1 / 0                    | —       | text (JSON raw)      |
| updated_at                    | TEXT    | 1 / 0                    | —       | text (timestamp raw) |

FK：user_id → users.id [DELETE CASCADE; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_user_resources_1 (user_id)。

### users

Domain：identity；PK：id；FK：1；CHECK：1；indexes：2。

Policy：Mutable/configuration/projection; preserve source writes。

| Column                    | SQLite  | NOT NULL flag / PK order | Default | PG proposal          |
| ------------------------- | ------- | ------------------------ | ------- | -------------------- |
| id                        | TEXT    | 0 / 1                    | —       | text                 |
| account_id                | TEXT    | 1 / 0                    | —       | text                 |
| display_name              | TEXT    | 1 / 0                    | —       | text                 |
| created_at                | TEXT    | 1 / 0                    | —       | text (timestamp raw) |
| reduced_motion            | INTEGER | 0 / 0                    | —       | smallint             |
| reduced_motion_updated_at | TEXT    | 0 / 0                    | —       | text (timestamp raw) |

FK：account_id → accounts.id [DELETE NO ACTION; UPDATE NO ACTION]。

Unique（含PK index）：sqlite_autoindex_users_2 (account_id)；sqlite_autoindex_users_1 (id)。

### Timestamp欄位清單

- `account_external_identities.created_at`
- `account_external_identities.updated_at`
- `account_invitations.expires_at`
- `account_invitations.redeemed_at`
- `account_invitations.revoked_at`
- `account_invitations.created_at`
- `account_invitations.updated_at`
- `account_sessions.expires_at`
- `account_sessions.revoked_at`
- `account_sessions.last_used_at`
- `account_sessions.created_at`
- `account_sessions.updated_at`
- `accounts.created_at`
- `accounts.updated_at`
- `audit_events.created_at`
- `economy_settings.updated_at`
- `energy_logs.created_at`
- `knowledge_card_attempts.answered_at`
- `level_up_logs.created_at`
- `merchant_applications.submitted_at`
- `merchant_applications.reviewed_at`
- `merchant_brands.created_at`
- `merchant_brands.updated_at`
- `merchant_operator_memberships.created_at`
- `merchant_operator_memberships.updated_at`
- `merchants.created_at`
- `mission_enrollments.accepted_at`
- `mission_enrollments.completed_at`
- `missions.created_at`
- `plant_growth_logs.created_at`
- `platform_operator_memberships.created_at`
- `platform_operator_memberships.updated_at`
- `platform_operator_role_transitions.created_at`
- `platform_operator_status_transitions.created_at`
- `player_event_queue.created_at`
- `player_event_queue.resolved_at`
- `redemptions.created_at`
- `resident_mission_claim_requests.created_at`
- `resident_mission_claim_requests.completed_at`
- `resident_mission_instances.completed_at`
- `resident_mission_instances.claimed_at`
- `resident_mission_instances.created_at`
- `resident_mission_instances.updated_at`
- `resource_transactions.created_at`
- `reward_events.created_at`
- `schema_migrations.applied_at`
- `task_code_submission_scope_snapshots.captured_at`
- `task_code_submissions.submitted_at`
- `task_code_submissions.confirmation_expires_at`
- `task_code_submissions.confirmed_at`
- `task_code_submissions.rejected_at`
- `task_code_submissions.expired_at`
- `task_code_submissions.settled_at`
- `task_code_windows.valid_from`
- `task_code_windows.valid_until`
- `task_code_windows.created_at`
- `user_growth_balances.updated_at`
- `user_resources.energy_last_updated_at`
- `user_resources.updated_at`
- `users.created_at`
- `users.reduced_motion_updated_at`

### 全部18個 explicit indexes（7 partial）

```sql
CREATE INDEX idx_account_external_identities_account
  ON account_external_identities(account_id);

CREATE INDEX idx_account_sessions_purpose_expiry_revocation
  ON account_sessions(purpose, expires_at, revoked_at);

CREATE INDEX idx_knowledge_card_attempts_user_answered
  ON knowledge_card_attempts(user_id, answered_at DESC);

CREATE UNIQUE INDEX idx_memberships_branch_scope_unique
  ON merchant_operator_memberships(account_id, brand_id, merchant_id)
  WHERE merchant_id IS NOT NULL;

CREATE UNIQUE INDEX idx_memberships_brand_scope_unique
  ON merchant_operator_memberships(account_id, brand_id)
  WHERE merchant_id IS NULL;

CREATE UNIQUE INDEX idx_merchants_brand_branch_code
  ON merchants(brand_id, branch_code);

CREATE INDEX idx_platform_operator_memberships_role_status
  ON platform_operator_memberships(role, status);

CREATE INDEX idx_platform_operator_memberships_account_status
  ON platform_operator_memberships(account_id, status);

CREATE INDEX idx_player_event_queue_user_pending_order
  ON player_event_queue(user_id, status, queue_order);

CREATE INDEX idx_resident_mission_claim_requests_instance
  ON resident_mission_claim_requests(mission_instance_id, status);

CREATE INDEX idx_resident_mission_instances_user_date
  ON resident_mission_instances(user_id, business_date, mission_id);

CREATE INDEX idx_task_code_scope_snapshots_merchant_submission
  ON task_code_submission_scope_snapshots(merchant_id, submission_id);

CREATE INDEX idx_task_code_scope_snapshots_brand_submission
  ON task_code_submission_scope_snapshots(brand_id, submission_id);

CREATE INDEX idx_task_code_submissions_expired_reporting
  ON task_code_submissions(expired_at DESC, id DESC)
  WHERE status = 'expired';

CREATE INDEX idx_task_code_submissions_merchant_settled_reporting
  ON task_code_submissions(merchant_id, settled_at DESC, id DESC)
  WHERE status = 'settled';

CREATE INDEX idx_task_code_submissions_settled_reporting
  ON task_code_submissions(settled_at DESC, id DESC)
  WHERE status = 'settled';

CREATE UNIQUE INDEX idx_task_code_submissions_decision_idempotency_key ON task_code_submissions(decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX idx_task_code_windows_one_active_per_merchant
  ON task_code_windows(merchant_id)
  WHERE status = 'active';
```

### 全部12 triggers與PG策略

| Source trigger                                            | Table                                | PostgreSQL strategy                                                                    |
| --------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| trg_knowledge_card_attempts_immutable_delete              | knowledge_card_attempts              | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |
| trg_knowledge_card_attempts_immutable_update              | knowledge_card_attempts              | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |
| trg_memberships_branch_brand_insert                       | merchant_operator_memberships        | 檢查NEW merchant所屬brand；保留INSERT／UPDATE OF適用欄，writer lock防race              |
| trg_memberships_branch_brand_update                       | merchant_operator_memberships        | 檢查NEW merchant所屬brand；保留INSERT／UPDATE OF適用欄，writer lock防race              |
| trg_memberships_scope_exclusivity_insert                  | merchant_operator_memberships        | 相同account/brand品牌層與分店層不得共存；UPDATE排除自身；適用原欄位，writer lock防race |
| trg_memberships_scope_exclusivity_update                  | merchant_operator_memberships        | 相同account/brand品牌層與分店層不得共存；UPDATE排除自身；適用原欄位，writer lock防race |
| trg_platform_operator_role_transitions_immutable_delete   | platform_operator_role_transitions   | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |
| trg_platform_operator_role_transitions_immutable_update   | platform_operator_role_transitions   | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |
| trg_platform_operator_status_transitions_immutable_delete | platform_operator_status_transitions | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |
| trg_platform_operator_status_transitions_immutable_update | platform_operator_status_transitions | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |
| trg_task_code_scope_snapshots_immutable_delete            | task_code_submission_scope_snapshots | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |
| trg_task_code_scope_snapshots_immutable_update            | task_code_submission_scope_snapshots | 同BEFORE事件、FOR EACH ROW、raise exception並禁止runtime UPDATE/DELETE；保留source訊息 |

### 全部26個明確transaction與transitive write targets

由AST找出BEGIN IMMEDIATE與this.method呼叫鏈；包含pre/post外層呼叫，**不是每一列寫入都必然發生**，例如replay可提早commit。具體次序仍以source為準。

| Store method / line                     | Direct+reachable writes                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| updateEconomySettings:609               | audit_events, economy_settings                                                                                                                                                                                           |
| createAccount:716                       | accounts, audit_events                                                                                                                                                                                                   |
| createMerchantOperatorMembership:805    | audit_events, merchant_operator_memberships                                                                                                                                                                              |
| bootstrapInitialPlatformAdmin:897       | account_invitations, accounts, audit_events, platform_operator_memberships                                                                                                                                               |
| createPlatformOperator:949              | account_invitations, accounts, audit_events, platform_operator_memberships                                                                                                                                               |
| resendPlatformOperatorInvitation:1037   | account_invitations, audit_events                                                                                                                                                                                        |
| updatePlatformOperatorStatus:1171       | account_invitations, account_sessions, audit_events, platform_operator_memberships, platform_operator_status_transitions                                                                                                 |
| updatePlatformOperatorRole:1327         | account_invitations, account_sessions, audit_events, platform_operator_memberships, platform_operator_role_transitions                                                                                                   |
| createAccountInvitation:1465            | account_invitations, audit_events                                                                                                                                                                                        |
| redeemAccountInvitation:1520            | account_invitations, account_sessions, audit_events                                                                                                                                                                      |
| createPlayerSession:1610                | account_external_identities, account_sessions, accounts, audit_events, energy_logs, resource_transactions, user_growth_balances, user_resources, users                                                                   |
| updatePlayerPresentationPreference:1717 | users                                                                                                                                                                                                                    |
| logoutPlayerSessionToken:1740           | account_sessions, audit_events, energy_logs, resource_transactions, user_resources                                                                                                                                       |
| logoutSessionToken:1850                 | account_sessions, audit_events                                                                                                                                                                                           |
| createPlayerProfile:1882                | accounts, audit_events, energy_logs, resource_transactions, user_growth_balances, user_resources, users                                                                                                                  |
| resolvePlayerEvent:2351                 | player_event_queue                                                                                                                                                                                                       |
| decideTaskCodeSubmission:2391           | audit_events, energy_logs, level_up_logs, mission_enrollments, plant_growth_logs, player_event_queue, redemptions, resource_transactions, reward_events, task_code_submissions, user_growth_balances, user_resources     |
| createTaskCodeSubmissionResult:2529     | task_code_submission_scope_snapshots, task_code_submissions, task_code_windows                                                                                                                                           |
| reviewMerchantApplication:2647          | audit_events, merchant_applications, merchant_brands, merchants, missions                                                                                                                                                |
| createMerchantBranch:2714               | audit_events, merchants                                                                                                                                                                                                  |
| redeem:2809                             | audit_events, energy_logs, level_up_logs, mission_enrollments, plant_growth_logs, player_event_queue, redemptions, resource_transactions, reward_events, user_growth_balances, user_resources                            |
| settleActivityReward:2822               | audit_events, energy_logs, level_up_logs, plant_growth_logs, player_event_queue, resource_transactions, reward_events, user_growth_balances, user_resources                                                              |
| completeCoreTreeMission:2954            | audit_events, resident_mission_instances                                                                                                                                                                                 |
| claimResidentMission:2984               | audit_events, energy_logs, level_up_logs, plant_growth_logs, player_event_queue, resident_mission_claim_requests, resident_mission_instances, resource_transactions, reward_events, user_growth_balances, user_resources |
| answerKnowledgeCard:3126                | audit_events, energy_logs, knowledge_card_attempts, level_up_logs, plant_growth_logs, player_event_queue, resource_transactions, reward_events, user_growth_balances, user_resources                                     |
| updateMerchantPlan:3216                 | audit_events, merchants                                                                                                                                                                                                  |
