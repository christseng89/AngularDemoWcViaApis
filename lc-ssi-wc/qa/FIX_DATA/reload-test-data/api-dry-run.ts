import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type DataType = "ENTITY" | "NOSTRO" | "RMA" | "SSI";

interface SeedTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}

interface CanonicalSeed {
  readonly fixtureId: string;
  readonly tables: Readonly<Record<string, SeedTable>>;
}

interface SourceRecord {
  readonly sourceId: string;
  readonly sourceStatus: string;
  readonly payload: Record<string, unknown>;
}

interface ImportRowResult {
  readonly row: number;
  readonly status: "VALIDATED" | "REJECTED";
  readonly code?: string;
}

interface ImportResponse {
  readonly dataType: DataType;
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly results: readonly ImportRowResult[];
}

interface SnapshotIdentity {
  readonly sha256: string;
  readonly method: string;
}

interface RuntimeSettings {
  readonly currentSnapshot: SnapshotIdentity;
}

interface DryRunError {
  readonly dataType: DataType;
  readonly table: string;
  readonly sourceId: string;
  readonly sourceStatus: string;
  readonly row: number;
  readonly code: string;
}

interface DataTypeReport {
  readonly dataType: DataType;
  readonly table: string;
  readonly total: number;
  readonly validated: number;
  readonly rejected: number;
  readonly errorCounts: Readonly<Record<string, number>>;
}

interface ApiDryRunReport {
  readonly executionId: string;
  readonly executedAt: string;
  readonly mode: "API_DRY_RUN";
  readonly apiBase: string;
  readonly seedPath: string;
  readonly seedFixtureId: string;
  readonly seedSha256: string;
  readonly beforeSnapshot: SnapshotIdentity;
  readonly afterSnapshot: SnapshotIdentity;
  readonly zeroWriteVerified: boolean;
  readonly summary: {
    readonly total: number;
    readonly validated: number;
    readonly rejected: number;
  };
  readonly byDataType: readonly DataTypeReport[];
  readonly errors: readonly DryRunError[];
}

const DATA_SOURCES: ReadonlyArray<{
  readonly dataType: DataType;
  readonly table: string;
}> = [
  { dataType: "ENTITY", table: "booking_branch_entity" },
  { dataType: "NOSTRO", table: "nostro_account" },
  { dataType: "RMA", table: "rma_authorisation" },
  { dataType: "SSI", table: "ssi" },
];

class CanonicalSeedReader {
  private readonly seedPath: string;

  constructor(seedPath: string) {
    this.seedPath = resolve(seedPath);
  }

  read(): {
    readonly seed: CanonicalSeed;
    readonly path: string;
    readonly sha256: string;
  } {
    const raw = readFileSync(this.seedPath);
    const seed = JSON.parse(raw.toString("utf8")) as CanonicalSeed;
    if (!seed.fixtureId || !seed.tables)
      throw new Error("INVALID_CANONICAL_SEED");
    return {
      seed,
      path: this.seedPath,
      sha256: createHash("sha256").update(raw).digest("hex"),
    };
  }

  records(seed: CanonicalSeed, tableName: string): SourceRecord[] {
    const table = seed.tables[tableName];
    if (!table) throw new Error(`SEED_TABLE_MISSING:${tableName}`);
    const idIndex = table.columns.indexOf("id");
    const payloadIndex = table.columns.indexOf("payload");
    if (idIndex < 0 || payloadIndex < 0)
      throw new Error(`SEED_TABLE_COLUMNS_INVALID:${tableName}`);
    return table.rows.map((row) => {
      const payload = JSON.parse(String(row[payloadIndex])) as Record<
        string,
        unknown
      >;
      return {
        sourceId: String(row[idIndex]),
        sourceStatus: String(payload["status"] ?? "UNKNOWN"),
        payload,
      };
    });
  }
}

class ApiDryRunClient {
  private readonly apiBase: string;

