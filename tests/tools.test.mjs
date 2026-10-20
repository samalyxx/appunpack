import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installTools, sha256 } from "../src/tools.mjs";

const content = Buffer.from("local test JAR bytes\n");
const digest = createHash("sha256").update(content).digest("hex");

async function fixture(t, handler) {
  const directory = await mkdtemp(join(tmpdir(), "appunpack-tools-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const release = {
    filename: "test-jadx.jar", url: `http://127.0.0.1:${server.address().port}/tool.jar`, sha256: digest,
  };
  return { directory, release, path: join(directory, release.filename) };
}

test("installer verifies download and reuses an identical existing file", async (t) => {
  let requests = 0;
  const { directory, release, path } = await fixture(t, (_request, response) => {
    requests++;
    response.end(content);
  });
  assert.equal(await installTools(directory, release), path);
  assert.deepEqual(await readFile(path), content);
  assert.equal(await sha256(path), digest);
  assert.equal(await installTools(directory, release), path);
  assert.equal(requests, 1);
  assert.deepEqual(await readdir(directory), [release.filename]);
});

test("installer rejects a changed existing file without downloading or overwriting", async (t) => {
  let requests = 0;
  const { directory, release, path } = await fixture(t, (_request, response) => {
    requests++;
    response.end(content);
  });
  await writeFile(path, "keep existing file");
  await assert.rejects(installTools(directory, release), /different SHA-256.*not overwritten/);
  assert.equal(await readFile(path, "utf8"), "keep existing file");
  assert.equal(requests, 0);
  assert.deepEqual(await readdir(directory), [release.filename]);
});

test("installer rejects a digest mismatch and removes the partial download", async (t) => {
  const { directory, release } = await fixture(t, (_request, response) => response.end("tampered bytes"));
  await assert.rejects(installTools(directory, release), /SHA-256 mismatch/);
  assert.deepEqual(await readdir(directory), []);
});

test("installer handles HTTP failure without leaving an output file", async (t) => {
  const { directory, release } = await fixture(t, (_request, response) => {
    response.writeHead(503);
    response.end("Unavailable");
  });
  await assert.rejects(installTools(directory, release), /HTTP 503/);
  assert.deepEqual(await readdir(directory), []);
});

test("installer cleans a download interrupted after receiving bytes", async (t) => {
  const { directory, release } = await fixture(t, (_request, response) => {
    response.writeHead(200, { "Content-Length": content.length + 100 });
    response.write(content);
    setImmediate(() => response.destroy());
  });
  await assert.rejects(installTools(directory, release));
  assert.deepEqual(await readdir(directory), []);
});

test("a destination created during download is preserved", async (t) => {
  let path;
  const data = await fixture(t, async (_request, response) => {
    await writeFile(path, "created during download");
    response.end(content);
  });
  path = data.path;
  await assert.rejects(installTools(data.directory, data.release), { code: "EEXIST" });
  assert.equal(await readFile(path, "utf8"), "created during download");
  assert.deepEqual(await readdir(data.directory), [data.release.filename]);
});
