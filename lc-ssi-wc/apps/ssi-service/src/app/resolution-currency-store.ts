import { DatabaseSync } from "node:sqlite";
import {
  planResolutionCurrencyReconciliation,
  type ResolutionCurrencyCoverageRow,
  type ResolutionCurrencyReconciliationMode,
} from "./resolution-currency-reconciliation";
import type { ResolutionCurrencySortColumn, ResolutionCurrencySortDirection } from "./resolution-currency-inquiry.policy";

export interface DiscoveredCurrency {
  readonly standardsRelease: string;
  readonly businessDomain: ResolutionCurrencyCoverageRow["businessDomain"];
  readonly currency: string;
}

export interface ResolutionCurrencyInquiryRow extends ResolutionCurrencyCoverageRow {
  readonly source: string;
  readonly updatedAt: string;
  readonly lastResyncAt: string | null;
}

export interface ResolutionCurrencyApplyResult {
  readonly discovered: number;
  readonly inserted: number;
  readonly unchanged: number;
  readonly activated: number;
  readonly inactivated: number;
}

export interface ResolutionCurrencySyncState {
  readonly initialized: boolean;
  readonly asOfDate: string;
  readonly lastManualResyncAt: string | null;
}

export interface ResolutionCurrencyInquiryRequest {
  readonly businessDomain?: ResolutionCurrencyCoverageRow["businessDomain"];
  readonly status?: "ACTIVE" | "INACTIVE";
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: ResolutionCurrencySortColumn;
  readonly sortDirection?: ResolutionCurrencySortDirection;
}

export interface ResolutionCurrencyInquiryPage {
  readonly items: readonly ResolutionCurrencyInquiryRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

export class ResolutionCurrencyStore {
  constructor(private readonly db: DatabaseSync) {
    ResolutionCurrencyStore.ensureSchema(db);
  }

