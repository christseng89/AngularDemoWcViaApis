import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptDirectory = import.meta.dirname;
const workspace = path.resolve(scriptDirectory, "../../..");
const toBashPath = (value) => {
  if (process.platform !== "win32") return value;
  return value
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
    .replaceAll("\\", "/");
};

test("Bash runner executes and aggregates all 139 cases through curl", (t) => {
  if (process.platform === "win32") {
    const gitBash = "C:/Program Files/Git/bin/bash.exe";
    if (!fs.existsSync(gitBash)) return t.skip("Git Bash is unavailable");
  }
  const bash =
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const reportDirectory = path.join(workspace, "qa/reports/latest/mt2");
  fs.mkdirSync(reportDirectory, { recursive: true });
  const temporary = fs.mkdtempSync(
    path.join(reportDirectory, ".mt2-curl-e2e-"),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const fakeCurl = path.join(scriptDirectory, "test/fake-curl.sh");
  fs.chmodSync(fakeCurl, 0o755);
  const reportFile = path.join(temporary, "report.json");
  const environment = { ...process.env, MT2_QA_CURL_BIN: toBashPath(fakeCurl) };
  environment.TMPDIR = toBashPath(temporary);
  environment.HOME = toBashPath(temporary);
  if (process.platform === "win32") {
    environment.PATH = "/usr/bin:/bin:/c/nvm4w/nodejs";
  }
  const bashArguments = [
    "--noprofile",
    "--norc",
    toBashPath(path.join(scriptDirectory, "run_mt2_139.sh")),
    "--output",
    toBashPath(reportFile),
  ];
  const result = spawnSync(bash, bashArguments, {
    cwd: path.resolve(scriptDirectory, "../.."),
    encoding: "utf8",
    env: environment,
    timeout: 300_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  assert.deepEqual(report.summary, { total: 139, passed: 139, failed: 0 });
  assert.equal(report.results.length, 139);
});
