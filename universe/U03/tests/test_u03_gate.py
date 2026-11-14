import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import importlib.util
spec = importlib.util.spec_from_file_location("u03_source_gate", ROOT / "tools" / "LOOPER-U03__VERSION_GATE.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class U03GenerationGate(unittest.TestCase):
    def setUp(self):
        self.doc = json.loads((ROOT/"LOOPER-U03__ASSET_MANIFEST.json").read_text(encoding="utf-8"))
    def check_error(self,token):
        errors,_=mod.verify(self.doc,ROOT)
        self.assertTrue(any(token in e for e in errors),errors)
    def test_empty_authorized_gallery_is_honest(self):
        errors,holds=mod.verify(self.doc,ROOT)
        self.assertEqual(errors,[])
        self.assertIn("U03_AUTHORIZED_ART_MANIFEST_EMPTY",holds)
    def test_u01_cannot_become_active(self):
        self.doc["sourceGeneration"]="LOOPER-U01"
        self.check_error("ONLY_U03")
    def test_u02_art_cannot_enter_gallery(self):
        self.doc["approvedToShow"]=[{"fileName":"LOOPER-U03__SCENE__forest_clearing__MASTER__R01.png",
          "sourceGeneration":"LOOPER-U02","sourceFile":"../../apps/mobile/assets/forest-clearing.png","assetId":"x"}]
        self.check_error("ASSET_MUST_HAVE_EXPLICIT_U03")
        self.check_error("ARCHIVED_INPUT_NOT_ELIGIBLE")
    def test_legacy_ui_transition_prohibited(self):
        self.doc["runtimeRules"]["product"]="APP_MVP_UI_FIRST"
        self.check_error("IMMERSIVE_U03")
    def test_actor_free_roam_prohibited(self):
        self.doc["runtimeRules"]["characterMotion"]="FREE_ROAM"
        self.check_error("IMMERSIVE_U03")
    def test_archive_source_denied_even_if_name_prefixed(self):
        self.doc["approvedToShow"]=[{"fileName":"LOOPER-U03__SCENE__forest_clearing__MASTER__R01.png",
          "sourceGeneration":"LOOPER-U03","sourceFile":"../../apps/mobile/assets/forest-clearing.png","assetId":"forest_clearing"}]
        self.check_error("ARCHIVED_INPUT_NOT_ELIGIBLE")
if __name__ == "__main__":
    unittest.main()
