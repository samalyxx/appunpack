import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "ipa.py"
spec = importlib.util.spec_from_file_location("ipa_inspector", SCRIPT)
ipa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipa)


class IpaInspectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="apk-lens-ipa-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def archive(self, entries):
        path = self.root / "sample app.ipa"
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in entries:
                archive.writestr(name, data)
        return path

    def metadata(self, **values):
        return {"CFBundleIdentifier": "org.example.sample", "CFBundleName": "Sample",
                "CFBundleShortVersionString": "1.2", "CFBundleVersion": "7",
                "CFBundleExecutable": "Sample", "MinimumOSVersion": "15.0", **values}

    def test_cli_reads_binary_and_xml_metadata_without_extracting(self):
        metadata = self.metadata(CFBundleDisplayName="<script>[link](bad)\n# title",
                                 CFBundleURLTypes=[{"CFBundleURLSchemes": ["sample", "sample", "other"]}],
                                 NSCameraUsageDescription="Take a photo")
        path = self.archive([
            ("Payload/Sample.app/Info.plist", plistlib.dumps(metadata, fmt=plistlib.FMT_BINARY)),
            ("Payload/Sample.app/PlugIns/Widget.appex/Info.plist", plistlib.dumps(self.metadata(CFBundleName="Widget"))),
            ("Payload/Sample.app/Frameworks/Example.framework/Example", b"not an executable"),
        ])
        output = self.root / "reports" / "new report"
        result = subprocess.run([sys.executable, str(SCRIPT), str(path), "--output", str(output)],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads((output / "evidence.json").read_text(encoding="utf-8"))
        self.assertEqual(evidence["input"]["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(evidence["archive"]["entries"], 3)
        app, extension = evidence["bundles"]
        self.assertEqual(app["identifier"], "org.example.sample")
        self.assertEqual(app["minimum_os"], "15.0")
        self.assertEqual(app["url_schemes"], ["sample", "other"])
        self.assertEqual(app["usage_descriptions"], {"NSCameraUsageDescription": "Take a photo"})
        self.assertEqual(app["executable"]["encryption"], "not_checked")
        self.assertEqual(app["signing"], "not_verified")
        self.assertEqual(extension["kind"], "extension")
        self.assertEqual(evidence["frameworks"], ["Payload/Sample.app/Frameworks/Example.framework"])
        self.assertEqual(sorted(item.name for item in output.iterdir()), ["evidence.json", "report.md"])
        report = (output / "report.md").read_text(encoding="utf-8")
        self.assertNotIn("<script>", report)
        self.assertNotIn("[link]", report)
        self.assertNotIn("\n# title", report)
        self.assertFalse((output / "Payload").exists())

    def test_existing_output_is_not_overwritten(self):
        output = self.root / "existing"
        output.mkdir()
        sentinel = output / "evidence.json"
        sentinel.write_text("keep", encoding="utf-8")
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(ipa.main([str(self.root / "absent.ipa"), "--output", str(output)]), 1)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_malformed_and_oversized_plists_remain_explicitly_unknown(self):
        for content, expected in ((b"not a plist", "malformed"),
                                  (b"x" * (ipa.MAX_PLIST_BYTES + 1), "unavailable")):
            with self.subTest(expected=expected):
                path = self.archive([("Payload/Sample.app/Info.plist", content)])
                app = ipa.inspect_ipa(path)["bundles"][0]
                self.assertEqual(app["info_plist"]["status"], expected)
                self.assertIsNone(app["identifier"])
                self.assertIn("reason", app["info_plist"])

    def test_rejects_unsafe_and_duplicate_archive_paths(self):
        for name in ("../outside", "/absolute", "Payload/../outside", "Payload\\outside", "C:/outside", "nul\x00suffix"):
            with self.subTest(name=name):
                if "\x00" in name or "\\" in name:
                    info = zipfile.ZipInfo("safe")
                    info.orig_filename = name
                    with self.assertRaisesRegex(ValueError, "Unsafe"):
                        ipa.safe_parts(info)
                else:
                    path = self.archive([("Payload/Sample.app/Info.plist", plistlib.dumps(self.metadata())), (name, b"bad")])
                    with self.assertRaisesRegex(ValueError, "Unsafe"):
                        ipa.inspect_ipa(path)
        path = self.archive([("Payload/Sample.app/Info.plist", b"first"), ("Payload/Sample.app/Info.plist", b"second")])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            ipa.inspect_ipa(path)

    def test_encrypted_plist_is_not_read(self):
        path = self.archive([("Payload/Sample.app/Info.plist", plistlib.dumps(self.metadata()))])
        data = bytearray(path.read_bytes())
        struct.pack_into("<H", data, 6, 1)
        central = data.index(b"PK\x01\x02")
        struct.pack_into("<H", data, central + 8, 1)
        path.write_bytes(data)
        app = ipa.inspect_ipa(path)["bundles"][0]
        self.assertEqual(app["info_plist"]["status"], "unavailable")
        self.assertIn("ZIP-encrypted", app["info_plist"]["reason"])

    def test_rejects_binary_plist_object_count_amplification(self):
        payload = b"bplist00" + b"\x00" + struct.pack(">6xBBQQQ", 1, 1, 2**40, 0, 9)
        path = self.archive([("Payload/Sample.app/Info.plist", payload)])
        app = ipa.inspect_ipa(path)["bundles"][0]
        self.assertEqual(app["info_plist"]["status"], "malformed")

    def test_rejects_unbounded_directory_and_non_ipa_archive(self):
        path = self.archive([("readme.txt", b"example")])
        with self.assertRaisesRegex(ValueError, "Payload"):
            ipa.inspect_ipa(path)
        data = bytearray(path.read_bytes())
        end = data.rfind(b"PK\x05\x06")
        struct.pack_into("<I", data, end + 12, ipa.MAX_CENTRAL_BYTES + 1)
        path.write_bytes(data)
        with self.assertRaisesRegex(ValueError, "budget"):
            ipa.inspect_ipa(path)

    def test_unsafe_executable_declaration_does_not_become_a_path(self):
        path = self.archive([("Payload/Sample.app/Info.plist", plistlib.dumps(self.metadata(CFBundleExecutable="../../outside")))])
        app = ipa.inspect_ipa(path)["bundles"][0]
        self.assertIsNone(app["executable"]["path"])
        self.assertTrue(app["info_plist"]["warnings"])


if __name__ == "__main__":
    unittest.main()
