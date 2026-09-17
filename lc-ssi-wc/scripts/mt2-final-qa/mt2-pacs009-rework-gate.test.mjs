import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { evaluateMt2Pacs009Gate } from "./mt2-pacs009-rework-gate.mjs";

const contract = JSON.parse(
  fs.readFileSync("qa/mt2/mt2-final/mt2-pacs009-rework-gate.json", "utf8"),
);

const canonicalSeed = JSON.parse(
  fs.readFileSync(
    "qa/FIX_DATA/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json",
    "utf8",
  ),
);
const mt2FixtureManifest = JSON.parse(
  fs.readFileSync(
    "parameters/resolution-page-fixtures.mt2-pacs009.sr2026.json",
    "utf8",
  ),
);

const seedPayloads = (tableName) => {
  const table = canonicalSeed.tables[tableName];
  const payloadIndex = table.columns.indexOf("payload");
  assert.notEqual(payloadIndex, -1, `${tableName} must expose payload`);
  return table.rows.map((row) => JSON.parse(row[payloadIndex]));
};

test("acceptance scope is exactly the four governed MT2 messages and profiles", () => {
  assert.deepEqual(contract.scope.messages, [
    "MT202",
    "MT202COV",
    "MT205",
    "MT205COV",
  ]);
  for (const message of contract.scope.messages) {
    assert.equal(
      contract.scope.profiles[message].messageDefinitionId,
      "pacs.009.001.08",
    );
    assert.equal(
      contract.scope.profiles[message].businessService,
      message.endsWith("COV") ? "swift.cbprplus.cov.04" : "swift.cbprplus.04",
    );
  }
});

test("missing execution evidence remains NOT_EXECUTED and blocks acceptance", () => {
  const report = evaluateMt2Pacs009Gate(contract);
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.summary.NOT_EXECUTED, contract.requirements.length);
  assert.equal(report.summary.PASS, 0);
});

test("PASS without an evidence reference is converted to FAIL", () => {
  const result = evaluateMt2Pacs009Gate(contract, {
    results: [{ id: contract.requirements[0].id, status: "PASS" }],
  }).results[0];
  assert.equal(result.status, "FAIL");
  assert.match(result.reason, /forbidden/);
});

test("duplicate, unexpected and failed evidence blocks acceptance", () => {
  const id = contract.requirements[0].id;
  const report = evaluateMt2Pacs009Gate(contract, {
    results: [
      { id, status: "PASS", evidence: ["first.json"] },
      { id, status: "FAIL", evidence: ["second.json"] },
      { id: "UNKNOWN", status: "PASS", evidence: ["unknown.json"] },
    ],
  });
  assert.equal(report.status, "BLOCKED");
  assert.deepEqual(report.duplicateIds, [id]);
  assert.deepEqual(report.unexpectedIds, ["UNKNOWN"]);
});

test("acceptance requires referenced PASS evidence for every requirement", () => {
  const report = evaluateMt2Pacs009Gate(contract, {
    results: contract.requirements.map(({ id }) => ({
      id,
      status: "PASS",
      evidence: [`qa/mt2/evidence/${id}.json`],
    })),
  });
  assert.equal(report.status, "ACCEPTED");
  assert.equal(report.summary.PASS, contract.requirements.length);
  assert.equal(report.summary.FAIL, 0);
  assert.equal(report.summary.NOT_EXECUTED, 0);
});

