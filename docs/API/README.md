# API
端點、請求回應格式、錯誤碼與版本規則。

## 玩家身分

玩家登入與受保護端點一律使用 canonical Player Session，詳細契約見
[`docs/integration/C1_PLAYER_AUTH.md`](../integration/C1_PLAYER_AUTH.md)。

- `POST /auth/player/line/session`：驗證 LINE ID token，建立 HttpOnly Session。
- `GET /auth/player/session`：取得目前 canonical 玩家 context。
- `DELETE /auth/player/session`：撤銷目前 Session 並清除 cookie。
- `GET /player/state`：讀取目前 Session 玩家狀態。

任務接取、任務碼提交、提交結果及玩家事件端點皆從 Session 取得 `userId`。
舊 `userId` 欄位僅作短期相容檢查，不具授權效果；與 Session 不符時拒絕。
