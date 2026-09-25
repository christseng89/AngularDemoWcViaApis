import { Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { DatabaseSync } from "node:sqlite";
import type { RouteResolutionRequest } from "./route-resolution.policy";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { onlineAuditCutoffUtc } from "./audit-retention/audit-retention.policy";
import {
  revisionWipCutoffAt,
  type PagedResult,
} from "./shared/sqlite-governed.repository";
import {
  currentStatusProjection,
  type CurrentStatus,
  type OpenRevisionChangeType,
  type OpenRevisionStatus,
} from "./shared/current-status-projection";
import { maintenanceIndexStatuses } from "./shared/maintenance-index-status";
import {
  ResolutionCurrencyStore,
  type DiscoveredCurrency,
  type ResolutionCurrencyApplyResult,
} from "./resolution-currency-store";
import type { ResolutionCurrencyCoverageRow } from "./resolution-currency-reconciliation";

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
  openRevisionChangeType?: OpenRevisionChangeType;
  currentStatus?: CurrentStatus;
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
  status: "ACTIVE" | "INACTIVE" | "DRAFT";
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
  readonly valueDate: string;
  readonly currency?: string;
  readonly bookingEntity?: string;
  readonly fixtureBindingId?: string;
  readonly ssiId?: string;
}
export interface PaymentSsiCandidateBinding {
  readonly ssi: SsiRecord;
  readonly applicability: SsiApplicabilityRecord;
}

