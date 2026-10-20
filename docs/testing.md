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
