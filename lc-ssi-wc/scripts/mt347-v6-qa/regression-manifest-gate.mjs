import fs from "node:fs";
import path from "node:path";
import { readJson } from "./file-utils.mjs";
import { result, Status } from "./result.mjs";

export const evaluateRegressionManifest = ({ workspace, manifestFile }) => {
  const manifest = readJson(manifestFile);
  const packageJson = readJson(path.join(workspace, "package.json"));
  const errors = [];
  if (!fs.existsSync(path.join(workspace, manifest.controlledMemory)))
    errors.push("Controlled MT2/pacs.009 memory is missing");
  for (const command of manifest.commands) {
    const match = /^npm run ([^\s]+)$/.exec(command);
    if (!match || !packageJson.scripts?.[match[1]])
      errors.push(`Regression command is unavailable: ${command}`);
  }
  if (!Array.isArray(manifest.oracles) || manifest.oracles.length < 5)
    errors.push(
      "Regression manifest must preserve all five controlled oracle classes",
    );
  return result(
    "MT2_PACS009_REGRESSION_MANIFEST",
    errors.length === 0 ? Status.PASS : Status.FAIL,
    {
      manifestFile,
      declaredStatus: manifest.status,
      executionClaim: false,
      commands: manifest.commands,
      oracleCount: manifest.oracles?.length ?? 0,
      errors,
    },
    errors.length === 0
      ? undefined
      : "MT2/pacs.009 regression manifest is invalid",
  );
};
