# Commands and evidence

Run from the checkout with `node bin/appunpack.mjs`, or use `appunpack` after `npm link`. Quote paths containing spaces.

| Command | Purpose |
| --- | --- |
| `APK [--output NEW_DIRECTORY]` | Export decompiled code/resources and save a report; defaults to a sibling `NAME-analysis` directory |
| `install-tools [DIRECTORY]` | Download and verify the pinned engine JAR |
| `doctor` | Check Java and JADX engine readiness |
| `analyze APK [--output NEW_DIRECTORY]` | The same full APK export with an explicit command name |
| `splits SET --output NEW_DIRECTORY` | Combined analysis of compatible base/split APKs |
| `decode APK --output NEW_DIRECTORY` | Apktool resource and smali output |
| `native-libs APK` | List exact native library member paths |
| `native LIB.so --output NEW_DIRECTORY` | Ghidra pseudocode and function report |
| `native APK --library MEMBER --output NEW_DIRECTORY` | Extract and analyze a selected native library |
| `devices` / `packages --device SERIAL` | ADB device/package listing |
| `pull PACKAGE --device SERIAL --output NEW_DIRECTORY` | Copy base and split APKs from a device |
| `logcat --device SERIAL --seconds N --output NEW_DIRECTORY` | Bounded device log capture |
| `frida-ps --device ID` | List Frida processes |
| `trace PID SCRIPT.js --device ID --seconds N --output NEW_DIRECTORY` | Frida attach with a supplied script |
| `inspect APK` | Inspect package and manifest metadata |
| `classes APK QUERY` | Search class names |
| `class APK FQCN` | Inspect one fully qualified class and its members |
| `source APK FQCN` | Request a class's decompiled source |
| `method APK FQCN METHOD [--overload-index N]` | Select and inspect a method |
| `references APK FQCN [--method-name NAME]` | Find incoming class or method references |
| `resources APK [--query FILTER]` | Inspect string resources through JADX |
| `ipa PATH --output NEW_DIRECTORY` | Save a static IPA archive/bundle report using Python |
| `mcp` | Start the Android engine's stdio MCP server |
| `mcp-config` | Print an MCP configuration using this checkout |
| `--help` | Show command help |

Inspection results are JSON by default; `--json` is accepted explicitly for those commands. APK export and `ipa` write files to their destination instead. `ipa` still requires `--output`.

## Give it an APK

```sh
node bin/appunpack.mjs ./Uber.apk
```

This creates `Uber-analysis` beside the input file. On Windows you can use `.\appunpack.ps1 'C:\Apps\Uber.apk'`. The input must be an actual APK file; an app name such as `Uber` or a Play Store URL is not a package.

The output contains `report.md`, `evidence.json`, `manifest.xml`, `decompiled/sources/`, `decompiled/resources/`, `decompiled/export.json` and `decompile.log`. Start with the report and export status, then browse the Java files and decoded resources. Warnings and export errors can mean partial output even when useful files were retained.

Full APK and split exports disable JADX's `finally`-block reconstruction to avoid excessive memory use on complex exception paths. `export.json` and `evidence.json` record `extract_finally: false`; cleanup code may remain duplicated in the reconstructed Java. Class/method queries and MCP use the upstream engine's separate configuration. This setting does not guarantee complete or behaviorally equivalent recovery.

To choose a destination:

```sh
node bin/appunpack.mjs analyze ./Uber.apk --output ./reports/uber
```

Both forms require a new destination and refuse to overwrite an existing one. A failed attempt may leave diagnostic or partial files; use a new destination to retry. Keep collected observations and logs with the report. Target files and analysis output can be confidential; keep them out of public commits.

A Play-installed app may consist of a base APK and additional split APKs. One exported file may omit code or resources required for the complete app. Use `splits` for a compatible base/split set or unambiguous `.apks`/`.xapk` collection. Variant-bearing bundletool archives need device-specific extraction first. This creates combined analysis output, not an installable merged APK, and does not turn an AAB into a complete application. See [extended Android workflows](android-workflows.md). Decompiled output cannot recover the app's servers, private backend logic or original source project.

A manifest reports declarations. A requested permission does not establish that an app exercises that capability. An exported component is a lead for investigation, not an exploitability verdict.

## Trace a feature

```sh
node bin/appunpack.mjs classes ./Example.apk Search
node bin/appunpack.mjs class ./Example.apk com.example.SearchActivity
node bin/appunpack.mjs source ./Example.apk com.example.SearchActivity
node bin/appunpack.mjs method ./Example.apk com.example.SearchActivity search --overload-index 1
node bin/appunpack.mjs references ./Example.apk com.example.SearchActivity --method-name search
```

Select an overload from the current class result. Indices depend on the current artifact and engine; do not reuse them blindly across builds. Decompiled source can be incomplete or fail for individual methods. Static incoming references do not reveal all reflection, dynamic loading, native calls or runtime dispatch.

## Inspect string resources

```sh
node bin/appunpack.mjs resources ./Example.apk --query title
```

This command requests string-resource data from JADX. It does not rebuild or sign an APK and does not promise a complete resource-table reconstruction. Missing resource results remain unknown until checked against the artifact or a separate decoder.

## Inspect an IPA

```sh
node bin/appunpack.mjs ipa ./Example.ipa --output ./reports/ios-example
```

Python 3.10 or newer is required. This separate workflow writes `evidence.json` and `report.md` with the IPA SHA-256, archive totals, application/extension plist declarations and observed framework paths. It does not extract or launch the application. Plist declarations can include bundle identifiers, version, minimum OS, URL schemes and usage descriptions; malformed or unavailable values remain unknown.

The inspector refuses ZIP64, multi-disk and unsupported archive layouts. It bounds the central directory at 16 MiB and plist reads at 2 MiB per file and 8 MiB in total. Preserve warnings and partial metadata when interpreting the report. Framework paths do not prove that a library is linked or loaded.

IPA inventory does not verify code signatures, decrypt executable ranges, recover Swift/Objective-C source or provide runtime observations. Native analysis needs suitable external tools and usable executable bytes. An arbitrary device IPA is not a Simulator build. See the [mobile tooling research](mobile-tooling-research.md) for the Android/iOS tool choices and their host requirements.

## Preserve uncertainty

Record the exact artifact SHA-256 and engine/tool identity with each conclusion. Separate returned data from your own interpretation. Empty results, missing Java bodies, truncation and tool errors are gaps to explain. A readable report is a starting point for investigation, not a certification that an app is secure or fully understood.
