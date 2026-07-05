# 三端最小操作流程

1. 使用者於 `http://localhost:3000` 接取「完成一餐蔬食」。
2. 任務狀態成為 `awaiting_verification`。
3. 店家於 `http://localhost:3002` 點擊確認核銷。
4. API 將任務改為 `completed`，發放 10 星星與 20 能量。
5. 使用者重新同步後看到獎勵。
6. 平台人員於 `http://localhost:3001` 看到待核銷、完成數量與獎勵總額。

本流程使用固定展示帳號 `user-demo` 與 `merchant-demo`，尚未加入登入與權限驗證。
