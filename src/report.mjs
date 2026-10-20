import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { withEngine } from "./engine.mjs";
import { JADX, sha256 } from "./tools.mjs";

const escaped = (value) => String(value ?? "Unknown").replace(/[&<>`*_\[\]\\|\r\n]/g, (character) => `&#${character.charCodeAt(0)};`);

export function reportMarkdown(evidence) {
  return `# APK analysis report\n\n- **File:** ${escaped(evidence.target.path)}\n- **SHA-256:** ${evidence.target.sha256}\n- **Bytes:** ${evidence.target.bytes}\n- **Engine:** JADX headless ${evidence.engine.version}\n\n## App declarations\n\nThe exact engine response is retained below and in evidence.json.\n\n<pre>${escaped(typeof evidence.analysis.app_info === "string" ? evidence.analysis.app_info : JSON.stringify(evidence.analysis.app_info, null, 2))}</pre>\n\n## Coverage and limits\n\n${evidence.limitations.map((item) => `- ${escaped(item)}`).join("\n")}\n`;
}

export async function inspectPackage(call) {
  const app_info = await call("get_app_info");
  const manifest = await call("get_android_manifest", { max_bytes: 1024 * 1024 });
  const status = await call("status");
  return { app_info, manifest, status };
}

export async function analyze(apk, directory) {
  const path = resolve(apk);
  const targetStat = await stat(path);
  if (!targetStat.isFile()) throw new Error("APK input must be a regular file.");
  const output = resolve(directory);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  try {
    const before = await sha256(path);
    const analysis = await withEngine(path, inspectPackage);
    if (before !== await sha256(path)) throw new Error("The APK changed during analysis; report was not saved.");
    const evidence = {
      schema_version: 1,
      target: { path, sha256: before, bytes: targetStat.size },
      engine: { name: "jadx-headless-mcp", version: JADX.version, sha256: JADX.sha256 },
      analysis,
      limitations: [
        "Static analysis only; the APK was not installed or executed.",
        "Input digest was checked before and after analysis; this does not exclude a concurrent change that was later reverted.",
        "Decompiled Java/smali is derived output and does not recover the original source project.",
        "Manifest and source responses can be bounded by the engine; use the exact responses and their coverage markers.",
        "APK signatures, runtime behavior, native library bodies and split-package completeness were not verified.",
      ],
    };
    await writeFile(join(output, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
    const manifest = analysis.manifest;
    if (typeof manifest !== "string") throw new Error("JADX manifest response was not text; inspect evidence.json for the exact result.");
    await writeFile(join(output, "manifest.xml"), manifest, { flag: "wx" });
    await writeFile(join(output, "report.md"), reportMarkdown(evidence), { flag: "wx" });
    return output;
  } catch (error) {
    throw new Error(`${error.message}\nReport directory: ${output}. Use a new directory when retrying.`, { cause: error });
  }
}
