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
    config.reviewContract?.policy === "SINGLE_GENERATED_NEW_RULE_CASE_SET",
    "reviewContract.policy must require one generated new-rule case set",
  );
  assert(
    JSON.stringify(config.reviewContract?.reviewers) ===
      JSON.stringify(["BA", "QA", "DBA"]),
    "reviewContract.reviewers must be BA, QA and DBA",
  );
  assert(
    config.reviewContract?.caseCatalogueRole === "PROPOSAL_CASE_CATALOGUE" &&
      config.reviewContract?.fixtureSetRole === "PROPOSAL_EXECUTABLE_FIXTURES",
    "reviewContract must bind the active catalogue and fixture roles",
  );
  assert(
    config.reviewContract?.allowReviewerPrivateCases === false &&
      config.reviewContract?.allowArchivedCases === false,
    "reviewer-private and archived cases must be prohibited",
  );
  assert(
    config.runtimeBinding?.policy === "CAPTURE_CURRENT_AND_HOLD",
    "runtimeBinding.policy must be CAPTURE_CURRENT_AND_HOLD",
  );
  assert(
    typeof config.runtimeBinding?.snapshotMethod === "string" &&
      config.runtimeBinding.snapshotMethod.length > 0,
    "runtimeBinding.snapshotMethod is required",
  );
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
  const proposalCaseFile = resolve(config.proposalCaseFile);
  assert(
    fs.existsSync(proposalCaseFile),
    `proposal case catalogue does not exist: ${proposalCaseFile}`,
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
  for (const role of [
    config.reviewContract.caseCatalogueRole,
    config.reviewContract.fixtureSetRole,
  ]) {
    assert(
      baselineArtifacts.filter((artifact) => artifact.role === role).length ===
        1,
      `review artifact role must resolve exactly once: ${role}`,
    );
  }
  return Object.freeze({
    ...config,
    configPath: absolute,
    proposalCaseFile,
    baselineArtifacts: Object.freeze(baselineArtifacts),
    resultFile: resolve(config.resultFile),
    evidenceDirectory: resolve(config.evidenceDirectory),
  });
};
