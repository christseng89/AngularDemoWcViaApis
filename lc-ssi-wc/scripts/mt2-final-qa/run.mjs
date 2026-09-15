import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config-loader.mjs";
import { WorkbookGate } from "./workbook-gate.mjs";
import { CaseResultGate } from "./case-result-gate.mjs";
import { MetricGate } from "./metric-gate.mjs";
import { ProcessGate } from "./process-gate.mjs";
import { QaOrchestrator } from "./orchestrator.mjs";
import { writeEvidence } from "./evidence-reporter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig(
  process.env.MT2_QA_CONFIG ??
    path.resolve(here, "../../qa/mt2/mt2-final/mt2-final-qa.config.json"),
);
const context = { workspace: path.resolve(here, "../..") };
const inventory = new WorkbookGate(config);
const inventoryResult = await inventory.execute();
const gates = [
  {
    async execute() {
      return inventoryResult;
    },
    id: inventory.id,
    required: true,
  },
];
for (const definition of config.gates)
  gates.push(new ProcessGate(definition, context));
if (inventoryResult.status === "PASS")
  gates.push(new CaseResultGate(config, inventoryResult));
gates.push(
  new MetricGate(
    "COVERAGE_GT_95",
    path.resolve(context.workspace, config.metrics.coverageFile),
    config.metrics.coverageProperty,
    config.thresholds.coverage,
    "gt",
  ),
  new MetricGate(
    "DUPLICATION_LT_1",
    path.resolve(context.workspace, config.metrics.sonarFile),
    config.metrics.duplicationProperty,
    config.thresholds.duplication,
    "lt",
  ),
);
const result = await new QaOrchestrator(gates, {
  failFast: config.failFast,
}).run();
const evidence = writeEvidence(config.evidenceDirectory, {
  ...result,
  configPath: config.configPath,
  workbookSha256: config.workbookSha256,
  baselineArtifacts: config.baselineArtifacts.map(({ file, role, sha256 }) => ({
    file: path.relative(context.workspace, file),
    role,
    sha256,
  })),
});
console.log(JSON.stringify({ ...result, evidence }, null, 2));
process.exitCode = result.status === "ACCEPTED" ? 0 : 1;
