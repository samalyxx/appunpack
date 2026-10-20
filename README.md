# APK Lens

**Inspect Android APKs from your computer or AI coding agent. Save the evidence behind the answer.**

APK Lens connects directly to the [JADX headless engine](https://github.com/1013503897/jadx-headless-mcp) for package inspection, class search, decompiled source, methods, references and string resources. It adds a local CLI, saved reports and an APK analysis skill. A separate Python standard-library workflow provides initial iOS IPA inventory.

[Installation](docs/installation.md) · [Commands](docs/usage.md) · [AI agents](docs/agents.md) · [Android and iOS research](docs/mobile-tooling-research.md) · [Testing](docs/testing.md) · [Security](SECURITY.md)

## Why run it on a computer?

Desktop analysis gives the Java engine more memory, an isolated workspace and access to coding agents. Static APK analysis does not require installing or launching the app. Runtime investigation on a test phone or emulator can follow when a question needs observed behavior.

## Quick start

Install Git, Node.js 24.11 or newer, npm and Java 17 or newer. Then:

```sh
git clone https://github.com/samalyxx/apk-lens.git
cd apk-lens
npm ci
node bin/apk-lens.mjs install-tools
node bin/apk-lens.mjs doctor
node bin/apk-lens.mjs analyze ./Example.apk --output ./reports/example
```

If Java is not on `PATH`, set `JAVA_HOME` to your existing Java installation. The default JAR is stored in the checkout's `.tools` directory. See [installation](docs/installation.md) for PowerShell examples, custom tool paths and optional Python setup.

The new report directory contains:

| File | Contents |
| --- | --- |
| `report.md` | Readable package summary and limitations |
| `evidence.json` | Collected engine responses and artifact identity |
| `manifest.xml` | Manifest XML returned by JADX |

## Follow the code

```sh
node bin/apk-lens.mjs classes ./Example.apk MainActivity
node bin/apk-lens.mjs class ./Example.apk com.example.MainActivity
node bin/apk-lens.mjs source ./Example.apk com.example.MainActivity
node bin/apk-lens.mjs method ./Example.apk com.example.MainActivity onCreate
node bin/apk-lens.mjs references ./Example.apk com.example.MainActivity --method-name onCreate
node bin/apk-lens.mjs resources ./Example.apk --query title
```

Use the class result to select an overloaded method. [Command details](docs/usage.md) explain results and limits.

## Connect your AI agent

```sh
node bin/apk-lens.mjs mcp-config
```

Review the printed configuration and add it to your client's MCP settings. The server launches the Android JADX engine directly over stdio. The [APK analysis skill](skills/apk-analysis/SKILL.md) gives an agent a focused investigation workflow. See [agent setup](docs/agents.md) for Codex and generic clients.

Example prompt:

> Inspect this APK's manifest, find the implementation behind its search screen, then trace the relevant classes, methods and callers. Include the APK hash, evidence and limits. Separate observed facts from inferences.

## Initial iOS support

With Python 3.10 or newer installed:

```sh
node bin/apk-lens.mjs ipa ./Example.ipa --output ./reports/ios-example
```

This workflow inventories the IPA archive and bundle metadata. Executable decompilation, FairPlay decryption and iOS runtime analysis are outside its scope. See [IPA usage](docs/usage.md#inspect-an-ipa).

## What the results mean

- Decompiled Java is a derived view. It does not recover the original Kotlin/Java project or guarantee a buildable reconstruction.
- Static references and manifest declarations do not establish runtime calls or vulnerability exploitability.
- Reports do not validate APK/IPA signatures or certify an application as safe.
- Obfuscation, missing splits, native code and engine limits can leave gaps. This version does not merge split APKs or analyze AABs as complete applications.
- Java processes target files with your user permissions. Use an isolated environment for unfamiliar APKs.
- Processing is local. A cloud AI client can receive the tool output it requests under that client's own data policy.

The implementation is [MIT licensed](LICENSE). JADX, jadx-headless-mcp, the MCP SDK and other dependencies retain their own licenses. See [third-party notices](THIRD_PARTY_NOTICES.md).
