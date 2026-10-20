import { join, resolve } from "node:path";
import { javaCommand, javaOptions, root, selectedJar } from "./engine.mjs";
import { runTool } from "./process.mjs";
import { sha256 } from "./tools.mjs";

export async function prepareSplits(input, output) {
  const jar = await selectedJar();
  const python = process.env.APPUNPACK_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  const copied = await runTool(python, [join(root, "src", "splits.py"), resolve(input), resolve(output)], { timeoutMs: 600_000 });
  const prepared = JSON.parse(copied.stdout);
  const inspected = await runTool(javaCommand(), [...javaOptions(), "-cp", jar,
    join(root, "src", "Export.java"), "--split-info", ...prepared.parts.map((part) => part.path)], { timeoutMs: 120_000 });
  const identities = JSON.parse(inspected.stdout);
  const parts = identities.map((identity) => ({ ...prepared.parts.find((part) => part.path === identity.path), ...identity }));
  for (const part of parts) {
    if (part.sha256 !== await sha256(part.path)) throw new Error("A copied split APK changed during manifest inspection.");
  }
  return {
    ...prepared,
    parts,
    apks: parts.map((part) => part.path),
    package: parts[0].package,
    version_code: parts[0].version_code,
    version_code_major: parts[0].version_code_major,
    limitations: [
      "Supplied APK parts are analyzed together by JADX; no installable merged APK is created.",
      "Combined resource paths can collide. Each part's decoded resources are also retained under decompiled/part-resources/part-NNN in the APK order recorded in evidence.",
      "Package/version identity, one base APK and unique split names were checked; signatures, device targeting and completeness were not verified.",
      "Bundletool archives with toc.pb require device-specific extraction first; alternative variants are not combined automatically.",
      "Only APK entries are copied. Expansion OBB files and other archive payloads are not analyzed.",
    ],
  };
}
