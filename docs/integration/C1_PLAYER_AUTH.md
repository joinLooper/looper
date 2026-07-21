# C1 Player Authentication

## Architecture

正式玩家身分鏈為：LIFF 取得 LINE ID token → API 向 LINE 官方 verify endpoint 驗證 →
`account_external_identities` 對應 canonical `accounts` → 唯一 `users` profile →
建立 `account_sessions` 中 purpose 為 `player` 的 Session。玩家專屬 API 只使用
HttpOnly cookie 解析出的 canonical user context。

Merchant 與 Platform Session 沿用相同 `account_sessions` 主檔，但仍由 purpose 隔離；
玩家 Session 不需要 invitation，也不能用於 Merchant 或 Platform endpoint。

## LINE identity verification

`PlayerIdentityVerifier` 是可注入的 provider abstraction。Production 使用
`LinePlayerIdentityVerifier`，以 `POST https://api.line.me/oauth2/v2.1/verify` 驗證 ID token，
並檢查 audience、issuer、expiry 及 verified subject。LIFF 流程不接受前端自填 subject，
不記錄完整 token，外部請求設有 timeout。無效或過期 credential 回 401；provider 暫時
不可用或未配置分別回 503。

LIFF ID token 的 server-side verify 流程沒有由本 API 接收 nonce／state；前端只初始化
指定 LIFF app 並取得 SDK 發出的 ID token。若未來改用 redirect-based LINE Login，必須在
該交換流程加入 server-maintained state／nonce，不能重用目前 payload 作為授權捷徑。

## Account and user mapping

首次驗證成功時，單一 transaction 建立 account、user、初始 resources、growth balance 與
external identity mapping。`UNIQUE(provider, provider_subject)` 保證一個 LINE subject 只對應
一個 canonical account；既有 mapping 會重用同一 account／user。顯示名稱來自已驗證回應，
經 trim、控制字元移除與 120 字元上限處理，不作為唯一鍵。

Suspended 或 closed account 不得建立新 Session，既有 Session 也立即失效。

## Session lifecycle and cookie policy

- Cookie：`looper_player_session`（可由 `PLAYER_SESSION_COOKIE_NAME` 調整）。
- Flags：HttpOnly、SameSite=Lax、Path=/；production 加上 Secure。
- TTL：預設 604800 秒（7 天），允許設定範圍為 5 分鐘至 30 天。
- Storage：API 只保存 opaque token 的 SHA-256 hash，不保存明文 token。
- Validation：purpose、expiry、revocation、account active 與唯一 user profile皆需成立。
- Activity：成功解析 Session 時更新 `last_used_at`。
- Logout：撤銷目前 Session、寫入 audit 並清除 cookie；無 Session 重送仍安全成功。

## API contract changes

| Route | Contract |
|---|---|
| `POST /auth/player/line/session` | 驗證 `idToken`、建立 Session、回傳安全 player context |
| `GET /auth/player/session` | 驗證 cookie 並回傳 canonical context |
| `DELETE /auth/player/session` | 撤銷 Session 並清除 cookie |
| `GET /player/state` | 讀取目前 Session 玩家資源、成長與任務狀態 |
| `POST /missions/:missionId/accept` | 由 Session 決定玩家 |
| `POST /task-code-submissions` | 由 Session 決定玩家，保留原 idempotency |
| `GET /task-code-submissions/:submissionId` | 僅 owner 可讀，跨玩家回 404 |
| `GET /player/events/next` | 僅讀取目前 Session 玩家 queue |
| `POST /player/events/:eventId/resolve` | 僅 owner 可操作，保留原 idempotency |

Legacy `GET /users/:userId/state` 暫時保留，但必須有 Player Session 且 URL id 與 Session
一致；不一致回 404。上述 mutation／query 中暫存的 legacy `userId` 欄位不再具有授權效果，
若值與 Session 不一致則拒絕。Legacy `POST /redemptions` 與
`POST /admin/reward-events` 依 C1 範圍明確不修改。

## Cross-player privacy

Player A 無法讀取 Player B 的 state、submission、resources／growth 或 event。讀取其他玩家
資源時統一回安全的 404，避免洩漏存在性；mutation body 冒用其他 `userId` 回 403。
沒有有效 Session 的 active 玩家端點回 401。

## Migration v23

`player_identity_and_session` 新增 `account_external_identities`，並擴充
`account_sessions` 的 purpose、nullable invitation FK、`last_used_at` 與 expiry／revocation
索引。v22 的 Merchant／Platform Session 會依原 invitation purpose 保留並遷移；v1～v22
不改寫。

## Environment variables

| Variable | Purpose |
|---|---|
| `LOOPER_PLAYER_APP_URL` | exact CORS／Origin allowlist origin；production 必填 |
| `LINE_LOGIN_CHANNEL_ID` | LINE ID token audience；未配置時 login 安全回 503 |
| `NEXT_PUBLIC_LINE_LIFF_ID` | Web LIFF SDK app id |
| `PLAYER_SESSION_COOKIE_NAME` | Player cookie 名稱，預設 `looper_player_session` |
| `PLAYER_SESSION_TTL_SECONDS` | Session TTL，預設 604800 |

本流程不需要 Channel secret，因為使用 LINE 官方 ID token verify endpoint。不得將正式
credential、ID token 或 Session token提交至 repository。

## Local test strategy

Automated tests 透過 `buildApp` dependency injection 提供 mock verifier；mock 不能由 request
header、body 或 production 公開 route 開啟。Runtime／Browser QA 可用相同 DI 啟動 disposable
API process，production build 本身不包含固定 subject 或 `user-demo` fallback。

## Web session gate

Web 首次載入先呼叫 `GET /auth/player/session`。有效後才載入玩家資料；401 時清除 submission、
event queue 與 knowledge-card 的玩家專屬 memory／localStorage，再顯示 LINE gate。所有 Session
request 使用 `credentials: include`，前端不持有 Looper Session token，也不長期保存 LINE token。

## Rollback and revocation

玩家 account／profile／identity／Session 建立與 audit 位於同一 transaction，失敗時完整 rollback。
Logout 是 append-only audit 加 Session revocation，不刪除 canonical account 或歷史 settlement。
停權／關閉 account 會使既有 Session 在下一次 request 失效。

## Production requirements and known blockers

- 實際 LINE Channel ID 與 LIFF ID 必須在部署環境提供；actual LINE credential QA 尚待外部設定。
- 現有架構尚無登入 rate limiter；production edge／API rate-limit policy 是部署前安全 gate。
- Legacy redemption、Admin reward event、player polling expiry、Merchant pending polling、Merchant
  stale-session cleanup、lost-response recovery 與 knowledge-card EXP persistence 不屬於 C1。
