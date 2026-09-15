import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { prepareCases } from "../../qa/mt2/test_cases/mt2-curl-support.mjs";
import { loadConfig } from "./config-loader.mjs";
import { executePreparedCases } from "./execute-prepared-cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../..");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const verifyRuntimeSnapshot = async ({ config, apiUrl, fetchImpl }) => {
  if (!config.expectedRuntime) return undefined;
  const response = await fetchImpl(`${apiUrl}/settings/runtime`);
  if (!response.ok)
    throw new Error(`RUNTIME_SNAPSHOT_GATE_HTTP_${response.status}`);
  const runtime = await response.json();
  const actual = {
    fixtureId: runtime.fixtureId,
    seedSha256: String(runtime.seedSha256 ?? "").toUpperCase(),
    snapshotSha256: String(runtime.currentSnapshot?.sha256 ?? "").toUpperCase(),
    snapshotMethod: runtime.currentSnapshot?.method,
  };
  for (const [key, expected] of Object.entries(config.expectedRuntime)) {
    if (actual[key] !== expected)
      throw new Error(
        `RUNTIME_SNAPSHOT_GATE_MISMATCH_${key}: expected ${expected}, received ${actual[key]}`,
      );
  }
  return actual;
};

export const runExecutableCases = async ({
  config,
  apiUrl,
  fetchImpl = fetch,
}) => {
  const runtimeSnapshot = await verifyRuntimeSnapshot({
    config,
    apiUrl,
    fetchImpl,
  });
  const preparedDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "mt2-final-execute-"),
  );
  try {
    const prepared = await prepareCases({
      workbook: config.workbook,
      endpointsFile: path.resolve(
        workspace,
        "qa/mt2/mt2-final/case-endpoints.json",
      ),
      registryFile: path.resolve(
        workspace,
        "qa/mt2/mt2-final/message-adapter-registry.json",
      ),
      bankServiceFile: path.resolve(
        workspace,
        "qa/mt2/mt2-final/fixtures/baselines/bank-service.current.json",
      ),
      outputDirectory: preparedDirectory,
      baseUrl: apiUrl,
    });
    const results = await executePreparedCases({
      cases: prepared.cases,
      fetchImpl,
    });
    return {
      schemaVersion: 1,
      workbook: path.resolve(config.workbook),
      workbookSha256: prepared.workbookSha256.toUpperCase(),
      runtimeSnapshot,
      results,
    };
  } finally {
    fs.rmSync(preparedDirectory, { recursive: true, force: true });
  }
};

export const main = async () => {
  const config = loadConfig(
    process.env.MT2_QA_CONFIG ??
      path.resolve(workspace, "qa/mt2/mt2-final/mt2-final-qa.config.json"),
  );
  const endpoints = readJson(
    path.resolve(workspace, "qa/mt2/mt2-final/case-endpoints.json"),
  );
  const apiUrl = (process.env.MT2_QA_API_URL ?? endpoints.baseUrl).replace(
    /\/$/,
    "",
  );
  const report = await runExecutableCases({ config, apiUrl });
  fs.mkdirSync(path.dirname(config.resultFile), { recursive: true });
  fs.writeFileSync(config.resultFile, JSON.stringify(report, null, 2));
  const failed = report.results.filter(({ status }) => status !== "PASS");
  console.log(
    JSON.stringify(
      {
        total: report.results.length,
        passed: report.results.length - failed.length,
        failed: failed.length,
        workbookSha256: report.workbookSha256,
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exitCode = 1;
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) await main();
