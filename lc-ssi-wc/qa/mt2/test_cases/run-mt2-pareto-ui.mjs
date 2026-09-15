#!/usr/bin/env node
/* global fetch */
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const selectionPath = path.join(here, "mt2-pareto-selection.json");
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
const runLabel = (process.env.MT2_QA_RUN_LABEL ?? "").trim();
if (runLabel && !/^[A-Za-z0-9_-]+$/.test(runLabel))
  throw new Error("MT2_QA_RUN_LABEL must contain only letters, numbers, _ or -");
const fileSuffix = runLabel ? `-${runLabel.toLowerCase()}` : "";
const titleSuffix = runLabel ? `_${runLabel.toUpperCase()}` : "";
const runtimeSeed = process.env.MT2_QA_RANDOM_SEED ?? selection.seed;
const fixedReportPath = path.join(
  root,
  `qa/mt2/reports/mt2-pareto-fixed-results${fileSuffix}.json`,
);
const randomReportPath = path.join(
  root,
  `qa/mt2/reports/mt2-pareto-random-results${fileSuffix}.json`,
);
const aggregateReportPath = path.join(
  root,
  `qa/mt2/reports/mt2-pareto-release-results${fileSuffix}.json`,
);
const summaryPath = path.join(
  root,
  `qa/mt2/reports/MT2_第二輪QA_20_80_Pareto結果${titleSuffix}_ZH.md`,
);

const requireUniqueCount = (items, expected, label) => {
  if (items.length !== expected || new Set(items).size !== expected)
    throw new Error(
      label + " must contain exactly " + expected + " unique cases",
    );
};
requireUniqueCount(selection.fixedCaseIds, 24, "fixedCaseIds");
requireUniqueCount(selection.exhaustiveStableKeys, 28, "exhaustiveStableKeys");
if (selection.selection.total !== 52)
  throw new Error("Pareto selection must contain exactly 52/260 cases");
if (
  selection.baAddendum?.requiredBeforeFormalExecution &&
  selection.baAddendum.status !== "APPROVED"
)
  throw new Error(
    "BA_ADDENDUM_REQUIRED: do not execute the formal Pareto browser run before applicability expectations are approved",
  );
if (
  selection.tieRiskGate?.requiredBeforeFormalExecution &&
  selection.tieRiskGate.status !== "APPROVED"
)
  throw new Error(
    `TIE_RISK_BA_REQUIRED: ${selection.tieRiskGate.status}; formal 52-case execution is blocked. Pending behavior is fail-closed ${selection.tieRiskGate.defaultExpectedCode}`,
  );
const apiUrl = process.env.MT2_QA_API_URL ?? "http://localhost:3100/api";
const getJson = async (resource) => {
  const response = await fetch(`${apiUrl}/${resource}`);
  if (!response.ok)
    throw new Error(`Pareto preflight ${resource} returned ${response.status}`);
  return response.json();
};
const [ssis, nostros] = await Promise.all([
  getJson("ssis"),
  getJson("nostro-accounts"),
]);
const activeSsis = ssis.filter((item) => item.status === "ACTIVE");
const activeNostros = nostros.filter((item) => item.status === "ACTIVE");
const exactAccountReferences = new Set(
  activeNostros.map((item) => item.accountReference).filter(Boolean),
);
const activeSsiOrphans = activeSsis.filter(
  (item) =>
    !item.route?.accountId || !exactAccountReferences.has(item.route.accountId),
);
const missingAccountReference = activeNostros.filter(
  (item) => !item.accountReference,
);
const missingAllowedBookingEntities = activeNostros.filter(
  (item) => !Object.hasOwn(item, "allowedBookingEntities"),
);
const missingBothGovernanceFields = activeNostros.filter(
  (item) =>
    !item.accountReference && !Object.hasOwn(item, "allowedBookingEntities"),
);
const auditExpected = selection.referentialAudit;
const auditActual = {
  activeSsi: activeSsis.length,
  activeNostro: activeNostros.length,
  activeSsiExactAccountReferenceMatch:
    activeSsis.length - activeSsiOrphans.length,
  activeSsiOrphan: activeSsiOrphans.length,
  activeNostroMissingAccountReference: missingAccountReference.length,
  activeNostroMissingAllowedBookingEntities:
    missingAllowedBookingEntities.length,
  activeNostroMissingBothGovernanceFields: missingBothGovernanceFields.length,
};
for (const [metric, actual] of Object.entries(auditActual)) {
  if (actual !== auditExpected[metric])
    throw new Error(
      `Pareto A1/A2 preflight ${metric}=${actual}, expected ${auditExpected[metric]}`,
    );
}
if (selection.fixedCaseIds.includes("MT202-34"))
  throw new Error(
    "MT202-34 is not executable against the authoritative baseline; use controlled QA-SSI-ORPHAN-001 only",
  );

