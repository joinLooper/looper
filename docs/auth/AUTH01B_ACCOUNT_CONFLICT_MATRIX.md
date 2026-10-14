# Account Conflict Matrix

| Case | Result |
| --- | --- |
| Player-first LINE identity + 同 Account 新 staff invitation | 允許；Player 與 Merchant purposes/cookies 分離 |
| Staff-first LINE identity + 缺 player profile | Staff 不初始化；正式 Player Login 同 Account 原子建立一次 |
| 同 Subject 已綁不同 Account | ACCOUNT_LINK_CONFLICT，全部 rollback |
| 目標 Account 已綁其他 LINE Subject | ACCOUNT_LINK_CONFLICT，全部 rollback |
| 目標 Account 另有 Google Identity | 保留 Google Identity，LINE binding 不覆寫；原 Google Manager 成功回歸 |
| Account suspended/closed | 不簽發／不接受 Session；D1 不初始化 |
| staff Membership left/suspended 或變成非 staff role | 新請求拒絕，不繼承 owner/manager |
| 多個有效 staff branches | 每 Session 單分店；returning 若不能唯一決定則 STAFF_BRANCH_REQUIRED，需明確選擇 |
| 不同 LINE channel/Provider 無證據 | 本實作不接受另一 channel；不猜姓名／電話／Email |

所有測試都是隔離合成資料，沒有接觸真實 Player/LINE/Google 帳號。兩個 engine 各自驗證，沒有遷移歷史資料。
