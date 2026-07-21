# C0 Knowledge Card Reconstruction

## Historical reference

Recorded historical prefix: `b3d0b93`

Status: Unverified and unavailable in Git object storage.

This reconstruction is not presented as the original commit and is not claimed to be bit-for-bit equivalent to it.

## Recovery attempts

- GitHub commit lookup
- Local refs
- Reflog
- Worktrees
- Unreachable objects
- Attachments
- Backup evidence

Result: the original commit could not be verified.

## Reconstruction source

The flow was reconstructed from approved Looper MVP product specifications on top of the backend RC, the PR #27 player renderer, and the PR #28 formal seated runtime increments.

## Approved requirements

- `永續小知識`
- `補充`
- `+30 EXP`
- No EXP border
- Blank unused reward fields
- Restrained incorrect-answer feedback
- No decorative corner flowers
- No green dashed leaf divider
- Responsive mobile integration

## Economic integration

No canonical API currently exists for safely granting the knowledge-card `+30 EXP` reward. The reconstructed flow therefore does not write EXP, a resource ledger, a reward event, or a redemption. It does not call legacy `POST /admin/reward-events` or `POST /redemptions`.

The UI displays the approved reward copy while explicitly stating that it is not yet permanently credited. EXP persistence remains an integration blocker until a canonical, authenticated, idempotent player knowledge-reward contract is approved.

## Existing fragments reused

- Approved `ui_icon_knowledge` and `ui_icon_question` assets
- Existing `ui_task_card`, `ui_dialog`, button, status, and focus primitives
- Existing responsive player shell and bottom navigation
- Existing `knowledge_entry` unlock flag as evidence of the intended feature entry; it is not used as a reward-writing mechanism

## Changed files

- `apps/web/app/knowledge-card-flow.ts`
- `apps/web/app/knowledge-card-flow.test.ts`
- `apps/web/app/knowledge-card.tsx`
- `apps/web/app/page.tsx`
- `apps/web/app/mobile.css`
- `docs/integration/C0_KNOWLEDGE_CARD_RECONSTRUCTION.md`

## New commit

To be recorded in a follow-up documentation commit after the reconstruction commit is created.
