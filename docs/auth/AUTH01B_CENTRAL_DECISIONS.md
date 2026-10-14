# D1–D3 Approved Decision Closure

中央批准於原 AUTH-01B 續工；不是新的工作包。Checkpoint 3141671f9128e6912fcbf116d7456a45b1bbf9d0、舊12個診斷及前一版 ZIP 全數保留。

| Decision | Implementation | New evidence |
| --- | --- | --- |
| D1 Staff-first Player onboarding | LEFT JOIN users，先解析既有 canonical Account；明確 Player Login 才執行原初始化區塊 | SQLite/PG 初始化 parity、兩獨立連線首次登入、重送與逐寫入 rollback |
| D2 Staff-scoped session | v29 companion metadata + 單分店 scope + 每個 Merchant request 重驗；交易內再次檢查 decision | 全路由跨店、混合 owner、revocation、Google/legacy 拒絕、同/不同 challenge 真並發 |
| D3 Global legacy read | /merchant/redemptions 永遠 410；保留正式帳本 | 無 cookie、偽 Header、Staff、Admin 都只得 code/message |

已確認既有 platform.identity.manage 足以由 super_admin 簽發指定 active branch_staff membership 邀請。沒有借用或新增 Platform Permission。POST /admin/staff-invitations 不接受自填 actorId/accountId/permission，後端由 Membership 與 Session 推導。

Google 原成功行為保持；只在新 staff provenance 邊界加拒絕及排除條件，沒有重新設計已通過 Google Auth。

舊診斷腳本 scripts/diagnose-auth01b-preflight.mjs 是 checkpoint 專用重現器；在修正後 HEAD 不再應通過其「缺陷仍存在」斷言。請使用 test:auth01b 驗證新產品，不將舊腳本納入 CI acceptance。
