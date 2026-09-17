import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type JsonObject = Record<string, unknown>;

interface DatabaseRow {
  id: string;
  payload: string;
  updated_at: string;
  ssi_id?: string;
}

interface SeedTable {
  columns: string[];
  rows: unknown[][];
}

interface CanonicalSeed {
  tables: Record<string, SeedTable>;
}

export interface InventorySnapshot {
  databasePath: string;
  reloadSeedPath: string;
  ssi: DatabaseRow[];
  applicability: DatabaseRow[];
  rma: DatabaseRow[];
  reloadIds: {
    ssi: Set<string>;
    applicability: Set<string>;
  };
}

export interface PreservedRow {
  id: string;
  status: string;
  payload: string;
  updatedAt: string;
  ssiId?: string;
  disposition: "PRESERVE_NON_TARGET_RUNTIME_DRIFT";
}

export interface InventoryReport {
  schemaVersion: "1.0";
  generatedAt: "READ_ONLY_CURRENT_SNAPSHOT";
  databasePath: string;
  reloadSeedPath: string;
  activeMemberships: {
    ssi: Record<string, number>;
    rma: Record<string, number>;
  };
  pacs009DualTokenActiveSsi: number;
  pacs009SourceOnlyActiveSsi: number;
  rmaResidual: {
    physicalRows: number;
    sourceTokenMemberships: number;
    canonicalGroups: number;
    recordIds: string[];
    canonicalGroupKeys: string[];
  };
  runtimeOnly: {
    ssi: PreservedRow[];
    applicability: PreservedRow[];
    logicalSha256: string;
  };
  unknownDisposition: 0;
  databaseWrites: 0;
}

const TOKENS = [
  "pacs.008.001.12",
  "pacs.008.001.012",
  "pacs.008.001.08",
  "pacs.009.001.12",
  "pacs.009.001.012",
  "pacs.009.001.08",
] as const;

const parsePayload = (row: DatabaseRow): JsonObject =>
  JSON.parse(row.payload) as JsonObject;

const messages = (payload: JsonObject): string[] => {
  const route = payload["route"] as JsonObject | undefined;
  const value = route?.["messageTypes"] ?? payload["messageTypes"] ?? [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
};

const status = (payload: JsonObject): string => String(payload["status"] ?? "UNKNOWN");

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
};

const sha256 = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
    .toUpperCase();

const rowsFromSeed = (seed: CanonicalSeed, tableName: string): JsonObject[] => {
  const table = seed.tables[tableName];
  if (!table) throw new Error(`MISSING_SEED_TABLE:${tableName}`);
  return table.rows.map((values) =>
    Object.fromEntries(table.columns.map((column, index) => [column, values[index]])),
  );
};

export class ActiveMessageInventoryRepository {
  private readonly databasePath: string;
  private readonly reloadSeedPath: string;

  constructor(
    databasePath: string,
    reloadSeedPath: string,
  ) {
    this.databasePath = databasePath;
    this.reloadSeedPath = reloadSeedPath;
  }

  read(): InventorySnapshot {
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      database.exec("PRAGMA query_only = ON");
      const ssi = database
        .prepare("SELECT id, payload, updated_at FROM ssi ORDER BY id")
        .all() as unknown as DatabaseRow[];
      const applicability = database
        .prepare("SELECT id, ssi_id, payload, updated_at FROM ssi_applicability ORDER BY id")
        .all() as unknown as DatabaseRow[];
      const rma = database
        .prepare("SELECT id, payload, updated_at FROM rma_authorisation ORDER BY id")
        .all() as unknown as DatabaseRow[];
      const seed = JSON.parse(readFileSync(this.reloadSeedPath, "utf8")) as CanonicalSeed;
      return {
        databasePath: this.databasePath,
        reloadSeedPath: this.reloadSeedPath,
        ssi,
        applicability,
        rma,
        reloadIds: {
          ssi: new Set(rowsFromSeed(seed, "ssi").map((row) => String(row["id"]))),
          applicability: new Set(
            rowsFromSeed(seed, "ssi_applicability").map((row) => String(row["id"])),
          ),
        },
      };
    } finally {
      database.close();
    }
  }
}

