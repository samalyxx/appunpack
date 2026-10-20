# Android and iOS tooling research

Reviewed on 2026-10-20 using public GitHub repository search, upstream READMEs, license text and selected source entry points. This is a focused comparison, not an audit of every upstream line or a claim that every tool was executed.

## Recommended architecture

Run the analysis engine on a computer. Use an Android emulator or a dedicated test phone when runtime evidence is needed. A phone is the target for observing behavior; it does not need to host the decompiler, native-analysis tools, report storage or AI agent.

This recommendation follows existing tool architectures: JADX provides a JVM CLI and desktop GUI; APKLab invokes separate JADX and Apktool processes; MobSF coordinates static analysis and a distinct runtime environment; Frida connects host tools to a running target. A phone-only implementation would add another platform and duplicate these integrations without improving static APK coverage. This is an architectural judgment, not a measured performance comparison.

APK Lens implements its own CLI, reports and static IPA inspector. It calls separately installed JADX tools for Android bytecode work. APK Lens does not send application files to an AI service; material a user selects in an external AI workflow is governed by that workflow.

## Repositories checked

Actual GitHub searches included `android apk reverse engineering` and `ios reverse engineering`, ordered by stars. Results included Apktool, APKLab, APK Studio, apk.sh, OWASP MASTG and iOSAppReverseEngineering. The table focuses on projects with a concrete role in the design; it is not a ranking.

