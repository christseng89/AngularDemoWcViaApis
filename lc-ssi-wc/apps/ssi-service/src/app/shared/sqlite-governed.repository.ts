import { OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { onlineAuditCutoffUtc } from "../audit-retention/audit-retention.policy";

export interface GovernedRecord {
  id: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export abstract class SqliteGovernedRepository<
  T extends GovernedRecord,
> implements OnModuleDestroy {
  private readonly db: DatabaseSync;
  protected constructor(
    private readonly table: string,
    private readonly auditTable: string,
  ) {
    const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ${auditTable} (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS swift_data_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, aggregate_type TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL);`);
  }
  list(): T[] {
    return this.db
      .prepare(`SELECT payload FROM ${this.table} ORDER BY updated_at DESC`)
      .all()
      .map(
        (row) => JSON.parse(String((row as { payload: unknown }).payload)) as T,
      );
  }
  find(id: string): T | undefined {
    const row = this.db
      .prepare(`SELECT payload FROM ${this.table} WHERE id=?`)
      .get(id) as { payload: unknown } | undefined;
    return row ? (JSON.parse(String(row.payload)) as T) : undefined;
  }
  save(record: T, action: string, actor: string, aggregateType: string): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO ${this.table}(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,
        )
        .run(record.id, JSON.stringify(record), now);
      this.db
        .prepare(
          `INSERT INTO ${this.auditTable}(record_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)`,
        )
        .run(record.id, action, actor, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO swift_data_outbox(event_id,aggregate_type,event_type,payload,created_at) VALUES(?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          aggregateType,
          `${aggregateType}_${action}`,
          JSON.stringify(record),
          now,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  audit(): unknown[] {
    return this.db
      .prepare(
        `SELECT * FROM ${this.auditTable} WHERE julianday(occurred_at) >= julianday(?) ORDER BY id DESC`,
      )
      .all(onlineAuditCutoffUtc());
  }
  protected executeSchema(sql: string): void {
    this.db.exec(sql);
  }
  protected selectPayloads(
    sql: string,
    ...parameters: (string | number | null)[]
  ): T[] {
    return this.db
      .prepare(sql)
      .all(...parameters)
      .map(
        (row) => JSON.parse(String((row as { payload: unknown }).payload)) as T,
      );
  }
  protected tableIndexNames(): string[] {
    return this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? ORDER BY name",
      )
      .all(this.table)
      .map((row) => String((row as { name: unknown }).name));
  }
  protected explainQueryPlan(
    sql: string,
    ...parameters: (string | number | null)[]
  ): string[] {
    return this.db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...parameters)
      .map((row) => String((row as { detail: unknown }).detail));
  }
  busyTimeoutMs(): number {
    const row = this.db.prepare("PRAGMA busy_timeout").get() as
      { timeout: number } | undefined;
    return Number(row?.timeout ?? 0);
  }
  onModuleDestroy(): void {
    this.db.close();
  }
}
