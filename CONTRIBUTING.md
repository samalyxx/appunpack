# Contributing

Keep changes focused on inspecting an APK and understanding its evidence. Reuse the installed engine before adding another parser or decompiler. Avoid expanding the CLI's advertised capabilities beyond implemented behavior.

```sh
npm ci
npm test
node bin/apk-lens.mjs --help
```

For real Android validation, follow [installation](docs/installation.md), run `doctor` and inspect a small APK you are allowed to use. For IPA validation, use a self-built or otherwise redistributable fixture. Record host, Node/Java/Python versions, engine digest, exact commands and what actually passed. Unit or fixture tests alone do not establish cross-platform engine support.

Pull requests should describe the user-visible change, include a focused check for non-trivial behavior and update affected examples. Dependency upgrades must update the lockfile and review engine contracts, tool licenses and security advisories.

Do not commit private applications, downloaded tool JARs, decompiled output, reports, secrets or device data. Follow [SECURITY.md](SECURITY.md) for vulnerabilities.
