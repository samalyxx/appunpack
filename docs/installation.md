# Installation

## Requirements

| Component | Requirement |
| --- | --- |
| Node.js | 24.11 or newer |
| npm and Git | Repository installation |
| Java | Java 17 or newer for the JADX engine; a full JDK is also suitable |
| JADX headless engine | Pinned 0.7.1 JAR installed by `install-tools` |
| Python | 3.10 or newer, only for `ipa` |

APK Lens invokes the headless Java engine directly. It does not require Java compiler modules, Android SDK tools or a running Android device for static APK inspection. Android Studio's bundled Java runtime can be selected if its version meets the engine requirement.

## Install from GitHub

```sh
git clone https://github.com/samalyxx/apk-lens.git
cd apk-lens
npm ci
node bin/apk-lens.mjs install-tools
```

The source checkout is the installation method. There is no published `apk-lens` npm release to install with `npx`.

`install-tools` downloads `jadx-headless-mcp-0.7.1-all.jar` from its [upstream release](https://github.com/1013503897/jadx-headless-mcp/releases/tag/v0.7.1), checking this SHA-256 before accepting it:

```text
6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75
```

The default location is `.tools` inside the APK Lens checkout, including when the CLI is launched from another directory. An existing matching JAR is reused; a mismatched file is refused. Every engine launch also checks that the selected JAR matches this pinned digest. A custom path does not enable an arbitrary engine version. The installer does not install Java or Python. See [tool licenses](../THIRD_PARTY_NOTICES.md).

## Windows PowerShell

If Java is not available on `PATH`, select an existing installation:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
& "$env:JAVA_HOME\bin\java.exe" --version
node bin/apk-lens.mjs doctor
node bin/apk-lens.mjs analyze 'C:\targets\Example.apk' --output '.\reports\example'
```

For a custom JAR directory:

```powershell
node bin/apk-lens.mjs install-tools 'C:\tools\apk-lens'
$env:APK_LENS_JADX_JAR = 'C:\tools\apk-lens\jadx-headless-mcp-0.7.1-all.jar'
node bin/apk-lens.mjs doctor
```

These environment assignments apply to the current shell. An agent launched elsewhere needs equivalent settings in its MCP server environment.

## macOS or Linux

If needed, select Java explicitly:

```sh
export JAVA_HOME=/absolute/path/to/java-21
"$JAVA_HOME/bin/java" --version
node bin/apk-lens.mjs doctor
node bin/apk-lens.mjs analyze /targets/Example.apk --output ./reports/example
```

For a custom JAR, run `install-tools /absolute/path/to/tools` and set `APK_LENS_JADX_JAR` to the resulting absolute JAR path.

## Optional command link

```sh
npm link
apk-lens --help
```

This links the checkout's command through npm's global executable directory. Use `node bin/apk-lens.mjs ...` if that directory is not on `PATH`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `JAVA_HOME` | Select the Java installation; otherwise Java is resolved on `PATH` |
| `APK_LENS_JADX_JAR` | Select a custom engine JAR instead of the checkout's default |
| `APK_LENS_HEAP_MIB` | Optional maximum Java heap size, in MiB |
| `APK_LENS_PYTHON` | Optional Python executable for IPA inventory |

Use absolute executable and JAR paths in agent configurations. `doctor` checks the selected engine setup; it does not prove that every APK will decompile successfully.
