import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { hashCanonical } from "../../../../apps/ssi-service/src/app/canonical-json.ts";
import { SsiMt1Mt2CandidateGenerator } from "./mt1-mt2-candidate-generator.ts";

type JsonObject = Record<string, unknown>;

const sha = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex").toUpperCase();

const exactPayload = (left: string, right: JsonObject): boolean =>
  JSON.stringify(JSON.parse(left)) === JSON.stringify(right);

export interface DemoApplyReport {
  readonly status: "PASS";
  readonly backupPath: string;
  readonly backupSha256: string;
  readonly logicalShaBefore: string;
  readonly logicalShaAfter: string;
  readonly firstApply: {
    readonly ssiInserts: number;
    readonly applicabilityInserts: number;
  };
  readonly secondApply: {
    readonly ssiInserts: 0;
    readonly applicabilityInserts: 0;
  };
  readonly candidateSsiRows: 49;
  readonly candidateApplicabilityRows: 128;
  readonly duplicateCandidateIds: 0;
  readonly orphanApplicabilityRows: 0;
  readonly integrityCheck: "ok";
  readonly rmaRowsChanged: 0;
  readonly nostroRowsChanged: 0;
  readonly entityRowsChanged: 0;
}

type SqlValue = null | number | string | bigint | Uint8Array;

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

const normalizeSqlValue = (value: SqlValue | undefined): unknown => {
  if (value === undefined) return null;
  if (typeof value === "bigint") return { bigint: value.toString() };
  if (value instanceof Uint8Array)
    return { base64: Buffer.from(value).toString("base64") };
  return value;
};

