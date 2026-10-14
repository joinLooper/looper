# Central decisions required before resume

## D1 — Staff-first account → explicit Player onboarding

事實：一個沒有 users row 的既有 Account 可以合法持有 branch_staff membership。Staff binding 必須能保存 LINE identity 而不發資源。現有 createPlayerSession 用 INNER JOIN 漏掉它，嘗試建立另一帳號後撞 unique constraint（SQLite 500／PG 409）。資料有 rollback，但正常登入不成立。

建議最小授權：以 verified provider+subject 先解析 Account；檢查 active；只在使用者明確執行 Player login 且沒有 profile 時，於同一 transaction 建立 profile/resources/growth，沿用唯一既有初始化規則。並發唯一鍵處理必須查回同 Account，不 blind merge。Staff callback 永不呼叫玩家建檔。已存在 player profile 完全沿用；Google identity 不動。

需新增矩陣：Player-first、Staff-first、同 Account、不同 Account conflict、suspended、並發建檔、rollback；SQLite/PG 一致。這是 Player onboarding 呼叫鏈調整，未擅自施工。

## D2 — Persist staff invitation/session scope

建議新增最小 companion metadata（名稱/schema version 待核准），將 staff invite 與新 staff session 綁定 canonical Account、branch_staff membership ID、branch ID、LINE provider provenance；session purpose 仍 merchant_operator、cookie 契約保持。邀請失效/revoked、Account/membership/brand/branch inactive 時拒絕。不可只在登入當下檢查，之後仍要每個 request 重新判定。

必須由後端決定有效 membership，不能相信 body 的 scope。多分店政策需中央決定「單 session 固定一分店」或「僅允許當次明確核准 membership 集合」；建議先單分店。既有 owner/manager Google sessions 維持原行為，不把整個 Account 權限聚合回 staff session。Staff invitation 亦不得透過 legacy invitation-only redemption 或 Google callback 降級兌換，ON/OFF 均 fail closed。

原子流程需同一 transaction pinned connection／既有 writer lock：revalidate challenge → revalidate invite/account/membership/branch → check subject conflict → optional LINE bind → consume invitation/challenge → scoped merchant session → audit → commit。COMMIT 前全部 rollback；unknown commit outcome 不盲目重試。正式 replay/concurrency/failure tests 尚未實作。

## D3 — Legacy redemption read exposure

GET /merchant/redemptions 目前只看 client x-looper-role=merchant 並回傳全域 store.redemptions；與 authenticated canonical task-code routes 不同。診斷只用 synthetic DB，兩 engine 均 HTTP 200，無 Session。

中央選擇：停用這條 legacy read（可能影響舊消費者），或沿用 canonical Session + explicit authorized branch filter（需新回傳契約測試）。在決策前不得宣稱「店員無法查看其他分店資料」。本次未修任何既有端點。

## 可沿用、不需要新決策

不自動建立 Account/brand/branch；不同 Account 的相同 LINE subject → ACCOUNT_LINK_CONFLICT（待實作），不移轉資源、不覆寫 Google。既有目的隔離與 DB unique constraint 可用。新 flow default OFF；不用真實憑證完成隔離工程測試；不建立 Supabase、不做 Native、不動既有 Draft PR 合併。

