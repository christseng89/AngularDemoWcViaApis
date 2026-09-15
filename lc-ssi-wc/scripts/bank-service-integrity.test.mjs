import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBankServiceIntegrity } from "./bank-service-integrity.mjs";

const bank = {
  bic: "CITIUS33",
  bankServiceId: "BANK-SVC-CITIUS33",
  status: "ACTIVE",
  validFrom: "2026-01-01",
  validTo: "2099-12-31",
};
const negatives = {
  fixtureClass: "QA_NEGATIVE_MISSING_BIC",
  items: [
    {
      counterpartyId: "QA-NEG-BANK-MISSING-BIC-01",
      partyType: "BANK",
      bankServiceId: null,
    },
    {
      counterpartyId: "QA-NEG-BANK-MISSING-BIC-02",
      partyType: "BANK",
      bankServiceId: null,
    },
  ],
};
const input = {
  catalogue: { asOf: "2026-09-10", defaults: {}, items: [bank] },
  activeSsiRecords: [{ route: { counterpartyBic: "CITIUS33" } }],
  negativeFixtures: negatives,
  ownSenderBics: [],
};

test("passes complete SSI and governed negative identities", () => {
  assert.equal(evaluateBankServiceIntegrity(input).status, "PASS");
});

test("fails closed for an unclassified missing Bank Service identity", () => {
  const result = evaluateBankServiceIntegrity({
    ...input,
    negativeFixtures: {
      ...negatives,
      items: [
        ...negatives.items,
        {
          counterpartyId: "UNCLASSIFIED",
          partyType: "BANK",
          bankServiceId: null,
        },
      ],
    },
  });
  assert.equal(result.status, "FAIL");
  assert.ok(
    result.failures.includes("UNCLASSIFIED_MISSING_BANK_IDENTITY:UNCLASSIFIED"),
  );
});

test("fails closed for missing and ambiguous SSI-referenced BICs", () => {
  const result = evaluateBankServiceIntegrity({
    ...input,
    catalogue: { ...input.catalogue, items: [bank, { ...bank }] },
    activeSsiRecords: [
      { route: { counterpartyBic: "CITIUS33", accountWithBic: "ROYCCAT2" } },
    ],
  });
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.includes("BANK_SERVICE_NOT_FOUND:ROYCCAT2"));
  assert.ok(
    result.failures.includes("AMBIGUOUS_BANK_SERVICE_IDENTITY:CITIUS33"),
  );
});
