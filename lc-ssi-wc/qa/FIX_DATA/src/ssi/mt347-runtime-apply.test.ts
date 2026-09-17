import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  CanonicalSeedRepository,
  IsolatedCanonicalSeedLoader,
  databaseSnapshotIdentity,
} from "./mt347-reload-preflight.ts";
import { Mt347RuntimeApply } from "./mt347-runtime-apply.ts";

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

test("backs up and applies the versioned MT347 dataset idempotently", () => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-mt347-runtime-apply-"));
  const runtimeDatabasePath = join(directory, "runtime.sqlite");
  const backupDatabasePath = join(directory, "backup.sqlite");
  const seeds = new CanonicalSeedRepository();
  const baselineSeed = seeds.load(baseline);
  const database = new DatabaseSync(runtimeDatabasePath);
  new IsolatedCanonicalSeedLoader().createSchema(database, baselineSeed);
  new IsolatedCanonicalSeedLoader().load(database, baselineSeed);
  const before = databaseSnapshotIdentity(database);
  database.close();

  const report = new Mt347RuntimeApply().execute({
    runtimeDatabasePath,
    backupDatabasePath,
    baselineSeedPath: baseline,
    candidateSeedPath: candidate,
    generatedDatasetPath: generated,
  });

  assert.equal(report.result, "PASS");
  assert.equal(report.environment, "DEVELOPMENT_RUNTIME_DB_ONLY");
  assert.equal(report.database.before.sha256, before.sha256);
  assert.equal(report.backup.logicalSha256, before.sha256);
  assert.equal(existsSync(backupDatabasePath), true);
  assert.deepEqual(report.firstApply, {
    inserts: 9720,
    updates: 0,
    deletes: 0,
    ssiInserts: 4860,
    applicabilityInserts: 4860,
  });
  assert.deepEqual(report.secondApply, {
    inserts: 0,
    updates: 0,
    deletes: 0,
    ssiInserts: 0,
    applicabilityInserts: 0,
  });
  assert.equal(report.mt347.historicalRows, 5385);
  assert.equal(report.mt347.historicalMutations, 0);
  assert.equal(report.mt347.versionedSsiRows, 4860);
  assert.equal(report.mt347.versionedApplicabilityRows, 4860);
  assert.equal(report.mt347.physicalRows, 10245);
  assert.equal(report.mt347.positiveRows, 2280);
  assert.equal(report.mt347.negativeRows, 2580);
  assert.equal(report.mt347.outOfScopeRows, 0);
  assert.equal(report.visibility.historicalCandidates, 0);
  assert.equal(report.visibility.controlledPositiveCandidates, 2280);
  assert.equal(report.visibility.controlledNegativeCandidates, 0);
  assert.equal(report.nonTargetMutations, 0);
  assert.equal(report.oracleMismatch, 0);
  assert.equal(report.integrityCheck, "ok");
  assert.equal(report.rollbackAvailable, true);
});
