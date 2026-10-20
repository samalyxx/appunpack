# AppUnpack

**Give it an APK. Get decompiled code, decoded resources and a local report.**

AppUnpack runs the [JADX engine](https://github.com/1013503897/jadx-headless-mcp) on your computer. Its default workflow exports an Android APK's decompiled Java and decoded resources, with manifest, evidence and a readable report. You can also inspect individual classes or connect an AI coding agent. A separate Python workflow provides initial iOS IPA inventory.

[Installation](docs/installation.md) · [Commands](docs/usage.md) · [AI agents](docs/agents.md) · [Android and iOS research](docs/mobile-tooling-research.md) · [Testing](docs/testing.md) · [Security](SECURITY.md)

## Why run it on a computer?

Desktop analysis gives the Java engine more memory, an isolated workspace and access to coding agents. Static APK analysis does not require installing or launching the app. Runtime investigation on a test phone or emulator can follow when a question needs observed behavior.

## Quick start

Install Git, Node.js 24.11 or newer, npm and a Java 17 or newer **JDK**. Then:

```sh
git clone https://github.com/samalyxx/appunpack.git
cd appunpack
npm ci
node bin/appunpack.mjs install-tools
node bin/appunpack.mjs doctor
node bin/appunpack.mjs ./Uber.apk
```

Replace `./Uber.apk` with the actual APK file you obtained. AppUnpack does not download an app from its name or a Play Store link. It creates a new `Uber-analysis` directory beside the APK and refuses to overwrite an existing directory.

The export runs locally and does not need an AI account.

On Windows, the included launcher also accepts the file directly:

```powershell
.\appunpack.ps1 'C:\Apps\Uber.apk'
```

The launcher uses `APPUNPACK_NODE`, a portable `.tools/node.exe`, or Node on `PATH`, in that order. It can use Android Studio's bundled Java when `JAVA_HOME` and Java on `PATH` are unavailable. See [installation](docs/installation.md) for runtime setup.

The new report directory contains:

| File | Contents |
| --- | --- |
| `report.md` | Readable package summary and limitations |
| `evidence.json` | Collected engine responses and artifact identity |
| `manifest.xml` | Manifest XML returned by JADX |
| `decompiled/sources/` | Decompiled Java files |
| `decompiled/resources/` | Decoded application resources |
| `decompiled/export.json` | Export counts, errors and completion status |
| `decompile.log` | Export diagnostics; keep this when output is partial |

Open `report.md` first, then browse `decompiled/sources` and `decompiled/resources`. To choose the destination explicitly, use `node bin/appunpack.mjs analyze ./Uber.apk --output ./reports/uber`.

## Follow the code

```sh
node bin/appunpack.mjs classes ./Example.apk MainActivity
node bin/appunpack.mjs class ./Example.apk com.example.MainActivity
node bin/appunpack.mjs source ./Example.apk com.example.MainActivity
node bin/appunpack.mjs method ./Example.apk com.example.MainActivity onCreate
node bin/appunpack.mjs references ./Example.apk com.example.MainActivity --method-name onCreate
node bin/appunpack.mjs resources ./Example.apk --query title
```

Use the class result to select an overloaded method. [Command details](docs/usage.md) explain results and limits.

## Connect your AI agent

```sh
node bin/appunpack.mjs mcp-config
```

Review the printed configuration and add it to your client's MCP settings. The server launches the Android JADX engine directly over stdio. The [APK analysis skill](skills/apk-analysis/SKILL.md) gives an agent a focused investigation workflow. See [agent setup](docs/agents.md) for Codex and generic clients.

Example prompt:

> Inspect this APK's manifest, find the implementation behind its search screen, then trace the relevant classes, methods and callers. Include the APK hash, evidence and limits. Separate observed facts from inferences.

## Initial iOS support

With Python 3.10 or newer installed:

```sh
node bin/appunpack.mjs ipa ./Example.ipa --output ./reports/ios-example
```

This workflow inventories the IPA archive and bundle metadata. Executable decompilation, FairPlay decryption and iOS runtime analysis are outside its scope. See [IPA usage](docs/usage.md#inspect-an-ipa).

## What the results mean

- Decompiled Java is a derived view. It does not recover the original Kotlin/Java project, backend services or a guaranteed buildable reconstruction.
- Static references and manifest declarations do not establish runtime calls or vulnerability exploitability.
- Reports do not validate APK/IPA signatures or certify an application as safe.
- Obfuscation, missing splits, native code and engine limits can leave gaps. This version does not merge split APKs or analyze AABs as complete applications.
- Java processes target files with your user permissions. Use an isolated environment for unfamiliar APKs.
- Processing is local. A cloud AI client can receive the tool output it requests under that client's own data policy.

The implementation is [MIT licensed](LICENSE). JADX, jadx-headless-mcp, the MCP SDK and other dependencies retain their own licenses. See [third-party notices](THIRD_PARTY_NOTICES.md).
