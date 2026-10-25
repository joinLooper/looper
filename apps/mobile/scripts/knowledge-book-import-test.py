import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("kb_import", Path(__file__).with_name("knowledge-book-import.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def archive(entries):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_STORED) as file:
        for name, content in entries:
            file.writestr(name, content)
    return stream.getvalue()

class SourceSafety(unittest.TestCase):
    def test_mismatch_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder) / "source.zip", Path(folder) / "out"
            source.write_bytes(archive([("x", b"x")]))
            with self.assertRaisesRegex(ValueError, "SOURCE_SHA_MISMATCH"):
                module.import_source(source, output)
            self.assertFalse(output.exists())

    def test_traversal_and_windows_absolute_paths(self):
        for name in ("../bad.png", "/bad.png", "C:/bad.png", "a/../../bad.png", "..\\bad.png"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "unsafe"):
                module.validate_archive(archive([(name, b"x")]))

    def test_crc_corruption(self):
        data = archive([("image.png", b"UNIQUE_IMAGE_BYTES")]).replace(b"UNIQUE_IMAGE_BYTES", b"CORRUPT_IMAGE_DATA")
        with self.assertRaises(zipfile.BadZipFile):
            module.validate_archive(data)

    def test_nested_roles_preserve_independent_fingerprints(self):
        r2 = archive([("placement.json", b"{}")]); r3 = archive([("state_manifest.json", b"{}"), ("hitbox.json", b"{}")])
        result = module.validate_archive(archive([("book_R2.zip", r2), ("book_R3.zip", r3)]))
        self.assertEqual({item["role"] for item in result["packages"]}, {"R2", "R3"})
        self.assertEqual(result["packages"][0]["sha256"], module.sha(r2))
        self.assertEqual(len(result["contracts"]), 3)

    def test_duplicate_casefold_and_budget(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            module.validate_archive(archive([("A.png", b"a"), ("a.png", b"b")]))
        with self.assertRaisesRegex(ValueError, "budget"):
            module.validate_archive(archive([("x", b"x")]), budget={"bytes": module.MAX_BYTES, "entries": 0})

if __name__ == "__main__":
    unittest.main()
