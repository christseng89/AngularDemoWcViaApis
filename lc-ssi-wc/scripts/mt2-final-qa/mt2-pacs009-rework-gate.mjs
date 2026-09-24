import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCEPTED_STATUS = "PASS";
const ALLOWED_STATUSES = new Set(["PASS", "FAIL", "NOT_EXECUTED"]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const normalizedResult = (requirement, supplied) => {
  if (!supplied)
    return {
      id: requirement.id,
      status: "NOT_EXECUTED",
      evidence: [],
      reason: "No evidence result was supplied for this requirement.",
    };
  const evidence = Array.isArray(supplied.evidence) ? supplied.evidence : [];
  if (!ALLOWED_STATUSES.has(supplied.status))
    return {
      id: requirement.id,
      status: "FAIL",
      evidence,
      reason: `Unsupported evidence status: ${String(supplied.status)}`,
    };
  if (supplied.status === ACCEPTED_STATUS && evidence.length === 0)
    return {
      id: requirement.id,
      status: "FAIL",
      evidence: [],
      reason: "PASS is forbidden without at least one evidence reference.",
    };
  return {
    id: requirement.id,
    status: supplied.status,
    evidence,
    ...(supplied.reason ? { reason: supplied.reason } : {}),
  };
};

export const evaluateMt2Pacs009Gate = (contract, evidence = {}) => {
  const supplied = new Map(
    (evidence.results ?? []).map((result) => [result.id, result]),
  );
  const duplicateIds = (evidence.results ?? [])
    .map(({ id }) => id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  const knownIds = new Set(contract.requirements.map(({ id }) => id));
  const unexpectedIds = [...supplied.keys()].filter((id) => !knownIds.has(id));
  const results = contract.requirements.map((requirement) =>
    normalizedResult(requirement, supplied.get(requirement.id)),
  );
  const accepted =
    duplicateIds.length === 0 &&
    unexpectedIds.length === 0 &&
    results.every(({ status }) => status === ACCEPTED_STATUS);
  return {
    schemaVersion: contract.schemaVersion,
    status: accepted ? "ACCEPTED" : "BLOCKED",
    scope: contract.scope,
    duplicateIds: [...new Set(duplicateIds)],
    unexpectedIds,
    summary: Object.fromEntries(
      [...ALLOWED_STATUSES].map((status) => [
        status,
        results.filter((result) => result.status === status).length,
      ]),
    ),
    results,
  };
};

const runCli = () => {
  const workspace = process.cwd();
  const contractFile = path.resolve(
    workspace,
    "qa/tests/mt2/final/mt2-pacs009-rework-gate.json",
  );
  const evidenceFile = process.argv[2]
    ? path.resolve(workspace, process.argv[2])
    : undefined;
  const outputFile = path.resolve(
    workspace,
    process.argv[3] ?? "tmp/mt2-pacs009-rework-gate-report.json",
  );
  const report = evaluateMt2Pacs009Gate(
    readJson(contractFile),
    evidenceFile && fs.existsSync(evidenceFile) ? readJson(evidenceFile) : {},
  );
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${report.status}: PASS=${report.summary.PASS}, FAIL=${report.summary.FAIL}, NOT_EXECUTED=${report.summary.NOT_EXECUTED}\n${outputFile}\n`,
  );
  process.exitCode = report.status === "ACCEPTED" ? 0 : 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  runCli();
