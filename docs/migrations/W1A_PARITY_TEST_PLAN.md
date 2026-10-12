# W1A Parity Test Plan

日期：2026-10-06。Authority：`425ab07be751824e590587d89434c09e52558412`。本文件定義 W1B 可實作並執行的同事件 differential suite；W1A 只執行原 SQLite tests／inspection，沒有 PG adapter、PG資料庫或 PG PASS 結果。

## 單一測試系統與實際現況

沿用 Node test runner＋tsx、`apps/api/src/*.test.ts` 的315 tests。`app.test.ts` 的 setup／onboardMerchant／completeVegetarianRedemption／task-code operator fixtures、resident-mission.test.ts 與 presentation-preference.test.ts 的setup，是真正 fixture authority；不複製 `economy.ts` 計算成另一套 oracle。

現行 setup 直接建立 InMemoryStore(SQLite) 並多處操作 store.db、DatabaseSync、PRAGMA、MIGRATIONS。**只設 DATABASE_URL 並不能讓這315tests跑PG。** W1B 的最小必要接縫：把fixture建置／raw DB inspection／transaction故障注入抽成相同contract的兩個adapter，shared scenarios只保留一份；store/app同步呼叫的async改造必須逐點review。SQLite-specific migration／raw SQL probes保留SQLite suite，PG用對應DDL/metadata/constraint assertions，兩者不假裝執行同一SQLite SQL。

預定 harness contract（介面設計，尚未實作）：

```ts
interface ParityFixture {
  dispatch(
    event: ExistingApiRequest | ExistingStoreCommand,
  ): Promise<ExistingResult>;
  setClocks(script: ClockScript): Promise<void>;
  setEntropy(script: EntropyScript): Promise<void>;
  failAt(existingFailurePoint: string): Promise<void>;
  inspectRawRows(): Promise<CanonicalRawSnapshot>;
  close(): Promise<void>;
}
```

事件型別只是現有API request／store command的test envelope，不是新domain。fixture包住真實buildApp/app.inject或現有store methods；兩邊都走相同economy、report eligibility、types與identity verifier contract。

1. 每案例從同一A類configuration＋明確test-only C類fixtures開始；SQLite=:memory或OS temp，PG=隔離throwaway database/schema，絕不連production。
2. Fixture時鐘包含`options.now`與global Date／Date.now；測試process設TZ兩種值（UTC／Asia/Taipei），仍以authority明確timezone計算。定義依呼叫順序的clock script，尤其confirmed/settled跨月案例，不能把所有timestamp強行設同一值。
3. 新產生的randomUUID／randomBytes提供相同test-only entropy tape；原函式的ID前綴、hash/HMAC仍走真實程式。這個seam在W1B提案中實作，不於W1A改source。被匯入的歷史ID／timestamps／snapshot **不得normalize**。
4. 同一event list先餵SQLite再PG；每步比較HTTP status、error分類、response contract及各表row delta，最後比較全部相關表。重播結果依source（如Resident儲存result vs Knowledge讀最新profile）分別驗證。
5. 使用W1B PG adapter的實際非owner Server role執行business path，再以read-only verifier roleinspect；另以migration-owner驗證DDL/FK。不同角色結果不能混作一個immutable verdict。
6. Snapshot對所有35表使用inventory欄序及PK排序；NULL有型別標記、64-bit為decimal字串、TEXT為原UTF-8內容、JSON text不parse後重序列化、timestamps不改timezone。只排除新run的migration applied_at等明確技術欄；匯入reconciliation連此欄也必須逐bytes一致。
7. 欠缺ORDER BY tie-break的同timestamp ledger列按完整row multiset比對，不能宣称列表不穩定是business failure；已有queue_order／cursor欄序則exact比較。
8. 同步事件entropy tape只控制測試；race案例由預先分配的per-request tape與barrier控制。兩種合法序列化winner都可接受，但比較winner对应同一輸入的完整结果，且必须exact一次effect。不能把重複ledger行normalize掉。

## 執行方式與 gate

