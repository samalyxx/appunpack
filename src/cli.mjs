import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { forwardProcess, javaArgs, javaCommand, root, selectedJar, withEngine } from "./engine.mjs";
import { analyze, inspectPackage } from "./report.mjs";
import { installTools } from "./tools.mjs";

const HELP = `APK Lens — local Android analysis and static iOS package inspection

Usage: node bin/apk-lens.mjs COMMAND [arguments]

  install-tools [DIRECTORY]          Download and SHA-256 verify JADX
  doctor                            Check Java/JADX MCP readiness
  analyze APK --output NEW_DIR       Save evidence, manifest, and a readable report
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
  for (const name of ["JAVA_HOME", "APK_LENS_JADX_JAR", "APK_LENS_HEAP_MIB"]) if (environment[name]) env[name] = environment[name];
  return { mcpServers: { "apk-lens": {
    command: process.execPath,
    args: [fileURLToPath(new URL("../bin/apk-lens.mjs", import.meta.url)), "mcp"],
    env,
  } } };
}

export function parseCommand(args) {
  return parseArgs({ args, allowPositionals: true, options: {
    output: { type: "string" }, "overload-index": { type: "string" },
    "method-name": { type: "string" }, query: { type: "string" }, json: { type: "boolean" },
  } });
}

export async function main(args) {
  const [command, ...rest] = args;
  if (!command || ["--help", "-h", "help"].includes(command)) { process.stdout.write(HELP); return 0; }
  if (command === "--version") { process.stdout.write("apk-lens 0.1.0\n"); return 0; }
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
  const counts = { inspect: 1, analyze: 1, classes: 2, class: 2, source: 2, method: 3, references: 2, resources: 1, ipa: 1 };
  if (!Object.hasOwn(counts, command)) throw new Error(`Unknown command: ${command}. Use --help.`);
  const { values, positionals } = parseCommand(rest);
  if (positionals.length !== counts[command]) throw new Error(`Wrong arguments for ${command}. Use --help.`);
  const allowed = {
    analyze: ["output"], ipa: ["output"], method: ["overload-index", "json"],
    references: ["method-name", "json"], resources: ["query", "json"],
  };
  for (const option of Object.keys(values)) {
    if (!(allowed[command] ?? ["json"]).includes(option)) throw new Error(`--${option} is not supported for ${command}.`);
  }
  const [apk, className, methodName] = positionals;
  if (["analyze", "ipa"].includes(command)) {
    if (!values.output) throw new Error(`${command} requires --output NEW_DIRECTORY.`);
    if (command === "ipa") return forwardProcess(process.env.APK_LENS_PYTHON ?? (process.platform === "win32" ? "python" : "python3"), [join(root, "src", "ipa.py"), resolve(apk), "--output", values.output]);
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
