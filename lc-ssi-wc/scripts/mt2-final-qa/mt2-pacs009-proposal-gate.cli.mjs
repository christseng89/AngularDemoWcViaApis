import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  proposalCaseReport,
  validateProposalCases,
} from "./mt2-pacs009-proposal-gate.mjs";

const caseFile = "data/qa/mt2/mt2-pacs009-proposal-case-groups.json";
const proposalFile =
  "memory/ssi/mt2/MT2_PACS009_OUTWARD_SSI_ONLY_REVISION_PROPOSAL_v1_DRAFT.md";
const catalogue = JSON.parse(fs.readFileSync(caseFile, "utf8"));
const proposalSha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(proposalFile))
  .digest("hex")
  .toUpperCase();
const validation = validateProposalCases(catalogue, proposalSha256);

if (validation.errors.length) {
  process.stderr.write(`${validation.errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  const testPattern = [
    "settlement.controller.spec.ts",
    "counterparty-ssi-resolution.service.spec.ts",
    "payment-resolution-page-submission.adapter.spec.ts",
    "payment-resolution-page-submission.mt205cov-provenance.spec.ts",
    "resolution-page-definition.controller.spec.ts",
  ].join("|");
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/nx/dist/bin/nx.js",
      "test",
      "ssi-service",
      "--runInBand",
      `--testPathPatterns=${testPattern}`,
      "--coverage=false",
    ],
    { cwd: process.cwd(), encoding: "utf8", stdio: "inherit" },
  );
  const report = proposalCaseReport(catalogue, validation, result.status === 0);
  const reportFile = path.resolve("tmp/mt2-pacs009-proposal-gate-report.json");
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${report.status}: ${report.expandedCaseCount} Proposal cases; legacy workbook excluded\n${reportFile}\n`,
  );
  process.exitCode = result.status ?? 1;
}
