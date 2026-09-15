import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URLSearchParams } from "node:url";

const baseUrl = process.env.SSI_API_URL ?? "http://localhost:3100/api";
const catalogue = JSON.parse(
  await readFile("parameters/resolution-page-scenarios.sr2026.json", "utf8"),
);
const currencies = ["USD", "EUR", "GBP", "JPY", "HKD"];
const scenarios = catalogue.scenarios.filter(
  (scenario) =>
    scenario.polarity !== "BOUNDARY" &&
    !scenario.closureDisposition.startsWith("OUT_OF_SCOPE_CLOSED"),
);
assert.equal(scenarios.length, 359);

const probe = async (scenario, currency) => {
  const query = new URLSearchParams({
    scenarioId: scenario.scenarioId,
    messageType: scenario.messageType,
    sequence: scenario.sequence,
    currency,
    bookingEntity: "HK01",
    valueDate: "2026-09-14",
  });
  const response = await fetch(
    `${baseUrl}/v1/resolution-page-definitions/lookups/ssi-counterparties?${query}`,
  );
  assert.equal(response.status, 200, `${scenario.scenarioId}/${currency}`);
  const body = await response.json();
  assert.equal(body.items.length, 3, `${scenario.scenarioId}/${currency}`);
  assert.deepEqual(
    body.items.map(({ bankServiceId }) => bankServiceId).sort(),
    ["BANK-SVC-BOFAUS3N", "BANK-SVC-CHASUS33", "BANK-SVC-DEUTDEFF"],
    `${scenario.scenarioId}/${currency}`,
  );
  assert.equal(
    body.defaultSelection?.value,
    "BANK-SVC-DEUTDEFF",
    `${scenario.scenarioId}/${currency}/default`,
  );
};

const work = scenarios.flatMap((scenario) =>
  currencies.map((currency) => [scenario, currency]),
);
for (let offset = 0; offset < work.length; offset += 40)
  await Promise.all(
    work
      .slice(offset, offset + 40)
      .map(([scenario, currency]) => probe(scenario, currency)),
  );

console.log(
  JSON.stringify({
    scenarios: scenarios.length,
    positive: scenarios.filter(({ polarity }) => polarity === "POSITIVE")
      .length,
    negative: scenarios.filter(({ polarity }) => polarity === "NEGATIVE")
      .length,
    currencies: currencies.length,
    lookups: work.length,
    candidatesPerLookup: 3,
    defaultBankServiceId: "BANK-SVC-DEUTDEFF",
  }),
);
