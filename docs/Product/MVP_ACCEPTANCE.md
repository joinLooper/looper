# Looper MVP 驗收清單

## 玩家端

- [x] LINE 驗證後建立 canonical account／user 與 HttpOnly Player Session。
- [x] 玩家專屬 API 不再信任 caller-controlled `userId`。
- [ ] 正式 LINE Channel credentials 環境驗收。
- [ ] 可以載入今日任務。
- [ ] 可以接取任務。
- [ ] 接取後顯示等待店家確認。
- [ ] 店家核銷後重新同步，可看到任務完成。
- [ ] 星星增加 10。
- [ ] 能量增加 20。
- [ ] 森林成長狀態跟著能量改變。
- [ ] 手機與桌面皆可正常操作。

## 店家端

- [ ] 可以完成核銷。
- [ ] 未接取任務時不可核銷。
- [ ] 相同請求重送不會重複發獎勵。
- [ ] 可以看到核銷紀錄。

## 平台後台

- [ ] 可以看到總玩家、待確認與完成任務數量。
- [ ] 可以看到已發星星與能量。
- [ ] 可以看到最近動態。
- [ ] 無 Admin 權限不可讀取總覽。

## 系統

- [ ] `pnpm test:mvp` 全部通過。
- [ ] lint 全部通過。
- [ ] typecheck 全部通過。
- [ ] Web、Admin、Merchant、API 均可 build。
- [ ] API `/health` 回傳正常。
- [ ] 無效 payload 不會留下半完成資料。

## MVP 已知限制

- LINE／LIFF 程式契約與安全 Session 已完成；正式 Channel credentials 環境驗收仍待部署設定。
- 開發環境使用 SQLite；正式資料庫、正式金流與雲端測試網址仍待後續 Beta Gate。
- 視覺為第一版可達成水準，後續再進行美術與動畫升級。
