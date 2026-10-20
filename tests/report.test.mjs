import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyze, inspectPackage, reportMarkdown } from "../src/report.mjs";

const evidence = () => ({
  schema_version: 1,
  target: { path: "example.apk", sha256: "a".repeat(64), bytes: 0 },
  engine: { name: "jadx-headless-mcp", version: "0.7.1" },
  analysis: {}, limitations: ["Signatures were not verified."],
});

test("report preserves zero values and marks missing app data as unknown", () => {
  const input = evidence();
  input.target.path = null;
  const report = reportMarkdown(input);
  assert.match(report, /\*\*File:\*\* Unknown/);
  assert.match(report, /\*\*Bytes:\*\* 0/);
  assert.match(report, /<pre>Unknown<\/pre>/);
  assert.match(report, /Signatures were not verified/);
});

test("APK text cannot insert HTML, Markdown links, rows or headings into the report", () => {
  const untrusted = "</pre><script>alert(1)</script> [click](https://bad.invalid) `code` *bold* | row\n# heading & &#60;";
  const input = evidence();
  input.target.path = untrusted;
  input.analysis.app_info = untrusted;
  input.limitations = [untrusted];
  const report = reportMarkdown(input);
  for (const fragment of ["<script>", "[click]", "`code`", "*bold*", "| row", "\n# heading", "& &#60;"]) {
    assert.equal(report.includes(fragment), false, `Unescaped fragment: ${fragment}`);
  }
  assert.match(report, /&#60;\/pre&#62;&#60;script&#62;/);
  assert.match(report, /&#91;click&#93;/);
  assert.match(report, /&#10;# heading/);
  assert.match(report, /&#38; &#38;#60;/);
});

test("inspection retains the exact app, manifest and session responses", async () => {
  const replies = { get_app_info: { package: "example.app", min_sdk: "26" }, get_android_manifest: "<manifest/>", status: { state: "LOADED" } };
  const calls = [];
  const result = await inspectPackage(async (name) => { calls.push(name); return replies[name]; });
  assert.deepEqual(calls, ["get_app_info", "get_android_manifest", "status"]);
  assert.deepEqual(result, { app_info: replies.get_app_info, manifest: replies.get_android_manifest, status: replies.status });
});

test("analyze refuses existing output before running Java and preserves previous evidence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "apk-lens-report-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const apk = join(directory, "input.apk");
  await writeFile(apk, "test input");
  const output = join(directory, "report");
  await mkdir(output);
  const path = join(output, "evidence.json");
  await writeFile(path, "keep previous evidence");
  await assert.rejects(analyze(apk, output), { code: "EEXIST" });
  assert.equal(await readFile(path, "utf8"), "keep previous evidence");
});
