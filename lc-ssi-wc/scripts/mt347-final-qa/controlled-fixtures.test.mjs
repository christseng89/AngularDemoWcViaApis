import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const sha256 = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex")
    .toUpperCase();

test("controlled MT347 fixtures preserve the TDD v5 identities and isolation", () => {
  const manifest = readJson(
    "qa/mt347/fixtures/mt347-fixtures.v1.manifest.json",
  );
  assert.equal(
    manifest.sourceWorkbookSha256,
    "82C6ABCFD91E7D35E1382F8C86BF796D8DBF05CF8C8D94F9F0C7B5889AB52C9A",
  );
  const expected = { positive: 152, negative: 208, boundary: 2 };
  const identities = new Set();
  for (const [name, count] of Object.entries(expected)) {
    const artifact = manifest.artifacts[name];
    const relativePath = `qa/mt347/fixtures/mt347-${name}.v1.json`;
    const data = readJson(relativePath);
    assert.equal(artifact.count, count);
    assert.equal(data.records.length, count);
    assert.equal(artifact.sha256, sha256(relativePath));
    assert.equal(
      data.loadPolicy,
      name === "positive" ? "CANONICAL_RELOAD" : "ISOLATED_TEST_ONLY",
    );
    for (const record of data.records) {
      assert.equal(identities.has(record.testCaseId), false, record.testCaseId);
      identities.add(record.testCaseId);
      assert.match(record.bindingId, /^FIX-MT.+@v1$/);
      if (name !== "boundary") {
        assert.ok(record.identity.ssi.id);
        assert.ok(record.identity.applicability.id);
        assert.ok(record.identity.rma.id);
      }
    }
  }
  assert.equal(identities.size, 362);
});

test("the governed catalogue carries the corrected v5 NVR semantics", () => {
  const catalogue = readJson("parameters/ssi-mappings.sr2026.json");
  assert.equal(catalogue.catalogueVersion, "SR2026-MT347-TDD-v5");
  const mappings = catalogue.mappings;
  const rows = (messageType, sequence, tag) =>
    mappings.filter(
      (row) =>
        row.messageType === messageType &&
        row.sequence === sequence &&
        row.tag === tag,
    );
  for (const [messageType, sequences] of [
    ["MT360", ["D", "G"]],
    ["MT361", ["D", "G", "K", "L"]],
  ]) {
    for (const sequence of sequences) {
      for (const row of rows(messageType, sequence, "56"))
        assert.deepEqual(row.nvrRefs, ["C14"]);
      for (const row of rows(messageType, sequence, "57"))
        assert.deepEqual(row.nvrRefs, []);
    }
  }
  for (const sequence of ["L", "M"])
    for (const row of rows("MT360", sequence, "57"))
      assert.deepEqual(row.nvrRefs, ["C13"]);
  for (const sequence of ["M", "N"])
    for (const row of rows("MT361", sequence, "57"))
      assert.deepEqual(row.nvrRefs, ["C13"]);
});

