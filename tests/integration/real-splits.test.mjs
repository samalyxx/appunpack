import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { sha256 } from "../../src/tools.mjs";

const enabled = Boolean(process.env.APPUNPACK_REAL_SPLITS && process.env.APPUNPACK_JADX_JAR);
const options = { skip: enabled ? false : "Set APPUNPACK_REAL_SPLITS to the official Jellyfin 2.7.3 bundletool-selected x86_64/xxhdpi set and APPUNPACK_JADX_JAR", timeout: 600_000 };
const execute = promisify(execFile);
const entrypoint = fileURLToPath(new URL("../../bin/appunpack.mjs", import.meta.url));

test("official Jellyfin release-derived split set exports base code, ABI payloads and density resources", options, async () => {
  const input = resolve(process.env.APPUNPACK_REAL_SPLITS);
  const originals = new Map();
  for (const name of await readdir(input)) {
    if (name.endsWith(".apk")) originals.set(join(input, name), await sha256(join(input, name)));
  }
  assert.equal(originals.size, 3, "Use the selected base, x86_64 and xxhdpi set documented in testing.md");
  const scratch = await mkdtemp(join(tmpdir(), "appunpack-real-splits-"));
  const output = join(scratch, "analysis");
  const cli = () => execute(process.execPath, [entrypoint, "splits", input, "--output", output], {
    shell: false, windowsHide: true, env: process.env, timeout: 580_000, maxBuffer: 4 * 1024 * 1024,
  });
  try {
    await cli();
    const evidenceText = await readFile(join(output, "evidence.json"), "utf8");
    const evidence = JSON.parse(evidenceText);
    assert.equal(evidence.analysis.app_info.package, "org.jellyfin.mobile");
    assert.equal(evidence.analysis.app_info.version_name, "2.7.3");
    assert.equal(evidence.analysis.app_info.version_code, "2070399");
    assert.deepEqual(evidence.parts.map((part) => part.split).sort(), ["", "config.x86_64", "config.xxhdpi"]);
    assert.equal(evidence.parts[0].split, "");
    for (const part of evidence.parts) {
      assert.equal(part.sha256, originals.get(part.source));
      assert.equal(part.sha256, await sha256(part.path));
    }
    assert.ok(evidence.decompilation.classes > 7000);
    assert.equal(evidence.decompilation.status, evidence.decompilation.errors || evidence.decompilation.warnings ? "partial" : "completed");
    const decompiled = join(output, "decompiled");
    assert.match(await readFile(join(decompiled, "sources", "org", "jellyfin", "mobile", "MainActivity.java"), "utf8"), /class MainActivity/);
    assert.match(await readFile(join(decompiled, "part-resources", "part-000", "res", "values", "strings.xml"), "utf8"), /<string name="app_name">Jellyfin<\/string>/);
    const abiIndex = evidence.parts.findIndex((part) => part.split === "config.x86_64");
    const abi = join(decompiled, "part-resources", `part-${String(abiIndex).padStart(3, "0")}`);
    assert.equal(await sha256(join(abi, "lib", "x86_64", "libffmpegJNI.so")), "d991ed496c82664ff5bf5d44427d70f31ec6399a3300f00235be8f072c03447e");
    assert.match(await readFile(join(abi, "AndroidManifest.xml"), "utf8"), /split="config.x86_64"/);
    const densityIndex = evidence.parts.findIndex((part) => part.split === "config.xxhdpi");
    const density = join(decompiled, "part-resources", `part-${String(densityIndex).padStart(3, "0")}`);
    assert.match(await readFile(join(density, "AndroidManifest.xml"), "utf8"), /split="config.xxhdpi"/);
    assert.ok((await readdir(join(density, "res"))).some((name) => name.includes("xxhdpi")));
    await assert.rejects(cli(), /exist/i);
    assert.equal(await readFile(join(output, "evidence.json"), "utf8"), evidenceText);
  } finally {
    try {
      for (const [path, digest] of originals) assert.equal(await sha256(path), digest, "Original split APK changed");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
});
