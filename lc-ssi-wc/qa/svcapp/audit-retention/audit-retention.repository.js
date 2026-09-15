"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRetentionRepository = exports.GOVERNED_AUDIT_TABLES = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_sqlite_1 = require("node:sqlite");
exports.GOVERNED_AUDIT_TABLES = [
    "audit_event",
    "rma_audit_event",
    "nostro_audit_event",
    "booking_branch_entity_audit",
];
let AuditRetentionRepository = class AuditRetentionRepository {
    db;
    constructor() {
        const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
        this.db = new node_sqlite_1.DatabaseSync(path);
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
    runLifecycle(archiveCutoffUtc, archivePurgeCutoffUtc, archivedAtUtc) {
        const archivedByTable = Object.fromEntries(exports.GOVERNED_AUDIT_TABLES.map((table) => [table, 0]));
        this.db.exec("BEGIN IMMEDIATE");
        try {
            for (const table of exports.GOVERNED_AUDIT_TABLES) {
                if (!this.tableExists(table))
                    continue;
                archivedByTable[table] = this.archiveTable(table, archiveCutoffUtc, archivedAtUtc);
            }
            const purgeResult = this.db
                .prepare("DELETE FROM audit_event_archive WHERE julianday(archived_at) < julianday(?)")
                .run(archivePurgeCutoffUtc);
            this.db.exec("COMMIT");
            return {
                archiveCutoffUtc,
                archivePurgeCutoffUtc,
                archivedByTable,
                totalArchived: Object.values(archivedByTable).reduce((sum, value) => sum + value, 0),
                purgedFromArchive: Number(purgeResult.changes),
            };
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    listArchive(sourceTable, limit = 100) {
        const safeLimit = Math.max(1, Math.min(500, limit));
        const rows = sourceTable
            ? this.db
                .prepare(`SELECT source_table, source_row_id, occurred_at, archived_at,
                    payload, payload_sha256
               FROM audit_event_archive
              WHERE source_table = ?
              ORDER BY occurred_at DESC
              LIMIT ?`)
                .all(sourceTable, safeLimit)
            : this.db
                .prepare(`SELECT source_table, source_row_id, occurred_at, archived_at,
                    payload, payload_sha256
               FROM audit_event_archive
              ORDER BY occurred_at DESC
              LIMIT ?`)
                .all(safeLimit);
        return rows.map((row) => {
            const value = row;
            return {
                sourceTable: value["source_table"],
                sourceRowId: Number(value["source_row_id"]),
                occurredAt: String(value["occurred_at"]),
                archivedAt: String(value["archived_at"]),
                payload: JSON.parse(String(value["payload"])),
                payloadSha256: String(value["payload_sha256"]),
            };
        });
    }
    onModuleDestroy() {
        this.db.close();
    }
    tableExists(table) {
        return Boolean(this.db
            .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(table));
    }
    archiveTable(table, cutoffUtc, archivedAtUtc) {
        const rows = this.db
            .prepare(`SELECT rowid AS source_row_id, * FROM ${table}
          WHERE julianday(occurred_at) < julianday(?)
          ORDER BY rowid`)
            .all(cutoffUtc);
        if (rows.length === 0)
            return 0;
        const insert = this.db.prepare(`INSERT OR IGNORE INTO audit_event_archive(
         source_table, source_row_id, occurred_at, archived_at, payload, payload_sha256
       ) VALUES (?, ?, ?, ?, ?, ?)`);
        const verify = this.db.prepare(`SELECT payload_sha256 FROM audit_event_archive
        WHERE source_table = ? AND source_row_id = ?`);
        const remove = this.db.prepare(`DELETE FROM ${table} WHERE rowid = ?`);
        for (const row of rows) {
            const payload = JSON.stringify(row);
            const payloadSha256 = (0, node_crypto_1.createHash)("sha256").update(payload).digest("hex");
            const sourceRowId = Number(row["source_row_id"]);
            insert.run(table, sourceRowId, String(row["occurred_at"]), archivedAtUtc, payload, payloadSha256);
            const archived = verify.get(table, sourceRowId);
            if (archived?.payload_sha256 !== payloadSha256) {
                throw new Error("AUDIT_ARCHIVE_VERIFICATION_FAILED");
            }
            remove.run(sourceRowId);
        }
        return rows.length;
    }
};
exports.AuditRetentionRepository = AuditRetentionRepository;
exports.AuditRetentionRepository = AuditRetentionRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], AuditRetentionRepository);
//# sourceMappingURL=audit-retention.repository.js.map