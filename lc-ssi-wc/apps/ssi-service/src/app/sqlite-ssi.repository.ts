import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { onlineAuditCutoffUtc } from "./audit-retention/audit-retention.policy";
import {
  revisionWipCutoffAt,
  type PagedResult,
} from "./shared/sqlite-governed.repository";

export interface SsiRecord {
  id: string;
  counterpartyId: string;
  scope: string;
  maker: string;
  checker?: string;
  status: string;
  version: number;
  route: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  ownershipType?: "OWN" | "COUNTERPARTY";
  ownerParty?: string;
  publisherParty?: string;
  revokeReason?: string;
  rejectionReason?: string;
  amendmentOfId?: string;
  revisionWipExpiresAt?: string;
  changeType?: "REVISION" | "SUPPRESSION";
  suppressionReason?: string;
  hasOpenRevision?: boolean;
  openRevisionId?: string;
  openRevisionStatus?: "WIP" | "DRAFT" | "PENDING_APPROVAL" | "APPROVED";
  fixtureFamily?: string;
  usageGroup?: string;
  fixtureBindingIds?: string[];
}
export interface SsiPageRequest {
  status?: string;
  ownershipType?: "OWN" | "COUNTERPARTY";
  counterpartyId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
}

export interface SsiIndexSummary {
  currentOwn: number;
  pendingApproval: number;
  active: number;
  archived: number;
}
export interface CounterpartySsiCoverage {
  counterpartyId: string;
  ssiCount: number;
  currencyCount: number;
  statuses: readonly string[];
  lastVerified: string;
}
export interface SsiApplicabilityRecord {
  id: string;
  ssiId: string;
  consumer: string;
  product: string;
  businessFunction: string;
  paymentLeg: string;
  direction: string;
  status: "ACTIVE" | "INACTIVE";
  validFrom: string;
  validTo: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  fixtureBindingIds?: string[];
}
export type SsiApplicabilityInput = Omit<
  SsiApplicabilityRecord,
  "id" | "ssiId" | "version" | "createdAt" | "updatedAt"
>;

export interface PaymentSsiCandidateQuery {
  readonly sourceMessageType: string;
  readonly messageType: string;
  readonly businessService: string;
  readonly valueDate: string;
  readonly currency?: string;
  readonly bookingEntity?: string;
  readonly fixtureBindingId?: string;
}
export interface PaymentSsiCandidateBinding {
  readonly ssi: SsiRecord;
  readonly applicability: SsiApplicabilityRecord;
}

export interface FinControlledFixtureRepositoryQuery {
  readonly messageType: string;
  readonly sequence?: string;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
  readonly bindingId?: string;
  readonly includeFixtureGroup?: boolean;
}

export interface FinControlledFixtureRepositoryRow {
  readonly ssi: SsiRecord;
  readonly applicability: SsiApplicabilityRecord;
}

