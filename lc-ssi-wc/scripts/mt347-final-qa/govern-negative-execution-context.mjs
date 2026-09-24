import { readFile, writeFile } from "node:fs/promises";

const cataloguePath = "parameters/resolution-page-scenarios.sr2026.json";
const catalogue = JSON.parse(await readFile(cataloguePath, "utf8"));
const optionPattern =
  /(?:candidate|requested)=(?:(?:[A-Z]\d?|B\d)\.)?(\d{2})([A-Z])\b/;

let governed = 0;
for (const scenario of catalogue.scenarios ?? []) {
  if (scenario.polarity !== "NEGATIVE") continue;
  const match = scenario.traceability?.rawInputContract?.match(optionPattern);
  if (!match) continue;
  scenario.executionContext = {
    ...scenario.executionContext,
    fieldOptions: {
      ...scenario.executionContext?.fieldOptions,
      [match[1]]: match[2],
    },
  };
  governed += 1;
}

if (governed !== 108)
  throw new Error(
    `Expected 108 governed FIN option scenarios, found ${governed}`,
  );

await writeFile(
  cataloguePath,
  `${JSON.stringify(catalogue, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({ cataloguePath, governed }, null, 2));
