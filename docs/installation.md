# Installation

## Requirements

| Component | Requirement |
| --- | --- |
| Node.js | 24.11 or newer |
| npm and Git | Repository installation |
| Java | Java 17 or newer JDK with the compiler module for full APK export; a Java runtime suffices for `inspect` and MCP |
| JADX headless engine | Pinned 0.7.1 JAR installed by `install-tools` |
| Python | 3.10+ for IPA, split sets, APK preflight and APK native-library extraction |

AppUnpack uses the pinned headless JAR for both inspection and full export. Full export launches the included `src/Export.java` with Java's source launcher, so it needs a JDK with compiler modules. It does not require Android SDK tools or a running Android device. Android Studio's bundled Java can be selected when it includes the required modules.

## Install from GitHub

```sh
git clone https://github.com/samalyxx/appunpack.git
cd appunpack
npm ci
node bin/appunpack.mjs install-tools
node bin/appunpack.mjs ./Uber.apk
```

The source checkout is the installation method. There is no published `appunpack` npm release to install with `npx`.

`install-tools` downloads `jadx-headless-mcp-0.7.1-all.jar` from its [upstream release](https://github.com/1013503897/jadx-headless-mcp/releases/tag/v0.7.1), checking this SHA-256 before accepting it:

```text
6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75
```

The default location is `.tools` inside the AppUnpack checkout, including when the CLI is launched from another directory. An existing matching JAR is reused; a mismatched file is refused. Every engine launch also checks that the selected JAR matches this pinned digest. A custom path does not enable an arbitrary engine version. The installer does not install Java or Python. See [tool licenses](../THIRD_PARTY_NOTICES.md).

## Windows PowerShell

If Java is not available on `PATH`, select an existing installation:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
& "$env:JAVA_HOME\bin\java.exe" --version
node bin/appunpack.mjs doctor
.\appunpack.ps1 'C:\Apps\Uber.apk'
```

The launcher checks `APPUNPACK_NODE`, then `.tools/node.exe`, then Node on `PATH`. A locally prepared checkout may already have a portable Node in `.tools`; GitHub clones do not include that runtime. Without an explicit `JAVA_HOME`, the launcher uses Java on `PATH` or an existing Android Studio Java installation. Check the selected version with `doctor` before analysis.

If your shell blocks the unsigned PowerShell launcher, the equivalent direct command is:

```powershell
node bin/appunpack.mjs 'C:\Apps\Uber.apk'
```

For a custom JAR directory:

```powershell
node bin/appunpack.mjs install-tools 'C:\tools\appunpack'
$env:APPUNPACK_JADX_JAR = 'C:\tools\appunpack\jadx-headless-mcp-0.7.1-all.jar'
node bin/appunpack.mjs doctor
```

These environment assignments apply to the current shell. An agent launched elsewhere needs equivalent settings in its MCP server environment.

## macOS or Linux

If needed, select Java explicitly:

```sh
export JAVA_HOME=/absolute/path/to/java-21
"$JAVA_HOME/bin/java" --version
node bin/appunpack.mjs doctor
node bin/appunpack.mjs /targets/Example.apk
```

For a custom JAR, run `install-tools /absolute/path/to/tools` and set `APPUNPACK_JADX_JAR` to the resulting absolute JAR path.

## Optional command link

```sh
npm link
appunpack --help
```

This links the checkout's command through npm's global executable directory. Use `node bin/appunpack.mjs ...` if that directory is not on `PATH`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `JAVA_HOME` | Select the Java installation; otherwise Java is resolved on `PATH` |
| `APPUNPACK_NODE` | Windows launcher's explicit Node executable |
| `APPUNPACK_JADX_JAR` | Select a custom engine JAR instead of the checkout's default |
| `APPUNPACK_HEAP_MIB` | Optional maximum Java heap size, in MiB |
| `APPUNPACK_PYTHON` | Python executable for archive workflows |
| `APPUNPACK_APKTOOL_JAR` | Absolute path to a separately installed Apktool 3.0.3+ JAR |
| `GHIDRA_HOME` | Unpacked Ghidra binary distribution; needs that release's compatible JDK |
| `APPUNPACK_ADB` | ADB executable; otherwise resolved from PATH |
| `APPUNPACK_FRIDA` | Frida CLI executable; otherwise resolved from PATH |
| `APPUNPACK_FRIDA_PS` | Frida process-list executable; otherwise resolved from PATH |

Use absolute executable and JAR paths in agent configurations. `doctor` checks the selected engine setup; it does not prove that every APK will decompile successfully or that a Java runtime has the compiler modules needed for full export.

Optional Apktool, Ghidra, ADB and Frida are installed separately; `install-tools` installs only JADX. See [extended Android setup](android-workflows.md) for commands, tool requirements and limits. The basic APK workflow remains independent of these optional integrations.
