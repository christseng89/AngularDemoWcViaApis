import fs from "node:fs";
import { readJson } from "./file-utils.mjs";
import { validateExecutionEvidence } from "./oracle.mjs";
import { result, Status } from "./result.mjs";

export const evaluateUpstreamEvidence = (evidenceFile, expectedCaseIds) => {
  if (!evidenceFile || !fs.existsSync(evidenceFile))
    return result(
      "UPSTREAM_FIN_VALIDATOR_42",
      Status.NOT_EXECUTED,
      { expectedCases: expectedCaseIds.length, acceptanceClaim: false },
      "Real full-FIN validator evidence was not supplied",
    );
  const evidence = readJson(evidenceFile);
  const entries = Array.isArray(evidence.cases) ? evidence.cases : [];
  const errors = [];
  const actualIds = new Set(entries.map(({ caseId }) => caseId));
  for (const caseId of expectedCaseIds)
    if (!actualIds.has(caseId))
      errors.push(`Missing upstream evidence for ${caseId}`);
  for (const entry of entries) {
    if (!expectedCaseIds.includes(entry.caseId))
      errors.push(`Unexpected upstream evidence case ${entry.caseId}`);
    errors.push(
      ...validateExecutionEvidence(entry, "UPSTREAM_FIN_VALIDATOR").map(
        (error) => `${entry.caseId ?? "<unknown>"}: ${error}`,
      ),
    );
    if (entry.executionStatus !== "PASS")
      errors.push(`${entry.caseId}: executionStatus must be PASS`);
  }
  return result(
    "UPSTREAM_FIN_VALIDATOR_42",
    errors.length === 0 && entries.length === 42 ? Status.PASS : Status.FAIL,
    { evidenceFile, expectedCases: 42, suppliedCases: entries.length, errors },
    errors.length === 0 && entries.length === 42
      ? undefined
      : "Upstream validator evidence is incomplete or invalid",
  );
};
