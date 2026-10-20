# Changelog

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
