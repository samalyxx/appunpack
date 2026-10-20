# Verification

Run the dependency-free Python checks and Node unit tests from the checkout:

```sh
npm ci
npm test
npm run test:python
```

The unit checks cover argument handling, environment selection, report escaping, no-overwrite behavior, download integrity and cleanup. Python checks build their own IPA/APK/split fixtures and exercise archive/path/metadata limits. They do not run an iOS application. The separate `Real Android checks` GitHub workflow downloads the fixed public ApiDemos APK and pinned JADX engine, verifies their hashes and runs the three APK and two split integration workflows on Ubuntu. Device/Frida and production-fixture checks remain opt-in.

## Real Android fixture

Use the public [Appium ApiDemos 6.0.18 APK](https://github.com/appium/android-apidemos/releases/download/v6.0.18/ApiDemos-debug.apk). Verify SHA-256 before using it:

```text
a9eecf37b26cd084855c530db81c2bb1b91f4c1b095a04f47aa7c20e2791f686
```

With a Java JDK and the verified JADX engine selected, set these in PowerShell:

```powershell
$env:APPUNPACK_TEST_APK = 'C:\fixtures\ApiDemos-debug.apk'
$env:APPUNPACK_JADX_JAR = (Resolve-Path '.tools\jadx-headless-mcp-0.7.1-all.jar').Path
$env:APPUNPACK_HEAP_MIB = '1024'
npm run test:integration
```

On macOS/Linux, use equivalent `export NAME=value` assignments. Integration tests skip when the fixture or JAR environment variable is absent; a skipped test is not a verification pass. The fixture's [source and license](https://github.com/appium/android-apidemos/tree/3e716ee04ef3390284bfab761e28da8c15c08143) remain upstream. Target APKs and downloaded tools are excluded from this repository.

The real workflows inspect app declarations, export source/resources from a bare APK argument, preserve export status and diagnostics, search classes, inspect methods/references and connect through the public stdio MCP command. They use a filename containing spaces and shell metacharacters, check unchanged input digests, refuse overwriting through both the default and explicit output forms, and verify MCP process shutdown.

## Checked for version 0.1.0

On Windows x64 with Node 24.19.0, Java 21.0.6 and Python 3.12.6:

- 18 Node unit tests passed.
- 3 real Android integration workflows passed with the fixed ApiDemos fixture and verified JADX 0.7.1 JAR, including the full-export check.
- 9 synthetic IPA/parser tests passed.
- The sample report retained a 155,809-character manifest ending in `</manifest>`, and reported 2,876 classes and 869 resources.
- Full export produced `ApiDemos.java`, decoded `AndroidManifest.xml`, `decompiled/export.json` and `decompile.log`. The export reported 2,876 classes, 869 resources, 88 errors and 10 warnings, so its status was `partial`. Useful files do not establish complete decompilation.
- The embedded JADX API reported its version as `dev`. The pinned headless release version and verified JAR digest identify the engine artifact; the API string is retained as reported.
- The Windows PowerShell launcher passed its readiness check. APK paths containing spaces and shell metacharacters reached analysis as literal arguments, and existing analysis output stayed intact.
- The terminal prints the export's completion status and error/warning counts; the full-export integration check verifies this and an actual `onCreate` body containing `getIntent()`.
- Package inspection excluded target files, JARs, dependencies and Python bytecode caches.

## Independent APK checks on 2026-10-20

Two additional public fixtures from [Androguard commit 3ea3da3](https://github.com/androguard/androguard/tree/3ea3da38e74b4d74579463d0688ab513786c4750/tests/data) were downloaded, checked against their Git blob identities, and processed with the Windows launcher. The APKs were not installed or launched. Source/resource files, decoded manifest package names, retained input hashes and partial statuses were inspected.

| APK | Package | Engine class/resource counts | Errors / warnings | Result |
| --- | --- | --- | --- | --- |
| [TestActivity.apk](https://github.com/androguard/androguard/blob/3ea3da38e74b4d74579463d0688ab513786c4750/tests/data/APK/TestActivity.apk) | `tests.androguard` | 134 / 10 | 0 / 6 | Source, resources and report saved; partial |
| [AndroguardTest debug APK](https://github.com/androguard/androguard/blob/3ea3da38e74b4d74579463d0688ab513786c4750/tests/data/AndroguardTest/app/build/outputs/apk/debug/app-debug.apk) | `androguard.test` | 2,779 / 758 | 75 / 13 | Source, resources and report saved; partial |

Engine counts describe its class/resource entries, not the number of exported files. The ApiDemos export contained 2,860 Java files and 978 resource files; one resource-table entry can produce multiple files. Thirty-two of its Java files contained decompilation failure markers.

Fixture SHA-256 values:

```text
TestActivity.apk
3bb32dd50129690bce850124ea120aa334e708eaa7987cf2329fd1ea0467a0eb

AndroguardTest-debug.apk
04aaaaf1c2d5471fe69736e098fcb3c6204d92fb228e107d2230c51274341662
```

The source-backed fixture's recovered `androguard.test.Eratosthene.eratosthenes(int)` was compared with its [upstream source](https://github.com/androguard/androguard/blob/3ea3da38e74b4d74579463d0688ab513786c4750/tests/data/AndroguardTest/app/src/main/java/androguard/test/Eratosthene.java). It retained the sieve algorithm, `Math.sqrt`, array operations and return value, with reconstructed variable names/control flow. After reading both pure array/math implementations, only these classes and a small harness were compiled in separate folders. For inputs 2, 3, 10, 30, 100 and 1,000, the original and recovered methods returned the same primes and matched an independent trial-division check. This spot check does not establish correctness of every recovered method or run the Android application.

Uber's APK was not supplied or tested. At that stage, Linux/macOS real-engine behavior, physical devices, live iOS apps, signature validation and executable decryption were not verified. The CI unit/parser matrix covers Windows and Ubuntu; CI does not install or launch a target application.

## Extended Android checks for 0.2.0

On Windows x64 with Node 24.19.0, Java 21.0.6 and Python 3.12.6:

- 35 Node unit/adapter/process tests and 22 Python parser/archive tests passed. These include explicit device/PID validation, literal tool arguments, exclusive outputs, output budgets, cancellation, process-tree cleanup, ELF headers and native/split ZIP boundaries. The three original real-APK integration workflows also passed again with these changes.
- Two actual pinned-JADX split integration tests passed: manifest identity/dependency rejection and multi-part resource export, including separate base/feature manifests. A synthetic two-part set containing real `TestActivity` and `AndroguardTest` DEX payloads recovered 149 Java files with 0 errors and 6 warnings. Both `tests.androguard.TestActivity` and `androguard.test.Eratosthene` were present. This was synthetic split packaging, not a genuine Play Store installation set.
- Apktool 3.0.3 decoded the fixed `TestActivity.apk` above, producing 340 smali files, 5 XML files and 3 PNG files. `AndroidManifest.xml` and `apktool.yml` were retained. The JAR SHA-256 was `dbf930b076c6b9be08d57c449cacefc3bdd6b71ebd59b3066fc0e1f5b14f9423`.
- Ghidra 11.4.3 analyzed a known-source ARM64 ELF built from [tests/fixtures/native.c](../tests/fixtures/native.c) with Android NDK 27.1 clang. Both functions decompiled with zero failures; the recovered `appunpack_score` retained `x * 7 + 3`. Direct `.so` analysis and selected `lib/arm64-v8a/libfixture.so` extraction from a synthetic APK both passed. The compiled ELF SHA-256 was `61f0e1cc2d9218081d72fbef419ee3309bb395290a1165f0cd3fe6f55a2ddbd4`. The official Ghidra distribution ZIP was verified as `b22a8baebb14339f19903c54363ba7e01781930cc43ab430539aabce0d58547a`.
- ADB 36.0.0 listed a hidden read-only Android API 36 emulator, listed its packages, pulled the installed public ApiDemos APK and captured two seconds of logs. The pulled APK matched the original `a9eecf...1f686` digest above. The pulled directory was then analyzed successfully through `splits`, retaining the expected partial export status (88 errors, 10 warnings). Only the test fixture was installed; the commands did not launch it.
- Frida tools 14.11.0/core 17.24.3 listed and attached to a new benign Node process on the Windows host. A two-second script captured its PID, platform, architecture and module names, with exit code 0 and retained script/capture evidence. The test process was terminated afterward. This verifies the adapter and host attachment, not Android Frida server/Gadget compatibility.

To reproduce the real external-tool tests, install the optional tools from [extended setup](android-workflows.md), then select the existing fixtures. For example in PowerShell:

```powershell
$env:APPUNPACK_TEST_APK = 'C:\fixtures\ApiDemos-debug.apk'
$env:APPUNPACK_JADX_JAR = (Resolve-Path '.tools\jadx-headless-mcp-0.7.1-all.jar').Path
$env:APPUNPACK_APKTOOL_JAR = 'C:\Tools\apktool_3.0.3.jar'
$env:GHIDRA_HOME = 'C:\Tools\ghidra_11.4.3_PUBLIC'
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:APPUNPACK_NATIVE_FIXTURE = 'C:\fixtures\libfixture.so'
npm run test:integration
```

Compile the native fixture using your Android NDK's `clang` with an ARM64 target, `-shared -fPIC -nostdlib -O1`. A different compiler version can change its digest and pseudocode; the test checks function identities and the known arithmetic. Missing environment variables cause relevant integration tests to skip; a skip is not a pass.

At the 0.2.0 release, genuine Play Store split sets, physical-device transfers, Android Frida attachment, macOS/Linux external engines and complex production native libraries remained unverified. The following launch checks extend that record. Optional integrations remain CLI-only; the upstream JADX MCP server's tool set is unchanged. Full reconstruction, signatures, device targeting and backend recovery are not established by these checks.

## Android launch checks for 0.2.1

Checked on 2026-10-21 (Pakistan time), using the same Windows/Node/Java/Python/JADX versions above. The complete unit suites passed 35 Node and 24 Python tests. The added regressions distinguish exact duplicate ZIP entries from valid case-distinct resource names: native inventory, selected extraction and opaque split copying accept the latter; whole-archive decoding retains its collision guard.

### Release-derived split APKs and device transfer

The official [Jellyfin Android 2.7.3 release](https://github.com/jellyfin/jellyfin-android/releases/tag/v2.7.3) supplies a production `jellyfin-android-v2.7.3-libre-release.aab`. Its GitHub release-asset digest was verified before use. Verified [Google bundletool 1.18.3](https://github.com/google/bundletool/releases/tag/1.18.3) selected a real base/ABI/density set for Android API 36, x86_64, density 420 and locale en-US. A temporary local test key signed the generated APKs. These are official production payloads transformed locally, **not APKs delivered by Google Play or signed with Jellyfin's release key**.

```text
Jellyfin release AAB SHA-256
4fe43ff6ea10714271829a640749d80752ee4fd7de444a1e73436f752928900b

bundletool-all-1.18.3.jar SHA-256
a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29
```

The selected set contained:

- `base-master.apk`: compiled binary manifest/resource table and two DEX files.
- `base-x86_64.apk`: two actual JNI libraries, including `libffmpegJNI.so`.
- `base-xxhdpi.apk`: compiled resource table and 55 density-specific resource entries.

The public `splits` command checked package `org.jellyfin.mobile`, version 2.7.3/code 2070399 and all three split identities. It produced 7,101 Java files, 844 combined resource files and 850 per-part resource files. The engine reported 7,106 classes, 542 resource entries, 124 errors and 239 warnings: **partial**. Checks found `MainActivity`, the Jellyfin app-name string, separate split manifests, density resources and unchanged native payload hashes. For example, retained `libffmpegJNI.so` matched `d991ed496c82664ff5bf5d44427d70f31ec6399a3300f00235be8f072c03447e`.

The three generated APKs were installed together on an isolated read-only Android 16/API 36 x86_64 emulator. Jellyfin was not launched or connected to a server. AppUnpack's `pull` command copied all three package-manager paths. Every pulled APK matched its original SHA-256, and analyzing the pulled directory again produced 7,106 classes/542 resource entries with 124 errors/235 warnings. Warning counts varied between runs; the partial status remained visible. The emulator and temporary runtime helpers were stopped after verification.

To reproduce with your own test key and the verified release assets:

```sh
java -jar bundletool-all-1.18.3.jar get-device-spec --device-id=SERIAL --output=device.json
java -jar bundletool-all-1.18.3.jar build-apks --bundle=jellyfin-android-v2.7.3-libre-release.aab --output=jellyfin.apks --device-spec=device.json --ks=YOUR_TEST_KEYSTORE --ks-key-alias=YOUR_ALIAS
java -jar bundletool-all-1.18.3.jar extract-apks --apks=jellyfin.apks --device-spec=device.json --output-dir=selected
```

Select a device specification with the ABI/density above for the fixed regression. Supply keystore passwords through bundletool's normal local prompt; do not commit a key or credentials. Then in PowerShell:

```powershell
$env:APPUNPACK_REAL_SPLITS = 'C:\fixtures\selected'
$env:APPUNPACK_JADX_JAR = (Resolve-Path '.tools\jadx-headless-mcp-0.7.1-all.jar').Path
$env:APPUNPACK_HEAP_MIB = '2048'
node --test tests/integration/real-splits.test.mjs
```

That opt-in regression passed through the public CLI, including code, string, ABI payload hash, density resources, unchanged originals and refusal to overwrite evidence. Exact generated APK digests can differ with the local signing key. Jellyfin uses the base module plus configuration splits; real dynamic feature modules remain unverified. Synthetic feature tests exercise dependency checks, not every production feature topology.

### Android Frida attachment

Frida tools 14.11.0 and matching core/server 17.24.3 were checked on the same disposable Google APIs emulator, a rooted `userdebug` image. The official [Frida Android x86_64 server](https://github.com/frida/frida/releases/tag/17.24.3) archive was verified against GitHub's asset digest:

```text
frida-server-17.24.3-android-x86_64.xz SHA-256
44aead87103ab9738771e5eff659640fb6bf566fe83b8629444c1be99f87ce68
```

Only the public ApiDemos fixture was launched for attachment. AppUnpack's `frida-ps` found the current Android PID; `trace` ran a minimal identity/module observation script for three seconds and exited 0. Captured observations included `platform: linux`, `arch: x64`, `Java.available: true`, `libc.so` and `libart.so`. The script snapshot hash matched the supplied script. A second two-second run through the new opt-in public-CLI regression also passed, including no-overwrite behavior.

After configuring a test emulator/server using [Frida's official Android guide](https://frida.re/docs/android/) and intentionally launching your test app:

```powershell
$env:APPUNPACK_TEST_FRIDA_DEVICE = 'emulator-5554'
$env:APPUNPACK_TEST_FRIDA_PID = 'CURRENT_TEST_APP_PID'
$env:APPUNPACK_FRIDA = 'C:\path\to\frida.exe'
$env:APPUNPACK_FRIDA_PS = 'C:\path\to\frida-ps.exe'
node --test tests/integration/device.test.mjs
```

This test executes a supplied observation script in the selected process. It requires a running authorized Android process with ART and Frida already available; it does not set up root/server/Gadget. Physical devices, ARM64 runtime attachment, Frida Gadget and application-specific hooks remain unverified.

### Obfuscated production APKs and native libraries

Official GitHub assets from [NetGuard 2.337](https://github.com/M66B/NetGuard/releases/tag/2.337) and [Mullvad Android 2026.12](https://github.com/mullvad/mullvadvpn-app/releases/tag/android/2026.12) were downloaded and verified against GitHub's asset SHA-256 digests. Their tagged build files enable release minification: [NetGuard build configuration](https://github.com/M66B/NetGuard/blob/2.337/app/build.gradle) and [Mullvad build configuration](https://github.com/mullvad/mullvadvpn-app/blob/android/2026.12/android/app/build.gradle.kts). Neither APK was installed or executed for these static checks.

| Official APK | SHA-256 | Java files / resource files | Engine errors / warnings |
| --- | --- | --- | --- |
| NetGuard 2.337, 3,222,200 bytes | `150a0362f04408c2d3cc7fb38d7e126445019d523489c8d82df6fb456c4e6ad2` | 2,203 / 1,004 | 8 / 28; partial |
| Mullvad 2026.12, 39,008,494 bytes | `0ad70b89b2b48bb0b1ae29115eee57d75277ffeccf95a0d3db98945d740a6d9e` | 7,868 / 789 | 148 / 359; partial |

The NetGuard and Mullvad outputs contained decompilation-failure markers in 11 and 136 Java files respectively. File counts are useful inventory, not a recovery percentage or proof of behavioral correctness. Native member listing initially rejected case-distinct obfuscated resource paths such as `res/2F.xml` and `res/2f.xml`; 0.2.1 fixes that false rejection for workflows that write only an exact selected member or preserve the APK as an opaque snapshot. Exact duplicate members remain rejected.

Ghidra 11.4.3 analyzed NetGuard's stripped ARM64 `lib/arm64-v8a/libnetguard.so` (86,704 bytes, SHA-256 `54de884e4e58396d807ba34fbca5915623a088152f58e7d53d386153bef04be3`). All 305 selected internal functions decompiled with zero reported failures, status `complete_within_limits`. `JNI_OnLoad` and JNI entry points were present in the pseudocode. The ELF had no normal symbol table or debug sections. This checks a real stripped native library; it does not establish that every pseudocode statement is correct.

Mullvad's stripped ARM64 `lib/arm64-v8a/libmullvad_jni.so` was substantially larger (14,250,128 bytes, SHA-256 `f061f3a02079cc02b2eb7cc2c4f374923c27ea32d928d61bf12d244e845510d7`). Ghidra detected 22,030 functions and reached the 5,000-function export cap: 4,998 decompiled and two timed out. The resulting 11,460,359-byte pseudocode file and function report retained status `partial`. Auto-analysis also logged its cooperative timeout; that phase returned after approximately 308 seconds despite the requested 180-second limit. The complete command finished within the separate ten-minute process deadline. This demonstrates bounded partial output for a complex production library, not complete native recovery.

The Android launch is intentionally Android-first. iOS remains IPA archive/plist metadata inspection. Google Play delivery, real dynamic-feature sets, physical-device behavior and iOS executable recovery are outside the verified scope.
