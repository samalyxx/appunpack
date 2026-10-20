# Architecture

APK Lens has two small analysis paths:

```text
APK CLI -> MCP client SDK -> Java JADX headless engine -> observations/report
AI client -> stdio -> Java JADX headless engine -> Android tool responses
IPA CLI -> Python standard library -> ZIP/plist inventory/report
```

The Node.js CLI validates its arguments, selects installed runtimes and tools, invokes the engine and writes reports. Android analysis delegates directly to the installed headless engine rather than implementing a second DEX parser or decompiler. Java runs with an explicit argument vector. The tool installer checks the downloaded release JAR's SHA-256.

The IPA workflow is independent of JADX. It uses Python's standard library for static archive and plist inspection; it does not run Apple binaries or claim native source recovery.

The npm lockfile pins the JavaScript dependency graph. The engine JAR has a separate version and digest. Neither identity check establishes the safety of a target APK or the completeness of decompiled output. Keep the raw engine observations and analysis limitations alongside the readable report.