test("canonical seed contains every executable MT347 binding and excludes scope boundaries", () => {
  const positive = readJson("qa/mt347/fixtures/mt347-positive.v1.json").records;
  const negative = readJson("qa/mt347/fixtures/mt347-negative.v1.json").records;
  const seed = readJson("fixtures/ssi-demo.v15.3.canonical.seed.json");
  const payloads = (table) =>
    seed.tables[table].rows.map((row) =>
      JSON.parse(row[seed.tables[table].columns.indexOf("payload")]),
    );
  const ssiBindings = new Set(
    payloads("ssi")
      .map((row) => row.fixtureBindingId)
      .filter(Boolean),
  );
  const applicabilityBindings = new Set(
    payloads("ssi_applicability")
      .map((row) => row.fixtureBindingId)
      .filter(Boolean),
  );
  const rmaBindings = new Set(
    payloads("rma_authorisation")
      .map((row) => row.fixtureBindingId)
      .filter(Boolean),
  );
  for (const record of positive) {
    assert.equal(
      ssiBindings.has(record.bindingId),
      true,
      `SSI ${record.bindingId}`,
    );
    assert.equal(
      applicabilityBindings.has(record.bindingId),
      true,
      `applicability ${record.bindingId}`,
    );
    assert.equal(
      rmaBindings.has(record.bindingId),
      true,
      `RMA ${record.bindingId}`,
    );
  }
  for (const record of negative.filter(
    ({ testCaseId }) => testCaseId !== "MT742-010",
  )) {
    assert.equal(
      ssiBindings.has(record.bindingId),
      true,
      `negative SSI ${record.bindingId}`,
    );
    assert.equal(
      applicabilityBindings.has(record.bindingId),
      true,
      `negative applicability ${record.bindingId}`,
    );
    assert.equal(
      rmaBindings.has(record.bindingId),
      true,
      `negative RMA ${record.bindingId}`,
    );
  }
  assert.equal(ssiBindings.has("FIX-MT742-010@v1"), false);
  assert.equal(ssiBindings.has("FIX-MT416-AUDIT-001@v1"), false);
  assert.equal(ssiBindings.has("FIX-MT785-AUDIT-001@v1"), false);
});

