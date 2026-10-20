import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export const JADX = Object.freeze({
  version: "0.7.1",
  filename: "jadx-headless-mcp-0.7.1-all.jar",
  url: "https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar",
  sha256: "6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75",
});

export async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function installTools(directory = ".tools", release = JADX) {
  const destination = resolve(directory);
  await mkdir(destination, { recursive: true });
  const path = join(destination, release.filename);
  try {
    if (await sha256(path) !== release.sha256) throw new Error(`Existing ${path} has a different SHA-256; it was not overwritten.`);
    return path;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${path}.${randomUUID()}.partial`;
  try {
    const response = await fetch(release.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new Error(`JADX download failed: HTTP ${response.status}`);
    const file = await open(temporary, "wx", 0o600);
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 128 * 1024 * 1024) throw new Error("JADX download exceeded the 128 MiB limit.");
        hash.update(chunk);
        await file.writeFile(chunk);
      }
    } finally {
      await file.close();
    }
    if (hash.digest("hex") !== release.sha256) throw new Error("JADX SHA-256 mismatch; downloaded file was rejected.");
    await link(temporary, path);
    return path;
  } finally {
    await rm(temporary, { force: true });
  }
}