  constructor(apiBase: string) {
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  async snapshot(): Promise<SnapshotIdentity> {
    const settings = await this.request<RuntimeSettings>("settings/runtime");
    return settings.currentSnapshot;
  }

  async validate(
    dataType: DataType,
    records: readonly Record<string, unknown>[],
    batchNumber: number,
  ): Promise<ImportResponse> {
    return this.request<ImportResponse>("swift-data/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType,
        fileName: `${dataType.toLowerCase()}-${batchNumber}.json`,
        dryRun: true,
        idempotencyKey: `reload-api-dry-run-${dataType}-${randomUUID()}`,
        records,
      }),
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.apiBase}/${path}`, init);
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `API_REQUEST_FAILED:${response.status}:${path}:${text.slice(0, 500)}`,
      );
    return JSON.parse(text) as T;
  }
}

class ReloadTestDataApiDryRun {
  private readonly reader: CanonicalSeedReader;
  private readonly client: ApiDryRunClient;
  private readonly apiBase: string;
  private readonly batchSize: number;
  private readonly maximumBatchBytes: number;

  constructor(input: {
    readonly seedPath: string;
    readonly apiBase: string;
    readonly batchSize?: number;
    readonly maximumBatchBytes?: number;
  }) {
    this.reader = new CanonicalSeedReader(input.seedPath);
    this.client = new ApiDryRunClient(input.apiBase);
    this.apiBase = input.apiBase;
    this.batchSize = input.batchSize ?? 500;
    this.maximumBatchBytes = input.maximumBatchBytes ?? 90_000;
  }

  async execute(): Promise<ApiDryRunReport> {
    const executionId = randomUUID();
    const source = this.reader.read();
    const beforeSnapshot = await this.client.snapshot();
    const reports = await Promise.all(
      DATA_SOURCES.map((item) =>
        this.validateDataType(source.seed, item.dataType, item.table),
      ),
    );
    const afterSnapshot = await this.client.snapshot();
    const zeroWriteVerified =
      beforeSnapshot.method === afterSnapshot.method &&
      beforeSnapshot.sha256 === afterSnapshot.sha256;
    const errors = reports.flatMap((item) => item.errors);
    const byDataType = reports.map((item) => item.report);
    const report: ApiDryRunReport = {
      executionId,
      executedAt: new Date().toISOString(),
      mode: "API_DRY_RUN",
      apiBase: this.apiBase,
      seedPath: source.path,
      seedFixtureId: source.seed.fixtureId,
      seedSha256: source.sha256,
      beforeSnapshot,
      afterSnapshot,
      zeroWriteVerified,
      summary: {
        total: byDataType.reduce((sum, item) => sum + item.total, 0),
        validated: byDataType.reduce((sum, item) => sum + item.validated, 0),
        rejected: byDataType.reduce((sum, item) => sum + item.rejected, 0),
      },
      byDataType,
      errors,
    };
    if (!zeroWriteVerified)
      throw new Error("DRY_RUN_CHANGED_DATABASE_SNAPSHOT");
    return report;
  }

  private async validateDataType(
    seed: CanonicalSeed,
    dataType: DataType,
    table: string,
  ): Promise<{
    readonly report: DataTypeReport;
    readonly errors: DryRunError[];
  }> {
    const records = this.reader.records(seed, table);
    const errors: DryRunError[] = [];
    let validated = 0;
    let batchNumber = 0;
    for (const { offset, records: batch } of this.batches(records)) {
      batchNumber += 1;
      const response = await this.client.validate(
        dataType,
        batch.map((item) => item.payload),
        batchNumber,
      );
      if (response.total !== batch.length)
        throw new Error(`API_RESULT_COUNT_MISMATCH:${dataType}:${offset}`);
      validated += response.accepted;
      for (const result of response.results) {
        if (result.status !== "REJECTED") continue;
        const source = batch[result.row - 1];
        if (!source)
          throw new Error(`API_RESULT_ROW_INVALID:${dataType}:${result.row}`);
        errors.push({
          dataType,
          table,
          sourceId: source.sourceId,
          sourceStatus: source.sourceStatus,
          row: offset + result.row,
          code: result.code ?? "UNKNOWN_ERROR",
        });
      }
    }
    return {
      report: {
        dataType,
        table,
        total: records.length,
        validated,
        rejected: errors.length,
        errorCounts: Object.fromEntries(
          [...new Set(errors.map((item) => item.code))]
            .sort((left, right) => left.localeCompare(right))
            .map((code) => [
              code,
              errors.filter((item) => item.code === code).length,
            ]),
        ),
      },
      errors,
    };
  }

  private batches(records: readonly SourceRecord[]): ReadonlyArray<{
    readonly offset: number;
    readonly records: SourceRecord[];
  }> {
    const batches: Array<{
      readonly offset: number;
      readonly records: SourceRecord[];
    }> = [];
    let current: SourceRecord[] = [];
    let currentBytes = 2;
    let offset = 0;
    for (const record of records) {
      const recordBytes = Buffer.byteLength(JSON.stringify(record.payload)) + 1;
      if (recordBytes > this.maximumBatchBytes)
        throw new Error(`IMPORT_RECORD_TOO_LARGE:${record.sourceId}`);
      if (
        current.length > 0 &&
        (current.length >= this.batchSize ||
          currentBytes + recordBytes > this.maximumBatchBytes)
      ) {
        batches.push({ offset, records: current });
        offset += current.length;
        current = [];
        currentBytes = 2;
      }
      current.push(record);
      currentBytes += recordBytes;
    }
    if (current.length > 0) batches.push({ offset, records: current });
    return batches;
  }
}

const option = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]!
    : fallback;
};

const reportPath = resolve(
  option("--report", "tmp/reload-test-data-api-dry-run.json"),
);
const runner = new ReloadTestDataApiDryRun({
  apiBase: option("--api-base", "http://localhost:3100/api"),
  seedPath: option(
    "--seed",
    "qa/FIX_DATA/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json",
  ),
});
const report = await runner.execute();
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      reportPath,
      ...report.summary,
      zeroWriteVerified: report.zeroWriteVerified,
      byDataType: report.byDataType,
    },
    null,
    2,
  ),
);
