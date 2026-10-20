# Verification

Run the dependency-free IPA checks and Node unit tests from the checkout:

```sh
npm ci
npm test
npm run test:ios
```

The unit checks cover argument handling, environment selection, report escaping, no-overwrite behavior, download integrity and cleanup. Python checks build their own XML/binary-plist IPA fixtures and exercise archive/path/metadata limits. They do not run an iOS application.

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

Uber's APK was not supplied or tested. Linux/macOS real-engine behavior, physical devices, live iOS apps, signature validation and executable decryption were not verified. The CI unit/parser matrix covers Windows and Ubuntu; it does not download or execute a target application.

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

Genuine Play Store split sets, physical-device transfers, Android Frida attachment, macOS/Linux external engines and complex production native libraries remain unverified. Optional integrations are CLI-only; the upstream JADX MCP server's tool set is unchanged. Full reconstruction, signatures, device targeting and backend recovery are not established by these checks.
