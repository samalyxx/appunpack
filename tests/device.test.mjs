import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { attachFrida, captureLogcat, deviceId, listDevices, listFridaProcesses, listPackages, packageId, packagePaths, pullPackage } from "../src/device.mjs";
import { runTool } from "../src/process.mjs";

test("device/package/path validation rejects shell syntax and untrusted output", () => {
  for (const value of ["emulator-5580", "192.168.1.2:5555", "local", "USB_0123"]) assert.equal(deviceId(value), value);
  for (const value of [undefined, "", "-s", "dev other", "$(echo x)", "dev;echo", "a\n"]) assert.throws(() => deviceId(value), /device/);
  for (const value of ["com.example.app", "android", "my.test_app2"]) assert.equal(packageId(value), value);
  for (const value of ["com..app", "--help", "com.app;echo", "com.app x", "x\n"]) assert.throws(() => packageId(value), /package/);
  assert.deepEqual(packagePaths("package:/data/app/base.apk\r\npackage:/data/app/split_config.en.apk\r\n"), ["/data/app/base.apk", "/data/app/split_config.en.apk"]);
  for (const value of ["", "Error: package missing", "package:relative.apk", "package:/data/a.apk\nmalformed", "package:/data/a\0.apk"]) assert.throws(() => packagePaths(value), /paths|path/);
});

async function fakeTool(t) {
  const directory = await mkdtemp(join(tmpdir(), "appunpack-device-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = join(directory, "calls.txt");
  let command;
  if (process.platform === "win32") {
    const compiler = join(process.env.SystemRoot, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    if (!existsSync(compiler)) { t.skip("Windows C# compiler is unavailable for the synthetic executable fixture."); return; }
    const source = join(directory, "fixture.cs");
    command = join(directory, "fixture.exe");
    await writeFile(source, `using System; using System.IO; using System.Threading;
class Fixture { static int Main(string[] args) {
  File.AppendAllText(Environment.GetEnvironmentVariable("FAKE_DEVICE_CALLS"), String.Join("\\t", args) + "\\n");
  if (Environment.GetEnvironmentVariable("FAKE_DEVICE_FAIL") == "1") { Console.Error.WriteLine("synthetic failure"); return 9; }
  string line = String.Join(" ", args);
  if (line == "devices -l") Console.WriteLine("List of devices attached\\nfake-123 device product:test");
  else if (line.Contains("shell pm list packages")) Console.WriteLine("package:com.example.app");
  else if (line.Contains("shell pm path")) Console.WriteLine("package:/data/app/base.apk\\npackage:/data/app/a name & $(never)/split_config.en.apk");
  else if (args.Length > 2 && args[2] == "pull") File.WriteAllText(args[4], "synthetic APK " + args[3]);
  else if (line.Contains("logcat")) { Console.WriteLine("synthetic log line"); Thread.Sleep(Timeout.Infinite); }
  else Console.WriteLine("synthetic Frida output");
  return 0;
} }`);
    await runTool(compiler, ["/nologo", `/out:${command}`, source]);
  } else {
    command = join(directory, "fixture");
    await writeFile(command, `#!${process.execPath}\nimport fs from 'node:fs';
const args = process.argv.slice(2), line = args.join(' ');
fs.appendFileSync(process.env.FAKE_DEVICE_CALLS, args.join('\\t')+'\\n');
if(process.env.FAKE_DEVICE_FAIL === '1') { console.error('synthetic failure'); process.exit(9); }
if(line === 'devices -l') console.log('List of devices attached\\nfake-123 device product:test');
else if(line.includes('shell pm list packages')) console.log('package:com.example.app');
else if(line.includes('shell pm path')) console.log('package:/data/app/base.apk\\npackage:/data/app/a name & $(never)/split_config.en.apk');
else if(args[2] === 'pull') fs.writeFileSync(args[4], 'synthetic APK '+args[3]);
else if(line.includes('logcat')) { console.log('synthetic log line');setInterval(()=>{},1000); }
else console.log('synthetic Frida output');\n`);
    await chmod(command, 0o700);
  }
  return { directory, calls, options: { adb: command, frida: command, fridaPs: command,
    device: "fake-123", env: { ...process.env, FAKE_DEVICE_CALLS: calls } } };
}

test("device workflows use explicit targets, literal paths, retained evidence and exclusive output", async (t) => {
  const fixture = await fakeTool(t);
  if (!fixture) return;
  const { directory, calls, options } = fixture;
  assert.match(await listDevices(options), /fake-123 device/);
  assert.equal((await listPackages(options)).trim(), "package:com.example.app");
  const output = join(directory, "pulled APKs & literal");
  assert.equal(await pullPackage("com.example.app", output, options), output);
  const evidence = JSON.parse(await readFile(join(output, "pull.json"), "utf8"));
  assert.equal(evidence.files.length, 2);
  assert.equal(evidence.files[1].file, "002.apk");
  assert.match(evidence.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(join(output, "002.apk"), "utf8"), "synthetic APK /data/app/a name & $(never)/split_config.en.apk");
  const observed = (await readFile(calls, "utf8")).split("\n").filter(Boolean).map((line) => line.split("\t"));
  assert.deepEqual(observed.find((args) => args[2] === "pull" && args[3].includes("$(never)")), ["-s", "fake-123", "pull", "/data/app/a name & $(never)/split_config.en.apk", join(output, "002.apk")]);
  await assert.rejects(pullPackage("com.example.app", output, options), { code: "EEXIST" });
  assert.equal(JSON.parse(await readFile(join(output, "pull.json"), "utf8")).files.length, 2);
  const logOutput = join(directory, "logcat");
  await captureLogcat(logOutput, { ...options, durationMs: 1000 });
  assert.match(await readFile(join(logOutput, "logcat.log"), "utf8"), /synthetic log/);
  assert.equal(JSON.parse(await readFile(join(logOutput, "capture.json"), "utf8")).duration_boundary_reached, true);
  assert.match(await listFridaProcesses(options), /synthetic Frida/);
  const script = join(directory, "script & literal.js");
  await writeFile(script, "console.log('own process only');\n");
  const trace = join(directory, "trace");
  await attachFrida(123, script, trace, { ...options, durationMs: 1000 });
  assert.equal(await readFile(join(trace, "script.js"), "utf8"), await readFile(script, "utf8"));
  assert.equal(JSON.parse(await readFile(join(trace, "capture.json"), "utf8")).pid, 123);
  const failed = join(directory, "failed-pull");
  await assert.rejects(pullPackage("com.example.app", failed, { ...options, env: { ...options.env, FAKE_DEVICE_FAIL: "1" } }), /synthetic failure.*\nPull directory/s);
  assert.match(await readFile(join(failed, "package-paths.log"), "utf8"), /synthetic failure/);
});

test("invalid runtime requests fail before tool execution or output creation", async () => {
  await assert.rejects(listPackages({}), /device/);
  await assert.rejects(pullPackage("com.app;echo", "unused", { device: "safe" }), /package/);
  await assert.rejects(captureLogcat("unused", { device: "safe", durationMs: 0 }), /duration/);
  await assert.rejects(attachFrida("--help", "unused.js", "unused", { device: "local" }), /process ID/);
  await assert.rejects(attachFrida(42, "unused.js", "unused", { device: "-D" }), /device/);
});
