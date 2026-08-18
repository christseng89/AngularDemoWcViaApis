/**
 * Orchestration layer wiring the pure domain functions (src/domain/) and the
 * DB store (src/store/) together into the operations the HTTP routes need.
 * No business RULES live here beyond resolving which domain check applies
 * to which movementType — the actual math is all in src/domain/.
 *
 * Deliberately does NOT implement the linked "UTILIZE+CREATE Acceptance" /
 * "ACCEPT+CREATE Acceptance" combination as a single server-side operation —
 * Design doc §7.4's "one movement, one call" principle means the CALLER
 * (the Node.js 中台 orchestrator) makes two separate calls for a Usance
 * drawing: release the UTILIZE/ACCEPT, then create+release the Acceptance
 * CREATE. This keeps release() a plain, uniform state transition with no
 * hidden cross-contract side effects.
 */
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { parseMonetaryAmount } from '../money';
import type { Db } from '../db';
import { BalanceContractStore, CatalogFilter, CatalogPage } from '../store/balanceContractStore';
import { BalanceMovementStore } from '../store/balanceMovementStore';
import { applyStatusTransition } from '../domain/statusTransition';
import { deriveContingentAccountEntry } from '../domain/contingentAccountEntry';
import { computeCeilingAmount } from '../domain/tolerance';
import { computeAvailableBalance, computeConfirmedBalance } from '../domain/balanceDerivation';
import {
  checkUtilizeSufficiency,
  computeOffBalanceExposure,
  computePresentDocsEarmark,
  computePresentDocsEarmarkApproved,
  computePresentDocsEarmarkPending,
} from '../domain/offBalanceExposure';
import { checkAmendDecreaseSufficiency } from '../domain/amendDecrease';
import { checkRedeemSufficiency } from '../domain/shgtRedeem';
import { IllegalStateTransitionError, InsufficientBalanceError, NaturalKeyAlreadyExistsError, NotFoundError, RequestValidationError } from '../errors';
import type {
  AccountEntry,
  BalanceContract,
  BalanceMovement,
  BalanceSnapshot,
  ExposureNature,
  InstrumentType,
  MovementWarning,
  NaturalKey,
  TenorType,
} from '../types';

/** Design doc §5 — movementTypes that create a new Logical Contract when the natural key doesn't yet resolve. */
const CREATING_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'CREATE']);

/** Design doc §5 — no sufficiency check at all (ISSUE/AMEND_INCREASE on LC; CREATE on Acceptance; ISSUE on SHGT). */
const NO_CHECK_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'AMEND_INCREASE', 'CREATE', 'AMEND']);

/** Design doc §6/§6.1 — UTILIZE-shaped checks: sufficiency against Available Balance, plus the §6.1 off-balance WARNING (0 exposure for non-LC instrumentTypes). */
const UTILIZE_SHAPED_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['UTILIZE', 'HONOUR', 'ACCEPT']);

/**
 * Design doc §5 (v0.6) — SHGT redemption + (reused, same "≤ outstanding" shape) Acceptance settlement.
 * 2026-08-15 (Export Confirmation Gap Analysis §4.2): REIMBURSE (CNF_REIMB — issuing bank actually
 * pays, clears EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED)
 * and RECLASSIFY_OUT (CNF_DISCOUNT's outgoing leg — no cash, just relabels the same claim on the
 * issuing bank as EPLC_EXPORT_BILLS_DISCOUNTED via a linked CREATE on the new contract) share the same
 * "can't clear more than what's actually outstanding" shape, just never more than what's Available.
 */
const OUTSTANDING_CAPPED_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'PARTIAL_REDEEM',
  'FULL_REDEEM',
  'REIMBURSE',
  'RECLASSIFY_OUT',
  'PARTIAL_SETTLE',
  'FULL_SETTLE',
]);

/**
 * Business-reported gap 2026-08-18 ("S10 A1 Issue still in pending, then it should not allow for
 * other events... right?") — the only two instrumentTypes with no parent of their own; every OTHER
 * instrumentType (SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION/the 3 asset-side types) is
 * always a CHILD of one of these, so checking a child's own creation against ITS parent's ISSUE
 * (assertRootIssueReleased below) transitively covers every later action taken on that child — the
 * child could never have been created in the first place if the root wasn't already Released.
 */
const ROOT_INSTRUMENT_TYPES: ReadonlySet<InstrumentType> = new Set(['IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION']);

export interface CreateMovementRequest {
  instrumentType: InstrumentType;
  naturalKey?: NaturalKey;
  balanceContractId?: string;
  movementType: string;
  eventSeq: number;
  amount: string;
  currency: string;
  legRef?: string | null;
  accountEntries?: AccountEntry[] | null;
  businessEventId?: string | null;
  parentLogicalContractId?: string | null;
  /** Only meaningful for IPLC_LC/EPLC_LC ISSUE — see Design doc §6.2. Ignored for every other instrumentType. */
  tolerancePct?: string | null;
  exposureNature?: ExposureNature;
  /**
   * Design doc §7 Tenor Type Routing (v0.7) — only meaningful when this
   * call creates a new IPLC_ACCEPTANCE/EPLC_ACCEPTANCE contract (CREATE).
   * SELLERS_USANCE and BUYERS_USANCE drive IDENTICAL Balance +/- mechanics
   * (this field changes nothing about how the movement is checked or
   * applied) — it exists purely so the distinction survives for audit/
   * reporting, since the Loan/Payment side that actually differs between
   * the two is out of Balance Component's own scope.
   */
  tenorType?: TenorType | null;
  tenorDays?: number | null;
  maturityDate?: string | null;
  transactionDate?: string | null;
  businessDate?: string | null;
  valueDate?: string | null;
  sourceModule?: string | null;
  sourceFunction?: string | null;
  sourceTransactionRef?: string | null;
  /** See BalanceMovement.referencedTransactionId's own doc comment in types.ts for the full rule. */
  referencedTransactionId?: string | null;
  createdBy: string;
}

export type CreateMovementResult = { created: true; movement: BalanceMovement } | { created: false; existing: BalanceMovement };

export class BalanceService {
  private readonly contracts: BalanceContractStore;
  private readonly movements: BalanceMovementStore;

  constructor(
    db: Db,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.contracts = new BalanceContractStore(db);
    this.movements = new BalanceMovementStore(db);
  }

  resolveContract(instrumentType: InstrumentType, naturalKey: NaturalKey): BalanceContract | undefined {
    return this.contracts.findActiveByNaturalKey(instrumentType, naturalKey);
  }

  catalog(filter: CatalogFilter): CatalogPage {
    return this.contracts.listCatalog(filter);
  }