  static ensureSchema(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS resolution_currency_coverage (
        standards_release TEXT NOT NULL,
        business_domain TEXT NOT NULL CHECK (business_domain IN ('PAYMENT','TREASURY','TRADE_FINANCE')),
        currency_code TEXT NOT NULL CHECK (length(currency_code)=3 AND currency_code=upper(currency_code)),
        status TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (standards_release,business_domain,currency_code)
      );
      CREATE INDEX IF NOT EXISTS idx_resolution_currency_active
        ON resolution_currency_coverage (standards_release,business_domain,status,currency_code);
      CREATE TABLE IF NOT EXISTS resolution_currency_sync_control (
        standards_release TEXT PRIMARY KEY,
        initialized INTEGER NOT NULL CHECK (initialized IN (0,1)),
        as_of_date TEXT NOT NULL,
        last_manual_resync_at TEXT
      );
    `);
  }

  inquiry(standardsRelease: string): ResolutionCurrencyInquiryRow[] {
    const rows = this.db
      .prepare(
        `
        SELECT c.standards_release AS standardsRelease,
          c.business_domain AS businessDomain,
          c.currency_code AS currency,
          c.status, c.source, c.updated_at AS updatedAt,
          s.last_manual_resync_at AS lastResyncAt
        FROM resolution_currency_coverage c
        LEFT JOIN resolution_currency_sync_control s
          ON s.standards_release=c.standards_release
        WHERE c.standards_release=?
        ORDER BY c.business_domain,c.currency_code
      `,
      )
      .all(standardsRelease);
    return rows as unknown as ResolutionCurrencyInquiryRow[];
  }

  inquiryPage(
    standardsRelease: string,
    request: ResolutionCurrencyInquiryRequest,
  ): ResolutionCurrencyInquiryPage {
    const { page, pageSize } = request;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new Error("RESOLUTION_CURRENCY_INVALID_PAGE");
    const sortColumns: Record<ResolutionCurrencySortColumn, string> = {
      businessDomain: "c.business_domain", currency: "c.currency_code", status: "c.status",
      source: "c.source", lastResyncAt: "s.last_manual_resync_at",
    };
    const sortBy = request.sortBy ?? "businessDomain";
    const sortDirection = request.sortDirection ?? "asc";
    if (!Object.hasOwn(sortColumns, sortBy) || !["asc", "desc"].includes(sortDirection))
      throw new Error("RESOLUTION_CURRENCY_INVALID_SORT");
    const order = `${sortColumns[sortBy]} ${sortDirection.toUpperCase()},c.business_domain,c.currency_code`;
    const clauses = ["c.standards_release=?"];
    const parameters: string[] = [standardsRelease];
    if (request.businessDomain) {
      clauses.push("c.business_domain=?");
      parameters.push(request.businessDomain);
    }
    if (request.status) {
      clauses.push("c.status=?");
      parameters.push(request.status);
    }
    if (request.search?.trim()) {
      clauses.push("(instr(c.currency_code,?)>0 OR instr(c.business_domain,?)>0)");
      const search = request.search.trim().toUpperCase();
      parameters.push(search, search);
    }
    const where = clauses.join(" AND ");
    const totalItems = (this.db.prepare(
      `SELECT COUNT(*) AS count FROM resolution_currency_coverage c WHERE ${where}`,
    ).get(...parameters) as { count: number }).count;
    const items = this.db.prepare(`
      SELECT c.standards_release AS standardsRelease,
        c.business_domain AS businessDomain,
        c.currency_code AS currency,
        c.status,c.source,c.updated_at AS updatedAt,
        s.last_manual_resync_at AS lastResyncAt
      FROM resolution_currency_coverage c
      LEFT JOIN resolution_currency_sync_control s
        ON s.standards_release=c.standards_release
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `).all(...parameters, pageSize, (page - 1) * pageSize) as unknown as ResolutionCurrencyInquiryRow[];
    return {
      items, page, pageSize, totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
      hasPrevious: page > 1,
      hasNext: page * pageSize < totalItems,
    };
  }

  active(
    standardsRelease: string,
    businessDomain: ResolutionCurrencyCoverageRow["businessDomain"],
  ): string[] {
    const rows = this.db
      .prepare(
        `
        SELECT currency_code AS currency
        FROM resolution_currency_coverage
        WHERE standards_release=? AND business_domain=? AND status='ACTIVE'
        ORDER BY currency_code
      `,
      )
      .all(standardsRelease, businessDomain) as { currency: string }[];
    return rows.map(({ currency }) => currency);
  }

  syncState(standardsRelease: string): ResolutionCurrencySyncState | null {
    const row = this.db
      .prepare(
        `
        SELECT initialized,as_of_date AS asOfDate,
          last_manual_resync_at AS lastManualResyncAt
        FROM resolution_currency_sync_control
        WHERE standards_release=?
      `,
      )
      .get(standardsRelease) as
      | {
          initialized: number;
          asOfDate: string;
          lastManualResyncAt: string | null;
        }
      | undefined;
    return row
      ? {
          initialized: row.initialized === 1,
          asOfDate: row.asOfDate,
          lastManualResyncAt: row.lastManualResyncAt,
        }
      : null;
  }

  apply(
    standardsRelease: string,
    discovered: readonly DiscoveredCurrency[],
    mode: ResolutionCurrencyReconciliationMode,
    now: string,
    asOfDate: string,
    manualResync = true,
  ): ResolutionCurrencyApplyResult {
    if (discovered.some((row) => row.standardsRelease !== standardsRelease))
      throw new Error("RESOLUTION_CURRENCY_RELEASE_MISMATCH");
    const existing = this.inquiry(standardsRelease);
    const plan = planResolutionCurrencyReconciliation(
      existing,
      discovered.map((row) => ({ ...row, status: "ACTIVE" })),
      mode,
    );
    const insert = this.db.prepare(`
      INSERT INTO resolution_currency_coverage
        (standards_release,business_domain,currency_code,status,source,created_at,updated_at)
      VALUES (?,?,?,'ACTIVE','SSI_DISCOVERY',?,?)
    `);
    for (const row of plan.insert)
      insert.run(
        row.standardsRelease,
        row.businessDomain,
        row.currency,
        now,
        now,
      );
    if (mode === "FULL_RESYNC") {
      const update = this.db.prepare(`
        UPDATE resolution_currency_coverage
        SET status=?,updated_at=?
        WHERE standards_release=? AND business_domain=? AND currency_code=?
      `);
      for (const row of plan.activate)
        update.run(
          "ACTIVE",
          now,
          row.standardsRelease,
          row.businessDomain,
          row.currency,
        );
      for (const row of plan.inactivate)
        update.run(
          "INACTIVE",
          now,
          row.standardsRelease,
          row.businessDomain,
          row.currency,
        );
      this.db
        .prepare(
          `
          INSERT INTO resolution_currency_sync_control
            (standards_release,initialized,as_of_date,last_manual_resync_at)
          VALUES (?,1,?,?)
          ON CONFLICT(standards_release) DO UPDATE SET
            initialized=1,
            as_of_date=excluded.as_of_date,
            last_manual_resync_at=COALESCE(
              excluded.last_manual_resync_at,
              resolution_currency_sync_control.last_manual_resync_at
            )
        `,
        )
        .run(standardsRelease, asOfDate, manualResync ? now : null);
    }
    return {
      discovered: new Set(
        discovered.map((row) => `${row.businessDomain}:${row.currency}`),
      ).size,
      inserted: plan.insert.length,
      unchanged: plan.keep.length,
      activated: plan.activate.length,
      inactivated: plan.inactivate.length,
    };
  }
}
