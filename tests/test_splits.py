import hashlib
import io
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import splits


class SplitInputTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="appunpack-splits-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / "report"

    def apk(self, manifest=b'<manifest package="org.example"/>'):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("AndroidManifest.xml", manifest)
            archive.writestr("assets/example.txt", b"asset")
        return data.getvalue()

    def archive(self, entries, name="sample.apks"):
        path = self.root / name
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for entry, data in entries:
                archive.writestr(entry, data)
        return path

    def test_archive_copies_only_apks_with_source_and_container_hashes(self):
        apk = self.apk()
        path = self.archive([("base.apk", apk), ("split_config.en.apk", apk), ("assets.obb", b"ignored")], "sample.xapk")
        original = path.read_bytes()
        result = splits.prepare(path, self.output)
        self.assertEqual(result["input"], {"path": str(path), "kind": "xapk", "sha256": hashlib.sha256(original).hexdigest(), "bytes": len(original)})
        self.assertEqual([part["source"] for part in result["parts"]], ["base.apk", "split_config.en.apk"])
        for part in result["parts"]:
            self.assertEqual(part["sha256"], hashlib.sha256(apk).hexdigest())
            self.assertEqual(Path(part["path"]).read_bytes(), apk)
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(sorted(child.name for child in (self.output / "inputs").iterdir()), ["part-000.apk", "part-001.apk"])
        with self.assertRaises(FileExistsError):
            splits.prepare(path, self.output)

    def test_flat_directory_records_original_part_paths(self):
        directory = self.root / "set"
        directory.mkdir()
        (directory / "base.apk").write_bytes(self.apk())
        (directory / "config.apk").write_bytes(self.apk())
        result = splits.prepare(directory, self.output)
        self.assertEqual(result["input"], {"path": str(directory), "kind": "directory"})
        self.assertEqual([part["source"] for part in result["parts"]], [str(directory / "base.apk"), str(directory / "config.apk")])

    def test_rejects_bundletool_variants_before_creating_output(self):
        path = self.archive([("toc.pb", b"device targeting"), ("splits/base.apk", self.apk())])
        with self.assertRaisesRegex(ValueError, "device variants"):
            splits.prepare(path, self.output)
        self.assertFalse(self.output.exists())

    def test_rejects_unsafe_zip_paths_even_for_unselected_entries(self):
        for index, name in enumerate(("../escape.txt", "/absolute", "C:/drive", "back\\slash", "a/./b", "a//b")):
            with self.subTest(name=name):
                entry = zipfile.ZipInfo(name)
                entry.filename = name
                path = self.archive([("base.apk", self.apk()), (entry, b"bad")], f"bad-{index}.apks")
                with self.assertRaisesRegex(ValueError, "Unsafe"):
                    splits.prepare(path, self.output)
                self.assertFalse(self.output.exists())

    def test_rejects_duplicate_casefold_paths_and_symlinks(self):
        path = self.archive([("base.apk", self.apk()), ("BASE.APK", self.apk())])
        with self.assertRaisesRegex(ValueError, "Repeated"):
            splits.prepare(path, self.output)
        link = zipfile.ZipInfo("link.apk")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        path = self.archive([(link, b"/outside")], "links.apks")
        with self.assertRaisesRegex(ValueError, "links"):
            splits.prepare(path, self.output)

    def test_rejects_apk_size_count_and_total_budgets_before_copying(self):
        path = self.archive([("base.apk", self.apk()), ("config.apk", self.apk())])
        for setting, limit in (("MAX_APKS", 1), ("MAX_APK_BYTES", 10), ("MAX_TOTAL_BYTES", 10)):
            with self.subTest(setting=setting), mock.patch.object(splits, setting, limit):
                with self.assertRaises(ValueError):
                    splits.prepare(path, self.output)
                self.assertFalse(self.output.exists())

    def test_rejects_nested_apk_without_manifest_and_missing_apks(self):
        empty = io.BytesIO()
        with zipfile.ZipFile(empty, "w") as archive:
            archive.writestr("classes.dex", b"not enough")
        path = self.archive([("base.apk", empty.getvalue())])
        with self.assertRaisesRegex(ValueError, "AndroidManifest"):
            splits.prepare(path, self.output)
        other_output = self.root / "empty-report"
        path = self.archive([("readme.txt", b"no APK")], "empty.apks")
        with self.assertRaisesRegex(ValueError, "between 1 and 512"):
            splits.prepare(path, other_output)
        self.assertFalse(other_output.exists())

    def test_rejects_inflated_central_directory_before_zip_allocation(self):
        path = self.archive([("base.apk", self.apk())])
        data = bytearray(path.read_bytes())
        end = data.rfind(b"PK\x05\x06")
        struct.pack_into("<H", data, end + 10, 0xFFFF)
        path.write_bytes(data)
        with self.assertRaisesRegex(ValueError, "ZIP64"):
            splits.prepare(path, self.output)
        self.assertFalse(self.output.exists())

    def test_cli_failure_is_nonzero_and_does_not_write_stdout_json(self):
        path = self.archive([("../escape.apk", self.apk())])
        result = subprocess.run([sys.executable, str(Path(splits.__file__)), str(path), str(self.output)], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn("Cannot prepare split APKs", result.stderr)


if __name__ == "__main__":
    unittest.main()
