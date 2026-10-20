import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { JADX, sha256 } from "./tools.mjs";
import { runTool } from "./process.mjs";

export const root = fileURLToPath(new URL("..", import.meta.url));

export function javaCommand(environment = process.env) {
  return environment.JAVA_HOME ? join(environment.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";
}

export function javaOptions(environment = process.env) {
  const heap = environment.APPUNPACK_HEAP_MIB;
  if (heap !== undefined && (!/^[1-9][0-9]*$/.test(heap) || !Number.isSafeInteger(Number(heap)))) throw new Error("APPUNPACK_HEAP_MIB must be a positive integer in MiB.");
  return [...(heap ? [`-Xmx${heap}m`] : []), "-Dorg.slf4j.simpleLogger.defaultLogLevel=warn"];
}

export function javaArgs(jar, environment = process.env) {
  return [...javaOptions(environment), "-jar", jar, "--threads", "1"];
}

export async function selectedJar(environment = process.env) {
  const jar = environment.APPUNPACK_JADX_JAR ?? join(root, ".tools", JADX.filename);
  if (!isAbsolute(jar)) throw new Error("APPUNPACK_JADX_JAR must be an absolute path.");
  let digest;
  try { digest = await sha256(jar); } catch (error) {
    if (error.code === "ENOENT") throw new Error("JADX is missing. Run install-tools or set APPUNPACK_JADX_JAR to the verified JAR.");
    throw error;
  }
  if (digest !== JADX.sha256) throw new Error("The selected JADX JAR does not match the pinned SHA-256. Run install-tools into a new directory.");
  return jar;
}

export function toolValue(reply) {
  if (reply.isError) throw new Error(reply.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") || "JADX tool failed.");
  if (reply.structuredContent !== undefined) return reply.structuredContent;
  const text = reply.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n");
  if (text === undefined) throw new Error("JADX returned no text or structured result.");
  if (/^\s*(?:\/\/\s*)?ERROR:/i.test(text)) throw new Error(text);
  try { return JSON.parse(text); } catch { return text; }
}

export async function withEngine(apk, callback) {
  const jar = await selectedJar();
  const client = new Client({ name: "appunpack", version: "0.2.1" });
  const transport = new StdioClientTransport({ command: javaCommand(), args: javaArgs(jar), stderr: "inherit" });
  try {
    await client.connect(transport, { timeout: 30_000 });
    const call = async (name, args = {}) => toolValue(await client.callTool({ name, arguments: args }, { timeout: 120_000 }));
    if (apk !== undefined) {
      const path = resolve(apk);
      if (!(await stat(path)).isFile()) throw new Error("APK input must be a regular file.");
      await call("load_apk", { path });
    }
    return await callback(call, client);
  } finally {
    await client.close();
    await transport.close();
  }
}

export async function exportPackage(apk, output) {
  const jar = await selectedJar();
  const logPath = join(output, "decompile.log");
  const inputs = Array.isArray(apk) ? apk : [apk];
  if (!inputs.length) throw new Error("At least one APK is required.");
  try {
    process.stderr.write(`Decompiling APK. Engine output: ${logPath}\n`);
    await runTool(javaCommand(), [...javaOptions(), "-cp", jar,
      join(root, "src", "Export.java"), inputs[0], join(output, "decompiled"), ...inputs.slice(1)],
      { timeoutMs: 600_000, maxOutputBytes: 16 * 1024 * 1024, logPath });
    return JSON.parse(await readFile(join(output, "decompiled", "export.json"), "utf8"));
  } catch (error) {
    throw new Error(`${error.message}\nSee ${logPath}; full export requires a JDK with the jdk.compiler module.`, { cause: error });
  }
}

export async function forwardProcess(command, args, stdio = "inherit") {
  const child = spawn(command, args, { stdio, shell: false, windowsHide: true });
  const onInt = () => child.kill("SIGINT");
  const onTerm = () => child.kill("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 1)));
    });
  } finally {
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
}
