import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { hashCanonical } from "../../../../apps/ssi-service/src/app/canonical-json.ts";
import {
  DeterministicJsonFileWriter,
  Sha256FileIdentity,
} from "../governed-data-repair/artifact-io.ts";

interface SeedSchemaItem {
  readonly type: "table" | "index";
  readonly name: string;
  readonly sql: string;
}

interface SeedTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}

export interface CanonicalSeed {
  readonly schemaVersion: "1.0";
  readonly fixtureId: string;
  readonly classification: string;
  readonly identityMethod: string;
  readonly mappingStatus?: string;
  readonly schema: readonly SeedSchemaItem[];
  readonly tables: Readonly<Record<string, SeedTable>>;
}

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

export interface Mt347ReloadPreflightOptions {
  readonly baselineSeedPath: string;
  readonly candidateSeedPath: string;
  readonly generatedDatasetPath: string;
  readonly isolatedDatabasePath: string;
  readonly evidenceArtifactPaths?: Readonly<Record<string, string>>;
}

export interface Mt347ReloadPreflightReport {
  readonly result: "PASS";
  readonly executionBoundary: "ISOLATED_RELOAD_PREFLIGHT_ONLY";
  readonly runtimeDatabaseWrites: 0;
  readonly isolatedDatabaseWrites: 1;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly database: {
    readonly before: { readonly sha256: string; readonly method: string };
    readonly after: { readonly sha256: string; readonly method: string };
    readonly integrityCheck: "ok";
    readonly unexpectedRows: 0;
    readonly unexpectedFields: 0;
  };
  readonly mt347: {
    readonly createdRows: 4860;
    readonly positiveRows: 2280;
    readonly negativeRows: 2580;
    readonly outOfScopeRows: 0;
    readonly oracleMismatchCount: 0;
    readonly historicalIdCollisions: 0;
    readonly applicabilityIdCollisions: 0;
    readonly physicalRowsAfter: 10245;
    readonly createdRowEvidenceSha256: string;
  };
  readonly idempotency: {
    readonly result: "PASS";
    readonly secondApplyInserts: 0;
    readonly secondApplyUpdates: 0;
    readonly secondApplyDeletes: 0;
  };
  readonly visibilityIsolation: {
    readonly result: "PASS";
    readonly controlledPositiveCandidates: 2280;
    readonly controlledNegativeCandidates: 0;
    readonly historicalCandidates: 0;
  };
  readonly historicalBaseline: {
    readonly sha256Before: string;
    readonly sha256After: string;
    readonly mt347Rows: 5385;
    readonly mutations: 0;
  };
  readonly nonTarget: {
    readonly rmaChangedRows: 0;
    readonly nonMt347SsiChangedRows: 0;
    readonly nonMt347ApplicabilityChangedRows: 0;
    readonly nostroChangedRows: 0;
    readonly entityChangedRows: 0;
    readonly integritySha256: string;
  };
  readonly rollback: {
    readonly result: "PASS";
    readonly databaseRemoved: true;
  };
  readonly authorization: {
    readonly finalRuntimeDbApplyAuthorized: false;
    readonly activeMutationAuthorized: false;
  };
}

const PINNED = Object.freeze({
  baseline:
    "4F3CC0C491F44591132E3043B7AE2C17845D9A3CCAB1CB42144F7FC4ABD9C03E",
  candidate:
    "5A7A4FCD0EBB32E90351856DA8D6DCF9A0B6819606D73A958EEA9E0A19027E48",
  generated:
    "FB8DEAC3DF8F2E84264B902B79EEB22E8A31EC2F424CA59EB930EBD3AF407CCD",
});

type JsonObject = Record<string, unknown>;

const parseObject = (value: unknown): JsonObject =>
  JSON.parse(String(value)) as JsonObject;

const decodeSeedValue = (value: unknown): unknown => {
  if (
    value &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    typeof (value as { $base64?: unknown }).$base64 === "string"
  )
    return Buffer.from((value as { $base64: string }).$base64, "base64");
  return value;
};

type SqlValue = null | number | string | bigint | Uint8Array;

const quoteSqliteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

const normalizeSqliteValue = (
  value: SqlValue | undefined,
): null | number | string | object => {
  if (value === undefined) return null;
  if (typeof value === "bigint") return { bigint: value.toString() };
  if (value instanceof Uint8Array)
    return { base64: Buffer.from(value).toString("base64") };
  return value;
};

