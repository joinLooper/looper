# Welcome First Resident — Resident Content Completeness Matrix

## Audit identity

- Batch: `Welcome First Resident P0-2`
- Branch baseline: `codex/welcome-first-resident`
- Starting commit: `5baa8750f06661dd86bfac338e51bbcfa99c986d`
- Scope: authenticated Player presentation only
- Resident route: `/`
- Preview setting: `NEXT_PUBLIC_RESIDENT_PREVIEW_MODE=true`

## Content completeness matrix

| Area | Route / screen | Resident entry | Current behavior | Data source | Real data | Placeholder / asset state | Error or dead end | Required by Aug 30 | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Player home | `/` / `home` | Profile header | Shows resident identity, approved character companion, level, EXP, stars, carbon and growth summary | `/player/state` | Yes | Approved rabbit runtime export | None | Yes | Complete |
| Resident space | `/` / `forest` | Home identity card or forest bottom navigation | Opens the resident forest/treehouse scene shell | `/player/state` plus approved runtime handoff v006 | Yes for resident resources; product-defined scene | Approved scene, seated actor and cushion layers | None | Yes | Playable |
| Forest | `/` / `forest` | Home forest CTA, bottom navigation, scene tab | Shows canonical carbon totals and persisted seed/plant/tree counts; character and scene are interactive | `/player/state.growth` | Yes | Approved forest scene and v006 seated layers | None | Yes | Playable |
| Treehouse | `/` / `forest` | `樹屋` scene tab | Switches to approved treehouse scene with seated character and furniture | Runtime handoff v006 | Product-defined read-only | Approved treehouse scene and second cushion | None | Yes | Playable |
| Daily arrival | `/` / `home`, `missions` | Today task list | Authenticated visit is shown as complete and explicitly grants no resource | Authenticated Player session | Yes: session exists | No placeholder | None | Yes | Read-only |
| Sustainable knowledge | `/` / `home`, `missions` | `永續小知識` task | Opens the existing knowledge card, records the answer through the existing backend flow and refreshes canonical state | Knowledge card API / `/player/state` | Yes | Existing approved UI surfaces | Existing retry state | Yes | Playable |
| Restaurant mission | `/` / `home`, `missions` | Restaurant task card and restaurant CTA | Opens the dedicated preparation dialog only | Central preview-mode registry | Product-defined status | Approved task icon and dialog | No transaction path in preview | Yes | Deferred |
| Weekly mission | `/` / `missions` | Weekly mission card | Explains the weekly growth concept and opens the shared construction dialog | Product-defined read-only copy | Not a progress source | Approved empty-state asset | None | Yes | Deferred |
| Star exchange | `/` / `exchange` | Bottom navigation | Shows canonical star balance and the future use concept without invented vouchers, prices or rewards | `/player/state.resources.starBalance` | Yes for balance | Approved maintenance empty state | No redemption mutation | Yes | Read-only |
| Resident character display | `/` / `home`, `forest` | Home identity card and scene | Shows approved rabbit/marmot candidates and stable resident identity | `/player/state.displayName`; runtime handoff v006 | Yes for identity | Approved runtime exports/layers | None | Yes | Complete |
| Character click interaction | `/` / `forest` | Character body and character selector | Character selection and direct character click return a local, non-mutating resident message | Local presentation state | Product-defined copy | Transparent accessible hotspot over approved actor | None | Yes | Playable |
| Furniture / props | `/` / `forest` | Forest/treehouse scene | Leaf cushion, second cushion and watering can display in approved anchors | Runtime handoff v006 | Product-defined scene | Approved v005/v006 assets | No false interactive affordance | Yes | Read-only |
| Scene switching | `/` / `forest` | Forest/treehouse tabs | Switches scene while retaining canonical resident state | Local presentation state | N/A | Approved scenes | None | Yes | Playable |
| Bottom navigation | `/` | Four persistent navigation items | Missions, exchange, forest and settings always produce a screen | Local presentation state | N/A | Approved navigation assets | None | Yes | Complete |
| Return home | `/` | Profile header | Returns to home and focuses the screen title | Local presentation state | N/A | Approved profile/home icons | None | Yes | Complete |
| Notifications | `/` | Header notification icon | Opens shared construction dialog and returns to the same screen | Central notice registry | No notification source yet | Approved notification icon | None | No | Deferred |
| Inventory | `/` / `forest` | Backpack, toolbox and inventory tabs | Tabs show explicit empty states; shortcuts open shared construction dialog | Local presentation state | No inventory source yet | Approved inventory tab/empty-state assets | None | No | Deferred |
| Settings: reduced motion | `/` / `settings` | Checkbox | Follows system preference and can disable nonessential motion locally | System media query / local state | Yes | Native checkbox with approved icon | None | Yes | Playable |
| Settings: text size | `/` / `settings` | Text-size row | Explains current system behavior through shared construction dialog | System setting / central notice registry | Yes for current behavior | Approved info icon | None | No | Deferred |
| Settings: accessibility help | `/` / `settings` | Accessibility row | Opens shared construction dialog with current VoiceOver/TalkBack guidance | Central notice registry | Product-defined copy | Approved help icon | None | No | Deferred |
| Settings: sync | `/` / `settings` | Retry and sync rows | Re-reads `/player/state`; transient failure retains the last canonical resident profile | `/player/state` | Yes | Approved status/retry icons | Friendly offline state | Yes | Playable |
| Support | `/` / `settings` | Help button | Opens shared construction dialog | Central notice registry | No support destination yet | Approved question/menu icons | None | No | Deferred |
| Logout | `/` / `settings` | Logout button | Calls existing logout and clears protected Player state | Existing Player Session flow | Yes | Approved profile/button asset | Existing error handling | Yes | Playable |
| Login gate | `/` | Direct Player entry | Checks Player Session and starts LIFF login without displaying previous resident data | Existing Player Session / LIFF | Yes | Approved dialog and status icons | Friendly retry state | Yes | Complete |

