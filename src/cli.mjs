import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { forwardProcess, javaArgs, javaCommand, root, selectedJar, withEngine } from "./engine.mjs";
import { analyze, analyzeSplits, inspectPackage } from "./report.mjs";
import { installTools } from "./tools.mjs";
import { analyzeNative, decodeApk, nativeLibraries } from "./static-tools.mjs";
import { attachFrida, captureLogcat, listDevices, listFridaProcesses, listPackages, pullPackage } from "./device.mjs";

const HELP = `AppUnpack — local Android analysis and static iOS package inspection

Usage: node bin/appunpack.mjs COMMAND [arguments]

  install-tools [DIRECTORY]          Download and SHA-256 verify JADX
  doctor                            Check Java/JADX MCP readiness
  APK [--output NEW_DIR]             Export code/resources, evidence, and report
  analyze APK [--output NEW_DIR]     Same; default is APK_NAME-analysis beside APK
  splits SET --output NEW_DIR        Analyze a directory/.apks/.xapk split set
  decode APK --output NEW_DIR        Apktool resource and smali decoding
  native LIB.so --output NEW_DIR     Ghidra native pseudocode and functions
  native-libs APK                    List native library members in an APK
  native APK --library MEMBER --output NEW_DIR   Extract and analyze one .so
  devices                           List connected ADB devices
  packages --device SERIAL          List installed Android packages
  pull PACKAGE --device SERIAL --output NEW_DIR   Pull base and split APKs
  logcat --device SERIAL --seconds N --output NEW_DIR   Capture device logs
  frida-ps --device ID               List processes through Frida
  trace PID SCRIPT.js --device ID --seconds N --output NEW_DIR   Attach Frida
  inspect APK                       App declarations and decoded manifest
  classes APK QUERY                 Search class names
  class APK CLASS_NAME              Class summary, methods, fields
  source APK CLASS_NAME             Decompiled Java (may fall back to smali)
  method APK CLASS_NAME METHOD      Method body; --overload-index N
  references APK CLASS_NAME         Class callers; --method-name NAME
  resources APK                     String resources; --query FILTER
  ipa IPA_PATH --output NEW_DIR      Static iOS ZIP/plist report (requires Python)
  mcp                              Start the Android JADX stdio MCP server
  mcp-config                       Print stdio MCP JSON for this checkout

JSON is the default analysis output. --json is accepted explicitly.
Inspect and decompile only files you are authorized to analyze.
`;

export function mcpConfig(environment = process.env) {
  const env = {};
  for (const name of ["JAVA_HOME", "APPUNPACK_JADX_JAR", "APPUNPACK_HEAP_MIB"]) if (environment[name]) env[name] = environment[name];
  return { mcpServers: { "appunpack": {
    command: process.execPath,
    args: [fileURLToPath(new URL("../bin/appunpack.mjs", import.meta.url)), "mcp"],
    env,
  } } };
}

export function parseCommand(args) {
  return parseArgs({ args, allowPositionals: true, options: {
    output: { type: "string" }, "overload-index": { type: "string" },
    "method-name": { type: "string" }, query: { type: "string" }, json: { type: "boolean" },
    device: { type: "string" }, seconds: { type: "string" }, library: { type: "string" },
  } });
}

