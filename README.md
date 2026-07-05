# Looper

Looper 正式產品主專案，採用 pnpm workspace 與 Turborepo 管理。

## Apps

- `apps/web`：Looper Forest 使用者世界
- `apps/admin`：平台後台 Admin Center
- `apps/merchant`：店家核銷中心 Merchant Center
- `apps/api`：Backend API

## Packages

- `packages/ui`：共用 UI 元件
- `packages/types`：共用 TypeScript 型別
- `packages/config`：共用設定
- `packages/utils`：共用工具
- `packages/constants`：共用常數

## 快速啟動 MVP（Windows）

在 PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-mvp.ps1
```

啟動前會先執行完整 MVP 流程驗證。通過後會開啟：

- 玩家端：`http://localhost:3000`
- 店家端：`http://localhost:3002`
- 平台後台：`http://localhost:3001`
- API 健康檢查：`http://localhost:4000/health`

## 一般開發指令

```bash
pnpm install
pnpm dev
pnpm test:mvp
pnpm build
pnpm lint
pnpm typecheck
```

## MVP 手動驗收流程

1. 開啟玩家端，接取「完成一餐蔬食」。
2. 玩家端顯示「等待店家確認」。
3. 開啟店家端，按下「確認核銷」。
4. 回到玩家端，按下「看看新的變化」。
5. 確認星星增加 10、能量增加 20、任務顯示完成。
6. 開啟平台後台，確認完成任務、已發星星、已發能量與最近動態同步更新。

目前資料暫存在 API 記憶體，重新啟動 API 後會重置，僅供 MVP 驗證使用。
