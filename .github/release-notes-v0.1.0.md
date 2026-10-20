# AppUnpack v0.1.0

The first AppUnpack release turns a local Android APK into decompiled Java, decoded resources, a manifest and an evidence report. Inspect individual classes and methods from the CLI or connect an AI coding agent through MCP.

## Install

Download `appunpack-v0.1.0.zip` and extract it, or clone [samalyxx/appunpack](https://github.com/samalyxx/appunpack). In the extracted project directory:

```sh
npm ci
node bin/appunpack.mjs install-tools
node bin/appunpack.mjs doctor
node bin/appunpack.mjs /path/to/Example.apk
```

On Windows you can also run:

```powershell
.\appunpack.ps1 'C:\Apps\Example.apk'
```

Requirements: Node.js 24.11 or newer, npm and a Java 17 or newer **JDK with compiler modules**. Python 3.10 or newer is optional for IPA metadata inspection. The ZIP contains project source, not Node.js, Java, Python, the engine JAR, installed dependencies or APKs. `install-tools` downloads the pinned engine and verifies its SHA-256.

The release also provides an npm package archive, `samalyxx-appunpack-0.1.0.tgz`, and `SHA256SUMS.txt` for the downloadable artifacts. The ZIP is the recommended source installation. This is a GitHub release; no AppUnpack package is published to the npm registry.

## Included

- A single APK path starts local source/resource export and creates a new analysis directory beside the input.
- CLI commands inspect class summaries, source, methods, references and string resources.
- Reports retain the input identity, engine responses, export counts, warnings and diagnostic log.
- A local stdio MCP server supports coding-agent investigations.
- An optional Python workflow inventories IPA archive and bundle metadata.
- Illustrated documentation and the [AppUnpack website](https://samalyxx.github.io/appunpack/) explain installation, outputs and limitations.

## Verification and limits

The verification record covers 18 Node unit tests, 9 synthetic IPA/parser tests and 3 real Android integration workflows. Three public APK fixtures were exported and inspected; each reported a **partial** result. One recovered algorithm matched its original implementation and an independent check for six inputs. Unit/parser CI runs on Windows and Ubuntu; it does not run target apps. See the [full verification record](https://github.com/samalyxx/appunpack/blob/v0.1.0/docs/testing.md).

Decompilation does not recover backend code or guarantee an exact, complete or buildable original project. Obfuscation, native code, missing split modules and engine errors can leave gaps. iOS support is metadata inspection only. The workflow does not rebuild/sign apps, validate signatures, decrypt executables or perform runtime analysis.

AppUnpack is MIT licensed. Its direct tools and dependencies retain their own terms in [third-party notices](https://github.com/samalyxx/appunpack/blob/v0.1.0/THIRD_PARTY_NOTICES.md).
