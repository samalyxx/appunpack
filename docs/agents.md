# AI agents and MCP

APK Lens starts the JADX headless engine directly as a local stdio MCP server. The command-line analysis workflows use the official MCP client SDK to call that engine.

## Register the engine

Complete [installation](installation.md) and run `doctor`. Then:

```sh
node bin/apk-lens.mjs mcp-config
```

Review the printed JSON. It uses the current Node executable, an absolute path to this checkout's `bin/apk-lens.mjs`, and the `mcp` argument. Add its server entry to the configuration format supported by your client, then restart or reconnect the client. This command prints configuration; it does not edit settings or install a skill.

The server exposes the Android tools provided by the selected JADX engine. Discover the actual tool list and schemas in the connected session rather than assuming names or arguments. Client approvals still matter: the Java process reads target paths with your user permissions and the engine can maintain analysis state. The skill below is guidance, not an access-control mechanism.

### Codex CLI

From PowerShell in the checkout, with any required environment values already selected:

```powershell
$nodePath = (Get-Command node).Source
$cliPath = (Resolve-Path '.\bin\apk-lens.mjs').Path
codex mcp add apk-lens -- $nodePath $cliPath mcp
```

If Java or the JAR needs an explicit setting, register those values too:

```powershell
codex mcp add apk-lens --env "JAVA_HOME=$env:JAVA_HOME" --env "APK_LENS_JADX_JAR=$env:APK_LENS_JADX_JAR" -- $nodePath $cliPath mcp
```

Run the command matching your setup, with real non-empty environment values. `codex mcp add` intentionally changes your Codex configuration. Its syntax above was checked against local CLI help. Codex's manual configuration format is TOML; generic `mcpServers` JSON is not a TOML entry. For example:

```toml
[mcp_servers.apk-lens]
command = 'C:\path\to\node.exe'
args = ['C:\path\to\apk-lens\bin\apk-lens.mjs', 'mcp']

[mcp_servers.apk-lens.env]
JAVA_HOME = 'C:\path\to\jdk-21'
```

Regenerate or update paths if you move the checkout or Node executable.

## Use the investigation skill

Install [skills/apk-analysis/SKILL.md](../skills/apk-analysis/SKILL.md) through your client's skill mechanism, or use it as investigation instructions when the client has no skills support.

Example prompt:

```text
Use the apk-analysis skill to inspect /absolute/path/Example.apk.
Find the implementation behind the search screen. Begin with the manifest,
then inspect the relevant classes, methods and incoming references.
Include the artifact hash, raw evidence and unknowns. Distinguish observed
facts from inferences. Do not install, launch or contact the target app.
```

Analysis runs on your computer. A cloud agent may receive code, strings, metadata and local paths in tool responses under its own data policy. Review what is sent before using confidential artifacts. IPA inventory is a separate CLI workflow; this initial Android MCP server does not expose it as an iOS analysis tool.
