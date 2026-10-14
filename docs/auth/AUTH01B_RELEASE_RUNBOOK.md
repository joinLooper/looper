# AUTH-01B Release Preparation — OFF by default

本批僅交付工程驗證，未部署、未修改 Vercel Settings、未建立 Supabase。

1. 使用既有權威 LINE_LOGIN_CHANNEL_ID。若要其他 Channel，先取得 Provider mapping 裁決；不得直接換值後推測同 Subject。
2. 在另行批准的資料庫上先備份及驗證 restore，再明確套用既有 v28 identity migration 與 v29 staff companion migration。本機隔離 SQLite 指令：設定 LOOPER_DATABASE_PATH 後執行 pnpm auth:staff:migrate。此指令不 seed、不開 flag。Sync PG 目前只允許既有隔離 runtime；本批沒有新增 production PG deployment authority。
3. 設定 LINE_LOGIN_CHANNEL_SECRET、既有 Merchant/Admin/Player origins，以及 Console callback：Merchant origin + /staff/line/callback。秘密只由受控環境注入，不寫 repo/ZIP。
4. 新 flag LOOPER_MERCHANT_LINE_STAFF_ENABLED 預設 false。後續真人驗收通過再由受權操作開啟，保持 HTTPS、HttpOnly/SameSite cookie、精確 Origin。
5. 有效 super_admin 用 Platform Session + Admin Origin POST /admin/staff-invitations，body只有 membershipId/idempotencyKey，目標必須既有 active branch_staff。分享回傳 fragment invitationURL。不得改用舊 generic bearer invite 取代。
6. 手機 LINE、非 LINE 瀏覽器、拒絕授權、回到 callback、登出、撤權與重入，均須另行裝置 E2E。驗證 cookie部署是否same-site。既有 generic merchant credentials 不會自動轉換，啟用前需盤點。
7. 緊急停用新 flag 會拒絕新 staff login 與既有 scoped staff request；仍可從既有安全 logout 撤銷 Session。不得刪除 companion provenance 或歷史 audit 來回復服務。

完整工程證據在交付 ZIP：新52測試、36手機/桌機案例、既有回歸、Hosted/Backend URLs、原始logs、PG cleanup與Git Safety。新功能與舊12診斷分開計數。完成中央Review後亦不自動進AUTH-01C。
