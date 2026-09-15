"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteGovernedRepository = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_sqlite_1 = require("node:sqlite");
const audit_retention_policy_1 = require("../audit-retention/audit-retention.policy");
class SqliteGovernedRepository {
    table;
    auditTable;
    db;
    constructor(table, auditTable) {
        this.table = table;
        this.auditTable = auditTable;
        const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
        this.db = new node_sqlite_1.DatabaseSync(path);
        this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ${auditTable} (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS swift_data_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, aggregate_type TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL);`);
    }
    list() {
        return this.db
            .prepare(`SELECT payload FROM ${this.table} ORDER BY updated_at DESC`)
            .all()
            .map((row) => JSON.parse(String(row.payload)));
    }
    find(id) {
        const row = this.db
            .prepare(`SELECT payload FROM ${this.table} WHERE id=?`)
            .get(id);
        return row ? JSON.parse(String(row.payload)) : undefined;
    }
    save(record, action, actor, aggregateType) {
        const now = new Date().toISOString();
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db
                .prepare(`INSERT INTO ${this.table}(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
                .run(record.id, JSON.stringify(record), now);
            this.db
                .prepare(`INSERT INTO ${this.auditTable}(record_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)`)
                .run(record.id, action, actor, JSON.stringify(record), now);
            this.db
                .prepare("INSERT INTO swift_data_outbox(event_id,aggregate_type,event_type,payload,created_at) VALUES(?,?,?,?,?)")
                .run((0, node_crypto_1.randomUUID)(), aggregateType, `${aggregateType}_${action}`, JSON.stringify(record), now);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    audit() {
        return this.db
            .prepare(`SELECT * FROM ${this.auditTable} WHERE julianday(occurred_at) >= julianday(?) ORDER BY id DESC`)
            .all((0, audit_retention_policy_1.onlineAuditCutoffUtc)());
    }
    onModuleDestroy() {
        this.db.close();
    }
}
exports.SqliteGovernedRepository = SqliteGovernedRepository;
//# sourceMappingURL=sqlite-governed.repository.js.map