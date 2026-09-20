import { OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { onlineAuditCutoffUtc } from "../audit-retention/audit-retention.policy";
import {
  currentStatusProjection,
  type CurrentStatus,
  type OpenRevisionChangeType,
  type OpenRevisionStatus,
} from "./current-status-projection";
import { maintenanceIndexStatuses } from "./maintenance-index-status";

export interface GovernedRecord {
  id: string;
  maker: string;
  checker?: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  hasOpenRevision?: boolean;
  openRevisionId?: string;
  openRevisionStatus?: "WIP" | "DRAFT" | "PENDING_APPROVAL" | "APPROVED";
  openRevisionChangeType?: OpenRevisionChangeType;
  currentStatus?: CurrentStatus;
  revisionWipExpiresAt?: string;
  amendmentOfId?: string;
  changeType?: "REVISION" | "SUPPRESSION";
  suppressionReason?: string;
  rejectionReason?: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface PageRequest {
  status?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

function revisionWipTtlMinutes(): number {
  const configured = Number(process.env["REVISION_WIP_TTL_MINUTES"] ?? "30");
  return Number.isFinite(configured) && configured > 0 ? configured : 30;
}

export function revisionWipExpiresAt(now = new Date()): string {
  return new Date(
    now.getTime() + revisionWipTtlMinutes() * 60_000,
  ).toISOString();
}

export function revisionWipCutoffAt(now = new Date()): string {
  return new Date(
    now.getTime() - revisionWipTtlMinutes() * 60_000,
  ).toISOString();
}

export abstract class SqliteGovernedRepository<
  T extends GovernedRecord,
> implements OnModuleDestroy {
  protected readonly db: DatabaseSync;
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
      CREATE INDEX IF NOT EXISTS idx_${table}_updated_at ON ${table}(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_${table}_status_updated_at ON ${table}(
        json_extract(payload,'$.status'), updated_at DESC
      );
      CREATE INDEX IF NOT EXISTS idx_${table}_status_updated_id_v2 ON ${table}(
        json_extract(payload,'$.status'), updated_at DESC, id DESC
      );
      CREATE INDEX IF NOT EXISTS idx_${table}_amendment_status ON ${table}(
        json_extract(payload,'$.amendmentOfId'), json_extract(payload,'$.status')
      );
      CREATE TABLE IF NOT EXISTS ${auditTable} (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS swift_data_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, aggregate_type TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL);`);
  }
  list(status?: string): T[] {
    this.expireRevisionWorkInProgress();
    const openRevision = `(
      SELECT json_object(
        'id', revision.id,
        'status', json_extract(revision.payload,'$.status'),
        'changeType', COALESCE(json_extract(revision.payload,'$.changeType'),'REVISION')
      ) FROM ${this.table} revision
      WHERE json_extract(revision.payload,'$.amendmentOfId')=base.id
        AND json_extract(revision.payload,'$.status') IN ('WIP','DRAFT','PENDING_APPROVAL','APPROVED')
      ORDER BY CASE json_extract(revision.payload,'$.status')
        WHEN 'APPROVED' THEN 4
        WHEN 'PENDING_APPROVAL' THEN 3
        WHEN 'DRAFT' THEN 2
        ELSE 1
      END DESC, revision.updated_at DESC
      LIMIT 1
    )`;
    const sql = status
      ? `SELECT base.payload, ${openRevision} AS open_revision FROM ${this.table} base WHERE json_extract(base.payload,'$.status')=? ORDER BY base.updated_at DESC`
      : `SELECT base.payload, ${openRevision} AS open_revision FROM ${this.table} base ORDER BY base.updated_at DESC`;
    return this.db
      .prepare(sql)
      .all(...(status ? [status] : []))
      .map((row) => {
        const value = row as { payload: unknown; open_revision?: string };
        const revision = value.open_revision
          ? (JSON.parse(value.open_revision) as {
              id: string;
              status: OpenRevisionStatus;
              changeType: OpenRevisionChangeType;
            })
          : undefined;
        return {
          ...(JSON.parse(String(value.payload)) as T),
          ...currentStatusProjection(revision),
        };
      });
  }
  find(id: string): T | undefined {
    const row = this.db
      .prepare(`SELECT payload FROM ${this.table} WHERE id=?`)
      .get(id) as { payload: unknown } | undefined;
    return row ? (JSON.parse(String(row.payload)) as T) : undefined;
  }
  save(
    record: T,
    action: string,
    actor: string,
    aggregateType: string,
    auditPayload: unknown = record,
  ): void {
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
        .run(record.id, action, actor, JSON.stringify(auditPayload), now);
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
  protected queryRows(
    sql: string,
    ...parameters: (string | number | null)[]
  ): Record<string, unknown>[] {
    return this.db.prepare(sql).all(...parameters) as Record<string, unknown>[];
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
  saveRevisionWorkInProgress(
    record: T,
    actor: string,
    aggregateType: string,
    action = "WIP_RESERVED",
  ): boolean {
    if (!record.amendmentOfId) return false;
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const source = this.find(record.amendmentOfId);
      const conflict = this.db
        .prepare(
          `SELECT 1 AS found FROM ${this.table}
           WHERE json_extract(payload,'$.amendmentOfId')=?
             AND (
               json_extract(payload,'$.status') IN ('DRAFT','PENDING_APPROVAL','APPROVED')
               OR (
                 json_extract(payload,'$.status')='WIP'
                 AND json_extract(payload,'$.revisionWipExpiresAt')>?
               )
             )
           LIMIT 1`,
        )
        .get(record.amendmentOfId, now) as { found: number } | undefined;
      if (
        !source ||
        !["ACTIVE", "APPROVED"].includes(source.status) ||
        conflict
      ) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db
        .prepare(
          `INSERT INTO ${this.table}(id,payload,updated_at) VALUES(?,?,?)`,
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
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  approveSuppression(
    id: string,
    actor: string,
    aggregateType: string,
  ): T | undefined {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const requestRow = this.db
        .prepare(`SELECT payload FROM ${this.table} WHERE id=?`)
        .get(id) as { payload: unknown } | undefined;
      const request = requestRow
        ? (JSON.parse(String(requestRow.payload)) as T)
        : undefined;
      const sourceRow = request?.amendmentOfId
        ? (this.db
            .prepare(`SELECT payload FROM ${this.table} WHERE id=?`)
            .get(request.amendmentOfId) as { payload: unknown } | undefined)
        : undefined;
      const source = sourceRow
        ? (JSON.parse(String(sourceRow.payload)) as T)
        : undefined;
      if (
        !request ||
        request.changeType !== "SUPPRESSION" ||
        request.status !== "PENDING_APPROVAL" ||
        (request.suppressionReason?.trim().length ?? 0) < 5 ||
        request.maker === actor ||
        !source ||
        source.status !== "ACTIVE"
      ) {
        this.db.exec("ROLLBACK");
        return undefined;
      }
      const superseded = {
        ...source,
        status: "SUPERSEDED",
        version: source.version + 1,
        updatedAt: now,
      } as T;
      const suppressed = {
        ...request,
        status: "SUPPRESSED",
        checker: actor,
        version: request.version + 1,
        updatedAt: now,
      } as T;
      for (const [record, action] of [
        [superseded, "SUPERSEDED"],
        [suppressed, "SUPPRESSION_APPROVED"],
      ] as const) {
        const messageTypeChanges = (
          record as T & { messageTypeChanges?: unknown }
        ).messageTypeChanges;
        const auditPayload =
          action === "SUPPRESSION_APPROVED" && messageTypeChanges
            ? {
                before: source,
                after: suppressed,
                changedFields: { messageTypes: messageTypeChanges },
                provenance: {
                  requestType: "SUPPRESSED",
                  amendmentOfId: request.amendmentOfId,
                },
              }
            : record;
        this.db
          .prepare(
            `INSERT INTO ${this.table}(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,
          )
          .run(record.id, JSON.stringify(record), now);
        this.db
          .prepare(
            `INSERT INTO ${this.auditTable}(record_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)`,
          )
          .run(record.id, action, actor, JSON.stringify(auditPayload), now);
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
      }
      this.db.exec("COMMIT");
      return suppressed;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  listPage(request: PageRequest): PagedResult<T> {
    this.expireRevisionWorkInProgress();
    const page = Math.max(1, Math.trunc(request.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.trunc(request.pageSize ?? 20)),
    );
    const clauses: string[] = [];
    const parameters: (string | number)[] = [];
    const statuses = maintenanceIndexStatuses(request.status);
    clauses.push(
      `json_extract(payload,'$.status') IN (${statuses.map(() => "?").join(",")})`,
    );
    parameters.push(...statuses);
    const search = request.search?.trim();
    if (search) {
      clauses.push("payload LIKE ? ESCAPE '\\'");
      parameters.push(
        `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
      );
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const totalItems = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS count FROM ${this.table}${where}`)
          .get(...parameters) as { count: number }
      ).count,
    );
    const items = this.db
      .prepare(
        `SELECT base.payload,
          (
            SELECT json_object(
              'id', revision.id,
              'status', json_extract(revision.payload,'$.status'),
              'changeType', COALESCE(json_extract(revision.payload,'$.changeType'),'REVISION')
            ) FROM ${this.table} revision
            WHERE json_extract(revision.payload,'$.amendmentOfId')=base.id
              AND json_extract(revision.payload,'$.status') IN ('WIP','DRAFT','PENDING_APPROVAL','APPROVED')
            ORDER BY CASE json_extract(revision.payload,'$.status')
              WHEN 'APPROVED' THEN 4
              WHEN 'PENDING_APPROVAL' THEN 3
              WHEN 'DRAFT' THEN 2
              ELSE 1
            END DESC, revision.updated_at DESC
            LIMIT 1
          ) AS open_revision
         FROM ${this.table} base${where}
         ORDER BY base.updated_at DESC, base.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...parameters, pageSize, (page - 1) * pageSize)
      .map((row) => {
        const rawOpenRevision = (row as { open_revision?: string })
          .open_revision;
        const openRevision = rawOpenRevision
          ? (JSON.parse(rawOpenRevision) as {
              id: string;
              status: OpenRevisionStatus;
              changeType: OpenRevisionChangeType;
            })
          : undefined;
        return {
          ...(JSON.parse(String((row as { payload: unknown }).payload)) as T),
          ...currentStatusProjection(openRevision),
        };
      });
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
    };
  }
  hasOpenRevision(id: string): boolean {
    this.expireRevisionWorkInProgress();
    const row = this.db
      .prepare(
        `SELECT 1 AS found FROM ${this.table}
         WHERE json_extract(payload,'$.amendmentOfId')=?
           AND json_extract(payload,'$.status') IN ('WIP','DRAFT','PENDING_APPROVAL','APPROVED')
         LIMIT 1`,
      )
      .get(id) as { found: number } | undefined;
    return row?.found === 1;
  }
  protected expireRevisionWorkInProgress(): void {
    const now = new Date();
    const expired = this.selectPayloads(
      `SELECT payload FROM ${this.table}
       WHERE json_extract(payload,'$.status')='WIP'
         AND (json_extract(payload,'$.revisionWipExpiresAt')<=?
           OR updated_at<=?)`,
      now.toISOString(),
      revisionWipCutoffAt(now),
    );
    for (const record of expired) {
      const cancelled = {
        ...record,
        status: "REVOKED",
        revokeReason: "Revision WIP expired",
        updatedAt: new Date().toISOString(),
      } as T;
      delete cancelled.revisionWipExpiresAt;
      this.save(cancelled, "WIP_EXPIRED", "system.scheduler", "GOVERNED");
    }
  }
  explainList(status?: string): string[] {
    const sql = status
      ? `SELECT payload FROM ${this.table} WHERE json_extract(payload,'$.status')=? ORDER BY updated_at DESC`
      : `SELECT payload FROM ${this.table} ORDER BY updated_at DESC`;
    return this.explainQueryPlan(sql, ...(status ? [status] : []));
  }
  explainListPage(status: string): string[] {
    return this.explainQueryPlan(
      `SELECT base.payload FROM ${this.table} base
       WHERE json_extract(base.payload,'$.status')=?
       ORDER BY base.updated_at DESC, base.id DESC LIMIT ? OFFSET ?`,
      status,
      20,
      0,
    );
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
