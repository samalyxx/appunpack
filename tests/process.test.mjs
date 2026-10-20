import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runTool } from "../src/process.mjs";

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "appunpack-process-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("tool runner preserves literal arguments and retains stdout/stderr", async (t) => {
  const output = await directory(t);
  const logPath = join(output, "tool.log");
  const literals = ["path with spaces & $(echo x);|.apk", "--untrusted=literal"];
  const result = await runTool(process.execPath, ["-e", "console.log(JSON.stringify(process.argv.slice(1))); console.error('diagnostic')", "--", ...literals], { logPath });
  assert.deepEqual(JSON.parse(result.stdout), literals);
  assert.equal(result.stderr.trim(), "diagnostic");
  assert.equal(result.code, 0);
  assert.match(await readFile(logPath, "utf8"), /diagnostic/);
  await assert.rejects(runTool(process.execPath, ["-e", "throw Error('must not run')"], { logPath }), { code: "EEXIST" });
});

test("tool failures retain bounded diagnostics and nonzero status", async (t) => {
  const output = await directory(t);
  const logPath = join(output, "failed.log");
  await assert.rejects(runTool(process.execPath, ["-e", "console.error('expected failure');process.exit(7)"], { logPath }), (error) => {
    assert.equal(error.result.code, 7);
    assert.equal(error.result.stderr.trim(), "expected failure");
    return /exited with 7/.test(error.message);
  });
  assert.match(await readFile(logPath, "utf8"), /expected failure/);
});

test("tool output budget stops and drains an excessive child", async () => {
  await assert.rejects(runTool(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000)"], { maxOutputBytes: 64 }), (error) => {
    assert.equal(Buffer.byteLength(error.result.stdout), 64);
    return /output exceeded/.test(error.message);
  });
});

test("tool deadlines terminate long-running children and support deliberate capture boundaries", async () => {
  const args = ["-e", "setInterval(()=>{},1000)"];
  await assert.rejects(runTool(process.execPath, args, { timeoutMs: 200 }), /deadline/);
  const capture = await runTool(process.execPath, args, { timeoutMs: 200, allowTimeout: true });
  assert.equal(capture.timedOut, true);
  assert.notEqual(capture.code, 0);
});

test("tool deadline also terminates a child process tree", async () => {
  let descendant;
  try {
    await assert.rejects(runTool(process.execPath, ["-e", "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});console.log(c.pid);setInterval(()=>{},1000)"], { timeoutMs: 1000 }), (error) => {
      descendant = Number(error.result.stdout.trim());
      return /deadline/.test(error.message);
    });
    assert.ok(Number.isSafeInteger(descendant) && descendant > 0);
    try {
      process.kill(descendant, 0);
      assert.equal(process.platform, "linux");
      assert.match(await readFile(`/proc/${descendant}/stat`, "utf8"), /^\d+ \(.+\) Z /);
    } catch (error) {
      if (error.code !== "ESRCH" && error.code !== "ENOENT") throw error;
    }
  } finally {
    if (descendant) try { process.kill(descendant, "SIGKILL"); } catch {}
  }
});

test("tool cancellation terminates the child and an aborted run creates no log", async (t) => {
  const output = await directory(t);
  const controller = new AbortController();
  const capture = runTool(process.execPath, ["-e", "setInterval(()=>{},1000)"], { signal: controller.signal });
  setTimeout(() => controller.abort(), 200);
  await assert.rejects(capture, /cancelled/);
  await assert.rejects(runTool(process.execPath, [], { signal: controller.signal, logPath: join(output, "absent.log") }));
  await assert.rejects(readFile(join(output, "absent.log")), { code: "ENOENT" });
});

test("tool runner retains spawn failures and rejects unsafe process options", async (t) => {
  const output = await directory(t);
  await assert.rejects(runTool(join(output, "missing-command"), [], { logPath: join(output, "missing.log") }), { code: "ENOENT" });
  assert.equal(await readFile(join(output, "missing.log"), "utf8"), "");
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: Infinity }, { maxOutputBytes: -1 }]) {
    await assert.rejects(runTool(process.execPath, [], options), /timeout|budget/);
  }
  await assert.rejects(runTool(process.execPath, ["bad\0argument"]), /literal/);
  if (process.platform === "win32") await assert.rejects(runTool("fake.cmd", []), /batch/);
});
