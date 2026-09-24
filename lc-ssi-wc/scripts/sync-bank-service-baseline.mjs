import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const catalogue = JSON.parse(
  readFileSync(resolve("parameters/bank-services.json"), "utf8"),
);
const items = catalogue.items
  .map((item) => ({ ...catalogue.defaults, ...item }))
  .filter(
    (bank) =>
      bank.status === "ACTIVE" &&
      bank.validFrom <= catalogue.asOf &&
      catalogue.asOf <= bank.validTo,
  )
  .map((bank) => ({
    ...bank,
    bankServiceId: bank.bankServiceId ?? `BANK-SVC-${bank.bic}`,
    demoNostro: bank.demoNostro === true,
    partyType: "BANK",
  }));
const baseline = {
  items,
  total: items.length,
  source: catalogue.source,
  asOf: catalogue.asOf,
  disclaimer: catalogue.disclaimer,
  eligibilityInvariant:
    "Bank Directory identity does not create SSI, Nostro, RMA or route eligibility.",
};
const body = `${JSON.stringify(baseline, null, 2)}\n`;
const output = resolve(
  "qa/fixtures/mt2/baselines/bank-service.current.json",
);
writeFileSync(output, body, "utf8");
console.log(
  JSON.stringify({
    output,
    total: items.length,
    sha256: createHash("sha256").update(body).digest("hex").toUpperCase(),
  }),
);
