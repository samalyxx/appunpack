import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deviceId } from "../../src/device.mjs";
import { root } from "../../src/engine.mjs";
import { runTool } from "../../src/process.mjs";

const device = process.env.APPUNPACK_TEST_FRIDA_DEVICE;
const pid = process.env.APPUNPACK_TEST_FRIDA_PID;

test("explicit Android Frida target produces a bounded runtime capture through the public CLI", {
  skip: device && pid ? false : "Set APPUNPACK_TEST_FRIDA_DEVICE/PID to an already running authorized Android test process with Frida configured",
  timeout: 90_000,
}, async () => {
  deviceId(device);
  if (!/^[1-9][0-9]*$/.test(pid) || !Number.isSafeInteger(Number(pid)) || Number(pid) > 2_147_483_647) throw new Error("APPUNPACK_TEST_FRIDA_PID must be a positive process ID.");
  const scratch = await mkdtemp(join(tmpdir(), "appunpack-android-frida-"));
  try {
    const script = join(scratch, "observe.js");
    const output = join(scratch, "capture");
    await writeFile(script, "console.log(JSON.stringify({appunpack_android_test:true,pid:Process.id,platform:Process.platform,arch:Process.arch,has_art:Process.enumerateModules().some(m=>m.name==='libart.so')}));\n");
    const command = join(root, "bin", "appunpack.mjs");
    const listed = await runTool(process.execPath, [command, "frida-ps", "--device", device], { timeoutMs: 30_000 });
    assert.match(JSON.parse(listed.stdout), new RegExp(`(?:^|\\n)\\s*${pid}\\s`));
    await runTool(process.execPath, [command, "trace", pid, script, "--device", device, "--seconds", "2", "--output", output], { timeoutMs: 45_000 });
    const capture = JSON.parse(await readFile(join(output, "capture.json"), "utf8"));
    assert.equal(capture.device, device);
    assert.equal(capture.pid, Number(pid));
    assert.equal(capture.exit_code, 0);
    assert.equal(capture.requested_duration_ms, 2000);
    assert.equal(await readFile(join(output, "script.js"), "utf8"), await readFile(script, "utf8"));
    const lines = (await readFile(join(output, "frida.log"), "utf8")).split(/\r?\n/).filter((line) => line.startsWith('{"appunpack_android_test":'));
    assert.equal(lines.length, 1);
    const observed = JSON.parse(lines[0]);
    assert.equal(observed.pid, Number(pid));
    assert.equal(observed.platform, "linux");
    assert.equal(observed.has_art, true);
    assert.ok(["arm", "arm64", "ia32", "x64"].includes(observed.arch));
    await assert.rejects(runTool(process.execPath, [command, "trace", pid, script, "--device", device, "--seconds", "2", "--output", output]), /EEXIST|file already exists/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
