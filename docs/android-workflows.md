# Extended Android workflows

The basic `APK` command exports static JADX results. These additional commands solve different parts of an investigation and require their own installed tools. All output commands require a new directory; failed attempts retain partial files and diagnostics. Targets are never installed or launched automatically.

## Tools

| Workflow | Additional setup |
| --- | --- |
| `splits` | Python 3.10+, the pinned JADX engine and a Java JDK |
| `decode` | Python 3.10+, Java and [Apktool 3.0.3+](https://apktool.org/docs/install/) |
| `native-libs` | Python 3.10+ |
| `native` | An unpacked [Ghidra binary distribution](https://github.com/NationalSecurityAgency/ghidra/releases) and its required JDK; Python when extracting an APK member |
| ADB commands | [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools), an explicitly selected authorized device or emulator |
| Frida commands | [frida-tools](https://frida.re/docs/installation/) and access to an already instrumentable process/device |

These external tools are not bundled or installed by `install-tools`, which installs only JADX. Download them from their official sources, retain their notices, and select their paths. For example in PowerShell:

```powershell
$env:APPUNPACK_PYTHON = 'C:\Python312\python.exe'
$env:APPUNPACK_APKTOOL_JAR = 'C:\Tools\apktool_3.0.3.jar'
$env:GHIDRA_HOME = 'C:\Tools\ghidra_11.4.3_PUBLIC'
$env:JAVA_HOME = 'C:\path\to\compatible-jdk'
$env:APPUNPACK_ADB = 'C:\Android\platform-tools\adb.exe'
$env:APPUNPACK_FRIDA = 'C:\path\to\frida.exe'
$env:APPUNPACK_FRIDA_PS = 'C:\path\to\frida-ps.exe'
```

Use your real paths and the JDK required by your Ghidra version. Ghidra 11.4.3 was checked with Java 21; newer Ghidra distributions can require a newer JDK. ADB and Frida also resolve from `PATH` when their variables are absent. The Java/Ghidra bootstrap uses literal arguments rather than Windows batch launchers.

## Analyze a supplied split APK set

Put one app version's base and selected split APKs in a flat directory:

```sh
node bin/appunpack.mjs splits ./apk-set --output ./reports/splits
node bin/appunpack.mjs splits ./Example.xapk --output ./reports/xapk
```

An `.apks` or `.xapk` path can also be given directly with `--output`. AppUnpack copies APK members into owned `inputs/`, records SHA-256 values, and checks for exactly one base, matching package/version identifiers, unique split names, and referenced feature splits. It then supplies the APK list to JADX together.

Open `report.md`, `evidence.json`, `decompiled/sources/`, `decompiled/resources/` and `decompiled/export.json`. For multi-APK sets, resource paths from different parts can overlap, so `decompiled/part-resources/part-000/`, `part-001/`, etc. retain each part's decoded resources separately. The per-part index follows the base-first `parts` list in `evidence.json`. `manifest.xml` and app declarations come from the base APK.

This is combined analysis, **not an installable merged APK**. It does not establish signature validity, device compatibility or that every required split was supplied. Expansion OBB payloads are not analyzed. A bundletool archive containing `toc.pb` can hold alternative device variants and is refused; first select a device-specific set with upstream [bundletool extract-apks](https://developer.android.com/tools/bundletool#extract-apks), then analyze the extracted directory. AAB conversion and APK rebuilding/signing remain outside this workflow.

ZIP preparation rejects unsafe paths, duplicates, links, encrypted entries, ZIP64 and unsupported compression. Limits: 512 APK parts, 2 GiB per APK, 4 GiB total APK bytes and an 8 GiB outer archive. Python and Java also have bounded process deadlines. A failure may leave an owned `inputs` directory for diagnosis.

## Decode smali and resources with Apktool

```sh
node bin/appunpack.mjs decode ./Example.apk --output ./reports/apktool
```

Open `decoded/AndroidManifest.xml`, `decoded/res/`, any `decoded/smali*/` directories and `decoded/apktool.yml`. `report.json` retains the APK hash, archive inventory and Apktool version/JAR hash; `decode.log` retains diagnostics. Framework cache files stay inside this output directory. No force-overwrite, rebuilding or signing step is used.

APK preflight limits compressed input/individual entries to 512 MiB and expanded archive totals to 4 GiB. Decoding has a ten-minute deadline. Whole-archive decoding refuses paths that differ only by case, preventing extraction collisions on Windows. Native inventory and selected-library extraction accept those resource paths because only the selected member is written to a fixed filename. Apktool may reject or only partially decode an app; retain its failure output rather than treating existing files as a successful decode.

## Inspect Android native libraries with Ghidra

List exact library paths first, then choose one:

```sh
node bin/appunpack.mjs native-libs ./Example.apk
node bin/appunpack.mjs native ./Example.apk --library lib/arm64-v8a/libexample.so --output ./reports/native
```

Or analyze an already extracted ELF shared library:

```sh
node bin/appunpack.mjs native ./libexample.so --output ./reports/native
```

AppUnpack checks the ELF header, imports the file into Ghidra, runs auto-analysis and exports `pseudocode.c`, `functions.json` and `report.json`. Logs, the input snapshot for an APK member, and the Ghidra project are retained. Target machine code is not executed.

The export is bounded: a requested 180-second auto-analysis limit; a 180-second decompilation budget checked between functions; 15 seconds per function; at most 5,000 functions and 16 MiB of pseudocode. Ghidra can overrun its cooperative analysis limit before returning control. The outer process has a hard ten-minute deadline. Failed functions and truncation remain visible as partial results. Reconstructed C-like pseudocode is not the original C/C++ source. Stripped symbols, obfuscation, unsupported instructions and missing dependencies can limit recovery. This command is for Android-style ELF shared libraries; it does not implement iOS Mach-O analysis.

## Copy an installed app through ADB

Enable debugging and authorize your test computer using Android's normal device flow, then choose a serial reported by `devices`:

```sh
node bin/appunpack.mjs devices
node bin/appunpack.mjs packages --device emulator-5554
node bin/appunpack.mjs pull com.example.app --device emulator-5554 --output ./reports/pulled
node bin/appunpack.mjs splits ./reports/pulled --output ./reports/pulled-analysis
```

`pull` copies every base/split APK path reported by the selected package manager, using generated local filenames, and writes `pull.json` with device paths, sizes and local hashes. Package paths are checked again after transfer. This does not hash the remote file contents before and after copying, and an app update during transfer can invalidate the collected set. The split workflow performs additional manifest identity checks. Neither command installs, launches, stops or modifies the app.

ADB access is a prerequisite. An unauthorized/offline device or inaccessible package results in an error; AppUnpack does not bypass device authorization.

## Capture device logs

```sh
node bin/appunpack.mjs logcat --device emulator-5554 --seconds 10 --output ./reports/logs
```

The command captures accessible logcat buffers without clearing them and saves `logcat.log` plus `capture.json`. `--seconds` is required and ranges from 1 to 300. Output is bounded at 4 MiB; exceeding that budget is reported as a failure with retained truncated diagnostics. Device logs can contain private data. Seeing a log line does not establish a complete account of the app's behavior.

## Attach Frida to a selected process

Configure an appropriate Frida server/Gadget or other supported target setup first. [Frida's Android guide](https://frida.re/docs/android/) explains the requirements. AppUnpack does not set up root, inject Gadget into APKs, patch, re-sign, or spawn the app.

```sh
node bin/appunpack.mjs frida-ps --device DEVICE_ID
node bin/appunpack.mjs trace 1234 ./observe.js --device DEVICE_ID --seconds 10 --output ./reports/trace
```

Supply a real device ID, current PID and your own reviewed JavaScript file. For example, a minimal observation script is:

```javascript
console.log(JSON.stringify({ pid: Process.id, platform: Process.platform, arch: Process.arch }));
```

The command saves a fixed `script.js` snapshot and its hash, runs it in the selected process, and retains `frida.log` and `capture.json`. Script files are bounded at 1 MiB; captures use the same 1–300 second duration and 4 MiB output budget. A hard deadline allows an additional 30 seconds for connection/cleanup. Frida error exits propagate. Use `--device local` only when you intentionally want a host-computer process.

Frida attachment and scripts can change or disrupt the selected process. Static APK analysis never triggers this command automatically. Restrict runtime work to your authorized test environment and review capture contents before sharing them.

## AI clients

The existing `mcp` command exposes JADX's Android tools. These new integrations are CLI workflows; they are not automatically added to that upstream MCP server. An agent with terminal access can invoke the CLI under its normal approvals. Keep device selection and script execution explicit, and treat recovered app content as data rather than instructions.
