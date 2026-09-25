import { HttpException } from "@nestjs/common";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DevelopmentDataReloadService } from "../../app/development-data-reload.service";

const codeOf = (action: () => unknown): { status: number; code: string } => {
  try {
    action();
    throw new Error("expected action to fail");
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    return {
      status: error.getStatus(),
      code: String((error.getResponse() as { code: string }).code),
    };
  }
};

const asyncCodeOf = async (
  action: () => Promise<unknown>,
): Promise<{ status: number; code: string }> => {
  try {
    await action();
    throw new Error("expected action to fail");
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    return {
      status: error.getStatus(),
      code: String((error.getResponse() as { code: string }).code),
    };
  }
};

describe("DevelopmentDataReloadService", () => {
  let directory: string;
  let databasePath: string;
  let seedPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ssi-reload-"));
    databasePath = join(directory, "demo.sqlite");
    seedPath = join(directory, "seed.json");
    const database = new DatabaseSync(databasePath);
    database.exec(
      "CREATE TABLE record (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    database.prepare("INSERT INTO record VALUES (?, ?)").run("OLD", "old");
    database.close();
    writeSeed([["NEW", "new"]]);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const environment = (overrides: Record<string, string | undefined> = {}) => ({
    SSI_RUNTIME_ENV: "demo",
    SSI_DEMO_ADMIN_PASSWORD: "secret",
    SSI_DATABASE_PATH: databasePath,
    SSI_DEMO_SEED_PATH: seedPath,
    SSI_DEMO_BACKUP_PATH: join(directory, "backup.sqlite"),
    SSI_DEMO_SHADOW_PATH: join(directory, "shadow.sqlite"),
    ...overrides,
  });

  const writeSeed = (rows: readonly (readonly string[])[]) =>
    writeFileSync(
      seedPath,
      JSON.stringify({
        schemaVersion: "1.0",
        fixtureId: "TEST-CANONICAL",
        classification: "SYNTHETIC_DEMO_QA_UAT",
        identityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
        schema: [
          {
            type: "table",
            name: "record",
            table: "record",
            sql: "CREATE TABLE record (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
          },
        ],
        tables: { record: { columns: ["id", "value"], rows } },
      }),
    );

  const rows = () => {
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      return database.prepare("SELECT id,value FROM record ORDER BY id").all();
    } finally {
      database.close();
    }
  };

  const authorizeAndReload = async (service: DevelopmentDataReloadService) => {
    const authorization = service.authorize("secret");
    return service.reload(authorization.authorizationToken);
  };

  it("reports a configured server-derived demo capability without inspecting seed metadata", () => {
    const status = new DevelopmentDataReloadService(environment()).status();
    expect(status).toMatchObject({
      runtimeEnvironment: "demo",
      developmentEnabled: true,
      reloadAvailable: true,
      statusPolicyVersion: "SSI-CONFIG-HTTP-01",
    });
    expect(status.fixtureId).toBeUndefined();
    expect(status.seedSha256).toBeUndefined();
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("does not read seed identity when Settings status is requested", () => {
    const service = new DevelopmentDataReloadService(environment());
    const first = service.status();
    writeSeed([["CHANGED", "new"]]);
    expect(service.status()).toEqual(first);
  });

  it("does not gate the Settings reload capability on canonical seed metadata", () => {
    const status = new DevelopmentDataReloadService(
      environment({ SSI_DEMO_SEED_PATH: join(directory, "missing-seed.json") }),
    ).status();
    expect(status).toMatchObject({
      developmentEnabled: true,
      reloadAvailable: true,
    });
    expect(status.fixtureId).toBeUndefined();
    expect(status.seedSha256).toBeUndefined();
  });

  it("uses the approved MT1/MT2 canonical seed as the default reload source", () => {
    const authorization = new DevelopmentDataReloadService(
      environment({ SSI_DEMO_SEED_PATH: undefined }),
    ).authorize("secret");
    expect(authorization).toMatchObject({
      code: "DEMO_RELOAD_AUTHORIZED",
      dataset: {
        classification: "SYNTHETIC_DEMO_QA_UAT",
      },
    });
  });

  it("reloads the approved MT1/MT2 seed twice into an isolated Development DB", async () => {
    const canonicalPath = join(directory, "canonical.sqlite");
    const seed = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "qa",
          "fixtures",
          "ssi",
          "reload-test-data",
          "ssi-demo.mt1-mt2.v1.approved.canonical.seed.json",
        ),
        "utf8",
      ),
    ) as {
      schema: { sql: string }[];
    };
    const source = new DatabaseSync(canonicalPath);
    try {
      for (const item of seed.schema) source.exec(item.sql);
    } finally {
      source.close();
    }
    const service = new DevelopmentDataReloadService(
      environment({
        SSI_DATABASE_PATH: canonicalPath,
        SSI_DEMO_SEED_PATH: undefined,
      }),
    );
    const first = await authorizeAndReload(service);
    const coverageDb = new DatabaseSync(canonicalPath, { readOnly: true });
    try {
      expect(
        (
          coverageDb
            .prepare(
              "SELECT COUNT(*) AS count FROM resolution_currency_coverage WHERE status='ACTIVE'",
            )
            .get() as { count: number }
        ).count,
      ).toBe(20);
    } finally {
      coverageDb.close();
    }
    const second = await authorizeAndReload(service);
    expect(first).toMatchObject({
      code: "DEMO_DATA_RELOADED",
      fixtureId: "SSI-DEMO-MT1-MT2-PACS008-PACS009-V1",
      importedRows: { ssi: 10637, ssi_applicability: 10973 },
    });
    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.importedRows).toEqual(first.importedRows);
  }, 60_000);

  it.each([
    [{ SSI_RUNTIME_ENV: "production" }, 403, "DEVELOPMENT_MODE_REQUIRED"],
    [{ SSI_DEMO_ADMIN_PASSWORD: undefined }, 503, "DEMO_RELOAD_NOT_CONFIGURED"],
  ] as const)(
    "fails closed for unavailable configuration %#",
    (override, status, code) => {
      expect(
        codeOf(() =>
          new DevelopmentDataReloadService(environment(override)).authorize(
            "secret",
          ),
        ),
      ).toEqual({ status, code });
      expect(rows()).toEqual([{ id: "OLD", value: "old" }]);
    },
  );

  it("rejects a wrong password without changing data", () => {
    expect(
      codeOf(() =>
        new DevelopmentDataReloadService(environment()).authorize("wrong"),
      ),
    ).toEqual({
      status: 401,
      code: "INVALID_DEMO_CONTROL_PASSWORD",
    });
    expect(rows()).toEqual([{ id: "OLD", value: "old" }]);
  });

  it("uses a short-lived, single-use authorization that can be cancelled", async () => {
    const service = new DevelopmentDataReloadService(environment());
    const cancelled = service.authorize("secret");
    expect(service.cancelAuthorization(cancelled.authorizationToken)).toEqual({
      code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED",
    });
    await expect(
      asyncCodeOf(() => service.reload(cancelled.authorizationToken)),
    ).resolves.toEqual({
      status: 401,
      code: "INVALID_DEMO_RELOAD_AUTHORIZATION",
    });

    const accepted = service.authorize("secret");
    await expect(
      service.reload(accepted.authorizationToken),
    ).resolves.toMatchObject({ code: "DEMO_DATA_RELOADED" });
    await expect(
      asyncCodeOf(() => service.reload(accepted.authorizationToken)),
    ).resolves.toEqual({
      status: 401,
      code: "INVALID_DEMO_RELOAD_AUTHORIZATION",
    });
  });

  it("rejects an expired authorization without changing data", async () => {
    const service = new DevelopmentDataReloadService(
      environment({ SSI_DEMO_RELOAD_AUTH_TTL_SECONDS: "-1" }),
    );
    const authorization = service.authorize("secret");
    await expect(
      asyncCodeOf(() => service.reload(authorization.authorizationToken)),
    ).resolves.toEqual({
      status: 401,
      code: "INVALID_DEMO_RELOAD_AUTHORIZATION",
    });
    expect(rows()).toEqual([{ id: "OLD", value: "old" }]);
  });

  it("rejects test data changed after authorization", async () => {
    const service = new DevelopmentDataReloadService(environment());
    const authorization = service.authorize("secret");
    writeSeed([["CHANGED", "changed"]]);
    await expect(
      asyncCodeOf(() => service.reload(authorization.authorizationToken)),
    ).resolves.toEqual({
      status: 409,
      code: "DEMO_RELOAD_DATASET_CHANGED",
    });
    expect(rows()).toEqual([{ id: "OLD", value: "old" }]);
  });

  it("rejects a concurrent reload", async () => {
    const service = new DevelopmentDataReloadService(environment());
    const authorization = service.authorize("secret");
    (service as unknown as { reloading: boolean }).reloading = true;
    await expect(
      asyncCodeOf(() => service.reload(authorization.authorizationToken)),
    ).resolves.toEqual({
      status: 409,
      code: "DEMO_RELOAD_IN_PROGRESS",
    });
  });

  it("reloads every seed row into a new database and returns verification metadata", async () => {
    const result = await authorizeAndReload(
      new DevelopmentDataReloadService(environment()),
    );
    expect(result).toMatchObject({
      code: "DEMO_DATA_RELOADED",
      developmentEnabled: true,
      importedRows: { record: 1 },
      snapshotIdentityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
    });
    expect(result.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows()).toEqual([{ id: "NEW", value: "new" }]);
  });

  it("reloads multiple tables in deterministic dependency order", async () => {
    const database = new DatabaseSync(databasePath);
    database.exec(
      "CREATE TABLE alpha (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    database.prepare("INSERT INTO alpha VALUES (?, ?)").run("OLD-A", "old");
    database.close();
    writeFileSync(
      seedPath,
      JSON.stringify({
        schemaVersion: "1.0",
        fixtureId: "TEST-MULTI-TABLE",
        classification: "SYNTHETIC_DEMO_QA_UAT",
        identityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
        schema: [
          {
            type: "table",
            name: "record",
            sql: "CREATE TABLE record (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
          },
          {
            type: "table",
            name: "alpha",
            sql: "CREATE TABLE alpha (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
          },
        ],
        tables: {
          record: { columns: ["id", "value"], rows: [["NEW", "new"]] },
          alpha: { columns: ["id", "value"], rows: [["NEW-A", "new-a"]] },
        },
      }),
    );

    await expect(
      authorizeAndReload(new DevelopmentDataReloadService(environment())),
    ).resolves.toMatchObject({
      code: "DEMO_DATA_RELOADED",
      importedRows: { alpha: 1, record: 1 },
    });
    const reloaded = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(reloaded.prepare("SELECT id,value FROM alpha").all()).toEqual([
        { id: "NEW-A", value: "new-a" },
      ]);
    } finally {
      reloaded.close();
    }
  });

  it("restores the old database when imported data is invalid", async () => {
    writeSeed([
      ["DUPLICATE", "one"],
      ["DUPLICATE", "two"],
    ]);
    const service = new DevelopmentDataReloadService(environment());
    const authorization = service.authorize("secret");
    await expect(
      asyncCodeOf(() => service.reload(authorization.authorizationToken)),
    ).resolves.toEqual({
      status: 500,
      code: "DEMO_DATA_RELOAD_FAILED",
    });
    expect(rows()).toEqual([{ id: "OLD", value: "old" }]);
  });

  it("rejects test data whose declared columns do not match its schema", async () => {
    const seed = JSON.parse(readFileSync(seedPath, "utf8"));
    seed.tables.record.columns = ["id"];
    writeFileSync(seedPath, JSON.stringify(seed));
    const service = new DevelopmentDataReloadService(environment());
    const authorization = service.authorize("secret");
    await expect(
      asyncCodeOf(() => service.reload(authorization.authorizationToken)),
    ).resolves.toEqual({
      status: 500,
      code: "DEMO_DATA_RELOAD_FAILED",
    });
    expect(rows()).toEqual([{ id: "OLD", value: "old" }]);
  });

  it("reports malformed test data during authorization without changing the DB", () => {
    writeFileSync(seedPath, "{}");
    expect(
      codeOf(() =>
        new DevelopmentDataReloadService(environment()).authorize("secret"),
      ),
    ).toEqual({
      status: 500,
      code: "DEMO_RELOAD_DATASET_UNAVAILABLE",
    });
    expect(rows()).toEqual([{ id: "OLD", value: "old" }]);
  });
});
