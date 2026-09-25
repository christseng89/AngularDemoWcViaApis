import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CASE_FILE = "data/qa/mt2/mt2-pacs009-proposal-case-groups.json";
const PROPOSAL_FILE =
  "memory/ssi/mt2/MT2_PACS009_OUTWARD_SSI_ONLY_REVISION_PROPOSAL_v1_DRAFT.md";
const ALLOWED_PROFILES = new Set([
  "MT2-MT202-PLAIN-SR2026",
  "MT2-MT202COV-COV-SR2026",
  "MT2-MT205-PLAIN-SR2026",
  "MT2-MT205COV-COV-SR2026",
]);
const REQUIRED_OUTCOMES = new Set([
  "BILATERAL_RELATIONSHIP_CONFIRMED",
  "ELIGIBLE_COMPLETE_ROUTE",
  "NO_ELIGIBLE_SSI",
  "AMBIGUOUS_ROUTE",
  "STALE",
  "INVALID_CONTEXT_TOPOLOGY",
  "INVALID_UPSTREAM_CONTEXT",
  "PROFILE_INCOMPLETE",
  "UNSUPPORTED_DIRECTION",
  "UNSUPPORTED_PROFILE",
  "RMA_NOT_AUTHORIZED",
  "JURISDICTION_EVIDENCE_CONFLICT",
  "JURISDICTION_NOT_PERMITTED",
]);

const sha256 = (file) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex")
    .toUpperCase();

const variantCount = ({ variants, profileMatrix }) => {
  if (variants === "SINGLE") return 1;
  if (/^[A-Z]$/.test(variants)) return profileMatrix ? 4 : 1;
  const match = /^([A-Z])\.\.([A-Z])$/.exec(variants);
  if (!match) throw new Error(`Unsupported variant expression: ${variants}`);
  const count = match[2].charCodeAt(0) - match[1].charCodeAt(0) + 1;
  return profileMatrix ? count * 4 : count;
};

export const validateProposalCases = (catalogue, proposalHash) => {
  const errors = [];
  if (catalogue.proposalSha256 !== proposalHash)
    errors.push("Proposal SHA-256 binding does not match the controlled file.");
  if (
    catalogue.direction !== "OUTWARD" ||
    catalogue.localRole !== "INSTRUCTING_AGENT"
  )
    errors.push("Gate scope must remain OUTWARD / INSTRUCTING_AGENT only.");
  if (
    catalogue.profiles.length !== ALLOWED_PROFILES.size ||
    catalogue.profiles.some((profile) => !ALLOWED_PROFILES.has(profile))
  )
    errors.push("Gate contains a missing or out-of-scope profile.");
  const expandedCaseCount = catalogue.groups.reduce(
    (sum, group) => sum + variantCount(group),
    0,
  );
  if (expandedCaseCount !== catalogue.expectedExpandedCaseCount)
    errors.push(
      `Expanded case count ${expandedCaseCount} does not match ${catalogue.expectedExpandedCaseCount}.`,
    );
  const outcomes = new Set(
    catalogue.groups.flatMap(({ outcomes }) => outcomes),
  );
  for (const outcome of REQUIRED_OUTCOMES)
    if (!outcomes.has(outcome))
      errors.push(`Missing outcome coverage: ${outcome}`);
  for (const outcome of outcomes)
    if (!REQUIRED_OUTCOMES.has(outcome))
      errors.push(`Legacy or unsupported outcome: ${outcome}`);
  for (const [name, value] of Object.entries(catalogue.sideEffects))
    if (value !== false) errors.push(`${name} must be false.`);
  return { errors, expandedCaseCount, outcomes: [...outcomes].sort() };
};

const run = () => {
  const catalogue = JSON.parse(fs.readFileSync(CASE_FILE, "utf8"));
  const validation = validateProposalCases(catalogue, sha256(PROPOSAL_FILE));
  if (validation.errors.length) {
    process.stderr.write(`${validation.errors.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
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
  const report = {
    status: result.status === 0 ? "PASS" : "FAIL",
    proposalSha256: catalogue.proposalSha256,
    scope: { direction: catalogue.direction, profiles: catalogue.profiles },
    expandedCaseCount: validation.expandedCaseCount,
    outcomes: validation.outcomes,
    sideEffects: catalogue.sideEffects,
    legacyWorkbook: "INFORMATIONAL_ONLY",
  };
  const reportFile = path.resolve("tmp/mt2-pacs009-proposal-gate-report.json");
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${report.status}: ${report.expandedCaseCount} Proposal cases; legacy workbook excluded\n${reportFile}\n`,
  );
  process.exitCode = result.status ?? 1;
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"))
)
  run();
