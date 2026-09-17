import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  CanonicalSeedRepository,
  Mt347ReconciliationPolicy,
  Mt347VisibilityIsolationPolicy,
  VersionedMt347OverlayApplier,
  databaseSnapshotIdentity,
  type OverlayApplyResult,
} from "./mt347-reload-preflight.ts";
import {
  DeterministicJsonFileWriter,
  Sha256FileIdentity,
} from "../governed-data-repair/artifact-io.ts";

interface GeneratedContext {
  readonly key: string;
  readonly groupId: string;
  readonly businessStatus: "BA_CONFIRMED" | "OUT_OF_SCOPE_CLOSED";
  readonly reasonCode: string;
}

interface GeneratedDataset {
  readonly groupCount: number;
  readonly contexts: readonly GeneratedContext[];
  readonly ssiOwnedContextCount: number;
  readonly outOfScopeContextCount: number;
}

export interface Mt347RuntimeApplyOptions {
  readonly runtimeDatabasePath: string;
  readonly backupDatabasePath: string;
  readonly baselineSeedPath: string;
  readonly candidateSeedPath: string;
  readonly generatedDatasetPath: string;
  readonly evidenceArtifacts?: Readonly<Record<string, {
    readonly path: string;
    readonly sha256: string;
  }>>;
}

export interface Mt347RuntimeApplyReport {
  readonly result: "PASS";
  readonly environment: "DEVELOPMENT_RUNTIME_DB_ONLY";
  readonly artifacts: Readonly<Record<string, string>>;
  readonly database: {
    readonly path: string;
    readonly before: { readonly sha256: string; readonly method: string };
    readonly after: { readonly sha256: string; readonly method: string };
  };
  readonly backup: {
    readonly path: string;
    readonly fileSha256: string;
    readonly logicalSha256: string;
  };
  readonly firstApply: OverlayApplyResult;
  readonly secondApply: OverlayApplyResult;
  readonly mt347: {
    readonly historicalRows: 5385;
    readonly historicalMutations: 0;
    readonly versionedSsiRows: 4860;
    readonly versionedApplicabilityRows: 4860;
    readonly physicalRows: 10245;
    readonly positiveRows: 2280;
    readonly negativeRows: 2580;
    readonly outOfScopeRows: 0;
  };
  readonly visibility: {
    readonly result: "PASS";
    readonly controlledPositiveCandidates: 2280;
    readonly controlledNegativeCandidates: 0;
    readonly historicalCandidates: 0;
  };
  readonly oracleMismatch: 0;
  readonly nonTargetMutations: 0;
  readonly integrityCheck: "ok";
  readonly rollbackAvailable: true;
  readonly authorizationBoundary: {
    readonly development: true;
    readonly uat: false;
    readonly production: false;
  };
}

const PINNED = Object.freeze({
  baseline: "4F3CC0C491F44591132E3043B7AE2C17845D9A3CCAB1CB42144F7FC4ABD9C03E",
  candidate: "5A7A4FCD0EBB32E90351856DA8D6DCF9A0B6819606D73A958EEA9E0A19027E48",
  generated: "FB8DEAC3DF8F2E84264B902B79EEB22E8A31EC2F424CA59EB930EBD3AF407CCD",
});

const parsePayload = (value: unknown): Record<string, unknown> =>
  JSON.parse(String(value)) as Record<string, unknown>;

const sqliteLiteral = (value: string): string => value.replaceAll("'", "''");

export class Mt347RuntimeApply {
  private readonly identity = new Sha256FileIdentity();
  private readonly seeds = new CanonicalSeedRepository();
  private readonly overlay = new VersionedMt347OverlayApplier();
  private readonly reconciliation = new Mt347ReconciliationPolicy();
  private readonly visibility = new Mt347VisibilityIsolationPolicy();

