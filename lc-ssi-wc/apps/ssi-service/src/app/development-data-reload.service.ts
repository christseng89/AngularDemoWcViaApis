import { HttpException, Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
export class DevelopmentDataReloadService implements OnModuleInit {
  private reloading = false;
  private seedDescriptor: { fixtureId: string; seedSha256: string } | null | undefined;

  constructor(
    @Optional()
    @Inject("SSI_RUNTIME_ENVIRONMENT")
    private readonly environment: RuntimeEnvironment = process.env,
  ) {}

  onModuleInit(): void {
    this.seedDescriptor = this.loadSeedDescriptor();
  }

  private loadSeedDescriptor(): { fixtureId: string; seedSha256: string } | null {
    try {
      const raw = readFileSync(this.seedPath());
      return { fixtureId: parseSeed(raw.toString("utf8")).fixtureId, seedSha256: digest(raw) };
    } catch {
      return null;
    }
  }

  status(): DemoReloadStatus {
    const runtime = resolveRuntimeEnvironment(this.environment);
    const password = this.environment["SSI_DEMO_ADMIN_PASSWORD"]?.trim();
    if (this.seedDescriptor === undefined)
      this.seedDescriptor = this.loadSeedDescriptor();
    if (this.seedDescriptor) {
      return {
        ...runtime,
        reloadAvailable: runtime.developmentEnabled && Boolean(password),
        ...this.seedDescriptor,
        statusPolicyVersion: "SSI-CONFIG-HTTP-01",
      };
    }
    return {
      ...runtime,
      reloadAvailable: false,
      statusPolicyVersion: "SSI-CONFIG-HTTP-01",
    };
  }

  reload(password: string): DemoReloadResult {
    const status = this.status();
    if (!status.developmentEnabled) failure(403, "DEVELOPMENT_MODE_REQUIRED");
    const expected = this.environment["SSI_DEMO_ADMIN_PASSWORD"]?.trim();
    if (!expected) failure(503, "DEMO_RELOAD_NOT_CONFIGURED");
    if (!password || !secureEquals(password, expected ?? ""))
      failure(401, "INVALID_DEMO_CONTROL_PASSWORD");
    if (this.reloading) failure(409, "DEMO_RELOAD_IN_PROGRESS");

    this.reloading = true;
    const database = new DatabaseSync(this.databasePath());
    try {
      const raw = readFileSync(this.seedPath());
      const seed = parseSeed(raw.toString("utf8"));
      this.validateSchema(database, seed);
      const expectedIdentity = seedIdentity(seed);
      database.exec(
        "PRAGMA busy_timeout=5000; BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;",
      );
      try {
        const tableNames = Object.keys(seed.tables).sort((left, right) =>
          right.localeCompare(left),
        );
        for (const name of tableNames)
          database.exec(`DELETE FROM ${quoteSqliteIdentifier(name)}`);
        for (const name of Object.keys(seed.tables).sort((left, right) =>
          left.localeCompare(right),
        ))
          this.insertTable(database, name, seed.tables[name]!);
        const integrity = String(
          (
            database.prepare("PRAGMA integrity_check").get() as Record<
              string,
              unknown
            >
          )["integrity_check"],
        );
        if (integrity !== "ok")
          throw new Error("SQLite integrity check failed");
        const canonicalIdentity = databaseSnapshotIdentity(database, Object.keys(seed.tables));
        if (canonicalIdentity.sha256.toLowerCase() !== expectedIdentity.toLowerCase())
          throw new Error("logical snapshot identity mismatch");
        if (seed.tables["ssi"] && seed.tables["ssi_applicability"])
          this.rebuildResolutionCurrencyCoverage(database);
        const identity = databaseSnapshotIdentity(database);
        database.exec("COMMIT");
        this.seedDescriptor = { fixtureId: seed.fixtureId, seedSha256: digest(raw) };
        return {
          ...this.status(),
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
        database.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return failure(500, "DEMO_DATA_RELOAD_FAILED");
    } finally {
      database.close();
      this.reloading = false;
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
      "resolution_currency_coverage", "resolution_currency_sync_control",
    ]);
    if (JSON.stringify(actual.filter((name) => !controlledDerived.has(name))) !== JSON.stringify(expected))
      throw new Error(
        "active database schema does not match the canonical seed",
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
    database.exec("DELETE FROM resolution_currency_coverage; DELETE FROM resolution_currency_sync_control;");
    const repository = new SqliteSsiRepository(database);
    const policy = new ResolutionCurrencyCoveragePolicy();
    const discovery = new ResolutionCurrencyCoverageDiscoveryService(
      new MappingResolutionPageDefinitionSource(new MappingCatalogueService()),
      new PaymentResolutionPageDefinitionSource(),
      repository,
    );
    const result = discovery.discover(policy.asOfDate);
    repository.reconcileResolutionCurrenciesWithinTransaction(result.pairs, policy.asOfDate);
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
}
