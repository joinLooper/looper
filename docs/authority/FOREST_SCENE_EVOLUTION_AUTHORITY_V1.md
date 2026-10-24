# LOOPER｜FOREST SCENE EVOLUTION AUTHORITY V1
Date: 2026-10-24 (Asia/Taipei)
Decision maker: Looper Central / user
Authority status: APPROVED PRODUCT DIRECTION — architecture/scene-design rule, **not** approval of any new PNG or composition.
Applies to: Forest, level-gated unlocks, visual state & composition, iPhone viewport QA.

## 1. What has and has not been built
- The present APP-F1-PR64 implementation integrates the **single V-F1 Lv1 Forest background** (in the user's Windows worktree) plus level-selectable QA actions. The remote PR has an art-generated background import defaulting to null; it is not proof that all approved PNG bytes have been published.
- Lv1/Lv3/Lv5/Lv10 are QA snapshots for exploring feature/path availability, not four distinct completed Forest art scenes.
- Current `forest.tsx` reuses `APPROVED_F1_BACKGROUND` across test levels and `f1-scene-projection.ts` has **one** 941×1672 source canvas and shared object frames. These are a **Lv1 implementation/temporary QA arrangement**, not a perpetual all-level camera/composition contract.
- Current `sceneVisibility()` gates the Rabbit/Treehouse placeholders at Lv5; `qaWorld()` gates Knowledge/Energy and progress flags. Neither constitutes final art or a scene-variant registry.

## 2. User-approved core decision
As the forest progresses, it can change **as a composed space**, not simply by overlaying more PNG sprites onto the current Lv1 screenshot.

Changes may include:
- full/background scene art, treehouse and future treasure-chest appearances;
- camera framing, field of view, visual scale, zoom, panning, perspective and scene crop;
- scene-prop arrangement, actor scale and authored pivot/anchor positions;
- foreground occlusion, shadows, layers and depth;
- accessible interaction/hit regions that align with the **new** composition;
- UI/HUD safe areas and iPhone 9:16 / 9:19.5 layout.

**Explicit prohibition:** do not define all subsequent levels by drawing extra objects over V-F1 Lv1 and retaining its one fixed 941×1672 projection, without separate Central art/layout approval. Likewise, do not assume adding Lv5 Treehouse means overlaying an unapproved Treehouse PNG on the current Lv1 frame.

## 3. Separating game progression from visual composition
- `level` and `unlock flags` are gameplay state. Each determines which actions/content may be available.
- `scene_id` identifies Forest or Treehouse. `visual_state_id` identifies an approved composition of that scene. Additional camera/layout state can be recorded per visual state.
- Multiple levels may share one approved composition when appropriate, while certain levels/milestones/approved events can change to a different composed Forest visual state. **Do not create ten backgrounds merely because Lv1–Lv10 exist.**
- Any treasure-chest unlock condition, scene placement and appearance remain **TBD pending design approval**; do not arbitrarily assign a level.
- Lv5's Treehouse unlock remains a gameplay milestone, **not automatic approval of any specific background, camera angle, or asset source**.
- Visual state must not be equated to the carbon-growth stage of the central sapling or the five info-page-only sapling sprites; these remain distinct asset responsibilities.

## 4. Suggested scene-variant data contract (design target, not deployed)
Each Central-approved Forest visual state should include:
- `scene_id`, `visual_state_id`, `status`, `unlock_conditions`;
- approved `background_asset_id` and optional layer references;
- `source_canvas` and `camera` (framing/projection);
- independent `placements` and `hit_regions` with anchor/pivot, occlusion and safe-area rules;
- `visible_interactables`, available navigation routes and fallback when art is missing;
- reference whole-scene composition and visual-diff evidence for both iPhone aspect ratios;
- manifest, asset hashes and art/engineering/Native acceptance status **separately**.

The final camera/asset organization (single composite background versus layers) is to be decided per scene without forcing one implementation for every visual stage.

## 5. Current implementation boundaries
- Preserve approved `forest_clearing / V-F1` unchanged; continue correcting its existing Live/QA rendering without extrapolating its scale to future levels.
- Keep Lv1/Lv3/Lv5/Lv10 QA navigation and event-routing tests; show unreleased visual states as visibly marked **ART_PENDING / QA_PLACEHOLDER**, not pretend that changing the test level changed the background.
- Do not manufacture an Lv3, Lv5, Lv10 background from unapproved art or stretch the Lv1 image to imitate a later composed scene.
- No new art approval or runtime code changes are authorized solely by this architecture decision; create each visual-state scene concept/whole-scene art first, then layer/placement/hitbox manifests, and finally implement in runtime once Central approves.
- Integration remains Draft; do not merge/deploy, alter formal player ledger, or overwrite the user's local approved Forest or HUD candidate.

## 6. Future acceptance definition
Acceptance of a new Forest visual state requires BOTH a specifically approved composition and a playable iPhone result: correct camera/scale/proportions, correct unlocked content, appropriate interactions/close/return, all applicable viewport ratios, and no regression to earlier levels. Function PASS and Art PASS are separately counted.
