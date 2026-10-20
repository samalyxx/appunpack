import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { javaCommand, root } from "../../src/engine.mjs";
import { prepareSplits } from "../../src/splits.mjs";

const execute = promisify(execFile);
const enabled = Boolean(process.env.APPUNPACK_JADX_JAR);
const options = { skip: enabled ? false : "Set APPUNPACK_JADX_JAR and JAVA_HOME to test the pinned JADX manifest parser", timeout: 120_000 };
const python = process.env.APPUNPACK_PYTHON ?? (process.platform === "win32" ? "python" : "python3");

async function fixture(directory, parts) {
  await execute(python, ["-c", `import json,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); root.mkdir()
for index,manifest in enumerate(json.loads(sys.argv[2])):
 with zipfile.ZipFile(root / ('part-%03d.apk' % index),'w') as archive:
  archive.writestr('AndroidManifest.xml',manifest)
  archive.writestr('assets/part-%03d.txt' % index,'fixture')
`, directory, JSON.stringify(parts)], { windowsHide: true });
}

const manifest = (split = "", changes = "") => `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="org.example.split" android:versionCode="7" ${split ? `split="${split}"` : ""} ${changes}><application/></manifest>`;

test("split identities require one base, same package/version and unique split names", options, async () => {
  const scratch = await mkdtemp(join(tmpdir(), "appunpack-split-identities-"));
  try {
    const directory = join(scratch, "valid");
    await fixture(directory, [manifest("feature"), manifest()]);
    const prepared = await prepareSplits(directory, join(scratch, "report"));
    assert.equal(prepared.package, "org.example.split");
    assert.equal(prepared.parts[0].split, "");
    assert.equal(prepared.parts[1].split, "feature");
    assert.equal(prepared.apks.length, 2);
    for (const part of prepared.parts) assert.match(part.sha256, /^[0-9a-f]{64}$/);
    await assert.rejects(prepareSplits(directory, join(scratch, "report")), /exist/i);

    const failures = [
      [[manifest(), manifest()], /Repeated base\/split/],
      [[manifest("feature")], /exactly one base/],
      [[manifest(), manifest("feature").replace('versionCode="7"', 'versionCode="8"')], /different package names or version codes/],
      [[manifest(), manifest("feature").replace('org.example.split', 'org.example.other')], /different package names or version codes/],
      [[manifest(), manifest("config", 'configForSplit="missing"')], /missing feature split/],
      [[manifest().replace("<application/>", '<uses-split android:name="missing"/><application/>'), manifest("feature")], /required feature split is missing/],
    ];
    for (let index = 0; index < failures.length; index++) {
      const [parts, message] = failures[index];
      const failed = join(scratch, `invalid-${index}`);
      await fixture(failed, parts);
      await assert.rejects(prepareSplits(failed, join(scratch, `failed-report-${index}`)), (error) => message.test(error.result?.stderr ?? error.message));
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("multi-input export retains resource payloads from both APK parts", options, async () => {
  const scratch = await mkdtemp(join(tmpdir(), "appunpack-split-export-"));
  try {
    const directory = join(scratch, "valid");
    await fixture(directory, [manifest(), manifest("feature")]);
    const prepared = await prepareSplits(directory, join(scratch, "report"));
    const output = join(scratch, "exported");
    await execute(javaCommand(), ["-cp", process.env.APPUNPACK_JADX_JAR, join(root, "src", "Export.java"), prepared.apks[0], output, ...prepared.apks.slice(1)], { windowsHide: true, timeout: 60_000 });
    assert.equal(await readFile(join(output, "resources", "assets", "part-000.txt"), "utf8"), "fixture");
    assert.equal(await readFile(join(output, "resources", "assets", "part-001.txt"), "utf8"), "fixture");
    assert.match(await readFile(join(output, "part-resources", "part-000", "AndroidManifest.xml"), "utf8"), /org\.example\.split/);
    assert.match(await readFile(join(output, "part-resources", "part-001", "AndroidManifest.xml"), "utf8"), /split="feature"/);
    const stats = JSON.parse(await readFile(join(output, "export.json"), "utf8"));
    assert.ok(stats.resources >= 4);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
