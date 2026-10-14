# AUTH-01B Preflight Stop Report

**AUTH-01B PARTIAL — CENTRAL DECISION REQUIRED**

Source: codex/auth-01a1-platform-admin-guards @ 6d8ab1d9da392d9619f338992a842cc9398f69b4. Work branch: codex/auth-01b-line-branch-staff. Upstream PR #51 remains Draft / Unmerged.

本批在 Identity / Invitation Preflight 依使用者停止條件停下。未建立 LINE Staff 登入服務、migration、feature flag 或 UI；功能沒有啟用。這不是完整 AUTH-01B 實作，也不是上線驗收。沒有要求真人 LINE 憑證。

## 已重現的邊界

| Finding | SQLite | Synchronous PostgreSQL 17 | 意義 |
| --- | --- | --- | --- |
| Staff-first：Account + LINE Identity，沒有 users profile，之後 Player 登入 | HTTP 500 unique constraint | HTTP 409 constraint | 現有 player lookup INNER JOIN users 漏掉該 identity；不能安全沿用原流程 |
| Player-first：同 Account Player + Merchant Session | 200 / 200 | 200 / 200 | 資料表並非完全不能共存；問題是反向首次建檔與 scope 契約 |
| 把 Player token 放 Merchant cookie／反向 | 403 / 401 | 403 / 401 | 已有 purpose 隔離可沿用 |
| 純 staff account 讀其他分店 | 403 | 403 | 既有 branch membership 基本檢查有效 |
| 同 merchant cookie，帳號後來有其他品牌 owner membership | 其他品牌 200 | 其他品牌 200 | 既有 account aggregate 授權合理，但不能當作新 staff-only session 的權限上限 |
| 原 staff membership 離職，另有 owner membership | context 與 owner 分店仍 200；原 staff 分店 403 | 相同 | 新 staff session 需要可辨識來源及逐次重驗，不能直接沿用 generic cookie authority |
| GET /merchant/redemptions，只有 x-looper-role: merchant、沒有 session | 200，等於全域 getter | 相同 | 既有未限定分店的讀取入口，需中央裁決安全收斂方式 |

共 12 個診斷案例（每 engine 6 個）。這些是來源缺口的可重現證據，**不是 12 個新功能驗收 PASS**。Staff-first 失敗前後所有 inventory tables 完全一致；未產生第二帳號或部分資源。Subject 唯一鍵衝突保留原 Account，沒有跨帳號合併。

## 停止原因與必要裁決

1. 是否授權最小修改 createPlayerSession：先找既有 verified LINE identity／canonical Account，再於明確 Player 登入時建立缺少的 player profile。Staff 登入不得建立任何玩家資源；公式及既有 Google identity 不變。
2. 是否授權 staff 專用 invitation/session scope metadata，綁定 branch_staff membership／branch，並逐次檢查。既有 account-level merchant purpose 不足以區分 staff 與 manager Session；不能自行採用禁止混合角色帳號等新產品政策。
3. 是否將既有 GET /merchant/redemptions 納入安全修正：停用 legacy 全域讀取，或改為 Session + branch-filtered read。這涉及現有 HTTP 回傳契約，未自行改動。

詳見 AUTH01B_CENTRAL_DECISIONS.md。沒有發現必須合併帳號才能解決的證據；建議方案明確不合併帳號。

## 完成與未完成

完成：Source/remote 檢查、資料表與呼叫鏈盤點、LINE 官方 Provider 規則查證、SQLite/PG 隔離重現、既有 session purpose／unique constraint 驗證、診斷 fixture 清理。

未完成：Staff OAuth、state/nonce/CSRF、原子 binding/redemption、staff-only session、邀請 replay/concurrency、失敗注入、手機 9:16/9:19.5/desktop UI 預覽與真人 E2E。不得用既有 Google 或 Player 測試替代。

Baseline 保留目標：488；Foundation 15；MVP load 48 scenarios；Missions 4；Player State 13；Energy 2；Legacy Atomicity 14；AUTH01A 34；AUTH01A1 Security 33；Web UI 24。實際本次 CI 狀態、commit SHA、run URL 及 raw logs 隨交付包 AUTH01B_HOSTED_CI.json / AUTH01B_FULL_REGRESSION.json 提供；本文件不預告結果。Backend CI 的 path filter 不會因只修改 scripts/docs 而觸發，若未觸發明列 NOT_TRIGGERED，不借用上游結果宣稱本批 PASS。

首次診斷器把 PG constraint 預期為 HTTP 500，實際為 409；查明 postgres-worker.mjs 將 SQLSTATE constraint 映射 ERR_SQLITE_CONSTRAINT 後修正診斷器為 engine-specific assertion。保留首次失敗 log/JSON，沒有修改產品斷言。

所有產品程式、DB schema、Google Auth、Platform Permission、Gameplay/Economy、Forest/Treehouse 均未修改。原 C 槽工作區保留；D 槽隔離 clone 正常分支/push，沒有 force、rebase、merge 或損壞 refs 操作。交付後等待中央裁決，不進下一批。
