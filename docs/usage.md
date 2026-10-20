# Commands and evidence

Run from the checkout with `node bin/apk-lens.mjs`, or use `apk-lens` after `npm link`. Quote paths containing spaces.

| Command | Purpose |
| --- | --- |
| `install-tools [DIRECTORY]` | Download and verify the pinned engine JAR |
| `doctor` | Check Java and JADX engine readiness |
| `analyze APK --output NEW_DIRECTORY` | Save a package report, evidence JSON and decoded manifest |
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

Analysis results are JSON by default; `--json` is accepted explicitly for the inspection commands. `analyze` and `ipa` write their reports to `--output` instead.

## Create an APK report

```sh
node bin/apk-lens.mjs analyze ./Example.apk --output ./reports/example
```

Choose a new destination so previous evidence stays intact. `reports/` is ignored by this repository's Git configuration. The report keeps the collected engine observations in `evidence.json` and the returned manifest in `manifest.xml`. Keep these files with the readable `report.md` when reviewing a finding.

A manifest reports declarations. A requested permission does not establish that an app exercises that capability. An exported component is a lead for investigation, not an exploitability verdict.

## Trace a feature

```sh
node bin/apk-lens.mjs classes ./Example.apk Search
node bin/apk-lens.mjs class ./Example.apk com.example.SearchActivity
node bin/apk-lens.mjs source ./Example.apk com.example.SearchActivity
node bin/apk-lens.mjs method ./Example.apk com.example.SearchActivity search --overload-index 1
node bin/apk-lens.mjs references ./Example.apk com.example.SearchActivity --method-name search
```

Select an overload from the current class result. Indices depend on the current artifact and engine; do not reuse them blindly across builds. Decompiled source can be incomplete or fail for individual methods. Static incoming references do not reveal all reflection, dynamic loading, native calls or runtime dispatch.

## Inspect string resources

```sh
node bin/apk-lens.mjs resources ./Example.apk --query title
```

This command requests string-resource data from JADX. It does not rebuild or sign an APK and does not promise a complete resource-table reconstruction. Missing resource results remain unknown until checked against the artifact or a separate decoder.

## Inspect an IPA

```sh
node bin/apk-lens.mjs ipa ./Example.ipa --output ./reports/ios-example
```

Python 3.10 or newer is required. This separate workflow writes `evidence.json` and `report.md` with the IPA SHA-256, archive totals, application/extension plist declarations and observed framework paths. It does not extract or launch the application. Plist declarations can include bundle identifiers, version, minimum OS, URL schemes and usage descriptions; malformed or unavailable values remain unknown.

The inspector refuses ZIP64, multi-disk and unsupported archive layouts. It bounds the central directory at 16 MiB and plist reads at 2 MiB per file and 8 MiB in total. Preserve warnings and partial metadata when interpreting the report. Framework paths do not prove that a library is linked or loaded.

IPA inventory does not verify code signatures, decrypt executable ranges, recover Swift/Objective-C source or provide runtime observations. Native analysis needs suitable external tools and usable executable bytes. An arbitrary device IPA is not a Simulator build. See the [mobile tooling research](mobile-tooling-research.md) for the Android/iOS tool choices and their host requirements.

## Preserve uncertainty

Record the exact artifact SHA-256 and engine/tool identity with each conclusion. Separate returned data from your own interpretation. Empty results, missing Java bodies, truncation and tool errors are gaps to explain. A readable report is a starting point for investigation, not a certification that an app is secure or fully understood.
