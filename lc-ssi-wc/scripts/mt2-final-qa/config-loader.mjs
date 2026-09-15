import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const assert = (condition, message) => {
  if (!condition) throw new Error(`INVALID_QA_CONFIG: ${message}`);
};

export const loadConfig = (configPath) => {
  const absolute = path.resolve(configPath);
  const root = path.dirname(absolute);
  const config = JSON.parse(fs.readFileSync(absolute, "utf8"));
  assert(config.schemaVersion === 1, "schemaVersion must be 1");
  assert(config.expectedCaseCount > 0, "expectedCaseCount must be positive");
  assert(
    config.thresholds?.coverage >= 95,
    "coverage exclusive threshold must be >= 95",
  );
  assert(
    config.thresholds?.duplication <= 1,
    "duplication exclusive threshold must be <= 1",
  );
  assert(
    Array.isArray(config.gates) && config.gates.length > 0,
    "gates are required",
  );
  const ids = config.gates.map(({ id }) => id);
  assert(new Set(ids).size === ids.length, "gate ids must be unique");
  const resolve = (value) => path.resolve(root, value);
  const workbook = resolve(config.workbook);
  assert(fs.existsSync(workbook), `workbook does not exist: ${workbook}`);
  const workbookSha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(workbook))
    .digest("hex")
    .toUpperCase();
  assert(
    workbookSha256 === config.workbookSha256,
    `workbook SHA-256 mismatch: ${workbookSha256}`,
  );
  assert(
    Array.isArray(config.baselineArtifacts) &&
      config.baselineArtifacts.length > 0,
    "baselineArtifacts are required",
  );
  const baselineArtifacts = config.baselineArtifacts.map((artifact) => {
    const file = resolve(artifact.file);
    assert(fs.existsSync(file), `baseline artifact does not exist: ${file}`);
    const sha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex")
      .toUpperCase();
    assert(
      sha256 === artifact.sha256,
      `baseline artifact SHA-256 mismatch for ${artifact.role}: ${sha256}`,
    );
    return Object.freeze({ ...artifact, file, sha256 });
  });
  return Object.freeze({
    ...config,
    configPath: absolute,
    workbook,
    workbookSha256,
    baselineArtifacts: Object.freeze(baselineArtifacts),
    resultFile: resolve(config.resultFile),
    evidenceDirectory: resolve(config.evidenceDirectory),
  });
};
