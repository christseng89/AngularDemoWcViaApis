import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) =>
  fs.readFileSync(path.resolve(workspace, relativePath), "utf8");

const activeMemoryPath = "memory/swift-mt1xx-pacs008-ssi-v3.md";
const scopeContractPath =
  "memory/mt1/MT1_PACS008_SSI_RESOLUTION_SCOPE_CONTEXT_CONTRACT_v1_DRAFT.md";
const routeMatrixPath =
  "memory/mt1/MT1_PACS008_SETTLEMENT_CONTEXT_SSI_ROLE_ATOMIC_ROUTE_MATRIX_v1_DRAFT.md";

test("MT1/pacs.008 active candidate is explicitly SSI-resolution-only", () => {
  const memory = read(activeMemoryPath);
  assert.match(memory, /SSI_RESOLUTION_ONLY/);
  assert.match(memory, /IMPLEMENTATION NOT AUTHORIZED/);
  assert.match(memory, /Customer Payment Instructions.*not.*Bank SSI/is);
  assert.doesNotMatch(memory, /SSI-OPEN-01-P1/);
  assert.doesNotMatch(
    memory,
    /CREDITOR_DESTINATION_(?:CONFIRMED|NORMALIZED|DERIVED|REPAIR_REQUIRED)/,
  );
});

test("scope contract accepts governed context without owning CPI or message processing", () => {
  const contract = read(scopeContractPath);
  for (const required of [
    "profileId",
    "scenarioId",
    "fixtureBindingId",
    "upstreamValidatedDestination",
    "currentHop",
    "settlementContext",
  ]) {
    assert.match(contract, new RegExp(`\\b${required}\\b`));
  }
  for (const excluded of [
    "customer payment capture",
    "CPI authority",
    "CPI repair",
    "full NVR",
    "message composition",
    "payment execution",
  ]) {
    assert.match(contract, new RegExp(excluded, "i"));
  }
});

test("route matrix separates SSI applicability from resolution outcome", () => {
  const matrix = read(routeMatrixPath);
  assert.match(matrix, /ssiApplicability/);
  assert.match(matrix, /resolutionOutcome/);
  for (const context of ["INDA", "INGA", "COVE"]) {
    assert.match(matrix, new RegExp(`\\b${context}\\b`));
  }
  for (const outcome of [
    "ELIGIBLE_COMPLETE_ROUTE",
    "NO_ELIGIBLE_SSI",
    "AMBIGUOUS_ROUTE",
    "STALE",
    "INVALID_CONTEXT_TOPOLOGY",
    "UNSUPPORTED_PROFILE",
  ]) {
    assert.match(matrix, new RegExp(`\\b${outcome}\\b`));
  }
  assert.doesNotMatch(
    matrix,
    /CREDITOR_DESTINATION_(?:CONFIRMED|NORMALIZED|DERIVED|REPAIR_REQUIRED)/,
  );
});

test("COVE uses canonical SWIFT reimbursement roles without designing MT2", () => {
  const memory = read(activeMemoryPath);
  const matrix = read(routeMatrixPath);
  for (const role of [
    "INSTRUCTING_REIMBURSEMENT_AGENT",
    "INSTRUCTED_REIMBURSEMENT_AGENT",
    "THIRD_REIMBURSEMENT_AGENT",
  ]) {
    assert.match(matrix, new RegExp(`\\b${role}\\b`));
  }
  assert.doesNotMatch(matrix, /\b(?:OWN|COUNTERPARTY)_REIMBURSEMENT_AGENT\b/);
  assert.match(
    memory,
    /no pacs\.009 creation, design, correlation or execution/i,
  );
  assert.match(memory, /MT2.*out of scope/i);
});

test("topology and outcomes form one typed fail-closed contract", () => {
  const contract = read(scopeContractPath);
  const matrix = read(routeMatrixPath);
  assert.match(contract, /routeTopology/);
  assert.match(contract, /SERIAL\s*\|\s*COVER/);
  for (const value of [
    "NOT_EVALUATED",
    "INVALID_UPSTREAM_CONTEXT",
    "BILATERAL_RELATIONSHIP_CONFIRMED",
  ]) {
    assert.match(contract, new RegExp(`\\b${value}\\b`));
    assert.match(matrix, new RegExp(`\\b${value}\\b`));
  }
});

