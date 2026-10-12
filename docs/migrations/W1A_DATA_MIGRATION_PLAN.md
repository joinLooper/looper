# W1A Data Migration / Rollback Plan

日期：2026-10-06。Source：`425ab07be751824e590587d89434c09e52558412`，SQLite v27。**僅設計；以下步驟都未對正式DB執行。** Target是PostgreSQL，未来hosting为Supabase；本批沒有DDL／import／cutover。

## 前置與停止條件

W1B需先實作reviewed parity schema、adapter、test fixtures與comparator；在隔離target全套PASS後才能排正式migration。先確認production真正DB路徑／主機／檔案owner／backup retention／資料大小及維護窗口；W1A没有讀取正式資料，因此不猜row counts、NULLID或demo contamination。

停止條件：source非v27、schema與source lock不符、FK/完整性失敗、duplicateidentity/idempotency、NULLPK、INTEGER異型或不可精準處理、NUL/invalidUTF8、未知trigger/index、歷史規則缺失被誤回填、production資料中demo混入未經審核；任一阻止cutover。原本允許legacyNULL時間／snapshot不是自動修復理由，應保留並在報表data-quality分類。

## 1. Backup

由授權operator使用SQLite一致性backup機制取得完整snapshot；若服務仍開啟，不可只複製主檔而忽略journal/WAL狀態。記錄source路徑、SQLite版本、journal_mode（目前source沒有設定WAL，不可假設）、schema version、source code SHA、backup SHA-256、size與UTC時間。backup加密並限制Server/operator存取；先在隔離SQLite restore並跑integrity_check、foreign_key_check。保留original不覆寫。

## 2. Read-only freeze

維護模式停止API寫入、背景任務、admin/merchant工具與所有會lazywrite的GET（Energy regen、sessiontouch、dailyinstance、expiry）。不能只封POST。等待inflighttransaction清空，關閉既有writerhandles，記錄freeze instant。取得最後一致backup並重新hash。依授權讀取database，不呼叫openDatabase，避免自動migration/seed。

## 3. Export

以read-only SQLite connection對frozen copy開單一read transaction，匯出35表全部欄位＋schema_migrations＋sqlite_sequence高水位及schema DDL。若Node driver讀integer超safe range，採BigInt模式／decimal strings，不能先Number化。每個cell帶type/null標记，文字保留raw UTF-8 bytes，JSON保持原字串，timestamp不轉格式。rows用PK/C byte排序；有NULLPK先停止，不能任意挑排序key重編ID。

Manifest包含code SHA／schema fingerprint／每表count／每欄type histogram／每表canonical SHA-256／每列hash／backup hash。hash encoding採length-prefix或JSON array of typed values（integer標記＋decimalstring、text標記＋字串、NULL單獨tag），不可delimiter拼接產生collision。不要把token_hash、contactPII或raw export放Git/evidence公開附件。

## 4. Import ordering 與循環

以inventory的55FK產生dependency DAG，先找strongly-connected components。主要循環：merchant_applications.merchant_id ↔ merchants.application_id；其他以表層級拓樸處理，不能全靠一份手寫排序。以下是目前freshschema完整35表規劃：

1. schema_migrations、economy_settings、merchant_plan_definitions、level_definitions、diamond_recipe_definitions、accounts、merchant_brands。
2. users、account_external_identities、platform_operator_memberships、account_invitations。
3. merchant_applications＋merchants（cycle）、user_resources、user_growth_balances、account_sessions、platform_operator_status_transitions、platform_operator_role_transitions。
4. merchant_operator_memberships、missions。
5. mission_enrollments、task_code_windows、reward_events、resource_transactions、plant_growth_logs、energy_logs、level_up_logs、audit_events。
6. redemptions、player_event_queue、knowledge_card_attempts、resident_mission_instances。
7. task_code_submissions、resident_mission_claim_requests。
8. task_code_submission_scope_snapshots。

本排序允许同层有无依赖表，仅是装载分组；实际executor检查所有FK列而不按数组盲跑。platform transition所需invitation/account/membership须先存在。Snapshot brand/merchant字段是历史值无FK，不强行接现在master。

## 5. FK-safe import

新目标尚未对应用开放。transactional创建reviewed schema，先建表／PK／UNIQUE／CHECK与必要immutabletriggers，再载入。对循环及跨表FK：推荐migration-owner在新空库先不建立FK，全部copy完成后新增原55FK并VALIDATE；同一封闭transaction或受控staging session，任一失败rollback整批。不得将target暴露给app直到全部FKvalidated。不要`session_replication_role=replica`跳过所有保护，亦不关闭immutabletriggers后做静默修复。

保持源ONDELETECASCADE/NOACTION及正常runtime immediate timing；不要为了import把所有FK永久改DEFERRABLE。temporary import机制属于migration，不改运行期business semantics。存入原account/player/merchant/transaction/reward IDs、keys、timestamps、ruleversion、snapshots、historicalrefs。两边都已有的configuration以source实际记录为准，不再seed覆盖。

