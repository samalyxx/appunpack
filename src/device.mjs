import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { runTool } from "./process.mjs";
import { sha256 } from "./tools.mjs";

export function deviceId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value)) throw new Error("An explicit --device ID is required (letters, numbers, '.', '_', ':', '-').");
  return value;
}

export function packageId(value) {
  if (typeof value !== "string" || value.length > 255 || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(value)) throw new Error("Invalid Android package identifier.");
  return value;
}

function duration(value = 10_000) {
  if (!Number.isSafeInteger(value) || value < 1000 || value > 300_000) throw new Error("Capture duration must be 1000–300000 milliseconds.");
  return value;
}

const adbCommand = (options) => options.adb ?? process.env.APPUNPACK_ADB ?? "adb";
const adbArgs = (options) => ["-s", deviceId(options.device)];
const toolOptions = (options) => ({ signal: options.signal, env: options.env });

async function outputDirectory(directory) {
  if (typeof directory !== "string" || !directory) throw new Error("A new output directory is required.");
  const output = resolve(directory);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  return output;
}

async function saveJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

export async function listDevices(options = {}) {
  return (await runTool(adbCommand(options), ["devices", "-l"], toolOptions(options))).stdout;
}

export async function listPackages(options = {}) {
  return (await runTool(adbCommand(options), [...adbArgs(options), "shell", "pm", "list", "packages"], toolOptions(options))).stdout;
}

export function packagePaths(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length || lines.length > 256) throw new Error("Package manager returned no APK paths or exceeded 256 splits.");
  return lines.map((line) => {
    if (!/^package:\/[^\x00-\x1f\x7f]*\.apk$/.test(line)) throw new Error("Package manager returned an invalid APK path.");
    return line.slice("package:".length);
  }).filter((path, index, paths) => paths.indexOf(path) === index);
}

export async function pullPackage(packageName, directory, options = {}) {
  packageId(packageName);
  const selected = adbArgs(options);
  const output = await outputDirectory(directory);
  try {
    const query = [...selected, "shell", "pm", "path", packageName];
    const initial = await runTool(adbCommand(options), query, { ...toolOptions(options), logPath: join(output, "package-paths.log") });
    const paths = packagePaths(initial.stdout);
    const files = [];
    for (const [index, remote] of paths.entries()) {
      const filename = `${String(index + 1).padStart(3, "0")}.apk`;
      const destination = join(output, filename);
      // Remote paths remain literal adb sync arguments; local names never come from device output.
      await runTool(adbCommand(options), [...selected, "pull", remote, destination], {
        ...toolOptions(options), timeoutMs: 120_000, logPath: join(output, `pull-${index + 1}.log`),
      });
      const info = await stat(destination);
      if (!info.isFile() || info.size < 1 || info.size > 2 * 1024 * 1024 * 1024) throw new Error("Pulled APK is empty, not a file, or larger than 2 GiB.");
      files.push({ file: filename, device_path: remote, bytes: info.size, sha256: await sha256(destination) });
    }
    const final = await runTool(adbCommand(options), query, { ...toolOptions(options), logPath: join(output, "package-paths-after.log") });
    if (JSON.stringify(paths) !== JSON.stringify(packagePaths(final.stdout))) throw new Error("Installed package paths changed while pulling; use a new output directory and retry.");
    await saveJson(join(output, "pull.json"), { schema_version: 1, package: packageName, device: options.device, files,
      limitations: ["The package was copied without launching it.", "All APK paths reported by the package manager were copied; remote file contents were not hashed before/after transfer.", "Package signatures and split consistency must be checked before combined analysis."] });
    return output;
  } catch (error) {
    throw new Error(`${error.message}\nPull directory: ${output}. Partial files and logs were retained; retry in a new directory.`, { cause: error });
  }
}

export async function captureLogcat(directory, options = {}) {
  const args = adbArgs(options);
  const durationMs = duration(options.durationMs);
  const output = await outputDirectory(directory);
  try {
    const result = await runTool(adbCommand(options), [...args, "logcat", "-v", "threadtime", "-T", "1"], {
      ...toolOptions(options), timeoutMs: durationMs, allowTimeout: true, logPath: join(output, "logcat.log"),
    });
    await saveJson(join(output, "capture.json"), { schema_version: 1, kind: "adb-logcat", device: options.device,
      requested_duration_ms: durationMs, duration_boundary_reached: result.timedOut,
      limitations: ["Device logs may contain sensitive data; inspect them before sharing.", "Only log buffers accessible to adb were captured; no app was launched and no buffers were cleared."] });
    return output;
  } catch (error) {
    throw new Error(`${error.message}\nCapture directory: ${output}. Logs were retained.`, { cause: error });
  }
}

export async function listFridaProcesses(options = {}) {
  return (await runTool(options.fridaPs ?? process.env.APPUNPACK_FRIDA_PS ?? "frida-ps",
    ["-D", deviceId(options.device)], toolOptions(options))).stdout;
}

export async function attachFrida(pid, script, directory, options = {}) {
  if (!/^[1-9][0-9]*$/.test(String(pid)) || !Number.isSafeInteger(Number(pid)) || Number(pid) > 2_147_483_647) throw new Error("Frida requires an explicit positive process ID.");
  const selected = deviceId(options.device);
  const durationMs = duration(options.durationMs);
  const path = resolve(script);
  const info = await stat(path);
  if (!info.isFile() || info.size > 1024 * 1024 || !/\.js$/i.test(path)) throw new Error("Frida script must be a local .js file no larger than 1 MiB.");
  const scriptHash = await sha256(path);
  const scriptBytes = await readFile(path);
  if (scriptBytes.length > 1024 * 1024) throw new Error("Frida script grew beyond the 1 MiB limit while being read.");
  const output = await outputDirectory(directory);
  try {
    // Execute a saved script snapshot so later editor changes cannot alter the capture.
    const snapshot = join(output, "script.js");
    await writeFile(snapshot, scriptBytes, { flag: "wx", mode: 0o600 });
    if (await sha256(snapshot) !== scriptHash) throw new Error("Frida script changed while being read; retry with a stable script.");
    const result = await runTool(options.frida ?? process.env.APPUNPACK_FRIDA ?? "frida",
      ["-D", selected, "-p", String(pid), "-l", snapshot, "-q", "-t", String(durationMs / 1000), "--exit-on-error", "--no-auto-reload"], {
        ...toolOptions(options), timeoutMs: durationMs + 30_000, logPath: join(output, "frida.log"),
      });
    await saveJson(join(output, "capture.json"), { schema_version: 1, kind: "frida-attach", device: selected, pid: Number(pid),
      script: { original_path: path, snapshot: "script.js", sha256: scriptHash }, requested_duration_ms: durationMs,
      exit_code: result.code, limitations: ["Only the supplied script was executed in the explicitly selected running process.", "Frida device/server access must already be configured. Script code can affect the target process.", "No app was spawned, patched, signed or automatically restarted."] });
    return output;
  } catch (error) {
    throw new Error(`${error.message}\nCapture directory: ${output}. Script snapshot and logs were retained.`, { cause: error });
  }
}
