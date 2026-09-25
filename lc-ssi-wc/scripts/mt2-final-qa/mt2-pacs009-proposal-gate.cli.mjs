import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  proposalCaseReport,
  validateProposalCases,
} from "./mt2-pacs009-proposal-gate.mjs";

const caseFile = "data/qa/mt2/mt2-pacs009-proposal-case-groups.json";
const fixtureFile = "data/qa/mt2/mt2-pacs009-proposal-fixtures.json";
const proposalFile =
  "memory/ssi/mt2/MT2_PACS009_OUTWARD_SSI_ONLY_REVISION_PROPOSAL_v1_DRAFT.md";
const catalogue = JSON.parse(fs.readFileSync(caseFile, "utf8"));
const fixtures = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
const proposalSha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(proposalFile))
  .digest("hex")
  .toUpperCase();
const validation = validateProposalCases(catalogue, proposalSha256, fixtures);

if (validation.errors.length) {
  process.stderr.write(`${validation.errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  const jestResultFile = path.resolve("tmp/mt2-pacs009-proposal-jest.json");
  fs.mkdirSync(path.dirname(jestResultFile), { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/nx/dist/bin/nx.js",
      "test",
      "ssi-service",
      "--runInBand",
      "--skipNxCache",
      "--testPathPatterns=mt2-pacs009-proposal-cases.spec.ts",
      "--coverage=false",
      "--json",
      `--outputFile=${jestResultFile}`,
    ],
    { cwd: process.cwd(), encoding: "utf8", stdio: "inherit" },
  );
  const jestResult = fs.existsSync(jestResultFile)
    ? JSON.parse(fs.readFileSync(jestResultFile, "utf8"))
    : { testResults: [] };
  const caseResults = new Map();
  for (const suite of jestResult.testResults ?? [])
    for (const assertion of suite.assertionResults ?? []) {
      const caseId = catalogue.cases.find(
        ({ caseId }) => assertion.title === caseId,
      )?.caseId;
      if (caseId)
        caseResults.set(
          caseId,
          assertion.status === "passed" ? "PASS" : "FAIL",
        );
    }
  const report = proposalCaseReport(catalogue, validation, caseResults);
  const reportFile = path.resolve("tmp/mt2-pacs009-proposal-gate-report.json");
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${report.status}: ${report.expandedCaseCount} Proposal cases; legacy workbook excluded\n${reportFile}\n`,
  );
  process.exitCode = result.status === 0 && report.status === "PASS" ? 0 : 1;
}