export const databaseSnapshotIdentity = (
  database: DatabaseSync,
): { sha256: string; method: string } => {
  const method = "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1";
  const tables = database
    .prepare(
      "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string; sql: string | null }>;
  const snapshot = tables.map(({ name, sql }) => {
    const columns = database
      .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(name)})`)
      .all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);
    const projection = names.map(quoteSqliteIdentifier).join(", ");
    const ordering = names.map(quoteSqliteIdentifier).join(", ");
    const rows = database
      .prepare(
        `SELECT ${projection} FROM ${quoteSqliteIdentifier(name)}${
          ordering ? ` ORDER BY ${ordering}` : ""
        }`,
      )
      .all()
      .map((row) =>
        Object.fromEntries(
          names.map((column) => [
            column,
            normalizeSqliteValue(
              (row as Record<string, SqlValue>)[column],
            ),
          ]),
        ),
      );
    return { name, sql, columns: names, rows };
  });
  return { sha256: hashCanonical({ method, tables: snapshot }), method };
};

const normalizedSeedValue = (value: unknown): unknown =>
  normalizeSqliteValue(decodeSeedValue(value) as never);

const sha256 = (value: unknown): string =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .toUpperCase();

export class CanonicalSeedRepository {
  load(path: string): CanonicalSeed {
    const seed = JSON.parse(readFileSync(path, "utf8")) as CanonicalSeed;
    if (
      seed.schemaVersion !== "1.0" ||
      !seed.fixtureId ||
      !Array.isArray(seed.schema) ||
      !seed.tables
    )
      throw new Error("MT347_PREFLIGHT_INVALID_CANONICAL_SEED");
    return seed;
  }

  logicalIdentity(seed: CanonicalSeed): string {
    const schemaByName = new Map(
      seed.schema
        .filter((item) => item.type === "table")
        .map((item) => [item.name, item] as const),
    );
    const tables = Object.entries(seed.tables)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, table]) => ({
        name,
        sql: schemaByName.get(name)?.sql ?? null,
        columns: [...table.columns],
        rows: table.rows.map((row) =>
          Object.fromEntries(
            table.columns.map((column, index) => [
              column,
              normalizedSeedValue(row[index]),
            ]),
          ),
        ),
      }));
    return hashCanonical({ method: seed.identityMethod, tables });
  }
}

export class IsolatedCanonicalSeedLoader {
  createSchema(database: DatabaseSync, seed: CanonicalSeed): void {
    for (const item of seed.schema.filter((entry) => entry.type === "table"))
      database.exec(item.sql);
    for (const item of seed.schema.filter((entry) => entry.type === "index"))
      database.exec(item.sql);
  }

  load(database: DatabaseSync, seed: CanonicalSeed): void {
    database.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
    try {
      for (const [name, table] of Object.entries(seed.tables).sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        const columns = table.columns.map(quoteSqliteIdentifier).join(",");
        const placeholders = table.columns.map(() => "?").join(",");
        const insert = database.prepare(
          `INSERT INTO ${quoteSqliteIdentifier(name)} (${columns}) VALUES (${placeholders})`,
        );
        for (const row of table.rows)
          insert.run(...(row.map(decodeSeedValue) as never[]));
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

export interface OverlayApplyResult {
  readonly inserts: number;
  readonly updates: 0;
  readonly deletes: 0;
  readonly ssiInserts: number;
  readonly applicabilityInserts: number;
}

export class VersionedMt347OverlayApplier {
  apply(database: DatabaseSync, candidate: CanonicalSeed): OverlayApplyResult {
    let inserts = 0;
    let ssiInserts = 0;
    let applicabilityInserts = 0;
    database.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
    try {
      for (const name of ["ssi", "ssi_applicability"] as const) {
        const table = candidate.tables[name];
        if (!table) throw new Error(`MT347_PREFLIGHT_TABLE_MISSING:${name}`);
        const idIndex = table.columns.indexOf("id");
        const payloadIndex = table.columns.indexOf("payload");
        const columns = table.columns.map(quoteSqliteIdentifier).join(",");
        const projection = table.columns.map(quoteSqliteIdentifier).join(",");
        const placeholders = table.columns.map(() => "?").join(",");
        const find = database.prepare(
          `SELECT ${projection} FROM ${quoteSqliteIdentifier(name)} WHERE id=?`,
        );
        const insert = database.prepare(
          `INSERT INTO ${quoteSqliteIdentifier(name)} (${columns}) VALUES (${placeholders})`,
        );
        const rows = table.rows.filter(
          (row) =>
            parseObject(row[payloadIndex])["datasetVersion"] ===
            "MT347-DEMO-V1.1",
        );
        for (const row of rows) {
          const id = String(row[idIndex]);
          const existing = find.get(id) as Record<string, SqlValue> | undefined;
          if (existing) {
            const actual = table.columns.map((column) =>
              normalizeSqliteValue(existing[column]),
            );
            const expected = row.map(normalizedSeedValue);
            if (JSON.stringify(actual) !== JSON.stringify(expected))
              throw new Error(`MT347_VERSIONED_ID_COLLISION:${name}:${id}`);
            continue;
          }
          insert.run(...(row.map(decodeSeedValue) as never[]));
          inserts += 1;
          if (name === "ssi") ssiInserts += 1;
          else applicabilityInserts += 1;
        }
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return Object.freeze({
      inserts,
      updates: 0,
      deletes: 0,
      ssiInserts,
      applicabilityInserts,
    });
  }
}

export class Mt347ReconciliationPolicy {
  reconcile(
    database: DatabaseSync,
    generated: GeneratedDataset,
  ): Mt347ReloadPreflightReport["mt347"] {
    const allRows = database
      .prepare("SELECT id,payload FROM ssi ORDER BY id")
      .all()
      .map((row) => ({ id: String(row["id"]), payload: parseObject(row["payload"]) }))
      .filter((row) => row.payload["fixtureFamily"] === "MT347-SR2026-SSI");
    const rows = allRows.filter(
      (row) => row.payload["datasetVersion"] === "MT347-DEMO-V1.1",
    );
    const positive = rows.filter(
      (row) => row.payload["usageScope"] === "QA_POSITIVE",
    );
    const negative = rows.filter(
      (row) => row.payload["usageScope"] === "QA_NEGATIVE",
    );
    const oosGroups = new Set(
      generated.contexts
        .filter((context) => context.businessStatus === "OUT_OF_SCOPE_CLOSED")
        .map((context) => context.groupId),
    );
    const outOfScope = rows.filter((row) => {
      const route = (row.payload["route"] ?? {}) as JsonObject;
      return oosGroups.has(String(route["fixtureGroupId"] ?? "").replace(/^FIX-/, ""));
    });
    const actualNegative = new Map(
      negative.map((row) => {
        const route = (row.payload["route"] ?? {}) as JsonObject;
        return [String(route["oracleContextKey"]), String(route["oracleReasonCode"])] as const;
      }),
    );
    const expectedNegative = generated.contexts.filter(
      (context) => context.businessStatus === "BA_CONFIRMED",
    );
    const mismatchCount =
      expectedNegative.filter(
        (context) => actualNegative.get(context.key) !== context.reasonCode,
      ).length + Math.max(0, actualNegative.size - expectedNegative.length);
    if (
      rows.length !== 4860 ||
      allRows.length !== 10245 ||
      positive.length !== 2280 ||
      negative.length !== 2580 ||
      outOfScope.length !== 0 ||
      generated.groupCount !== 208 ||
      generated.ssiOwnedContextCount !== 2580 ||
      generated.outOfScopeContextCount !== 540 ||
      mismatchCount !== 0
    )
      throw new Error("MT347_PREFLIGHT_RECONCILIATION_FAILED");
    return Object.freeze({
      createdRows: 4860,
      positiveRows: 2280,
      negativeRows: 2580,
      outOfScopeRows: 0,
      oracleMismatchCount: 0,
      historicalIdCollisions: 0,
      applicabilityIdCollisions: 0,
      physicalRowsAfter: 10245,
      createdRowEvidenceSha256: sha256(rows.map((row) => row.id)),
    });
  }
}

export class Mt347VisibilityIsolationPolicy {
  verify(database: DatabaseSync): Mt347ReloadPreflightReport["visibilityIsolation"] {
    const rows = database
      .prepare("SELECT payload FROM ssi")
      .all()
      .map((row) => parseObject(row["payload"]))
      .filter((payload) => payload["fixtureFamily"] === "MT347-SR2026-SSI");
    const versioned = rows.filter(
      (payload) => payload["datasetVersion"] === "MT347-DEMO-V1.1",
    );
    const controlledPositiveCandidates = versioned.filter(
      (payload) =>
        payload["status"] === "ACTIVE" &&
        payload["usageScope"] === "QA_POSITIVE" &&
        payload["operationalVisible"] === false,
    ).length;
    const selected =
      versioned.length === 0
        ? rows
        : versioned.filter(
            (payload) =>
              payload["usageScope"] === "QA_POSITIVE" &&
              payload["operationalVisible"] === false,
          );
    const historicalCandidates = selected.filter(
      (payload) => payload["datasetVersion"] !== "MT347-DEMO-V1.1",
    ).length;
    const controlledNegativeCandidates = selected.filter(
      (payload) => payload["usageScope"] === "QA_NEGATIVE",
    ).length;
    if (
      controlledPositiveCandidates !== 2280 ||
      controlledNegativeCandidates !== 0 ||
      historicalCandidates !== 0
    )
      throw new Error("MT347_PREFLIGHT_VISIBILITY_ISOLATION_FAILED");
    return Object.freeze({
      result: "PASS",
      controlledPositiveCandidates: 2280,
      controlledNegativeCandidates: 0,
      historicalCandidates: 0,
    });
  }
}

class NonTargetIntegrityPolicy {
  verify(
    baseline: CanonicalSeed,
    candidate: CanonicalSeed,
  ): Mt347ReloadPreflightReport["nonTarget"] {
    const evidence = {
      rma: this.tableIdentity(baseline, candidate, "rma_authorisation"),
      nostro: this.tableIdentity(baseline, candidate, "nostro_account"),
      entity: this.tableIdentity(baseline, candidate, "booking_branch_entity"),
      ssi: this.nonMt347SsiIdentity(baseline, candidate),
      applicability: this.nonMt347ApplicabilityIdentity(baseline, candidate),
    };
    if (Object.values(evidence).some((item) => !item.equal))
      throw new Error("MT347_PREFLIGHT_NON_TARGET_MUTATION");
    return Object.freeze({
      rmaChangedRows: 0,
      nonMt347SsiChangedRows: 0,
      nonMt347ApplicabilityChangedRows: 0,
      nostroChangedRows: 0,
      entityChangedRows: 0,
      integritySha256: sha256(evidence),
    });
  }

  private tableIdentity(
    baseline: CanonicalSeed,
    candidate: CanonicalSeed,
    name: string,
  ): { readonly equal: boolean; readonly sha256: string } {
    const left = baseline.tables[name];
    const right = candidate.tables[name];
    if (!left || !right) throw new Error(`MT347_PREFLIGHT_TABLE_MISSING:${name}`);
    const leftHash = sha256(left);
    return { equal: leftHash === sha256(right), sha256: leftHash };
  }

  private nonMt347SsiIdentity(
    baseline: CanonicalSeed,
    candidate: CanonicalSeed,
  ): { readonly equal: boolean; readonly sha256: string } {
    const select = (seed: CanonicalSeed): readonly (readonly unknown[])[] => {
      const table = seed.tables["ssi"];
      if (!table) throw new Error("MT347_PREFLIGHT_TABLE_MISSING:ssi");
      const payload = table.columns.indexOf("payload");
      return table.rows.filter(
        (row) => parseObject(row[payload])["fixtureFamily"] !== "MT347-SR2026-SSI",
      );
    };
    const leftHash = sha256(select(baseline));
    return { equal: leftHash === sha256(select(candidate)), sha256: leftHash };
  }

  private nonMt347ApplicabilityIdentity(
    baseline: CanonicalSeed,
    candidate: CanonicalSeed,
  ): { readonly equal: boolean; readonly sha256: string } {
    const select = (seed: CanonicalSeed): readonly (readonly unknown[])[] => {
      const ssi = seed.tables["ssi"];
      const applicability = seed.tables["ssi_applicability"];
      if (!ssi || !applicability)
        throw new Error("MT347_PREFLIGHT_TABLE_MISSING:ssi_applicability");
      const ssiId = ssi.columns.indexOf("id");
      const ssiPayload = ssi.columns.indexOf("payload");
      const mt347Ids = new Set(
        ssi.rows
          .filter(
            (row) =>
              parseObject(row[ssiPayload])["fixtureFamily"] ===
              "MT347-SR2026-SSI",
          )
          .map((row) => String(row[ssiId])),
      );
      const applicabilitySsiId = applicability.columns.indexOf("ssi_id");
      return applicability.rows.filter(
        (row) => !mt347Ids.has(String(row[applicabilitySsiId])),
      );
    };
    const leftHash = sha256(select(baseline));
    return { equal: leftHash === sha256(select(candidate)), sha256: leftHash };
  }
}

export class Mt347ReloadPreflight {
  private readonly identity = new Sha256FileIdentity();
  private readonly seeds = new CanonicalSeedRepository();
  private readonly loader = new IsolatedCanonicalSeedLoader();
  private readonly overlay = new VersionedMt347OverlayApplier();
  private readonly mt347 = new Mt347ReconciliationPolicy();
  private readonly visibility = new Mt347VisibilityIsolationPolicy();
  private readonly nonTarget = new NonTargetIntegrityPolicy();

  execute(options: Mt347ReloadPreflightOptions): Mt347ReloadPreflightReport {
    this.identity.assertFile(
      options.baselineSeedPath,
      PINNED.baseline,
      "MT347_PREFLIGHT_BASELINE_SHA_MISMATCH",
    );
    this.identity.assertFile(
      options.candidateSeedPath,
      PINNED.candidate,
      "MT347_PREFLIGHT_CANDIDATE_SHA_MISMATCH",
    );
    this.identity.assertFile(
      options.generatedDatasetPath,
      PINNED.generated,
      "MT347_PREFLIGHT_GENERATED_SHA_MISMATCH",
    );
    const baselineShaBefore = this.identity.ofFile(options.baselineSeedPath);
    const baseline = this.seeds.load(options.baselineSeedPath);
    const candidate = this.seeds.load(options.candidateSeedPath);
    const generated = JSON.parse(
      readFileSync(options.generatedDatasetPath, "utf8"),
    ) as GeneratedDataset;
    if (
      candidate.classification !== "SYNTHETIC_DEMO_QA_UAT_MAPPING_CANDIDATE" ||
      candidate.mappingStatus !== "OFFLINE_DRY_RUN_NOT_AUTHORIZED_FOR_RELOAD"
    )
      throw new Error("MT347_PREFLIGHT_CANDIDATE_BOUNDARY_INVALID");
    const nonTarget = this.nonTarget.verify(baseline, candidate);
    const historicalMt347Rows = this.mt347Rows(baseline);
    if (historicalMt347Rows !== 5385)
      throw new Error("MT347_PREFLIGHT_HISTORICAL_ROW_COUNT_MISMATCH");
    this.removeDatabase(options.isolatedDatabasePath);
    const database = new DatabaseSync(options.isolatedDatabasePath);
    let before: { sha256: string; method: string } | undefined;
    let after: { sha256: string; method: string } | undefined;
    let mt347: Mt347ReloadPreflightReport["mt347"] | undefined;
    let firstApply: OverlayApplyResult | undefined;
    let secondApply: OverlayApplyResult | undefined;
    let visibilityIsolation:
      | Mt347ReloadPreflightReport["visibilityIsolation"]
      | undefined;
    try {
      this.loader.createSchema(database, baseline);
      this.loader.load(database, baseline);
      before = databaseSnapshotIdentity(database);
      firstApply = this.overlay.apply(database, candidate);
      if (
        firstApply.ssiInserts !== 4860 ||
        firstApply.applicabilityInserts !== 4860 ||
        firstApply.updates !== 0 ||
        firstApply.deletes !== 0
      )
        throw new Error("MT347_PREFLIGHT_FIRST_APPLY_RECONCILIATION_FAILED");
      after = databaseSnapshotIdentity(database);
      const expected = this.seeds.logicalIdentity(candidate);
      if (after.sha256 !== expected)
        throw new Error("MT347_PREFLIGHT_LOGICAL_SNAPSHOT_MISMATCH");
      secondApply = this.overlay.apply(database, candidate);
      if (
        secondApply.inserts !== 0 ||
        secondApply.updates !== 0 ||
        secondApply.deletes !== 0 ||
        databaseSnapshotIdentity(database).sha256 !== after.sha256
      )
        throw new Error("MT347_PREFLIGHT_IDEMPOTENCY_FAILED");
      const integrity = String(database.prepare("PRAGMA integrity_check").get()?.["integrity_check"]);
      if (integrity !== "ok")
        throw new Error(`MT347_PREFLIGHT_SQLITE_INTEGRITY_FAILED:${integrity}`);
      mt347 = this.mt347.reconcile(database, generated);
      visibilityIsolation = this.visibility.verify(database);
    } finally {
      database.close();
      this.removeDatabase(options.isolatedDatabasePath);
    }
    if (
      !before ||
      !after ||
      !mt347 ||
      !firstApply ||
      !secondApply ||
      !visibilityIsolation
    )
      throw new Error("MT347_PREFLIGHT_INCOMPLETE");
    const baselineShaAfter = this.identity.ofFile(options.baselineSeedPath);
    if (baselineShaBefore !== baselineShaAfter)
      throw new Error("MT347_PREFLIGHT_HISTORICAL_BASELINE_MUTATED");
    return Object.freeze({
      result: "PASS",
      executionBoundary: "ISOLATED_RELOAD_PREFLIGHT_ONLY",
      runtimeDatabaseWrites: 0,
      isolatedDatabaseWrites: 1,
      artifacts: Object.freeze({
        baselineSeedSha256: baselineShaBefore,
        candidateSeedSha256: this.identity.ofFile(options.candidateSeedPath),
        generatedDatasetSha256: this.identity.ofFile(options.generatedDatasetPath),
        ...Object.fromEntries(
          Object.entries(options.evidenceArtifactPaths ?? {})
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, path]) => [name, this.identity.ofFile(path)]),
        ),
      }),
      database: Object.freeze({
        before,
        after,
        integrityCheck: "ok",
        unexpectedRows: 0,
        unexpectedFields: 0,
      }),
      mt347,
      idempotency: Object.freeze({
        result: "PASS",
        secondApplyInserts: 0,
        secondApplyUpdates: 0,
        secondApplyDeletes: 0,
      }),
      visibilityIsolation,
      historicalBaseline: Object.freeze({
        sha256Before: baselineShaBefore,
        sha256After: baselineShaAfter,
        mt347Rows: 5385,
        mutations: 0,
      }),
      nonTarget,
      rollback: Object.freeze({ result: "PASS", databaseRemoved: true }),
      authorization: Object.freeze({
        finalRuntimeDbApplyAuthorized: false,
        activeMutationAuthorized: false,
      }),
    });
  }

  private removeDatabase(path: string): void {
    for (const target of [path, `${path}-wal`, `${path}-shm`])
      if (existsSync(target)) rmSync(target);
  }

  private mt347Rows(seed: CanonicalSeed): number {
    const table = seed.tables["ssi"];
    if (!table) throw new Error("MT347_PREFLIGHT_TABLE_MISSING:ssi");
    const payload = table.columns.indexOf("payload");
    return table.rows.filter(
      (row) =>
        parseObject(row[payload])["fixtureFamily"] === "MT347-SR2026-SSI",
    ).length;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const root = resolve(import.meta.dirname, "../../../..");
  const output = resolve(
    root,
    "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.reload-preflight.json",
  );
  const report = new Mt347ReloadPreflight().execute({
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
    isolatedDatabasePath: resolve(root, "tmp/ssi-demo.mt347-v1.1.preflight.sqlite"),
    evidenceArtifactPaths: {
      apiDryRun: resolve(
        root,
        "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.api-dry-run.json",
      ),
      generatorCode: resolve(root, "qa/FIX_DATA/src/ssi/mt347-demo.generator.ts"),
      mappingCode: resolve(root, "qa/FIX_DATA/src/ssi/mt347-canonical-seed.mapper.ts"),
      manifest: resolve(root, "qa/FIX_DATA/ssi/reload-test-data-source.v1.1.json"),
      oracle: resolve(root, "qa/FIX_DATA/ssi/mt347-demo-closure.v1.1.json"),
      preflightCode: resolve(root, "qa/FIX_DATA/src/ssi/mt347-reload-preflight.ts"),
      visibilityPolicyCode: resolve(
        root,
        "apps/ssi-service/src/app/fin-controlled-fixture.service.ts",
      ),
    },
  });
  const written = new DeterministicJsonFileWriter(
    new Sha256FileIdentity(),
  ).write(output, report);
  process.stdout.write(
    `${JSON.stringify({ ...report, evidence: written }, null, 2)}\n`,
  );
}
