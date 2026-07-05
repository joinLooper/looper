# Looper

Looper 正式產品主專案，採用 pnpm workspace 與 Turborepo 管理。

## Apps
- `apps/web`：Looper Web 使用者世界
- `apps/admin`：平台後台 Admin Center
- `apps/merchant`：店家核銷中心 Merchant Center
- `apps/api`：Backend API

## Packages
- `packages/ui`：共用 UI 元件
- `packages/types`：共用 TypeScript 型別
- `packages/config`：共用設定
- `packages/utils`：共用工具
- `packages/constants`：共用常數

## 開發指令
```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

預設連接埠：web 3000、admin 3001、merchant 3002、api 4000。
