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
  toleranceChangePct?: string | null;
  toleranceChangeDirection?: 'INCREASE' | 'DECREASE' | null;
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
  /** F1 (external BA review, v1.19.0) — A1/B1 (ISSUE) only, optional. The LC's own UCP 600 Art.6(d) expiry/validity date; the microservice captures mailFloatGraceDays onto the contract server-side from config, never client-supplied. */
  expiryDate?: string | null;
  /** F1 — AMEND_EXPIRY_DATE only (A2/B2's third subChoice option). The new expiry date, either a plain amendment (contract ACTIVE) or an Expiry Extension Amendment (contract EXPIRED) depending on the resolved contract's own current status — the UI never distinguishes the two, the server does. */
  newExpiryDate?: string | null;
  /** F1 proposal §13.1 item 4 (CLOSE)/item 3(a) (REOPEN), BA-ratified 2026-08-25 — mandatory for A10/B6/A11/B7; the microservice rejects a Submit with none for those two movementTypes. */
  reasonCode?: string | null;
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
  /** F1 (external BA review, v1.19.0) — the LC's own UCP 600 Art.6(d) expiry/validity date, IPLC_LC/EPLC_LC/EPLC_CONFIRMATION only. Independent of maturityDate (Usance/Acceptance's own due date, unrelated concept; not modeled client-side). Amendable via A2/B2's third subChoice option (movementType 'AMEND_EXPIRY_DATE'). */
  expiryDate?: string | null;
  /** F1 — captured server-side from config at ISSUE time, fixed thereafter (same convention as tolerancePct). Never client-supplied; surfaced here only for display. */
  mailFloatGraceDays?: number | null;
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
  drAccountNumber?: string;
  drAccountDescription?: string;
  crAccountNumber?: string;
  crAccountDescription?: string;
  accountMappingKey?: string;
  accountMappingVersion?: number;
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
  /** Tolerance captured on ISSUE/monetary amendment; null for AMEND_EXPIRY_DATE and unrelated events. */
  tolerancePct?: string | null;
  toleranceChangePct?: string | null;
  toleranceChangeDirection?: 'INCREASE' | 'DECREASE' | null;
  currency: string;
  status: 'PENDING' | 'RELEASED' | 'REJECTED' | 'CANCELLED';
  reasonCode?: string | null;
  remarks?: string | null;
  sourceTransactionRef?: string | null;
  /** See CreateMovementRequest.referencedTransactionId's own doc comment for the full rule. */
  referencedTransactionId?: string | null;
  /** F1 (external BA review, v1.19.0) — REVERSAL only, the movementId of the EXPIRE/CLOSE movement this negates. Server-generated internally (Extension Amendment/Reopen); never caller-supplied. */
  reversalOfMovementId?: string | null;
  /** F1 — AMEND_EXPIRY_DATE only. See CreateMovementRequest.newExpiryDate's own doc comment. */
  newExpiryDate?: string | null;
  warnings?: MovementWarning[] | null;
  contingentAccountEntry?: ContingentAccountEntry | null;
  createdBy: string;
  releasedBy?: string | null;
  createdAt: string;
  releasedAt?: string | null;
  /** 2026-08-20 — cancel()'s own dedicated audit pair, split out from releasedBy/releasedAt. Null unless status === 'CANCELLED'. See the microservice's own `src/types.ts` BalanceMovement.cancelledAt doc comment. */
  cancelledBy?: string | null;
  cancelledAt?: string | null;
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
  /** Fix Pending §19 (redesigned 2026-08-29) — who last corrected this record's content and when, via an in-place Fix Pending Save (same movementId/eventSeq). Null until ever Fix-Pending-edited. */
  editedBy?: string | null;
  editedAt?: string | null;
}

/**
 * Fix Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
 * 2026-08-27) — the microservice's own `editMovementRequestSchema` is a `.strict()` allowlist; this
 * mirrors it field-for-field. Deliberately does NOT extend/Partial<> CreateMovementRequest above — any
 * locked field (naturalKey/balanceContractId/instrumentType/movementType/currency/eventSeq/createdBy)
 * or the movement's own business "2ndary Key" (sourceTransactionRef) is simply absent from this type,
 * same reasoning as the microservice's own EditMovementRequest doc comment.
 */
