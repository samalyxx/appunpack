import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { join } from "node:path";

export async function runTool(command, args, options = {}) {
  const { cwd, env = process.env, timeoutMs = 120_000, maxOutputBytes = 4 * 1024 * 1024,
    logPath, signal, allowTimeout = false } = options;
  if (typeof command !== "string" || !command || command.includes("\0") || !Array.isArray(args)
    || args.some((value) => typeof value !== "string" || value.includes("\0"))) throw new Error("Tool command and arguments must be literal strings.");
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)) throw new Error("Select an executable, not a Windows batch script.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) throw new Error("Tool timeout must be 1–3600000 milliseconds.");
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 64 * 1024 * 1024) throw new Error("Tool output budget must be 1–67108864 bytes.");
  signal?.throwIfAborted();
  const log = logPath ? await open(logPath, "wx", 0o600) : undefined;
  const stdout = [], stderr = [], combined = [];
  let size = 0, failure, timedOut = false, forceTimer, drainTimer;
  let child;
  const kill = (force = false) => {
    if (!child?.pid) return;
    try {
      if (process.platform === "win32") {
        if (force) child.kill("SIGKILL");
        else {
          const terminator = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
            ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
          terminator.once("error", () => child.kill("SIGKILL"));
        }
      } else process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
    } catch (error) { if (error.code !== "ESRCH") failure ??= error; }
  };
  const stop = (error) => {
    if (failure) return;
    failure = error;
    kill();
    forceTimer = setTimeout(() => kill(true), 1000);
    drainTimer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); }, 2000);
  };
  const onAbort = () => stop(new Error("Tool execution cancelled."));
  const receive = (chunks, chunk) => {
    const available = Math.max(0, maxOutputBytes - size);
    if (available) {
      const kept = chunk.subarray(0, available);
      chunks.push(kept);
      combined.push(kept);
      size += kept.length;
    }
    if (chunk.length > available) stop(new Error(`Tool output exceeded ${maxOutputBytes} bytes; retained output is truncated.`));
  };
  let timer;
  try {
    child = spawn(command, args, { cwd, env, shell: false, windowsHide: true,
      detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => receive(stdout, chunk));
    child.stderr.on("data", (chunk) => receive(stderr, chunk));
    signal?.addEventListener("abort", onAbort, { once: true });
    process.once("SIGINT", onAbort);
    process.once("SIGTERM", onAbort);
    if (signal?.aborted) onAbort();
    timer = setTimeout(() => {
      timedOut = true;
      stop(new Error(`Tool exceeded its ${timeoutMs} ms deadline.`));
    }, timeoutMs);
    const result = await new Promise((resolve) => {
      child.once("error", (error) => { failure ??= error; });
      child.once("close", (code, exitSignal) => resolve({ stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"), code, signal: exitSignal, timedOut }));
    });
    if (log) await log.writeFile(Buffer.concat(combined));
    if (failure && !(timedOut && allowTimeout && failure.message.includes("deadline"))) {
      failure.result = result;
      throw failure;
    }
    if (!timedOut && result.code !== 0) throw Object.assign(new Error(`Tool exited with ${result.code ?? result.signal}. ${result.stderr.trim().slice(0, 2048)}`), { result });
    return result;
  } finally {
    clearTimeout(timer);
    clearTimeout(forceTimer);
    clearTimeout(drainTimer);
    signal?.removeEventListener("abort", onAbort);
    process.off("SIGINT", onAbort);
    process.off("SIGTERM", onAbort);
    await log?.close();
  }
}