export interface Mt1SsiCandidateQuery {
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
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

export interface FinControlledFixtureIndexCurrency {
  readonly messageType: string;
  readonly sequence: string;
  readonly settlementLeg: string;
  readonly currency: string;
}

const FIN_CONTROLLED_CATALOGUE_SQL = `
  SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
  FROM ssi_applicability AS a
  JOIN ssi AS s ON s.id = a.ssi_id
  WHERE json_extract(a.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
    AND json_extract(a.payload,'$.status') = 'ACTIVE'
    AND json_extract(s.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
    AND json_extract(s.payload,'$.status') = 'ACTIVE'
  ORDER BY a.ssi_id, a.id`;

const JS_TRIM_CHARACTERS =
  "char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)";
const SQL_LIKE_ESCAPE_CHARACTER = String.fromCodePoint(92);

const FIN_CONTROLLED_INDEX_CURRENCIES_SQL = `
  WITH latest AS MATERIALIZED (
    SELECT s.id AS ssi_id,
      s.updated_at AS ssi_updated_at,
      json_extract(a.payload,'$.messageType') AS message_type,
      json_extract(s.payload,'$.route.sequence') AS sequence,
      json_extract(s.payload,'$.route.settlementLeg') AS settlement_leg,
      json_extract(s.payload,'$.route.currency') AS currency,
      json_extract(s.payload,'$.fixtureVariantVersion') AS variant_version,
      json_extract(s.payload,'$.datasetVersion') AS dataset_version,
      json_extract(s.payload,'$.usageScope') AS usage_scope,
      json_type(s.payload,'$.operationalVisible') AS visible_type,
      CASE
        WHEN json_type(s.payload,'$.fixtureBindingId') != 'text' OR nullif(trim(json_extract(s.payload,'$.fixtureBindingId'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'BINDING_ID'
        WHEN json_type(a.payload,'$.messageType') != 'text' OR nullif(trim(json_extract(a.payload,'$.messageType'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'MESSAGE_TYPE'
        WHEN json_type(s.payload,'$.route.businessFunction') != 'text' OR nullif(trim(json_extract(s.payload,'$.route.businessFunction'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'BUSINESS_FUNCTION'
        WHEN json_type(s.payload,'$.route.sequence') != 'text' OR nullif(trim(json_extract(s.payload,'$.route.sequence'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'SEQUENCE'
        WHEN json_type(s.payload,'$.route.settlementLeg') != 'text' OR nullif(trim(json_extract(s.payload,'$.route.settlementLeg'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'SETTLEMENT_LEG'
        WHEN json_type(s.payload,'$.route.counterpartyBic') != 'text' OR nullif(trim(json_extract(s.payload,'$.route.counterpartyBic'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'COUNTERPARTY_BIC'
        WHEN json_type(s.payload,'$.route.currency') != 'text' OR nullif(trim(json_extract(s.payload,'$.route.currency'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'CURRENCY'
        WHEN json_type(s.payload,'$.route.bookingEntity') != 'text' OR nullif(trim(json_extract(s.payload,'$.route.bookingEntity'), ${JS_TRIM_CHARACTERS}), '') IS NULL THEN 'BOOKING_ENTITY'
      END AS invalid_field
    FROM ssi_applicability AS a
    JOIN ssi AS s ON s.id = a.ssi_id
    WHERE json_extract(a.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
      AND json_extract(a.payload,'$.status') = 'ACTIVE'
      AND json_extract(s.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
      AND json_extract(s.payload,'$.status') = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM ssi_applicability AS later
        WHERE later.ssi_id = a.ssi_id
          AND later.id COLLATE BINARY > a.id
          AND json_extract(later.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
          AND json_extract(later.payload,'$.status') = 'ACTIVE'
      )
  ), visible AS MATERIALIZED (
    SELECT * FROM latest
    WHERE NOT EXISTS (
      SELECT 1 FROM latest
      WHERE variant_version = 'MT347-DEMO-ORACLE-V1.1'
        AND dataset_version = 'MT347-DEMO-V1.1'
    ) OR (
      variant_version = 'MT347-DEMO-ORACLE-V1.1'
      AND dataset_version = 'MT347-DEMO-V1.1'
      AND usage_scope = 'QA_POSITIVE'
      AND visible_type = 'false'
    )
  )
  SELECT DISTINCT message_type, sequence, settlement_leg, currency,
    (SELECT invalid_field FROM visible
     WHERE invalid_field IS NOT NULL ORDER BY ssi_updated_at DESC, ssi_id LIMIT 1) AS first_invalid_field
  FROM visible
  ORDER BY message_type, sequence, settlement_leg, currency`;

@Injectable()
export class SqliteSsiRepository implements OnModuleDestroy {
  private readonly db: DatabaseSync;
  private readonly ownsConnection: boolean;
  private resolutionCurrencies: ResolutionCurrencyStore | undefined;
  constructor(@Optional() externalDb?: DatabaseSync) {
    this.ownsConnection = !externalDb;
    if (externalDb) {
      this.db = externalDb;
      return;
    }
    const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
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
  private currencyStore(): ResolutionCurrencyStore {
    const existing = this.resolutionCurrencies;
    if (existing) return existing;
    const store = new ResolutionCurrencyStore(this.db);
    this.resolutionCurrencies = store;
    return store;
  }
  resolutionCurrencyInquiry(standardsRelease: string) {
    return this.currencyStore().inquiry(standardsRelease);
  }

  resolutionCurrencyInquiryPage(
    standardsRelease: string,
    request: Parameters<ResolutionCurrencyStore["inquiryPage"]>[1],
  ) {
    return this.currencyStore().inquiryPage(standardsRelease, request);
  }

  activeResolutionCurrencies(
    standardsRelease: string,
    businessDomain: ResolutionCurrencyCoverageRow["businessDomain"],
  ): string[] {
    return this.currencyStore().active(standardsRelease, businessDomain);
  }

  bootstrapResolutionCurrencyCoverage(
    discover: () => readonly DiscoveredCurrency[],
    asOfDate: string,
  ): ResolutionCurrencyApplyResult {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Recheck while holding the SQLite writer lock: another process may have initialized it.
      if (this.currencyStore().inquiry("SR2026").length > 0) {
        const control = this.currencyStore().syncState("SR2026");
        if (!control?.initialized || control.asOfDate !== asOfDate)
          throw new Error("RESOLUTION_CURRENCY_BOOTSTRAP_CONTROL_MISMATCH");
        this.db.exec("COMMIT");
        return {
          discovered: 0,
          inserted: 0,
          unchanged: 0,
          activated: 0,
          inactivated: 0,
        };
      }
      const discovered = discover();
      const result = this.currencyStore().apply(
        "SR2026",
        discovered,
        "FULL_RESYNC",
        `${asOfDate}T00:00:00Z`,
        asOfDate,
        false,
      );
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.resolutionCurrencies = undefined;
      throw error;
    }
  }

