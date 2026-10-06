# Forest Logical Runtime Integration v001

Status: `CENTRAL_REVIEW_READY`

## Baseline

- Starting branch: `codex/welcome-first-resident`
- Starting HEAD: `6215689d5f3304c1f076da59d19f1f3326d89ebd`
- Starting working tree: clean
- Draft PR: `#32`
- Main: not checked out, changed, merged, or rebased
- Asset ZIP SHA-256:
  `984a167045f1a68a866a5f885f419393f153a1a130247ea6c2595d0d59b89443`
- Package SHA entries: 65 passed, 0 failed

## 26-layer integration matrix

| Layer | Asset path | Runtime component | z | Visibility | Preload | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| forest_background_far | assets/logical/batch_a/forest_background_far.png | scene layer | 10 | default | critical | active |
| forest_background_mid | assets/logical/batch_a/forest_background_mid.png | scene layer | 20 | default | critical | active |
| forest_stream | assets/logical/batch_a/forest_stream.png | scene layer | 25 | default | critical | active |
| forest_ground_path | assets/logical/batch_a/forest_ground_path.png | scene layer | 30 | default | critical | active |
| forest_canopy_top | assets/logical/batch_a/forest_canopy_top.png | scene layer | 40 | default | critical | active |
| forest_treehouse_structure | assets/logical/batch_b/forest_treehouse_structure.png | scene layer | 80 | default | secondary | active |
| forest_restaurant_construction | assets/logical/batch_b/forest_restaurant_construction.png | scene layer | 82 | default | deferred | locked |
| forest_core_tree_base | assets/logical/batch_b/forest_core_tree_base.png | scene layer | 90 | default | critical | active |
| forest_native_sprout | props/logical/forest_native_sprout_v001_64.png | scene prop | 105 | default | deferred | active |
| forest_mission_board | assets/logical/batch_c/forest_mission_board.png | scene layer | 110 | default | secondary | active |
| forest_knowledge_table | assets/logical/batch_c/forest_knowledge_table.png | scene layer | 112 | default | secondary | active |
| forest_restaurant_status_text_locked | indicators/forest_restaurant_status_text_locked.png | state layer | 125 | locked_state | deferred | active |
| forest_core_tree_indicator_idle | indicators/forest_core_tree_indicator_idle.png | state layer | 140 | idle_state | state | canonical-derived |
| forest_mission_indicator_unread | indicators/forest_mission_indicator_unread.png | state layer | 140 | unread_state | state | canonical-derived |
| forest_knowledge_indicator_unread | indicators/forest_knowledge_indicator_unread.png | state layer | 140 | unread_state | state | available-state |
| forest_core_tree_indicator_hint | indicators/forest_core_tree_indicator_hint.png | state layer | 141 | conditional_hidden | state | canonical-derived |
| forest_mission_indicator_claimable | indicators/forest_mission_indicator_claimable.png | state layer | 141 | conditional_hidden | state | mapping retained |
| forest_knowledge_indicator_completed | indicators/forest_knowledge_indicator_completed.png | state layer | 141 | conditional_hidden | state | mapping retained |
| forest_rabbit_proxy | characters/char_rabbit_act_breathe__right_3q__start.png | character layer | 200 | qa_runtime_only | critical | formal Standing Proxy |
| forest_mole_proxy | characters/char_mole_act_breathe__left_3q__start.png | character layer | 201 | qa_runtime_only | critical | formal Standing Proxy |
| forest_foreground_left | assets/logical/batch_c/forest_foreground_left.png | foreground layer | 300 | default | secondary | pointer-none |
| forest_foreground_center | assets/logical/batch_c/forest_foreground_center.png | foreground layer | 301 | default | secondary | pointer-none |
| forest_foreground_right | assets/logical/batch_c/forest_foreground_right.png | foreground layer | 302 | default | secondary | pointer-none |
| forest_hud_frame_left | hud/forest_hud_frame_left.png | viewport HUD layer | 400 | default | critical | active |
| forest_hud_frame_right | hud/forest_hud_frame_right.png | viewport HUD layer | 400 | default | critical | active |
| forest_settings_entry | hud/forest_settings_entry.png | viewport HUD layer | 401 | default | critical | active |

Full-canvas logical exports render at the logical-canvas origin because their
approved pixels are already placed inside 390 × 844 alpha canvases. The
handoff x/y/scale/pivot/z/visibility metadata is retained on every runtime
element and checked against the immutable transform map. Character and small
prop dimensions use the same manifest values directly.

## Hotspots

