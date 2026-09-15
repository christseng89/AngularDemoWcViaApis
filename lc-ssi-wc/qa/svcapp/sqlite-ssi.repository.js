"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteSsiRepository = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_sqlite_1 = require("node:sqlite");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const audit_retention_policy_1 = require("./audit-retention/audit-retention.policy");
let SqliteSsiRepository = class SqliteSsiRepository {
    db;
    constructor() {
        const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
        this.db = new node_sqlite_1.DatabaseSync(path);
        this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS ssi (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ssi_applicability (id TEXT PRIMARY KEY, ssi_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_ssi_applicability_ssi_id ON ssi_applicability(ssi_id);
      CREATE TABLE IF NOT EXISTS audit_event (id INTEGER PRIMARY KEY AUTOINCREMENT, ssi_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inbox (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TEXT NOT NULL);`);
    }
    list() {
        return this.db
            .prepare("SELECT payload FROM ssi ORDER BY updated_at DESC")
            .all()
            .map((row) => JSON.parse(String(row.payload)));
    }
    find(id) {
        const row = this.db
            .prepare("SELECT payload FROM ssi WHERE id=?")
            .get(id);
        return row ? JSON.parse(String(row.payload)) : undefined;
    }
    listApplicability(ssiId) {
        const rows = ssiId
            ? this.db
                .prepare("SELECT payload FROM ssi_applicability WHERE ssi_id=? ORDER BY id")
                .all(ssiId)
            : this.db
                .prepare("SELECT payload FROM ssi_applicability ORDER BY ssi_id,id")
                .all();
        return rows.map((row) => JSON.parse(String(row.payload)));
    }
    replaceApplicability(ssiId, inputs, actor) {
        const now = new Date().toISOString();
        const previous = this.listApplicability(ssiId);
        const version = Math.max(0, ...previous.map((item) => item.version)) + 1;
        const records = inputs.map((input, index) => ({
            ...input,
            id: `${ssiId}:APPL:${index + 1}`,
            ssiId,
            version,
            createdAt: now,
            updatedAt: now,
        }));
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db
                .prepare("DELETE FROM ssi_applicability WHERE ssi_id=?")
                .run(ssiId);
            const insert = this.db.prepare("INSERT INTO ssi_applicability(id,ssi_id,payload,updated_at) VALUES(?,?,?,?)");
            for (const record of records)
                insert.run(record.id, ssiId, JSON.stringify(record), now);
            this.db
                .prepare("INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)")
                .run(ssiId, "APPLICABILITY_REPLACED", actor, JSON.stringify(records), now);
            this.db
                .prepare("INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)")
                .run((0, node_crypto_1.randomUUID)(), "SSI_APPLICABILITY_REPLACED", JSON.stringify({ ssiId, records }), now);
            this.db.exec("COMMIT");
            return records;
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    save(record, action, actor) {
        const now = new Date().toISOString();
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db
                .prepare("INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
                .run(record.id, JSON.stringify(record), now);
            this.db
                .prepare("INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)")
                .run(record.id, action, actor, JSON.stringify(record), now);
            this.db
                .prepare("INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)")
                .run((0, node_crypto_1.randomUUID)(), `SSI_${action}`, JSON.stringify(record), now);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    audit() {
        return this.db
            .prepare("SELECT * FROM audit_event WHERE julianday(occurred_at) >= julianday(?) ORDER BY id DESC")
            .all((0, audit_retention_policy_1.onlineAuditCutoffUtc)());
    }
    onModuleDestroy() {
        this.db.close();
    }
};
exports.SqliteSsiRepository = SqliteSsiRepository;
exports.SqliteSsiRepository = SqliteSsiRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], SqliteSsiRepository);
//# sourceMappingURL=sqlite-ssi.repository.js.map