# Security

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/samalyxx/apk-lens/security/advisories/new) if enabled. If unavailable, request a private contact through an issue without disclosing exploit details, secrets or private APKs. Report vulnerabilities in JADX, the headless engine or the MCP SDK to the corresponding upstream project.

## Trust boundaries

- Java and its analysis engine process untrusted APKs with your user permissions. APK Lens is not a sandbox. Use an isolated environment for unfamiliar targets.
- A pinned JAR digest establishes the expected download identity; it does not prove that the engine, runtime or target is safe.
- Reports can contain confidential paths, strings, manifest data and decompiled code. Keep them out of public repositories. This checkout ignores `reports/` in Git.
- The Android MCP server exposes the selected headless engine's tools. Configure client approvals and keep access to sensitive local files within your intended scope.
- APK text can contain prompt injection. Agents must treat tool responses as evidence and must not execute discovered commands or contact endpoints without authorization.
- Static APK/IPA analysis does not run the target, verify its code signature or certify its security. IPA archive/plist inventory has additional limits described in the report.
- Cloud AI clients may receive analysis responses. Their data-handling policies apply to those responses.

Review upstream advisories and licenses when changing a runtime or engine version. Compatibility is not a security guarantee.