W1A 現在即可執行：

```powershell
node --import tsx scripts/inspect-w1a-schema.mjs --check
node --import tsx scripts/probe-w1a-sqlite.mjs
$apiTestPaths = @(rg --files apps/api/src -g '*.test.ts')
node --import tsx --test @apiTestPaths
```

正式root gate仍是W0.1 `pnpm test`；本機目前pnpm wrapper在測試前嘗試安裝且以ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY／Windows libuv assertion失敗。W1A直接執行同一既有Node/tsx suite，315/315PASS，未改package／lock／CI。這個launcher限制保留於validation，不改寫成pnpm PASS。

W1B 所需流程（尚未存在的命令不冒充已可用）：既有Node tests增加fixture factory參數，將同一scenarios在`sqlite`、`postgres`各跑一遍，呼叫上述comparator；原315tests保持gate，SQLite-only tests另註database-specific，不skip domain案例。PG不可用應fail或明確NOT RUN，不能報PASS。CI仍原verify job增加隔離PG service／credentials及相同runner入口，需下批授權才實作。

Acceptance：P01–P27及新增邊緣組全部有PASS證據；零跨resident／merchant寫入、零額外reward、每一failure point資料完全rollback；歷史匯入raw diff為空；每個PGconstraint/trigger/index與mapping一一對應。對不存在的domain只記錄explicit N/A-with-authority，不假造功能。

## 27 必要場景