| Project | Useful approach | Upstream license | Fit for APK Lens |
| --- | --- | --- | --- |
| [JADX](https://github.com/skylot/jadx) | DEX-to-Java decompilation; resource decoding; CLI and GUI | Apache-2.0 | Separately installed Android analysis engine. Decompiled Java is a reconstruction and can be incomplete. |
| [Apktool](https://github.com/iBotPeaches/Apktool) | Android resource/manifest decoding, smali disassembly and rebuilding | Apache-2.0 | Complementary optional tool. Decoding does not require rebuilding or re-signing the target. |
| [APKLab](https://github.com/APKLab/APKLab) | VS Code workbench composing existing tools | AGPL-3.0 | Architecture reference: orchestrate tools rather than write another decompiler. |
| [MobSF](https://github.com/MobSF/Mobile-Security-Framework-MobSF) | APK/IPA static reports and separate Android/iOS dynamic workflows | GPL-3.0-only in README | Broader assessment platform; not required by APK Lens. |
| [Frida](https://github.com/frida/frida) | Instrumentation of running applications | wxWindows Library Licence 3.1 in root COPYING; components have their own notices | Optional separate runtime investigation with a compatible target setup. |
| [Objection](https://github.com/sensepost/objection) | Interactive Android/iOS exploration built on Frida | GPL-3.0 in README | Optional separate runtime companion. Its no-jailbreak workflow still requires an instrumentable application/setup. |
| [OWASP MASTG](https://github.com/OWASP/mastg) | Repeatable mobile testing and reverse-engineering methods | CC-BY-SA-4.0 | Methodology reference, not a runtime dependency. |
| [ipsw](https://github.com/blacktop/ipsw) | Apple firmware, Mach-O, dyld cache and device research | MIT | Optional iOS/native research tool; features depend on host/build. |
| [class-dump](https://github.com/nygard/class-dump) | Objective-C declarations from Mach-O metadata | GPL-2.0-or-later in README | Historical metadata reference; it does not reconstruct implementations or Swift source. |
| [ios-deploy](https://github.com/ios-control/ios-deploy) | Install/debug developer-signed iOS applications | GPL-3.0 reported by GitHub | Not a modern default: README targets iOS before version 17 and requires macOS/development signing. |

These labels summarize the inspected upstream material and do not replace each project's full notices. APK Lens does not incorporate these projects' source code or bundle their executables.

## Source findings

- APKLab's [`apktool.ts`](https://github.com/APKLab/APKLab/blob/6ae69b1ba03d65cb78388f7e2fa6a3b8f0081c74/src/tools/apktool.ts) invokes `java -jar ... d INPUT -o OUTPUT`; its [`jadx.ts`](https://github.com/APKLab/APKLab/blob/6ae69b1ba03d65cb78388f7e2fa6a3b8f0081c74/src/tools/jadx.ts) invokes a separate JADX executable. Tool composition avoids duplicating decompiler internals.
- JADX's [`JadxCLI.java`](https://github.com/skylot/jadx/blob/c4c45fde27b4f3386dc2ff016ff187229a60a716/jadx-cli/src/main/java/jadx/cli/JadxCLI.java) can write output and then return exit code `3` for decompilation errors. Retained files do not prove complete or correct decompilation; wrappers should preserve error status and limitations.
- MobSF's [`ipa.py`](https://github.com/MobSF/Mobile-Security-Framework-MobSF/blob/08872c8454e59f8a6347c35b46852c9929f5eb5e/mobsf/StaticAnalyzer/views/ios/ipa.py) separates bundle discovery, plist analysis, executable analysis, libraries and strings. Its [`binary_analysis.py`](https://github.com/MobSF/Mobile-Security-Framework-MobSF/blob/08872c8454e59f8a6347c35b46852c9929f5eb5e/mobsf/StaticAnalyzer/views/ios/binary_analysis.py) validates executable/bundle paths. Archive paths and application metadata are untrusted inputs.

## iOS scope and limits

An IPA contains application bundles, but its executable is native Mach-O, not Android DEX. JADX and Apktool are not iOS decompilers.

APK Lens's original Python inspector reads ZIP directory information and bounded XML/binary Info.plist metadata without extracting or executing the package. It records a SHA-256, archive sizes, application/extension declarations, URL schemes, usage descriptions and framework paths. It saves `evidence.json` and `report.md` in a new output directory. It does not decompile native code, check Mach-O encryption, verify code signatures, decode entitlements, or observe runtime behavior. Missing, encrypted, oversized or malformed plist metadata remains explicitly unavailable/unknown.

The inspector rejects unsafe/duplicate paths, multi-disk archives and ZIP64. Limits include a 16 MiB central directory, 100,000 entries, 256 bundle plists, 2 MiB per plist and 8 MiB total plist input. Binary-plist table/reference checks bound parser allocation before using Python's standard `plistlib`. These budgets are resource limits, not proof that an application is safe.

OWASP's [Obtaining and Extracting Apps](https://github.com/OWASP/mastg/blob/02ffd85fb74383ec2a30b42866d38f89d72c0ead/techniques/ios/MASTG-TECH-0054.md) explains that App Store executable bytes can be encrypted on disk. Its [Loaded Libraries guidance](https://github.com/OWASP/mastg/blob/02ffd85fb74383ec2a30b42866d38f89d72c0ead/techniques/ios/MASTG-TECH-0158.md) requires checking encryption per Mach-O; embedded frameworks must not be assumed unencrypted. An archive member's ZIP encryption flag does not answer that question. Use an authorized developer build or appropriately obtained unencrypted test artifact for further executable analysis.

Runtime iOS analysis needs a suitable physical/virtual device and compatible instrumentation/signing. The [OWASP virtual-device overview](https://github.com/OWASP/mastg/blob/02ffd85fb74383ec2a30b42866d38f89d72c0ead/knowledge/ios/MASVS-RESILIENCE/MASTG-KNOW-0135.md) distinguishes Simulator builds from production device binaries. An arbitrary IPA cannot be promised to run in the standard iOS Simulator.

## Verification

Repository searches, documents, license statements and the linked source entry points were checked. The source links pin the reviewed revisions. The IPA inspector has synthetic standard-library regression tests for XML/binary metadata, actual CLI output, archive/path budgets, malformed/encrypted/oversized metadata, output escaping and refusal to overwrite an existing destination.

No physical-device/Frida session, iOS virtual device, FairPlay decryption, macOS signature check or cross-platform benchmark was performed for this research. Source-derived capability descriptions do not establish that a particular target can be fully analyzed. See the README for the project's actual completed validation.
