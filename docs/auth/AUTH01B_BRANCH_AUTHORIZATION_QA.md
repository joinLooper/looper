# Branch Authorization QA

新 scope resolver 驗證 session purpose/expiry/revoked、active Account、redeemed/non-revoked invitation、固定 provider/channel、仍屬同 Account 的 LINE Identity、active branch_staff Membership、active Brand/Branch、can_redeem=1、scope IDs 全部相等。

| Route | Staff enforcement |
| --- | --- |
| GET /merchant/context | 只回固定 branch_staff membership、品牌及一間分店 |
| GET /merchant/task-code/current | merchantId 必須等於 scope |
| GET /merchant/task-code-submissions | merchantId 必須等於 scope |
| POST /merchant/task-code-submissions/:id/decision | Origin + scope；Store BEGIN 後重驗；原 canonical actor / settlement 規則不變 |
| GET /merchant/task-code-submissions/history | 未指定 merchantId 時強制 scope 分店；指定別店403 |
| GET /merchant/reports/task-code/monthly-live | 同上，原 report read model 不改 |
| GET /auth/session | Staff session 也重驗，撤權不能保留 authenticated 狀態 |
| POST /auth/logout | 原 Origin/purpose/cookie TTL 契約，允許已撤權店員安全登出 |
| GET /merchant/redemptions | 410，永不回傳 records |

正式等價 capability 是既有 branch authorization + branch_staff role + can_redeem，沒有另創 Platform 或 Merchant Permission。混合角色測試在同 Account 另加不同品牌 owner，staff session 仍不得讀該品牌；合法 Google Manager session 仍可讀取。

新 QA 亦驗證 history/report 無 merchantId 不洩漏其他分店、body actor 不被採用、每個失效條件無資料寫入、缺 companion 不可降級成 generic session。Account Conflict、transaction rollback、獨立連線並發由 test:auth01b 同時覆蓋。
