import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scanUiArchitecture } from "./architecture-gate.mjs";
import {
  compareParameterPayloads,
  evaluateContractTrace,
} from "./contract-pass-through-gate.mjs";
import { compareOracle, validateExecutionEvidence } from "./oracle.mjs";
import { Status, summarize } from "./result.mjs";
import { evaluateUpstreamEvidence } from "./upstream-evidence-gate.mjs";
import { controlledExpectations, evaluateWorkbook } from "./workbook-gate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../..");

test("controlled expectations conserve the v6 case ledger", () => {
  assert.equal(
    Object.values(controlledExpectations.polarity).reduce(
      (total, count) => total + count,
      0,
    ),
    controlledExpectations.cases,
  );
  assert.equal(
    Object.values(controlledExpectations.validationRuleOwners).reduce(
      (total, count) => total + count,
      0,
    ),
    49,
  );
  assert.equal(
    Object.values(controlledExpectations.negativeBoundaryOwners).reduce(
      (total, count) => total + count,
      0,
    ),
    210,
  );
});

test("controlled v6 workbook identity and all ledgers pass", async () => {
  const workbook = path.join(
    workspace,
    "qa/mt347/tdd/MT347_SR2026_SSI_TDD_CONTROLLED_v6.xlsx",
  );
  const report = await evaluateWorkbook({
    workbook,
    sidecar: `${workbook}.sha256.txt`,
    expectedSha256:
      "7EFFDFFF50F502E032A9AE1AF519A68886B53133DD065CAC53E10DA593A70EA0",
  });
  assert.equal(
    report.status,
    Status.PASS,
    JSON.stringify(report.evidence.errors),
  );
  assert.equal(report.evidence.ledgerRows.length, 29);
  assert.ok(
    report.evidence.ledgerRows.every(
      ({ calculated, expected, difference }) =>
        calculated === expected && difference === 0,
    ),
  );
});

test("parameter payload passes through unknown metadata unchanged", () => {
  const payload = {
    message: "MSG-X",
    sequence: "Q9",
    fields: [{ tag: "79Z", options: ["Z"] }],
    polarity: "FUTURE",
  };
  assert.deepEqual(
    compareParameterPayloads({
      contractVersion: "future-v1",
      correlationId: "corr-1",
      sourceIdentity: { kind: "SHA256", value: "abc" },
      api: { parameterPayload: payload },
      pageModel: { parameterPayload: JSON.parse(JSON.stringify(payload)) },
      uiRenderInput: { parameterPayload: JSON.parse(JSON.stringify(payload)) },
    }),
    [],
  );
});

test("parameter pass-through detects page or UI business transformation", () => {
  const errors = compareParameterPayloads({
    contractVersion: "1",
    correlationId: "corr-2",
    sourceIdentity: { kind: "SHA256", value: "def" },
    api: { parameterPayload: { message: "MSG-X", tag: "79Z" } },
    pageModel: { parameterPayload: { message: "MSG-X", tag: "57A" } },
    uiRenderInput: { parameterPayload: { message: "MT202", tag: "79Z" } },
  });
  assert.equal(errors.length, 2);
});

test("missing runtime contract trace remains NOT_EXECUTED", () => {
  assert.equal(
    evaluateContractTrace(path.join(os.tmpdir(), "missing-trace.json")).status,
    Status.NOT_EXECUTED,
  );
});

test("architecture gate catches decision tables and template branches", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "mt347-arch-"));
  const ui = path.join(workspace, "ui");
  fs.mkdirSync(ui);
  fs.writeFileSync(
    path.join(ui, "bad.ts"),
    'const rules = { "MT400|53A": "x" }; if (x === "MT400") {}',
  );
  fs.writeFileSync(
    path.join(ui, "bad.html"),
    '@if (item.messageType === "MT400") { <p>branch</p> }',
  );
  const report = scanUiArchitecture({ workspace, uiRoot: "ui" });
  assert.equal(report.status, Status.FAIL);
  assert.ok(report.evidence.violationCount >= 3);
});

test("architecture gate permits a generic renderer", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "mt347-generic-"));
  const ui = path.join(workspace, "ui");
  fs.mkdirSync(ui);
  fs.writeFileSync(
    path.join(ui, "generic.ts"),
    "export const render = (definition) => definition.fields.map((field) => field.label);",
  );
  assert.equal(
    scanUiArchitecture({ workspace, uiRoot: "ui" }).status,
    Status.PASS,
  );
});

test("machine oracle compares nested values and array shape", () => {
  assert.deepEqual(
    compareOracle(
      { tag: "57A", evidence: ["A"] },
      { tag: "57A", evidence: ["A"] },
    ),
    [],
  );
  assert.match(compareOracle({ tag: "57A" }, { tag: "58A" })[0], /57A/);
  assert.match(compareOracle(["A"], ["A", "B"])[0], /length/);
});

test("upstream evidence requires validator identity and isolated SSI outcome", () => {
  const errors = validateExecutionEvidence(
    {
      caseId: "MT306-006",
      correlationId: "corr",
      requestSha256: "a",
      responseSha256: "b",
      fixtureBinding: "FIX-MT306-006@v1",
      snapshotIdentity: "snapshot",
      validationOwner: "UPSTREAM_FIN_VALIDATOR",
      ssiOutcome: "REJECTED",
    },
    "UPSTREAM_FIN_VALIDATOR",
  );
  assert.ok(errors.some((error) => error.includes("validatorIdentity")));
  assert.ok(errors.some((error) => error.includes("NOT_EVALUATED")));
});

test("42 upstream cases cannot pass without a complete evidence file", () => {
  const ids = Array.from({ length: 42 }, (_, index) => `CASE-${index + 1}`);
  assert.equal(
    evaluateUpstreamEvidence(undefined, ids).status,
    Status.NOT_EXECUTED,
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt347-upstream-"));
  const file = path.join(directory, "partial.json");
  fs.writeFileSync(file, JSON.stringify({ cases: [] }));
  assert.equal(evaluateUpstreamEvidence(file, ids).status, Status.FAIL);
});

test("suite summary is fail closed", () => {
  const report = summarize([
    { gate: "design", status: Status.PASS },
    { gate: "runtime", status: Status.NOT_EXECUTED },
  ]);
  assert.equal(report.status, Status.BLOCKED);
});

test("a failed required gate blocks the suite without relabelling the TDD", () => {
  const report = summarize([
    { gate: "controlled-tdd", status: Status.PASS },
    { gate: "architecture", status: Status.FAIL },
  ]);
  assert.equal(report.status, Status.BLOCKED);
  assert.equal(report.counts.FAIL, 1);
});
