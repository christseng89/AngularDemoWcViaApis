import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { hashCanonical } from "./canonical-json";
import { ResolutionCurrencyCoveragePolicy } from "./resolution-currency-policy";
import { ResolutionCurrencyCoverageDiscoveryService } from "./resolution-currency-discovery";
import { ResolutionCurrencyStore } from "./resolution-currency-store";
import { SqliteSsiRepository } from "./sqlite-ssi.repository";
import { MappingCatalogueService } from "./mapping-catalogue.service";
import { MappingResolutionPageDefinitionSource } from "./page-parameters/mapping-resolution-page-definition.source";
import { PaymentResolutionPageDefinitionSource } from "./page-parameters/payment-resolution-page-definition.source";
import {
  databaseSnapshotIdentity,
  normalizeSqliteValue,
  quoteSqliteIdentifier,
  SQLITE_SNAPSHOT_IDENTITY_METHOD,
} from "./database-snapshot-identity.service";
import {
  resolveRuntimeEnvironment,
  type RuntimeEnvironment,
} from "./runtime-environment.policy";

interface SeedSchemaItem {
  readonly type: string;
  readonly name: string;
  readonly sql: string;
}

interface SeedTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}

interface DemoSeed {
  readonly schemaVersion: string;
  readonly fixtureId: string;
  readonly classification: string;
  readonly identityMethod: string;
  readonly schema: readonly SeedSchemaItem[];
  readonly tables: Readonly<Record<string, SeedTable>>;
  readonly exportedAt?: string;
}

interface DemoReloadAuditEvent {
  readonly action: "DEVELOPMENT_DATA_RELOAD";
  readonly outcome: "SUCCESS" | "FAILURE";
  readonly actor: string;
  readonly occurredAt: string;
  readonly environment: string;
  readonly datasetId: string;
  readonly datasetSource: DemoDatasetSummary["source"];
  readonly seedSha256: string;
  readonly previousSnapshotSha256: string | null;
  readonly newSnapshotSha256: string | null;
  readonly importedRows: Readonly<Record<string, number>>;
  readonly errorCode: string | null;
}

export interface DemoDatasetSummary {
  readonly datasetId: string;
  readonly displayName: string;
  readonly version: string;
  readonly classification: string;
  readonly estimatedRows: number;
  readonly source: "DEFAULT" | "EXPORT" | "UPLOAD";
  readonly exportedAt?: string;
}

interface ExportManifest {
  readonly dataset: DemoDatasetSummary;
  readonly fileName: string;
  readonly sha256: string;
  readonly createdOrder: number;
}

interface AuthorizedDataset {
  readonly summary: DemoDatasetSummary;
  readonly path: string;
  readonly sha256: string;
  readonly temporary?: boolean;
}

export interface DemoReloadStatus {
  readonly runtimeEnvironment: string;
  readonly developmentEnabled: boolean;
  readonly reloadAvailable: boolean;
  readonly fixtureId?: string;
  readonly seedSha256?: string;
  readonly statusPolicyVersion: "SSI-CONFIG-HTTP-01";
}

export interface DemoReloadResult extends DemoReloadStatus {
  readonly code: "DEMO_DATA_RELOADED";
  readonly completedAt: string;
  readonly snapshotHash: string;
  readonly snapshotIdentityMethod: string;
  readonly importedRows: Readonly<Record<string, number>>;
}

export interface DemoReloadAuthorization {
  readonly code: "DEMO_RELOAD_AUTHORIZED";
  readonly authorizationToken: string;
  readonly expiresAt: string;
  readonly dataset: DemoDatasetSummary;
  readonly datasets: readonly DemoDatasetSummary[];
  readonly defaultDatasetId: string;
}

export interface DemoExportResult {
  readonly code: "DEMO_DATA_EXPORTED";
  readonly completedAt: string;
  readonly dataset: DemoDatasetSummary;
}

const digest = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const secureEquals = (actual: string, expected: string): boolean =>
  timingSafeEqual(
    Buffer.from(digest(actual), "hex"),
    Buffer.from(digest(expected), "hex"),
  );

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