  /**
   * @param asOfEventSeq — when set (business instruction 2026-08-14, event timeline lookup), only
   *   movements with eventSeq <= this value are included in confirmedBalance/availableBalance/
   *   pendingEarmarkTotal — i.e. "the balance right after this specific event", not the current live
   *   balance. offBalanceExposure/tightAvailableBalance/presentDocsEarmarkPending/
   *   presentDocsEarmarkApproved are cut at the SAME moment too (2026-08-17, user-reported — these four
   *   used to always reflect today's LIVE SHGT/EPLC_EXAMINATION state regardless of which event was
   *   selected), via a real TIMESTAMP cutoff (`cutoffMovement.createdAt` below, from the LAST movement
   *   actually included in the eventSeq-filtered `movements` list — listByContract() guarantees eventSeq
   *   order, so that's exactly the movement asOfEventSeq refers to) rather than eventSeq itself — SHGT/
   *   EPLC_EXAMINATION each have their own independent eventSeq sequence, not comparable to this
   *   contract's own, but createdAt is a real wall-clock timestamp comparable across every contract.
   *
   *   Known, accepted approximation (same class already implicit in the confirmed/available computation
   *   above): a sibling movement's own `status` field reflects its CURRENT status, not necessarily what
   *   it was exactly at the historical cutoff — e.g. a SHGT ISSUE created before the cutoff but only
   *   released after is still read as "RELEASED" (this domain's exposure formula treats PENDING and
   *   RELEASED identically, so this specific approximation is actually exact for exposure); a SHGT later
   *   REJECTED or CANCELLED after the cutoff would drop out of today's exposure total entirely, even if
   *   it should have still counted as outstanding exposure AT that historical moment. No historical
   *   status-transition log exists in this data model to close that gap — acceptable for this
   *   prototype's own event-inquiry use case (auditing what a Maker/Checker actually saw), not a general
   *   point-in-time ledger replay.
   */
  getBalanceSnapshot(balanceContractId: string, asOfEventSeq?: number): BalanceSnapshot {
    const contract = this.contracts.findById(balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${balanceContractId}`);

    const allMovements = this.movements.listByContract(balanceContractId);
    const movements = asOfEventSeq === undefined ? allMovements : allMovements.filter((m) => m.eventSeq <= asOfEventSeq);

    // undefined -> "no cutoff" (the live snapshot route never passes asOfEventSeq). Otherwise the last
    // (eventSeq-order-guaranteed) entry in the already-filtered `movements` list above — normally the
    // exact movement asOfEventSeq refers to, since the only current caller (getBalanceSnapshotAsOfMovement)
    // derives asOfEventSeq from a real movement on this same contract.
    const cutoffMovement = asOfEventSeq === undefined ? undefined : movements[movements.length - 1];

    const shgtMovements = this.movements.listShgtMovementsForParent(contract.logicalContractId);
    const cutShgtMovements = cutoffMovement === undefined ? shgtMovements : shgtMovements.filter((m) => m.createdAt <= cutoffMovement.createdAt);

    const examinationMovements = this.movements.listExaminationMovementsForParent(contract.logicalContractId);
    const cutExaminationMovements =
      cutoffMovement === undefined ? examinationMovements : examinationMovements.filter((m) => m.createdAt <= cutoffMovement.createdAt);

    return this.assembleSnapshot(contract, movements, cutShgtMovements, cutExaminationMovements);
  }

  /**
   * 2026-08-17 — shared assembly extracted out of getBalanceSnapshot() so createMovement()/release() can
   * capture an Event Snapshot (see types.ts's BalanceMovement.eventSnapshot) using the exact same math,
   * without going through getBalanceSnapshot()'s own DB re-fetch (createMovement() needs to include an
   * in-memory movement that isn't inserted yet; release() needs to simulate one movement's status flipping
   * to RELEASED without a second read-after-write). Callers are responsible for handing in an
   * ALREADY-correct movement/shgtMovements/examinationMovements list for the moment being captured — no
   * cutoff/override logic lives in here.
   */
  private assembleSnapshot(
    contract: BalanceContract,
    movements: readonly BalanceMovement[],
    shgtMovements: readonly BalanceMovement[],
    examinationMovements: readonly BalanceMovement[],
  ): BalanceSnapshot {
    const confirmed = computeConfirmedBalance(movements);
    const available = computeAvailableBalance(confirmed, movements);

    let offBalanceExposure: string | null = null;
    let tightAvailableBalance: string | null = null;
    if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
      const exposure = computeOffBalanceExposure(shgtMovements);
      offBalanceExposure = exposure.toFixed();
      tightAvailableBalance = available.minus(exposure).toFixed();
    }

    // Business instruction 2026-08-15 ("Present Docs Earmark (Pending/Approved)") — EPLC_CONFIRMATION only.
    let presentDocsEarmarkPending: string | null = null;
    let presentDocsEarmarkApproved: string | null = null;
    if (contract.instrumentType === 'EPLC_CONFIRMATION') {
      presentDocsEarmarkPending = computePresentDocsEarmarkPending(examinationMovements).toFixed();
      presentDocsEarmarkApproved = computePresentDocsEarmarkApproved(examinationMovements).toFixed();
      // 2026-08-18, user-requested ("Would it be possible to have the same [Tight Available Balance]
      // field for the Export Confirmed LC?") — EPLC_CONFIRMATION has no sibling SHGT exposure to net
      // out (SHGT is Import-only, always a child of IPLC_LC), so this is NOT the same offBalanceExposure
      // computation as above; it reuses the genuine Export-side analog instead — the exact
      // Pending+Approved-combined figure B3's own createMovement() sufficiency check (below) already
      // nets against Available internally (computePresentDocsEarmark == presentDocsEarmarkPending +
      // presentDocsEarmarkApproved, see offBalanceExposure.ts's own doc comments on all three
      // functions) — this just surfaces that same figure as a persisted/queryable BalanceSnapshot field
      // instead of a value computed only inline at submission time.
      tightAvailableBalance = available.minus(computePresentDocsEarmark(examinationMovements)).toFixed();
    }

    return {
      balanceContractId: contract.balanceContractId,
      logicalContractId: contract.logicalContractId,
      currency: contract.currency,
      confirmedBalance: confirmed.toFixed(),
      availableBalance: available.toFixed(),
      pendingEarmarkTotal: available.minus(confirmed).toFixed(),
      offBalanceExposure,
      tightAvailableBalance,
      presentDocsEarmarkPending,
      presentDocsEarmarkApproved,
      asOf: null,
    };
  }

  /**
   * 2026-08-17 ("REFER TO DB S01" business-reported gap, then simplified to "不複雜 就是交易處理時
   * Look Up Current Balance 的SNAPSHOT (PENDING OR APPROVED) SAVED TO DB == EVENT BALANCE SNAPSHOT") —
   * every child-ledger instrumentType (SHGT, IPLC_ACCEPTANCE, EPLC_ACCEPTANCE, EPLC_EXAMINATION) has a
   * PARENT LC/Confirmation whose own balance Inquire Events' Balance Tabs also need (see
   * BalanceMovement.rootEventSnapshot's own doc comment) — captured ADDITIONALLY to, never replacing,
   * the movement's own contract's own eventSnapshot. Returns null for a root-level contract (IPLC_LC/
   * EPLC_LC/EPLC_CONFIRMATION — nothing to redirect to) or when the parent can't be resolved (should not
   * happen for a real child-ledger row, since all four require parentLogicalContractId at creation — see
   * createMovement()'s own validation above — but this keeps snapshot capture non-throwing rather than
   * failing an otherwise-valid create/release).
   */
  private resolveParentContract(contract: BalanceContract): BalanceContract | null {
    const isChildLedger =
      contract.instrumentType === 'SHGT' ||
      contract.instrumentType === 'IPLC_ACCEPTANCE' ||
      contract.instrumentType === 'EPLC_ACCEPTANCE' ||
      contract.instrumentType === 'EPLC_EXAMINATION';
    if (!isChildLedger) return null;
    if (!contract.parentLogicalContractId) return null;
    return this.contracts.findActiveByLogicalContractId(contract.parentLogicalContractId) ?? null;
  }

  /**
   * The parent's own plain balance (Look Up Current Balance's own "LC tab" shape/values, no decoration)
   * — shared by createMovement()/release() below. `childMovement` is the child-ledger movement being
   * captured, in EXACTLY the status/acknowledgedAt it has at this specific capture moment (PENDING when
   * called from createMovement(), RELEASED when called from release()) — always excluded-then-reappended
   * into the parent's own SHGT/EPLC_EXAMINATION sibling list (never relying on whatever listShgtMovements
   * ForParent()/listExaminationMovementsForParent() already has on file for it, since at Create time it
   * isn't persisted yet, and at Release time the DB still shows its OLD PENDING status until this same
   * call's own updateStatus() below writes the new one) — this keeps presentDocsEarmarkPending/Approved
   * (status-sensitive) correct at both capture points, not just offBalanceExposure (which happens to be
   * status-insensitive). The parent's own confirmedBalance/availableBalance never move from a child
   * event, so `parentMovements` itself needs no such simulation.
   */
  private captureRootEventSnapshot(parent: BalanceContract, childInstrumentType: InstrumentType, childMovement: BalanceMovement): BalanceSnapshot {
    const parentMovements = this.movements.listByContract(parent.balanceContractId);
    let shgtMovements: BalanceMovement[] = [];
    let examinationMovements: BalanceMovement[] = [];
    if (parent.instrumentType === 'IPLC_LC' || parent.instrumentType === 'EPLC_LC') {
      shgtMovements = this.movements.listShgtMovementsForParent(parent.logicalContractId).filter((m) => m.movementId !== childMovement.movementId);
      if (childInstrumentType === 'SHGT') shgtMovements = [...shgtMovements, childMovement];
    }
    if (parent.instrumentType === 'EPLC_CONFIRMATION') {
      examinationMovements = this.movements.listExaminationMovementsForParent(parent.logicalContractId).filter((m) => m.movementId !== childMovement.movementId);
      if (childInstrumentType === 'EPLC_EXAMINATION') examinationMovements = [...examinationMovements, childMovement];
    }
    return this.assembleSnapshot(parent, parentMovements, shgtMovements, examinationMovements);
  }

  /**
   * 2026-08-17 ("就是交易當時LC所有的BALANCE的拍照存檔" — a snapshot of ALL the LC family's balances at
   * transaction time, saved to DB; business-confirmed live example — LC S02's 3rd event, a plain A3
   * Document Arrival UTILIZE with no direct SG movement, still needs SG G01's own balance captured
   * alongside it) — the ONE Acceptance's and the ONE Shipping Guarantee's own CURRENT plain balance
   * (`getBalanceSnapshot()`, same "Look Up Current Balance" shape/values every other snapshot field in
   * this file uses), captured whenever exactly one candidate of that type exists under the same root LC/
   * Confirmation (`this.contracts.listCatalog()`, the same store method the HTTP catalog picker uses) —
   * regardless of whether THIS movement's own contract already IS that type (in which case eventSnapshot
   * already covers it, so the matching sibling field is deliberately left null rather than duplicated).
   * Two or more candidates is ambiguous (which one?) and is deliberately left null — same posture
   * Inquire Events' own Balance Tabs use for "only the one it belongs to". `rootInstrumentType` is the
   * contract's own instrumentType when it already IS the root, or the already-resolved parent's
   * instrumentType for a child-ledger movement — passed in rather than re-resolved, since every caller
   * already computed it via resolveParentContract() for rootEventSnapshot just above.
   */
  private captureSiblingSnapshots(
    contract: BalanceContract,
    rootInstrumentType: InstrumentType,
  ): { acceptanceEventSnapshot: BalanceSnapshot | null; sgEventSnapshot: BalanceSnapshot | null } {
    const lcNumber = contract.naturalKey.lcNumber;

    let acceptanceEventSnapshot: BalanceSnapshot | null = null;
    if (contract.instrumentType !== 'IPLC_ACCEPTANCE' && contract.instrumentType !== 'EPLC_ACCEPTANCE') {
      const acceptanceType = rootInstrumentType === 'IPLC_LC' ? 'IPLC_ACCEPTANCE' : rootInstrumentType === 'EPLC_CONFIRMATION' ? 'EPLC_ACCEPTANCE' : null;
      if (acceptanceType) {
        const candidates = this.contracts.listCatalog({ instrumentType: acceptanceType, lcNumber }).items;
        const only = candidates.length === 1 ? candidates[0] : undefined;
        if (only) acceptanceEventSnapshot = this.getBalanceSnapshot(only.balanceContractId);
      }
    }

    let sgEventSnapshot: BalanceSnapshot | null = null;
    if (contract.instrumentType !== 'SHGT' && rootInstrumentType === 'IPLC_LC') {
      const candidates = this.contracts.listCatalog({ instrumentType: 'SHGT', lcNumber }).items;
      const only = candidates.length === 1 ? candidates[0] : undefined;
      if (only) sgEventSnapshot = this.getBalanceSnapshot(only.balanceContractId);
    }

    return { acceptanceEventSnapshot, sgEventSnapshot };
  }

  /** Event timeline (business instruction 2026-08-14) — every movement against one contract, in time order (eventSeq is already strictly increasing per contract, Design doc §8). */
  listMovements(balanceContractId: string): BalanceMovement[] {
    if (!this.contracts.findById(balanceContractId)) throw new NotFoundError(`No BalanceContract ${balanceContractId}`);
    return this.movements.listByContract(balanceContractId);
  }

  /** Balance snapshot "as of" one specific movement in the timeline — resolves its own contract, no separate balanceContractId needed from the caller. */
  getBalanceSnapshotAsOfMovement(movementId: string): BalanceSnapshot {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    return this.getBalanceSnapshot(movement.balanceContractId, movement.eventSeq);
  }

  /**
   * Bug fixed 2026-08-16 — see BalanceMovementStore.findByBusinessEventId's own doc comment for the
   * full root cause. Every movement sharing this businessEventId, across every contract, oldest first
   * (creation order — the order the linked legs were originally submitted in).
   */
  findByBusinessEventId(businessEventId: string): BalanceMovement[] {
    return this.movements.findByBusinessEventId(businessEventId);
  }

  /**
   * Business-reported gap 2026-08-18 ("S10 A1 Issue still in pending, then it should not allow for
   * other events A2-A9, right?"). Live-reproduced before this fix: a contract's own row is created
   * with `status: 'ACTIVE'` at Maker Submit time (createContract(), before any Checker Release), and
   * Available Balance already reflects the ISSUE's own PENDING contribution (§3.3's PENDING-delta
   * convention) — so nothing stopped a second movement, on the SAME root contract (A2/A3) or on a
   * brand-new CHILD contract (A6/A7/A8/B3), from being created or even Released before the root
   * LC/Confirmation's own foundational ISSUE had ever been Checker-approved. Reproduced consequence:
   * Checker-Releasing a UTILIZE while its own parent's ISSUE was still PENDING produced a genuinely
   * NEGATIVE Confirmed Balance (Confirmed Balance only ever sums RELEASED movements, so the UTILIZE's
   * own −amount landed with nothing yet on the +side to net against) — a real contingent-liability
   * integrity violation, not just a UX inconvenience.
   */
  private assertRootIssueReleased(rootContract: BalanceContract, actionDescription: string): void {
    const issueMovement = this.movements.listByContract(rootContract.balanceContractId).find((m) => m.movementType === 'ISSUE');
    if (!issueMovement || issueMovement.status !== 'RELEASED') {
      throw new IllegalStateTransitionError(
        `Cannot ${actionDescription} — ${rootContract.instrumentType} ${rootContract.naturalKey.lcNumber} ` +
          `(balanceContractId ${rootContract.balanceContractId}) has not been Checker-Released yet ` +
          `(its own ISSUE is still ${issueMovement?.status ?? 'missing'}). Release the Issue first.`,
      );
    }
  }

  createMovement(req: CreateMovementRequest): CreateMovementResult {
    let contract = req.balanceContractId
      ? this.contracts.findById(req.balanceContractId)
      : req.naturalKey
        ? this.contracts.findActiveByNaturalKey(req.instrumentType, req.naturalKey)
        : undefined;

    // Business-reported gap 2026-08-14: "Issue LC Number 後不能再 Issue 同一筆 LC
    // Number" — a creating movementType (ISSUE/CREATE) against a natural key
    // that ALREADY resolves to an ACTIVE contract must be rejected outright,
    // never silently applied as an extra movement on top of the existing one
    // (that would double-count the Ceiling/Confirmed Balance). This only
    // applies to the naturalKey path — an explicit balanceContractId already
    // implies the caller knows the contract exists.
    if (contract && req.naturalKey && CREATING_MOVEMENT_TYPES.has(req.movementType)) {
      throw new NaturalKeyAlreadyExistsError(
        `An ACTIVE ${req.instrumentType} already exists for natural key ${JSON.stringify(req.naturalKey)} ` +
          `(balanceContractId ${contract.balanceContractId}) — cannot ${req.movementType} again. ` +
          `Use AMEND_INCREASE/AMEND_DECREASE${req.instrumentType === 'EPLC_CONFIRMATION' ? '/AMEND' : ''} to change it instead.`,
      );
    }

    // See assertRootIssueReleased's own doc comment — an existing root contract (IPLC_LC/EPLC_LC/
    // EPLC_CONFIRMATION) can't take any OTHER movementType (AMEND_INCREASE/AMEND_DECREASE/UTILIZE/
    // HONOUR/ACCEPT) until its own ISSUE has actually been Checker-Released. Skipped for ISSUE itself
    // (the re-ISSUE guard above already handles a duplicate ISSUE attempt).
    if (contract && ROOT_INSTRUMENT_TYPES.has(contract.instrumentType) && req.movementType !== 'ISSUE') {
      this.assertRootIssueReleased(contract, `process a ${req.movementType} event`);
    }

    if (!contract) {
      if (!req.naturalKey) throw new RequestValidationError('naturalKey or balanceContractId is required.');
      if (!CREATING_MOVEMENT_TYPES.has(req.movementType)) {
        throw new NotFoundError(`No ${req.instrumentType} Logical Contract for this natural key yet — only ISSUE/CREATE may implicitly create one.`);
      }

      // See assertRootIssueReleased's own doc comment — creating a NEW CHILD contract (A6/A7 Acceptance,
      // A8 SG Issue, B3 Present Docs) under a parent LC/Confirmation requires that parent's own ISSUE to
      // already be Checker-Released. Resolved defensively here (each instrument-specific block below
      // re-resolves the same parent for its own sufficiency check) — a not-found/inactive parent falls
      // through to that block's own, more specific error instead of a generic one here.
      if (req.parentLogicalContractId) {
        const parentForIssueCheck = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
        if (parentForIssueCheck) this.assertRootIssueReleased(parentForIssueCheck, `create a new ${req.instrumentType} under it`);
      }

      // Business instruction 2026-08-14: "不然流程控制無法處理 這也是BALANCE
      // COMPONENT範圍之一" — Design doc §7 Tenor Type Routing says a Sight LC
      // never produces an Acceptance, and Seller's/Buyer's Usance Acceptances
      // must carry the SAME Tenor Type their parent LC declared at ISSUE. This
      // is enforced here, not left as an unchecked convention, precisely to
      // stop a maker from creating a flow-inconsistent Acceptance by mistake.
      if (
        (req.instrumentType === 'IPLC_ACCEPTANCE' || req.instrumentType === 'EPLC_ACCEPTANCE') &&
        req.movementType === 'CREATE' &&
        req.parentLogicalContractId
      ) {
        const parent = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
        if (parent?.tenorType === 'SIGHT') {
          throw new RequestValidationError(
            `Cannot Create Acceptance under a Sight LC (parent ${parent.balanceContractId} was Issued with tenorType=SIGHT) — ` +
              `a Sight presentation settles via UTILIZE alone (Design doc §7 Tenor Type Routing: Sight -> A4, never A5).`,
          );
        }
        if (parent?.tenorType && req.tenorType && parent.tenorType !== req.tenorType) {
          throw new RequestValidationError(
            `Acceptance tenorType (${req.tenorType}) does not match its parent LC's own declared tenorType ` +
              `(${parent.tenorType}, set at Issue) — the two must agree.`,
          );
        }
      }

      // Business instruction 2026-08-14 ("SG issue amount should be less than the LC Current Balance" — "For
      // example S001 has 3000 LC Available Balance, the SG Issue should be not greater than 3000... It should
      // be a validation for the Maker Input."): explicit override of Design doc §5/§11's earlier decision that
      // SHGT's sufficiency target is the customer's LMTS Available Limit, not the LC Balance (see design doc
      // v0.10 changelog for the reversal record). Checked HERE — inside the "creating a new contract" branch,
      // before createContract() — same positioning as the Acceptance tenor check above it: a rejected request
      // must never leave an orphaned, empty BalanceContract row behind (found live: a first attempt at 3,001
      // against a 3,000-available LC left exactly that behind before this was moved here). Uses req.amount
      // directly rather than a computed ceilingAmount — SHGT is never in TOLERANCE_APPLICABLE_INSTRUMENT_TYPES
      // (tolerance.ts), so the two are always numerically identical for this instrumentType regardless.
      //
      // Business-confirmed fix 2026-08-14 (v0.11): the v0.10 version of this check compared the requested SG
      // amount against the parent LC's plain Available Balance only, oblivious to any OTHER Shipping Guarantee
      // already outstanding on the same LC — so two overlapping SG issuances (e.g. 90,000 + 90,000 against a
      // 100,000-available LC) could each individually pass. Now nets out the LC's existing §6.1 off-balance SG
      // exposure first (reusing computeOffBalanceExposure — the same "Tight Available Balance" already computed
      // for the UTILIZE-side WARNING check, see domain/offBalanceExposure.ts), so a new SG Issue is checked
      // against what's actually still uncommitted, not just what the LC itself shows. This SG doesn't exist yet
      // (we're still inside the "creating a new contract" branch), so listShgtMovementsForParent here can only
      // ever return OTHER SGs' movements — no need to exclude "self".
      if (req.instrumentType === 'SHGT' && req.movementType === 'ISSUE') {
        if (!req.parentLogicalContractId) {
          throw new RequestValidationError("parentLogicalContractId is required to check SG Issue against the parent LC's Available Balance.");
        }
        const parentLc = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
        if (!parentLc) {
          throw new RequestValidationError(`Parent LC (logicalContractId ${req.parentLogicalContractId}) not found or not ACTIVE.`);
        }
        const parentMovements = this.movements.listByContract(parentLc.balanceContractId);
        const parentConfirmed = computeConfirmedBalance(parentMovements);
        const parentAvailable = computeAvailableBalance(parentConfirmed, parentMovements);
        const existingShgtMovements = this.movements.listShgtMovementsForParent(parentLc.logicalContractId);
        const existingShgtExposure = computeOffBalanceExposure(existingShgtMovements);
        const tightAvailable = parentAvailable.minus(existingShgtExposure);
        // Quality-report-balance.md BAL-115: was `new Decimal(req.amount)`, bypassing money.ts's own
        // "only module allowed to construct a Decimal from a wire string" invariant — parseMonetaryAmount()
        // both enforces MONETARY_AMOUNT_PATTERN and constructs the Decimal in one step. The HTTP route
        // (routes/balanceMovements.ts) already validates this before calling createMovement(), but this
        // service method is also called directly from tests/other callers that bypass the route, so the
        // invariant is worth enforcing here too, not just at the HTTP boundary.
        const requestedAmount = parseMonetaryAmount(req.amount);
        if (requestedAmount.greaterThan(tightAvailable)) {
          throw new InsufficientBalanceError(
            `SG Issue amount ${requestedAmount.toFixed()} exceeds parent LC's Tight Available Balance ${tightAvailable.toFixed()} ` +
              `(Available Balance ${parentAvailable.toFixed()} minus ${existingShgtExposure.toFixed()} already-outstanding ` +
              `Shipping Guarantee exposure on this same LC).`,
          );
        }
      }

      // Business-reported gap 2026-08-15 ("B3 沒檢查到單金額超過 Balance餘額", repro'd with LC CU02 / EB E04 —
      // a 70,000 presentation against a Confirmation whose own Available Balance was only 60,000 was accepted
      // with zero check), HARDENED the same day ("Export S001 都超 Present Docs. E01-E04 應該有一個 Present
      // Earmark Amount 控制 B3＋，B4－" — E01 50,000 / E02 70,000 / E03 100,000 were each individually checked
      // in isolation against the SAME still-100,000 Available Balance and each passed, but their SUM (220,000)
      // was never checked, since none of them had actually moved the Confirmation's own balance yet). Reverses
      // this check's original 2026-08-15 same-day design ("does NOT net out other still-PENDING EPLC_EXAMINATION
      // presentations... two presentations can legitimately co-exist even if their sum nominally exceeds
      // Available") — that reasoning is wrong: a running "Present Earmark Amount" IS wanted, same shape as
      // SHGT's own Tight Available Balance netting just above (Σ other still-PENDING presentations on the same
      // Confirmation, via computePresentDocsEarmark/listExaminationMovementsForParent) — EPLC_EXAMINATION's own
      // CREATE is still MEMO_ONLY and still does NOT itself move the Confirmation's real balance (cs-tf-balance-
      // knowhow D3 stands), this is purely a soft commitment-control check, same species as the SHGT one. "B3＋"
      // = a new PENDING presentation adds to this earmark (this check); "B4－" = once B4 actually releases a
      // specific presentation (Honour/Accept), it drops out of the PENDING filter and so out of the earmark —
      // no separate bookkeeping needed, it falls out of computePresentDocsEarmark's own PENDING-only filter.
      if (req.instrumentType === 'EPLC_EXAMINATION' && req.movementType === 'CREATE') {
        if (!req.parentLogicalContractId) {
          throw new RequestValidationError(
            "parentLogicalContractId is required to check a Present Docs amount against the parent Confirmation's Available Balance.",
          );
        }
        const parentConfirmation = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
        if (!parentConfirmation) {
          throw new RequestValidationError(`Parent Confirmation (logicalContractId ${req.parentLogicalContractId}) not found or not ACTIVE.`);
        }
        const parentMovements = this.movements.listByContract(parentConfirmation.balanceContractId);
        const parentConfirmed = computeConfirmedBalance(parentMovements);
        const parentAvailable = computeAvailableBalance(parentConfirmed, parentMovements);
        const existingExaminationMovements = this.movements.listExaminationMovementsForParent(parentConfirmation.logicalContractId);
        const presentDocsEarmark = computePresentDocsEarmark(existingExaminationMovements);
        const tightAvailable = parentAvailable.minus(presentDocsEarmark);
        // Quality-report-balance.md BAL-115 — see the identical SG Issue check's own comment above.
        const requestedAmount = parseMonetaryAmount(req.amount);
        if (requestedAmount.greaterThan(tightAvailable)) {
          throw new InsufficientBalanceError(
            `Present Docs amount ${requestedAmount.toFixed()} exceeds the parent Confirmation's Present Earmark-adjusted Available Balance ` +
              `${tightAvailable.toFixed()} (Available Balance ${parentAvailable.toFixed()} minus ${presentDocsEarmark.toFixed()} already-outstanding ` +
              `Present Docs earmark on this same Confirmation, balanceContractId ${parentConfirmation.balanceContractId}) — this presentation could ` +
              `never be Honoured/Accepted in full alongside the other still-open presentations on this LC.`,
          );
        }
      }

      contract = this.createContract(req);
    }

    const existing = this.movements.findByContractAndEventSeq(contract.balanceContractId, req.eventSeq);
    if (existing) return { created: false, existing };

    const ceilingAmount = computeCeilingAmount(req.amount, contract.tolerancePct, req.movementType, contract.instrumentType);

    const existingMovements = this.movements.listByContract(contract.balanceContractId);

    // Business-reported gap 2026-08-14: "同一筆LC 2ndary reference 也不可以相同"
    // — sourceTransactionRef (Amendment No./IB Number/EB Number, see
    // balance-component.model.ts's secondaryRefLabel) must be unique WITHIN
    // one contract's own movement history. Scoped to balanceContractId, same
    // granularity as the eventSeq idempotency key (Design doc §8) — reusing
    // a reference number silently on a second, genuinely different event
    // would make the audit trail unable to tell the two apart.
    if (req.sourceTransactionRef) {
      const duplicateRef = existingMovements.find((m) => m.sourceTransactionRef === req.sourceTransactionRef);
      if (duplicateRef) {
        throw new RequestValidationError(
          `sourceTransactionRef "${req.sourceTransactionRef}" is already used by movement ${duplicateRef.movementId} ` +
            `(eventSeq ${duplicateRef.eventSeq}) against this same contract — secondary reference numbers must be unique per contract.`,
        );
      }
    }

    const confirmed = computeConfirmedBalance(existingMovements);
    const available = computeAvailableBalance(confirmed, existingMovements);

    let warnings: MovementWarning[] | null = null;

    if (NO_CHECK_MOVEMENT_TYPES.has(req.movementType)) {
      // no sufficiency check — ISSUE (LC)/AMEND_INCREASE/CREATE/AMEND. SHGT's own ISSUE is checked earlier,
      // inside the "creating a new contract" branch above (before createContract()), not here — see that
      // comment for why: a rejected check must never leave an orphaned, empty BalanceContract row behind.
    } else if (req.movementType === 'AMEND_DECREASE') {
      // Quality-report-balance.md BAL-115 — see the SG Issue check's own comment above.
      const check = checkAmendDecreaseSufficiency({ amount: parseMonetaryAmount(req.amount), ceilingAmount, availableBalance: available });
      if (!check.ok) throw new InsufficientBalanceError(check.error!);
    } else if (UTILIZE_SHAPED_MOVEMENT_TYPES.has(req.movementType)) {
      let offBalanceExposure = new Decimal(0);
      if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
        const shgtMovements = this.movements.listShgtMovementsForParent(contract.logicalContractId);
        offBalanceExposure = computeOffBalanceExposure(shgtMovements);
      }
      const check = checkUtilizeSufficiency({ requestedAmount: ceilingAmount, availableBalance: available, offBalanceExposure });
      if (!check.ok) throw new InsufficientBalanceError(check.error!);
      if (check.warning) warnings = [check.warning];
    } else if (OUTSTANDING_CAPPED_MOVEMENT_TYPES.has(req.movementType)) {
      // Bug fixed 2026-08-15 — must check against `available` (nets out other still-PENDING
      // redemptions on this same SG), not the static `confirmed` balance; see shgtRedeem.ts's own
      // doc comment for the live scenario this was caught from.
      const check = checkRedeemSufficiency({ redeemAmount: ceilingAmount, sgAvailableBalance: available });
      if (!check.ok) throw new InsufficientBalanceError(check.error!);
    } else {
      throw new RequestValidationError(`Unrecognized movementType "${req.movementType}" for instrumentType ${req.instrumentType}.`);
    }

    // analysis/contingent-liability-ledger.html — server-derived once, here, at creation time; never
    // recomputed later (Event-Level Relationship requirement). Uses the RESOLVED contract's own
    // tenorType (its declared Sight/Buyer's Usance/Seller's Usance, set at Issue) — not req.tenorType,
    // which is only ever supplied when THIS call is itself the one creating that contract; for every
    // other movement against an already-existing contract, contract.tenorType is the only source.
    const contingentAccountEntry = deriveContingentAccountEntry({
      instrumentType: req.instrumentType,
      movementType: req.movementType,
      amount: req.amount,
      currency: req.currency,
      tenorType: contract.tenorType,
    });

    const movement: BalanceMovement = {
      movementId: randomUUID(),
      balanceContractId: contract.balanceContractId,
      eventSeq: req.eventSeq,
      businessEventId: req.businessEventId ?? null,
      movementType: req.movementType,
      exposureNature: req.exposureNature ?? 'CONTINGENT',
      amount: req.amount,
      ceilingAmount: ceilingAmount.toFixed(),
      currency: req.currency,
      legRef: req.legRef ?? null,
      accountEntries: req.exposureNature === 'MEMO' ? null : (req.accountEntries ?? null),
      contingentAccountEntry,
      status: 'PENDING',
      transactionDate: req.transactionDate ?? null,
      businessDate: req.businessDate ?? null,
      valueDate: req.valueDate ?? null,
      sourceModule: req.sourceModule ?? null,
      sourceFunction: req.sourceFunction ?? null,
      sourceTransactionRef: req.sourceTransactionRef ?? null,
      referencedTransactionId: req.referencedTransactionId ?? null,
      warnings,
      createdBy: req.createdBy,
      createdAt: this.now(),
      eventSnapshot: null,
      rootEventSnapshot: null,
      acceptanceEventSnapshot: null,
      sgEventSnapshot: null,
      finalizeEventSnapshot: null,
      finalizeAcceptanceEventSnapshot: null,
      finalizeSgEventSnapshot: null,
    };

    // 2026-08-17 ("不複雜 就是交易處理時 Look Up Current Balance 的SNAPSHOT (PENDING OR APPROVED)
    // SAVED TO DB == EVENT BALANCE SNAPSHOT") — eventSnapshot is ALWAYS this movement's own contract's
    // own plain balance, captured in-memory (existingMovements is already fetched above for the
    // sufficiency checks; `movement` isn't inserted yet — no extra DB read, same "simulate rather than
    // round-trip" posture release() below uses).
    const ownShgtMovements =
      contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC' ? this.movements.listShgtMovementsForParent(contract.logicalContractId) : [];
    const ownExaminationMovements =
      contract.instrumentType === 'EPLC_CONFIRMATION' ? this.movements.listExaminationMovementsForParent(contract.logicalContractId) : [];
    movement.eventSnapshot = this.assembleSnapshot(contract, [...existingMovements, movement], ownShgtMovements, ownExaminationMovements);

    // ADDITIONALLY, for a child-ledger movement (SHGT/Acceptance/EPLC_EXAMINATION), also capture the
    // PARENT LC/Confirmation's own plain balance at this same moment — see resolveParentContract()'s own
    // doc comment. Never replaces eventSnapshot above.
    const parent = this.resolveParentContract(contract);
    if (parent) movement.rootEventSnapshot = this.captureRootEventSnapshot(parent, contract.instrumentType, movement);

    // ADDITIONALLY, capture the one unambiguous sibling Acceptance's/SG's own CURRENT plain balance — see
    // captureSiblingSnapshots()'s own doc comment ("就是交易當時LC所有的BALANCE的拍照存檔").
    const rootInstrumentType = parent?.instrumentType ?? contract.instrumentType;
    const siblings = this.captureSiblingSnapshots(contract, rootInstrumentType);
    movement.acceptanceEventSnapshot = siblings.acceptanceEventSnapshot;
    movement.sgEventSnapshot = siblings.sgEventSnapshot;

    const result = this.movements.insert(movement);
    if (!result.created) return { created: false, existing: result.existing };
    return { created: true, movement };
  }

  release(movementId: string, releasedBy: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);

    applyStatusTransition({ currentStatus: movement.status, action: 'RELEASE', createdBy: movement.createdBy, actingUser: releasedBy });

    const contract = this.contracts.findById(movement.balanceContractId)!;

    // Quality-report-balance.md BAL-123 (2026-08-17, reviewer-found) / 2026-08-18 (reused again below,
    // for the eventSnapshot-preservation fix) — identifies a Sight-tenor IPLC_LC/UTILIZE, i.e. this
    // release() call is A4 (Sight Settlement) finalizing an EXISTING A3/A3S Document Arrival. Scoped to
    // Sight-tenor IPLC_LC/UTILIZE ONLY — checking contract.tenorType, not just instrumentType/
    // movementType — because a Usance LC's own UTILIZE is released through the EXACT SAME endpoint via
    // A6's own compound flow (referencedTransactionId-based), which never calls submitByMaker() and was
    // never meant to: A4's gate is Sight-only by design (catalogTenorFilter: 'SIGHT' on the client,
    // mirrored here). A blanket "any IPLC_LC/UTILIZE" rule would incorrectly match every Usance
    // Acceptance release too; this narrower check cannot, since contract.tenorType is never 'SIGHT' for
    // a Usance LC. Movements whose parent contract never declared an explicit tenorType (e.g. the
    // Business Case Runner's own older Import Case #1/#3/#4/#5) are also unaffected —
    // `contract.tenorType === 'SIGHT'` is false for `null` too.
    const isSightUtilizeFinalize = movement.movementType === 'UTILIZE' && contract.instrumentType === 'IPLC_LC' && contract.tenorType === 'SIGHT';

    // SUPERSEDED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易" — B3
    // must genuinely RELEASE before B4, the next step, can act on it). This release() call used to be
    // reached ONLY via B4's own compound release (one of its three explicit /release calls — "the B3
    // earmark, the Honour, the Due From Issuing Bank") — never a standalone Checker action on B3's own
    // record — so B3's own eventSnapshot/rootEventSnapshot/siblings were deliberately kept FROZEN at
    // whatever createMovement() originally captured, since this call represented B4's much-later
    // finalization, not B3's own. Now this release() call IS B3's own, genuine, standalone Checker
    // Release (the ONLY way an EPLC_EXAMINATION/CREATE ever reaches RELEASED — B4's own compound no
    // longer re-releases it, since it's already RELEASED by the time B4 acts; see the
    // markPresentDocsConsumed() side effect below for what replaced "B4 finalizes B3" instead) — so this
    // movement now falls through to the SAME unconditional eventSnapshot/rootEventSnapshot/siblings
    // overwrite every other movement type's own release() already gets, exactly like a normal PENDING ->
    // RELEASED transition should. No special-casing needed here any more.

    // BAL-123's own Maker/Checker 4-eyes gate — introduced with submitByMaker() itself — used to be
    // enforced ONLY by the reference Transaction Builder client's own checkerAct(), never here, so any
    // other caller (curl, a future second UI, an integration test) could release an A4-type UTILIZE
    // that was never Maker-submitted, defeating the whole point of the gate.
    if (isSightUtilizeFinalize && !movement.makerSubmittedAt) {
      throw new IllegalStateTransitionError(
        `Cannot release movement ${movementId} — A4 (Sight Settlement) requires a Maker Submit ` +
          `(POST /balance-movements/${movementId}/maker-submit) before the Checker can Release it.`,
      );
    }

    const before = computeConfirmedBalance(this.movements.listByContract(contract.balanceContractId));
    const releasedAt = this.now();
    // Compute the after-figure by simulating this one movement flipping to RELEASED,
    // rather than a second DB round-trip — cheaper and avoids a two-write window.
    const after = before.plus(computeConfirmedBalance([{ ...movement, status: 'RELEASED' }]));

    // 2026-08-17 ("...SAVED TO DB == EVENT BALANCE SNAPSHOT") — this movement's own contract's own plain
    // balance AS OF THIS RELEASE. Same in-memory simulation posture as before/after above: flip this one
    // movement to RELEASED in the already-fetched movement list rather than reading the DB again after
    // updateStatus() below writes it.
    //
    // 2026-08-18 ("做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變") — for every OTHER movement
    // this figure is written into eventSnapshot itself, overwriting whatever createMovement() captured
    // (unchanged from before this date). But for a Sight-tenor IPLC_LC/UTILIZE (isSightUtilizeFinalize —
    // this release() call IS A4 finalizing A3's own earlier submission), eventSnapshot must instead stay
    // frozen at A3's own original Create-time value — Inquire Events' own 'create' row reads it directly
    // — so this release-time figure goes into the NEW finalizeEventSnapshot field instead (read by the
    // 'finalize' row). See types.ts's BalanceMovement.eventSnapshot/finalizeEventSnapshot doc comments.
    const releasedSelf = { ...movement, status: 'RELEASED' as const };
    const ownMovements = this.movements.listByContract(contract.balanceContractId).map((m) => (m.movementId === movementId ? releasedSelf : m));
    const ownShgtMovements =
      contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC' ? this.movements.listShgtMovementsForParent(contract.logicalContractId) : [];
    const ownExaminationMovements =
      contract.instrumentType === 'EPLC_CONFIRMATION' ? this.movements.listExaminationMovementsForParent(contract.logicalContractId) : [];
    const releaseTimeSnapshot = this.assembleSnapshot(contract, ownMovements, ownShgtMovements, ownExaminationMovements);

    // ADDITIONALLY, for a child-ledger movement, also capture the PARENT's own plain balance — see
    // resolveParentContract()'s own doc comment. Never replaces eventSnapshot above.
    //
    // SUPERSEDED 2026-08-18 for B3/EPLC_EXAMINATION specifically — see the isSightUtilizeFinalize/
    // isPresentDocsFinalize doc comment further above: B3's own release() call is now its own genuine
    // finalization event, so rootEventSnapshot ("Confirmed LC Balance" as of THIS Release) is correctly
    // (re)written here just like every other child-ledger movement, not discarded.
    const parent = this.resolveParentContract(contract);
    const rootEventSnapshot = parent ? this.captureRootEventSnapshot(parent, contract.instrumentType, releasedSelf) : null;

    // ADDITIONALLY, capture the one unambiguous sibling Acceptance's/SG's own CURRENT plain balance —
    // see captureSiblingSnapshots()'s own doc comment ("就是交易當時LC所有的BALANCE的拍照存檔").
    //
    // 2026-08-18 ("SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變") — same exception
    // as eventSnapshot/finalizeEventSnapshot above, extended to these two sibling fields: for
    // isSightUtilizeFinalize, acceptanceEventSnapshot/sgEventSnapshot must stay frozen at whatever
    // createMovement() originally captured (A3's own transaction time — reproduces LC S01 exactly: SG
    // G01 didn't exist yet when A3 was submitted, so its own sgEventSnapshot was correctly null then;
    // without this fix, A4's own much-later Release would silently overwrite that correct "didn't exist
    // yet" picture with SG G01's by-then-existing balance) — so this release-time recomputation goes
    // into the NEW finalizeAcceptanceEventSnapshot/finalizeSgEventSnapshot fields instead, and the keys
    // themselves are OMITTED (not merely passed null) from the updateStatus() call below, so
    // hasAcceptanceEventSnapshot/hasSgEventSnapshot correctly compute to 0 there. B3/EPLC_EXAMINATION
    // (SUPERSEDED 2026-08-18, see above) is no longer special-cased here either — its own siblings are
    // (re)written at release() like any other child-ledger movement.
    const rootInstrumentType = parent?.instrumentType ?? contract.instrumentType;
    const siblings = this.captureSiblingSnapshots(contract, rootInstrumentType);

    this.movements.updateStatus({
      movementId,
      status: 'RELEASED',
      releasedBy,
      releasedAt,
      balanceBefore: before.toFixed(),
      balanceAfter: after.toFixed(),
      eventSnapshot: isSightUtilizeFinalize ? null : JSON.stringify(releaseTimeSnapshot),
      finalizeEventSnapshot: isSightUtilizeFinalize ? JSON.stringify(releaseTimeSnapshot) : null,
      rootEventSnapshot: rootEventSnapshot ? JSON.stringify(rootEventSnapshot) : null,
      ...(isSightUtilizeFinalize
        ? {
            finalizeAcceptanceEventSnapshot: siblings.acceptanceEventSnapshot ? JSON.stringify(siblings.acceptanceEventSnapshot) : null,
            finalizeSgEventSnapshot: siblings.sgEventSnapshot ? JSON.stringify(siblings.sgEventSnapshot) : null,
          }
        : {
            acceptanceEventSnapshot: siblings.acceptanceEventSnapshot ? JSON.stringify(siblings.acceptanceEventSnapshot) : null,
            sgEventSnapshot: siblings.sgEventSnapshot ? JSON.stringify(siblings.sgEventSnapshot) : null,
          }),
    });

    // 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易" — B3 must
    // genuinely RELEASE on its own before B4, the next step in the flow, can act on it; superseded the
    // prior acknowledge()-only design). B3's own Present Docs earmark (EPLC_EXAMINATION/CREATE) is now
    // released independently, for real, by its OWN Checker action — so by the time THIS release() call
    // fires for the Confirmation's own linked HONOUR/ACCEPT (B4), the referenced B3 record is already
    // RELEASED; B4's own client-side compound release no longer re-releases it (would be illegal —
    // RELEASED has no further transitions per statusTransition.ts's own LEGAL_TRANSITIONS table). What
    // still needs to happen HERE is marking that presentation "consumed" — the moment it should stop
    // occupying Present Docs Earmark capacity (see domain/offBalanceExposure.ts's own
    // computePresentDocsEarmark doc comment for why `status === 'RELEASED'` alone isn't enough: a
    // RELEASED-but-not-yet-consumed presentation must still count, or the bank could over-commit beyond
    // the LC's real capacity in the window between B3's own Release and B4's actual Honour/Accept
    // decision). Scoped to the REFERENCED movement's own contract/movementType, not this movement's own —
    // safe for A6's own referencedTransactionId use too (Import side, its own source is always an
    // IPLC_LC/UTILIZE, never EPLC_EXAMINATION, so this branch can never fire there).
    if (movement.referencedTransactionId) {
      const referenced = this.movements.findById(movement.referencedTransactionId);
      const referencedContract = referenced ? this.contracts.findById(referenced.balanceContractId) : undefined;
      if (referenced && referencedContract?.instrumentType === 'EPLC_EXAMINATION' && referenced.movementType === 'CREATE') {
        this.movements.markPresentDocsConsumed({ movementId: referenced.movementId, presentDocsConsumedBy: releasedBy, presentDocsConsumedAt: releasedAt });
      }
    }

    return this.movements.findById(movementId)!;
  }

  reject(movementId: string, releasedBy: string, reasonCode: string, remarks?: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    applyStatusTransition({ currentStatus: movement.status, action: 'REJECT', createdBy: movement.createdBy, actingUser: releasedBy });
    this.movements.updateStatus({ movementId, status: 'REJECTED', releasedBy, releasedAt: this.now(), reasonCode, remarks });
    return this.movements.findById(movementId)!;
  }

  /**
   * Business instruction 2026-08-15 ("need a option for Maker to Delete Pending (i.e. EC) to ensure
   * the DB design is working properly. for all functions") — a Maker-initiated withdrawal of their OWN
   * still-PENDING (not yet Checker-released/rejected) entry, distinct from REJECT (a Checker's 4-eyes
   * decline). PENDING -> CANCEL -> CANCELLED was already a fully-designed, tested transition in
   * statusTransition.ts (types.ts's own MovementStatus doc comment: "Maker action on their own
   * not-yet-released record") — this was the only piece missing: no service method or route ever called
   * it. Same "Maker/Checker identity not enforced here" posture as release()/reject() (statusTransition.ts's
   * own top comment) — cancelledBy is audit metadata, not an ownership check; a system-authorization
   * layer would enforce "only the original Maker" separately if required.
   */
  cancel(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    applyStatusTransition({ currentStatus: movement.status, action: 'CANCEL', createdBy: movement.createdBy, actingUser: cancelledBy });
    this.movements.updateStatus({
      movementId,
      status: 'CANCELLED',
      releasedBy: cancelledBy,
      releasedAt: this.now(),
      reasonCode: reasonCode ?? 'MAKER_EC',
      remarks,
    });
    return this.movements.findById(movementId)!;
  }

  /**
   * REMOVED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易" —
   * superseding the 2026-08-15 "Present Docs Earmark" design this method implemented). B3's own Checker
   * Release used to be a genuine backend acknowledgment that deliberately never touched status — the
   * movement stayed PENDING forever, and only B4's own compound release ever finalized it for real. Now
   * B3 uses the standard `release()` above directly, same as every other function's own Checker
   * Release — a real PENDING -> RELEASED transition, on B3's own record, independent of B4. See
   * `release()`'s own `markPresentDocsConsumed` side effect for what tracks "consumed by B4" now, and
   * `domain/offBalanceExposure.ts`'s own doc comment for the accounting reasoning behind the split.
   * `acknowledgedBy`/`acknowledgedAt` remain on `BalanceMovement`/the DB schema for historical rows only
   * (see types.ts's own doc comment) — nothing writes them any more.
   */

  /**
   * Business instruction 2026-08-16 ("Add real Maker Submit, then have Checker to Release it.
   * Exactly the same as A1.") — A4 (Sight Settlement)'s own real Maker action. Unlike every other
   * function, A4 has no movement of its own to create at Submit time — it settles the PRE-EXISTING
   * UTILIZE A3/A3S already earmarked — so there is no createMovement() call to stand in as "the
   * Maker submitted." This is that missing, genuinely backend-persisted step: sets
   * makerSubmittedBy/makerSubmittedAt, but deliberately does NOT call applyStatusTransition or touch
   * status; the movement stays PENDING (release() is still the real PENDING -> RELEASED transition).
   * IPLC_LC/UTILIZE only, the exact movement shape A4's own picker ever targets.
   *
   * Deliberately NOT enforced inside release() itself: the Business Case Runner's own orchestrated
   * Import Case 1/2 (backend/data/businessCases.js) release a UTILIZE directly with no separate
   * maker-submit call, and hard-requiring makerSubmittedAt there would break that already-working,
   * separately-tested flow for no benefit (it isn't driven through the interactive Transaction
   * Builder this feature concerns). The Transaction Builder's own A4 Checker flow enforces the gate
   * client-side instead — see transaction-builder.component.ts checkerAct()'s own doc comment.
   */
  submitByMaker(movementId: string, makerSubmittedBy: string): BalanceMovement {
    return this.guardSecondaryAction(movementId, {
      presentTense: 'submit',
      pastTense: 'submitted',
      validate: (contract, movement) => {
        if (!contract || contract.instrumentType !== 'IPLC_LC' || movement.movementType !== 'UTILIZE') {
          throw new RequestValidationError(
            `submitByMaker() only applies to an IPLC_LC UTILIZE movement (A4 Sight Settlement) — ` +
              `movement ${movementId} is ${contract?.instrumentType ?? 'unknown'}/${movement.movementType}.`,
          );
        }
      },
      alreadyDoneAt: (movement) => movement.makerSubmittedAt,
      alreadyDoneBy: (movement) => movement.makerSubmittedBy,
      persist: (id, now) => this.movements.submitByMaker({ movementId: id, makerSubmittedBy, makerSubmittedAt: now }),
    });
  }

  /**
   * Quality-report-balance.md BAL-130 (2026-08-17) — a shared find-movement -> validate-shape ->
   * guard-PENDING -> guard-not-already-done -> persist-and-refetch shape, originally factored out
   * because `acknowledge()` and `submitByMaker()` both needed it. `acknowledge()` was removed 2026-08-18
   * (see its own former section above) — `submitByMaker()` is this helper's only caller now, kept as-is
   * rather than inlined back, since the shape is still a real, independently-tested unit a future
   * second-actor action (should one appear) can reuse without re-deriving it.
   */
  private guardSecondaryAction(
    movementId: string,
    opts: {
      presentTense: string;
      pastTense: string;
      validate: (contract: BalanceContract | undefined, movement: BalanceMovement) => void;
      alreadyDoneAt: (movement: BalanceMovement) => string | null | undefined;
      alreadyDoneBy: (movement: BalanceMovement) => string | null | undefined;
      persist: (movementId: string, now: string) => void;
    },
  ): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);

    const contract = this.contracts.findById(movement.balanceContractId);
    opts.validate(contract, movement);

    if (movement.status !== 'PENDING') {
      throw new IllegalStateTransitionError(`Cannot ${opts.presentTense} movement ${movementId} — its status is ${movement.status}, not PENDING.`);
    }
    const doneAt = opts.alreadyDoneAt(movement);
    if (doneAt) {
      throw new IllegalStateTransitionError(`Movement ${movementId} was already ${opts.pastTense} by ${opts.alreadyDoneBy(movement)} at ${doneAt}.`);
    }

    opts.persist(movementId, this.now());
    return this.movements.findById(movementId)!;
  }

  private createContract(req: CreateMovementRequest): BalanceContract {
    const now = this.now();
    const contract: BalanceContract = {
      balanceContractId: randomUUID(),
      logicalContractId: randomUUID(),
      contractVersion: 1,
      instrumentType: req.instrumentType,
      naturalKey: req.naturalKey!,
      parentLogicalContractId: req.parentLogicalContractId ?? null,
      status: 'ACTIVE',
      currency: req.currency,
      tolerancePct: req.tolerancePct ?? null,
      tenorType: req.tenorType ?? null,
      tenorDays: req.tenorDays ?? null,
      maturityDate: req.maturityDate ?? null,
      openingBalance: '0',
      effectiveFrom: now,
      createdBy: req.createdBy,
      createdAt: now,
    };
    this.contracts.insert(contract);
    return contract;
  }
}
