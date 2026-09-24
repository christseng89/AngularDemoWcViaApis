import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluateBankServiceIntegrity } from "./bank-service-integrity.mjs";

const readJson = (file) => JSON.parse(readFileSync(resolve(file), "utf8"));
const catalogue = readJson("parameters/bank-services.json");
const activeSsi = readJson(
  "qa/fixtures/mt2/baselines/ssi-bank-counterparty-active.current.json",
);
const negativeFixtures = readJson(
  "parameters/bank-counterparty-negative-fixtures.json",
);
const result = evaluateBankServiceIntegrity({
  catalogue,
  activeSsiRecords: activeSsi.records,
  negativeFixtures,
});
const output = resolve("qa/reports/latest/mt2/bank-service-integrity.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result));
if (result.status !== "PASS") process.exitCode = 1;
