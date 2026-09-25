import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config-loader.mjs";
import { MetricGate } from "./metric-gate.mjs";
import { ProcessGate } from "./process-gate.mjs";
import { QaOrchestrator } from "./orchestrator.mjs";
import { writeEvidence } from "./evidence-reporter.mjs";
import { acceptanceGateIds } from "./gate-plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig(
  process.env.MT2_QA_CONFIG ??
    path.resolve(here, "../../qa/tests/mt2/final/mt2-final-qa.config.json"),
);
const context = { workspace: path.resolve(here, "../..") };
const gates = [];
const finalSnapshotGate = config.gates.find(
  ({ id }) => id === "RUNTIME_SNAPSHOT_POST",
);
if (!finalSnapshotGate)
  throw new Error("RUNTIME_SNAPSHOT_POST final gate is required.");
const plannedIds = acceptanceGateIds(config.gates.map(({ id }) => id));
for (const definition of config.gates.filter(
  ({ id }) => id !== finalSnapshotGate.id,
))
  gates.push(new ProcessGate(definition, context));
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
// The operational snapshot is the last acceptance observation. Nothing that
// can mutate or inspect the governed DB may run after this finalizer.
gates.push(new ProcessGate(finalSnapshotGate, context));
if (gates.map(({ id }) => id).join("|") !== plannedIds.join("|"))
  throw new Error("Acceptance gate implementation does not match its plan.");
const result = await new QaOrchestrator(gates, {
  failFast: config.failFast,
}).run();
const evidence = writeEvidence(config.evidenceDirectory, {
  ...result,
  configPath: config.configPath,
  proposalCaseFile: path.relative(context.workspace, config.proposalCaseFile),
  baselineArtifacts: config.baselineArtifacts.map(({ file, role, sha256 }) => ({
    file: path.relative(context.workspace, file),
    role,
    sha256,
  })),
});
console.log(JSON.stringify({ ...result, evidence }, null, 2));
process.exitCode = result.status === "ACCEPTED" ? 0 : 1;
