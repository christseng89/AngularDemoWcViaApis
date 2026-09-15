import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const GOVERNED_AUDIT_TABLES = [
  "audit_event",
  "rma_audit_event",
  "nostro_audit_event",
  "booking_branch_entity_audit",
] as const;

export type GovernedAuditTable = (typeof GOVERNED_AUDIT_TABLES)[number];

export interface AuditLifecycleResult {
  archiveCutoffUtc: string;
  archivePurgeCutoffUtc: string;
  archivedByTable: Record<GovernedAuditTable, number>;
  totalArchived: number;
  purgedFromArchive: number;
}

export interface ArchivedAuditEvent {
  sourceTable: GovernedAuditTable;
  sourceRowId: number;
  occurredAt: string;
  archivedAt: string;
  payload: Record<string, unknown>;
  payloadSha256: string;
}

@Injectable()
export class AuditRetentionRepository implements OnModuleDestroy {
  private readonly db: DatabaseSync;

  constructor() {
    const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS audit_event_archive (
      source_table TEXT NOT NULL,
      source_row_id INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL,
      PRIMARY KEY(source_table, source_row_id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_event_archive_occurred_at
      ON audit_event_archive(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_event_archive_archived_at
      ON audit_event_archive(archived_at);`);
  }

  runLifecycle(
    archiveCutoffUtc: string,
    archivePurgeCutoffUtc: string,
    archivedAtUtc: string,
  ): AuditLifecycleResult {
    const archivedByTable = Object.fromEntries(
      GOVERNED_AUDIT_TABLES.map((table) => [table, 0]),
    ) as Record<GovernedAuditTable, number>;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const table of GOVERNED_AUDIT_TABLES) {
        if (!this.tableExists(table)) continue;
        archivedByTable[table] = this.archiveTable(
          table,
          archiveCutoffUtc,
          archivedAtUtc,
        );
      }
      const purgeResult = this.db
        .prepare(
          "DELETE FROM audit_event_archive WHERE julianday(archived_at) < julianday(?)",
        )
        .run(archivePurgeCutoffUtc);
      this.db.exec("COMMIT");
      return {
        archiveCutoffUtc,
        archivePurgeCutoffUtc,
        archivedByTable,
        totalArchived: Object.values(archivedByTable).reduce(
          (sum, value) => sum + value,
          0,
        ),
        purgedFromArchive: Number(purgeResult.changes),
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listArchive(
    sourceTable?: GovernedAuditTable,
    limit = 100,
  ): ArchivedAuditEvent[] {
    const safeLimit = Math.max(1, Math.min(500, limit));
    const rows = sourceTable
      ? this.db
          .prepare(
            `SELECT source_table, source_row_id, occurred_at, archived_at,
                    payload, payload_sha256
               FROM audit_event_archive
              WHERE source_table = ?
              ORDER BY occurred_at DESC
              LIMIT ?`,
          )
          .all(sourceTable, safeLimit)
      : this.db
          .prepare(
            `SELECT source_table, source_row_id, occurred_at, archived_at,
                    payload, payload_sha256
               FROM audit_event_archive
              ORDER BY occurred_at DESC
              LIMIT ?`,
          )
          .all(safeLimit);
    return rows.map((row) => {
      const value = row as Record<string, unknown>;
      return {
        sourceTable: value["source_table"] as GovernedAuditTable,
        sourceRowId: Number(value["source_row_id"]),
        occurredAt: String(value["occurred_at"]),
        archivedAt: String(value["archived_at"]),
        payload: JSON.parse(String(value["payload"])) as Record<
          string,
          unknown
        >,
        payloadSha256: String(value["payload_sha256"]),
      };
    });
  }

  onModuleDestroy(): void {
    this.db.close();
  }

  private tableExists(table: GovernedAuditTable): boolean {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(table),
    );
  }

  private archiveTable(
    table: GovernedAuditTable,
    cutoffUtc: string,
    archivedAtUtc: string,
  ): number {
    const rows = this.db
      .prepare(
        `SELECT rowid AS source_row_id, * FROM ${table}
          WHERE julianday(occurred_at) < julianday(?)
          ORDER BY rowid`,
      )
      .all(cutoffUtc) as Record<string, unknown>[];
    if (rows.length === 0) return 0;
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO audit_event_archive(
         source_table, source_row_id, occurred_at, archived_at, payload, payload_sha256
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const verify = this.db.prepare(
      `SELECT payload_sha256 FROM audit_event_archive
        WHERE source_table = ? AND source_row_id = ?`,
    );
    const remove = this.db.prepare(`DELETE FROM ${table} WHERE rowid = ?`);
    for (const row of rows) {
      const payload = JSON.stringify(row);
      const payloadSha256 = createHash("sha256").update(payload).digest("hex");
      const sourceRowId = Number(row["source_row_id"]);
      insert.run(
        table,
        sourceRowId,
        String(row["occurred_at"]),
        archivedAtUtc,
        payload,
        payloadSha256,
      );
      const archived = verify.get(table, sourceRowId) as
        { payload_sha256: string } | undefined;
      if (archived?.payload_sha256 !== payloadSha256) {
        throw new Error("AUDIT_ARCHIVE_VERIFICATION_FAILED");
      }
      remove.run(sourceRowId);
    }
    return rows.length;
  }
}
