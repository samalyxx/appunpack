import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { javaCommand, root } from "./engine.mjs";
import { runTool } from "./process.mjs";
import { sha256 } from "./tools.mjs";

async function inputFile(input, maximum = 512 * 1024 * 1024) {
  const path = resolve(input);
  const info = await stat(path);
  if (!info.isFile() || info.size === 0 || info.size > maximum) throw new Error("Input must be a regular, nonempty file of at most 512 MiB.");
  return { path, bytes: info.size, sha256: await sha256(path) };
}

async function configuredFile(name, environment) {
  const path = environment[name];
  if (!path || !isAbsolute(path)) throw new Error(`Set ${name} to the absolute path of your installed tool.`);
  if (!(await stat(path)).isFile()) throw new Error(`${name} must select a regular file.`);
  return path;
}

async function newOutput(output) {
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output, { mode: 0o700 });
}

async function saveReport(output, report, input) {
  if (await sha256(input.path) !== input.sha256) throw new Error("Input changed during analysis; results cannot be trusted.");
  await writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return output;
}

async function archiveTool(args, environment, run) {
  const python = environment.APPUNPACK_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  const result = await run(python, [join(root, "src", "native.py"), ...args], {
    env: environment, timeoutMs: 60_000, maxOutputBytes: 4 * 1024 * 1024,
  });
  return JSON.parse(result.stdout);
}

export async function nativeLibraries(apk, environment = process.env, run = runTool) {
  return archiveTool(["check", resolve(apk)], environment, run);
}

export function elfHeader(bytes) {
  if (bytes.length < 52 || !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw new Error("Native input must be an ELF shared library (.so).");
  const bits = { 1: 32, 2: 64 }[bytes[4]];
  const endian = { 1: "little", 2: "big" }[bytes[5]];
  if (!bits || !endian || bytes[6] !== 1 || (bits === 64 && bytes.length < 64)) throw new Error("Invalid or truncated ELF header.");
  const number = (offset) => endian === "little" ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  if (number(16) !== 3) throw new Error("Native input must have the ELF shared-object type (ET_DYN).");
  return { bits, endian, machine: number(18) };
}

export async function decodeApk(apk, outputDirectory, environment = process.env, run = runTool) {
  const input = await inputFile(apk);
  const jar = await configuredFile("APPUNPACK_APKTOOL_JAR", environment);
  const jarDigest = await sha256(jar);
  const archive = await archiveTool(["check-decode", input.path], environment, run);
  const output = resolve(outputDirectory);
  await newOutput(output);
  const version = (await run(javaCommand(environment), ["-jar", jar, "--version"], { env: environment,
    timeoutMs: 30_000, maxOutputBytes: 64 * 1024, logPath: join(output, "version.log") })).stdout.trim();
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match || Number(match[1]) < 3 || (Number(match[1]) === 3 && Number(match[2]) === 0 && Number(match[3]) < 3)) {
    throw new Error("Apktool 3.0.3 or newer is required. See version.log.");
  }
  await run(javaCommand(environment), ["-jar", jar, "d", input.path, "--output", join(output, "decoded"),
    "--frame-path", join(output, "frameworks"), "--jobs", "1"], {
    env: environment, timeoutMs: 600_000, logPath: join(output, "decode.log"),
  });
  for (const name of ["AndroidManifest.xml", "apktool.yml"]) {
    if (!(await stat(join(output, "decoded", name))).isFile()) throw new Error(`Apktool did not produce ${name}; see decode.log.`);
  }
  if (await sha256(jar) !== jarDigest) throw new Error("Apktool JAR changed during decoding; results cannot be trusted.");
  return saveReport(output, { kind: "apktool-decode", input, archive, tool: { name: "Apktool", version, jar, sha256: jarDigest },
    decoded: "decoded", limitations: ["Smali and decoded resources are recovered representations; rebuilding or original source recovery is not guaranteed."] }, input);
}

