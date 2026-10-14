# AUTH-01B — LINE Branch Staff Mobile Web Login

D1 / D2 / D3 APPROVED 後於既有 PR #52 續工。工程實作完成；最終狀態以交付包 AUTH01B_FINAL_RESULTS.json、同 Final HEAD 的 Hosted / Backend CI 原始證據為準。本文件不以舊 Preflight 診斷冒充新功能驗收。

Source checkpoint: 3141671f9128e6912fcbf116d7456a45b1bbf9d0。上游 AUTH01A1: 6d8ab1d9da392d9619f338992a842cc9398f69b4。Branch: codex/auth-01b-line-branch-staff。PR: https://github.com/joinLooper/looper/pull/52，保持 Draft / Unmerged。

## 已完成的產品行為

- D1：createPlayerSession 先依 verified LINE identity 找 canonical Account，再處理缺少的 users。只有明確 Player Login 初始化 profile/resources/growth，單一交易，沿用原初始化區塊；不建立第二帳號、不複製公式。Staff-first、Player-first、重送、兩連線首次登入及 SQLite/PG 成功資料 parity 都有獨立驗證。
- D2：新 Staff Invitation 與 Session companion metadata 固定 Account、branch_staff Membership、Brand、Branch、LINE channel/identity provenance。Session purpose 仍 merchant_operator，Cookie 契約仍 looper_session。單 Session 僅一分店；不聚合其他 Membership。
- 新 staff-invitations API 使用既有 platform.identity.manage + active Platform Session + Admin Origin；不新增平台 Permission。actor 來自 Session。邀請不得用 legacy bearer 或 Google callback 兌換。
- Merchant context/current/pending/decision/history/monthly 全數重驗；缺 merchantId 時強制指定 Session 分店；decision 在交易內再次驗證 scope。撤權、離職、停權、無效品牌／分店、來源不符立即拒絕。
- D3：GET /merchant/redemptions 永遠 410，只有 code/message，不回傳帳本。消費端搜尋只找到既有 API 測試；正式 Merchant UI 已使用 canonical Task Code APIs。原測試保留並改為核對中央批准的 410。
- LINE OAuth code exchange + PKCE、state/nonce、HttpOnly browser binding、精確 Origin、官方 ID token verify endpoint、issuer/audience/expiry/subject 驗證與 replay protection。沿用 Player 的同一 LINE_LOGIN_CHANNEL_ID，不建立另一套 Account Authority。
- apps/merchant 增加 /staff 與固定 callback /staff/line/callback；繁體中文登入、邀請、分店、衝突／逾期／撤權、未知結果與安全登出。原 Portal 保留。

## 交易安全

新 Staff service 明確擁有根交易。SQLite 用 BEGIN IMMEDIATE；Sync PG 由既有 bridge 取得 transaction-scoped writer lock、使用同一 connection。外部 LINE HTTP 驗證在交易外，交易內再次重驗 challenge、invite、Account/Membership/Branch，然後 binding/consume/session/audit 一起提交。COMMIT 前錯誤全部 rollback。

初版根 SAVEPOINT 在真並發 SQLite 下產生 deferred snapshot 寫鎖升級問題；已由新服務的 BEGIN IMMEDIATE 修正，原始失敗 log 保留。Google 根交易機制未改。本批不重構 PG Adapter。

COMMIT reply 遺失回 STAFF_COMMIT_OUTCOME_UNKNOWN + operationId。禁止自動重試；以 challenge state_hash、session_id 及 audit operationId 查回。已測試「實際 commit 成功、回覆遺失」只建立一筆 scoped session，重送拒絕。UI 不提供自動重送按鈕。詳細 runbook 見 AUTH01B_INVITATION_ATOMICITY.md。

## 驗證與計數

新增 AUTH01B 52 tests，另有新 UI 36 cases（12 狀態 × 9:16/9:19.5/Desktop）。舊 12 個 Preflight 診斷凍結保留，未納入新驗收。

既有正式套件分別保留：API315 + Frontend129 + PG44 = Baseline488；Foundation15；MVP Load48 scenarios；Async Missions4；Player State13；Energy Extraction2；Legacy Atomicity14；AUTH01A34；AUTH01A1 Security33；Google Web UI24。

Frozen install、lint、typecheck、build、full regression、runtime browser capture、PG cleanup、Hosted Linux CI、Backend CI 的最終結果與 raw logs 隨完整 ZIP 提供。本批在 CI 新增 test:auth01b 與 qa:auth01b，並獨立上傳 artifacts，不把 52 算進 488。Backend CI 本輪因 API 變更正式觸發。

## 保留邊界及上線風險

- Opt-in 預設 OFF。既有預設 v27 不自動套用 migration；明確先套用既有 opt-in v28，再 v29 companion metadata。這是為避免 SQLite identity table 重建碰到新 FK，並不開啟 Google flag。
- 本批未取得或要求真實 LINE credentials，未做真人 E2E；需另驗 Console channel/Provider、callback allowlist、HTTPS 與 SameSite cookie 部署拓樸。工程通過不代表正式上線。
- 新 scope 僅適用新 staff sessions；沒有擅自轉換／撤銷既有 generic Merchant Sessions。上線前須盤點既有店員 bearer invitations/sessions，確保營運只從新專用入口簽發店員邀請。Google Manager 的既有成功權限保留。
- 原 Google verifier/schema/JWT/binding 規則未改；GoogleAuth 只新增 Staff Invitation 拒絕與 returning lookup 排除 staff provenance，並有既有34及新混合角色回歸。
- 無 Account merge、無玩家歷史帳本修改、無 Economy/Gameplay/Forest/Treehouse 變更，無 Supabase、Native、Vercel Settings 或 Draft PR merge。
- 完成後只等待中央 Review，不進 AUTH-01C。
