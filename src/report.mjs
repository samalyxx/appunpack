import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { exportPackage, withEngine } from "./engine.mjs";
import { JADX, sha256 } from "./tools.mjs";
import { prepareSplits } from "./splits.mjs";

const escaped = (value) => String(value ?? "Unknown").replace(/[&<>`*_\[\]\\|\r\n]/g, (character) => `&#${character.charCodeAt(0)};`);

export function reportMarkdown(evidence) {
  const exported = evidence.decompilation;
  const files = exported ? `## Decompiled files\n\n- Java sources: [decompiled/sources](decompiled/sources/)\n- Resources: [decompiled/resources](decompiled/resources/)\n- Engine log: [decompile.log](decompile.log)\n- Export status: ${escaped(exported.status)}; ${escaped(exported.errors)} errors, ${escaped(exported.warnings)} warnings.\n\n` : "";
  return `# APK analysis report\n\n- **File:** ${escaped(evidence.target.path)}\n- **SHA-256:** ${evidence.target.sha256}\n- **Bytes:** ${evidence.target.bytes}\n- **Engine:** JADX headless ${evidence.engine.version}\n\n${files}## App declarations\n\nThe exact engine response is retained below and in evidence.json.\n\n<pre>${escaped(typeof evidence.analysis.app_info === "string" ? evidence.analysis.app_info : JSON.stringify(evidence.analysis.app_info, null, 2))}</pre>\n\n## Coverage and limits\n\n${evidence.limitations.map((item) => `- ${escaped(item)}`).join("\n")}\n`;
}

export const defaultOutput = (apk) => resolve(dirname(apk), `${parse(apk).name}-analysis`);

export async function inspectPackage(call) {
  const app_info = await call("get_app_info");
  const manifest = await call("get_android_manifest", { max_bytes: 1024 * 1024 });
  const status = await call("status");
  return { app_info, manifest, status };
}

export async function analyze(apk, directory = defaultOutput(apk)) {
  const path = resolve(apk);
  const targetStat = await stat(path);
  if (!targetStat.isFile()) throw new Error("APK input must be a regular file.");
  const output = resolve(directory);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  try {
    const before = await sha256(path);
    const decompilation = await exportPackage(path, output);
    process.stderr.write(`Export ${decompilation.status}: ${decompilation.errors} errors, ${decompilation.warnings} warnings. Review decompile.log.\n`);
    process.stderr.write("Collecting manifest and app declarations...\n");
    const analysis = await withEngine(path, inspectPackage);
    if (before !== await sha256(path)) throw new Error("The APK changed during analysis; report was not saved.");
    const evidence = {
      schema_version: 1,
      target: { path, sha256: before, bytes: targetStat.size },
      engine: { name: "jadx-headless-mcp", version: JADX.version, sha256: JADX.sha256 },
      analysis,
      decompilation,
      limitations: [
        "Static analysis only; the APK was not installed or executed.",
        "Input digest was checked before and after analysis; this does not exclude a concurrent change that was later reverted.",
        "Decompiled Java/smali is derived output and does not recover the original source project.",
        "Export counters and decompile.log describe known failures; even an export without reported errors can contain incomplete or inaccurate code.",
        "Only this APK is analyzed. Missing split APK modules and server-side/backend code cannot be recovered from it.",
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

export async function analyzeSplits(input, directory) {
  const output = resolve(directory);
  try {
    const prepared = await prepareSplits(input, output);
    const decompilation = await exportPackage(prepared.apks, output);
    process.stderr.write(`Split export ${decompilation.status}: ${decompilation.errors} errors, ${decompilation.warnings} warnings.\n`);
    const analysis = await withEngine(prepared.apks[0], inspectPackage);
    for (const part of prepared.parts) {
      if (await sha256(part.path) !== part.sha256) throw new Error("A prepared APK changed during analysis.");
    }
    const evidence = {
      schema_version: 1,
      target: { ...prepared.input, sha256: prepared.input.sha256 ?? "See per-APK hashes below", bytes: prepared.input.bytes ?? prepared.parts.reduce((sum, part) => sum + part.bytes, 0) },
      parts: prepared.parts,
      engine: { name: "jadx-headless-mcp", version: JADX.version, sha256: JADX.sha256 },
      decompilation, analysis,
      limitations: [...prepared.limitations,
        "Sources/resources are a combined JADX analysis of the supplied set, not a rebuilt or installable merged APK.",
        "App declarations and manifest.xml come from the base APK. Split identities are listed separately in parts.",
        "Static analysis only. Signatures, runtime behavior, native bodies and completeness of the supplied split set were not verified.",
        "Recovered Java is derived output; backend code and original project files cannot be recovered from it.",
      ],
    };
    await writeFile(join(output, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
    if (typeof analysis.manifest !== "string") throw new Error("JADX manifest response was not text; see evidence.json.");
    await writeFile(join(output, "manifest.xml"), analysis.manifest, { flag: "wx" });
    const parts = prepared.parts.map((part) => `- ${escaped(part.split || "base")}: ${escaped(part.source)}; SHA-256 ${part.sha256}`).join("\n");
    await writeFile(join(output, "report.md"), `${reportMarkdown(evidence)}\n## Supplied APK set\n\n${parts}\n`, { flag: "wx" });
    return output;
  } catch (error) {
    throw new Error(`${error.message}\nReport directory: ${output}. Use a new directory when retrying.`, { cause: error });
  }
}
