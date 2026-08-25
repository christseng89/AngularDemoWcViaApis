/**
 * Repository over the balance_contracts table. Thin SQL wrapper — no
 * business logic here (that lives in src/domain/); this module only knows
 * how to read/write rows and enforce the DB-level uniqueness constraints
 * from Design doc §3.1/§8.
 */
import type { Db } from '../db';
import type { BalanceContract, ContractStatus, InstrumentType, NaturalKey } from '../types';

interface ContractRow {
  balance_contract_id: string;
  logical_contract_id: string;
  contract_version: number;
  instrument_type: InstrumentType;
  lc_number: string;
  ib_number: string | null;
  sg_number: string | null;
  leg_seq: string | null;
  parent_logical_contract_id: string | null;
  status: ContractStatus;
  supersedes_balance_contract_id: string | null;
  superseded_by_balance_contract_id: string | null;
  currency: string;
  tolerance_pct: string | null;
  tenor_type: string | null;
  tenor_days: number | null;
  maturity_date: string | null;
  expiry_date: string | null;
  mail_float_grace_days: number | null;
  opening_balance: string;
  source_amendment_no: number | null;
  effective_from: string;
  effective_to: string | null;
  created_by: string;
  created_at: string;
}

function rowToContract(row: ContractRow): BalanceContract {
  const naturalKey: NaturalKey = {
    lcNumber: row.lc_number,
    ibNumber: row.ib_number,
    sgNumber: row.sg_number,
    legSeq: row.leg_seq,
  };
  return {
    balanceContractId: row.balance_contract_id,
    logicalContractId: row.logical_contract_id,
    contractVersion: row.contract_version,
    instrumentType: row.instrument_type,
    naturalKey,
    parentLogicalContractId: row.parent_logical_contract_id,
    status: row.status,
    supersedesBalanceContractId: row.supersedes_balance_contract_id,
    supersededByBalanceContractId: row.superseded_by_balance_contract_id,
    currency: row.currency,
    tolerancePct: row.tolerance_pct,
    tenorType: row.tenor_type as BalanceContract['tenorType'],
    tenorDays: row.tenor_days,
    maturityDate: row.maturity_date,
    expiryDate: row.expiry_date,
    mailFloatGraceDays: row.mail_float_grace_days,
    openingBalance: row.opening_balance,
    sourceAmendmentNo: row.source_amendment_no,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export interface CatalogFilter {
  instrumentType: InstrumentType;
  /** Omit to return all statuses; pass e.g. 'ACTIVE' to restrict the picker to transactable contracts. */
  status?: ContractStatus;
  /** Case-insensitive substring match against lcNumber, for a typeahead. */
  q?: string;
  /**
   * Exact lcNumber match — business instruction 2026-08-14 "search LC
   * Index, then the IB Index... to pick up the LC Number and IB Number":
   * once an LC has been picked from the LC Index, the IB Index step needs
   * every IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT contract under EXACTLY that
   * LC. Deliberately separate from `q` (substring LIKE) — a substring match
   * here would risk "001" also matching "1001"/"2001", pulling in another
   * LC's Acceptances/SGs by accident.
   */
  lcNumber?: string;
  /**
   * Business-reported gap 2026-08-14 ("Why U002 does not shown A5 —
   * Document Arrival (Usance)?") — the Sight/Usance tenor split used to be
   * applied CLIENT-SIDE after server-side pagination, so a page of 10 raw
   * rows could contain almost none of the tenor the caller actually wanted
   * (U002/U003 were both Usance-tenor but landed on page 2, invisible on a
   * page 1 dominated by Sight LCs). Filtering server-side means page/total
   * reflect the ELIGIBLE set, not the raw one. Contracts with no tenorType
   * recorded (legacy, pre-v0.9) are never filtered out either way.
   */
  tenorFamily?: 'SIGHT' | 'USANCE';
  /** Business instruction 2026-08-14 "pickup 時 Order by Reference 而且需要 Page by Page設計" — 1-based; defaults to 1. */
  page?: number;
  /** Defaults to 10. */
  pageSize?: number;
  /**
   * Business-reported gap 2026-08-18 ("S10 still shown in A4 function which is wrong" — S10's own
   * ISSUE was still PENDING; "There are function dependency, if pending in previous event, then next
   * event cannot be accessed"). Opt-in (default false/omitted, preserving every existing caller's own
   * behavior unchanged — including this service's own internal SG-Issue-cap/Present-Docs-earmark/
   * sibling-snapshot candidate searches, which legitimately need to see a not-yet-released candidate
   * too) — when true, excludes any contract whose own CREATING movement (ISSUE for IPLC_LC/EPLC_LC/
   * EPLC_CONFIRMATION/SHGT; CREATE for IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION) is not yet
   * RELEASED — i.e. a contract that exists but hasn't cleared Checker approval yet. The Angular client
   * passes this from every Maker-side ACTION picker (CatalogPickerService, backing the flat-Catalog/
   * Parent-LC/IB-SG-Index pickers every A1-A9/B1-B5 function uses) but NOT from inquiry-only contexts
   * (Look Up Current Balance, Inquire Events) — a Maker/Checker can still legitimately look up a
   * still-pending record's own current state, just can't pick it to act on further.
   */
  requireIssueReleased?: boolean;
}

export interface CatalogPage {
  items: BalanceContract[];
  total: number;
  page: number;
  pageSize: number;
}

export class BalanceContractStore {
  constructor(private readonly db: Db) {}

  insert(contract: BalanceContract): void {
    this.db
      .prepare(
        `INSERT INTO balance_contracts (
          balance_contract_id, logical_contract_id, contract_version, instrument_type,
          lc_number, ib_number, sg_number, leg_seq, parent_logical_contract_id, status,
          supersedes_balance_contract_id, superseded_by_balance_contract_id, currency,
          tolerance_pct, tenor_type, tenor_days, maturity_date, expiry_date, mail_float_grace_days,
          opening_balance, source_amendment_no, effective_from, effective_to, created_by, created_at
        ) VALUES (
          @balanceContractId, @logicalContractId, @contractVersion, @instrumentType,
          @lcNumber, @ibNumber, @sgNumber, @legSeq, @parentLogicalContractId, @status,
          @supersedesBalanceContractId, @supersededByBalanceContractId, @currency,
          @tolerancePct, @tenorType, @tenorDays, @maturityDate, @expiryDate, @mailFloatGraceDays,
          @openingBalance, @sourceAmendmentNo, @effectiveFrom, @effectiveTo, @createdBy, @createdAt
        )`,
      )
      .run({
        balanceContractId: contract.balanceContractId,
        logicalContractId: contract.logicalContractId,
        contractVersion: contract.contractVersion,
        instrumentType: contract.instrumentType,
        lcNumber: contract.naturalKey.lcNumber,
        ibNumber: contract.naturalKey.ibNumber ?? null,
        sgNumber: contract.naturalKey.sgNumber ?? null,
        legSeq: contract.naturalKey.legSeq ?? null,
        parentLogicalContractId: contract.parentLogicalContractId ?? null,
        status: contract.status,
        supersedesBalanceContractId: contract.supersedesBalanceContractId ?? null,
        supersededByBalanceContractId: contract.supersededByBalanceContractId ?? null,
        currency: contract.currency,
        tolerancePct: contract.tolerancePct ?? null,
        tenorType: contract.tenorType ?? null,
        tenorDays: contract.tenorDays ?? null,
        maturityDate: contract.maturityDate ?? null,
        expiryDate: contract.expiryDate ?? null,
        mailFloatGraceDays: contract.mailFloatGraceDays ?? null,
        openingBalance: contract.openingBalance,
        sourceAmendmentNo: contract.sourceAmendmentNo ?? null,
        effectiveFrom: contract.effectiveFrom,
        effectiveTo: contract.effectiveTo ?? null,
        createdBy: contract.createdBy,
        createdAt: contract.createdAt,
      });
  }

  findById(balanceContractId: string): BalanceContract | undefined {
    const row = this.db.prepare(`SELECT * FROM balance_contracts WHERE balance_contract_id = ?`).get(balanceContractId) as ContractRow | undefined;
    return row ? rowToContract(row) : undefined;
  }

  /** Design doc §3.1 — at most one ACTIVE version per logicalContractId. */
  findActiveByLogicalContractId(logicalContractId: string): BalanceContract | undefined {
    const row = this.db.prepare(`SELECT * FROM balance_contracts WHERE logical_contract_id = ? AND status = 'ACTIVE'`).get(logicalContractId) as
      ContractRow | undefined;
    return row ? rowToContract(row) : undefined;
  }

  /** Design doc §3.3 "呼叫端的實際使用方式" — resolve the natural key to its current ACTIVE version. */
  findActiveByNaturalKey(instrumentType: InstrumentType, naturalKey: NaturalKey): BalanceContract | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM balance_contracts
         WHERE instrument_type = ? AND status = 'ACTIVE'
           AND lc_number = ?
           AND ib_number IS ? AND sg_number IS ? AND leg_seq IS ?`,
      )
      .get(instrumentType, naturalKey.lcNumber, naturalKey.ibNumber ?? null, naturalKey.sgNumber ?? null, naturalKey.legSeq ?? null) as ContractRow | undefined;
    return row ? rowToContract(row) : undefined;
  }

  /**
   * F1 (external BA review) §8.6 — `AMEND_EXPIRY_DATE`'s own Expiry Extension Amendment entry point
   * needs a dedicated resolver for an `EXPIRED` contract; `findActiveByNaturalKey()` above cannot find
   * one (ACTIVE-only WHERE clause, by design — every OTHER function must keep failing to resolve an
   * EXPIRED contract, that's the mechanism §7.8 relies on to block A2/A3/A3S/A8/B3 automatically).
   * Deliberately narrow — only Extension Amendment's own resolution path should call this.
   */
  findExpiredByNaturalKey(instrumentType: InstrumentType, naturalKey: NaturalKey): BalanceContract | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM balance_contracts
         WHERE instrument_type = ? AND status = 'EXPIRED'
           AND lc_number = ?
           AND ib_number IS ? AND sg_number IS ? AND leg_seq IS ?`,
      )
      .get(instrumentType, naturalKey.lcNumber, naturalKey.ibNumber ?? null, naturalKey.sgNumber ?? null, naturalKey.legSeq ?? null) as ContractRow | undefined;
    return row ? rowToContract(row) : undefined;
  }

  /**
   * F1 (external BA review) §9.6 — A11/B7 Reopen's own resolver for a `CLOSED` contract, same shape and
   * same rationale as findExpiredByNaturalKey() above (deliberately narrow, only Reopen's own resolution
   * path should call this).
   */
  findClosedByNaturalKey(instrumentType: InstrumentType, naturalKey: NaturalKey): BalanceContract | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM balance_contracts
         WHERE instrument_type = ? AND status = 'CLOSED'
           AND lc_number = ?
           AND ib_number IS ? AND sg_number IS ? AND leg_seq IS ?`,
      )
      .get(instrumentType, naturalKey.lcNumber, naturalKey.ibNumber ?? null, naturalKey.sgNumber ?? null, naturalKey.legSeq ?? null) as ContractRow | undefined;
    return row ? rowToContract(row) : undefined;
  }

  /**
   * A10/B6 Close — Look Up Current Balance / Inquire Events must still be able to resolve a CLOSED
   * contract by natural key (user-reported gap, 2026-08-21: "CLOSE LC => Release 後出現 'No Logical
   * Contract exists yet for this natural key.' 這是不對的... LOOKUP也應該看到此LC 項下所有的交易包括CLOSE
   * EVENT" — inquiry contexts must see it, only transaction-creating ones stay ACTIVE-only via
   * findActiveByNaturalKey above). Same WHERE clause minus `status = 'ACTIVE'`, ordered so an ACTIVE row
   * wins if one exists (the common case), else the most recently created row — covers the edge case of a
   * natural key re-ISSUEd after its own prior CLOSE (re-ISSUE's own guard only blocks a duplicate while
   * an ACTIVE version exists, see service/balanceService.ts's own resolveOrCreateContract()), so a stale
   * CLOSED row from BEFORE a genuine re-ISSUE never shadows the current one.
   */
  findByNaturalKey(instrumentType: InstrumentType, naturalKey: NaturalKey): BalanceContract | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM balance_contracts
         WHERE instrument_type = ?
           AND lc_number = ?
           AND ib_number IS ? AND sg_number IS ? AND leg_seq IS ?
         ORDER BY (status = 'ACTIVE') DESC, created_at DESC
         LIMIT 1`,
      )
      .get(instrumentType, naturalKey.lcNumber, naturalKey.ibNumber ?? null, naturalKey.sgNumber ?? null, naturalKey.legSeq ?? null) as ContractRow | undefined;
    return row ? rowToContract(row) : undefined;
  }

  /**
   * F1 (external BA review) — AUTO EXPIRY's own candidate list: every ACTIVE root LC/Confirmation with
   * a recorded expiry_date, across all 3 root instrumentTypes in one query (spares
   * BalanceService.runAutoExpirySweep() from issuing 3 separate listCatalog() calls, one per
   * instrumentType). Date filtering (expiry_date + mail_float_grace_days vs. now) happens in the
   * service layer via domain/expiryEligibility.ts's isPastExpiryGrace() — this method only narrows to
   * "has a recorded expiry date at all", not "past it yet".
   */
  listActiveExpirable(): BalanceContract[] {
    const rows = this.db
      .prepare(`SELECT * FROM balance_contracts WHERE status = 'ACTIVE' AND expiry_date IS NOT NULL AND instrument_type IN ('IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION')`)
      .all() as unknown as ContractRow[];
    return rows.map(rowToContract);
  }

  /**
   * F1 (external BA review) §7.3 — AUTO CLOSE's own candidate list: every EXPIRED root LC/Confirmation,
   * same "one query across all 3 root instrumentTypes" shape as listActiveExpirable() above.
   */
  listExpiredContracts(): BalanceContract[] {
    const rows = this.db
      .prepare(`SELECT * FROM balance_contracts WHERE status = 'EXPIRED' AND instrument_type IN ('IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION')`)
      .all() as unknown as ContractRow[];
    return rows.map(rowToContract);
  }

  /** Design doc §7.3 — full version history of a Logical Contract, ordered by contractVersion ascending. */
  listVersions(logicalContractId: string): BalanceContract[] {
    const rows = this.db
      .prepare(`SELECT * FROM balance_contracts WHERE logical_contract_id = ? ORDER BY contract_version ASC`)
      .all(logicalContractId) as unknown as ContractRow[];
    return rows.map(rowToContract);
  }

  /**
   * Catalog picker — "除了開證，其他交易可以選 LC Number via Catalog" (business
   * instruction, 2026-08-14). Params are built to match exactly the
   * placeholders present in the SQL text — node:sqlite (unlike
   * better-sqlite3) rejects a bound object containing a named parameter the
   * query text never references.
   *
   * Business instruction 2026-08-14 "pickup 時 Order by Reference 而且需要
   * Page by Page設計" — ordered by lc_number (ascending, the natural
   * "Reference" a user picks by), not insertion time, and paginated
   * (page/pageSize) rather than returning the whole table at once.
   */
  listCatalog(filter: CatalogFilter): CatalogPage {
    const clauses = ['instrument_type = @instrumentType'];
    const whereParams: Record<string, string> = { instrumentType: filter.instrumentType };
    if (filter.status) {
      clauses.push('status = @status');
      whereParams.status = filter.status;
    }
    if (filter.q) {
      clauses.push('lc_number LIKE @q');
      whereParams.q = `%${filter.q}%`;
    }
    if (filter.lcNumber) {
      clauses.push('lc_number = @lcNumber');
      whereParams.lcNumber = filter.lcNumber;
    }
    if (filter.tenorFamily === 'SIGHT') {
      clauses.push(`(tenor_type = 'SIGHT' OR tenor_type IS NULL)`);
    } else if (filter.tenorFamily === 'USANCE') {
      clauses.push(`(tenor_type != 'SIGHT' OR tenor_type IS NULL)`);
    }
    if (filter.requireIssueReleased) {
      clauses.push(
        `EXISTS (SELECT 1 FROM balance_movements m WHERE m.balance_contract_id = balance_contracts.balance_contract_id ` +
          `AND m.movement_type IN ('ISSUE', 'CREATE') AND m.status = 'RELEASED')`,
      );
    }
    const where = clauses.join(' AND ');

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS n FROM balance_contracts WHERE ${where}`).get(whereParams) as { n: number } | undefined;
    const total = totalRow?.n ?? 0;

    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const pageSize = filter.pageSize && filter.pageSize > 0 ? filter.pageSize : 10;
    const offset = (page - 1) * pageSize;

    const rows = this.db
      .prepare(`SELECT * FROM balance_contracts WHERE ${where} ORDER BY lc_number ASC LIMIT @limit OFFSET @offset`)
      .all({ ...whereParams, limit: pageSize, offset }) as unknown as ContractRow[];

    return { items: rows.map(rowToContract), total, page, pageSize };
  }

  /** Design doc §7.3 — mark the current ACTIVE version SUPERSEDED and point it at its successor, in one call (caller wraps this + the new insert() in one db.transaction()). */
  markSuperseded(balanceContractId: string, supersededByBalanceContractId: string, effectiveTo: string): void {
    this.db
      .prepare(
        `UPDATE balance_contracts
         SET status = 'SUPERSEDED', superseded_by_balance_contract_id = @supersededByBalanceContractId, effective_to = @effectiveTo
         WHERE balance_contract_id = @balanceContractId`,
      )
      .run({ balanceContractId, supersededByBalanceContractId, effectiveTo });
  }

  /**
   * A10/B6 Close — release() side effect once its own CLOSE movement is Checker-Released (mirrors
   * markSuperseded() above's shape). `effectiveTo` matches how `effective_from` is stamped at ISSUE
   * (service/balanceService.ts's own createContract()) — the contract's own lifecycle end date, not the
   * CLOSE movement's own createdAt/releasedAt pair (already recorded on that movement itself).
   */
  markClosed(balanceContractId: string, effectiveTo: string): void {
    this.db.prepare(`UPDATE balance_contracts SET status = 'CLOSED', effective_to = @effectiveTo WHERE balance_contract_id = @balanceContractId`).run({
      balanceContractId,
      effectiveTo,
    });
  }

  /**
   * F1 (external BA review) — AUTO EXPIRY's own release() side effect, same shape as markClosed()
   * above. Mirrors it exactly (status + effective_to only) rather than sharing one parameterized
   * function — two one-line methods are simpler to read than a status-parameter indirection for a
   * two-member set.
   */
  markExpired(balanceContractId: string, effectiveTo: string): void {
    this.db.prepare(`UPDATE balance_contracts SET status = 'EXPIRED', effective_to = @effectiveTo WHERE balance_contract_id = @balanceContractId`).run({
      balanceContractId,
      effectiveTo,
    });
  }

  /**
   * F1 (external BA review) §8/§9 — Expiry Extension Amendment (EXPIRED -> ACTIVE) and A11/B7 Reopen
   * (CLOSED -> ACTIVE or EXPIRED, see §9.1/§9.2) both reactivate a contract's own row, and — only for
   * Extension — persist the new `expiry_date` the Checker just approved. `newExpiryDate` is omitted for
   * a plain Reopen-without-extension (§9.1, original expiry date still in the future, nothing to change).
   *
   * `effective_to`: `NULL` when reactivating to `ACTIVE` (the contract is current again, same convention
   * as every other "currently in force" row). When reactivating to `EXPIRED` (§9.2 Option A — REOPEN
   * restores a CLOSED contract whose own expiryDate is already past), `effective_to` is instead stamped
   * with `releasedAt` — the same "became EXPIRED at this moment" convention `markExpired()` already uses
   * — NOT left `NULL` (F1 proposal §13.7, 2026-08-25 BA finding: a `NULL` here reads as "still current"
   * for an EXPIRED row, and the planned Auto Close Grace Period §13.5 needs this field as its own
   * "became EXPIRED at" anchor to compute N business days from).
   */
  reactivate(balanceContractId: string, newStatus: 'ACTIVE' | 'EXPIRED', releasedAt: string, newExpiryDate?: string | null): void {
    const effectiveTo = newStatus === 'EXPIRED' ? releasedAt : null;
    if (newExpiryDate !== undefined) {
      this.db
        .prepare(`UPDATE balance_contracts SET status = @newStatus, effective_to = @effectiveTo, expiry_date = @newExpiryDate WHERE balance_contract_id = @balanceContractId`)
        .run({ balanceContractId, newStatus, effectiveTo, newExpiryDate });
    } else {
      this.db
        .prepare(`UPDATE balance_contracts SET status = @newStatus, effective_to = @effectiveTo WHERE balance_contract_id = @balanceContractId`)
        .run({ balanceContractId, newStatus, effectiveTo });
    }
  }
}
