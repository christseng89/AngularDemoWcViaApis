import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { InstrumentType } from './balance-component.model';

export interface NaturalKey {
  lcNumber: string;
  ibNumber?: string | null;
  sgNumber?: string | null;
}

export interface CreateMovementRequest {
  instrumentType: InstrumentType;
  naturalKey?: NaturalKey;
  balanceContractId?: string;
  movementType: string;
  eventSeq: number;
  amount: string;
  currency: string;
  tolerancePct?: string | null;
  parentLogicalContractId?: string | null;
  exposureNature?: 'CONTINGENT' | 'ACTUAL' | 'MEMO';
  /** Business instruction 2026-08-14 — carries the Amendment No./Times or the Document Arrival's IB Number, per function (Design doc §3.3 audit reference field). */
  sourceTransactionRef?: string | null;
  /** A3S only (Design doc §3.3) — links a Document Arrival's own UTILIZE to its matched SG's FULL_REDEEM for audit/query purposes; not an atomicity guarantee (§3.3's own documented scope). */
  businessEventId?: string | null;
  /**
   * Bug fixed 2026-08-16 ("A6/B4 也修一下") — A6/B4 only: the movementId of the pre-existing source
   * Document Arrival/Present Docs record this movement converts/finalizes (this.selectedPayMovement at
   * Submit time). Distinct from businessEventId above (which only links movements CREATED TOGETHER in
   * one submission) — the source record here was created by an earlier, separate submission and never
   * shares a businessEventId with this one. Lets a genuinely independent Checker session resolve and
   * release the source record without needing the Maker's own in-memory selectedPayMovement — see
   * checker-actions.service.ts's own doc comment for the full mechanism.
   */
  referencedTransactionId?: string | null;
  /** Design doc §7 Tenor Type Routing (v0.7) — only for Acceptance (A6/B4). SELLERS_USANCE/BUYERS_USANCE share identical Balance mechanics; this is audit/reporting only. */
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE' | null;
  tenorDays?: number | null;
  createdBy: string;
}

export interface BalanceContract {
  balanceContractId: string;
  logicalContractId: string;
  instrumentType: InstrumentType;
  naturalKey: NaturalKey;
  status: string;
  currency: string;
  tolerancePct?: string | null;
  /** Design doc §7 Tenor Type Routing — declared at Issue, used to filter the Parent LC picker for Create Acceptance (business instruction 2026-08-14). */
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE' | null;
  /** Business instruction 2026-08-14 ("Tenor Type and Tenor days should carry from the LC Number and protected") — the parent LC's own declared Tenor Days, copied onto A6/B4's Acceptance instead of being freely typed. */
  tenorDays?: number | null;
}

