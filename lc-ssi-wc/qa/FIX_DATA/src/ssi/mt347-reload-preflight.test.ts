import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Sha256FileIdentity } from "../governed-data-repair/artifact-io.ts";
import { Mt347ReloadPreflight } from "./mt347-reload-preflight.ts";

const root = resolve(import.meta.dirname, "../../../..");
const baseline = resolve(
  root,
  "qa/FIX_DATA/rma/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json",
);
const candidate = resolve(
  root,
  "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.mapping-candidate.canonical.seed.json",
);
const generated = resolve(
  root,
  "qa/FIX_DATA/ssi/generated/mt347-demo-generated.v1.1.json",
);

test("reloads the controlled candidate into an isolated database and rolls it back", () => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-mt347-preflight-"));
  const database = join(directory, "isolated.sqlite");
  const baselineBefore = new Sha256FileIdentity().ofFile(baseline);

  const report = new Mt347ReloadPreflight().execute({
    baselineSeedPath: baseline,
    candidateSeedPath: candidate,
    generatedDatasetPath: generated,
    isolatedDatabasePath: database,
  });

  assert.equal(report.result, "PASS");
  assert.equal(report.executionBoundary, "ISOLATED_RELOAD_PREFLIGHT_ONLY");
  assert.equal(report.runtimeDatabaseWrites, 0);
  assert.equal(report.isolatedDatabaseWrites, 1);
  assert.equal(report.mt347.createdRows, 4860);
  assert.equal(report.mt347.positiveRows, 2280);
  assert.equal(report.mt347.negativeRows, 2580);
  assert.equal(report.mt347.outOfScopeRows, 0);
  assert.equal(report.mt347.oracleMismatchCount, 0);
  assert.equal(report.mt347.historicalIdCollisions, 0);
  assert.equal(report.mt347.applicabilityIdCollisions, 0);
  assert.equal(report.mt347.physicalRowsAfter, 10245);
  assert.equal(report.idempotency.secondApplyInserts, 0);
  assert.equal(report.idempotency.secondApplyUpdates, 0);
  assert.equal(report.idempotency.secondApplyDeletes, 0);
  assert.equal(report.visibilityIsolation.result, "PASS");
  assert.equal(report.visibilityIsolation.historicalCandidates, 0);
  assert.equal(report.historicalBaseline.mutations, 0);
  assert.equal(report.historicalBaseline.mt347Rows, 5385);
  assert.equal(report.historicalBaseline.sha256Before, baselineBefore);
  assert.equal(report.historicalBaseline.sha256After, baselineBefore);
  assert.equal(report.nonTarget.rmaChangedRows, 0);
  assert.equal(report.nonTarget.nonMt347SsiChangedRows, 0);
  assert.equal(report.nonTarget.nonMt347ApplicabilityChangedRows, 0);
  assert.equal(report.nonTarget.nostroChangedRows, 0);
  assert.equal(report.nonTarget.entityChangedRows, 0);
  assert.notEqual(report.database.before.sha256, report.database.after.sha256);
  assert.equal(report.database.unexpectedRows, 0);
  assert.equal(report.database.unexpectedFields, 0);
  assert.equal(report.rollback.result, "PASS");
  assert.equal(report.rollback.databaseRemoved, true);
  assert.equal(existsSync(database), false);
  assert.equal(new Sha256FileIdentity().ofFile(baseline), baselineBefore);
});

test("fails closed when the candidate is not the pinned controlled artifact", () => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-mt347-preflight-bad-"));
  const altered = join(directory, "candidate.json");
  const content = readFileSync(candidate, "utf8").replace(
    "OFFLINE_DRY_RUN_NOT_AUTHORIZED_FOR_RELOAD",
    "ALTERED",
  );
  writeFileSync(altered, content);

  assert.throws(
    () =>
      new Mt347ReloadPreflight().execute({
        baselineSeedPath: baseline,
        candidateSeedPath: altered,
        generatedDatasetPath: generated,
        isolatedDatabasePath: join(directory, "isolated.sqlite"),
      }),
    /MT347_PREFLIGHT_CANDIDATE_SHA_MISMATCH/,
  );
});