| ID  | 同一輸入／前置                                                                                      | 比較結果與現有authority／缺口                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P01 | 建立account；建立linked player；重播/更改payload                                                    | account/user/resource/growth IDs與1:1關係；createAccount不自動建player；profile建置失敗全部rollback。app.test canonical account identity group                                                                                                               |
| P02 | 同LINE provider/subject初次及重複login；兩裝置並發；不同subject                                     | 同一account/player、唯一external identity，無跨人合併；token hash only；player-identity.test官方verifier mock保持                                                                                                                                            |
| P03 | player/merchant/platform session login、touch、expiry等號、revoke、logout重播、invitation一次redeem | purpose/role/origin/cookie與revoked/last_used timestamps；不將LINE或既有account換Supabase Auth                                                                                                                                                               |
| P04 | Lv2拒絕；Lv3正確/錯誤、同日重播/改答案、台北午夜                                                    | 正確100Stars/50EXP/requested20Energy，錯誤0Stars/30EXP；hard cap/level effects走真實rules；one attempt/reward/EXP ledger；global key conflict                                                                                                                |
| P05 | Core Tree completion→claim、未完成claim、跨resident、跨日、並發                                     | exactly10Stars、0EXP/CO₂e/growth增量；request/result持久重播，failure沒有pending殘留；resident-mission.test全組                                                                                                                                              |
| P06 | 現有settleActivityReward以小EXP delta、不跨級                                                       | current_exp累計、1EXPledger、currentLevel不變、沒有多餘chest                                                                                                                                                                                                 |
| P07 | 現有level definitions前一點到exact threshold                                                        | 單次level-up、chest star separateledger、energy refill、unlock flags、source等式                                                                                                                                                                             |
| P08 | 大EXP一次跨多級                                                                                     | 每級reward/log完整一次、max energy累加、符合現有queue生成條件（僅vegetarian）                                                                                                                                                                                |
| P09 | threshold overflow與Lv10後追加EXP                                                                   | totalEXP保留、API nextLevelExp null、DB persistedNextExp為current threshold；不截斷                                                                                                                                                                          |
| P10 | merchant general/star、Monday/lunar1/lunar15及重疊；Resident/Knowledge收入                          | base Stars與level chest分開；plans400/500/600不成為正式base rule；重疊不double                                                                                                                                                                               |
| P11 | Stars expenditure／settlement                                                                       | **沒有正式spend route/domain；不可發明。** 現有redemption是收入settlement，沿P16測；兩個legacy經濟寫route仍410無side effects。raw ledger的consume enum及負amount/balance CHECK做DDL parity，不能代表商店已實作；不得用negative settleActivityReward假裝spend |
| P12 | Lv1/2 lock、120秒tick前後、滿energy、future timestamp、重複read、reward cap                         | Energy、last_updated ticks、nohiddenbacklog、overflow_pending維持0；read-triggered ledger/log/audit，failure boundary另外記錄                                                                                                                                |
| P13 | 一次有效vegetarian核銷800g                                                                          | carbon_total/carbon_balance各+800（未跨threshold）；不把0.8kg float存DB                                                                                                                                                                                      |
| P14 | 預置1600g balance再+800                                                                             | seed+1、carbon remainder400；linked convert debit/credit與conversion_id、growthlog                                                                                                                                                                           |
| P15 | seed/plant接近5門檻、跨多門檻、大量轉換、10trees                                                    | source5:1、5:1、remainder與累積tree；不創建diamond或改規則                                                                                                                                                                                                   |
| P16 | 現有completeVegetarianRedemption／taskcodeconfirm                                                   | stars/EXP/level/Energy/CO₂e/growth/mission/redemption/reward/snapshot/alllogs/audit/queue一致；少一項不得成功                                                                                                                                                |
| P17 | window→submit pending→confirm→settled；legacy confirmed recovery                                    | pending無reward；confirm+settlement同transaction；links、decided_by、separate timestamps、scope snapshot                                                                                                                                                     |
| P18 | pending→reject及重播/改決定                                                                         | rejected timestamp/actor/audit；0settlement；settled不得改reject                                                                                                                                                                                             |
| P19 | window2h、confirmation5min前1ms/恰好/後1ms；poll多次；legacyNULL                                    | expired_at=首次清理傳入now只寫一次，可能晚於confirmation_expires_at；expiry與decision失敗前的side effect保留；0reward                                                                                                                                        |
| P20 | 同key同payload、lost response後rotation再重送、new key同source                                      | 重播原snapshots/links；依個別domain規定replay或409；無duplicateEXP/Stars/conversion/event                                                                                                                                                                    |
| P21 | 同key不同user/source/amount/answer/mission/decision                                                 | canonical fingerprint conflict及適當status；不泄漏別人的result                                                                                                                                                                                               |
| P22 | 每個現有failNext*／growth/level failurepoint＋connection drop/commit uncertainty                    | 相關表前後一致；rollback後same key可重試；commit未知先查key再回覆，不盲目再發reward                                                                                                                                                                          |
| P23 | A/B identity、submission、Knowledge、dailyinstance、queue、preference                               | B不能讀/改A；state隔離；spoofedheaders/body無效；primitive key scope不擴張                                                                                                                                                                                   |
| P24 | brand owner/manager、branch manager/staff、跨brand、停權、membershipoverlap                         | 原serverpermission矩陣／snapshot scope；wrongmerchant403；PG兩connection並發建立重疊scope不可雙成功                                                                                                                                                          |
| P25 | 對immutable四表UPDATE/DELETE；一般ledger mutation probes                                            | 四表皆DB拒絕；一般ledger SQLite確實可raw修改，Backend無改寫path；PG grants若加保護需以角色區分，redemption link update正常；no偽造SQLite已immutable                                                                                                          |
| P26 | submit scope capture→rename brand/branch→settle/replay/report；缺舊snapshot                         | snapshot字串不變、1:1與atomic insert；legacy不backfill且data-quality排除；rule snapshot不使用新規則重算                                                                                                                                                      |
| P27 | 台北月首/末、UTC跨日、不同process TZ、cutoff等號、confirmed/settled分跨月                           | [start,end)、<=cutoff、currentmonthonly、pendingcarry、grossbaseStar不含chest；merchant/adminsharedaggregation；missingevidence分類完全一致                                                                                                                  |

## 必補的資料庫／並行 cases