const normalizedSeedValue = (value: unknown): unknown =>
  normalizeSqliteValue(decodeSeedValue(value) as never);

const encodedSeedValue = (value: unknown): unknown => {
  if (value instanceof Uint8Array)
    return { $base64: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") return value.toString();
  return value;
};

const parseSeed = (raw: string): DemoSeed => {
  const seed = JSON.parse(raw) as Partial<DemoSeed>;
  if (
    seed.schemaVersion !== "1.0" ||
    seed.classification !== "SYNTHETIC_DEMO_QA_UAT" ||
    seed.identityMethod !== SQLITE_SNAPSHOT_IDENTITY_METHOD ||
    !seed.fixtureId ||
    !Array.isArray(seed.schema) ||
    !seed.tables
  )
    throw new Error("canonical seed metadata is invalid");
  return seed as DemoSeed;
};

const seedIdentity = (seed: DemoSeed): string => {
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
};

const failure = (status: number, code: string): never => {
  throw new HttpException(
    { code, retryable: false, payloadGenerated: false },
    status,
  );
};

@Injectable()
export class DevelopmentDataReloadService {
  private static readonly DEFAULT_DATASET_ID = "DEFAULT-COMPLIANT";
  private static readonly EXPORT_RETENTION = 10;
  private reloading = false;
  private exportSequence = 0;
  private readonly authorizations = new Map<
    string,
    {
      expiresAt: number;
      defaultDatasetId: string;
      datasets: Map<string, AuthorizedDataset>;
    }
  >();

  constructor(
    @Optional()
    @Inject("SSI_RUNTIME_ENVIRONMENT")
    private readonly environment: RuntimeEnvironment = process.env,
  ) {}

  status(): DemoReloadStatus {
    const runtime = resolveRuntimeEnvironment(this.environment);
    const password = this.environment["SSI_DEMO_ADMIN_PASSWORD"]?.trim();
    return {
      ...runtime,
      reloadAvailable: runtime.developmentEnabled && Boolean(password),
      statusPolicyVersion: "SSI-CONFIG-HTTP-01",
    };
  }

  authorize(password: string): DemoReloadAuthorization {
    const status = this.status();
    if (!status.developmentEnabled) failure(403, "DEVELOPMENT_MODE_REQUIRED");
    const expected = this.environment["SSI_DEMO_ADMIN_PASSWORD"]?.trim();
    if (!expected) failure(503, "DEMO_RELOAD_NOT_CONFIGURED");
    if (!password || !secureEquals(password, expected ?? ""))
      failure(401, "INVALID_DEMO_CONTROL_PASSWORD");
    try {
      this.purgeExpiredAuthorizations();
      const datasets = this.availableDatasets();
      const defaultDataset =
        datasets[0] ?? failure(500, "DEMO_RELOAD_DATASET_UNAVAILABLE");
      const authorizationToken = randomBytes(32).toString("hex");
      const expiresAt =
        Date.now() +
        1000 *
          Number(this.environment["SSI_DEMO_RELOAD_AUTH_TTL_SECONDS"] ?? "300");
      this.authorizations.set(digest(authorizationToken), {
        expiresAt,
        defaultDatasetId: defaultDataset.summary.datasetId,
        datasets: new Map(
          datasets.map((dataset) => [dataset.summary.datasetId, dataset]),
        ),
      });
      return {
        code: "DEMO_RELOAD_AUTHORIZED",
        authorizationToken,
        expiresAt: new Date(expiresAt).toISOString(),
        dataset: defaultDataset.summary,
        datasets: datasets.map(({ summary }) => summary),
        defaultDatasetId: defaultDataset.summary.datasetId,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return failure(500, "DEMO_RELOAD_DATASET_UNAVAILABLE");
    }
  }

  cancelAuthorization(authorizationToken: string): {
    code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED";
  } {
    const authorizationKey = digest(authorizationToken);
    const authorization = this.authorizations.get(authorizationKey);
    if (authorization) this.cleanupAuthorization(authorization);
    this.authorizations.delete(authorizationKey);
    return { code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED" };
  }

  uploadDataset(
    authorizationToken: string,
    file: { readonly originalName: string; readonly buffer: Buffer },
  ): DemoDatasetSummary {
    const authorizationKey = digest(authorizationToken);
    const authorization = this.authorizations.get(authorizationKey);
    if (!authorization || authorization.expiresAt <= Date.now()) {
      if (authorization) this.cleanupAuthorization(authorization);
      this.authorizations.delete(authorizationKey);
      return failure(401, "INVALID_DEMO_RELOAD_AUTHORIZATION");
    }
    if (
      !file.originalName.toLowerCase().endsWith(".json") ||
      file.buffer.length === 0 ||
      file.buffer.length > 80 * 1024 * 1024
    )
      return failure(422, "DEMO_RELOAD_FILE_INVALID");
    let seed: DemoSeed;
    try {
      seed = parseSeed(file.buffer.toString("utf8"));
    } catch {
      return failure(422, "DEMO_RELOAD_FILE_INVALID");
    }
    const activeDatabase = new DatabaseSync(this.databasePath(), {
      readOnly: true,
    });
    try {
      this.assertAuthorizedSchema(
        seed,
        this.schemaFromDatabase(activeDatabase),
      );
      this.validateSchema(activeDatabase, seed);
    } catch {
      return failure(422, "DEMO_RELOAD_SCHEMA_NOT_AUTHORIZED");
    } finally {
      activeDatabase.close();
    }
    for (const [datasetId, dataset] of authorization.datasets)
      if (dataset.temporary) {
        rmSync(dataset.path, { force: true });
        authorization.datasets.delete(datasetId);
      }
    const sha256 = digest(file.buffer);
    const datasetId = `UPLOAD-${sha256.slice(0, 24).toUpperCase()}`;
    const uploadDirectory = resolve("./tmp/demo-reload/uploads");
    const uploadPath = join(uploadDirectory, `${datasetId}.seed.json`);
    mkdirSync(uploadDirectory, { recursive: true });
    writeFileSync(uploadPath, file.buffer);
    const summary = this.datasetSummary(
      seed,
      datasetId,
      "UPLOAD",
      basename(file.originalName),
    );
    authorization.datasets.set(datasetId, {
      summary,
      path: uploadPath,
      sha256,
      temporary: true,
    });
    return summary;
  }

  async reload(
    authorizationToken: string,
    datasetId?: string,
  ): Promise<DemoReloadResult> {
    const status = this.status();
    if (!status.developmentEnabled) failure(403, "DEVELOPMENT_MODE_REQUIRED");
    const authorizationKey = digest(authorizationToken);
    const authorization = this.authorizations.get(authorizationKey);
    this.authorizations.delete(authorizationKey);
    const authorized =
      authorization ?? failure(401, "INVALID_DEMO_RELOAD_AUTHORIZATION");
    if (authorized.expiresAt <= Date.now()) {
      this.cleanupAuthorization(authorized);
      failure(401, "INVALID_DEMO_RELOAD_AUTHORIZATION");
    }
    if (this.reloading) failure(409, "DEMO_RELOAD_IN_PROGRESS");
    const selectedDataset = authorized.datasets.get(
      datasetId || authorized.defaultDatasetId,
    );
    if (!selectedDataset) {
      this.cleanupAuthorization(authorized);
      return failure(422, "DEMO_RELOAD_DATASET_NOT_AUTHORIZED");
    }

    this.reloading = true;
    const activePath = this.databasePath();
    const backupPath = this.backupPath();
    const shadowPath = this.shadowPath();
    mkdirSync(dirname(backupPath), { recursive: true });
    mkdirSync(dirname(shadowPath), { recursive: true });
    rmSync(shadowPath, { force: true });
    let backupCreated = false;
    let previousSnapshotSha256: string | null = null;
    let importedRows: Readonly<Record<string, number>> = {};
    try {
      const activeDatabase = new DatabaseSync(activePath);
      let controlledSchema: readonly SeedSchemaItem[];
      try {
        previousSnapshotSha256 =
          databaseSnapshotIdentity(activeDatabase).sha256;
        controlledSchema = this.schemaFromDatabase(activeDatabase);
        await backup(activeDatabase, backupPath);
        backupCreated = true;
      } finally {
        activeDatabase.close();
      }
      const raw = readFileSync(selectedDataset.path);
      if (digest(raw) !== selectedDataset.sha256)
        failure(409, "DEMO_RELOAD_DATASET_CHANGED");
      const seed = parseSeed(raw.toString("utf8"));
      this.assertAuthorizedSchema(seed, controlledSchema);
      const shadowDatabase = new DatabaseSync(shadowPath);
      let identity: ReturnType<typeof databaseSnapshotIdentity>;
      try {
        identity = this.populateShadowDatabase(
          shadowDatabase,
          seed,
          controlledSchema,
        );
      } finally {
        shadowDatabase.close();
      }
      const validatedShadow = new DatabaseSync(shadowPath, { readOnly: true });
      try {
        await backup(validatedShadow, activePath);
      } finally {
        validatedShadow.close();
      }
      const activatedDatabase = new DatabaseSync(activePath, {
        readOnly: true,
      });
      try {
        if (
          databaseSnapshotIdentity(activatedDatabase).sha256 !== identity.sha256
        )
          throw new Error("activated database snapshot mismatch");
      } finally {
        activatedDatabase.close();
      }
      importedRows = Object.fromEntries(
        Object.entries(seed.tables).map(([name, table]) => [
          name,
          table.rows.length,
        ]),
      );
      const result: DemoReloadResult = {
        ...this.status(),
        fixtureId: seed.fixtureId,
        seedSha256: digest(raw),
        code: "DEMO_DATA_RELOADED",
        completedAt: new Date().toISOString(),
        snapshotHash: identity.sha256,
        snapshotIdentityMethod: identity.method,
        importedRows,
      };
      this.appendReloadAudit({
        action: "DEVELOPMENT_DATA_RELOAD",
        outcome: "SUCCESS",
        actor: this.reloadActor(),
        occurredAt: result.completedAt,
        environment: status.runtimeEnvironment,
        datasetId: selectedDataset.summary.datasetId,
        datasetSource: selectedDataset.summary.source,
        seedSha256: selectedDataset.sha256,
        previousSnapshotSha256,
        newSnapshotSha256: identity.sha256,
        importedRows,
        errorCode: null,
      });
      return result;
    } catch (error) {
      const terminalError = await this.restoreAfterReloadFailure(
        error,
        backupCreated,
        backupPath,
        activePath,
      );
      const errorCode =
        terminalError instanceof HttpException
          ? String((terminalError.getResponse() as { code?: unknown }).code)
          : "DEMO_DATA_RELOAD_FAILED";
      this.appendReloadAudit({
        action: "DEVELOPMENT_DATA_RELOAD",
        outcome: "FAILURE",
        actor: this.reloadActor(),
        occurredAt: new Date().toISOString(),
        environment: status.runtimeEnvironment,
        datasetId: selectedDataset.summary.datasetId,
        datasetSource: selectedDataset.summary.source,
        seedSha256: selectedDataset.sha256,
        previousSnapshotSha256,
        newSnapshotSha256: null,
        importedRows,
        errorCode,
      });
      if (terminalError instanceof HttpException) throw terminalError;
      return failure(500, "DEMO_DATA_RELOAD_FAILED");
    } finally {
      rmSync(shadowPath, { force: true });
      this.cleanupAuthorization(authorized);
      this.reloading = false;
    }
  }

  exportCurrentDatabase(): DemoExportResult {
    const status = this.status();
    if (!status.developmentEnabled) failure(403, "DEVELOPMENT_MODE_REQUIRED");
    const completedAt = new Date().toISOString();
    const datasetId = `EXPORT-${completedAt.replaceAll(/[-:.TZ]/g, "")}-${randomBytes(3).toString("hex")}`;
    const fileName = `${datasetId.toLowerCase()}.seed.json`;
    const exportDirectory = this.exportPath();
    const outputPath = join(exportDirectory, fileName);
    const partialPath = `${outputPath}.partial`;
    mkdirSync(exportDirectory, { recursive: true });
    const database = new DatabaseSync(this.databasePath(), { readOnly: true });
    let seed: DemoSeed;
    try {
      database.exec("BEGIN");
      seed = this.seedFromDatabase(database, datasetId, completedAt);
    } finally {
      try {
        database.exec("ROLLBACK");
      } finally {
        database.close();
      }
    }
    const raw = JSON.stringify(seed, null, 2);
    writeFileSync(partialPath, raw, "utf8");
    renameSync(partialPath, outputPath);
    const summary = this.datasetSummary(
      seed,
      datasetId,
      "EXPORT",
      basename(outputPath),
    );
    const manifest: ExportManifest = {
      dataset: summary,
      fileName,
      sha256: digest(raw),
      createdOrder: Date.now() * 1000 + (this.exportSequence++ % 1000),
    };
    writeFileSync(
      this.manifestPath(outputPath),
      JSON.stringify(manifest, null, 2),
    );
    this.pruneExports();
    return {
      code: "DEMO_DATA_EXPORTED",
      completedAt,
      dataset: summary,
    };
  }

  private availableDatasets(): AuthorizedDataset[] {
    const defaultRaw = readFileSync(this.seedPath());
    const defaultSeed = parseSeed(defaultRaw.toString("utf8"));
    const defaultDataset: AuthorizedDataset = {
      summary: this.datasetSummary(
        defaultSeed,
        DevelopmentDataReloadService.DEFAULT_DATASET_ID,
        "DEFAULT",
        "Original compliant development test data",
      ),
      path: this.seedPath(),
      sha256: digest(defaultRaw),
    };
    const exports = this.exportManifests()
      .map(({ manifest, path }) => ({
        summary: manifest.dataset,
        path,
        sha256: manifest.sha256,
        order: manifest.createdOrder,
      }))
      .sort((left, right) => right.order - left.order)
      .map(({ order: _order, ...dataset }) => dataset);
    return [...exports, defaultDataset];
  }

  private datasetSummary(
    seed: DemoSeed,
    datasetId: string,
    source: "DEFAULT" | "EXPORT" | "UPLOAD",
    displayName: string,
  ): DemoDatasetSummary {
    return {
      datasetId,
      displayName,
      version: seed.schemaVersion,
      classification: seed.classification,
      estimatedRows: Object.values(seed.tables).reduce(
        (total, table) => total + table.rows.length,
        0,
      ),
      source,
      ...(seed.exportedAt ? { exportedAt: seed.exportedAt } : {}),
    };
  }

  private seedFromDatabase(
    database: DatabaseSync,
    fixtureId: string,
    exportedAt: string,
  ): DemoSeed {
    const schema = this.schemaFromDatabase(database);
    const tables = Object.fromEntries(
      schema
        .filter(({ type }) => type === "table")
        .map(({ name }) => {
          const columns = (
            database
              .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(name)})`)
              .all() as Array<{ name: string }>
          ).map(({ name: column }) => column);
          const projection = columns.map(quoteSqliteIdentifier).join(", ");
          const rows = database
            .prepare(
              `SELECT ${projection} FROM ${quoteSqliteIdentifier(name)} ORDER BY ${projection}`,
            )
            .all()
            .map((row) =>
              columns.map((column) =>
                encodedSeedValue((row as Record<string, unknown>)[column]),
              ),
            );
          return [name, { columns, rows }] as const;
        }),
    );
    return {
      schemaVersion: "1.0",
      fixtureId,
      classification: "SYNTHETIC_DEMO_QA_UAT",
      identityMethod: SQLITE_SNAPSHOT_IDENTITY_METHOD,
      schema,
      tables,
      exportedAt,
    };
  }

  private exportManifests(): Array<{
    manifest: ExportManifest;
    path: string;
  }> {
    mkdirSync(this.exportPath(), { recursive: true });
    return readdirSync(this.exportPath())
      .filter((name) => name.endsWith(".seed.json.manifest.json"))
      .flatMap((name) => {
        try {
          const manifest = JSON.parse(
            readFileSync(join(this.exportPath(), name), "utf8"),
          ) as ExportManifest;
          const path = join(this.exportPath(), manifest.fileName);
          return manifest.dataset?.source === "EXPORT"
            ? [{ manifest, path }]
            : [];
        } catch {
          return [];
        }
      });
  }

  private cleanupAuthorization(authorization: {
    readonly datasets: Map<string, AuthorizedDataset>;
  }): void {
    for (const dataset of authorization.datasets.values())
      if (dataset.temporary) rmSync(dataset.path, { force: true });
  }

  private purgeExpiredAuthorizations(): void {
    const now = Date.now();
    for (const [key, authorization] of this.authorizations)
      if (authorization.expiresAt <= now) {
        this.cleanupAuthorization(authorization);
        this.authorizations.delete(key);
      }
  }

  private pruneExports(): void {
    const stale = this.exportManifests()
      .sort(
        (left, right) =>
          right.manifest.createdOrder - left.manifest.createdOrder,
      )
      .slice(DevelopmentDataReloadService.EXPORT_RETENTION);
    for (const { manifest, path } of stale) {
      rmSync(path, { force: true });
      rmSync(this.manifestPath(join(this.exportPath(), manifest.fileName)), {
        force: true,
      });
    }
  }

  private manifestPath(seedPath: string): string {
    return `${seedPath}.manifest.json`;
  }

  private populateShadowDatabase(
    database: DatabaseSync,
    seed: DemoSeed,
    controlledSchema: readonly SeedSchemaItem[],
  ): ReturnType<typeof databaseSnapshotIdentity> {
    for (const item of controlledSchema.filter(({ type }) => type === "table"))
      database.exec(item.sql);
    this.validateSchema(database, seed);
    database.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
    try {
      for (const name of Object.keys(seed.tables).sort((left, right) =>
        left.localeCompare(right),
      ))
        this.insertTable(database, name, seed.tables[name]!);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    for (const item of controlledSchema.filter(({ type }) => type !== "table"))
      database.exec(item.sql);
    this.assertDatabaseIntegrity(database);
    const canonicalIdentity = databaseSnapshotIdentity(
      database,
      Object.keys(seed.tables),
    );
    if (
      canonicalIdentity.sha256.toLowerCase() !==
      seedIdentity(seed).toLowerCase()
    )
      throw new Error("logical snapshot identity mismatch");
    if (seed.tables["ssi"] && seed.tables["ssi_applicability"])
      this.rebuildResolutionCurrencyCoverage(database);
    this.assertDatabaseIntegrity(database);
    return databaseSnapshotIdentity(database);
  }

  private assertDatabaseIntegrity(database: DatabaseSync): void {
    const integrity = String(
      (
        database.prepare("PRAGMA integrity_check").get() as Record<
          string,
          unknown
        >
      )["integrity_check"],
    );
    if (integrity !== "ok") throw new Error("SQLite integrity check failed");
  }

  private async restoreBackup(
    backupPath: string,
    activePath: string,
  ): Promise<void> {
    const backupDatabase = new DatabaseSync(backupPath, { readOnly: true });
    try {
      await backup(backupDatabase, activePath);
    } catch {
      return failure(500, "DEMO_DATA_RESTORE_FAILED");
    } finally {
      backupDatabase.close();
    }
  }

  private async restoreAfterReloadFailure(
    reloadError: unknown,
    backupCreated: boolean,
    backupPath: string,
    activePath: string,
  ): Promise<unknown> {
    if (!backupCreated) return reloadError;
    try {
      await this.restoreBackup(backupPath, activePath);
      return reloadError;
    } catch (restoreError) {
      return restoreError;
    }
  }

  private validateSchema(database: DatabaseSync, seed: DemoSeed): void {
    const actual = (
      database
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((item) => item.name);
    const expected = Object.keys(seed.tables).sort((left, right) =>
      left.localeCompare(right),
    );
    const controlledDerived = new Set([
      "resolution_currency_coverage",
      "resolution_currency_sync_control",
    ]);
    const nonDerived = (names: readonly string[]) =>
      names.filter((name) => !controlledDerived.has(name));
    if (
      JSON.stringify(nonDerived(actual)) !==
      JSON.stringify(nonDerived(expected))
    )
      throw new Error(
        "new database schema does not match the selected test data",
      );
    for (const name of expected) {
      const columns = (
        database
          .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(name)})`)
          .all() as Array<{ name: string }>
      ).map((item) => item.name);
      if (
        JSON.stringify(columns) !== JSON.stringify(seed.tables[name]!.columns)
      )
        throw new Error(`table schema mismatch: ${name}`);
    }
  }

  private schemaFromDatabase(database: DatabaseSync): SeedSchemaItem[] {
    return database
      .prepare(
        `SELECT type, name, sql FROM sqlite_schema
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
         ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
      )
      .all() as unknown as SeedSchemaItem[];
  }

  private assertAuthorizedSchema(
    seed: DemoSeed,
    controlledSchema: readonly SeedSchemaItem[],
  ): void {
    const identity = (items: readonly SeedSchemaItem[]) =>
      JSON.stringify(
        items
          .map(({ type, name, sql }) => ({ type, name, sql }))
          .sort((left, right) =>
            `${left.type}:${left.name}`.localeCompare(
              `${right.type}:${right.name}`,
            ),
          ),
      );
    if (identity(seed.schema) !== identity(controlledSchema))
      throw new Error("test data schema is not the active governed schema");
  }

  private appendReloadAudit(event: DemoReloadAuditEvent): void {
    const path = this.reloadAuditPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
  }

  private reloadActor(): string {
    return this.environment["SSI_DEMO_RELOAD_ACTOR"] ?? "DEMO_OPERATOR";
  }

  private rebuildResolutionCurrencyCoverage(database: DatabaseSync): void {
    ResolutionCurrencyStore.ensureSchema(database);
    database.exec(
      "DELETE FROM resolution_currency_coverage; DELETE FROM resolution_currency_sync_control;",
    );
    const repository = new SqliteSsiRepository(database);
    const policy = new ResolutionCurrencyCoveragePolicy();
    const discovery = new ResolutionCurrencyCoverageDiscoveryService(
      new MappingResolutionPageDefinitionSource(new MappingCatalogueService()),
      new PaymentResolutionPageDefinitionSource(),
      repository,
    );
    const result = discovery.discover(policy.asOfDate);
    repository.reconcileResolutionCurrenciesWithinTransaction(
      result.pairs,
      policy.asOfDate,
    );
  }

  private insertTable(
    database: DatabaseSync,
    name: string,
    table: SeedTable,
  ): void {
    const columns = table.columns.map(quoteSqliteIdentifier).join(",");
    const placeholders = table.columns.map(() => "?").join(",");
    const insert = database.prepare(
      `INSERT INTO ${quoteSqliteIdentifier(name)} (${columns}) VALUES (${placeholders})`,
    );
    for (const row of table.rows)
      insert.run(...(row.map(decodeSeedValue) as never[]));
  }

  private databasePath(): string {
    return resolve(
      this.environment["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite",
    );
  }

  private seedPath(): string {
    return resolve(
      this.environment["SSI_DEMO_SEED_PATH"] ??
        "./data/reload-test-data/ssi-demo.mt1-mt2.v1.approved.canonical.seed.json",
    );
  }

  private backupPath(): string {
    return resolve(
      this.environment["SSI_DEMO_BACKUP_PATH"] ??
        "./data/backup/active-database.pre-reload.sqlite",
    );
  }

  private shadowPath(): string {
    return resolve(
      this.environment["SSI_DEMO_SHADOW_PATH"] ??
        "./tmp/demo-reload/new-database.loading.sqlite",
    );
  }

  private exportPath(): string {
    return resolve(this.environment["SSI_DEMO_EXPORT_PATH"] ?? "./data/export");
  }

  private reloadAuditPath(): string {
    return resolve(
      this.environment["SSI_DEMO_RELOAD_AUDIT_PATH"] ??
        "./data/audit/development-data-reload.jsonl",
    );
  }
}
