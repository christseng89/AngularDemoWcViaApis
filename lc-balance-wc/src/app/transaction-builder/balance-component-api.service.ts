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
  /**
   * 2026-08-17 ("REFER TO DB S01") — set only on a REDIRECTED snapshot (SHGT/EPLC_EXAMINATION events —
   * see the microservice's own BalanceSnapshot.redirectedImpact doc comment): names which field above
   * carries the before→after this event actually caused, since BalanceMovement.balanceBefore/
   * balanceAfter track the CHILD's own Confirmed Balance, not this (parent) snapshot's own moved field.
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
  /**
   * BAL-003 (Look Up panel extraction, 2026-08-17) — genuinely missing from this hand-kept-in-sync
   * interface until `LookUpPanelService`'s stricter `BalanceMovement[]` typing (replacing the Look Up
   * panel's own previous `any[]`) surfaced the gap: `release()` on the microservice side always
   * computes and persists both fields (see that project's own `src/types.ts`), and the Look Up panel's
   * own Event Timeline already displayed `m.balanceAfter` — it just compiled under the old `any` typing
   * without the field ever being declared.
   */
  balanceBefore?: string | null;
  balanceAfter?: string | null;
  /**
   * HISTORICAL FIELDS (v0.8.0) — superseded 2026-08-18 (business instruction, "所有交易要RELEASE過後
   * 才能根據流程走下一個交易"): B3's own Checker Release is now the standard release()/status transition
   * (releasedBy/releasedAt), not a separate acknowledgment that left status PENDING. Kept only so a
   * pre-2026-08-18 row's own historical value still round-trips; nothing writes them any more — see
   * presentDocsConsumedAt/By below for what backs Present Docs Earmark Approved now.
   */
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  /**
   * EPLC_EXAMINATION/CREATE only (2026-08-18, business instruction "所有交易要RELEASE過後 才能根據流程走
   * 下一個交易" — superseding acknowledgedAt above). Set as a SIDE EFFECT of release() on the
   * Confirmation's own linked HONOUR/ACCEPT movement (via that movement's own referencedTransactionId
   * pointing back at this EPLC_EXAMINATION CREATE) — i.e. the moment B4 actually consumes this
   * presentation, not when B3 itself is Released. A presentation with status RELEASED and this field
   * still null continues to occupy Present Docs Earmark capacity (see the microservice's own
   * domain/offBalanceExposure.ts doc comment). Null until consumed, and for movements predating this
   * field.
   */
  presentDocsConsumedAt?: string | null;
  /** Audit metadata only, paired with presentDocsConsumedAt above — the checkerId who released the consuming HONOUR/ACCEPT. */
  presentDocsConsumedBy?: string | null;
  /**
   * A4 (Sight Settlement) only (2026-08-16, business instruction "Add real Maker Submit, then have
   * Checker to Release it. Exactly the same as A1."). Set via submitByMaker() below — see the
   * microservice's own BalanceMovement.makerSubmittedAt doc comment for the full rationale (mirrors
   * acknowledgedBy/acknowledgedAt's shape, but on the Maker side; status stays PENDING either way).
   */
  makerSubmittedBy?: string | null;
  makerSubmittedAt?: string | null;
  /**
   * Business instruction 2026-08-17 ("PENDING XOR APPROVED... 只存PENDING 或 APPROVED 其中一個") — the
   * BalanceSnapshot captured server-side at createMovement() (PENDING) and overwritten at release()
   * (RELEASED); see the microservice's own BalanceMovement.eventSnapshot doc comment. Null for
   * movements created before this field existed, and for reject()/cancel() (out of scope). Read
   * directly by InquireEventsService.selectEvent() instead of a separate getBalanceAsOfMovement() call
   * when present.
   */
  eventSnapshot?: BalanceSnapshot | null;
  /**
   * Business instruction 2026-08-17 ("REFER TO DB S01", then "不複雜 就是交易處理時 Look Up Current
   * Balance 的SNAPSHOT (PENDING OR APPROVED) SAVED TO DB == EVENT BALANCE SNAPSHOT") — populated ONLY
   * for a child-ledger movement (SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION): the PARENT
   * LC/Confirmation's own plain balance at the same moment as eventSnapshot above — see the
   * microservice's own BalanceMovement.rootEventSnapshot doc comment. Additional to eventSnapshot,
   * never a replacement. Read by InquireEventsService's Balance Tabs for the LC/Confirmed LC tab
   * whenever the selected Event's own contract isn't the root itself.
   */
  rootEventSnapshot?: BalanceSnapshot | null;
  /**
   * Business instruction 2026-08-17 ("就是交易當時LC所有的BALANCE的拍照存檔" — a snapshot of ALL the LC
   * family's balances at transaction time, saved to DB) — the ONE Acceptance contract's own CURRENT
   * plain balance under this movement's own root LC/Confirmation, captured server-side ONLY when exactly
   * one such contract exists (two or more is ambiguous, left null — same posture Inquire Events' own
   * Balance Tabs use). Null when this movement's own contract already IS an Acceptance (eventSnapshot
   * already covers it), when none/multiple exist, or for movements predating this field. See the
   * microservice's own BalanceService.captureSiblingSnapshots doc comment for the full capture rule.
   */
  acceptanceEventSnapshot?: BalanceSnapshot | null;
  /** Same rule as acceptanceEventSnapshot above, for the ONE Shipping Guarantee contract instead (Import-side only). */
  sgEventSnapshot?: BalanceSnapshot | null;
  /**
   * Business instruction 2026-08-18 ("做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變") — set
   * ONLY when the microservice's own release() finalizes a Sight-tenor IPLC_LC/UTILIZE (A4's own
   * payExistingUtilize target): the RELEASE-time balance, WITHOUT overwriting eventSnapshot above, which
   * instead stays frozen at whatever createMovement() originally captured (A3's own submission). See the
   * microservice's own BalanceMovement.finalizeEventSnapshot doc comment. Read by InquireEventsService's
   * own 'finalize'-phase row (see InquiredEvent's own doc comment) instead of eventSnapshot. Null for
   * every other movement and for movements predating this field.
   */
  finalizeEventSnapshot?: BalanceSnapshot | null;
  /**
   * Business instruction 2026-08-18 ("SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變")
   * — the release-time counterpart to acceptanceEventSnapshot above, same exception
   * finalizeEventSnapshot already established for eventSnapshot itself: set ONLY when the microservice's
   * own release() finalizes a Sight-tenor IPLC_LC/UTILIZE. Reproduces LC S01 exactly — A3's own Document
   * Arrival happened BEFORE SG G01 was even issued, so acceptanceEventSnapshot/sgEventSnapshot as
   * captured at A3's own createMovement() correctly show "no such contract yet"; without this field, A4's
   * own much-later Release would silently overwrite that correct picture with the sibling's by-then-
   * existing balance. See the microservice's own BalanceMovement.finalizeAcceptanceEventSnapshot doc
   * comment. Read by InquireEventsService's own 'finalize'-phase row instead of acceptanceEventSnapshot.
   * Null for every other movement and for movements predating this field.
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

  /** Business instruction 2026-08-15 ("option for Maker to Delete Pending, i.e. EC") — Maker-initiated withdrawal of their own still-PENDING entry, distinct from reject() (a Checker's 4-eyes decline). */
  cancel(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): Observable<BalanceMovement> {
    return this.http.post<BalanceMovement>(`${this.base}/balance-movements/${movementId}/cancel`, { cancelledBy, reasonCode, remarks });
  }

  /**
   * REMOVED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易") —
   * acknowledge() and its /acknowledge endpoint no longer exist. B3's own Checker Release is now the
   * standard release() above (a genuine PENDING -> RELEASED transition), same as every other function.
   */

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
   * @param requireIssueReleased — business-reported gap 2026-08-18 ("S10 still shown in A4 function
   *   which is wrong" — S10's own ISSUE was still PENDING; "There are function dependency, if pending
   *   in previous event, then next event cannot be accessed"): excludes a contract whose own creating
   *   movement (ISSUE/CREATE) hasn't been Checker-Released yet. Opt-in — `CatalogPickerService` passes
   *   `true` for every Maker-side ACTION picker; Look Up Current Balance / Inquire Events deliberately
   *   omit it (a still-pending record's own current state is still a legitimate thing to inquire about).
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

  /** Event timeline (business instruction 2026-08-14) — every movement against one contract, in eventSeq (time) order. */
  listMovements(balanceContractId: string): Observable<BalanceMovement[]> {
    return this.http.get<BalanceMovement[]>(`${this.base}/balance-contracts/${balanceContractId}/movements`);
  }

  /**
   * Inquire Events (2026-08-17) — point-in-time BalanceSnapshot for the given movement's own contract,
   * "as of" that exact movement (i.e. only movements up to and including its own eventSeq contribute).
   * Reuses an endpoint that already existed server-side (built for an earlier "Balance as of event"
   * panel later removed from this Angular app in favor of the Event Timeline's plain "Balance After"
   * column — see service/balanceService.ts's own getBalanceSnapshotAsOfMovement() doc comment for the
   * full history and its one documented limitation: offBalanceExposure/tightAvailableBalance are NOT
   * point-in-time, they always reflect the SHGT side's current state).
   */
  getBalanceAsOfMovement(movementId: string): Observable<BalanceSnapshot> {
    return this.http.get<BalanceSnapshot>(`${this.base}/balance-movements/${movementId}/balance-as-of`);
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
