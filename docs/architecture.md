# Architecture

AppUnpack has these analysis paths:

```text
APK export -> Java source launcher + Export.java -> pinned JADX JAR API -> sources/resources
APK inspection -> MCP client SDK -> Java JADX headless engine -> observations/report
AI client -> stdio -> Java JADX headless engine -> Android tool responses
IPA CLI -> Python standard library -> ZIP/plist inventory/report
Split CLI -> Python guarded copy -> manifest identities -> multi-input JADX + per-part resources
Decode CLI -> Python APK preflight -> separately installed Apktool -> smali/resources
Native CLI -> optional guarded APK member extraction -> Ghidra headless -> pseudocode/functions
Device/runtime CLI -> explicit ADB serial or Frida device/PID -> bounded logs/captures
```

The Node.js CLI validates its arguments, selects installed runtimes and tools, invokes the engine and writes reports. A bare APK path uses the same full export as `analyze`. It creates an exclusive destination beside the APK unless `--output` is given. `src/Export.java` calls JADX's API from the same pinned JAR to save decompiled sources, decoded resources and export status. This needs Java's compiler module; inspection and MCP need only the engine runtime.

Android analysis delegates to JADX rather than implementing another DEX parser or decompiler. Java runs with an explicit argument vector. The tool installer and engine selection check the release JAR's SHA-256. The PowerShell launcher selects a supported local Node runtime and an existing Java installation before forwarding arguments to the CLI.

The IPA workflow is independent of JADX. It uses Python's standard library for static archive and plist inspection; it does not run Apple binaries or claim native source recovery.

Optional Android integrations use `src/process.mjs` for literal subprocess arguments, output limits, deadlines, signal handling and child-process cleanup. Split analysis copies inputs into its exclusively created output directory before decoding identity and combining them. It preserves each part's decoded resources because combined resource paths may collide. Base declarations remain separate from combined code. The runtime commands select an already available device/process and never start automatically from static analysis. They are CLI workflows; the `mcp` command still exposes the upstream JADX server only.

The npm lockfile pins the JavaScript dependency graph. The engine JAR has a separate version and digest. Neither identity check establishes the safety of a target APK or the completeness of decompiled output. Keep the raw engine observations and analysis limitations alongside the readable report.
