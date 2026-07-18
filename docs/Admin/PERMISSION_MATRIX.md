# 後台權限矩陣

## 角色

- User：只能操作自己的任務與查看自己的帳本摘要。
- Merchant Operator：只能建立與查看所屬店家的核銷。
- Merchant Manager：可查看本店核銷並提出撤銷申請。
- Operations Admin：可讀取平台報表與審計、處理異常並提出撤銷申請；不可審核或套用撤銷。
- Finance Admin：可查看完整帳本並執行雙人覆核。
- Super Admin：可管理角色與系統設定，但仍不得刪除帳本或審計紀錄。

## 平台操作人員角色與權限

正式平台角色為：

- `operations_admin`
- `finance_admin`
- `super_admin`

正式權限對應：

| 權限 | operations_admin | finance_admin | super_admin |
| --- | --- | --- | --- |
| `platform.reporting.read` | ✓ | ✓ | ✓ |
| `platform.audit.read` | ✓ | ✓ | ✓ |
| `platform.merchant_application.read` | ✓ |  | ✓ |
| `platform.merchant_application.review` | ✓ |  | ✓ |
| `platform.reversal.request` | ✓ |  | ✓ |
| `platform.reversal.review` |  | ✓ | ✓ |
| `platform.reversal.apply` |  | ✓ | ✓ |
| `platform.identity.manage` |  |  | ✓ |

平台 membership 採單一平台 scope：同一 account 最多只能有一筆 membership 及一個平台角色，不得疊加角色。權限只能由後端依正式角色對應產生，不接受 request 或前端指定。

`platform.merchant_application.read` 只允許查看平台收到的店家申請列表與單筆詳細資料，不包含修改店家資料，也不代表可查看所有店家帳務、方案或營運機密。`platform.merchant_application.review` 只允許執行既有的核准、拒絕與要求補件流程，不包含修改店家方案、價格、經濟設定、店家操作人員、核銷或 settlement，也不得繞過既有申請狀態機。

店家申請 review mutation 仍必須同時通過正式 HttpOnly platform Session、後端 canonical permission、Admin Origin 驗證，且 audit actor 必須來自 canonical account。前端按鈕或區塊顯示只屬操作提示，不能取代後端授權。

正式平台 operator identity 必須來自 canonical account 的有效 HttpOnly session、active account 與 active platform membership。現有 `x-looper-role: admin` 只屬過渡機制，不能作為正式 operator identity、canonical actor 或 maker-checker 依據。

Maker-checker 對所有角色一體適用。`super_admin` 即使具備完整權限，若自己是 requester，仍不得審核或套用自己的案件；較高角色不得繞過雙人覆核。

## 不可妥協規則

1. Merchant 只能操作所屬店家資料。
2. 人工增減星星或能量不得直接修改餘額，必須寫入帳本。
3. 財務性調整採 maker-checker，申請者與覆核者不得為同一人。
4. Super Admin 也不能刪除帳本與審計紀錄。
5. 所有高風險操作必須記錄原因、工單編號與操作者。

## 店家成員角色與作用域

正式店家成員角色分為：

- 品牌級：`brand_owner`、`brand_manager`。
- 分店級：`branch_manager`、`branch_staff`。

店家成員資格採「每個 scope 單一角色」制度：

1. 同一 account 在同一品牌 scope 只能持有 `brand_owner` 或 `brand_manager` 其中一個角色。
2. 同一 account 在同一分店 scope 只能持有 `branch_manager` 或 `branch_staff` 其中一個角色。
3. 同一 account 已持有某品牌的品牌級 membership 時，不得再持有該品牌旗下的分店級 membership。
4. 同一 account 已持有某品牌任一分店級 membership 時，不得再持有該品牌的品牌級 membership。
5. 角色替換、升級、停權、離職與復職必須走正式 lifecycle 流程；create API 不得停用舊角色、恢復非 active membership 或自動選擇較高權限角色。
6. 相同 scope、相同 role 且 status 為 `active` 的建立重送可回傳既有 membership，不得新增第二筆。
7. 同一 account 可以在不同品牌持有不同角色。
8. account 沒有某品牌的品牌級 membership 時，可以在該品牌不同分店各持有一個分店級角色。
