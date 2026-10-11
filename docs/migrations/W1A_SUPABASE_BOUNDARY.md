# W1A Supabase Exposure / Security Boundary

日期：2026-10-06；source：`425ab07be751824e590587d89434c09e52558412`。目標資料庫是PostgreSQL，Supabase是未來hosting選項。本輪沒有呼叫project/table/Auth/Data API配置工具，沒有建立project、tables或import資料。

## 本輪 boundary 決策

**全部35張authoritative tables均只由Backend存取。** Mobile／Web使用現有Backend API與canonical session；Server執行Stars、EXP、Level、Energy、CO₂e、Growth、settlement、merchant accounting、ledger與audit。沒有任何經濟表的client INSERT/UPDATE/DELETE/RPC授權。

未來初版部署規劃：application tables放在不暴露給Data API的專用schema（例如`looper_private`），schema改名是存取namespace規劃，不改domain/table名稱。Backend用Server-side PostgreSQL連線。未使用Data API時關閉該服務；也明確revoke anon/authenticated對應schema/table/function權限，不能假設「未建立SDK」就不可存取。Supabase將grants與RLS分為不同層；RLS不能代替table/function grants。[Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)

## 全表 exposure 分類

| 類別               | Authoritative tables                                                                                                                   | Server 權責／可否future公開                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Identity           | accounts、users、account_external_identities、account_sessions、account_invitations                                                    | Backend-only；token_hash/provider_subject/contact不可client讀；users即使有displayname亦不可整表暴露                 |
| Authorization      | platform_operator_memberships、merchant_operator_memberships、platform_operator_status_transitions、platform_operator_role_transitions | Backend-only；角色由既有types/serverpermission決定；transition immutable、不可讓client自授role                      |
| Configuration      | schema_migrations、economy_settings、level_definitions、merchant_plan_definitions、diamond_recipe_definitions                          | Backend/migration-owner分權；公開需要的level/plan說明走既有API或未來欄位白名單readprojection，不能暴露可修改設定    |
| Player／Growth     | user_resources、user_growth_balances、plant_growth_logs、energy_logs、level_up_logs                                                    | Backend-only；前端顯示自己餘額透過API；不得直寫或用RLS放行client算reward                                            |
| Merchant           | merchant_applications、merchant_brands、merchants                                                                                      | application含PII及審核狀態；master具accounting/scopeauthority。未來可提供公開店名/地址projection，不能直接整表grant |
| Mission／Task Code | missions、mission_enrollments、task_code_windows、task_code_submissions、task_code_submission_scope_snapshots                          | canonicalBackend submit/confirm/settle；code_hash不曝光；snapshot只讀歷史scope，由Server在submissiontransaction建立 |
| Economy／Audit     | reward_events、resource_transactions、redemptions、audit_events                                                                        | Backend-only；logical_request、snapshot、audit actor不可讓client偽造；role與trigger分層保護                         |
| Content            | knowledge_card_attempts、resident_mission_instances、resident_mission_claim_requests、player_event_queue                               | Backend-only；dailyauthority、claimidempotency與queueack走API；cachedresult含權威餘額不公開整表                     |

上列共35表，須以inventory的集合比對確認無漏表。所有public URLs或mobile bundle不能含connection string、DBpassword、secret／service-role key。

## 未來若引入 Supabase Data API

不是本輪導入。必須獨立review並先完成credential／identity bridge；目前LINE account與users.id均TEXT，**不等於Supabase auth.uid()**。不能直接用 `auth.uid() = user_id` 當現成policy，也不能讓mobile提供account_id作為所有權證明。

可能候選僅是最少欄位read projections：public merchant/missioncatalog、resident-own presentation/balance/readmodels、scope-filtered merchant history。它們目前仍由Backend回傳；計畫不新增或開放view。

若未來暴露：

- 對exposed schema的所有base tables啟用RLS，另給最小grants，預設deny；SELECT須有經Server驗證且不可由使用者改寫的identity→account→user mapping。
- Resident policy綁canonicaluserownership；merchant policy綁activeaccount/membership/brand/branch，以及歷史snapshot scope，不能只`TO authenticated`就允許全表。
- Client仍不允許economy／ledger mutation；必要writes走既有Backend，不能把一筆settlement拆成多個Data API請求。
- View須使用security_invoker或同等受控Server存取；function不受RLS自動保護，要單獨檢查EXECUTE grants。避免public SECURITY DEFINER；若業務确有需要，另review固定search_path、角色與輸入驗證。
- 測A/B資料隔離、跨商戶、已停權／revokedsession、未登入、偽造claims，直接HTTP Data API測試不能只驗前端按鈕。

RLS採ownership與scope條件，不盲套同一policy。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Credentials 與 database roles

secret key／legacy service_role具有高權限，僅存Server secret manager與受控CI migration job，禁止Mobile、Web、NEXT_PUBLIC_*、screenshots/logs/evidence。未來publishable key也不是直接取得authoritative tables的授權。[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

規劃三類PG roles：migration owner（DDL/import/restore、非app日常帳號）；Backend runtime（必要DML、沒有DDL/ownership/BYPASSRLS）；read-only verifier/reporting role（必要tables/projections）。connectionpool使用原子transaction固定client，秘密不上傳repo。

permissions必須對準sourcewrites：redemptions允許同一settlement內回填reward_event_id；session/claim/queue狀態可更新；四個immutable表只INSERT/SELECT且有DBtrigger。一般ledger append-only慣例可限制role UPDATE/DELETE，但不能新增阻斷合法FKcascade/restore的globaltrigger而不review。TRUNCATE、ALTER TRIGGER、ownership等高權限不屬runtime。

## Auth 保留邊界

不導入Supabase Auth。LINE provider_subject→account_external_identities.account_id→users.account_id mapping維持；既有account_sessions purpose、opaque token hash、expiry/revocation、merchant/platform invitations亦保留。Native credential flow與device驗收屬W2，不因資料庫換hosting而改登入domain。

## 文件版本核對與後續hosting前置

已於2026-10-06讀取Supabase changelog摘要與相關官方文件。2026-09-25 PostgreSQL15.19/17.11更新提及ltree、pgcrypto舊cipher、btree_gist及customoperators；此SQLite mapping並未依赖這些PGextensions，也未執行任何project查詢。target實際PG major/minor／extension／pool模式需W1B選定後驗證，不能將官網current PG18文件誤當hosting已採PG18。[Supabase release note](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)

中央review本文件不代表授權建立project或開放Data API。W1A到此，W1B仍待獨立指令。