- 七個partial predicates、全部55FK（cascade與NO ACTION）、112CHECK（含NULL三值）、nullable unique多NULL、TEXT PK實際nullablequirk、PG preflight拒絕處理方案。
- 四表8immutable triggers及membership4guards，INSERT／UPDATE都測。任何trigger增加的lock都需測wrong-brand與跨scope race。
- 三組獨立connections/processes：sameidentityfirstlogin、samereward/claimkey、samewindowrotation／decision；再測differentkeys同user lostupdate、lastsuperadmin兩人同時demote/suspend、samebrand brand/branchscope競爭。
- AUTOINCREMENT hwm：rollback/retry、刪最大列、新explicit值、匯入sqlite_sequence高於現有MAX、failedinsert；不能忽略queue_order差異。
- JSON每欄NULL/原bytes、duplicatekeys/whitespace/numericlexeme；coreconfig malformed/missing/typecoercion；reportinglegacybadJSON不因匯入cast意外失敗或假補資料。
- LIKE百分號／底線／backslash／nonASCII fold；GLOB業務日期形狀與case-sensitiveprefix；text排序同timestamp／NULL；NUL／invalidUTF8 preflight。
- bigint safe-range／SUM adapter；秒／毫秒／offset／UTC空格timestamp不互相覆寫。

## Migration fixtures 與 current oracle

JSON inventory.testCases完整列出315名稱／file／line。現有upgrade coverage包含：空庫1–27、legacyconstraints／regeneration、v3ledger、v8clamp、v12brands、v13nullableapplication、v14account、v15duplicate/overlap拒絕、v16invitations、v17no-timebackfill、v18no-scopebackfill、v19RBAC、v20purpose、v21/v22immutabletransitions、v22→23sessions、v23→25→27、v25→26、v26→27preference，以及failedmigrationrollback。

這不是「每一歷史版本的全部真實資料型態都已覆蓋」。W1B應以現有fixture DDL/rows作golden輸入，額外建立有null/duplicate/orphan/invalidjson的schema邊緣fixtures；測試資料SQL只做setup，不複製business計算。v27 production import不重播v8、v12等backfill；version metadata、每欄raw值與無假新增ledger同時驗證。

以下自動附錄把P01–P27對應既有case名稱／位置；沒有現有正向domain的P11明確列gap。新PG race／SQL compatibility tests是後續工作，不冒稱已存在或已PASS。

## Source test anchors（從本輪AST inventory選取，完整315筆在JSON）

### P01

