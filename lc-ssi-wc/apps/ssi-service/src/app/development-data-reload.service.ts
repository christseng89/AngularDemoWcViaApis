import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  readonly dataset: {
    readonly displayName: string;
    readonly version: string;
    readonly classification: string;
    readonly estimatedRows: number;
  };
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
  private reloading = false;
  private readonly authorizations = new Map<
    string,
    { expiresAt: number; seedSha256: string }
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
      const raw = readFileSync(this.seedPath());
      const seed = parseSeed(raw.toString("utf8"));
      const authorizationToken = randomBytes(32).toString("hex");
      const expiresAt =
        Date.now() +
        1000 *
          Number(this.environment["SSI_DEMO_RELOAD_AUTH_TTL_SECONDS"] ?? "300");
      this.authorizations.set(digest(authorizationToken), {
        expiresAt,
        seedSha256: digest(raw),
      });
      return {
        code: "DEMO_RELOAD_AUTHORIZED",
        authorizationToken,
        expiresAt: new Date(expiresAt).toISOString(),
        dataset: {
          displayName: "Default compliant development test data",
          version: seed.schemaVersion,
          classification: seed.classification,
          estimatedRows: Object.values(seed.tables).reduce(
            (total, table) => total + table.rows.length,
            0,
          ),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return failure(500, "DEMO_RELOAD_DATASET_UNAVAILABLE");
    }
  }

  cancelAuthorization(authorizationToken: string): {
    code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED";
  } {
    this.authorizations.delete(digest(authorizationToken));
    return { code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED" };
  }

  async reload(authorizationToken: string): Promise<DemoReloadResult> {
    const status = this.status();
    if (!status.developmentEnabled) failure(403, "DEVELOPMENT_MODE_REQUIRED");
    const authorizationKey = digest(authorizationToken);
    const authorization = this.authorizations.get(authorizationKey);
    this.authorizations.delete(authorizationKey);
    const authorized =
      authorization ?? failure(401, "INVALID_DEMO_RELOAD_AUTHORIZATION");
    if (authorized.expiresAt <= Date.now())
      failure(401, "INVALID_DEMO_RELOAD_AUTHORIZATION");
    if (this.reloading) failure(409, "DEMO_RELOAD_IN_PROGRESS");

    this.reloading = true;
    const activePath = this.databasePath();
    const backupPath = this.backupPath();
    const shadowPath = this.shadowPath();
    mkdirSync(dirname(backupPath), { recursive: true });
    mkdirSync(dirname(shadowPath), { recursive: true });
    rmSync(shadowPath, { force: true });
    let backupCreated = false;
    try {
      const activeDatabase = new DatabaseSync(activePath);
      try {
        await backup(activeDatabase, backupPath);
        backupCreated = true;
      } finally {
        activeDatabase.close();
      }
      const raw = readFileSync(this.seedPath());
      if (digest(raw) !== authorized.seedSha256)
        failure(409, "DEMO_RELOAD_DATASET_CHANGED");
      const seed = parseSeed(raw.toString("utf8"));
      const shadowDatabase = new DatabaseSync(shadowPath);
      let identity: ReturnType<typeof databaseSnapshotIdentity>;
      try {
        identity = this.populateShadowDatabase(shadowDatabase, seed);
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
      return {
        ...this.status(),
        fixtureId: seed.fixtureId,
        seedSha256: digest(raw),
        code: "DEMO_DATA_RELOADED",
        completedAt: new Date().toISOString(),
        snapshotHash: identity.sha256,
        snapshotIdentityMethod: identity.method,
        importedRows: Object.fromEntries(
          Object.entries(seed.tables).map(([name, table]) => [
            name,
            table.rows.length,
          ]),
        ),
      };
    } catch (error) {
      if (backupCreated) await this.restoreBackup(backupPath, activePath);
      if (error instanceof HttpException) throw error;
      return failure(500, "DEMO_DATA_RELOAD_FAILED");
    } finally {
      rmSync(shadowPath, { force: true });
      this.reloading = false;
    }
  }

  private populateShadowDatabase(
    database: DatabaseSync,
    seed: DemoSeed,
  ): ReturnType<typeof databaseSnapshotIdentity> {
    for (const item of seed.schema.filter(({ type }) => type === "table"))
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
    for (const item of seed.schema.filter(({ type }) => type !== "table"))
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
        "./qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.approved.canonical.seed.json",
    );
  }

  private backupPath(): string {
    return resolve(
      this.environment["SSI_DEMO_BACKUP_PATH"] ??
        "./tmp/demo-reload/active-database.pre-reload.sqlite",
    );
  }

  private shadowPath(): string {
    return resolve(
      this.environment["SSI_DEMO_SHADOW_PATH"] ??
        "./tmp/demo-reload/new-database.loading.sqlite",
    );
  }
}
