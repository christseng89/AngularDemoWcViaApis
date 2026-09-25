import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config-loader.mjs";
import {
  applyRuntimeBinding,
  fetchRuntimeEvidence,
} from "./runtime-snapshot-gate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig(
  process.env.MT2_QA_CONFIG ??
    path.resolve(here, "../../qa/tests/mt2/final/mt2-final-qa.config.json"),
);
const evidence = await fetchRuntimeEvidence({
  url:
    process.env.MT2_QA_RUNTIME_EVIDENCE_URL ??
    "http://localhost:3100/api/settings/development-data/evidence",
  password: process.env.SSI_DEMO_ADMIN_PASSWORD,
});
const mode = process.argv[2];
applyRuntimeBinding({
  mode,
  bindingFile: path.resolve(
    path.dirname(config.configPath),
    config.runtimeBinding.evidenceFile,
  ),
  snapshotMethod: config.runtimeBinding.snapshotMethod,
  evidence,
});
process.stdout.write(
  `PASS: ${mode} runtime logical snapshot ${evidence.currentSnapshot.sha256}\n`,
);