@Injectable()
export class SqliteSsiRepository implements OnModuleDestroy {
  private readonly db: DatabaseSync;
  constructor() {
    const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS ssi (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_ssi_updated_at ON ssi(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ssi_status_updated_at ON ssi(
        json_extract(payload,'$.status'), updated_at DESC
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_status_ownership_updated_id_v2 ON ssi(
        json_extract(payload,'$.status'),
        json_extract(payload,'$.ownershipType'),
        updated_at DESC,
        id DESC
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_amendment_status ON ssi(
        json_extract(payload,'$.amendmentOfId'), json_extract(payload,'$.status')
      );
      CREATE TABLE IF NOT EXISTS ssi_applicability (id TEXT PRIMARY KEY, ssi_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_ssi_applicability_ssi_id ON ssi_applicability(ssi_id);
      CREATE INDEX IF NOT EXISTS idx_ssi_operational_lookup ON ssi(
        json_extract(payload,'$.status'),
        json_extract(payload,'$.route.routePurpose'),
        json_extract(payload,'$.route.currency'),
        json_extract(payload,'$.route.bookingEntity')
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_applicability_lookup ON ssi_applicability(
        json_extract(payload,'$.status'),
        json_extract(payload,'$.consumer'),
        json_extract(payload,'$.product'),
        json_extract(payload,'$.businessFunction'),
        json_extract(payload,'$.paymentLeg'),
        json_extract(payload,'$.direction'),
        ssi_id
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_fin_fixture_lookup ON ssi(
        json_extract(payload,'$.fixtureFamily'),
        json_extract(payload,'$.status'),
        json_extract(payload,'$.route.currency'),
        json_extract(payload,'$.route.bookingEntity'),
        json_extract(payload,'$.fixtureBindingId')
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_applicability_fin_fixture_lookup ON ssi_applicability(
        json_extract(payload,'$.fixtureFamily'),
        json_extract(payload,'$.status'),
        json_extract(payload,'$.messageType'),
        json_extract(payload,'$.sequence'),
        json_extract(payload,'$.currency'),
        json_extract(payload,'$.fixtureBindingId'),
        ssi_id
      );
      CREATE TABLE IF NOT EXISTS audit_event (id INTEGER PRIMARY KEY AUTOINCREMENT, ssi_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inbox (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TEXT NOT NULL);`);
  }
  list(status?: string): SsiRecord[] {
    this.expireRevisionWorkInProgress();
    const openRevisionSql = this.openRevisionSelectSql("base");
    const sql = status
      ? `SELECT base.payload, ${openRevisionSql} AS open_revision FROM ssi base WHERE json_extract(base.payload,'$.status')=? ORDER BY base.updated_at DESC`
      : `SELECT base.payload, ${openRevisionSql} AS open_revision FROM ssi base ORDER BY base.updated_at DESC`;
    return this.db
      .prepare(sql)
      .all(...(status ? [status] : []))
      .map((row) => this.withOpenRevision(row));
  }

  listPage(
    request: SsiPageRequest,
  ): PagedResult<SsiRecord> & { distinctCurrencyCount: number } {
    this.expireRevisionWorkInProgress();
    const page = Math.max(1, Math.trunc(request.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.trunc(request.pageSize ?? 20)),
    );
    const clauses: string[] = [];
    const parameters: Array<string | number> = [];
    const ownershipExpression = `COALESCE(
      json_extract(payload,'$.ownershipType'),
      CASE
        WHEN json_extract(payload,'$.counterpartyId')='ANY'
          OR json_extract(payload,'$.route.counterpartyBic')='ANY' THEN 'OWN'
        ELSE 'COUNTERPARTY'
      END
    )`;
    if (request.status && request.status !== "ALL") {
      clauses.push("json_extract(payload,'$.status')=?");
      parameters.push(request.status);
    }
    if (request.ownershipType) {
      clauses.push(`${ownershipExpression}=?`);
      parameters.push(request.ownershipType);
    }
    if (request.counterpartyId?.trim()) {
      clauses.push(
        "COALESCE(json_extract(payload,'$.route.counterpartyBic'),json_extract(payload,'$.ownerParty'),json_extract(payload,'$.counterpartyId'))=?",
      );
      parameters.push(request.counterpartyId.trim());
    }
    const search = request.search?.trim();
    if (search) {
      clauses.push("payload LIKE ? ESCAPE '\\'");
      parameters.push(
        `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
      );
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const sortExpressions: Readonly<Record<string, string>> = {
      SSI_ID: "json_extract(payload,'$.counterpartyId')",
      BOOKING_ENTITY: "json_extract(payload,'$.route.bookingEntity')",
      ACCOUNT_SERVICER: "json_extract(payload,'$.route.accountWithBic')",
      ACCOUNT_REF: "json_extract(payload,'$.route.accountId')",
      CURRENCY: "json_extract(payload,'$.route.currency')",
      USE_CASE: "json_extract(payload,'$.route.businessFunction')",
      INSTRUCTED_ROUTE: "json_extract(payload,'$.route.accountWithBic')",
      ROUTE_PRIORITY:
        "CAST(COALESCE(json_extract(payload,'$.route.priority'),'999999') AS INTEGER)",
      EFFECTIVE_PERIOD: "json_extract(payload,'$.route.validFrom')",
      STATUS: "json_extract(payload,'$.status')",
      VERSION: "CAST(json_extract(payload,'$.version') AS INTEGER)",
      REQUEST_TYPE: `COALESCE(json_extract(payload,'$.changeType'),CASE WHEN json_extract(payload,'$.amendmentOfId') IS NOT NULL THEN 'REVISION' ELSE 'NEW' END)`,
      REVISION_STATUS: `COALESCE(json_extract(${this.openRevisionSelectSql("base")},'$.status'),'')`,
      SUBMIT:
        "CASE WHEN json_extract(payload,'$.status')='DRAFT' THEN 1 ELSE 0 END",
      EDIT_REVISE: `CASE WHEN json_extract(payload,'$.status')='DRAFT' OR (json_extract(payload,'$.status')='ACTIVE' AND ${this.openRevisionSelectSql("base")} IS NULL) THEN 1 ELSE 0 END`,
      SUPPRESS: `CASE WHEN json_extract(payload,'$.status')='ACTIVE' AND ${this.openRevisionSelectSql("base")} IS NULL THEN 1 ELSE 0 END`,
      REVOKE_DRAFT:
        "CASE WHEN json_extract(payload,'$.status')='DRAFT' THEN 1 ELSE 0 END",
    };
    const sortExpression =
      sortExpressions[request.sortBy ?? ""] ?? "updated_at";
    const sortDirection = request.sortDirection === "ASC" ? "ASC" : "DESC";
    const totalItems = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS count FROM ssi${where}`)
          .get(...parameters) as { count: number }
      ).count,
    );
    const distinctCurrencyCount = Number(
      (
        this.db
          .prepare(
            `SELECT COUNT(DISTINCT NULLIF(json_extract(payload,'$.route.currency'),'')) AS count FROM ssi${where}`,
          )
          .get(...parameters) as { count: number }
      ).count,
    );
    const items = this.db
      .prepare(
        `SELECT base.payload, ${this.openRevisionSelectSql("base")} AS open_revision
         FROM ssi base${where}
         ORDER BY ${sortExpression} ${sortDirection}, id ${sortDirection}
         LIMIT ? OFFSET ?`,
      )
      .all(...parameters, pageSize, (page - 1) * pageSize)
      .map((row) => this.withOpenRevision(row));
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
      distinctCurrencyCount,
    };
  }

  counterpartyCoverage(status = "ACTIVE"): readonly CounterpartySsiCoverage[] {
    const ownershipExpression = `COALESCE(
      json_extract(payload,'$.ownershipType'),
      CASE
        WHEN json_extract(payload,'$.counterpartyId')='ANY'
          OR json_extract(payload,'$.route.counterpartyBic')='ANY' THEN 'OWN'
        ELSE 'COUNTERPARTY'
      END
    )`;
    const counterpartyExpression = `COALESCE(
      NULLIF(json_extract(payload,'$.route.counterpartyBic'),''),
      NULLIF(json_extract(payload,'$.ownerParty'),''),
      NULLIF(json_extract(payload,'$.counterpartyId'),'')
    )`;
    const statusClause =
      status && status !== "ALL"
        ? "AND json_extract(payload,'$.status')=?"
        : "AND json_extract(payload,'$.status')<>'REVOKED'";
    const parameters = status && status !== "ALL" ? [status] : [];
    return this.db
      .prepare(
        `SELECT
           ${counterpartyExpression} AS counterparty_id,
           COUNT(*) AS ssi_count,
           COUNT(DISTINCT NULLIF(json_extract(payload,'$.route.currency'),'')) AS currency_count,
           GROUP_CONCAT(DISTINCT json_extract(payload,'$.status')) AS statuses,
           MAX(updated_at) AS last_verified
         FROM ssi
         WHERE ${ownershipExpression}='COUNTERPARTY'
           ${statusClause}
           AND ${counterpartyExpression} IS NOT NULL
         GROUP BY ${counterpartyExpression}
         ORDER BY ${counterpartyExpression}`,
      )
      .all(...parameters)
      .map((row) => {
        const value = row as Record<string, string | number | null>;
        return {
          counterpartyId: String(value["counterparty_id"] ?? ""),
          ssiCount: Number(value["ssi_count"] ?? 0),
          currencyCount: Number(value["currency_count"] ?? 0),
          statuses: String(value["statuses"] ?? "")
            .split(",")
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right)),
          lastVerified: String(value["last_verified"] ?? ""),
        };
      });
  }

  summary(): SsiIndexSummary {
    const row = this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN json_extract(payload,'$.status')='ACTIVE'
            AND COALESCE(json_extract(payload,'$.ownershipType'),
              CASE WHEN json_extract(payload,'$.counterpartyId')='ANY'
                OR json_extract(payload,'$.route.counterpartyBic')='ANY'
                THEN 'OWN' ELSE 'COUNTERPARTY' END
            )='OWN' THEN 1 ELSE 0 END) AS current_own,
          SUM(CASE WHEN json_extract(payload,'$.status')='PENDING_APPROVAL' THEN 1 ELSE 0 END) AS pending_approval,
          SUM(CASE WHEN json_extract(payload,'$.status')='ACTIVE' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN json_extract(payload,'$.status') IN ('REVOKED','SUPERSEDED','SUPPRESSED') THEN 1 ELSE 0 END) AS archived
         FROM ssi`,
      )
      .get() as {
      current_own: number | null;
      pending_approval: number | null;
      active: number | null;
      archived: number | null;
    };
    return {
      currentOwn: Number(row.current_own ?? 0),
      pendingApproval: Number(row.pending_approval ?? 0),
      active: Number(row.active ?? 0),
      archived: Number(row.archived ?? 0),
    };
  }

  hasOpenRevision(id: string): boolean {
    this.expireRevisionWorkInProgress();
    const row = this.db
      .prepare(
        `SELECT 1 AS found FROM ssi
         WHERE json_extract(payload,'$.amendmentOfId')=?
           AND json_extract(payload,'$.status') IN ('WIP','DRAFT','PENDING_APPROVAL','APPROVED')
         LIMIT 1`,
      )
      .get(id) as { found: number } | undefined;
    return row?.found === 1;
  }

  private openRevisionSelectSql(baseAlias: string): string {
    return `(
      SELECT json_object(
        'id', revision.id,
        'status', json_extract(revision.payload,'$.status')
      )
      FROM ssi revision
      WHERE json_extract(revision.payload,'$.amendmentOfId')=${baseAlias}.id
        AND json_extract(revision.payload,'$.status') IN ('WIP','DRAFT','PENDING_APPROVAL','APPROVED')
      ORDER BY CASE json_extract(revision.payload,'$.status')
        WHEN 'APPROVED' THEN 4
        WHEN 'PENDING_APPROVAL' THEN 3
        WHEN 'DRAFT' THEN 2
        ELSE 1
      END DESC, revision.updated_at DESC
      LIMIT 1
    )`;
  }

  private withOpenRevision(row: unknown): SsiRecord {
    const result = row as { payload: unknown; open_revision?: string | null };
    const record = JSON.parse(String(result.payload)) as SsiRecord;
    if (!result.open_revision) return record;
    const revision = JSON.parse(result.open_revision) as {
      id: string;
      status: NonNullable<SsiRecord["openRevisionStatus"]>;
    };
    return {
      ...record,
      hasOpenRevision: true,
      openRevisionId: revision.id,
      openRevisionStatus: revision.status,
    };
  }

  private expireRevisionWorkInProgress(): void {
    const now = new Date();
    const rows = this.db
      .prepare(
        `SELECT payload FROM ssi
         WHERE json_extract(payload,'$.status')='WIP'
           AND (json_extract(payload,'$.revisionWipExpiresAt')<=?
             OR updated_at<=?)`,
      )
      .all(now.toISOString(), revisionWipCutoffAt(now));
    for (const row of rows) {
      const record = JSON.parse(
        String((row as { payload: unknown }).payload),
      ) as SsiRecord;
      const cancelled: SsiRecord = {
        ...record,
        status: "REVOKED",
        revokeReason: "Revision WIP expired",
        updatedAt: new Date().toISOString(),
      };
      delete cancelled.revisionWipExpiresAt;
      this.save(cancelled, "WIP_EXPIRED", "system.scheduler");
    }
  }
  explainList(status?: string): string[] {
    const sql = status
      ? "SELECT payload FROM ssi WHERE json_extract(payload,'$.status')=? ORDER BY updated_at DESC"
      : "SELECT payload FROM ssi ORDER BY updated_at DESC";
    return this.db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...(status ? [status] : []))
      .map((row) => String((row as { detail: unknown }).detail));
  }
  indexNames(): string[] {
    return this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ssi' ORDER BY name",
      )
      .all()
      .map((row) => String((row as { name: unknown }).name));
  }
  find(id: string): SsiRecord | undefined {
    const row = this.db
      .prepare("SELECT payload FROM ssi WHERE id=?")
      .get(id) as { payload: unknown } | undefined;
    return row ? (JSON.parse(String(row.payload)) as SsiRecord) : undefined;
  }
  listApplicability(ssiId?: string): SsiApplicabilityRecord[] {
    const rows = ssiId
      ? this.db
          .prepare(
            "SELECT payload FROM ssi_applicability WHERE ssi_id=? ORDER BY id",
          )
          .all(ssiId)
      : this.db
          .prepare("SELECT payload FROM ssi_applicability ORDER BY ssi_id,id")
          .all();
    return rows.map(
      (row) =>
        JSON.parse(
          String((row as { payload: unknown }).payload),
        ) as SsiApplicabilityRecord,
    );
  }
  findPaymentCandidates(query: PaymentSsiCandidateQuery): SsiRecord[] {
    return this.findPaymentCandidateBindings(query).map(({ ssi }) => ssi);
  }
  findPaymentCandidateBindings(
    query: PaymentSsiCandidateQuery,
  ): PaymentSsiCandidateBinding[] {
    const currency = query.currency?.trim() ?? "";
    const bookingEntity = query.bookingEntity?.trim() ?? "";
    const fixtureBindingId = query.fixtureBindingId?.trim() ?? "";
    const rows = this.db
      .prepare(
        `SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
         FROM ssi AS s
         JOIN ssi_applicability AS a ON a.ssi_id = s.id
         WHERE json_extract(s.payload,'$.status') = 'ACTIVE'
           AND json_extract(s.payload,'$.route.routePurpose') = 'INTERBANK_TRANSFER'
           AND json_extract(a.payload,'$.status') = 'ACTIVE'
           AND json_extract(a.payload,'$.validFrom') <= ?
           AND json_extract(a.payload,'$.validTo') >= ?
           AND json_extract(a.payload,'$.consumer') IN ('CENTRAL_PAYMENT','ANY')
           AND json_extract(a.payload,'$.product') IN ('CENTRAL_PAYMENT','ANY')
           AND json_extract(a.payload,'$.businessFunction') IN ('INTERBANK_TRANSFER','ANY')
           AND json_extract(a.payload,'$.paymentLeg') IN ('INTERBANK_SETTLEMENT','ANY')
           AND json_extract(a.payload,'$.direction') IN ('OUTBOUND','ANY')
           AND COALESCE(json_extract(s.payload,'$.route.currency'),'') <> ''
           AND COALESCE(json_extract(s.payload,'$.route.bookingEntity'),'') <> ''
           AND COALESCE(json_extract(s.payload,'$.route.validFrom'),'') <= ?
           AND COALESCE(json_extract(s.payload,'$.route.validTo'),'') >= ?
           AND instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.sourceMessageTypes'),''),' ','') || ',', ',' || ? || ',') > 0
           AND instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.messageTypes'),''),' ','') || ',', ',' || ? || ',') > 0
           AND instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.businessService'),''),' ','') || ',', ',' || ? || ',') > 0
           AND (? = '' OR json_extract(s.payload,'$.route.currency') = ?)
           AND (? = '' OR json_extract(s.payload,'$.route.bookingEntity') = ?)
           AND (? = '' OR EXISTS (SELECT 1 FROM json_each(json_extract(s.payload,'$.fixtureBindingIds')) WHERE value = ?))
           AND (? = '' OR EXISTS (SELECT 1 FROM json_each(json_extract(a.payload,'$.fixtureBindingIds')) WHERE value = ?))
         ORDER BY CAST(COALESCE(json_extract(s.payload,'$.route.priority'),'999999') AS INTEGER),
                  json_extract(s.payload,'$.route.counterpartyBic')`,
      )
      .all(
        query.valueDate,
        query.valueDate,
        query.valueDate,
        query.valueDate,
        query.sourceMessageType,
        query.messageType,
        query.businessService,
        currency,
        currency,
        bookingEntity,
        bookingEntity,
        fixtureBindingId,
        fixtureBindingId,
        fixtureBindingId,
        fixtureBindingId,
      );
    return rows.map((row) => {
      const payloads = row as {
        ssi_payload: unknown;
        applicability_payload: unknown;
      };
      return {
        ssi: JSON.parse(String(payloads.ssi_payload)) as SsiRecord,
        applicability: JSON.parse(
          String(payloads.applicability_payload),
        ) as SsiApplicabilityRecord,
      };
    });
  }
  findFinControlledFixtures(
    query: FinControlledFixtureRepositoryQuery,
  ): FinControlledFixtureRepositoryRow[] {
    const sequence = query.sequence?.trim() ?? "";
    const bindingId = query.bindingId?.trim() ?? "";
    const includeFixtureGroup = query.includeFixtureGroup === true ? 1 : 0;
    const rows = this.db
      .prepare(
        `SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
         FROM ssi AS s
         JOIN ssi_applicability AS a ON a.ssi_id = s.id
         WHERE json_extract(s.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
           AND json_extract(s.payload,'$.status') = 'ACTIVE'
           AND json_extract(s.payload,'$.route.currency') = ?
           AND json_extract(s.payload,'$.route.bookingEntity') = ?
           AND json_extract(a.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
           AND json_extract(a.payload,'$.status') = 'ACTIVE'
           AND json_extract(a.payload,'$.messageType') = ?
           AND (? = '' OR json_extract(a.payload,'$.sequence') = ?)
           AND json_extract(a.payload,'$.currency') = ?
           AND json_extract(a.payload,'$.validFrom') <= ?
           AND json_extract(a.payload,'$.validTo') >= ?
           AND (
             ? = '' OR
             json_extract(s.payload,'$.fixtureBindingId') = ? OR
             (? = 1 AND json_extract(s.payload,'$.route.fixtureGroupId') = ?)
           )
           AND (
             ? = '' OR
             json_extract(a.payload,'$.fixtureBindingId') = ? OR
             (? = 1 AND json_extract(s.payload,'$.route.fixtureGroupId') = ?)
           )
         ORDER BY json_extract(s.payload,'$.fixtureBindingId')`,
      )
      .all(
        query.currency,
        query.bookingEntity,
        query.messageType,
        sequence,
        sequence,
        query.currency,
        query.valueDate,
        query.valueDate,
        bindingId,
        bindingId,
        includeFixtureGroup,
        bindingId,
        bindingId,
        bindingId,
        includeFixtureGroup,
        bindingId,
      );
    return rows.map((row) => {
      const payloads = row as {
        ssi_payload: unknown;
        applicability_payload: unknown;
      };
      return {
        ssi: JSON.parse(String(payloads.ssi_payload)) as SsiRecord,
        applicability: JSON.parse(
          String(payloads.applicability_payload),
        ) as SsiApplicabilityRecord,
      };
    });
  }
  replaceApplicability(
    ssiId: string,
    inputs: readonly SsiApplicabilityInput[],
    actor: string,
  ): SsiApplicabilityRecord[] {
    const now = new Date().toISOString();
    const previous = this.listApplicability(ssiId);
    const version = Math.max(0, ...previous.map((item) => item.version)) + 1;
    const records = inputs.map((input, index): SsiApplicabilityRecord => ({
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
      const insert = this.db.prepare(
        "INSERT INTO ssi_applicability(id,ssi_id,payload,updated_at) VALUES(?,?,?,?)",
      );
      for (const record of records)
        insert.run(record.id, ssiId, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        )
        .run(
          ssiId,
          "APPLICABILITY_REPLACED",
          actor,
          JSON.stringify(records),
          now,
        );
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
        )
        .run(
          randomUUID(),
          "SSI_APPLICABILITY_REPLACED",
          JSON.stringify({ ssiId, records }),
          now,
        );
      this.db.exec("COMMIT");
      return records;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  save(record: SsiRecord, action: string, actor: string): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .run(record.id, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        )
        .run(record.id, action, actor, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
        )
        .run(randomUUID(), `SSI_${action}`, JSON.stringify(record), now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  saveRevisionWorkInProgress(
    record: SsiRecord,
    actor: string,
    action = "WIP_RESERVED",
  ): boolean {
    if (!record.amendmentOfId) return false;
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const source = this.db
        .prepare("SELECT payload FROM ssi WHERE id=?")
        .get(record.amendmentOfId) as { payload: unknown } | undefined;
      const status = source
        ? (JSON.parse(String(source.payload)) as SsiRecord).status
        : "";
      const conflict = this.db
        .prepare(
          `SELECT 1 AS found FROM ssi
           WHERE json_extract(payload,'$.amendmentOfId')=?
             AND (json_extract(payload,'$.status') IN ('DRAFT','PENDING_APPROVAL','APPROVED')
               OR (json_extract(payload,'$.status')='WIP' AND json_extract(payload,'$.revisionWipExpiresAt')>?))
           LIMIT 1`,
        )
        .get(record.amendmentOfId, now);
      if (!["ACTIVE", "APPROVED"].includes(status) || conflict) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db
        .prepare("INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?)")
        .run(record.id, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        )
        .run(record.id, action, actor, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
        )
        .run(randomUUID(), `SSI_${action}`, JSON.stringify(record), now);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  approveSuppression(id: string, actor: string): SsiRecord | undefined {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const requestRow = this.db
        .prepare("SELECT payload FROM ssi WHERE id=?")
        .get(id) as { payload: unknown } | undefined;
      const request = requestRow
        ? (JSON.parse(String(requestRow.payload)) as SsiRecord)
        : undefined;
      const sourceRow = request?.amendmentOfId
        ? (this.db
            .prepare("SELECT payload FROM ssi WHERE id=?")
            .get(request.amendmentOfId) as { payload: unknown } | undefined)
        : undefined;
      const source = sourceRow
        ? (JSON.parse(String(sourceRow.payload)) as SsiRecord)
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
      const superseded: SsiRecord = {
        ...source,
        status: "SUPERSEDED",
        version: source.version + 1,
        updatedAt: now,
      };
      const suppressed: SsiRecord = {
        ...request,
        status: "SUPPRESSED",
        checker: actor,
        version: request.version + 1,
        updatedAt: now,
      };
      for (const [record, action] of [
        [superseded, "SUPERSEDED"],
        [suppressed, "SUPPRESSION_APPROVED"],
      ] as const) {
        this.db
          .prepare(
            "INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
          )
          .run(record.id, JSON.stringify(record), now);
        this.db
          .prepare(
            "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
          )
          .run(record.id, action, actor, JSON.stringify(record), now);
        this.db
          .prepare(
            "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
          )
          .run(randomUUID(), `SSI_${action}`, JSON.stringify(record), now);
      }
      this.db.exec("COMMIT");
      return suppressed;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  audit(): unknown[] {
    return this.db
      .prepare(
        "SELECT * FROM audit_event WHERE julianday(occurred_at) >= julianday(?) ORDER BY id DESC",
      )
      .all(onlineAuditCutoffUtc());
  }
  onModuleDestroy(): void {
    this.db.close();
  }
}