const run = (script, environment) =>
  spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    stdio: "inherit",
  });
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const startedAt = new Date().toISOString();
const fixedExecution = run("qa/mt2/test_cases/run-mt2-139-ui.mjs", {
  MT2_QA_CASES: selection.fixedCaseIds.join(","),
  MT2_QA_UI_REPORT: relative(fixedReportPath),
  MT2_QA_UI_SUMMARY: `qa/mt2/reports/MT2_第二輪QA_Pareto_Fixed結果${titleSuffix}_ZH.md`,
  MT2_QA_UI_EVIDENCE: `qa/mt2/reports/mt2-pareto-fixed-evidence${fileSuffix}`,
});
const randomExecution = run(
  "qa/mt2/test_cases/run-mt2-resolver-exhaustive-random-ui.mjs",
  {
    MT2_QA_RANDOM_SEED: runtimeSeed,
    MT2_QA_RANDOM_SELECTION_FILE: relative(selectionPath),
    MT2_QA_RANDOM_REPORT: relative(randomReportPath),
    MT2_QA_RANDOM_SUMMARY: `qa/mt2/reports/MT2_第二輪QA_Pareto_Random結果${titleSuffix}_ZH.md`,
    MT2_QA_RANDOM_EVIDENCE: `qa/mt2/reports/mt2-resolver-exhaustive-evidence${fileSuffix}`,
  },
);

const loadReport = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const fixed = loadReport(fixedReportPath);
const random = loadReport(randomReportPath);
const accepted =
  fixedExecution.status === 0 &&
  randomExecution.status === 0 &&
  fixed?.summary?.accepted === true &&
  random?.summary?.accepted === true &&
  selection.tieRiskGate.status === "APPROVED" &&
  random?.governanceGates?.allResolvedEvidence === "PASS" &&
  random?.governanceGates?.alternativeRouteIdentity === "PASS" &&
  random?.governanceGates?.resolutionInputInvalidation === "PASS";
const report = {
  schemaVersion: 1,
  suite: selection.suite,
  runLabel: runLabel || null,
  executionPolicy:
    "SEEDED_20_PERCENT_SELECTION_TARGETING_AT_LEAST_80_PERCENT_KNOWN_RISK",
  startedAt,
  completedAt: new Date().toISOString(),
  seed: runtimeSeed,
  selectionFile: relative(selectionPath),
  sourcePopulation: selection.sourcePopulation,
  selection: selection.selection,
  referentialAudit: {
    status: "PASS",
    joinRule: auditExpected.joinRule,
    forbiddenJoinInputs: auditExpected.forbiddenJoinInputs,
    expected: Object.fromEntries(
      Object.keys(auditActual).map((key) => [key, auditExpected[key]]),
    ),
    actual: auditActual,
  },
  governanceGates: {
    tieRisk: selection.tieRiskGate,
    allResolvedEvidence:
      random?.governanceGates?.allResolvedEvidence ?? "NOT_EXECUTED",
    alternativeRouteIdentity:
      random?.governanceGates?.alternativeRouteIdentity ?? "NOT_EXECUTED",
    resolutionInputInvalidation:
      random?.governanceGates?.resolutionInputInvalidation ?? "NOT_EXECUTED",
  },
  riskCoverage: selection.riskCoverage,
  stages: {
    fixed: {
      exitCode: fixedExecution.status,
      summary: fixed?.summary ?? null,
      report: relative(fixedReportPath),
    },
    exhaustive: {
      exitCode: randomExecution.status,
      summary: random?.summary ?? null,
      report: relative(randomReportPath),
    },
  },
  accepted,
  uatReady: accepted,
  replayCommand: runLabel
    ? `$env:MT2_QA_RUN_LABEL='${runLabel}'; $env:MT2_QA_RANDOM_SEED='${runtimeSeed}'; node qa/mt2/test_cases/run-mt2-pareto-ui.mjs`
    : "node qa/mt2/test_cases/run-mt2-pareto-ui.mjs",
};
fs.writeFileSync(aggregateReportPath, JSON.stringify(report, null, 2) + "\n");
const fixedText = fixed?.summary
  ? fixed.summary.passed + "/" + fixed.summary.expected
  : "無報告";
const randomText = random?.summary
  ? random.summary.passed + "/" + random.summary.expected
  : "無報告";
const markdown = [
  "# MT2 第二輪 QA 20/80 Pareto 結果",
  "",
  "- Seed：`" + runtimeSeed + "`",
  "- 抽樣：52/260（20%）；fixed 24、resolver matrix 28。",
  "- Fixed：" + fixedText,
  "- Exhaustive risk sample：" + randomText,
  "- Tie-risk gate：" + selection.tieRiskGate.status,
  "- RESOLVED evidence gate：" +
    (random?.governanceGates?.allResolvedEvidence ?? "NOT_EXECUTED"),
  "- Alternative route identity gate：" +
    (random?.governanceGates?.alternativeRouteIdentity ?? "NOT_EXECUTED"),
  "- Resolution input invalidation gate：" +
    (random?.governanceGates?.resolutionInputInvalidation ?? "NOT_EXECUTED"),
  "- 結論：" +
    (accepted ? "PASS，可進入 UAT gate。" : "NOT ACCEPTED，不得進入 UAT。"),
  "- Replay：`" + report.replayCommand + "`",
  "",
  "## 風險覆蓋",
  "",
  ...selection.riskCoverage.map((risk) => "- " + risk),
  "",
  "此套件不改寫產品 expected outcomes；所有 assertions 沿用 frozen 139、BA 決策與 exhaustive resolver contract。",
  "",
].join("\n");
fs.writeFileSync(summaryPath, markdown);
console.log(
  JSON.stringify(
    {
      accepted,
      fixed: fixed?.summary ?? null,
      exhaustive: random?.summary ?? null,
    },
    null,
    2,
  ),
);
if (!accepted) process.exitCode = 1;
