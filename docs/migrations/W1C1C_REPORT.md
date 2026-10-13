# W1C1-C — Player Session & State Async Vertical Slice

**Local gates PASS; Hosted CI pending — not final acceptance**

2026-10-14（Asia/Taipei）。僅新增 opt-in GET /player/state；SQLite 同步預設保留。中央已核准 Async 原子性修正與唯一共用 Energy 純函式抽離。

## Source / Final HEAD / PR

- Engineering source：aaa9c74dabf8265f21a60dd0d1e15cb5aa96196a。
- Resume source：66b3beffd2ab4de94a056264f9d3c78bbbfbf781。
- Branch：codex/w1c1-c-player-state-async。
- Draft PR：pending creation。不合併 #43／#44／#45 或本次 PR。
- Verified hosted commit：pending。
- Final HEAD 與最後一次 Hosted run：交付 ZIP 的 DELIVERY_VERSION.json 及原始 Hosted CI evidence，避免 commit 自身 SHA 的循環引用。
- a66e990 的 Legacy Failure Evidence 與 66b3bef 的批准前 checkpoint 均保留於 Git 歷史與原 ZIP；本報告取代其「等待原子性批准」狀態。

## Actual Async Chain

buildApp 先核對同步 Store 與 async pool 的 PostgreSQL database/schema/address/port 相同，拒絕隱含 SQLite 或不同 authority。只有 GET /player/state 走新 Repository。原 cookie parser/name 與未授權錯誤契約保持；login/logout 及其他 routes 沒有接入 async。

AsyncDatabase.withTransaction → pinned connection → transaction-scoped advisory writer lock → 等候後重新取得 Session authority → touch → resources/settings → shared calculateEnergyRegeneration → resources/ledger/log/audit → UserProgress snapshot → COMMIT。HTTP disconnect 連至 AbortSignal。注入 pool 由 caller 持有，先關 app 再 drain pool；建議 initial max=2，可設定4，兩種 profile 均測試。

設定與等級驗證沿用既有 Store 公開 getters，但只提供已由交易讀出的 immutable row view；它沒有資料庫連線，任何寫入均拒絕。nextLevelExp、reward default 與 safe integer codec 共用現有 authority。沒有另一套 Energy 公式。

## Legacy / Approved Failure Delta / New Atomicity

舊同步路徑在 Session touch、Energy、Ledger、Log、Audit 間分別提交；10個 before/after failure cases 仍完全相同。其非原子性繼續列為 **PRE-BETA DATA CONSISTENCY BLOCKER**。本批沒有修補歷史資料。

新路徑在六個寫入／snapshot 注入點均回滾整筆交易，包含 Session touch。這是中央核准的 Failure Parity Exception，不能宣稱與舊失敗行為相同。成功公式、timestamp rounding、Stars/EXP/Level/CO₂e/Growth、UserProgress、一般 ledger/audit 語意保持。

COMMIT acknowledgement 遺失回傳503、COMMIT_OUTCOME_UNKNOWN、OUTCOME_UNKNOWN與 operationId；不盲目重送。已測試真實提交後遺失確認，以同一 sourceId 查回完整三種紀錄。Session-only/cap-only unknown 沒有 durable receipt，仍須人工查核，不假裝 exactly-once。詳見 APPROVED_FAILURE_DELTA。

新增測試重現並修復兩個最小 infrastructure defect：未知 COMMIT/ROLLBACK 的 connection 必須丟棄，不能把 idle-in-transaction 放回 pool；Abort 發生於 timeout SET 查詢期間時，在 application SQL 開始前再次檢查 signal。修復前 log 保留，沒有放寬 assertion。

## Validation

| Gate | Local result |
| --- | --- |
| Frozen install / lint / typecheck / build | PASS |
| API / Frontend / PG | 315 / 129 / 44，全 PASS |
| Baseline | 488/488 |
| Async Foundation | 15/15 |
| MVP Load | 48/48 scenarios |
| Async Missions | 4/4 |
| New Player State | 13/13，獨立計數 |
| Pure helper / legacy boundary | 2/2 tests，8 success snapshots + 10 failure cases |
| Browser assembly / Unified Runtime capture | PASS |
| PG runtime cleanup | server stopped；新 fixtures 逐次 drain pool / drop disposable schema |

Player State 成功 parity 包含9種 Energy 情境×3 engines=27筆完整 snapshot／DTO／header 比對，含既有 enrollment/reward/growth資料。Session security 8類×3 engines，加等待 writer lock 時過期，共25筆。Failure evidence 14項，concurrency pool2/4×1/5/10/20共8個profiles，另測同Session重複呼叫、多玩家隔離、pool回收與 event-loop 回應。沒有200 concurrent宣告。

Hosted CI：pending；trigger=pending，result=pending。完整 job/step 與 artifact evidence 見 JSON/ZIP。Cookie flaky assertion 保持；本機本次沒有需要重跑，並不宣稱根治。

## Files Changed / Reasons

- energy-regeneration.ts：唯一共用純計算；store.ts 只替換 inline arithmetic，時鐘與 SQL 順序不動。
- async-player-state.ts：Session/原子 regeneration/DTO snapshot，以及單一 PostgreSQL authority guard。
- app.ts：只接入 opt-in GET /player/state，disconnect cancellation 與 unknown outcome回應。
- async-postgres.ts：上述兩個實測必要的 cancellation/uncertain connection 修復。
- package.json、CI workflow：獨立 Player State與extraction gate，不改488計數。
- scripts/test-w1c1c-player-state.mjs、w1c1c-extraction.spec.mjs、immutable before hash：新增驗收；既有 transaction diagnostic不改。
- 本批報告/JSON：保存實際驗證、核准差異與風險；所有檔案 hash 在 ZIP manifest。

## Remaining Risks / Scope

1. 同步 SQLite 非原子性仍是 PRE-BETA DATA CONSISTENCY BLOCKER；正式玩家路徑必須另行解除或證明不會使用。
2. 這是隔離 opt-in vertical slice，不代表整套 API 已 async。其他同步 PG endpoints 若與 async transaction 同 process混合寫入，仍可能因 caller blocking＋共享 writer lock造成等待；本批未啟用為 production、未宣稱mixed-endpoint部署完成。正式部署前需另行審查。
3. Unknown commit 的 durable request receipt／automatic idempotency reconciliation 尚未新增schema；提供查回設計，不提供盲重試。
4. 200是總註冊帳號規模。13個新測試與少量並發不是全App壓測，也不是200同時在線。
5. 本機C槽曾滿，53100失敗已保存；僅移除可重新下載的PG installer ZIP及未使用pgAdmin附帶GUI，保留server/data/原始碼/交付物，之後完整驗證通過。

未来登入決策僅記錄：玩家LINE、店家管理者Google、店員LINE優先，Role/Scope/Capability授權、禁止Email自動合併。未實作Google/Apple Auth、Supabase、Native App、美術或Gameplay/Economy改版。

停止於中央 Review，不自行進入下一批。
