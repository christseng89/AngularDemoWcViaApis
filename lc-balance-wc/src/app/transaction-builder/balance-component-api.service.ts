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
  /** Carries the Amendment No./Times or the Document Arrival's IB Number, per function (Design doc §3.3 audit reference field). */
  sourceTransactionRef?: string | null;
  /** A3S only (Design doc §3.3) — links a Document Arrival's own UTILIZE to its matched SG's FULL_REDEEM for audit/query purposes; not an atomicity guarantee (§3.3's own documented scope). */
  businessEventId?: string | null;
  /**
   * A6/B4 only — movementId of the pre-existing source Document Arrival/Present Docs record this
   * finalizes. Distinct from businessEventId (links only movements created together) — lets an
   * independent Checker session resolve/release the source without the Maker's own in-memory state.
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
  /** Design doc §7 Tenor Type Routing — declared at Issue, used to filter the Parent LC picker for Create Acceptance. */
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE' | null;
  /** The parent LC's own declared Tenor Days, copied onto A6/B4's Acceptance instead of being freely typed. */
  tenorDays?: number | null;
}

/** Items are ordered by lc_number ascending, page by page. */
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
  /** EPLC_CONFIRMATION only, null otherwise — Present Docs Earmark (Pending/Approved). */
  presentDocsEarmarkPending?: string | null;
  presentDocsEarmarkApproved?: string | null;
  /**
   * Set only on a REDIRECTED snapshot (SHGT/EPLC_EXAMINATION events) — names which field above carries
   * the before→after this event caused, since balanceBefore/balanceAfter track the CHILD's own balance,
   * not this (parent) snapshot's own moved field.
   */
  redirectedImpact?: { label: 'offBalanceExposure' | 'presentDocsEarmarkPending' | 'presentDocsEarmarkApproved'; before: string; after: string } | null;
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