test("canonical QA and UI data provides three resolvable MT2 SSI paths per currency", () => {
  const currencies = [
    "AUD",
    "CAD",
    "CHF",
    "CNY",
    "EUR",
    "GBP",
    "HKD",
    "JPY",
    "SGD",
    "USD",
  ];
  const effectiveDate = "2026-09-15";
  const nostros = seedPayloads("nostro_account").filter((record) => {
    const family = record.fixtureFamily?.trim();
    return (
      (!family || /^MT2[-_]/i.test(family)) &&
      record.status === "ACTIVE" &&
      record.purpose === "SETTLEMENT" &&
      record.ownLegalEntityId === "HK01" &&
      record.validFrom.slice(0, 10) <= effectiveDate &&
      effectiveDate <= record.validTo.slice(0, 10)
    );
  });
  const ssis = seedPayloads("ssi").filter((record) => {
    const route = record.route ?? {};
    return (
      record.status === "ACTIVE" &&
      String(route.messageTypes ?? "")
        .split(",")
        .map((value) => value.trim())
        .includes("pacs.009.001.08") &&
      ["MT202", "MT202COV", "MT205", "MT205COV"].every((message) =>
        String(route.sourceMessageTypes ?? "")
          .split(",")
          .map((value) => value.trim())
          .includes(message),
      )
    );
  });
  const rmas = seedPayloads("rma_authorisation").filter(
    (record) =>
      record.status === "ACTIVE" &&
      ["FINPLUS", "FIN / FINPLUS"].includes(record.service) &&
      record.direction === "OUTBOUND" &&
      record.messageTypes.includes("pacs.009.001.08") &&
      record.validFrom.slice(0, 10) <= effectiveDate &&
      effectiveDate <= record.validTo.slice(0, 10),
  );
  const failures = currencies.flatMap((currency) => {
    const byReceiver = new Map();
    for (const record of nostros.filter((item) => item.currency === currency)) {
      const references = byReceiver.get(record.accountServicerBic) ?? new Set();
      references.add(record.accountReference);
      byReceiver.set(record.accountServicerBic, references);
    }
    const resolvable = [...byReceiver.entries()]
      .filter(([, references]) => references.size >= 2)
      .map(([bic]) => bic)
      .sort();
    const counterparties = [
      ...new Set(
        ssis
          .filter((record) => record.route.currency === currency)
          .map((record) => record.route.counterpartyBic),
      ),
    ].filter(Boolean);
    const rmaReceivers = new Set(rmas.map((record) => record.counterpartyBic));
    const unauthorised = resolvable.filter((bic) => !rmaReceivers.has(bic));
    return resolvable.length >= 3 &&
      counterparties.length >= 3 &&
      !unauthorised.length
      ? []
      : [
          {
            currency,
            expected: 3,
            resolvable: resolvable.length,
            counterparties: counterparties.length,
            unauthorised,
          },
        ];
  });

  assert.deepEqual(failures, []);
});

test("canonical MT2 component records persist only exact operational fixture bindings", () => {
  const operationalBindings = mt2FixtureManifest.bindings
    .filter(({ polarity }) => polarity === "POSITIVE")
    .map(({ bindingId }) => bindingId)
    .sort();
  const forbiddenBindings = new Set(
    mt2FixtureManifest.bindings
      .filter(({ polarity }) => polarity !== "POSITIVE")
      .map(({ bindingId }) => bindingId),
  );
  for (const tableName of [
    "ssi",
    "ssi_applicability",
    "nostro_account",
    "rma_authorisation",
  ]) {
    const records = seedPayloads(tableName).filter(
      ({ fixtureFamily }) => fixtureFamily === "MT2-UI-PARITY-V1",
    );
    assert.ok(records.length > 0, `${tableName} must contain MT2 records`);
    for (const record of records) {
      assert.deepEqual(
        [...record.fixtureBindingIds].sort(),
        operationalBindings,
        `${tableName}/${record.id} must persist the operational bindings`,
      );
      assert.equal(
        record.fixtureBindingIds.some((bindingId) =>
          forbiddenBindings.has(bindingId),
        ),
        false,
        `${tableName}/${record.id} must not admit QA/negative/boundary bindings`,
      );
    }
  }
});

test("each MT2 operational currency has exactly three routes and one best default", () => {
  const routes = seedPayloads("ssi").filter(
    ({ fixtureFamily, status }) =>
      fixtureFamily === "MT2-UI-PARITY-V1" && status === "ACTIVE",
  );
  for (const currency of [
    ...new Set(routes.map(({ route }) => route.currency)),
  ]) {
    const candidates = routes.filter(
      ({ route }) => route.currency === currency,
    );
    const priorities = candidates.map(({ route }) => Number(route.priority));
    const best = Math.min(...priorities);
    assert.equal(candidates.length, 3, `${currency} route count`);
    assert.equal(
      priorities.filter((priority) => priority === best).length,
      1,
      `${currency} must have one unique best default`,
    );
  }
});
