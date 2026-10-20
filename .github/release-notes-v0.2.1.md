# AppUnpack v0.2.1

This Android-first launch update fixes a compatibility issue found while checking production apps and adds reproducible split/device validation. iOS support remains IPA metadata inspection.

## Fixed

Native library listing and selected extraction now accept APK resources whose names differ only by case, such as `res/2F.xml` and `res/2f.xml`. Production minified APKs exposed the false rejection. Split preparation also accepts these names inside opaque APK snapshots. Exact duplicate entries and unsafe whole-archive extraction collisions remain rejected.

## Checked

- 35 Node tests and 24 Python tests passed.
- Official Jellyfin 2.7.3 production AAB payloads were converted with verified Google bundletool into base, x86_64 and xxhdpi splits. The actual CLI recovered code/resources, preserved native hashes and passed an install/pull/hash/analysis emulator round trip. These are locally generated/signed release-derived APKs, not Google Play-delivered APKs.
- Actual Android Frida listing/attachment passed on an isolated Android 16/API 36 x86_64 emulator using matching server/core 17.24.3. The bounded observation captured Linux/x64 identity, Java availability and ART/libc modules.
- Official minified NetGuard 2.337 and Mullvad 2026.12 APKs produced useful partial Java/resource exports. Ghidra recovered 305 internal functions from NetGuard's stripped ARM64 library with no reported function failures. Mullvad's larger native library returned a partial result: 4,998 decompiled functions, two timeouts and the 5,000-function export cap reached.
- Added opt-in regressions for real split payloads and Android Frida, and a separate real JADX integration workflow on Ubuntu.

See the [full verification record](https://github.com/samalyxx/appunpack/blob/v0.2.1/docs/testing.md) for versions, hashes, commands, error counts and remaining gaps.

## Install

Extract `appunpack-v0.2.1.zip` into a new folder, or update a clean [source checkout](https://github.com/samalyxx/appunpack), then:

```sh
npm ci
node bin/appunpack.mjs install-tools
node bin/appunpack.mjs doctor
node bin/appunpack.mjs /path/to/Example.apk
```

Basic export requires Node.js 24.11+, npm and a Java 17+ JDK with compiler modules. Optional Python, Apktool, Ghidra, ADB and Frida need the separate [extended setup](https://github.com/samalyxx/appunpack/blob/v0.2.1/docs/android-workflows.md). Source ZIP/tgz downloads exclude runtimes, external tools, targets and captures; `SHA256SUMS.txt` covers the archives. No npm registry package is published.

Production Java exports remain partial. Physical devices, ARM64 Frida/Gadget, Google Play delivery, production dynamic feature modules and iOS executable recovery remain unverified. Recovery does not guarantee original/buildable source or include backend code.