/** Mirrors the microservice's own `src/types.ts` BalanceMovement shape, kept in sync by hand (Quality-report-balance.md BAL-006). */
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
  /** See CreateMovementRequest.referencedTransactionId's own doc comment for the full rule. */
  referencedTransactionId?: string | null;
  warnings?: MovementWarning[] | null;
  contingentAccountEntry?: ContingentAccountEntry | null;
  createdBy: string;
  releasedBy?: string | null;
  createdAt: string;
  releasedAt?: string | null;
  /** release() on the microservice side always computes and persists both fields (see the microservice's own `src/types.ts`). */
  balanceBefore?: string | null;
  balanceAfter?: string | null;
  /** A3/A3S only. Restored 2026-08-20 (see acknowledge() below) — set once the Checker approves the Document Arrival; status stays PENDING (A4/A6 finalizes it for real later). */
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  /**
   * EPLC_EXAMINATION/CREATE only. Set as a side effect of release() on the linked HONOUR/ACCEPT
   * movement — the moment B4 actually consumes the presentation, not when B3 itself is Released. Still
   * occupies Present Docs Earmark capacity until then (see domain/offBalanceExposure.ts).
   */
  presentDocsConsumedAt?: string | null;
  /** Audit metadata only, paired with presentDocsConsumedAt above — the checkerId who released the consuming HONOUR/ACCEPT. */
  presentDocsConsumedBy?: string | null;
  /** A4 only. Set via submitByMaker() below; status stays PENDING — the Checker's release() is still the real finalizing transition. */
  makerSubmittedBy?: string | null;
  makerSubmittedAt?: string | null;
  /**
   * BalanceSnapshot captured at createMovement() (PENDING) and overwritten at release() (RELEASED) —
   * only one is ever stored. Null before this field existed and for reject()/cancel(). Read directly by
   * InquireEventsService.selectEvent() instead of a separate getBalanceAsOfMovement() call when present.
   */
  eventSnapshot?: BalanceSnapshot | null;
  /**
   * Child-ledger movements only (SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION): the PARENT
   * LC/Confirmation's own plain balance at the same moment as eventSnapshot above — additional to it,
   * never a replacement. Read by Inquire Events' Balance Tabs whenever the selected Event's contract
   * isn't the root itself.
   */
  rootEventSnapshot?: BalanceSnapshot | null;
  /**
   * The ONE Acceptance contract's own current balance under this movement's root LC, captured only when
   * exactly one such contract exists (ambiguous otherwise, left null). Null when this movement's own
   * contract already is an Acceptance — see BalanceService.captureSiblingSnapshots on the microservice.
   */
  acceptanceEventSnapshot?: BalanceSnapshot | null;
  /** Same rule as acceptanceEventSnapshot above, for the ONE Shipping Guarantee contract instead (Import-side only). */
  sgEventSnapshot?: BalanceSnapshot | null;
  /**
   * Set only when release() finalizes a Sight-tenor IPLC_LC/UTILIZE (A4): the release-time balance,
   * without overwriting eventSnapshot above (which stays frozen at createMovement() time). Read by
   * InquireEventsService's own 'finalize'-phase row instead of eventSnapshot.
   */
  finalizeEventSnapshot?: BalanceSnapshot | null;
  /**
   * Release-time counterpart to acceptanceEventSnapshot, same freeze as finalizeEventSnapshot: a sibling
   * contract may not exist yet at createMovement() time, so a later Release must not silently overwrite
   * that correct null with a by-then-existing balance.
   */
  finalizeAcceptanceEventSnapshot?: BalanceSnapshot | null;
  /** Same rule as finalizeAcceptanceEventSnapshot above, for the ONE Shipping Guarantee contract instead (Import-side only). */
  finalizeSgEventSnapshot?: BalanceSnapshot | null;
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

  /** Maker-initiated withdrawal of their own still-PENDING entry (EC), distinct from reject() (a Checker's 4-eyes decline). */
  cancel(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/cancel`, { cancelledBy, reasonCode, remarks });
  }

  /** A3/A3S only. Restored 2026-08-20 — the Checker's own acknowledgment on the LC's own UTILIZE (status stays PENDING; A4/A6 finalizes for real later). B3's own Checker Release is still the standard release() above. */
  acknowledge(movementId: string, acknowledgedBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/acknowledge`, { acknowledgedBy });
  }

  /** A4's own real Maker action; a genuine backend acknowledgment (status stays PENDING — the Checker's release() below is still the real finalizing transition), not a new movement. */
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
   * @param lcNumber — exact match: once an LC is picked from the LC Index, drives the IB Index step to
   *   exactly that LC's own IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT rows. Separate from `q` (substring
   *   typeahead) — see balanceContractStore.ts's CatalogFilter for why a substring match is unsafe here.
   * @param tenorFamily — filtered server-side so page/total reflect the Sight/Usance-eligible set, not
   *   the raw one (a client-side-only filter could hide eligible LCs on other pages).
   * @param requireIssueReleased — excludes a contract whose own creating movement (ISSUE/CREATE) hasn't
   *   been Checker-Released yet. Opt-in — `CatalogPickerService` passes `true` for every Maker-side
   *   ACTION picker; Look Up Current Balance / Inquire Events omit it.
   */
  catalog(
    instrumentType: InstrumentType,
    status?: string,
    q?: string,
    page = 1,
    pageSize = 10,
    lcNumber?: string,
    tenorFamily?: 'SIGHT' | 'USANCE',
    requireIssueReleased?: boolean,
  ): Observable<CatalogPage> {
    const params: Record<string, string | number> = { instrumentType, page, pageSize };
    if (status) params['status'] = status;
    if (q) params['q'] = q;
    if (lcNumber) params['lcNumber'] = lcNumber;
    if (tenorFamily) params['tenorFamily'] = tenorFamily;
    if (requireIssueReleased) params['requireIssueReleased'] = 'true';
    return this.http.get<CatalogPage>(`${this.base}/balance-contracts/catalog`, { params });
  }

  getSnapshot(balanceContractId: string): Observable<BalanceSnapshot> {
    return this.http.get<BalanceSnapshot>(`${this.base}/balance-contracts/${balanceContractId}/balance`);
  }

  /** Event timeline — every movement against one contract, in eventSeq (time) order. */
  listMovements(balanceContractId: string): Observable<BalanceMovement[]> {
    return this.http.get<BalanceMovement[]>(`${this.base}/balance-contracts/${balanceContractId}/movements`);
  }

  /**
   * Point-in-time BalanceSnapshot for the given movement's own contract, "as of" that exact movement.
   * Known limitation: offBalanceExposure/tightAvailableBalance are NOT point-in-time, they always
   * reflect the SHGT side's current state — see service/balanceService.ts's own
   * getBalanceSnapshotAsOfMovement() doc comment.
   */
  getBalanceAsOfMovement(movementId: string): Observable<BalanceSnapshot> {
    return this.http.get<BalanceSnapshot>(`${this.base}/balance-movements/${movementId}/balance-as-of`);
  }

  /**
   * Lets checker-actions.service.ts resolve a compound submission's linked leg(s) (A3S's SG redemption,
   * B5's Reimbursement Receivable) by their shared businessEventId, independent of the Maker's own
   * in-memory submitResult. Cross-contract by design (the SG's own balanceContractId differs from the
   * LC's).
   */
  findByBusinessEventId(businessEventId: string): Observable<BalanceMovement[]> {
    return this.http.get<BalanceMovement[]>(`${this.base}/balance-movements`, { params: { businessEventId } });
  }
}