test("fixture role inputs are sourced independently from expected assertions", () => {
  const configuration = readJson("parameters/mt347-fixture-inputs.v1.json");
  const positive = readJson("qa/mt347/fixtures/mt347-positive.v1.json");
  assert.equal(configuration.sourcePolicy, "INPUT_ONLY_NO_EXPECTED_ORACLE");
  for (const record of positive.records) {
    assert.equal(
      record.roleValuesSource,
      "INPUT_CONFIGURATION",
      record.testCaseId,
    );
  }
  const source = readFileSync(
    join(root, "scripts/mt347-final-qa/build-controlled-fixtures.py"),
    "utf8",
  );
  const inputFunction = source.match(
    /def role_values_from_input\([\s\S]+?\n {4}return ssi_values, transaction_values, provenance/,
  );
  assert.ok(inputFunction, "input-only role builder must exist");
  assert.doesNotMatch(inputFunction[0], /expected|expected_tags/i);
});

test("canonical role ownership follows the governed FIN profile", () => {
  const positive = readJson("qa/mt347/fixtures/mt347-positive.v1.json").records;
  const catalogue = readJson("parameters/ssi-mappings.sr2026.json").mappings;
  for (const record of positive) {
    const allowedSsiRoles = new Set(
      catalogue
        .filter(
          (row) =>
            row.messageType === record.messageType &&
            row.sequence === record.sequence &&
            row.scopeStatus === "SSI_SUPPORTED",
        )
        .map((row) => row.canonicalRole),
    );
    const allowedTransactionRoles = new Set(
      catalogue
        .filter(
          (row) =>
            row.messageType === record.messageType &&
            row.sequence === record.sequence,
        )
        .map((row) => row.canonicalRole),
    );
    for (const role of Object.keys(record.ssiRoleValues))
      assert.equal(
        allowedSsiRoles.has(role),
        true,
        `${record.testCaseId}: ${role}`,
      );
    for (const role of Object.keys(record.transactionRoleValues))
      assert.equal(
        allowedTransactionRoles.has(role),
        true,
        `${record.testCaseId}: transaction ${role}`,
      );
    for (const [role, evidence] of Object.entries(record.roleProvenance)) {
      const expectedOwner = Object.hasOwn(record.transactionRoleValues, role)
        ? "TRANSACTION_CONTEXT"
        : "SSI";
      assert.equal(
        evidence.owner,
        expectedOwner,
        `${record.testCaseId}: ${role}`,
      );
    }
  }
  for (const caseId of ["MT742-013", "MT754-013"]) {
    const record = positive.find((row) => row.testCaseId === caseId);
    assert.ok(
      record.identity.nostro.id,
      `${caseId}: controlled credited account identity`,
    );
    assert.match(record.expectedAccountReference, /-CREDITED$/);
  }
  for (const caseId of ["MT742-006", "MT742-013", "MT754-011", "MT754-013"]) {
    const record = positive.find((row) => row.testCaseId === caseId);
    assert.ok(record.transactionRoleValues.BENEFICIARY_BANK, caseId);
    assert.equal(
      record.roleProvenance.BENEFICIARY_BANK.owner,
      "TRANSACTION_CONTEXT",
    );
    assert.ok(record.expectedTags["MESSAGE.58A"], `${caseId}: 58A oracle`);
  }
});

test("transaction-owned roles are kept outside standing SSI route data", () => {
  const seed = readJson("fixtures/ssi-demo.v15.3.canonical.seed.json");
  const payloads = (table) =>
    seed.tables[table].rows.map((row) =>
      JSON.parse(row[seed.tables[table].columns.indexOf("payload")]),
    );
  const fixtureSsis = payloads("ssi").filter(
    (row) => row.fixtureFamily === "MT347-SR2026-SSI",
  );
  const fixtureApplicability = payloads("ssi_applicability").filter(
    (row) => row.fixtureFamily === "MT347-SR2026-SSI",
  );
  const variants = readJson(
    "qa/mt347/fixtures/mt347-executable-counterparties.v4.json",
  );
  assert.deepEqual(variants.supportedCurrencies, [
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "HKD",
  ]);
  assert.equal(variants.records.length, 359 * 14);
  assert.equal(fixtureSsis.length, 359 + variants.records.length);
  const countsByGroup = new Map();
  const countsByGroupCurrency = new Map();
  for (const row of fixtureSsis) {
    const group = row.route.fixtureGroupId ?? row.fixtureBindingId;
    countsByGroup.set(group, (countsByGroup.get(group) ?? 0) + 1);
    const key = `${group}|${row.route.currency}`;
    countsByGroupCurrency.set(key, (countsByGroupCurrency.get(key) ?? 0) + 1);
  }
  assert.equal(countsByGroup.size, 359);
  assert.ok([...countsByGroup.values()].every((count) => count === 15));
  assert.equal(countsByGroupCurrency.size, 359 * 5);
  assert.ok([...countsByGroupCurrency.values()].every((count) => count === 3));
  for (const row of fixtureSsis) {
    assert.equal(
      Object.hasOwn(row, "transactionRoleValues"),
      false,
      row.fixtureBindingId,
    );
    for (const evidence of Object.values(row.route.roleProvenance ?? {}))
      assert.equal(evidence.owner, "SSI", row.fixtureBindingId);
  }
  assert.ok(
    fixtureApplicability.some(
      (row) => Object.keys(row.transactionRoleValues ?? {}).length > 0,
    ),
    "transaction fixture context must be persisted outside standing SSI",
  );
});

test("MT300-001 offers three governed SSI counterparties in each controlled currency", () => {
  const seed = readJson("fixtures/ssi-demo.v15.3.canonical.seed.json");
  const payloads = (table) =>
    seed.tables[table].rows.map((row) =>
      JSON.parse(row[seed.tables[table].columns.indexOf("payload")]),
    );
  const applicabilityBySsi = new Map(
    payloads("ssi_applicability")
      .filter(
        (row) =>
          row.fixtureFamily === "MT347-SR2026-SSI" &&
          row.messageType === "MT300" &&
          row.sequence === "B1" &&
          row.settlementLeg === "Amount Bought",
      )
      .map((row) => [row.ssiId, row]),
  );
  const candidates = payloads("ssi").filter(
    (row) =>
      row.fixtureFamily === "MT347-SR2026-SSI" &&
      (row.route.fixtureGroupId ?? row.fixtureBindingId) ===
        "FIX-MT300-001@v1" &&
      applicabilityBySsi.has(row.id),
  );
  for (const currency of ["USD", "EUR", "GBP", "JPY", "HKD"]) {
    const matches = candidates.filter(
      (row) =>
        row.route.currency === currency &&
        applicabilityBySsi.get(row.id).currency === currency,
    );
    assert.equal(matches.length, 3, currency);
    assert.equal(
      new Set(matches.map((row) => row.route.counterpartyBic)).size,
      3,
      currency,
    );
  }
});