sqlite_sequence不是domain表，不创建同名PG业务表。导入queue_order原值与source高水位到技术allocator，next=max(导入max,sourcehighwater)+1，transactional锁定更新，失败应回滚；不能把history高水位降到当前max。其他INTEGERPK由Backend明确给level/version。

## 6. Ledger verification

逐row比较resource_transactions的ID/source/idempotency/kind/conversionid/type/amount/before/after/metadata与rawtimestamps；nonlegacy行满足既有等式，legacy保留exemption。conversion debit/credit按conversion_id成对且类型、资源、比例遵守当时已有evidence；不得以当前economy修旧ledger。

reward_events比对logical request／payload／growth／level／rule snapshot原bytes、source unique；redemptions和submission links全部保留；不可变四表逐hash一致。原audit记录也须保留，不新增假的migration奖励／audit业务event。正常迁移技术日志写独立operator evidence。

## 7. Balances verification

每个player资源／growth一对一exact比较；对source可rebuild的新growthledger使用原`rebuildGrowthBalancesFromLedger`与`reconcileGrowthBalance`逻辑验证，禁止独立再写一套成长算法。source若已不一致必须记录并停止／中央裁决，不能趁迁移修余额。

不假设所有resource都能从ledger零起算：demo/test初值、legacyrows、历史migrationclamp、naturalregen及曾有手动调整可能影响。Stars/EXP/Energy按源projection exact copy＋已定义event invariant验证，能证明的才reconstruct；不能将sum(amount)不等于projection一律改projection。config/version/leveldefinitions逐行exact，merchantplan不改成settlementrule。

## 8. Counts、checksum、reconciliation

35表全count与rowhash multiset一致；FK orphan=0；PK/unique/partial index冲突=0；column-levelNULL counts、typehistograms、min/max timestamp原文字分布核对。所有17JSON原字串hash、所有timestamp原字串hash均一致；report snapshot／version无补值。记录主键集合差集必须空，不能仅比较totalcount。

只有明确批准的demo排除manifest可造成差集；必须列所有父子关系／ledger／audit影响与各表expectedcount，不可仅删除user-demo。首次策略优先完整保留frozen export到受控staging，productioneligible cohort另行review，未知fixture不凭IDprefix猜测删除。

## 9. Rollback

**Cutover前：** target只读验收失败则rollback import或丢弃隔离target，source仍是冻结权威；修复工具后从原backup再演练，不回写source。

**切换后、正式写入前：** 关闭target连接，指回原冻结SQLite，按原程序恢复，确认idempotency/expiry行为与backup一致。

**已有PG新写入后：** 禁止简单指回旧SQLite（会丢已接受交易且可能duplicate reward）。立即freeze所有writers／lazyGET，保存两边snapshot，停止业务恢复；依据PG新增事件及samekeys做受控逆向replay/reconciliation，经过批准才恢复。若没有被演练的reverse path，选择PG forward fix并维持维护模式，不能宣称RPO=0一键rollback。

rollback触发：任意balance/ledger/identity/snapshot discrepancy、重复reward、授权隔离失效、无法界定commit结果或超出既定错误预算。计划默认zero accepted-write loss，实际RTO/窗口由operator在执行包中填入，不在W1A猜数字。

## 10. Cutover

中央批准＋全部parity/restore rehearsal PASS后，记录最终freezehash，验证source无新写，配置Backend-onlyPG连接（server secret），先read-onlysmoke再恢复正式traffic；不要dual-write。保持LINEaccountmapping、sessiontokenhash及签名/验证码secret不变，cookie/identity flow不顺手重构。所有writes只入单一authority。

在正式恢复前，确认target Data API关闭、权限分离、无demo自动seed、immutabletriggers/partialindexes/FK均启用；这些是未来执行验收，不代表本轮做了配置。

## 11. Post-cutover validation

带隔离测试身份执行已批准smoke或合成事务（不可用真实居民发放免费reward），核对canonicallogin/session、knowledge/claimexactonce、task-code settlement、replay/409、expiry、monthlyboundary、merchantisolation；compare ledger/balances/snapshots与预期。监控constraint/locktimeout、重复key、pool释放、异常重试。保存cutover前后evidence并明确最后可无损回退点；冻结SQLite和backup保留到批准的retention期。

## 本轮未执行与后续执行包需要的信息

未定位／读取／导出正式DB，没有创建或连接PG。后续必须确认实际DBowner/路径、目标PG确切版本/region/roles/poolmode、maintenance窗口、backup保留、demo依赖排除manifest、RTO与逆向恢复演练。它们是执行前输入，不影响本批mapping可供review；不得据本文件自行进入W1B。
