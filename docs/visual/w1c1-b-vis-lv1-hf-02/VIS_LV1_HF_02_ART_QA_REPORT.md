# VIS-LV1-HF-02 Art QA Report

Status: **PARTIAL — READY FOR CENTRAL HUMAN VISUAL REVIEW**

Source visual line: PR #46, `c9ee4a4cf391f7ac8ed2927de2e1a7a508c616c1`

This calibration keeps the HF-01 cinematic forest language and corrects the spatial relationship of the three Lv1 anchors. The Character Canon V2 originals dated 2026-10-06 were verified bit-for-bit before generation. No original Canon PNG was added to GitHub.

## Delivered artifacts

- `lv1-forest-clearing-scene-canon-v2.png` — no-UI calibrated scene, SHA-256 `c3923bd85355f076df284eb65c68820ce904767d85c45e3a220f5248d1f6e654`
- `lv1-forest-clearing-hud-canon-v2.png` — same-composition restrained HUD, SHA-256 `2a0bd8691ae6a99d095f8df5bd75760c30ee1fe650b4470c18f1eb305b9c4862`
- `index.html` — phone-proportion interaction preview with three formal hotspots
- `lv1-preview-interactive-canon-v2.png` — browser evidence after all three hotspot clicks, SHA-256 `78e9a92369e1017653395d490bedfe00012eb21552485a80b9abdc6cfb8a4259`
- `comparison.html` and `lv1-visual-comparison-canon-v2.png` — HF-01 before versus HF-02 calibrated after, SHA-256 `8aed0529d4064df938453b21d419035c8587900f32321ce940fef8fa9aebbec`
- `CHARACTER_CANON_V2_CALIBRATION_QA.md` — original hashes, dimensions and calibration checks

## Behaviour and scope

The preview verifies three independent labels: `土撥鼠正在陪你迎接早晨`, `原生嫩芽：森林的第一個小生命`, and `樹樁：留下一個安靜的休息位置`. Reduced motion remains supported. No product Forest runtime, Gameplay, Economy, Database, Supabase, Native App, or Lv2–Lv10 asset scope was changed.

The output remains a visual prototype pending central human aesthetic approval. This work package stops here for review.