test("source register traces profile identity and SSI roles to SR2026", () => {
  const memory = read(activeMemoryPath);
  assert.match(memory, /pp\.171(?:–|-)172/);
  assert.match(memory, /pp\.255(?:–|-)256/);
  assert.match(memory, /pp\.297(?:–|-)298/);
  assert.match(memory, /p\.10/);
  assert.match(memory, /SWIFT facts/i);
  assert.match(memory, /controlled (?:BA\/Product|Product\/BA) policy/i);
  assert.match(memory, /pp\.195(?:–|-)203/);
  assert.match(memory, /pp\.279(?:–|-)287/);
  assert.match(memory, /pp\.318(?:–|-)324/);
  assert.match(memory, /Field 57a Usage Rules\/Example/i);
  assert.match(memory, /exclude.*Field 59a subsection/i);
});

test("profile identity never relies on MsgDefIdr without BizSvc", () => {
  const memory = read(activeMemoryPath);
  const contract = read(scopeContractPath);
  for (const document of [memory, contract]) {
    assert.match(document, /MsgDefIdr/);
    assert.match(document, /BizSvc/);
    assert.match(document, /must not|never|insufficient/i);
  }
  assert.match(memory, /pacs\.008\.001\.08.*swift\.cbprplus\.04/is);
  assert.match(memory, /pacs\.008\.001\.08.*swift\.cbprplus\.stp\.04/is);
});

test("profile-specific MT options are governed eligibility and fail closed", () => {
  const contract = read(scopeContractPath);
  const matrix = read(routeMatrixPath);
  for (const document of [contract, matrix]) {
    assert.match(document, /PROFILE_INCOMPLETE/);
    assert.match(document, /swiftOption|option compatibility/i);
  }
  assert.match(matrix, /Base.*REMIT.*A\/B\/D/is);
  assert.match(matrix, /STP.*53a.*A\/B/is);
  assert.match(matrix, /STP.*54a.*A/is);
  assert.match(matrix, /STP.*55a.*A/is);
  assert.match(matrix, /STP.*56a.*A/is);
  assert.match(matrix, /STP.*57a.*A/is);
  assert.match(
    matrix,
    /profile.*option.*(?:incompatible|mismatch).*PROFILE_INCOMPLETE/is,
  );
});

test("active candidate is outward SSI only and rejects inward contexts", () => {
  const memory = read(activeMemoryPath);
  const contract = read(scopeContractPath);
  const matrix = read(routeMatrixPath);
  for (const document of [memory, contract, matrix]) {
    assert.match(document, /OUTWARD_SSI_ONLY/);
  }
  assert.match(memory, /inward|received payment/i);
  assert.match(memory, /out of scope/i);
  assert.match(contract, /paymentDirection/);
  assert.match(contract, /exactly `?OUTWARD`?/i);
  assert.match(contract, /UNSUPPORTED_DIRECTION/);
  assert.match(matrix, /localBankRole=INSTRUCTING_AGENT/);
  assert.doesNotMatch(matrix, /localBankRole=INSTRUCTED_AGENT/);
  assert.match(matrix, /INWARD.*UNSUPPORTED_DIRECTION/is);
});

test("complete COVE route exposes profile-option failure in the R09 row", () => {
  const matrix = read(routeMatrixPath);
  const r09 = matrix.split(/\r?\n/).find((line) => line.includes("`R09`"));
  assert.ok(r09, "R09 matrix row must exist");
  assert.match(r09, /PROFILE_INCOMPLETE/);
  assert.match(r09, /NO_ELIGIBLE_SSI/);
});

test("MT1 index promotes the SSI-only candidate and retires CPI repair from active scope", () => {
  const index = read("memory/mt1/README.md");
  assert.match(index, /swift-mt1xx-pacs008-ssi-v3\.md/);
  assert.match(index, /OUTWARD_SSI_ONLY/);
  assert.match(index, /historical|superseded/i);
  assert.match(index, /upstream interface reference/i);
});

test("workspace pointer preserves the outward-only scope", () => {
  const instructions = read("CLAUDE.md");
  assert.match(instructions, /swift-mt1xx-pacs008-ssi-v3\.md/);
  assert.match(instructions, /OUTWARD_SSI_ONLY/);
});