export const ssiDemoLogicalIdentity = (databasePath: string): string => {
  const db = new DatabaseSync(resolve(databasePath), { readOnly: true });
  db.exec("PRAGMA query_only=ON; BEGIN");
  try {
    const tables = (
      db
        .prepare(
          "SELECT name,sql FROM sqlite_schema WHERE type='table' " +
            "AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as unknown as Array<{ name: string; sql: string | null }>
    ).map(({ name, sql }) => {
      const columns = (
        db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all() as unknown as Array<{
          name: string;
        }>
      ).map((column) => column.name);
      const projection = columns.map(quoteIdentifier).join(", ");
      const ordering = columns.map(quoteIdentifier).join(", ");
      const rows = db
        .prepare(
          `SELECT ${projection} FROM ${quoteIdentifier(name)}${
            ordering ? ` ORDER BY ${ordering}` : ""
          }`,
        )
        .all()
        .map((row) =>
          Object.fromEntries(
            columns.map((column) => [
              column,
              normalizeSqlValue((row as Record<string, SqlValue>)[column]),
            ]),
          ),
        );
      return { name, sql, columns, rows };
    });
    return hashCanonical({
      method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
      tables,
    });
  } finally {
    db.exec("ROLLBACK");
    db.close();
  }
};

export const restoreSsiDemoDatabase = async (
  databasePath: string,
  backupPath: string,
  expectedLogicalIdentity: string,
): Promise<void> => {
  const source = new DatabaseSync(resolve(backupPath), { readOnly: true });
  try {
    await backup(source, resolve(databasePath));
  } finally {
    source.close();
  }
  const restoredIdentity = ssiDemoLogicalIdentity(databasePath);
  if (restoredIdentity !== expectedLogicalIdentity)
    throw new Error("DEMO_APPLY_RESTORED_IDENTITY_MISMATCH");
};

export class SsiMt1Mt2DemoApplier {
  private readonly databasePath: string;
  private readonly ruleTablePath: string;

  constructor(
    databasePath: string,
    ruleTablePath: string,
  ) {
    this.databasePath = databasePath;
    this.ruleTablePath = ruleTablePath;
  }

  async apply(backupPath: string): Promise<DemoApplyReport> {
    const databaseFile = resolve(this.databasePath);
    const backupFile = resolve(backupPath);
    const logicalShaBefore = ssiDemoLogicalIdentity(databaseFile);
    mkdirSync(dirname(backupFile), { recursive: true });
    const source = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      await backup(source, backupFile);
    } finally {
      source.close();
    }
    const backupSha256 = sha(readFileSync(backupFile));
    if (ssiDemoLogicalIdentity(backupFile) !== logicalShaBefore)
      throw new Error("DEMO_APPLY_BACKUP_IDENTITY_MISMATCH");
    let mutationStarted = false;
    try {
      const candidates = new SsiMt1Mt2CandidateGenerator(
        databaseFile,
        this.ruleTablePath,
      ).generate();
      const nonTargetBefore = this.nonTargetIdentity(databaseFile);
      mutationStarted = true;
      const firstApply = this.insert(databaseFile, candidates);
      const secondApply = this.insert(databaseFile, candidates);
      if (firstApply.ssiInserts !== 49 || firstApply.applicabilityInserts !== 128)
        throw new Error("DEMO_APPLY_FIRST_APPLY_COUNT_MISMATCH");
      const nonTargetAfter = this.nonTargetIdentity(databaseFile);
      if (JSON.stringify(nonTargetBefore) !== JSON.stringify(nonTargetAfter))
        throw new Error("DEMO_APPLY_NON_TARGET_MUTATION");

      const db = new DatabaseSync(databaseFile, { readOnly: true });
      db.exec("PRAGMA query_only=ON");
      let candidateSsiRows: number;
      let candidateApplicabilityRows: number;
      let duplicateCandidateIds: number;
      let orphanApplicabilityRows: number;
      let integrityCheck: string;
      try {
        const scalar = (sql: string): number =>
          Number(Object.values(db.prepare(sql).get() as JsonObject)[0]);
        candidateSsiRows = scalar(
          "SELECT COUNT(*) FROM ssi WHERE id LIKE 'SSI-MT12-V1-%'",
        );
        candidateApplicabilityRows = scalar(
          "SELECT COUNT(*) FROM ssi_applicability WHERE id LIKE 'SSI-MT12-V1-%'",
        );
        duplicateCandidateIds = scalar(
          "SELECT COUNT(*) FROM (SELECT id FROM ssi WHERE id LIKE 'SSI-MT12-V1-%' " +
            "GROUP BY id HAVING COUNT(*)>1)",
        );
        orphanApplicabilityRows = scalar(
          "SELECT COUNT(*) FROM ssi_applicability a LEFT JOIN ssi s ON s.id=a.ssi_id " +
            "WHERE a.id LIKE 'SSI-MT12-V1-%' AND s.id IS NULL",
        );
        integrityCheck = String(
          Object.values(db.prepare("PRAGMA integrity_check").get() as JsonObject)[0],
        );
      } finally {
        db.close();
      }
      if (
        candidateSsiRows !== 49 ||
        candidateApplicabilityRows !== 128 ||
        duplicateCandidateIds !== 0 ||
        orphanApplicabilityRows !== 0 ||
        integrityCheck !== "ok" ||
        secondApply.ssiInserts !== 0 ||
        secondApply.applicabilityInserts !== 0
      )
        throw new Error("DEMO_APPLY_POST_CHECK_FAILED");
      const logicalShaAfter = ssiDemoLogicalIdentity(databaseFile);
      return {
        status: "PASS",
        backupPath: backupFile,
        backupSha256,
        logicalShaBefore,
        logicalShaAfter,
        firstApply,
        secondApply: { ssiInserts: 0, applicabilityInserts: 0 },
        candidateSsiRows: 49,
        candidateApplicabilityRows: 128,
        duplicateCandidateIds: 0,
        orphanApplicabilityRows: 0,
        integrityCheck: "ok",
        rmaRowsChanged: 0,
        nostroRowsChanged: 0,
        entityRowsChanged: 0,
      };
    } catch (error) {
      if (!mutationStarted) throw error;
      try {
        await restoreSsiDemoDatabase(
          databaseFile,
          backupFile,
          logicalShaBefore,
        );
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "DEMO_APPLY_RESTORE_FAILED",
        );
      }
      throw error;
    }
  }

  private insert(
    databasePath: string,
    candidates: ReturnType<SsiMt1Mt2CandidateGenerator["generate"]>,
  ): { ssiInserts: number; applicabilityInserts: number } {
    const db = new DatabaseSync(databasePath);
    db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
    let ssiInserts = 0;
    let applicabilityInserts = 0;
    try {
      const findSsi = db.prepare("SELECT payload,updated_at FROM ssi WHERE id=?");
      const addSsi = db.prepare(
        "INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?)",
      );
      for (const item of candidates.ssi) {
        const existing = findSsi.get(item.id) as
          | { payload: string; updated_at: string }
          | undefined;
        if (existing) {
          if (
            !exactPayload(existing.payload, item.payload) ||
            existing.updated_at !== String(item.payload.updatedAt)
          )
            throw new Error(`DEMO_APPLY_SSI_ID_COLLISION:${item.id}`);
          continue;
        }
        addSsi.run(
          item.id,
          String(JSON.stringify(item.payload)),
          String(item.payload.updatedAt),
        );
        ssiInserts += 1;
      }

      const findApp = db.prepare(
        "SELECT ssi_id,payload,updated_at FROM ssi_applicability WHERE id=?",
      );
      const addApp = db.prepare(
        "INSERT INTO ssi_applicability(id,ssi_id,payload,updated_at) VALUES(?,?,?,?)",
      );
      for (const item of candidates.applicability) {
        const existing = findApp.get(item.id) as
          | { ssi_id: string; payload: string; updated_at: string }
          | undefined;
        if (existing) {
          if (
            existing.ssi_id !== item.ssiId ||
            !exactPayload(existing.payload, item.payload) ||
            existing.updated_at !== String(item.payload.updatedAt)
          )
            throw new Error(`DEMO_APPLY_APPLICABILITY_ID_COLLISION:${item.id}`);
          continue;
        }
        addApp.run(
          item.id,
          item.ssiId,
          String(JSON.stringify(item.payload)),
          String(item.payload.updatedAt),
        );
        applicabilityInserts += 1;
      }
      db.exec("COMMIT");
      return { ssiInserts, applicabilityInserts };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.close();
    }
  }

  private nonTargetIdentity(databasePath: string): JsonObject {
    const db = new DatabaseSync(databasePath, { readOnly: true });
    db.exec("PRAGMA query_only=ON");
    try {
      const identity = (table: string): string =>
        sha(
          JSON.stringify(
            db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
          ),
        );
      return {
        rma: identity("rma_authorisation"),
        nostro: identity("nostro_account"),
        entity: identity("booking_branch_entity"),
      };
    } finally {
      db.close();
    }
  }
}