export interface EditMovementRequest {
  amount: string;
  editedBy: string;
  editMode?: 'STANDARD' | 'REMARKS_ONLY';
  remarks?: string | null;
  reasonCode?: string | null;
  businessEventId?: string | null;
  referencedTransactionId?: string | null;
  /**
   * Contract-level fields (2026-08-28, per direct user feedback — "為什麼只有amount可以改... Expiry
   * Date, Tenor Type etc.?"; per-Function config, "頁面配置檔 for A1-A11/B1-B7") — only ever sent when
   * the current Function's own `FunctionStrategy.fixPendingEditableFields` (function-strategy.ts)
   * declares the field editable; the server's own `isCreatingEdit` gate additionally silently ignores
   * these for a non-creating movementType regardless of what's sent here.
   */
  tolerancePct?: string | null;
  toleranceChangePct?: string | null;
  toleranceChangeDirection?: 'INCREASE' | 'DECREASE' | null;
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE' | null;
  tenorDays?: number | null;
  expiryDate?: string | null;
  newExpiryDate?: string | null;
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

  createCompoundMovements(requests: readonly CreateMovementRequest[]): Observable<BalanceMovement[]> {
    return this.http.post<BalanceMovement[]>(`${this.base}/balance-movements/compound`, { requests });
  }

