# Identity / Provider / Scope Matrix

| Authority | Player | LINE Staff | Google Manager |
| --- | --- | --- | --- |
| Canonical account | accounts | 同一 accounts；只使用既有 Account | 原 accounts |
| External key | line + verified subject | 相同 LINE channel authority，line + verified subject | google + verified subject |
| First profile | 明確 Player Login 才建立 | 不建立 users/resources/growth | 原行為不變 |
| Session purpose | player | merchant_operator | merchant_operator |
| Cookie | looper_player_session | looper_session | looper_session |
| Invitation | 不需要 | 專用 companion，固定單一 branch_staff Membership | 排除 staff invitation；其餘原行為 |
| Request scope | 自己玩家資料 | 固定一分店，逐次重驗 | 原品牌／分店 aggregate scope |
| Same person | 可與 Staff cookie 共存 | 不取得 Player 或 Platform 權限 | 同 Cookie 的 Manager/Staff 登入會替換目前 Merchant session cookie，不承諾同瀏覽器兩個 Merchant session 並存 |

同 Subject 同 Account 可共存。若 Subject 已屬另一 Account，或目標 Account 已綁不同 LINE Subject：ACCOUNT_LINK_CONFLICT，無自動合併、無資源轉移。Google Identity 不覆寫。

LINE 官方規則是同 Provider 下 user ID 一致，不同 Provider 不同。本實作不用「不同 channel 也許同一人」推測；只使用既有 LINE_LOGIN_CHANNEL_ID，production 另檢查它與 Player 設定一致。沒有查詢真實 Console／Account，沒有宣稱真實 mapping 已驗收。

來源：[LINE User IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)。[LINE Login API](https://developers.line.biz/en/reference/line-login/) 定義官方 token exchange / verify response；本實作檢查已驗證 response 的 issuer、audience、expiry、iat、subject 與 nonce hash。[LINE PKCE](https://developers.line.biz/en/docs/line-login/integrate-pkce/) 支持 S256 challenge 與 token exchange code_verifier。

v29 表：merchant_staff_invitations、merchant_staff_sessions、merchant_staff_challenges。FK、索引及 app-level relational checks 共同驗證 Account/Membership/Brand/Branch/Identity。default DB migrate 仍 v27；明確 opt-in CLI 才依序 v28/v29。