interface SeedSchemaItem {
  readonly type: string;
  readonly name: string;
  readonly table: string;
  readonly sql: string;
}

const encode = (value: unknown): unknown =>
  Buffer.isBuffer(value) ? { $base64: value.toString("base64") } : value;
const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;

export class SsiDemoCanonicalSeedExporter {
  export(databasePath: string, outputPath: string): { path: string; sha256: string } {
    const db = new DatabaseSync(resolve(databasePath), { readOnly: true });
    db.exec("PRAGMA query_only=ON");
    try {
      const schema = db
        .prepare(
          "SELECT type,name,tbl_name AS [table],sql FROM sqlite_schema " +
            "WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' " +
            "AND sql IS NOT NULL ORDER BY type DESC,name",
        )
        .all() as unknown as SeedSchemaItem[];
      const tables: Record<string, unknown> = {};
      for (const item of schema.filter((entry) => entry.type === "table")) {
        const columns = (
          db.prepare(`PRAGMA table_info(${quote(item.name)})`).all() as unknown as {
            name: string;
          }[]
        ).map((column) => column.name);
        const projection = columns.map(quote).join(",");
        const ordering = columns.map(quote).join(",");
        const rows = (
          db.prepare(
            `SELECT ${projection} FROM ${quote(item.name)} ORDER BY ${ordering}`,
          ).all() as unknown as JsonObject[]
        ).map((row) => columns.map((column) => encode(row[column])));
        tables[item.name] = { columns, rows };
      }
      const seed = {
        schemaVersion: "1.0",
        fixtureId: "SSI-DEMO-MT1-MT2-PACS008-PACS009-V1",
        classification: "SYNTHETIC_DEMO_QA_UAT",
        warning: "Fictional test data only. Never use for production payments.",
        identityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
        repairSummary: {
          governedContexts: 128,
          generatedSsiRows: 49,
          generatedApplicabilityRows: 128,
          outOfScopeSsiRows: 0,
          virtualNostroMode: "CONTROLLED_VIRTUAL_STUB_ONLY",
          targetLifecycle: "DRAFT",
        },
        schema,
        tables,
      };
      const output = resolve(outputPath);
      mkdirSync(dirname(output), { recursive: true });
      const content = `${JSON.stringify(seed, null, 2)}\n`;
      writeFileSync(output, content, "utf8");
      return { path: output, sha256: sha(content) };
    } finally {
      db.close();
    }
  }
}