export async function analyzeNative(library, outputDirectory, environment = process.env, run = runTool, member) {
  const original = await inputFile(library);
  const output = resolve(outputDirectory);
  let input = original;
  if (member !== undefined) {
    const archive = await nativeLibraries(original.path, environment, run);
    if (!archive.libraries.includes(member)) throw new Error("Select an existing library path from native-libs.");
    await newOutput(output);
    await archiveTool(["extract", original.path, member, join(output, "input.so")], environment, run);
    input = await inputFile(join(output, "input.so"));
  }
  const file = await open(input.path, "r");
  let elf;
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await file.read(header, 0, 64, 0);
    elf = elfHeader(header.subarray(0, bytesRead));
  } finally { await file.close(); }
  const home = environment.GHIDRA_HOME;
  if (!home || !isAbsolute(home)) throw new Error("Set GHIDRA_HOME to the absolute directory of your installed Ghidra distribution.");
  const utility = join(home, "Ghidra", "Framework", "Utility", "lib", "Utility.jar");
  const support = join(home, "support", "LaunchSupport.jar");
  for (const path of [utility, support]) if (!(await stat(path)).isFile()) throw new Error("GHIDRA_HOME must select an unpacked Ghidra binary distribution.");
  const properties = await readFile(join(home, "Ghidra", "application.properties"), "utf8");
  const version = /^application\.version=(.+)$/m.exec(properties)?.[1]?.trim() ?? "unknown";
  if (member === undefined) await newOutput(output);
  const javaHome = (await run(javaCommand(environment), ["-cp", support, "LaunchSupport", home, "-jdk_home"], {
    env: environment, timeoutMs: 30_000, maxOutputBytes: 64 * 1024, logPath: join(output, "jdk.log"),
  })).stdout.trim();
  if (!isAbsolute(javaHome)) throw new Error("Ghidra could not select a compatible JDK. Set JAVA_HOME; see jdk.log.");
  const java = javaCommand({ JAVA_HOME: javaHome });
  const vmargs = (await run(java, ["-cp", support, "LaunchSupport", home, "-vmargs"], {
    env: environment, timeoutMs: 30_000, maxOutputBytes: 64 * 1024, logPath: join(output, "vmargs.log"),
  })).stdout.split(/\r?\n/).filter(Boolean);
  await mkdir(join(output, "project"));
  for (const name of ["settings", "cache", "tmp"]) await mkdir(join(output, name));
  // Use Ghidra's Java bootstrap to preserve literal paths on Windows without batch expansion.
  await run(java, [...vmargs, "-Xmx2G", "-XX:ParallelGCThreads=2", "-XX:CICompilerCount=2", "-Djava.awt.headless=true",
    `-Dapplication.settingsdir=${join(output, "settings")}`, `-Dapplication.cachedir=${join(output, "cache")}`,
    `-Dapplication.tempdir=${join(output, "tmp")}`, `-Djava.io.tmpdir=${join(output, "tmp")}`,
    "-cp", utility, "ghidra.Ghidra", "ghidra.app.util.headless.AnalyzeHeadless", join(output, "project"), "AppUnpack",
    "-import", input.path, "-analysisTimeoutPerFile", "180", "-max-cpu", "1", "-scriptPath", join(root, "src"),
    "-postScript", "AppUnpackNative.java", output, "-log", join(output, "ghidra.log"), "-scriptlog", join(output, "script.log")], {
    env: environment, cwd: output, timeoutMs: 600_000, logPath: join(output, "native.log"),
  });
  const resultPath = join(output, "functions.json");
  if ((await stat(resultPath)).size > 16 * 1024 * 1024) throw new Error("Ghidra function report exceeded its 16 MiB budget.");
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  if (result.format !== "appunpack-native-v1" || !Array.isArray(result.functions)) throw new Error("Ghidra did not produce the expected function report; see native.log.");
  if (await sha256(original.path) !== original.sha256) throw new Error("Input changed during analysis; results cannot be trusted.");
  return saveReport(output, { kind: "ghidra-native-analysis", input, ...(member === undefined ? {} : { apk: original, member }), elf, tool: { name: "Ghidra", version, home },
    status: result.partial ? "partial" : "complete_within_limits", functions: result.functions.length,
    decompiled: result.decompiled, failed: result.failed, pseudocode: "pseudocode.c", functionReport: "functions.json",
    limitations: ["Pseudocode is reconstructed, not original C/C++ source. Target code was not executed.",
      "Auto-analysis: 180 seconds; decompilation: 180 seconds total, 15 seconds per function, 5000 functions and 16 MiB pseudocode.",
      "Ghidra's project is retained for further manual analysis."] }, input);
}