  execute(options: Mt347RuntimeApplyOptions): Mt347RuntimeApplyReport {
    this.verifyArtifacts(options);
    if (existsSync(options.backupDatabasePath))
      throw new Error("MT347_RUNTIME_BACKUP_ALREADY_EXISTS");
    mkdirSync(dirname(options.backupDatabasePath), { recursive: true });

    const baseline = this.seeds.load(options.baselineSeedPath);
    const candidate = this.seeds.load(options.candidateSeedPath);
    const generated = JSON.parse(
      readFileSync(options.generatedDatasetPath, "utf8"),
    ) as GeneratedDataset;
    const expectedBefore = this.seeds.logicalIdentity(baseline);
    const expectedAfter = this.seeds.logicalIdentity(candidate);
    let database: DatabaseSync | undefined;
    let backupCreated = false;
    try {
      database = new DatabaseSync(options.runtimeDatabasePath);
      database.exec("PRAGMA foreign_keys=ON");
      const before = databaseSnapshotIdentity(database);
      if (before.sha256 !== expectedBefore)
        throw new Error(
          `MT347_RUNTIME_BEFORE_SNAPSHOT_MISMATCH:expected=${expectedBefore}:actual=${before.sha256}`,
        );
      database.exec(
        `VACUUM INTO '${sqliteLiteral(resolve(options.backupDatabasePath))}'`,
      );
      backupCreated = true;
      const backup = new DatabaseSync(options.backupDatabasePath, { readOnly: true });
      const backupLogical = databaseSnapshotIdentity(backup);
      backup.close();
      if (backupLogical.sha256 !== before.sha256)
        throw new Error("MT347_RUNTIME_BACKUP_SNAPSHOT_MISMATCH");

      const firstApply = this.overlay.apply(database, candidate);
      if (
        firstApply.inserts !== 9720 ||
        firstApply.ssiInserts !== 4860 ||
        firstApply.applicabilityInserts !== 4860 ||
        firstApply.updates !== 0 ||
        firstApply.deletes !== 0
      )
        throw new Error("MT347_RUNTIME_FIRST_APPLY_RECONCILIATION_FAILED");
      const after = databaseSnapshotIdentity(database);
      if (after.sha256 !== expectedAfter)
        throw new Error(
          `MT347_RUNTIME_AFTER_SNAPSHOT_MISMATCH:expected=${expectedAfter}:actual=${after.sha256}`,
        );
      const secondApply = this.overlay.apply(database, candidate);
      if (
        secondApply.inserts !== 0 ||
        secondApply.updates !== 0 ||
        secondApply.deletes !== 0 ||
        databaseSnapshotIdentity(database).sha256 !== after.sha256
      )
        throw new Error("MT347_RUNTIME_IDEMPOTENCY_FAILED");

      const reconciled = this.reconciliation.reconcile(database, generated);
      const visibility = this.visibility.verify(database);
      const versionedApplicabilityRows = this.countVersionedApplicability(database);
      if (versionedApplicabilityRows !== 4860)
        throw new Error("MT347_RUNTIME_APPLICABILITY_COUNT_MISMATCH");
      const integrityCheck = String(
        database.prepare("PRAGMA integrity_check").get()?.["integrity_check"],
      );
      if (integrityCheck !== "ok")
        throw new Error(`MT347_RUNTIME_SQLITE_INTEGRITY_FAILED:${integrityCheck}`);
      database.close();
      database = undefined;

      return Object.freeze({
        result: "PASS",
        environment: "DEVELOPMENT_RUNTIME_DB_ONLY",
        artifacts: Object.freeze({
          baselineSeedSha256: this.identity.ofFile(options.baselineSeedPath),
          candidateSeedSha256: this.identity.ofFile(options.candidateSeedPath),
          generatedDatasetSha256: this.identity.ofFile(options.generatedDatasetPath),
          ...Object.fromEntries(
            Object.entries(options.evidenceArtifacts ?? {})
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([name, artifact]) => [name, this.identity.ofFile(artifact.path)]),
          ),
        }),
        database: Object.freeze({ path: resolve(options.runtimeDatabasePath), before, after }),
        backup: Object.freeze({
          path: resolve(options.backupDatabasePath),
          fileSha256: this.identity.ofFile(options.backupDatabasePath),
          logicalSha256: backupLogical.sha256,
        }),
        firstApply,
        secondApply,
        mt347: Object.freeze({
          historicalRows: 5385,
          historicalMutations: 0,
          versionedSsiRows: 4860,
          versionedApplicabilityRows: 4860,
          physicalRows: reconciled.physicalRowsAfter,
          positiveRows: reconciled.positiveRows,
          negativeRows: reconciled.negativeRows,
          outOfScopeRows: reconciled.outOfScopeRows,
        }),
        visibility,
        oracleMismatch: 0,
        nonTargetMutations: 0,
        integrityCheck: "ok",
        rollbackAvailable: true,
        authorizationBoundary: Object.freeze({ development: true, uat: false, production: false }),
      });
    } catch (error) {
      database?.close();
      if (backupCreated) this.restoreBackup(options);
      throw error;
    }
  }

  private verifyArtifacts(options: Mt347RuntimeApplyOptions): void {
    this.identity.assertFile(options.baselineSeedPath, PINNED.baseline, "MT347_RUNTIME_BASELINE_SHA_MISMATCH");
    this.identity.assertFile(options.candidateSeedPath, PINNED.candidate, "MT347_RUNTIME_CANDIDATE_SHA_MISMATCH");
    this.identity.assertFile(options.generatedDatasetPath, PINNED.generated, "MT347_RUNTIME_GENERATED_SHA_MISMATCH");
    for (const [name, artifact] of Object.entries(options.evidenceArtifacts ?? {}))
      this.identity.assertFile(artifact.path, artifact.sha256, `MT347_RUNTIME_${name.toUpperCase()}_SHA_MISMATCH`);
  }

  private countVersionedApplicability(database: DatabaseSync): number {
    const ssiIds = new Set(
      database
        .prepare("SELECT id,payload FROM ssi")
        .all()
        .filter((row) => parsePayload(row["payload"])["datasetVersion"] === "MT347-DEMO-V1.1")
        .map((row) => String(row["id"])),
    );
    return database
      .prepare("SELECT ssi_id FROM ssi_applicability")
      .all()
      .filter((row) => ssiIds.has(String(row["ssi_id"]))).length;
  }

  private restoreBackup(options: Mt347RuntimeApplyOptions): void {
    for (const path of [options.runtimeDatabasePath, `${options.runtimeDatabasePath}-wal`, `${options.runtimeDatabasePath}-shm`])
      if (existsSync(path)) rmSync(path);
    copyFileSync(options.backupDatabasePath, options.runtimeDatabasePath);
    const restored = new DatabaseSync(options.runtimeDatabasePath, { readOnly: true });
    const restoredIdentity = databaseSnapshotIdentity(restored);
    restored.close();
    const backup = new DatabaseSync(options.backupDatabasePath, { readOnly: true });
    const backupIdentity = databaseSnapshotIdentity(backup);
    backup.close();
    if (restoredIdentity.sha256 !== backupIdentity.sha256)
      throw new Error("MT347_RUNTIME_ROLLBACK_VERIFICATION_FAILED");
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const root = resolve(import.meta.dirname, "../../../..");
  const output = resolve(
    root,
    "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-v1.1.runtime-apply.json",
  );
  const report = new Mt347RuntimeApply().execute({
    runtimeDatabasePath: resolve(root, "data/ssi-demo.sqlite"),
    backupDatabasePath: resolve(
      root,
      "qa/FIX_DATA/ssi/generated/backups/ssi-demo.pre-mt347-v1.1.20260917.sqlite",
    ),
    baselineSeedPath: resolve(
      root,
      "qa/FIX_DATA/rma/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json",
    ),
    candidateSeedPath: resolve(
      root,
      "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.mapping-candidate.canonical.seed.json",
    ),
    generatedDatasetPath: resolve(
      root,
      "qa/FIX_DATA/ssi/generated/mt347-demo-generated.v1.1.json",
    ),
    evidenceArtifacts: {
      apiDryRun: {
        path: resolve(root, "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.api-dry-run.json"),
        sha256: "CCF8F2A1335DA71B902FE977817E19A75D8A01B5EF5CFC88D11C07B0E731F543",
      },
      preflight: {
        path: resolve(root, "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.reload-preflight.json"),
        sha256: "10A0298D2B15FCE736232AFD7B9DEE9A731B90A2E382ECE5A4EA1900B79052EB",
      },
      manifest: {
        path: resolve(root, "qa/FIX_DATA/ssi/reload-test-data-source.v1.1.json"),
        sha256: "21FC689344312229D67CB589A4A56F9A83455C04E595FB4ED861761ADA269CC0",
      },
    },
  });
  const written = new DeterministicJsonFileWriter(new Sha256FileIdentity()).write(output, report);
  process.stdout.write(`${JSON.stringify({ ...report, evidence: written }, null, 2)}\n`);
}
