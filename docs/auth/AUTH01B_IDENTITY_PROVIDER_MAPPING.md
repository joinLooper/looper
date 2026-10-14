# Identity / Provider Mapping

| Entity | Current authority | Gap for AUTH-01B |
| --- | --- | --- |
| accounts | canonical id + active/suspended/closed | 不用 Email 或顯示名稱猜測同一人 |
| account_external_identities | UNIQUE(provider, provider_subject), FK account_id | baseline line；Google opt-in v28 增加 google。沒有 LINE Provider ID namespace 欄位 |
| users | UNIQUE account_id | 可無 player profile；createPlayerSession 卻假設已有 identity 一定 JOIN 得到 users |
| account_sessions | canonical Account + purpose + expiry/revocation | merchant_operator 無 staff provider/membership/branch 上限 |
| account_invitations | account + merchant_operator/platform_operator purpose | 無 staff 專用 channel／membership／branch 綁定；legacy redemption OFF 可只靠邀請 |
| merchant_operator_memberships | brand_owner/brand_manager/branch_manager/branch_staff + active/suspended/left | getMerchantContext 聚合整個 Account 的有效 Membership |

Current Player chain: POST /auth/player/line/session → LinePlayerIdentityVerifier → createPlayerSession → account identity INNER JOIN users → player session. Channel authority 是 LINE_LOGIN_CHANNEL_ID；NEXT_PUBLIC_LINE_LIFF_ID 是前端 LIFF 設定，不能代替 backend audience。驗證 issuer、audience、expiry、subject；現有 LIFF payload 沒有 redirect flow state/nonce。

官方 LINE 規則：同一 Provider 下各 channel 的 user ID 相同；不同 Provider 的 user ID 不同。不同 channel 本身不代表 Subject 必然不同。來源：[LINE User IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)。本批未存取 LINE Console 或真實身分，沒有證據證明已發生跨 Provider mismatch，也不宣稱部署設定已確認。

最小建議：未來 staff backend 使用既有 LINE_LOGIN_CHANNEL_ID，避免新增未證實 namespace；若要不同 channel，先驗證 Provider 一致性。不得用姓名、Email、電話推測連結。實際 Console mapping 與真人 E2E 保留上線 Gate，不要求現在提供秘密。

Web redirect flow 另需 server-maintained state/nonce、browser binding、固定 callback、code exchange 與 PKCE；不能把 Player endpoint 當 staff challenge shortcut。參考：[LINE Web Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/)。尚未實作或驗收。

Cookies：player 使用 looper_player_session；merchant/platform 共用 looper_session 但由 purpose 分開。診斷已驗證 player/merchant token 互換拒絕，merchant 也不能使用 admin/accounts。這些現有防線不能取代 staff branch ceiling。

