import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main, mcpConfig, parseCommand } from "../src/cli.mjs";
import { javaArgs, javaCommand, selectedJar, toolValue } from "../src/engine.mjs";

test("CLI preserves spaces and shell metacharacters as literal arguments", () => {
  const args = ["C:\\Apps with spaces\\demo & $(echo injected).apk", "name;literal|value", "--json", "--query", "click & collect"];
  const parsed = parseCommand(args);
  assert.deepEqual(parsed.positionals, args.slice(0, 2));
  assert.equal(parsed.values.json, true);
  assert.equal(parsed.values.query, "click & collect");
  assert.equal(args.length, 5);
});

test("CLI rejects unknown flags, commands and MCP transport arguments", async () => {
  assert.throws(() => parseCommand(["demo.apk", "--execute"]), /Unknown option/);
  for (const command of ["unknown", "constructor", "__proto__", "mcp --http"]) {
    await assert.rejects(main([command]), /Unknown command/);
  }
  await assert.rejects(main(["mcp", "--transport", "http"]), /accepts no arguments/);
  await assert.rejects(main(["mcp-config", "unexpected"]), /accepts no arguments/);
});

test("MCP config copies only documented Java and JADX configuration", () => {
  const config = mcpConfig({
    JAVA_HOME: "C:\\Java 21", APK_LENS_JADX_JAR: "C:\\Tools\\jadx.jar", APK_LENS_HEAP_MIB: "1024",
    GITHUB_TOKEN: "test-token-do-not-copy", AWS_SECRET_ACCESS_KEY: "test-secret-do-not-copy", PATH: "/private/path",
  }).mcpServers["apk-lens"];
  assert.equal(config.command, process.execPath);
  assert.equal(config.args.at(-1), "mcp");
  assert.match(config.args[0], /bin[\\/]apk-lens\.mjs$/);
  assert.deepEqual(config.env, { JAVA_HOME: "C:\\Java 21", APK_LENS_JADX_JAR: "C:\\Tools\\jadx.jar", APK_LENS_HEAP_MIB: "1024" });
  assert.doesNotMatch(JSON.stringify(config), /test-token|test-secret|private/);
  assert.deepEqual(mcpConfig({}).mcpServers["apk-lens"].env, {});
});

test("invalid local command arguments fail before starting Java", async () => {
  await assert.rejects(main(["install-tools", "--url", "https://example.invalid"]), /Usage/);
  await assert.rejects(main(["analyze", "demo.apk"]), /requires --output/);
  await assert.rejects(main(["inspect", "first.apk", "second.apk"]), /Wrong arguments/);
  await assert.rejects(main(["inspect", "demo.apk", "--output", "ignored"]), /not supported for inspect/);
  await assert.rejects(main(["resources", "demo.apk", "--overload-index", "0"]), /not supported for resources/);
  for (const overload of ["-1", "1.5", "0001", "1;echo", "9007199254740992"]) {
    await assert.rejects(main(["method", "demo.apk", "example.Class", "method", `--overload-index=${overload}`]), /nonnegative integer/);
  }
});

test("Java launch uses literal arguments and validates heap values", () => {
  const jar = "C:\\Tools with spaces\\jadx & literal.jar";
  const args = javaArgs(jar, { APK_LENS_HEAP_MIB: "1024" });
  assert.equal(args[0], "-Xmx1024m");
  assert.equal(args[args.indexOf("-jar") + 1], jar);
  assert.equal(args.filter((value) => value === jar).length, 1);
  assert.equal(javaCommand({ JAVA_HOME: "C:/Java 21" }), join("C:/Java 21", "bin", process.platform === "win32" ? "java.exe" : "java"));
  for (const heap of ["0", "-1", "1.5", "1024 -jar malicious.jar", "9007199254740992"]) {
    assert.throws(() => javaArgs(jar, { APK_LENS_HEAP_MIB: heap }), /positive integer/);
  }
});

test("JADX selection rejects relative paths and mismatched files", async (t) => {
  await assert.rejects(selectedJar({ APK_LENS_JADX_JAR: "relative.jar" }), /absolute path/);
  const directory = await mkdtemp(join(tmpdir(), "apk-lens-jar-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const jar = join(directory, "changed.jar");
  await writeFile(jar, "not the pinned executable");
  await assert.rejects(selectedJar({ APK_LENS_JADX_JAR: jar }), /pinned SHA-256/);
  await assert.rejects(selectedJar({ APK_LENS_JADX_JAR: join(directory, "absent.jar") }), /JADX is missing/);
});

test("MCP tool responses retain JSON and text while propagating provider errors", () => {
  assert.deepEqual(toolValue({ content: [{ type: "text", text: '{"package":"example.app"}' }] }), { package: "example.app" });
  assert.equal(toolValue({ content: [{ type: "text", text: "<manifest/>" }] }), "<manifest/>");
  assert.deepEqual(toolValue({ structuredContent: { ready: true } }), { ready: true });
  assert.throws(() => toolValue({ isError: true, content: [{ type: "text", text: "Class not found" }] }), /Class not found/);
  assert.throws(() => toolValue({ content: [{ type: "text", text: "ERROR: load failed" }] }), /load failed/);
  assert.throws(() => toolValue({}), /no text or structured result/);
});
