# 三端最小流程 API

## 讀取

- `GET /health`：API 健康檢查。
- `GET /missions`：任務清單。
- `GET /users/:userId/state`：使用者星星、能量與任務狀態。
- `GET /merchant/redemptions`：店家核銷紀錄。
- `GET /admin/overview`：平台三端總覽。

## 寫入

### 接取任務

`POST /missions/:missionId/accept`

```json
{ "userId": "user-demo" }
```

任務進入 `awaiting_verification`。

### 店家核銷

`POST /redemptions`

```json
{
  "userId": "user-demo",
  "missionId": "mission-vegetarian-meal",
  "merchantId": "merchant-demo"
}
```

成功後任務改為 `completed`，並一次更新星星、能量與核銷紀錄。

## 現階段限制

資料暫存於 API 記憶體，服務重啟後重置。此設計只用於驗證三端流程與資料契約，正式資料庫與帳本規則另行建立。