export class MessageFamilyClassifier {
  classify(snapshot: InventorySnapshot): InventoryReport {
    const activeSsi = snapshot.ssi.filter((row) => status(parsePayload(row)) === "ACTIVE");
    const activeRma = snapshot.rma.filter((row) => status(parsePayload(row)) === "ACTIVE");
    const ssiMemberships = Object.fromEntries(
      TOKENS.map((token) => [
        token,
        activeSsi.filter((row) => messages(parsePayload(row)).includes(token)).length,
      ]),
    );
    const rmaMemberships: Record<string, number> = Object.fromEntries(
      TOKENS.map((token) => [
        token,
        activeRma.filter((row) => messages(parsePayload(row)).includes(token)).length,
      ]),
    );
    rmaMemberships["MT1"] = activeRma.filter((row) =>
      messages(parsePayload(row)).some((message) => /^MT1/.test(message)),
    ).length;
    rmaMemberships["MT2"] = activeRma.filter((row) =>
      messages(parsePayload(row)).some((message) => /^MT2/.test(message)),
    ).length;

    const pacs009Source = activeSsi.filter((row) => {
      const values = messages(parsePayload(row));
      return values.includes("pacs.009.001.12") || values.includes("pacs.009.001.012");
    });
    const pacs009Dual = pacs009Source.filter((row) =>
      messages(parsePayload(row)).includes("pacs.009.001.08"),
    );
    const residualRma = activeRma.filter((row) => {
      const values = messages(parsePayload(row));
      return values.some((message) =>
        [
          "pacs.008.001.12",
          "pacs.008.001.012",
          "pacs.009.001.12",
          "pacs.009.001.012",
        ].includes(message),
      );
    });
    const canonicalGroupKeys = [
      ...new Set(
        residualRma.map((row) => {
          const payload = parsePayload(row);
          return [
            payload["ownBic"],
            payload["counterpartyBic"],
            payload["service"],
            payload["direction"],
          ].join("::");
        }),
      ),
    ].sort();
    const sourceTokenMemberships = residualRma.reduce(
      (count, row) =>
        count +
        messages(parsePayload(row)).filter((message) =>
          [
            "pacs.008.001.12",
            "pacs.008.001.012",
            "pacs.009.001.12",
            "pacs.009.001.012",
          ].includes(message),
        ).length,
      0,
    );

    const preserve = (row: DatabaseRow): PreservedRow => {
      const payload = parsePayload(row);
      return {
        id: row.id,
        status: status(payload),
        payload: row.payload,
        updatedAt: row.updated_at,
        ...(row.ssi_id ? { ssiId: row.ssi_id } : {}),
        disposition: "PRESERVE_NON_TARGET_RUNTIME_DRIFT",
      };
    };
    const runtimeOnlySsi = snapshot.ssi
      .filter((row) => !snapshot.reloadIds.ssi.has(row.id))
      .map(preserve);
    const runtimeOnlyApplicability = snapshot.applicability
      .filter((row) => !snapshot.reloadIds.applicability.has(row.id))
      .map(preserve);

    return {
      schemaVersion: "1.0",
      generatedAt: "READ_ONLY_CURRENT_SNAPSHOT",
      databasePath: snapshot.databasePath,
      reloadSeedPath: snapshot.reloadSeedPath,
      activeMemberships: { ssi: ssiMemberships, rma: rmaMemberships },
      pacs009DualTokenActiveSsi: pacs009Dual.length,
      pacs009SourceOnlyActiveSsi: pacs009Source.length - pacs009Dual.length,
      rmaResidual: {
        physicalRows: residualRma.length,
        sourceTokenMemberships,
        canonicalGroups: canonicalGroupKeys.length,
        recordIds: residualRma.map((row) => row.id).sort(),
        canonicalGroupKeys,
      },
      runtimeOnly: {
        ssi: runtimeOnlySsi,
        applicability: runtimeOnlyApplicability,
        logicalSha256: sha256({ ssi: runtimeOnlySsi, applicability: runtimeOnlyApplicability }),
      },
      unknownDisposition: 0,
      databaseWrites: 0,
    };
  }
}

export class InventoryReportWriter {
  serialize(report: InventoryReport): string {
    return `${JSON.stringify(stableValue(report), null, 2)}\n`;
  }

  write(path: string, report: InventoryReport): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, this.serialize(report), "utf8");
  }
}

const option = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? resolve(process.argv[index + 1]) : resolve(fallback);
};

const main = (): void => {
  const databasePath = option("--db", "data/ssi-demo.sqlite");
  const reloadSeedPath = option(
    "--reload-seed",
    "qa/FIX_DATA/ssi/reload-test-data/ssi-demo.mt347-v1.1.approved.canonical.seed.json",
  );
  const inventoryOut = option(
    "--inventory-out",
    "qa/FIX_DATA/ssi/mt1-mt2/active-inventory.v1.json",
  );
  const driftOut = option(
    "--drift-out",
    "qa/FIX_DATA/ssi/mt1-mt2/runtime-drift-preservation.v1.json",
  );
  const report = new MessageFamilyClassifier().classify(
    new ActiveMessageInventoryRepository(databasePath, reloadSeedPath).read(),
  );
  const writer = new InventoryReportWriter();
  writer.write(inventoryOut, report);
  writer.write(driftOut, {
    ...report,
    activeMemberships: { ssi: {}, rma: {} },
    rmaResidual: { physicalRows: 0, sourceTokenMemberships: 0, canonicalGroups: 0, recordIds: [], canonicalGroupKeys: [] },
  });
};

if (process.argv[1]?.endsWith("mt1-mt2-active-inventory.ts")) main();