/** Business instruction 2026-08-14 "pickup 時 Order by Reference 而且需要 Page by Page設計" — items are ordered by lc_number ascending. */
export interface CatalogPage {
  items: BalanceContract[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BalanceSnapshot {
  balanceContractId: string;
  logicalContractId: string;
  currency: string;
  confirmedBalance: string;
  availableBalance: string;
  pendingEarmarkTotal: string;
  offBalanceExposure?: string | null;
  tightAvailableBalance?: string | null;
  /** Business instruction 2026-08-15 ("Present Docs Earmark (Pending/Approved)") — EPLC_CONFIRMATION only, null otherwise. */
  presentDocsEarmarkPending?: string | null;
  presentDocsEarmarkApproved?: string | null;
}

export interface MovementWarning {
  code: 'OFF_BALANCE_EXPOSURE_WARNING';
  message: string;
  offBalanceExposureAtCheck?: string | null;
  tightAvailableBalance?: string | null;
}

/**
 * analysis/contingent-liability-ledger.html — the Dr/Cr contingent-liability account-entry pair the
 * microservice derives once, server-side, at movement creation (domain/contingentAccountEntry.ts), and
 * persists immutably with the movement. Null when the movement's own instrumentType is outside the
 * Balance Component's contingent/off-balance-sheet scope (the ON_BALANCE_ASSET instruments a
 * Confirmation's own Honour/Accept transforms into) — on-balance-sheet liability is never populated
 * here, by design.
 */
export interface ContingentAccountEntry {
  drAccount: string;
  crAccount: string;
  currency: string;
  amount: string;
}

/**
 * Quality-report-balance.md BAL-006: mirrors the microservice's own `src/types.ts` BalanceMovement
 * shape (kept in sync by hand, same convention `balance-component.model.ts`'s own doc comment already
 * uses for the design-doc field/rule tables) — replaces the `Observable<any>`/`Observable<any[]>`
 * return types every mutating/listing method below used to have. Deliberately permissive on fields this
 * client never reads (index-signature-free, but every field the component actually touches — status,
 * movementType, sourceTransactionRef, amount, ceilingAmount, warnings, acknowledgedAt, etc. — is here),
 * and deliberately does NOT try to type the synthetic-field-merge some component call sites do (e.g.
 * loadPayableMovementsAcrossChildContracts's `{ ...m, sourceTransactionRef: ... }`) differently from a
 * real one — spreading a typed object and overriding one already-optional field stays type-compatible.
 */
export interface BalanceMovement {
  movementId: string;
  balanceContractId: string;
  eventSeq: number;
  businessEventId?: string | null;
  movementType: string;
  exposureNature: 'CONTINGENT' | 'ACTUAL' | 'MEMO';
  amount: string;
  ceilingAmount: string;
  currency: string;
  status: 'PENDING' | 'RELEASED' | 'REJECTED' | 'CANCELLED' | 'SUPERSEDED';
  reasonCode?: string | null;
  remarks?: string | null;
  sourceTransactionRef?: string | null;
  /** Bug fixed 2026-08-16 ("A6/B4 也修一下") — see CreateMovementRequest.referencedTransactionId's own doc comment for the full rule. */
  referencedTransactionId?: string | null;
  warnings?: MovementWarning[] | null;
  contingentAccountEntry?: ContingentAccountEntry | null;
  createdBy: string;
  releasedBy?: string | null;
  createdAt: string;
  releasedAt?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  /**
   * A4 (Sight Settlement) only (2026-08-16, business instruction "Add real Maker Submit, then have
   * Checker to Release it. Exactly the same as A1."). Set via submitByMaker() below — see the
   * microservice's own BalanceMovement.makerSubmittedAt doc comment for the full rationale (mirrors
   * acknowledgedBy/acknowledgedAt's shape, but on the Maker side; status stays PENDING either way).
   */
  makerSubmittedBy?: string | null;
  makerSubmittedAt?: string | null;
}

/**
 * Talks DIRECTLY to the balance-component microservice (via the
 * /balance-component proxy path) — same posture as lc-payment-wc's own
 * payment-component-api.service.ts talking straight to
 * microservices/payment-component, bypassing the Node.js 中台 orchestrator
 * entirely. The 中台 is only for replaying the fixed Business Case
 * Registry; ad-hoc manual transaction testing goes straight to the API.
 */
@Injectable({ providedIn: 'root' })
export class BalanceComponentApiService {
  private readonly base = '/balance-component';

  constructor(private readonly http: HttpClient) {}

  createMovement(req: CreateMovementRequest): Observable<HttpResponse<BalanceMovement>> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements`, req, { observe: 'response' });
  }

  release(movementId: string, releasedBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/release`, { releasedBy });
  }

