import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeNative, decodeApk } from "../../src/static-tools.mjs";
import { sha256 } from "../../src/tools.mjs";

test("Apktool decodes the selected real APK", { skip: !process.env.APPUNPACK_TEST_APK || !process.env.APPUNPACK_APKTOOL_JAR,
  timeout: 660_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "appunpack-apktool-integration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "decoded-apk");
  await decodeApk(process.env.APPUNPACK_TEST_APK, output);
  const manifest = await readFile(join(output, "decoded", "AndroidManifest.xml"), "utf8");
  assert.match(manifest, /<manifest/);
  assert.equal(JSON.parse(await readFile(join(output, "report.json"))).kind, "apktool-decode");
});

test("Ghidra recovers the known-source native fixture functions", { skip: !process.env.APPUNPACK_NATIVE_FIXTURE || !process.env.GHIDRA_HOME,
  timeout: 660_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "appunpack-ghidra-integration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "native");
  await analyzeNative(process.env.APPUNPACK_NATIVE_FIXTURE, output);
  assert.equal(JSON.parse(await readFile(join(output, "report.json"))).input.sha256, await sha256(process.env.APPUNPACK_NATIVE_FIXTURE));
  const result = JSON.parse(await readFile(join(output, "functions.json")));
  assert.equal(result.partial, false);
  assert.equal(result.failed, 0);
  assert.ok(result.functions.some((item) => item.name === "appunpack_score" && item.status === "decompiled"));
  assert.ok(result.functions.some((item) => item.name === "appunpack_sum" && item.status === "decompiled"));
  const pseudocode = await readFile(join(output, "pseudocode.c"), "utf8");
  assert.match(pseudocode, /appunpack_score\([^)]*\)[\s\S]*?return\s+\w+\s*\*\s*7\s*\+\s*3;/);
});