## Data-source integrity

The authenticated Player surface uses canonical fields returned by
`/player/state`:

- resident ID and display name;
- star balance;
- current EXP, level, next-level EXP and max-level state;
- total and unconverted carbon grams;
- persisted seed, plant and tree counts;
- mission enrollment and knowledge reward state through their existing flows.

The following content is fixed product explanation, not player progress:

- the meaning of 🌱 / 🪴 / 🌳;
- resident world and scene descriptions;
- Coming Soon purposes;
- the statement that daily arrival does not itself change resources.

No random values, `user-demo`, caller-provided identity, invented voucher
prices, invented weekly progress or front-end settlement values are used.
When a refresh fails, the UI retains the last canonical profile instead of
replacing it with initial zero values.

## Visible-entry contract

Every visible button, card, icon, tab, navigation item and hotspot must produce
one of:

1. a complete function;
2. a read-only view;
3. the shared construction dialog;
4. an explicitly disabled state.

The shared construction dialog uses:

- title: `這個區域還在準備中`
- description: `Looper 世界正在慢慢長大，這項功能之後會再開放。`
- action: `先回去看看`

It closes without changing the current screen or canonical resident state.
The restaurant keeps its dedicated approved copy and returns home.

## Runtime asset inventory

| Asset group | IDs / paths | Runtime use | Status |
| --- | --- | --- | --- |
| Scene backgrounds | `scene_forest_clearing_base_v001_1000.png`, `scene_treehouse_main_base_v001_1000.png` | Forest/treehouse | Approved candidate, present |
| Resident characters | v006 `rabbit_left/right`, `marmot_left/right` back and feet-front layers | Scene actor | Approved, present |
| Home character | `char_rabbit_right_3q_runtime.png` | Identity card | Runtime export, present |
| Furniture | `furn_leaf_cushion`, `furn_second_cushion` back/front-rim layers | Scene seating | Runtime pass, present |
| Prop | `tool_watering_can_v001_runtime.png` | Forest scene | Runtime export, present |
| UI system | 69 manifest families / 274 state exports | Buttons, progress, navigation, dialogs and empty states | Approved manifest, present |
| Knowledge card | Existing approved UI surfaces and icons | Knowledge task | Present |

## Missing and deferred assets

No P0 resident-visible asset is missing.

The following non-P0 runtime interactions remain deferred and are hidden from
the Resident Preview scene tabs:

| Asset ID | Intended use | Requested size | Transparency | Screen | Blocking |
| --- | --- | --- | --- | --- | --- |
| `T6_WATERING_RUNTIME_MASK` | Held watering interaction | Existing 1000×1000 scene coordinate system | Required | Forest | No |
| `T6_BROOM_RUNTIME_MASK` | Treehouse tidying interaction | Existing 1000×1000 scene coordinate system | Required | Treehouse | No |
| `T6_SNACK_TRAY_RUNTIME_MASK` | Snack-tray interaction | Existing 1000×1000 scene coordinate system | Required | Treehouse | No |
| `D9_RABBIT_SCARF_RUNTIME_MASK` | Rabbit scarf occlusion | Actor-local runtime canvas | Required | Forest/treehouse | No |
| `D9_MARMOT_SCARF_RUNTIME_MASK` | Marmot scarf occlusion | Actor-local runtime canvas | Required | Forest/treehouse | No |

Static approved previews remain in the repository for audit evidence but are
not exposed to residents as playable content.
