# Changelog

## Unreleased

- Disable JADX finally-block reconstruction during full APK/split export to avoid excessive path-permutation memory use. Record the setting in export evidence; reconstructed cleanup code may remain duplicated.
- Preserve the actual export error and diagnostic log path without appending an unrelated JDK diagnosis to every failure.

## 0.2.1 — 2026-10-21

- Accept valid case-distinct resource paths during native inventory, exact-member extraction and opaque split APK copying. Continue rejecting exact duplicate entries and unsafe whole-archive extraction collisions.
- Add opt-in regression checks for a Jellyfin production-bundle split set and actual Android Frida attachment, plus an automated real JADX integration workflow on Ubuntu.
- Record release-derived split installation/pulling, minified NetGuard/Mullvad exports and production native-library results. Keep partial statuses and the Android-first/iOS-metadata boundary explicit.

## 0.2.0 — 2026-10-20

- Analyze compatible base/split APK directories and unambiguous `.apks`/`.xapk` archives together with JADX. Record per-part identities/hashes and retain each part's decoded resources. Refuse ambiguous bundletool variants and mismatched sets.
- Add optional Apktool resource/smali decoding, native ELF/APK-member Ghidra pseudocode and function reports.
- Add ADB device/package listing, base/split APK pulling and bounded logcat capture.
- Add Frida process listing and bounded explicit-PID captures with a saved user script snapshot.
- Bound subprocess output, deadlines, cancellation and process-tree cleanup; apply a ten-minute deadline to full JADX export.
- Document optional setup, exact CLI scope, outputs and verification limits. These integrations do not automatically extend the upstream JADX MCP server.


## 0.1.0 — 2026-10-20

Initial public release of AppUnpack.

- Export decompiled Java, decoded resources, manifest, evidence and a readable report from a local APK.
- Inspect classes, methods, string resources and cross-references with the JADX headless engine.
- Connect coding agents through a local stdio MCP server and print configuration for the checkout.
- Inventory iOS IPA archive and bundle metadata with Python; no executable decompilation or decryption.
- Verify the pinned engine's SHA-256, preserve export warnings and refuse existing output directories.
- Include a Windows PowerShell launcher, illustrated guides, a project website and Windows/Ubuntu CI.

Node.js 24.11 or newer and a Java 17 or newer JDK are required for APK export. Python 3.10 or newer is optional for IPA metadata. Source release archives exclude runtimes, the engine JAR and target applications.

Three real APK fixtures produced useful but partial exports. See [verification](docs/testing.md) for exact checks and limitations. Decompiled code is not guaranteed complete, original or buildable.
