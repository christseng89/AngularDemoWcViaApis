import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig } from "./config-loader.mjs";
import { main, runExecutableCases } from "./execute-cases.mjs";
import { executePreparedCases } from "./execute-prepared-cases.mjs";

const workspace = path.resolve(import.meta.dirname, "../..");
const controlledConfig = () =>
  loadConfig(
    path.join(workspace, "qa/tests/mt2/final/mt2-final-qa.config.json"),
  );
const runtimeBody = (config) => ({
  fixtureId: config.expectedRuntime.fixtureId,
  seedSha256: config.expectedRuntime.seedSha256,
  currentSnapshot: {
    sha256: config.expectedRuntime.snapshotSha256,
    method: config.expectedRuntime.snapshotMethod,
  },
});

const fixture = (directory, request, expected) => {
  const requestFile = path.join(directory, "request.json");
  const expectedFile = path.join(directory, "expected.json");
  fs.writeFileSync(requestFile, JSON.stringify(request));
  fs.writeFileSync(expectedFile, JSON.stringify(expected));
  return {
    index: 1,
    testCaseNo: "MT202-01",
    messageType: "MT202",
    domain: "COUNTERPARTY_SSI",
    endpoint: "http://localhost:3100/api/settlements/resolve",
    expectedStatus: 200,
    requestFile,
    expectedFile,
  };
};

test("executes the canonical prepared request without re-adapting it", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "execute-case-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const request = {
    counterpartyBankServiceId: "BANK-SVC-BARCGB22",
    messageType: "pacs.009.001.08",
  };
  const expected = {
    mx: { decision: "RESOLVED" },
    mt: { tags: { "58A": "BARCGB22" } },
  };
  const metadata = fixture(directory, request, expected);
  const calls = [];
  const results = await executePreparedCases({
    cases: [metadata],
    fetchImpl: async (endpoint, options) => {
      calls.push({ endpoint, options });
      return {
        status: 200,
        json: async () => expected,
      };
    },
  });

  assert.equal(results[0].status, "PASS");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, metadata.endpoint);
  assert.deepEqual(JSON.parse(calls[0].options.body), request);
  assert.equal(calls[0].options.headers["x-qa-test-case"], metadata.testCaseNo);
});

test("fails closed when the prepared request cannot be executed", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "execute-case-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const metadata = fixture(directory, {}, { mx: {}, mt: {} });
  const results = await executePreparedCases({
    cases: [metadata],
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
  });

  assert.equal(results[0].status, "FAIL");
  assert.deepEqual(results[0].differences, [
    "request execution failed: connection refused",
  ]);
});

test("reports HTTP and contract differences from a prepared case", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "execute-case-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const metadata = fixture(
    directory,
    {},
    {
      mx: { decision: "RESOLVED" },
      mt: { tags: {} },
    },
  );
  const results = await executePreparedCases({
    cases: [metadata],
    fetchImpl: async () => ({
      status: 422,
      json: async () => ({ mx: {}, mt: {} }),
    }),
  });

  assert.equal(results[0].status, "FAIL");
  assert.ok(results[0].differences.some((item) => item.includes("httpStatus")));
  assert.ok(
    results[0].differences.some((item) => item.includes("mx.decision")),
  );
});

test("binds case execution to the controlled runtime snapshot", async () => {
  const config = controlledConfig();
  const runtime = runtimeBody(config);
  const calls = [];
  const report = await runExecutableCases({
    config,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("/settings/runtime"))
        return { ok: true, status: 200, json: async () => runtime };
      return { status: 500, json: async () => ({}) };
    },
    apiUrl: "http://localhost:3100/api",
  });

  assert.deepEqual(report.runtimeSnapshot, {
    fixtureId: runtime.fixtureId,
    seedSha256: runtime.seedSha256,
    snapshotSha256: runtime.currentSnapshot.sha256,
    snapshotMethod: runtime.currentSnapshot.method,
  });
  assert.equal(report.results.length, 139);
  assert.equal(calls[0], "http://localhost:3100/api/settings/runtime");
});

test("fails closed before case execution when runtime snapshot metadata is absent", async () => {
  const config = controlledConfig();
  const runtime = runtimeBody(config);
  delete runtime.currentSnapshot;

  await assert.rejects(
    runExecutableCases({
      config,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => runtime }),
      apiUrl: "http://localhost:3100/api",
    }),
    /RUNTIME_SNAPSHOT_GATE_MISMATCH_snapshotSha256/,
  );
});

test("fails closed before case execution when the seed digest is absent", async () => {
  const config = controlledConfig();
  const runtime = runtimeBody(config);
  delete runtime.seedSha256;

  await assert.rejects(
    runExecutableCases({
      config,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => runtime,
      }),
      apiUrl: "http://localhost:3100/api",
    }),
    /RUNTIME_SNAPSHOT_GATE_MISMATCH_seedSha256/,
  );
});

test("fails closed when runtime identity endpoint is unavailable", async () => {
  const config = controlledConfig();
  await assert.rejects(
    runExecutableCases({
      config,
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
      apiUrl: "http://localhost:3100/api",
    }),
    /RUNTIME_SNAPSHOT_GATE_HTTP_503/,
  );
});

test("supports legacy QA configuration without a runtime snapshot gate", async () => {
  const config = controlledConfig();
  const calls = [];
  const report = await runExecutableCases({
    config: { ...config, expectedRuntime: undefined },
    fetchImpl: async (url) => {
      calls.push(url);
      return { status: 500, json: async () => ({}) };
    },
    apiUrl: "http://localhost:3100/api",
  });

  assert.equal(report.runtimeSnapshot, undefined);
  assert.equal(report.results.length, 139);
  assert.ok(calls.every((url) => !url.endsWith("/settings/runtime")));
});

test("main writes an isolated report and returns a failing process status", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "execute-main-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const base = controlledConfig();
  const resultFile = path.join(directory, "results.json");
  const configFile = path.join(directory, "config.json");
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      ...base,
      expectedRuntime: undefined,
      resultFile,
      evidenceDirectory: directory,
    }),
  );

  const originalConfig = process.env.MT2_QA_CONFIG;
  const originalApiUrl = process.env.MT2_QA_API_URL;
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const logs = [];
  process.env.MT2_QA_CONFIG = configFile;
  process.env.MT2_QA_API_URL = "http://localhost:3100/api/";
  globalThis.fetch = async () => ({
    status: 500,
    json: async () => ({}),
  });
  console.log = (value) => logs.push(value);

  try {
    await main();
    const report = JSON.parse(fs.readFileSync(resultFile, "utf8"));
    const summary = JSON.parse(logs[0]);
    assert.equal(report.results.length, 139);
    assert.equal(summary.total, 139);
    assert.equal(summary.passed, 0);
    assert.equal(summary.failed, 139);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = originalExitCode;
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    if (originalConfig === undefined) delete process.env.MT2_QA_CONFIG;
    else process.env.MT2_QA_CONFIG = originalConfig;
    if (originalApiUrl === undefined) delete process.env.MT2_QA_API_URL;
    else process.env.MT2_QA_API_URL = originalApiUrl;
  }
});