  reject(movementId: string, releasedBy: string, reasonCode: string, remarks?: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/reject`, { releasedBy, reasonCode, remarks });
  }

  /** Business instruction 2026-08-15 ("option for Maker to Delete Pending, i.e. EC") — Maker-initiated withdrawal of their own still-PENDING entry, distinct from reject() (a Checker's 4-eyes decline). */
  cancel(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/cancel`, { cancelledBy, reasonCode, remarks });
  }

  /** Business instruction 2026-08-15 ("Present Docs Earmark (Pending/Approved)") — B3's own Checker Release; a real backend acknowledgment (status stays PENDING — B4 still finds/consumes it), not the plain release() transition. */
  acknowledge(movementId: string, acknowledgedBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/acknowledge`, { acknowledgedBy });
  }

  /** Business instruction 2026-08-16 ("Add real Maker Submit, then have Checker to Release it. Exactly the same as A1.") — A4's own real Maker action; a genuine backend acknowledgment (status stays PENDING — the Checker's own release() below is still the real finalizing transition), not a new movement. */
  submitByMaker(movementId: string, makerSubmittedBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/maker-submit`, { makerSubmittedBy });
  }

  resolveContract(instrumentType: InstrumentType, naturalKey: NaturalKey): Observable<BalanceContract> {
    const params: Record<string, string> = { instrumentType, lcNumber: naturalKey.lcNumber };
    if (naturalKey.ibNumber) params['ibNumber'] = naturalKey.ibNumber;
    if (naturalKey.sgNumber) params['sgNumber'] = naturalKey.sgNumber;
    return this.http.get<BalanceContract>(`${this.base}/balance-contracts`, { params });
  }

  /**
   * @param lcNumber — exact match (business instruction 2026-08-14 "search
   *   LC Index, then the IB Index... to pick up the LC Number and IB
   *   Number"): once an LC is picked from the LC Index, this drives the IB
   *   Index step to exactly that LC's own IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/
   *   SHGT rows. Deliberately separate from `q` (substring typeahead) —
   *   see balanceContractStore.ts's CatalogFilter for why a substring match
   *   would be unsafe here.
   */
  /**
   * @param tenorFamily — business-reported gap 2026-08-14 ("Why U002 does
   *   not shown A5 — Document Arrival (Usance)?"): filtered server-side so
   *   page/total reflect the Sight/Usance-ELIGIBLE set, not the raw one —
   *   a client-side-only filter let a page of 10 raw rows contain almost
   *   none of the tenor actually wanted, hiding eligible LCs on other pages.
   */
  catalog(
    instrumentType: InstrumentType,
    status?: string,
    q?: string,
    page = 1,
    pageSize = 10,
    lcNumber?: string,
    tenorFamily?: 'SIGHT' | 'USANCE',
  ): Observable<CatalogPage> {
    const params: Record<string, string | number> = { instrumentType, page, pageSize };
    if (status) params['status'] = status;
    if (q) params['q'] = q;
    if (lcNumber) params['lcNumber'] = lcNumber;
    if (tenorFamily) params['tenorFamily'] = tenorFamily;
    return this.http.get<CatalogPage>(`${this.base}/balance-contracts/catalog`, { params });
  }

  getSnapshot(balanceContractId: string): Observable<BalanceSnapshot> {
    return this.http.get<BalanceSnapshot>(`${this.base}/balance-contracts/${balanceContractId}/balance`);
  }

  /** Event timeline (business instruction 2026-08-14) — every movement against one contract, in eventSeq (time) order. */
  listMovements(balanceContractId: string): Observable<BalanceMovement[]> {
    return this.http.get<BalanceMovement[]>(`${this.base}/balance-contracts/${balanceContractId}/movements`);
  }

  /**
   * Bug fixed 2026-08-16, reviewer-reported ("A1 -> A8 -> A3S -> A4, the related SG entries was not
   * shown") — lets checker-actions.service.ts resolve a compound submission's linked leg(s) (A3S's SG
   * redemption, B5's Reimbursement Receivable) by their shared businessEventId, independent of the
   * Maker's own in-memory submitResult. Cross-contract by design (the SG's own balanceContractId
   * differs from the LC's) — see the microservice's own store.findByBusinessEventId doc comment.
   */
  findByBusinessEventId(businessEventId: string): Observable<BalanceMovement[]> {
    return this.http.get<BalanceMovement[]>(`${this.base}/balance-movements`, { params: { businessEventId } });
  }
}
