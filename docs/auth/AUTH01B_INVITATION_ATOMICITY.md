# Invitation Binding Atomicity / Outcome Reconciliation

交易擁有者：MerchantStaffAuth 的 issueInvitation/challenge/login 都是 API 服務的根交易，不能當作任意 outer transaction 的 nested helper。BEGIN IMMEDIATE 在 SQLite 先取得 writer reservation；同步 PG 使用既有 writer advisory lock，同一 worker connection 完成全部 SQL。LINE provider HTTP 呼叫不持有資料庫交易。

登入順序：讀取並重驗 challenge → invite/account/membership/brand/branch → verified identity conflict → 必要 LINE identity bind → invitation redeemed → account_session → scoped companion → consume challenge 並清除 PKCE secret → audit → final scope check → COMMIT。

COMMIT 前任何錯誤 ROLLBACK。測試在 identity、invitation、session、companion、challenge、audit 寫入後注入失敗，inventory+companion全表 snapshot 相等，且可再開始交易。Issue invitation audit 失敗亦全部回滾。

COMMIT 發送後若未取得確認：503 STAFF_COMMIT_OUTCOME_UNKNOWN，operationId = SHA256(state)。連線停用，客戶端不重送原 code/challenge。不聲稱一定 rollback。

受權維運查回（只在原 authoritative DB，禁止 client 自行查 SQL）：

1. 以 operationId 查 merchant_staff_challenges.state_hash；讀 consumed_at/session_id。
2. 以 session_id 交叉核對 account_sessions、merchant_staff_sessions、invitation 與 identity.line_staff_session_created audit 的 metadata.operationId。
3. 四者完整且 scope有效表示已提交。Token只存hash，不能由DB恢復明文cookie；需要受權確認後另起新的驗證流程或撤銷已完成session，不盲目重播。
4. 若無提交記錄，先確認原連線／交易已終止且權威資料庫健康，再由使用者開始新的 challenge。資料不完整或結果仍不確定則交維運處理，不做自動補造或帳號合併。

測試模擬真正 COMMIT 完成後 reply 遺失，驗證 durable correlation 存在、單一 scoped session、原 challenge 再送403。未把未知結果當成「回滾成功」。
