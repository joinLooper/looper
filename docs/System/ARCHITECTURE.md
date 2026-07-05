# Looper 系統骨架與服務邊界

## Monorepo 原則

Looper 以單一 repository 管理多個應用與共用套件。各 app 可獨立啟動、建置與部署，共用型別、UI、常數與工具則集中於 `packages/`。

## 應用邊界

### `apps/web`
使用者端世界入口。負責 Looper Space、任務、星星、能量、成長紀錄與合作店家等使用者體驗。

### `apps/admin`
平台管理中心。負責使用者、店家、任務、核銷、活動、帳本、異常與營運資料管理。

### `apps/merchant`
店家核銷中心。負責店家身份、待核銷任務、核銷紀錄與基本活動資訊。

### `apps/api`
後端 API。集中處理身份驗證、商業規則、資料存取、帳本一致性與跨端資料交換。

## 共用套件邊界

- `@looper/ui`：純展示與互動元件，不放業務規則。
- `@looper/types`：跨端共享資料型別與狀態列舉。
- `@looper/config`：開發、建置與應用設定。
- `@looper/utils`：無狀態、可重用工具函式。
- `@looper/constants`：全域固定常數與命名。

## 依賴方向

```text
apps/* → packages/*
apps/web|admin|merchant → apps/api（透過 HTTP/API）
apps/api → database
packages/* 不得反向依賴 apps/*
```

## 初期資料策略

骨架階段只建立介面與 mock 邊界，不接正式資料庫。原型中的 Supabase 測試資料不直接視為正式資料模型，正式 schema 需在 `database/schemas/` 與 `docs/Database/` 中重新定義。

## 安全原則

- 不提交任何 `.env`、金鑰或正式憑證。
- 前端不得持有可修改正式資料的私密金鑰。
- 星星、能量、核銷與獎勵更新必須由 API 驗證並原子化處理。
- Admin 與 Merchant 權限必須分離。
