import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { toolValue } from "../../src/engine.mjs";
import { defaultOutput } from "../../src/report.mjs";
import { JADX, sha256 } from "../../src/tools.mjs";

const ready = Boolean(process.env.APPUNPACK_TEST_APK && process.env.APPUNPACK_JADX_JAR);
const options = { skip: ready ? false : "Set APPUNPACK_TEST_APK and APPUNPACK_JADX_JAR (see README.md)", timeout: 600_000 };
const fixtureDigest = "a9eecf37b26cd084855c530db81c2bb1b91f4c1b095a04f47aa7c20e2791f686";
const className = "io.appium.android.apis.ApiDemos";
const entrypoint = fileURLToPath(new URL("../../bin/appunpack.mjs", import.meta.url));
const execute = promisify(execFile);
let scratch;
let apk;

before(async () => {
  if (!ready) return;
  assert.equal(await sha256(process.env.APPUNPACK_TEST_APK), fixtureDigest, "Use the documented Appium ApiDemos v6.0.18 fixture");
  scratch = await mkdtemp(join(tmpdir(), "appunpack-integration-"));
  apk = join(scratch, "Api Demos & literal$().apk");
  await copyFile(process.env.APPUNPACK_TEST_APK, apk);
});

after(async () => {
  if (!scratch) return;
  try {
    assert.equal(await sha256(process.env.APPUNPACK_TEST_APK), fixtureDigest, "Original APK changed");
    assert.equal(await sha256(apk), fixtureDigest, "Analysis input changed");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

const environment = () => ({ ...process.env, APPUNPACK_JADX_JAR: resolve(process.env.APPUNPACK_JADX_JAR) });

async function cli(args) {
  return execute(process.execPath, [entrypoint, ...args], {
    cwd: scratch, shell: false, windowsHide: true, env: environment(),
    timeout: 600_000, maxBuffer: 8 * 1024 * 1024,
  });
}

async function observation(args) {
  return JSON.parse((await cli([...args, "--json"])).stdout);
}

test("an APK alone exports source/resources and protects previous evidence", options, async () => {
  const inspection = await observation(["inspect", apk]);
  assert.equal(inspection.app_info.package, "io.appium.android.apis");
  assert.equal(inspection.app_info.version_name, "6.0.18");
  assert.ok(inspection.app_info.permissions.includes("android.permission.INTERNET"));
  assert.equal(inspection.status.state, "LOADED");
  assert.ok(inspection.status.class_count > 0);
  assert.match(inspection.manifest, /<manifest/);
  assert.match(inspection.manifest, /io\.appium\.android\.apis/);

  const output = defaultOutput(apk);
  await cli([apk]);
  const savedText = await readFile(join(output, "evidence.json"), "utf8");
  const saved = JSON.parse(savedText);
  assert.equal(saved.schema_version, 1);
  assert.equal(saved.target.path, apk);
  assert.equal(saved.target.sha256, fixtureDigest);
  assert.ok(saved.target.bytes > 0);
  assert.deepEqual(saved.engine, { name: "jadx-headless-mcp", version: JADX.version, sha256: JADX.sha256 });
  assert.deepEqual(saved.analysis.app_info, inspection.app_info);
  assert.equal(saved.analysis.manifest, inspection.manifest);
  assert.equal(await readFile(join(output, "manifest.xml"), "utf8"), saved.analysis.manifest);
  const exported = JSON.parse(await readFile(join(output, "decompiled", "export.json"), "utf8"));
  assert.deepEqual(exported, saved.decompilation);
  assert.ok(exported.classes > 0);
  assert.equal(exported.status, exported.errors > 0 || exported.warnings > 0 ? "partial" : "completed");
  assert.equal(typeof exported.version, "string");
  assert.ok(exported.version.length > 0);
  assert.match(await readFile(join(output, "decompiled", "sources", "io", "appium", "android", "apis", "ApiDemos.java"), "utf8"), /class ApiDemos/);
  assert.match(await readFile(join(output, "decompiled", "resources", "AndroidManifest.xml"), "utf8"), /io\.appium\.android\.apis/);
  assert.equal(typeof await readFile(join(output, "decompile.log"), "utf8"), "string");
  assert.match(await readFile(join(output, "report.md"), "utf8"), /io\.appium\.android\.apis/);
  await assert.rejects(cli(["analyze", apk, "--output", output]), /EEXIST|already exists/);
  await assert.rejects(cli([apk]), /EEXIST|already exists/);
  assert.equal(await readFile(join(output, "evidence.json"), "utf8"), savedText);
});

test("real APK class search, method source and incoming references use direct JADX results", options, async () => {
  const classes = await observation(["classes", apk, "ApiDemos"]);
  assert.ok(classes.items.some((item) => item.fqn === className));
  const inspectedClass = await observation(["class", apk, className]);
  assert.ok(inspectedClass.methods.some((method) => method.name === "onCreate"));
  const method = await observation(["method", apk, className, "onCreate", "--overload-index", "0"]);
  assert.equal(method.mode, "java");
  assert.equal(method.fell_back, false);
  assert.match(method.body, /getIntent\(\)/);
  const references = await observation(["references", apk, className, "--method-name", "activityIntent"]);
  assert.ok(references.total > 0);
  assert.ok(references.items.some((item) => item.name === "getData"));
});

test("public stdio MCP command supports APK loading and app inspection", options, async () => {
  const client = new Client({ name: "appunpack-integration", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entrypoint, "mcp"], cwd: scratch, env: environment(), stderr: "inherit" });
  let pid;
  try {
    await client.connect(transport, { timeout: 30_000 });
    pid = transport.pid;
    assert.ok(Number.isSafeInteger(pid));
    const loaded = toolValue(await client.callTool({ name: "load_apk", arguments: { path: apk } }, { timeout: 150_000 }));
    assert.equal(loaded.state, "LOADED");
    const info = toolValue(await client.callTool({ name: "get_app_info", arguments: {} }, { timeout: 30_000 }));
    assert.equal(info.package, "io.appium.android.apis");
  } finally {
    await client.close();
    await transport.close();
  }
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "MCP command remained running after transport closure");
});