- [canonical account identity empty database creates accounts schema](../../apps/api/src/app.test.ts#L3680)
- [canonical account identity migrates legacy users to unique accounts](../../apps/api/src/app.test.ts#L3693)
- [canonical account identity preserves user ids and historical references](../../apps/api/src/app.test.ts#L3707)
- [canonical account identity migration replay does not duplicate accounts](../../apps/api/src/app.test.ts#L3723)
- [canonical account identity creates player profile atomically with account](../../apps/api/src/app.test.ts#L3736)
- [canonical account identity rolls back player profile when account flow fails](../../apps/api/src/app.test.ts#L3750)
- [canonical account identity membership foreign key points to accounts](../../apps/api/src/app.test.ts#L3762)
- [canonical account identity preserves membership constraints and cross-brand protection](../../apps/api/src/app.test.ts#L3772)

另有8個相關既有cases列於inventory；這不是新增測試。

### P02

- [player canonical session upgrades v22 sessions without breaking merchant or platform purpose](../../apps/api/src/app.test.ts#L455)
- [player canonical session login stores only a hash and restores the same identity](../../apps/api/src/app.test.ts#L479)
- [player canonical session rejects expired and revoked sessions](../../apps/api/src/app.test.ts#L501)
- [player canonical session rejects invalid configuration credentials origin and inactive accounts](../../apps/api/src/app.test.ts#L516)
- [player canonical session concurrent first login creates one account and profile](../../apps/api/src/app.test.ts#L535)
- [player canonical session isolates state submissions events and spoofed identity](../../apps/api/src/app.test.ts#L547)
- [player canonical session logout is idempotent and production cookie is Secure](../../apps/api/src/app.test.ts#L586)
- [player canonical session LINE verifier accepts a valid official response](../../apps/api/src/player-identity.test.ts#L9)

另有2個相關既有cases列於inventory；這不是新增測試。

### P03

- [player canonical session upgrades v22 sessions without breaking merchant or platform purpose](../../apps/api/src/app.test.ts#L455)
- [player canonical session login stores only a hash and restores the same identity](../../apps/api/src/app.test.ts#L479)
- [player canonical session rejects expired and revoked sessions](../../apps/api/src/app.test.ts#L501)
- [player canonical session rejects invalid configuration credentials origin and inactive accounts](../../apps/api/src/app.test.ts#L516)
- [player canonical session concurrent first login creates one account and profile](../../apps/api/src/app.test.ts#L535)
- [player canonical session isolates state submissions events and spoofed identity](../../apps/api/src/app.test.ts#L547)
- [player canonical session logout is idempotent and production cookie is Secure](../../apps/api/src/app.test.ts#L586)
- [merchant task code history requires a real active session and ignores spoofed auth headers](../../apps/api/src/app.test.ts#L2311)

另有32個相關既有cases列於inventory；這不是新增測試。

### P04

- [unified runtime knowledge card enforces Lv3 daily authority and canonical reward ledger](../../apps/api/src/app.test.ts#L638)
- [beta closure knowledge reward rolls back attempt reward ledger resources events and audit together](../../apps/api/src/app.test.ts#L695)
- [unified runtime exposes resident-isolated mission and daily knowledge read models](../../apps/api/src/app.test.ts#L715)
- [failed preference mutation rolls back and cannot change mission, reward, knowledge, CO2e, EXP, Energy, or growth truth](../../apps/api/src/presentation-preference.test.ts#L160)

### P05

- [resident mission runtime exposes frozen Today slots and isolates A/B instances](../../apps/api/src/resident-mission.test.ts#L50)
- [Core Tree completion is backend dated, duplicate-safe, reward-free, and resident isolated](../../apps/api/src/resident-mission.test.ts#L97)
- [claim atomically grants exactly 10 Stars and enforces replay, conflict, persistence, and unique source](../../apps/api/src/resident-mission.test.ts#L133)
- [claim failure rolls back pending state, ledger, Stars, and request before a clean retry](../../apps/api/src/resident-mission.test.ts#L231)

### P06

- [activity cards can grant stars exp and optional energy but never carbon or plants](../../apps/api/src/app.test.ts#L5903)
- [generic reward idempotency replays same payload and rejects changed payload](../../apps/api/src/app.test.ts#L6179)

### P07

- [EXP crossing threshold levels up and keeps overflow EXP](../../apps/api/src/app.test.ts#L5625)
- [level-up refills energy to the new max energy](../../apps/api/src/app.test.ts#L5649)
- [exact threshold and overflow EXP keep cumulative EXP semantics](../../apps/api/src/app.test.ts#L5721)

### P08

- [large EXP supports multiple level-ups and all rewards](../../apps/api/src/app.test.ts#L5637)
- [database level definitions drive thresholds multi-level rewards and refill](../../apps/api/src/app.test.ts#L5690)

### P09

- [EXP crossing threshold levels up and keeps overflow EXP](../../apps/api/src/app.test.ts#L5625)
- [exact threshold and overflow EXP keep cumulative EXP semantics](../../apps/api/src/app.test.ts#L5721)
- [max level returns null nextLevelExp and still accumulates EXP](../../apps/api/src/app.test.ts#L5734)

### P10

- [task code settlement level two and three chests are separate from base stars](../../apps/api/src/app.test.ts#L4848)
- [finalized star settlement general non-designated grants zero stars but keeps core resources](../../apps/api/src/app.test.ts#L5227)
- [finalized star settlement general Monday grants one hundred stars](../../apps/api/src/app.test.ts#L5238)
- [finalized star settlement general lunar first grants one hundred stars](../../apps/api/src/app.test.ts#L5247)
- [finalized star settlement general lunar fifteenth grants one hundred stars](../../apps/api/src/app.test.ts#L5256)
- [finalized star settlement star non-designated grants two hundred stars](../../apps/api/src/app.test.ts#L5265)
- [finalized star settlement star designated grants three hundred fifty stars](../../apps/api/src/app.test.ts#L5273)
- [finalized star settlement Monday lunar overlap does not stack](../../apps/api/src/app.test.ts#L5281)

另有4個相關既有cases列於inventory；這不是新增測試。

### P11

- [beta closure permanently disables legacy economic write routes without side effects](../../apps/api/src/app.test.ts#L618)
- [database constraints reject invalid core settings and resource balances](../../apps/api/src/app.test.ts#L6120)

正向Stars expenditure business case不存在；以上只驗關閉route／既有constraint。

### P12

- [finalized core economy level one and two energy stays locked and does not regenerate](../../apps/api/src/app.test.ts#L5067)
- [finalized core economy energy reward respects hard cap and creates no overflow transaction](../../apps/api/src/app.test.ts#L5102)
- [natural energy regeneration is lazy and never exceeds max energy](../../apps/api/src/app.test.ts#L5883)
- [reward energy respects the finalized hard cap without overflow pending](../../apps/api/src/app.test.ts#L5893)
- [empty database runs versioned migrations and seeds 120 second energy regeneration](../../apps/api/src/app.test.ts#L5994)
- [natural energy regeneration uses 120 second ticks and preserves only partial seconds](../../apps/api/src/app.test.ts#L6146)

### P13

- [task code settlement eight hundred grams stays as permanent carbon remainder](../../apps/api/src/app.test.ts#L4863)
- [first vegetarian redemption grants stars energy exp and 800g carbon without seed](../../apps/api/src/app.test.ts#L5392)

### P14

- [1600g balance plus one redemption creates one seed and keeps 400g remainder](../../apps/api/src/app.test.ts#L5407)
- [three redemptions create 2.4kg total carbon and one seed](../../apps/api/src/app.test.ts#L5418)

### P15

- [finalized core economy five seeds convert to plant and five plants convert to tree](../../apps/api/src/app.test.ts#L5120)
- [finalized core economy growth keeps remainders and crosses multiple thresholds once](../../apps/api/src/app.test.ts#L5137)
- [large growth conversions settle according to the configured ratios](../../apps/api/src/app.test.ts#L5525)
- [tree count keeps accumulating and does not convert at ten](../../apps/api/src/app.test.ts#L5589)

### P16

- [task code settlement pending confirm becomes settled and links settlement](../../apps/api/src/app.test.ts#L4793)
- [finalized core economy first vegetarian redemption reaches level three keeps fifty exp progress and fills energy](../../apps/api/src/app.test.ts#L5083)
- [first vegetarian redemption grants stars energy exp and 800g carbon without seed](../../apps/api/src/app.test.ts#L5392)
- [growth ledger records balanced grants and linked conversion pairs](../../apps/api/src/app.test.ts#L5451)

### P17

- [canonical reporting timestamps roll back confirmation settlement links and ledger together](../../apps/api/src/app.test.ts#L979)
- [task code pending submission confirmation completes canonical settlement](../../apps/api/src/app.test.ts#L4543)
- [task code settlement pending confirm becomes settled and links settlement](../../apps/api/src/app.test.ts#L4793)
- [task code settlement creates exactly one redemption and one reward event](../../apps/api/src/app.test.ts#L4807)
- [task code settlement legacy confirmed can recover with original decision key](../../apps/api/src/app.test.ts#L4961)

### P18

- [merchant session authorization reject creates no settlement](../../apps/api/src/app.test.ts#L4253)
- [task code pending submission can be rejected](../../apps/api/src/app.test.ts#L4558)
- [task code rejected decision writes rejected timestamp actor and audit](../../apps/api/src/app.test.ts#L4598)
- [task code reject creates no settlement beyond the independently confirmed submission](../../apps/api/src/app.test.ts#L4758)
- [task code settlement reject creates no settlement or resources](../../apps/api/src/app.test.ts#L4878)

### P19

- [canonical reporting timestamps records one expiredAt and exposes it through all existing read models](../../apps/api/src/app.test.ts#L833)
- [canonical reporting timestamps decision expiry records expiredAt before rejecting the decision](../../apps/api/src/app.test.ts#L884)
- [canonical reporting timestamps allow legacy expiredAt null in admin merchant and player APIs](../../apps/api/src/app.test.ts#L906)
- [task code expired window cannot create pending submission](../../apps/api/src/app.test.ts#L4331)
- [task code pending list expires submissions after confirmation window](../../apps/api/src/app.test.ts#L4450)
- [beta closure player polling canonically expires at the five-minute boundary once](../../apps/api/src/app.test.ts#L4502)
- [task code expired submission cannot be confirmed or rejected](../../apps/api/src/app.test.ts#L4623)
- [task code settlement expired submission cannot settle](../../apps/api/src/app.test.ts#L4890)

另有2個相關既有cases列於inventory；這不是新增測試。

### P20

- [player canonical session logout is idempotent and production cookie is Secure](../../apps/api/src/app.test.ts#L586)
- [task code reporting scope snapshot is idempotent and competing submissions keep one pair](../../apps/api/src/app.test.ts#L1127)
- [task code reporting scope snapshot does not backfill a legacy submission during idempotency replay](../../apps/api/src/app.test.ts#L1225)
- [admin merchant branch creation replays identical canonical payload](../../apps/api/src/app.test.ts#L3141)
- [admin merchant membership creation replays identical active membership](../../apps/api/src/app.test.ts#L3382)
- [canonical account identity migration replay does not duplicate accounts](../../apps/api/src/app.test.ts#L3723)
- [canonical account identity replays same idempotency key without duplicate account](../../apps/api/src/app.test.ts#L3826)
- [merchant invitation auth creation is idempotent and revokes previous pending invitation](../../apps/api/src/app.test.ts#L3978)

另有19個相關既有cases列於inventory；這不是新增測試。

### P21

- [admin merchant branch creation conflicts when same code has different payload](../../apps/api/src/app.test.ts#L3158)
- [canonical account identity rejects same idempotency key with different payload](../../apps/api/src/app.test.ts#L3841)
- [beta closure replays a lost task-code response after code rotation and rejects fingerprint conflicts](../../apps/api/src/app.test.ts#L4482)
- [task code same decision idempotency key with different decision conflicts](../../apps/api/src/app.test.ts#L4673)
- [generic reward idempotency replays same payload and rejects changed payload](../../apps/api/src/app.test.ts#L6179)

### P22

- [beta closure knowledge reward rolls back attempt reward ledger resources events and audit together](../../apps/api/src/app.test.ts#L695)
- [task code reporting scope snapshot insert failure rolls back the pending submission](../../apps/api/src/app.test.ts#L1172)
- [canonical account identity rolls back player profile when account flow fails](../../apps/api/src/app.test.ts#L3750)
- [merchant invitation auth competing redemption creates one session and failure rolls back](../../apps/api/src/app.test.ts#L4041)
- [task code settlement failure rolls back submission and settlement writes](../../apps/api/src/app.test.ts#L4947)
- [growth settlement rolls back atomically at every injected failure point](../../apps/api/src/app.test.ts#L5554)
- [level settlement rollback clears level logs star ledgers and user resource updates](../../apps/api/src/app.test.ts#L5766)
- [transaction rollback prevents partial redemption and ledger writes](../../apps/api/src/app.test.ts#L5929)

另有8個相關既有cases列於inventory；這不是新增測試。

### P23

- [player canonical session isolates state submissions events and spoofed identity](../../apps/api/src/app.test.ts#L547)
- [unified runtime exposes resident-isolated mission and daily knowledge read models](../../apps/api/src/app.test.ts#L715)
- [task code settlement player cannot read another player's submission](../../apps/api/src/app.test.ts#L5004)
- [player event queue does not expose another player event through next](../../apps/api/src/app.test.ts#L6407)
- [platform operator rbac context ignores spoofed identity leaks no credentials and performs no writes](../../apps/api/src/app.test.ts#L7363)
- [resident A and B preferences remain isolated](../../apps/api/src/presentation-preference.test.ts#L146)
- [resident mission runtime exposes frozen Today slots and isolates A/B instances](../../apps/api/src/resident-mission.test.ts#L50)
- [Core Tree completion is backend dated, duplicate-safe, reward-free, and resident isolated](../../apps/api/src/resident-mission.test.ts#L97)

### P24

- [task code reporting scope snapshot migration v1 through v18 is continuous and does not backfill legacy rows](../../apps/api/src/app.test.ts#L1024)
- [task code reporting scope snapshot atomically captures the canonical brand and branch](../../apps/api/src/app.test.ts#L1091)
- [task code reporting scope snapshot is idempotent and competing submissions keep one pair](../../apps/api/src/app.test.ts#L1127)
- [task code reporting scope snapshot insert failure rolls back the pending submission](../../apps/api/src/app.test.ts#L1172)
- [task code reporting scope snapshot remains unchanged after master data renames and rejects mutation](../../apps/api/src/app.test.ts#L1200)
- [task code reporting scope snapshot does not backfill a legacy submission during idempotency replay](../../apps/api/src/app.test.ts#L1225)
- [merchant brand branch enforces membership role scope](../../apps/api/src/app.test.ts#L1714)
- [merchant brand branch rejects cross-brand branch membership](../../apps/api/src/app.test.ts#L1748)

另有11個相關既有cases列於inventory；這不是新增測試。

### P25

- [task code reporting scope snapshot remains unchanged after master data renames and rejects mutation](../../apps/api/src/app.test.ts#L1200)
- [legacy reporting eligibility exposes immutable submitted scope without changing current display joins](../../apps/api/src/app.test.ts#L2532)
- [platform operator status lifecycle migration v1 through v21 preserves legacy rows and creates immutable transitions](../../apps/api/src/app.test.ts#L8116)
- [platform operator role lifecycle remains immutable after the v27 migration](../../apps/api/src/app.test.ts#L8459)

### P26

- [task code reporting scope snapshot migration v1 through v18 is continuous and does not backfill legacy rows](../../apps/api/src/app.test.ts#L1024)
- [task code reporting scope snapshot atomically captures the canonical brand and branch](../../apps/api/src/app.test.ts#L1091)
- [task code reporting scope snapshot remains unchanged after master data renames and rejects mutation](../../apps/api/src/app.test.ts#L1200)
- [task code reporting scope snapshot does not backfill a legacy submission during idempotency replay](../../apps/api/src/app.test.ts#L1225)
- [finalized star settlement snapshot saves actual rules and crossed levels](../../apps/api/src/app.test.ts#L5300)

### P27

- [canonical reporting timestamps use independent confirmed and settlement clocks across a Taiwan month boundary](../../apps/api/src/app.test.ts#L928)
- [live monthly task code report enforces the current Taiwan month boundaries cutoff and empty contract](../../apps/api/src/app.test.ts#L2742)
- [live monthly task code report uses canonical event clocks saved gross snapshot scope and quality gates](../../apps/api/src/app.test.ts#L2825)
- [live monthly task code report shares one aggregation across admin and all merchant roles without leaking scope](../../apps/api/src/app.test.ts#L2942)
- [canonical reporting month resolves July boundaries in Taiwan](../../apps/api/src/reporting-month.test.ts#L9)
- [canonical reporting month resolves January and December across years](../../apps/api/src/reporting-month.test.ts#L19)
- [canonical reporting month uses inclusive start and exclusive end](../../apps/api/src/reporting-month.test.ts#L34)
- [canonical reporting month rejects invalid month values and formats](../../apps/api/src/reporting-month.test.ts#L43)

另有2個相關既有cases列於inventory；這不是新增測試。