  resyncResolutionCurrencyCoverage(
    discover: () => readonly DiscoveredCurrency[],
    asOfDate: string,
  ): ResolutionCurrencyApplyResult {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const discovered = discover();
      const result = this.currencyStore().apply(
        "SR2026",
        discovered,
        "FULL_RESYNC",
        new Date().toISOString(),
        asOfDate,
      );
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.resolutionCurrencies = undefined;
      throw error;
    }
  }

  /** Called only from the approval callback while its SQLite transaction is open. */
  insertApprovedResolutionCurrencies(
    discovered: readonly DiscoveredCurrency[],
    asOfDate: string,
  ): ResolutionCurrencyApplyResult {
    return this.currencyStore().apply(
      "SR2026",
      discovered,
      "APPROVAL_DISCOVERY",
      new Date().toISOString(),
      asOfDate,
    );
  }

  /** Caller owns an open SQLite transaction, used by deterministic Demo Reload. */
  reconcileResolutionCurrenciesWithinTransaction(
    discovered: readonly DiscoveredCurrency[],
    asOfDate: string,
  ): ResolutionCurrencyApplyResult {
    return this.currencyStore().apply(
      "SR2026",
      discovered,
      "FULL_RESYNC",
      `${asOfDate}T00:00:00.000Z`,
      asOfDate,
      false,
    );
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
    const statuses = maintenanceIndexStatuses(request.status);
    clauses.push(
      `json_extract(payload,'$.status') IN (${statuses.map(() => "?").join(",")})`,
    );
    parameters.push(...statuses);
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
      clauses.push(`payload LIKE ? ESCAPE '${SQL_LIKE_ESCAPE_CHARACTER}'`);
      const escapedSearch = search
        .replaceAll(
          SQL_LIKE_ESCAPE_CHARACTER,
          SQL_LIKE_ESCAPE_CHARACTER.repeat(2),
        )
        .replaceAll("%", `${SQL_LIKE_ESCAPE_CHARACTER}%`)
        .replaceAll("_", `${SQL_LIKE_ESCAPE_CHARACTER}_`);
      parameters.push(`%${escapedSearch}%`);
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
      EFFECTIVE_PERIOD: "json_extract(payload,'$.route.validTo')",
      STATUS: "json_extract(payload,'$.status')",
      VERSION: "CAST(json_extract(payload,'$.version') AS INTEGER)",
      REQUEST_TYPE: `COALESCE(json_extract(payload,'$.changeType'),CASE WHEN json_extract(payload,'$.amendmentOfId') IS NOT NULL THEN 'REVISION' ELSE 'NEW' END)`,
      REVISION_STATUS: `CASE
        WHEN ${this.openRevisionSelectSql("base")} IS NULL THEN 'EMPTY'
        WHEN json_extract(${this.openRevisionSelectSql("base")},'$.status')='WIP' THEN 'IN_PROGRESS'
        WHEN json_extract(${this.openRevisionSelectSql("base")},'$.changeType')='SUPPRESSION' THEN 'SUPPRESSED'
        ELSE 'DRAFTED'
      END`,
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
        'status', json_extract(revision.payload,'$.status'),
        'changeType', COALESCE(json_extract(revision.payload,'$.changeType'),'REVISION')
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
    if (!result.open_revision)
      return { ...record, ...currentStatusProjection(undefined) };
    const revision = JSON.parse(result.open_revision) as {
      id: string;
      status: OpenRevisionStatus;
      changeType: OpenRevisionChangeType;
    };
    return {
      ...record,
      ...currentStatusProjection(revision),
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
  findRelatedRouteBindings(request: RouteResolutionRequest): {
    readonly ssi: readonly SsiRecord[];
    readonly applicability: readonly SsiApplicabilityRecord[];
  } {
    this.expireRevisionWorkInProgress();
    const rows = this.db
      .prepare(
        `SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
       FROM ssi_applicability AS a
       JOIN ssi AS s ON s.id=a.ssi_id
       WHERE json_extract(a.payload,'$.status')='ACTIVE'
         AND json_extract(a.payload,'$.businessFunction') IN (?, 'ANY')
         AND json_extract(s.payload,'$.route.currency')=?
         AND COALESCE(json_extract(s.payload,'$.status'),'') NOT IN ('SUPERSEDED','REVOKED')
       ORDER BY s.updated_at DESC`,
      )
      .all(request.businessFunction, request.currency) as Array<{
      ssi_payload: unknown;
      applicability_payload: unknown;
    }>;
    // Applicability currently accepts non-date-only strings. Keep Date.parse parity
    // with relatedCandidates after SQL narrows the joined set by route context.
    const valueTime = Date.parse(request.valueDate);
    const ssi = new Map<string, SsiRecord>();
    const applicability = new Map<string, SsiApplicabilityRecord>();
    for (const row of rows) {
      const app = JSON.parse(
        String(row.applicability_payload),
      ) as SsiApplicabilityRecord;
      if (
        Date.parse(app.validFrom) > valueTime ||
        valueTime > Date.parse(app.validTo)
      )
        continue;
      if (
        !Number.isFinite(Date.parse(app.validFrom)) ||
        !Number.isFinite(Date.parse(app.validTo))
      )
        continue;
      const record = JSON.parse(String(row.ssi_payload)) as SsiRecord;
      ssi.set(record.id, record);
      applicability.set(app.id, app);
    }
    return {
      ssi: [...ssi.values()],
      applicability: [...applicability.values()],
    };
  }

  findRequestDataQualityBindings(
    request: RouteResolutionRequest,
  ): readonly PaymentSsiCandidateBinding[] {
    this.expireRevisionWorkInProgress();
    const requestedCounterparty =
      request.counterpartyBic ?? request.counterpartyId;
    if (
      !requestedCounterparty ||
      request.consumer !== "CENTRAL_PAYMENT" ||
      request.product !== "CENTRAL_PAYMENT" ||
      request.businessFunction !== "INTERBANK_TRANSFER" ||
      request.paymentLeg !== "INTERBANK_SETTLEMENT" ||
      request.direction !== "OUTBOUND"
    )
      return [];
    const rows = this.db
      .prepare(
        `SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
       FROM ssi_applicability AS a
       JOIN ssi AS s ON s.id=a.ssi_id
       WHERE json_extract(a.payload,'$.status')='ACTIVE'
         AND json_extract(s.payload,'$.status')='ACTIVE'
         AND json_extract(a.payload,'$.consumer')='CENTRAL_PAYMENT'
         AND json_extract(a.payload,'$.product')='CENTRAL_PAYMENT'
         AND json_extract(a.payload,'$.businessFunction')='INTERBANK_TRANSFER'
         AND json_extract(a.payload,'$.paymentLeg')='INTERBANK_SETTLEMENT'
         AND json_extract(a.payload,'$.direction')='OUTBOUND'
         AND json_extract(s.payload,'$.route.currency')=?
         AND COALESCE(json_extract(s.payload,'$.route.counterpartyBic'),
                      json_extract(s.payload,'$.counterpartyId'))=?
         AND json_extract(s.payload,'$.route.bookingEntity') IN (?, 'ANY')
       ORDER BY a.id`,
      )
      .all(
        request.currency,
        requestedCounterparty,
        request.bookingEntity,
      ) as Array<{
      ssi_payload: unknown;
      applicability_payload: unknown;
    }>;
    return rows.map((row) => ({
      ssi: JSON.parse(String(row.ssi_payload)) as SsiRecord,
      applicability: JSON.parse(
        String(row.applicability_payload),
      ) as SsiApplicabilityRecord,
    }));
  }
  hasCoverProfile(request: RouteResolutionRequest): boolean {
    this.expireRevisionWorkInProgress();
    const counterparty =
      request.counterpartyBic || request.counterpartyId || "";
    const rows = this.db
      .prepare(
        `SELECT json_extract(s.payload,'$.route.messageTypes') AS message_types,
              json_extract(s.payload,'$.route.businessService') AS business_services,
              json_extract(s.payload,'$.route.sourceMessageTypes') AS source_message_types
       FROM ssi AS s
       WHERE json_extract(s.payload,'$.status')='ACTIVE'
         AND json_extract(s.payload,'$.route.currency')=?
         AND json_extract(s.payload,'$.route.bookingEntity')=?
         AND COALESCE(NULLIF(json_extract(s.payload,'$.route.counterpartyBic'),''),
                      json_extract(s.payload,'$.counterpartyId'))=?
         AND instr(COALESCE(json_extract(s.payload,'$.route.messageTypes'),''), ?) > 0
         AND instr(COALESCE(json_extract(s.payload,'$.route.businessService'),''), ?) > 0
         AND instr(COALESCE(json_extract(s.payload,'$.route.sourceMessageTypes'),''), ?) > 0`,
      )
      .all(
        request.currency,
        request.bookingEntity,
        counterparty,
        request.messageType,
        "swift.cbprplus.cov.04",
        request.sourceMessageType ?? "",
      ) as Array<{
      message_types: string | null;
      business_services: string | null;
      source_message_types: string | null;
    }>;
    const hasExactToken = (value: string | null, expected: string): boolean =>
      Boolean(expected) &&
      (value ?? "")
        .split(",")
        .map((token) => token.trim())
        .includes(expected);
    return rows.some(
      (row) =>
        hasExactToken(row.message_types, request.messageType) &&
        hasExactToken(row.business_services, "swift.cbprplus.cov.04") &&
        hasExactToken(
          row.source_message_types,
          request.sourceMessageType ?? "",
        ),
    );
  }
  findPaymentCandidates(query: PaymentSsiCandidateQuery): SsiRecord[] {
    return this.findPaymentCandidateBindings(query).map(({ ssi }) => ssi);
  }
  findResolutionCurrencyCoverage(query: {
    readonly consumer: "TREASURY" | "TRADE_FINANCE";
    readonly businessFunction: string;
    readonly messageType: string;
    readonly asOfDate: string;
    readonly ssiId?: string;
  }): string[] {
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT json_extract(s.payload,'$.route.currency') AS currency
        FROM ssi_applicability AS a
        JOIN ssi AS s ON s.id=a.ssi_id
        WHERE json_extract(a.payload,'$.status')='ACTIVE'
          AND json_extract(s.payload,'$.status')='ACTIVE'
          AND json_extract(a.payload,'$.consumer')=?
          AND json_extract(a.payload,'$.businessFunction')=?
          AND (json_type(a.payload,'$.messageType') IS NULL
            OR json_extract(a.payload,'$.messageType')=?)
          AND json_extract(s.payload,'$.route.businessFunction')=?
          AND json_extract(a.payload,'$.validFrom')<=?
          AND json_extract(a.payload,'$.validTo')>=?
          AND COALESCE(json_extract(s.payload,'$.route.validFrom'),'0000-01-01')<=?
          AND COALESCE(json_extract(s.payload,'$.route.validTo'),'9999-12-31')>=?
          AND (
            substr(COALESCE(json_extract(s.payload,'$.usageScope'),''),1,3) <> 'QA_'
            OR (
              json_extract(s.payload,'$.fixtureFamily')='MT347-SR2026-SSI'
              AND json_extract(s.payload,'$.fixtureVariantVersion')='MT347-DEMO-ORACLE-V1.1'
              AND json_extract(s.payload,'$.datasetVersion')='MT347-DEMO-V1.1'
              AND json_extract(s.payload,'$.usageScope')='QA_POSITIVE'
              AND json_type(s.payload,'$.operationalVisible')='false'
            )
          )
          AND length(json_extract(s.payload,'$.route.currency'))=3
          AND json_extract(s.payload,'$.route.currency') GLOB '[A-Z][A-Z][A-Z]'
          AND (
            EXISTS (
              SELECT 1 FROM json_each(
                CASE WHEN json_type(s.payload,'$.route.messageTypes')='array'
                  THEN json_extract(s.payload,'$.route.messageTypes') ELSE '[]' END
              ) WHERE value=?
            ) OR (
              json_type(s.payload,'$.route.messageTypes')='text'
              AND instr(
                ',' || replace(json_extract(s.payload,'$.route.messageTypes'),' ','') || ',',
                ',' || ? || ','
              )>0
            )
          )
          AND (?='' OR s.id=?)
        ORDER BY currency
      `,
      )
      .all(
        query.consumer,
        query.businessFunction,
        query.messageType,
        query.businessFunction,
        query.asOfDate,
        query.asOfDate,
        query.asOfDate,
        query.asOfDate,
        query.messageType,
        query.messageType,
        query.ssiId ?? "",
        query.ssiId ?? "",
      ) as { currency: string }[];
    return rows.map(({ currency }) => currency);
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
           ${query.ssiId ? "AND s.id=?" : ""}
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
        ...(query.ssiId ? [query.ssiId] : []),
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

  findMt1CandidateBindings(
    query: Mt1SsiCandidateQuery,
  ): PaymentSsiCandidateBinding[] {
    const rows = this.db
      .prepare(
        `SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
         FROM ssi AS s
         JOIN ssi_applicability AS a ON a.ssi_id = s.id
         WHERE json_extract(s.payload,'$.status') = 'ACTIVE'
           AND json_extract(a.payload,'$.status') = 'ACTIVE'
           AND json_extract(a.payload,'$.validFrom') <= ?
           AND json_extract(a.payload,'$.validTo') >= ?
           AND json_extract(a.payload,'$.direction') IN ('OUTBOUND','ANY')
           AND json_extract(a.payload,'$.paymentLeg') IN ('INTERBANK_SETTLEMENT','ANY')
           AND json_extract(s.payload,'$.route.currency') = ?
           AND json_extract(s.payload,'$.route.bookingEntity') IN (?, 'ANY')
           AND COALESCE(json_extract(s.payload,'$.route.validFrom'),'0000-01-01') <= ?
           AND COALESCE(json_extract(s.payload,'$.route.validTo'),'9999-12-31') >= ?
           AND (
             instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.messageTypes'),''),' ','') || ',', ',MT103,') > 0
             OR instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.messageTypes'),''),' ','') || ',', ',pacs.008.001.12,') > 0
             OR instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.messageTypes'),''),' ','') || ',', ',pacs.008.001.08,') > 0
           )
         ORDER BY CAST(COALESCE(json_extract(s.payload,'$.route.priority'),'999999') AS INTEGER),
                  json_extract(s.payload,'$.route.accountWithBic'), a.id`,
      )
      .all(
        query.valueDate,
        query.valueDate,
        query.currency,
        query.bookingEntity,
        query.valueDate,
        query.valueDate,
      ) as Array<{ ssi_payload: string; applicability_payload: string }>;
    return rows.map((row) => ({
      ssi: JSON.parse(row.ssi_payload) as SsiRecord,
      applicability: JSON.parse(
        row.applicability_payload,
      ) as SsiApplicabilityRecord,
    }));
  }
  /** Definition discovery projects only currency; executable bindings remain separate. */
  findPaymentResolutionCurrencies(query: PaymentSsiCandidateQuery): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT json_extract(s.payload,'$.route.currency') AS currency
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
         ${query.ssiId ? "AND s.id=?" : ""}
       ORDER BY currency`,
      )
      .all(
        query.valueDate,
        query.valueDate,
        query.valueDate,
        query.valueDate,
        query.sourceMessageType,
        query.messageType,
        ...(query.ssiId ? [query.ssiId] : []),
      ) as { currency: string }[];
    return rows.map(({ currency }) => currency);
  }
  listFinControlledFixtureCatalogueRows(): FinControlledFixtureRepositoryRow[] {
    const rows = this.db.prepare(FIN_CONTROLLED_CATALOGUE_SQL).all();
    const latestApplicabilityBySsi = new Map<
      string,
      FinControlledFixtureRepositoryRow
    >();
    for (const row of rows) {
      const payloads = row as {
        ssi_payload: unknown;
        applicability_payload: unknown;
      };
      const candidate = {
        ssi: JSON.parse(String(payloads.ssi_payload)) as SsiRecord,
        applicability: JSON.parse(
          String(payloads.applicability_payload),
        ) as SsiApplicabilityRecord,
      };
      latestApplicabilityBySsi.set(candidate.ssi.id, candidate);
    }
    return [...latestApplicabilityBySsi.values()];
  }

  listFinControlledFixtureIndexCurrencies(): FinControlledFixtureIndexCurrency[] {
    const rows = this.db
      .prepare(FIN_CONTROLLED_INDEX_CURRENCIES_SQL)
      .all() as Array<{
      message_type: string;
      sequence: string;
      settlement_leg: string;
      currency: string;
      first_invalid_field: string | null;
    }>;
    if (rows[0]?.first_invalid_field)
      throw new Error(
        `CONTROLLED_FIXTURE_${rows[0].first_invalid_field}_MISSING`,
      );
    return rows.map((row) => ({
      messageType: row.message_type,
      sequence: row.sequence,
      settlementLeg: row.settlement_leg,
      currency: row.currency,
    }));
  }

  explainFinControlledFixtureCatalogue(): string[] {
    return this.db
      .prepare(`EXPLAIN QUERY PLAN ${FIN_CONTROLLED_CATALOGUE_SQL}`)
      .all()
      .map((row) => String((row as { detail: unknown }).detail));
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

  approveWithApplicability(
    id: string,
    actor: string,
    onApproved?: (record: SsiRecord) => void,
  ): SsiRecord | undefined {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const requestRow = this.db
        .prepare("SELECT payload FROM ssi WHERE id=?")
        .get(id) as { payload: unknown } | undefined;
      const request = requestRow
        ? (JSON.parse(String(requestRow.payload)) as SsiRecord)
        : undefined;
      if (
        request?.status !== "PENDING_APPROVAL" ||
        request.changeType === "SUPPRESSION" ||
        !actor ||
        request.maker === actor
      ) {
        this.db.exec("ROLLBACK");
        return undefined;
      }

      let applicabilityRows = this.db
        .prepare(
          "SELECT payload FROM ssi_applicability WHERE ssi_id=? ORDER BY id",
        )
        .all(id)
        .map(
          (row) =>
            JSON.parse(
              String((row as { payload: unknown }).payload),
            ) as SsiApplicabilityRecord,
        );
      if (applicabilityRows.length === 0 && request.amendmentOfId) {
        applicabilityRows = this.db
          .prepare(
            "SELECT payload FROM ssi_applicability WHERE ssi_id=? ORDER BY id",
          )
          .all(request.amendmentOfId)
          .map(
            (row) =>
              JSON.parse(
                String((row as { payload: unknown }).payload),
              ) as SsiApplicabilityRecord,
          );
      }
      if (
        !applicabilityRows.some(
          ({ status }) => status === "ACTIVE" || status === "DRAFT",
        )
      ) {
        this.db.exec("ROLLBACK");
        return undefined;
      }

      const applicabilityVersion =
        Math.max(0, ...applicabilityRows.map(({ version }) => version)) + 1;
      const approvedApplicability = applicabilityRows.map(
        (row, index): SsiApplicabilityRecord => ({
          ...row,
          id: `${id}:APPL:${index + 1}`,
          ssiId: id,
          status: row.status === "DRAFT" ? "ACTIVE" : row.status,
          version: applicabilityVersion,
          createdAt: row.ssiId === id ? row.createdAt : now,
          updatedAt: now,
        }),
      );
      const insertApplicability = this.db.prepare(
        "INSERT INTO ssi_applicability(id,ssi_id,payload,updated_at) VALUES(?,?,?,?)",
      );
      this.db.prepare("DELETE FROM ssi_applicability WHERE ssi_id=?").run(id);
      for (const row of approvedApplicability)
        insertApplicability.run(row.id, id, JSON.stringify(row), now);
      this.db
        .prepare(
          "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          "APPLICABILITY_APPROVED",
          actor,
          JSON.stringify(approvedApplicability),
          now,
        );
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
        )
        .run(
          randomUUID(),
          "SSI_APPLICABILITY_APPROVED",
          JSON.stringify({ ssiId: id, records: approvedApplicability }),
          now,
        );

      const logicalSsiCode = request.route["ssiCode"];
      const previousActive = this.db
        .prepare(
          "SELECT payload FROM ssi WHERE id<>? AND json_extract(payload,'$.status')='ACTIVE'",
        )
        .all(id)
        .map(
          (row) =>
            JSON.parse(
              String((row as { payload: unknown }).payload),
            ) as SsiRecord,
        )
        .filter(
          (candidate) =>
            candidate.id === request.amendmentOfId ||
            (logicalSsiCode && candidate.route["ssiCode"] === logicalSsiCode),
        );
      const approved: SsiRecord = {
        ...request,
        status: "ACTIVE",
        checker: actor,
        version: request.version + 1,
        updatedAt: now,
      };
      const saveRecord = this.db.prepare(
        "INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
      );
      const auditRecord = this.db.prepare(
        "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
      );
      const outboxRecord = this.db.prepare(
        "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
      );
      for (const previous of previousActive) {
        const superseded: SsiRecord = {
          ...previous,
          status: "SUPERSEDED",
          version: previous.version + 1,
          updatedAt: now,
        };
        saveRecord.run(superseded.id, JSON.stringify(superseded), now);
        auditRecord.run(
          superseded.id,
          "SUPERSEDED",
          actor,
          JSON.stringify(superseded),
          now,
        );
        outboxRecord.run(
          randomUUID(),
          "SSI_SUPERSEDED",
          JSON.stringify(superseded),
          now,
        );
      }
      saveRecord.run(approved.id, JSON.stringify(approved), now);
      auditRecord.run(
        approved.id,
        "APPROVE",
        actor,
        JSON.stringify(approved),
        now,
      );
      outboxRecord.run(
        randomUUID(),
        "SSI_APPROVE",
        JSON.stringify(approved),
        now,
      );
      onApproved?.(approved);
      this.db.exec("COMMIT");
      return approved;
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.resolutionCurrencies = undefined;
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
        request?.changeType !== "SUPPRESSION" ||
        request.status !== "PENDING_APPROVAL" ||
        (request.suppressionReason?.trim().length ?? 0) < 5 ||
        request.maker === actor ||
        source?.status !== "ACTIVE"
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
    if (this.ownsConnection) this.db.close();
  }
}
