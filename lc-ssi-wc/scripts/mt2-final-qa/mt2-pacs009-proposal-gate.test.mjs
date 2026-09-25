import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { validateProposalCases } from "./mt2-pacs009-proposal-gate.mjs";

const catalogue = JSON.parse(
  fs.readFileSync("data/qa/mt2/mt2-pacs009-proposal-case-groups.json", "utf8"),
);
const proposalHash = crypto
  .createHash("sha256")
  .update(
    fs.readFileSync(
      "memory/ssi/mt2/MT2_PACS009_OUTWARD_SSI_ONLY_REVISION_PROPOSAL_v1_DRAFT.md",
    ),
  )
  .digest("hex")
  .toUpperCase();

test("Proposal catalogue excludes out-of-scope messages and covers every outcome", () => {
  const result = validateProposalCases(catalogue, proposalHash);
  assert.deepEqual(result.errors, []);
  assert.equal(result.expandedCaseCount, 101);
  assert.equal(catalogue.profiles.length, 4);
  assert.equal(JSON.stringify(catalogue).includes("MT200-"), false);
  assert.equal(JSON.stringify(catalogue).includes("MT201-"), false);
  assert.equal(JSON.stringify(catalogue).includes("MT203-"), false);
  assert.equal(JSON.stringify(catalogue).includes("MT204-"), false);
  assert.equal(JSON.stringify(catalogue).includes("MT210-"), false);
});

test("Proposal catalogue rejects legacy vocabulary and any side effect", () => {
  const bad = structuredClone(catalogue);
  bad.groups[0].outcomes = ["SSI_AMBIGUOUS"];
  bad.sideEffects.repairQueueCreated = true;
  const result = validateProposalCases(bad, proposalHash);
  assert.ok(
    result.errors.some((error) => error.includes("unsupported outcome")),
  );
  assert.ok(
    result.errors.some((error) => error.includes("repairQueueCreated")),
  );
});
