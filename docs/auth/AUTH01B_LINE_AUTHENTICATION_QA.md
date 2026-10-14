# LINE / Mobile Web QA

New test command: pnpm test:auth01b。52 tests，與 baseline488、Google34、Admin33 分開。官方 HTTP verifier 使用可注入 fetcher 的單元測試；真正 production 不允許注入 verifier，固定 LINE 官方 endpoints。

覆蓋：verified/invalid identity、issuer/audience/expiry/iat、missing/wrong nonce、provider failure、malformed response、PKCE參數、state/browser/Origin、challenge/邀請 expiry、replay、同 challenge/不同 challenge 真並發、invitation issue audit rollback、binding全部寫入邊界 rollback、commit reply 遺失、Account conflict、staff-first初始化、雙 Session purpose隔離、Google/legacy 邀請繞路阻擋、跨店、撤權、410。

Browser: pnpm qa:auth01b。36 cases = invite/returning/success/expired/revoked/conflict/permission/unknown/disabled/logout/network/cancelled × 360×640、360×780、1280×900。實際 StaffLogin React bundle，mock provider/API，不是靜態提案圖。驗證無水平／垂直 overflow、按鈕至少44px、callback secrets立即從URL移除、callback只送一次、logout、unknown結果無重送按鈕、正確官方導向。PNG與可開啟 preview.html / index.html 隨ZIP交付。

React review：副作用僅在 Effect／使用者操作；callback promise ref 防 StrictMode 重複交換 code；cleanup 不更新卸載元件；登入/登出 disable 按鈕；state/nonce/token 不存 localStorage；branch preference 不作為 authority；status aria-live、label/input、focus-visible；不新增 UI library。

未進行真人 LINE E2E。預覽 file 模式使用合成 callback，瀏覽器 QA 使用攔截後的 LINE 導向，皆未連接真人帳號。
