# Forest Logical Runtime Integration v001 — Browser QA Evidence

Browser QA used the committed `ForestLogicalRuntime` component with
`playerState=null`. This exercises the formal no-mock loading state and does not
create, store, or display a test player, LINE identity, token, or secret.

The temporary local-only route used to host the component was removed before
commit. It did not call Session, Player State, mission, Merchant, task-code,
pending, settlement, or player-event APIs.

## Verified viewports

| Viewport | Measured logical canvas | Result |
| --- | --- | --- |
| 375 × 667 | 375 × 811.96 at y = -72.38 | Pass |
| 375 × 690 | 375 × 811.96 at y = -60.78 | Pass |
| 390 × 844 | 390 × 844 | Pass |
| 780 × 1688 | 780 × 1688 | Pass |
| 1170 × 2532 | 1170 × 2532 | Pass |
| 1280 × 720 | 332.70 × 720 at x = 473.65 | Pass |
| 1440 × 900 | 415.88 × 900 at x = 512.06 | Pass |

The 375 × 690 browser run confirmed all eight map entries remained visible.
The viewport-anchored settings target measured 44 × 44 px. The 390 × 844 and
1440 × 900 runs reported zero broken images. A fresh final browser run reported
no console warnings, errors, or Next error overlay.

## Evidence index

- `forest-390x844.png`: exact logical canvas.
- `forest-375x667.png`: short-height mobile.
- `forest-375x690-line-webview.png`: LINE WebView equivalent.
- `forest-1280x720.png`: desktop central logical canvas and lateral extension.
- `forest-1440x900.png`: large desktop geometry.
- `forest-rabbit-dialogue.png`: formal rabbit dialogue anchor and keyboard focus.
- `forest-core-tree-summary-loading.png`: safe no-mock growth loading state.
- `forest-treehouse-route.png`: existing treehouse route regression.
- `guidance-step-1-forest.png`: full-scene Step 1 target.
- `guidance-step-3-core-tree.png`: core-tree Step 3 spotlight.
- `guidance-step-5-restaurant.png`: locked restaurant Step 5 spotlight.
- `forest-reduced-motion.png`: reduced-motion class with sheet animation and
  HUD transition both computed as `none` / `0s`.

Authenticated mission-board and knowledge-card visual evidence remains part of
central real-account review. Browser policy prevented opening the external LINE
login page; no workaround or credential inspection was attempted. Static and
unit regressions cover both existing flows, and restaurant transaction paths
remain gated to zero in Preview Mode.
