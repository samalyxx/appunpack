import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeNative, decodeApk, elfHeader } from "../src/static-tools.mjs";

function elf(bits = 64, bigEndian = false) {
  const bytes = Buffer.alloc(bits === 64 ? 64 : 52);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, bits === 64 ? 2 : 1, bigEndian ? 2 : 1, 1]);
  if (bigEndian) { bytes.writeUInt16BE(3, 16); bytes.writeUInt16BE(183, 18); }
  else { bytes.writeUInt16LE(3, 16); bytes.writeUInt16LE(183, 18); }
  return bytes;
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "appunpack-static-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "literal & $().so");
  await writeFile(input, elf());
  const home = join(directory, "Ghidra with spaces & literal");
  await mkdir(join(home, "Ghidra", "Framework", "Utility", "lib"), { recursive: true });
  await mkdir(join(home, "support"));
  await writeFile(join(home, "Ghidra", "Framework", "Utility", "lib", "Utility.jar"), "test utility");
  await writeFile(join(home, "support", "LaunchSupport.jar"), "test launch");
  await writeFile(join(home, "Ghidra", "application.properties"), "application.version=11.4.3\n");
  const output = join(directory, "new output & literal$()");
  return { input, output, directory, environment: { GHIDRA_HOME: home, JAVA_HOME: join(directory, "Java 21") } };
}

test("ELF preflight handles supported widths and byte orders, rejects wrong formats", () => {
  assert.deepEqual(elfHeader(elf()), { bits: 64, endian: "little", machine: 183 });
  assert.deepEqual(elfHeader(elf(32, true)), { bits: 32, endian: "big", machine: 183 });
  assert.throws(() => elfHeader(Buffer.from("MZwrong")), /ELF shared library/);
  assert.throws(() => elfHeader(elf().subarray(0, 52)), /truncated/);
  const executable = elf(); executable.writeUInt16LE(2, 16);
  assert.throws(() => elfHeader(executable), /ET_DYN/);
});

test("Apktool decoding preserves literal paths, isolates frameworks, never uses force", async (t) => {
  const { input, output, directory, environment } = await fixture(t);
  const jar = join(directory, "Apktool & local.jar");
  await writeFile(jar, "test jar");
  environment.APPUNPACK_APKTOOL_JAR = jar;
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes("check")) return { stdout: '{"libraries":[],"entries":2}' };
    if (args.includes("--version")) return { stdout: "3.0.3\n" };
    await mkdir(join(output, "decoded"));
    await writeFile(join(output, "decoded", "AndroidManifest.xml"), "<manifest/>");
    await writeFile(join(output, "decoded", "apktool.yml"), "version: 3.0.3");
    return { stdout: "decoded", code: 0 };
  };
  assert.equal(await decodeApk(input, output, environment, run), output);
  const decode = calls.at(-1);
  assert.equal(decode.args[decode.args.indexOf("d") + 1], input);
  assert.equal(decode.args[decode.args.indexOf("-jar") + 1], jar);
  assert.equal(decode.args[decode.args.indexOf("--frame-path") + 1], join(output, "frameworks"));
  assert.ok(!decode.args.some((arg) => ["--force", "-f"].includes(arg)));
  assert.equal(JSON.parse(await readFile(join(output, "report.json"))).tool.version, "3.0.3");
  const count = calls.length;
  await assert.rejects(decodeApk(input, output, environment, run), { code: "EEXIST" });
  assert.equal(calls.length, count + 1);
});

test("Apktool rejects an older tool and preserves the diagnostic directory", async (t) => {
  const { input, output, directory, environment } = await fixture(t);
  environment.APPUNPACK_APKTOOL_JAR = join(directory, "apktool.jar");
  await writeFile(environment.APPUNPACK_APKTOOL_JAR, "test jar");
  let javaCalls = 0;
  await assert.rejects(decodeApk(input, output, environment, async (_command, args) => {
    if (args.includes("check")) return { stdout: '{"libraries":[]}' };
    javaCalls++;
    return { stdout: "2.12.1\n" };
  }), /3\.0\.3 or newer/);
  assert.equal(javaCalls, 1);
  assert.deepEqual(await readdir(output), []);
});

test("native analysis uses Ghidra Java bootstrap and requires a successful export", async (t) => {
  const { input, output, environment } = await fixture(t);
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes("-jdk_home")) return { stdout: environment.JAVA_HOME };
    if (args.includes("-vmargs")) return { stdout: "-Djava.system.class.loader=ghidra.GhidraClassLoader\r\n-Dfile.encoding=UTF8\r\n" };
    await writeFile(join(output, "functions.json"), JSON.stringify({ format: "appunpack-native-v1", functions: [{ name: "score" }], decompiled: 1, failed: 0, partial: false }));
    await writeFile(join(output, "pseudocode.c"), "int score(int x) { return x * 7 + 3; }");
    return { stdout: "done", code: 0 };
  };
  assert.equal(await analyzeNative(input, output, environment, run), output);
  const native = calls.at(-1);
  assert.equal(native.args[native.args.indexOf("-import") + 1], input);
  assert.ok(native.args.includes("ghidra.Ghidra"));
  assert.ok(native.args.includes("-Djava.system.class.loader=ghidra.GhidraClassLoader"));
  assert.ok(!native.args.includes("-overwrite"));
  assert.match(native.command, /Java 21[\\/]bin[\\/]java/);
  assert.equal(native.options.timeoutMs, 600_000);
  const report = JSON.parse(await readFile(join(output, "report.json")));
  assert.equal(report.tool.version, "11.4.3");
  assert.equal(report.status, "complete_within_limits");
  const count = calls.length;
  await assert.rejects(analyzeNative(input, output, environment, run), { code: "EEXIST" });
  assert.equal(calls.length, count);
});

test("native extraction accepts only an exact listed APK member", async (t) => {
  const { input, output, environment } = await fixture(t);
  const member = "lib/arm64-v8a/libapp.so";
  const run = async (_command, args) => {
    if (args.includes("check")) return { stdout: JSON.stringify({ libraries: [member] }) };
    throw new Error("Must not extract or run Ghidra");
  };
  await assert.rejects(analyzeNative(input, output, environment, run, "../../outside.so"), /existing library path/);
  await assert.rejects(readFile(join(output, "input.so")), { code: "ENOENT" });
});

test("a successful Ghidra process without its export is an analysis failure", async (t) => {
  const { input, output, environment } = await fixture(t);
  await assert.rejects(analyzeNative(input, output, environment, async (_command, args) => {
    if (args.includes("-jdk_home")) return { stdout: environment.JAVA_HOME };
    return { stdout: "", code: 0 };
  }), { code: "ENOENT" });
  await assert.rejects(readFile(join(output, "report.json")), { code: "ENOENT" });
});