  release(movementId: string, releasedBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/release`, { releasedBy });
  }

  releaseCompoundMovements(movementIds: readonly string[], releasedBy: string): Observable<BalanceMovement[]> {
    return this.http.post<BalanceMovement[]>(`${this.base}/balance-movements/compound-release`, { movementIds, releasedBy });
  }

  executeCompoundActions(actions: readonly { kind: 'release' | 'acknowledge'; movementId: string }[], actor: string): Observable<BalanceMovement[]> {
    return this.http.post<BalanceMovement[]>(`${this.base}/balance-movements/compound-actions`, { actions, actor });
  }

  reject(movementId: string, releasedBy: string, reasonCode: string, remarks?: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/reject`, { releasedBy, reasonCode, remarks });
  }

  /** Maker-initiated withdrawal of their own still-PENDING entry (EC), distinct from reject() (a Checker's 4-eyes decline). */
  cancel(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/cancel`, { cancelledBy, reasonCode, remarks });
  }

  /**
   * Fix Pending §19 (redesigned 2026-08-29) — corrects a PENDING/REJECTED movement IN PLACE (same
   * movementId/eventSeq) instead of a Delete Pending + full re-Submit — see editPending()'s own doc
   * comment on the microservice side for the full mechanism. Generic across every movementType the
   * microservice already supports.
   */
  editPending(movementId: string, req: EditMovementRequest): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/edit`, req);
  }

  /** A3/A3S only. Restored 2026-08-20 — the Checker's own acknowledgment on the LC's own UTILIZE (status stays PENDING; A4/A6 finalizes for real later). B3's own Checker Release is still the standard release() above. */
  acknowledge(movementId: string, acknowledgedBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/acknowledge`, { acknowledgedBy });
  }

  /** A4's own real Maker action; a genuine backend acknowledgment (status stays PENDING — the Checker's release() below is still the real finalizing transition), not a new movement. */
  submitByMaker(movementId: string, makerSubmittedBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/maker-submit`, { makerSubmittedBy });
  }

  /** Business-confirmed 2026-08-27 ("做 A4 或 A6 DELETE PENDING 後 交易退回到 A4 或 A6 SUBMIT 前即可") — the inverse of submitByMaker() above; A4's own Delete Pending, undoing just the Maker Submit without cancelling the underlying A3/A3S UTILIZE or its Checker acknowledgment. */
  withdrawMakerSubmit(movementId: string, withdrawnBy: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/withdraw-maker-submit`, { withdrawnBy });
  }

  /**
   * @param includeAnyStatus opt-in (default false) — A10/B6 Close means a natural key can resolve to a
   *   CLOSED contract; every transaction-creating caller of this method must keep failing on one (the
   *   "no longer selectable" locking behavior), so this defaults to the existing ACTIVE-only behavior.
   *   Look Up Current Balance's own runLookup()/syncFrom() pass true — an inquiry context, not an action.
   */
  resolveContract(instrumentType: InstrumentType, naturalKey: NaturalKey, includeAnyStatus = false): Observable<BalanceContract> {
    const params: Record<string, string> = { instrumentType, lcNumber: naturalKey.lcNumber };
    if (naturalKey.ibNumber) params['ibNumber'] = naturalKey.ibNumber;
    if (naturalKey.sgNumber) params['sgNumber'] = naturalKey.sgNumber;
    if (includeAnyStatus) params['includeAnyStatus'] = 'true';
    return this.http.get<BalanceContract>(`${this.base}/balance-contracts`, { params });
  }

  /** Inquire Delete Pending's own View action (§11) — resolves a contract directly by ID, no natural key needed (a delete_pending_audit row only carries balanceContractId). */
  getContract(balanceContractId: string): Observable<BalanceContract> {
    return this.http.get<BalanceContract>(`${this.base}/balance-contracts/${balanceContractId}`);
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
   * @param excludeCancelled — business-reported gap 2026-08-27 ("CANCELLED 不應該顯示在 INQUIRE EVENTS
   *   CATALOG 上") — excludes a contract whose root ISSUE was Delete-Pending'd (§9.3's LC-reuse fix marks
   *   it CANCELLED). `InquireEventsService.loadIndex()` passes `true`; every other caller omits it
   *   (Maker-action pickers already imply this via their own default `status: 'ACTIVE'`).
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
    excludeCancelled?: boolean,
    statuses?: string[],
  ): Observable<CatalogPage> {
    const params: Record<string, string | number> = { instrumentType, page, pageSize };
    if (status) params['status'] = status;
    if (q) params['q'] = q;
    if (lcNumber) params['lcNumber'] = lcNumber;
    if (tenorFamily) params['tenorFamily'] = tenorFamily;
    if (requireIssueReleased) params['requireIssueReleased'] = 'true';
    if (excludeCancelled) params['excludeCancelled'] = 'true';
    if (statuses?.length) params['statuses'] = statuses.join(',');
    return this.http.get<CatalogPage>(`${this.base}/balance-contracts/catalog`, { params });
  }

  /** Inquire Delete Pending's own LC Catalog step (§11, "只有被 DELETE PENDING 過的才顯示") — one row per distinct LC Number with at least one delete_pending_audit record. */
  catalogWithDeletePendingHistory(instrumentType: InstrumentType, q?: string, page = 1, pageSize = 10): Observable<CatalogPage> {
    const params: Record<string, string | number> = { instrumentType, page, pageSize };
    if (q) params['q'] = q;
    return this.http.get<CatalogPage>(`${this.base}/delete-pending-audit/lc-catalog`, { params });
  }

  /**
   * A10/B6 (Close) only — the Step-1 picker hint, backed by the microservice's own dedicated
   * `evaluateContractCloseEligibility()` (SG Balance = 0, Acceptance Balance = 0, no open Events
   * anywhere in the tree, not already Closed) rather than a client-side per-candidate check — see
   * document-arrival-hints.service.ts's own loadCloseEligibility() doc comment for why this is ONE
   * aggregate call, unlike every other hint in that service. `pageSize` defaults to 200 — the caller
   * wants the WHOLE eligible set to build a hint-set from, not one picker page of it (the server's own
   * raw-candidate cap is also 200, see balanceService.ts's own listCloseEligibleContracts() doc comment).
   */
  closeEligible(instrumentType: InstrumentType, lcNumber?: string, pageSize = 200): Observable<CatalogPage> {
    const params: Record<string, string | number> = { instrumentType, pageSize };
    if (lcNumber) params['lcNumber'] = lcNumber;
    return this.http.get<CatalogPage>(`${this.base}/balance-contracts/close-eligible`, { params });
  }

  /**
   * F1 (external BA review, v1.19.0) — A11/B7 (Reopen) only, the Step-1 picker hint, backed by the
   * microservice's own `listReopenEligibleContracts()` (CLOSED status, no open Events anywhere in the
   * tree — deliberately NOT closeEligible()'s own SG/Acceptance-balance-zero condition, see that
   * method's own doc comment on the microservice side). Same "one aggregate call, pageSize 200" shape as
   * closeEligible() above.
   */
  reopenEligible(instrumentType: InstrumentType, lcNumber?: string, pageSize = 200): Observable<CatalogPage> {
    const params: Record<string, string | number> = { instrumentType, pageSize };
    if (lcNumber) params['lcNumber'] = lcNumber;
    return this.http.get<CatalogPage>(`${this.base}/balance-contracts/reopen-eligible`, { params });
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

  /**
   * Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-
   * Proposal-zh.md §2.1) — the Maker Queue's own "My Pending/My Rejected" worklist. A second, independent
   * query shape on the same `GET /balance-movements` route as findByBusinessEventId() above (mutually
   * exclusive server-side), not a new endpoint. Returns every matching row unpaginated (user-directed
   * 2026-08-28, "Order by Function ASC → LC Number ASC → Secondary Reference Number ASC") — Function has
   * no server-side column, so the true sort (and therefore true pagination) is a `MakerQueueService`
   * concern; see that service's own doc comment. `q` (renamed from a prior exact-match `lcNumber` param,
   * "支援 LIKE / Partial Match") is an optional substring filter on LC Number.
   */
  listMyMovements(filter: { createdBy: string; statuses?: string[]; q?: string }): Observable<MyMovementsPage> {
    const params: Record<string, string> = { createdBy: filter.createdBy };
    if (filter.statuses?.length) params['status'] = filter.statuses.join(',');
    if (filter.q) params['q'] = filter.q;
    return this.http.get<MyMovementsPage>(`${this.base}/balance-movements`, { params });
  }

  /**
   * Inquire Delete Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §11, BA &
   * business-directed 2026-08-27) — a dedicated, independent read-only audit query, never merged with
   * Inquire Events. All filter fields are optional. Function is deliberately not a filter param here —
   * see InquireDeletePendingService's own doc comment for why it's applied client-side instead.
   */
  listDeletePendingAudit(filter: { lcNumber?: string; deletedBy?: string; from?: string; to?: string; page?: number; pageSize?: number }): Observable<DeletePendingAuditPage> {
    const params: Record<string, string> = {};
    if (filter.lcNumber) params['lcNumber'] = filter.lcNumber;
    if (filter.deletedBy) params['deletedBy'] = filter.deletedBy;
    if (filter.from) params['from'] = filter.from;
    if (filter.to) params['to'] = filter.to;
    if (filter.page) params['page'] = String(filter.page);
    if (filter.pageSize) params['pageSize'] = String(filter.pageSize);
    return this.http.get<DeletePendingAuditPage>(`${this.base}/delete-pending-audit`, { params });
  }
}

/** BalanceComponentApiService.listMyMovements()'s own result — mirrors the microservice's own `BalanceService.listMyMovements()` response shape; unpaginated (2026-08-28) — see that service method's own doc comment. */
export interface MyMovementsPage {
  items: Array<{ movement: BalanceMovement; contract: BalanceContract }>;
}

/** Mirrors the microservice's own `DeletePendingAuditWithContract` (src/types.ts) — one row per Delete Pending action, paired with the natural key of the contract it belongs to. */
export interface DeletePendingAuditRow {
  auditId: string;
  deleteSeq: number;
  movementId: string;
  balanceContractId: string;
  eventSeq: number;
  movementType: string;
  sourceTransactionRef: string | null;
  statusBefore: 'PENDING' | 'REJECTED';
  cancelledBy: string;
  cancelledAt: string;
  reasonCode: string | null;
  remarks: string | null;
  instrumentType: InstrumentType;
  lcNumber: string;
  ibNumber: string | null;
  sgNumber: string | null;
}

/** One page of BalanceComponentApiService.listDeletePendingAudit()'s own result. */
export interface DeletePendingAuditPage {
  items: DeletePendingAuditRow[];
  total: number;
  page: number;
  pageSize: number;
}