| ID | Target | Behavior | Accessible name | Logical size | Effective minimum | Status |
| --- | --- | --- | --- | --- | --- | --- |
| hotspot_mission_board | mission board | existing missions screen | 查看任務看板 | 97 × 134 | 44 px | active |
| hotspot_rabbit | rabbit | anchored resident dialogue | 和兔兔說話 | 86 × 176 | 44 px | active |
| hotspot_mole | mole | anchored resident dialogue | 和土撥鼠說話 | 82 × 174 | 44 px | active |
| hotspot_knowledge | knowledge table | existing knowledge card | 查看永續小知識 | 87 × 87 | 44 px | active |
| hotspot_core_tree | core tree | canonical growth summary | 查看森林成長 | 58 × 68 | 44 px | active |
| hotspot_treehouse | treehouse | existing treehouse route | 進入樹屋 | 130 × 238 | 44 px | active |
| hotspot_restaurant | construction | locked resident notice | 蔬食餐廳區施工中 | 118 × 98 | 44 px | active |
| hotspot_settings | viewport HUD | existing settings screen | 開啟設定 | 44 × 44 | 44 px | active |

The formal overlap report contains 28 pairs and zero overlap. Foreground layers
remain pointer-none. The seven scene hotspots use the same logical transform on
mobile and desktop; settings remains viewport anchored per the responsive map.

## State mapping

| Machine | State | Source | Asset mapping | Runtime |
| --- | --- | --- | --- | --- |
| core tree | idle | canonical growth has persisted activity | base + idle | active |
| core tree | first_hint | canonical growth has no persisted activity | base + hint | active |
| core tree | growth_available | no canonical trigger | reserved null | not faked |
| core tree | growth_reached | no canonical trigger | reserved null | not faked |
| mission | idle | existing mission state | board | active |
| mission | unread | existing mission is available/in progress | board + unread | active |
| mission | claimable | no separate canonical Player trigger | board + claimable | mapping retained |
| knowledge | idle | existing knowledge entry | table | active |
| knowledge | unread | existing knowledge card is available | table + unread | active |
| knowledge | completed | no completion field in canonical Player State | table + completed | mapping retained |
| restaurant | locked | Preview Mode gate | construction + locked text | active |
| restaurant | future_open | no approved trigger | reserved null | not enabled |

## Guidance mapping

| Step | Target | Runtime reference | Fallback | QA |
| ---: | --- | --- | --- | --- |
| 1 | forest_scene | `[data-guidance-target="forest_scene"]` | full backdrop | browser pass |
| 2 | character_area | formal rabbit/mole hotspot union | full backdrop | static/browser pass |
| 3 | core_tree | formal core-tree hotspot | full backdrop | browser pass |
| 4 | mission_board | formal mission-board hotspot | full backdrop | static pass |
| 5 | restaurant | formal restaurant hotspot | full backdrop | browser pass |
| 6 | forest_scene | `[data-guidance-target="forest_scene"]` | full backdrop | static/browser pass |

Copy, order, CTA, persistence namespace, completed/skipped semantics, canonical
resident isolation, Settings replay, focus trap, Escape, focus restoration, and
reduced-motion logic are unchanged. First-run presentation waits for the 11
Initial Critical assets to settle and does not wait for Secondary assets.

## Canonical HUD and existing feature evidence

- Level, EXP, required EXP and progress are read from `player.resources`.
- Stars are read from `player.resources.starBalance`.
- CO₂e and plant counts use `buildResidentGrowthView(remoteUser.growth)`.
- A null Player State shows skeletons; it does not display fixed or demo values.
- Mission board reuses `goTo("missions")` and the existing mission model.
- Knowledge reuses `KnowledgeCard` and its canonical +30 EXP endpoint.
- Treehouse reuses the existing v006 route renderer in treehouse-only mode.
- Rabbit/mole interaction has no mission API side effect.
- Restaurant only opens the Preview Mode locked notice; task-code and settlement
  are not reachable from the forest component.

## Final test evidence

- Full backend suite: 301 passed, 0 failed.
- Player tests: 47 passed, 0 failed.
- Workspace lint/typecheck: 9 packages passed.
- Production build: 9 packages passed.
- Player UI QA: 0 failures.
- Resident content QA: 0 failures.
- Resident guidance QA: 0 failures.
- Existing runtime assembly QA: 0 failures.
- Forest contract QA: 315 checks, 26 layers, 28 hotspot pairs, 0 failures.
- ZIP/package integrity: 65 SHA entries, 0 failures.
- Browser: broken assets 0, console warning/error 0, Next overlay 0.
- `git diff --check`: pass.
- Secret scan: no credential or private-key pattern.
- Scope scan: Player presentation, contracts, assets, QA docs/scripts only.

## Known issues

- Blocking: none found in the implemented logical runtime.
- Non-blocking central review: authenticated mission-board and knowledge-card
  screenshots were not captured because browser policy blocked the external LINE
  login page. No login, cookie, credential, or alternate bypass was attempted.
  Existing unit/static regressions passed; central should repeat these two visual
  captures with an authorized real-account session.
- Deferred P1: native @2x/@3x sources remain `deferred_source_missing`.
- Existing: treehouse retains its approved prior visual; this batch does not
  rebuild it.
- New regression: none open. Browser QA found and fixed mobile breakpoint/HUD
  anchoring before commit.
