# Looper 骨架驗收清單

## Repository

- [ ] 正式開發位於 `joinLooper/looper`。
- [ ] 三端展示原型與正式主專案分離。
- [ ] `main` 僅接受通過 CI 的變更。

## Workspace

- [ ] `pnpm install` 成功。
- [ ] 根目錄 `pnpm dev` 可啟動全部 app。
- [ ] 根目錄 `pnpm lint` 通過。
- [ ] 根目錄 `pnpm typecheck` 通過。
- [ ] 根目錄 `pnpm build` 通過。

## Apps

- [ ] `apps/web` 可於 3000 啟動。
- [ ] `apps/admin` 可於 3001 啟動。
- [ ] `apps/merchant` 可於 3002 啟動。
- [ ] `apps/api` 可於 4000 啟動。
- [ ] `GET /health` 回傳成功狀態。

## Shared packages

- [ ] 三個前端 app 可引用 `@looper/ui`。
- [ ] 共用型別可由 `@looper/types` 引用。
- [ ] packages 不反向依賴 apps。

## Governance

- [ ] `.env.example` 存在且不含真實機密。
- [ ] `.gitignore` 排除環境檔與建置產物。
- [ ] GitHub Actions 執行 install、lint、typecheck、build。
- [ ] README 說明 app、port 與啟動方式。
- [ ] docs 各分類用途明確。

## 完成條件

以上自動化項目通過，且四個 app 可在本機啟動後，骨架階段才可標記完成。下一階段為三端最小功能模型，之後才進入 Visual MVP。
