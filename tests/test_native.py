from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from native import extract_library, inspect_apk


class NativeArchiveTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def apk(self, members):
        path = self.root / "fixture.apk"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("AndroidManifest.xml", "fixture")
            for name, value in members:
                archive.writestr(name, value)
        return path

    def test_lists_and_extracts_one_library_without_other_assets(self):
        member = "lib/arm64-v8a/libfixture.so"
        path = self.apk([(member, b"\x7fELFfixture"), ("assets/ignore", b"private")])
        archive, report = inspect_apk(path)
        archive.close()
        self.assertEqual(report["libraries"], [member])
        destination = self.root / "input.so"
        result = extract_library(path, member, destination)
        self.assertEqual(destination.read_bytes(), b"\x7fELFfixture")
        self.assertEqual(result["bytes"], 11)
        with self.assertRaises(FileExistsError):
            extract_library(path, member, destination)
        self.assertFalse((self.root / "assets").exists())

    def test_rejects_paths_and_unselected_members(self):
        for name in ("../outside.so", "lib/arm64/NUL.so", "lib/arm64/name?.so", "lib/arm64/a. "):
            with self.subTest(name=name):
                path = self.apk([(name, b"bad")])
                with self.assertRaises(ValueError):
                    inspect_apk(path)
        path = self.apk([("lib/arm64-v8a/libfixture.so", b"fixture")])
        with self.assertRaisesRegex(ValueError, "existing"):
            extract_library(path, "assets/libfixture.so", self.root / "output.so")
        self.assertFalse((self.root / "output.so").exists())

    def test_rejects_symlinks_and_duplicate_members(self):
        path = self.root / "fixture.apk"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("AndroidManifest.xml", "fixture")
            member = zipfile.ZipInfo("lib/arm64/libx.so")
            member.create_system = 3
            member.external_attr = 0o120777 << 16
            archive.writestr(member, "/outside")
        with self.assertRaisesRegex(ValueError, "links"):
            inspect_apk(path)
        path = self.apk([("lib/arm64/libx.so", b"a"), ("lib/arm64/libx.so", b"b")])
        with self.assertRaisesRegex(ValueError, "Repeated"):
            inspect_apk(path)

    def test_selected_library_allows_case_distinct_resources_but_decode_rejects_them(self):
        path = self.apk([("lib/arm64/libx.so", b"fixture"), ("res/2F.xml", b"A"), ("res/2f.xml", b"B")])
        archive, report = inspect_apk(path)
        archive.close()
        self.assertEqual(report["libraries"], ["lib/arm64/libx.so"])
        output = self.root / "selected.so"
        extract_library(path, "lib/arm64/libx.so", output)
        self.assertEqual(output.read_bytes(), b"fixture")
        with self.assertRaisesRegex(ValueError, "Repeated"):
            inspect_apk(path, extract_all=True)

    def test_rejects_expanded_size_budget_before_reading(self):
        path = self.apk([("lib/arm64/libx.so", b"a")])
        data = bytearray(path.read_bytes())
        position = data.index(b"PK\x01\x02")
        data[position + 24:position + 28] = (513 * 1024 * 1024).to_bytes(4, "little")
        path.write_bytes(data)
        with self.assertRaisesRegex(ValueError, "budget"):
            inspect_apk(path)


if __name__ == "__main__":
    unittest.main()
