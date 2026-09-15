const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const ROLE_FIELDS = [
  "counterpartyBic",
  "accountWithBic",
  "intermediaryBic",
  "beneficiaryBic",
  "actualReceiverBic",
];

const activeAt = (bank, asOf) =>
  bank.status === "ACTIVE" && bank.validFrom <= asOf && asOf <= bank.validTo;

export function evaluateBankServiceIntegrity({
  catalogue,
  activeSsiRecords,
  negativeFixtures,
  ownSenderBics = ["DEMOHKHH"],
}) {
  const asOf = catalogue.asOf;
  const banks = catalogue.items.map((item) => ({
    ...catalogue.defaults,
    ...item,
  }));
  const activeBanks = banks.filter((bank) => activeAt(bank, asOf));
  const activeByBic = new Map();
  const activeById = new Map();
  for (const bank of activeBanks) {
    const id = bank.bankServiceId ?? `BANK-SVC-${bank.bic}`;
    activeByBic.set(bank.bic, [...(activeByBic.get(bank.bic) ?? []), bank]);
    activeById.set(id, [...(activeById.get(id) ?? []), bank]);
  }

  const referencedBics = new Set(ownSenderBics);
  for (const record of activeSsiRecords) {
    for (const field of ROLE_FIELDS) {
      const value = record.route?.[field];
      if (typeof value === "string" && value && value !== "ANY")
        referencedBics.add(value);
    }
  }

  const failures = [];
  for (const bic of referencedBics) {
    if (!BIC.test(bic)) failures.push(`INVALID_REFERENCED_BIC:${bic}`);
    const matches = activeByBic.get(bic) ?? [];
    if (matches.length === 0) failures.push(`BANK_SERVICE_NOT_FOUND:${bic}`);
    if (matches.length > 1)
      failures.push(`AMBIGUOUS_BANK_SERVICE_IDENTITY:${bic}`);
  }
  for (const bank of banks) {
    const id = bank.bankServiceId ?? `BANK-SVC-${bank.bic}`;
    if (!BIC.test(bank.bic)) failures.push(`INVALID_BANK_SERVICE_BIC:${id}`);
    if ((activeById.get(id) ?? []).length > 1)
      failures.push(`AMBIGUOUS_BANK_SERVICE_IDENTITY:${id}`);
  }

  const permittedNegativeIds = new Set([
    "QA-NEG-BANK-MISSING-BIC-01",
    "QA-NEG-BANK-MISSING-BIC-02",
  ]);
  if (negativeFixtures.fixtureClass !== "QA_NEGATIVE_MISSING_BIC")
    failures.push("INVALID_NEGATIVE_FIXTURE_CLASS");
  if (negativeFixtures.items.length < 2 || negativeFixtures.items.length > 3)
    failures.push("INVALID_NEGATIVE_FIXTURE_COUNT");
  for (const fixture of negativeFixtures.items) {
    if (
      !permittedNegativeIds.has(fixture.counterpartyId) ||
      fixture.partyType !== "BANK" ||
      fixture.bankServiceId !== null
    )
      failures.push(
        `UNCLASSIFIED_MISSING_BANK_IDENTITY:${fixture.counterpartyId}`,
      );
  }

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    asOf,
    counts: {
      catalogue: banks.length,
      activeBankServices: activeBanks.length,
      activeSsiRecords: activeSsiRecords.length,
      referencedBics: referencedBics.size,
      qaNegativeFixtures: negativeFixtures.items.length,
    },
    referencedBics: [...referencedBics].sort(),
    failures: [...new Set(failures)].sort(),
  };
}
