import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanUiArchitecture } from "./architecture-gate.mjs";
import { evaluateContractTrace } from "./contract-pass-through-gate.mjs";
import { stableJsonText } from "./file-utils.mjs";
import { evaluateRegressionManifest } from "./regression-manifest-gate.mjs";
import { Status, summarize } from "./result.mjs";
import { evaluateUpstreamEvidence } from "./upstream-evidence-gate.mjs";
import { evaluateWorkbook } from "./workbook-gate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../..");
const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const controlledWorkbook = path.join(
  workspace,
  "qa/tdd/mt347/MT347_SR2026_SSI_TDD_CONTROLLED_v6.xlsx",
);
const workbookResult = await evaluateWorkbook({
  workbook: controlledWorkbook,
  sidecar: `${controlledWorkbook}.sha256.txt`,
  expectedSha256:
    "7EFFDFFF50F502E032A9AE1AF519A68886B53133DD065CAC53E10DA593A70EA0",
});
const upstreamCaseIds =
  workbookResult.evidence.upstreamValidator?.caseIds ?? [];

const report = summarize([
  workbookResult,
  scanUiArchitecture({
    workspace,
    uiRoot: "apps/ssi-portal/src/app",
  }),
  evaluateContractTrace(valueAfter("--contract-trace")),
  evaluateUpstreamEvidence(valueAfter("--upstream-evidence"), upstreamCaseIds),
  evaluateRegressionManifest({
    workspace,
    manifestFile: path.join(here, "mt2-pacs009-regression.manifest.json"),
  }),
]);
const output = stableJsonText({
  generatedAt: new Date().toISOString(),
  suite: "MT347_V6_API_DRIVEN_UI_ACCEPTANCE",
  acceptanceClaim: report.status === Status.PASS,
  ...report,
});
const outputFile = valueAfter("--output");
if (outputFile) {
  fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
  fs.writeFileSync(path.resolve(outputFile), output);
}
process.stdout.write(output);
process.exitCode = report.status === Status.PASS ? 0 : 1;
