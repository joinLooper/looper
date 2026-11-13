import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from studio.tools.asset_gate import verify

MANIFEST = Path(__file__).resolve().parents[1] / "registry" / "forest_slice_01.json"


class StudioContractTests(unittest.TestCase):
    def setUp(self):
        self.doc = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.dir = tempfile.TemporaryDirectory()
        self.root = Path(self.dir.name)

    def tearDown(self):
        self.dir.cleanup()

    def test_structure_pass_does_not_mean_art_approved(self):
        errors, blockers = verify(self.doc, self.root)
        self.assertEqual(errors, [])
        self.assertTrue(blockers)

    def test_release_is_blocked_until_real_art_approval(self):
        errors, blockers = verify(self.doc, self.root, release=True)
        self.assertEqual(errors, [])
        self.assertTrue(any("founderSceneFusion" in b for b in blockers))

    def test_unapproved_third_scene_fails(self):
        self.doc["world"]["sceneIds"].append("forest_market")
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("場景" in x for x in errors))

    def test_wrong_actor_source_fails_sha(self):
        asset = self.doc["assets"][1]
        (self.root / "candidate.blend").write_bytes(b"WRONG-MODEL")
        asset.update({"sourceFile": "candidate.blend", "sha256": "0"*64})
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("SHA-256" in x for x in errors))

    def test_parent_path_is_rejected(self):
        self.doc["assets"][0]["sourceFile"] = "../private.png"
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("不安全" in x for x in errors))

    def test_false_art_approval_fails(self):
        asset = self.doc["assets"][0]
        asset["status"] = "FOUNDER_APPROVED"
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("雙重批准" in x for x in errors))

    def test_cannot_override_fusion_hold(self):
        self.doc["slice"]["fusionGate"] = "APPROVED"
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("fusionGate" in x for x in errors))

    def test_cannot_invent_camera_scale(self):
        self.doc["world"]["cameraPxPerCm"] = 18.5
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("cameraPxPerCm" in x for x in errors))

    def test_cannot_restore_interface_transition(self):
        self.doc["productDecision"]["interfaceVersionTransition"] = "MVP_UI_FIRST"
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("沉浸式單版" in e for e in errors))

    def test_cannot_invent_free_movement(self):
        self.doc["productDecision"]["actorMovement"] = "FREE_ROAM_3D"
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("沉浸式單版" in e for e in errors))

    def test_main_engine_must_remain_native_until_gate(self):
        self.doc["slice"]["engineDecision"] = "UNITY_ONLY"
        errors, _ = verify(self.doc, self.root)
        self.assertTrue(any("Expo Native" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