export async function main(args) {
  let [command, ...rest] = args;
  if (!command || ["--help", "-h", "help"].includes(command)) { process.stdout.write(HELP); return 0; }
  if (command === "--version") { process.stdout.write("appunpack 0.2.1\n"); return 0; }
  if (command === "install-tools") {
    if (rest.length > 1 || rest[0]?.startsWith("-")) throw new Error("Usage: install-tools [DIRECTORY]");
    process.stdout.write(`Verified JADX: ${await installTools(rest[0] ?? join(root, ".tools"))}\n`);
    return 0;
  }
  if (command === "mcp-config") {
    if (rest.length) throw new Error("mcp-config accepts no arguments.");
    process.stdout.write(`${JSON.stringify(mcpConfig(), null, 2)}\n`);
    return 0;
  }
  if (command === "mcp") {
    if (rest.length) throw new Error("mcp accepts no arguments; local stdio transport is used.");
    return forwardProcess(javaCommand(), javaArgs(await selectedJar()));
  }
  if (command === "doctor") {
    if (rest.some((arg) => arg !== "--json")) throw new Error("Usage: doctor [--json]");
    const result = await withEngine(undefined, async (call, client) => ({
      healthy: true, engine: client.getServerVersion(), status: await call("status"),
    }));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (/\.apk$/i.test(command)) { rest = [command, ...rest]; command = "analyze"; }
  if (/\.(apks|xapk)$/i.test(command)) { rest = [command, ...rest]; command = "splits"; }
  const counts = { inspect: 1, analyze: 1, classes: 2, class: 2, source: 2, method: 3, references: 2, resources: 1, ipa: 1,
    splits: 1, decode: 1, native: 1, "native-libs": 1, devices: 0, packages: 0, pull: 1, logcat: 0, "frida-ps": 0, trace: 2 };
  if (!Object.hasOwn(counts, command)) throw new Error(`Unknown command: ${command}. Use --help.`);
  const { values, positionals } = parseCommand(rest);
  if (positionals.length !== counts[command]) throw new Error(`Wrong arguments for ${command}. Use --help.`);
  const allowed = {
    analyze: ["output"], ipa: ["output"], method: ["overload-index", "json"],
    references: ["method-name", "json"], resources: ["query", "json"],
    splits: ["output"], decode: ["output"], native: ["output", "library"], "native-libs": ["json"], devices: ["json"], packages: ["device", "json"],
    pull: ["device", "output"], logcat: ["device", "seconds", "output"], "frida-ps": ["device", "json"],
    trace: ["device", "seconds", "output"],
  };
  for (const option of Object.keys(values)) {
    if (!(allowed[command] ?? ["json"]).includes(option)) throw new Error(`--${option} is not supported for ${command}.`);
  }
  const [apk, className, methodName] = positionals;
  if (["splits", "decode", "native", "pull", "logcat", "trace"].includes(command) && !values.output) throw new Error(`${command} requires --output NEW_DIRECTORY.`);
  if (["packages", "pull", "logcat", "frida-ps", "trace"].includes(command) && !values.device) throw new Error(`${command} requires --device to select the target explicitly.`);
  let durationMs;
  if (["logcat", "trace"].includes(command)) {
    if (!/^[1-9][0-9]*$/.test(values.seconds ?? "") || !Number.isSafeInteger(Number(values.seconds)) || Number(values.seconds) > 300) throw new Error("--seconds must be an integer from 1 to 300.");
    durationMs = Number(values.seconds) * 1000;
  }
  const deviceOptions = { device: values.device, durationMs };
  let extraResult;
  switch (command) {
    case "splits": extraResult = await analyzeSplits(apk, values.output); break;
    case "decode": extraResult = await decodeApk(apk, values.output); break;
    case "native": extraResult = await analyzeNative(apk, values.output, process.env, undefined, values.library); break;
    case "native-libs": extraResult = await nativeLibraries(apk); break;
    case "devices": extraResult = await listDevices(); break;
    case "packages": extraResult = await listPackages(deviceOptions); break;
    case "pull": extraResult = await pullPackage(apk, values.output, deviceOptions); break;
    case "logcat": extraResult = await captureLogcat(values.output, deviceOptions); break;
    case "frida-ps": extraResult = await listFridaProcesses(deviceOptions); break;
    case "trace": extraResult = await attachFrida(apk, className, values.output, deviceOptions); break;
  }
  if (extraResult !== undefined) { process.stdout.write(`${JSON.stringify(extraResult, null, 2)}\n`); return 0; }
  if (["analyze", "ipa"].includes(command)) {
    if (command === "ipa" && !values.output) throw new Error("ipa requires --output NEW_DIRECTORY.");
    if (command === "ipa") return forwardProcess(process.env.APPUNPACK_PYTHON ?? (process.platform === "win32" ? "python" : "python3"), [join(root, "src", "ipa.py"), resolve(apk), "--output", values.output]);
    process.stdout.write(`Report saved: ${await analyze(apk, values.output)}\n`);
    return 0;
  }
  const overload = values["overload-index"];
  if (overload !== undefined && (!/^(0|[1-9][0-9]*)$/.test(overload) || !Number.isSafeInteger(Number(overload)))) throw new Error("--overload-index must be a nonnegative integer.");
  const result = await withEngine(apk, async (call) => {
    switch (command) {
      case "inspect": return inspectPackage(call);
      case "classes": return call("search_classes_by_keyword", { search_term: className });
      case "class": return call("get_class_summary", { class_name: className });
      case "source": return call("get_class_source", { class_name: className });
      case "method": return call("get_method_body", { class_name: className, method_name: methodName, ...(overload === undefined ? {} : { overload_index: Number(overload) }) });
      case "references": return call(values["method-name"] ? "get_xrefs_to_method" : "get_xrefs_to_class", { class_name: className, ...(values["method-name"] ? { method_name: values["method-name"] } : {}) });
      case "resources": return call("get_strings", values.query ? { filter: values.query } : {});
    }
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}
