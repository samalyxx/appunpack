# AppUnpack v0.2.0

AppUnpack now analyzes compatible base/split APK sets and adds optional smali, native-library and device workflows. A single APK still starts the local JADX source/resource export.

## Install or update

Download `appunpack-v0.2.0.zip` and extract it into a new directory, or update a clean clone of [samalyxx/appunpack](https://github.com/samalyxx/appunpack). In the project directory:

```sh
npm ci
node bin/appunpack.mjs install-tools
node bin/appunpack.mjs doctor
node bin/appunpack.mjs /path/to/Example.apk
```

Requirements for basic APK export: Node.js 24.11 or newer, npm and a Java 17 or newer **JDK with compiler modules**. Python 3.10 or newer is needed for split preparation and APK native-library extraction. Apktool, Ghidra, Android Platform Tools and Frida require separate installation and configuration; see [extended Android setup](https://github.com/samalyxx/appunpack/blob/v0.2.0/docs/android-workflows.md). Ghidra must use a JDK supported by its installed version.

The ZIP contains project source. It excludes runtimes, external analysis tools, installed dependencies, target apps and captured data. The release also includes `samalyxx-appunpack-0.2.0.tgz` and `SHA256SUMS.txt`. No AppUnpack package is published to the npm registry.

## Added

- `splits`: analyze a compatible APK directory or unambiguous `.apks`/`.xapk` collection together. Save per-part hashes, validate package/version/dependency identities, and retain each part's decoded resources. Variant-bearing bundletool archives require device-specific extraction first.
- `decode`: use Apktool to save smali and decoded resources with logs and a hashed report.
- `native-libs` / `native`: select an APK library or supply an ELF `.so`, then use Ghidra to save pseudocode, function metadata, logs and a project.
- `devices`, `packages`, `pull`, `logcat`: select an ADB device, copy its base/split APKs, and capture bounded logs.
- `frida-ps` / `trace`: select a Frida device and running PID, then capture a supplied script for a bounded duration.
- Shared subprocess deadlines, output limits and process-tree cleanup. Existing evidence directories remain protected from overwrite.

These additions are CLI workflows. The upstream JADX MCP server's tools are unchanged. iOS support remains static IPA metadata inspection.

## Verification

35 Node tests, 22 Python tests, five real JADX integration workflows and two real Apktool/Ghidra integration workflows passed on Windows. Apktool recovered 340 smali files from a public fixture; Ghidra recovered both functions from a known-source ARM64 fixture. A read-only Android emulator check pulled a public APK, verified its hash, captured logs and analyzed the pulled package. A separate Frida host check attached to a benign test process. See the [verification record](https://github.com/samalyxx/appunpack/blob/v0.2.0/docs/testing.md) for exact artifacts and limitations.

Genuine Play Store split sets, Android Frida attachment, physical-device transfers and complex production native libraries remain unverified. Recovered code can be partial or inaccurate; this release does not reconstruct backend code, guarantee a buildable original project, create an installable merged APK or validate signatures.

AppUnpack is MIT licensed. External tools retain their own terms in [third-party notices](https://github.com/samalyxx/appunpack/blob/v0.2.0/THIRD_PARTY_NOTICES.md).
