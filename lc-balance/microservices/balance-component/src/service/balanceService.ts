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
import { describeAmountScaleViolation, parseMonetaryAmount } from '../money';
import type { Db } from '../db';
import { BalanceContractStore, CatalogFilter, CatalogPage } from '../store/balanceContractStore';
import { BalanceMovementStore } from '../store/balanceMovementStore';
import { applyStatusTransition } from '../domain/statusTransition';
import { deriveContingentAccountEntry } from '../domain/contingentAccountEntry';
import { computeCeilingAmount } from '../domain/tolerance';
import { computeAvailableBalance, computeConfirmedBalance, computePendingDecreaseTotal } from '../domain/balanceDerivation';
import {
  checkPresentDocsIssueSufficiency,
  checkShgtIssueSufficiency,
  checkUtilizeSufficiency,
  computeOffBalanceExposure,
  computePresentDocsEarmark,
  computePresentDocsEarmarkApproved,
  computePresentDocsEarmarkPending,
  derivePresentDocsProvisionallyConsumedIds,
} from '../domain/offBalanceExposure';
import { checkAmendDecreaseSufficiency } from '../domain/amendDecrease';
import { checkRedeemSufficiency } from '../domain/shgtRedeem';
import { checkAcceptanceTenorConsistency } from '../domain/tenorRouting';
import { validateTenorBasisTypeCombination, resolveExportSettlementRoute } from '../domain/tenorBasis';
import { evaluateCloseEligibility, type CloseEligibilityResult } from '../domain/closeEligibility';
import { buildAdjustBusinessDayRequest } from '../domain/maturityDateCalculation';
import { adjustBusinessDay, type StandingCalendarRef, type AdjustBusinessDayRequest } from '../clients/standingClient';
import { CurrencyMismatchError, IllegalStateTransitionError, InsufficientBalanceError, NaturalKeyAlreadyExistsError, NotFoundError, RequestValidationError } from '../errors';
import type {
  AccountEntry,
  BalanceContract,
  BalanceMovement,
  BalanceSnapshot,
  ExposureNature,
  InstrumentType,
  MaturityDateCalendarRef,
  MovementWarning,
  NaturalKey,
  TenorBasis,
  TenorType,
} from '../types';

/**
 * BAL-141 (2026-08-20 quality pass, desiger-comments.md-style finding) — was 4 separate movementType
 * classification Sets (CREATING_MOVEMENT_TYPES/NO_CHECK_MOVEMENT_TYPES/UTILIZE_SHAPED_MOVEMENT_TYPES/
 * OUTSTANDING_CAPPED_MOVEMENT_TYPES) plus a sequential if/else-if dispatch in createMovement() — a
 * Data Clump: adding a movementType meant remembering to touch several of these in lockstep, with no
 * compiler check if one was missed. Collapsed into one Strategy-pattern lookup table
 * (buildMovementTypeRegistry(), built once per instance since several strategies close over
 * `this.movements`) — one movementType, one entry, its creation semantics and its sufficiency check
 * live together. Deliberately does NOT also absorb MOVEMENT_DIRECTION (balanceDerivation.ts) or
 * TOLERANCE_APPLICABLE_MOVEMENT_TYPES (tolerance.ts) — both are genuinely domain-layer, pure, and
 * already single-sourced in their own files; tolerance's own gate is additionally two-dimensional
 * (instrumentType + movementType, since SHGT's own `ISSUE` shares its string with the LC's `ISSUE`),
 * which a service-layer, movementType-only table cannot represent without reintroducing that exact
 * ambiguity tolerance.ts's own doc comment warns against.
 */
interface MovementSufficiencyContext {
  contract: BalanceContract;
  existingMovements: readonly BalanceMovement[];
  confirmedBalance: Decimal;
  availableBalance: Decimal;
  ceilingAmount: Decimal;
  req: CreateMovementRequest;
}

/** Discriminated union (2026-08-20, reviewer-directed) — see domain/tenorRouting.ts's AcceptanceTenorCheckResult own doc comment for why. */
type MovementSufficiencyOutcome = { ok: true; warning?: MovementWarning } | { ok: false; error: string; reasonCode?: string };

type MovementSufficiencyCheck = (ctx: MovementSufficiencyContext) => MovementSufficiencyOutcome | null;

interface MovementTypeDescriptor {
  /** Design doc §5 — creates a new Logical Contract when the natural key doesn't yet resolve. */
  isCreating: boolean;
  /** Returns null when this request needs no sufficiency check at all. */
  checkSufficiency: MovementSufficiencyCheck;
}

/** BAL-141 — the `updateStatus()` params shape, reused by resolveSnapshotWriteTarget()'s callers below. */
type UpdateMovementStatusParams = Parameters<BalanceMovementStore['updateStatus']>[0];

/**
 * Business-reported gap 2026-08-18 ("S10 A1 Issue still in pending, then it should not allow for
 * other events... right?") — the only two instrumentTypes with no parent of their own; every OTHER
 * instrumentType (SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION/the 3 asset-side types) is
 * always a CHILD of one of these, so checking a child's own creation against ITS parent's ISSUE
 * (assertRootIssueReleased below) transitively covers every later action taken on that child — the
 * child could never have been created in the first place if the root wasn't already Released.
 */
const ROOT_INSTRUMENT_TYPES: ReadonlySet<InstrumentType> = new Set(['IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION']);

/**
 * 2026-08-20 (reviewer-directed, closing a Cognitive Complexity finding on captureSiblingSnapshots()) —
 * the Acceptance instrumentType a given root instrumentType produces, or `undefined` when it has none
 * (SHGT/EPLC_EXAMINATION's own root, IPLC_CONFIRMATION doesn't exist). Replaces a nested ternary with a
 * lookup table, same "table over conditional chain" convention BAL-141's own movementTypeRegistry
 * already established in this file.
 */
const ACCEPTANCE_TYPE_BY_ROOT: Readonly<Partial<Record<InstrumentType, InstrumentType>>> = {
  IPLC_LC: 'IPLC_ACCEPTANCE',
  EPLC_CONFIRMATION: 'EPLC_ACCEPTANCE',
};

export interface CreateMovementRequest {
  instrumentType: InstrumentType;
  naturalKey?: NaturalKey;
  balanceContractId?: string;
  movementType: string;
  eventSeq: number;
  amount: string;
  /**
   * OAS-GAP-16 direction (a), 2026-08-22 — optional per CURRENCY DERIVATION (balance-component-api.yaml,
   * documented since v1.0.0, now genuinely enforced): required only for a genuinely root new Logical
   * Contract (no existing resolution, no parentLogicalContractId); every other case may omit it and the
   * server derives + validates from the resolved contract or its parent — see
   * resolveOrCreateContract()'s own doc comment.
   */
  currency?: string;
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
  /**
   * Maturity-Date-Tenor-Basis-Decision-Review.md v29 §3.1 — required at A1/B1 root ISSUE (and A2/B2
   * AMEND_TENOR_BASIS) whenever tenorType is BUYERS_USANCE/SELLERS_USANCE; must be omitted/null for
   * SIGHT. See domain/tenorBasis.ts's own validateTenorBasisTypeCombination().
   */
  tenorBasis?: TenorBasis | null;
  /** v29 §3.1/§4 — required (and only meaningful) when tenorBasis === 'FIXED_MATURITY_DATE'; tenorDays must be null in that case. */
  fixedMaturityDate?: string | null;
  /**
   * Risk Containment Gate stopgap (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §8, P0) — a
   * caller-supplied value on an Acceptance CREATE (IPLC_ACCEPTANCE/EPLC_ACCEPTANCE) is no longer
   * accepted at all; see routes/balanceMovements.ts's own doc comment on why the old "caller-supplied
   * maturityDate always wins" passthrough was unsafe (no way to verify it against tenorBasis/baseDate).
   * Kept only for A1/B1 root ISSUE manual passthrough (rare, e.g. data migration) — ignored everywhere
   * else, including Acceptance CREATE.
   */
  maturityDate?: string | null;
  /**
   * Maturity-Date-Tenor-Basis-Decision-Review.md v29 §4/§5 (Risk Containment Gate) — resolved by
   * routes/balanceMovements.ts BEFORE calling createMovement() (currently only for the
   * tenorBasis==='FIXED_MATURITY_DATE' path); createContract() only persists these, never computes them.
   * Not exposed as a general caller-supplied passthrough — see the route's own doc comment.
   */
  contractualMaturityDate?: string | null;
  operationalPaymentDate?: string | null;
  standingCalculationId?: string | null;
  calendarSnapshotId?: string | null;
  /**
   * A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1 — required at A1/B1 root ISSUE (see
   * resolveOrCreateContract()'s own check). §2/§3 — also required for A2/B2 AMEND_EXPIRY (see
   * createMovement()'s own check), where it carries the REQUESTED new expiryDate instead of the initial
   * one; release() copies it onto the contract at Checker-approval time. Ignored for every other
   * movementType.
   */
  expiryDate?: string | null;
  /** §1 — optional at A1/B1 root ISSUE, defaults to today's Business Date (see createContract()); ignored otherwise. */
  issueDate?: string | null;
  /**
   * A6/B4 Calculated Maturity Date (2026-08-23, Maturity-Date-Business-Day-Convention-Decision-
   * Request.md, resolved) — optional at A1/B1 root ISSUE (stored directly onto the new contract, see
   * createContract()); required for A2/B2 AMEND_MATURITY_CALENDARS (see createMovement()'s own check),
   * where it carries the REQUESTED new calendar config instead of the initial one — release() copies it
   * onto the contract at Checker-approval time, same posture as expiryDate/AMEND_EXPIRY above. Ignored
   * for every other movementType, including Acceptance CREATE itself (A6/B4) — that reads the PARENT
   * contract's own stored config automatically (see getMaturityDateCalendarsFromParent()), never this
   * per-call field, precisely so a Maker never re-types/re-selects it per Acceptance.
   */
  maturityDateCalendars?: MaturityDateCalendarRef[] | null;
  maturityDateCombinationRule?: string | null;
  maturityDateConvention?: string | null;
  /** §2/§3 — A3/A3S (Import) and B3 (Export) document-presentation movements only. See types.ts BalanceMovement.documentPresentationDate. */
  documentPresentationDate?: string | null;
  transactionDate?: string | null;
  businessDate?: string | null;
  valueDate?: string | null;
  sourceModule?: string | null;
  sourceFunction?: string | null;
  sourceTransactionRef?: string | null;
  /** See BalanceMovement.referencedTransactionId's own doc comment in types.ts for the full rule. */
  referencedTransactionId?: string | null;
  /**
   * §0.1 — Layer 2 (Maker Submit) of the three-layer expiry-discovery design. Purely informational audit
   * passthrough, same convention as sourceModule/sourceFunction above — never validated, never gates
   * anything. Set by an external batch caller to record that THIS submission was triggered by an
   * expiryDate scan, not a human operator; a Checker-side equivalent lives on the release() request
   * instead (see ReleaseMovementRequest, not this interface).
   */
  triggeredByExpiry?: boolean;
  createdBy: string;
}

export type CreateMovementResult = { created: true; movement: BalanceMovement } | { created: false; existing: BalanceMovement };

export class BalanceService {
  private readonly contracts: BalanceContractStore;
  private readonly movements: BalanceMovementStore;
  private readonly movementTypeRegistry: Readonly<Record<string, MovementTypeDescriptor>>;
  private readonly newContractSufficiencyRegistry: Readonly<Record<string, (req: CreateMovementRequest) => void>>;

  constructor(
    db: Db,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.contracts = new BalanceContractStore(db);
    this.movements = new BalanceMovementStore(db);
    this.movementTypeRegistry = this.buildMovementTypeRegistry();
    this.newContractSufficiencyRegistry = this.buildNewContractSufficiencyRegistry();
  }

  /**
   * See MovementTypeDescriptor's own doc comment (module top) for why this table exists. Built once per
   * instance, not module-level, since checkDecreaseShapedSufficiency()/checkUtilizeShapedSufficiency()
   * below close over `this.movements` to fetch sibling SHGT/EPLC_EXAMINATION movements for off-balance-
   * sheet netting.
   */
  private buildMovementTypeRegistry(): Readonly<Record<string, MovementTypeDescriptor>> {
    const noCheck: MovementSufficiencyCheck = () => null;

    /**
     * B2's own AMEND (business instruction 2026-08-20, BA balance-check review, "占用從寬" — a Decrease
     * occupies capacity as strictly as A2's own AMEND_DECREASE) has no separate AMEND_INCREASE/
     * AMEND_DECREASE movementType — direction rides the sign of `amount` — so only a negative
     * ceilingAmount (a genuine decrease) runs the decrease-shaped check; an increase or zero is
     * unchecked, same as AMEND_INCREASE.
     */
    const amendShaped: MovementSufficiencyCheck = (ctx) => (ctx.ceilingAmount.isNegative() ? this.checkDecreaseShapedSufficiency(ctx) : null);
    const decreaseShaped: MovementSufficiencyCheck = (ctx) => this.checkDecreaseShapedSufficiency(ctx);
    /** Design doc §6/§6.1 — sufficiency against Available Balance, plus the §6.1 off-balance check (0 exposure for non-LC instrumentTypes). */
    const utilizeShaped: MovementSufficiencyCheck = (ctx) => this.checkUtilizeShapedSufficiency(ctx);
    /**
     * Design doc §5 (v0.6) — SHGT redemption + (reused, same "≤ outstanding" shape) Acceptance
     * settlement. 2026-08-15 (Export Confirmation Gap Analysis §4.2): REIMBURSE (CNF_REIMB — issuing
     * bank actually pays, clears EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE /
     * EPLC_EXPORT_BILLS_DISCOUNTED) and RECLASSIFY_OUT (CNF_DISCOUNT's outgoing leg — no cash, just
     * relabels the same claim on the issuing bank as EPLC_EXPORT_BILLS_DISCOUNTED via a linked CREATE
     * on the new contract) share the same "can't clear more than what's actually outstanding" shape.
     */
    const outstandingCapped: MovementSufficiencyCheck = (ctx) =>
      checkRedeemSufficiency({ redeemAmount: ctx.ceilingAmount, sgAvailableBalance: ctx.availableBalance });

    /**
     * Maturity-Date-Tenor-Basis-Decision-Review.md v29 §4.1/§8 (business-confirmed, P0) — Import A7 and
     * Export B5-到期結算 共通 (PARTIAL_SETTLE/FULL_SETTLE against an Acceptance's own contract) — replaces
     * plain outstandingCapped for these two movementTypes only (REIMBURSE/RECLASSIFY_OUT keep
     * outstandingCapped unchanged; whether they need the same precondition is unresolved, v29 §4.2/§9).
     * Two independent preconditions, both required: (1) the Acceptance itself must be genuinely
     * established (confirmedBalance > 0) and its own Maturity Date must have actually been approved
     * (maturityDateStatus === 'APPROVED', not merely Preview); (2) the source UTILIZE/ACCEPT this
     * Acceptance was created from must itself already be RELEASED — fail-closed: missing
     * referencedTransactionId, an unresolvable reference, a not-yet-RELEASED source, a currency/root-
     * contract mismatch, or a movementType outside the eligible whitelist are all rejected, never
     * silently treated as "no reference to check". Falls through to the same outstandingCapped amount
     * check (availableBalance, never confirmedBalance — see that check's own doc comment for why
     * confirmedBalance would reintroduce the 2026-08-15 double-settlement bug).
     */
    const ACCEPTANCE_SETTLEMENT_SOURCE_MOVEMENT_TYPES: Readonly<Record<string, readonly string[]>> = {
      IPLC_ACCEPTANCE: ['UTILIZE'],
      EPLC_ACCEPTANCE: ['ACCEPT'],
    };
    const acceptanceSettlementShaped: MovementSufficiencyCheck = (ctx) => {
      if (ctx.confirmedBalance.lte(0) || ctx.contract.maturityDateStatus !== 'APPROVED') {
        return {
          ok: false,
          error: 'Cannot settle a Preview/un-Released/invalid Acceptance — confirmedBalance must be positive AND maturityDateStatus must be APPROVED.',
          reasonCode: 'ACCEPTANCE_NOT_SETTLEABLE',
        };
      }
      const createMovement = ctx.existingMovements.find((m) => m.movementType === 'CREATE');
      const sourceMovementId = createMovement?.referencedTransactionId;
      if (!sourceMovementId) {
        return {
          ok: false,
          error: "Acceptance CREATE has no referencedTransactionId — cannot verify its source UTILIZE/ACCEPT movement has been Released.",
          reasonCode: 'ACCEPTANCE_SOURCE_MOVEMENT_MISSING',
        };
      }
      const sourceMovement = this.movements.findById(sourceMovementId);
      if (!sourceMovement) {
        return { ok: false, error: 'Acceptance CREATE references a source movement that cannot be found.', reasonCode: 'ACCEPTANCE_SOURCE_MOVEMENT_MISSING' };
      }
      if (sourceMovement.status !== 'RELEASED') {
        return {
          ok: false,
          error: 'The source UTILIZE/ACCEPT movement this Acceptance was created from has not been Released yet.',
          reasonCode: 'ACCEPTANCE_SOURCE_MOVEMENT_NOT_RELEASED',
        };
      }
      const rootContract = this.resolveParentContract(ctx.contract);
      if (sourceMovement.currency !== ctx.contract.currency) {
        return { ok: false, error: 'Source movement currency does not match this Acceptance.', reasonCode: 'ACCEPTANCE_SOURCE_MOVEMENT_MISMATCH' };
      }
      if (!rootContract || sourceMovement.balanceContractId !== rootContract.balanceContractId) {
        return {
          ok: false,
          error: "Source movement does not belong to this Acceptance's own root LC/Confirmation.",
          reasonCode: 'ACCEPTANCE_SOURCE_MOVEMENT_MISMATCH',
        };
      }
      const allowedTypes = ACCEPTANCE_SETTLEMENT_SOURCE_MOVEMENT_TYPES[ctx.contract.instrumentType] ?? [];
      if (!allowedTypes.includes(sourceMovement.movementType)) {
        return {
          ok: false,
          error: `Referenced movement type "${sourceMovement.movementType}" is not an eligible Acceptance source for ${ctx.contract.instrumentType} (expected one of: ${allowedTypes.join(', ')}).`,
          reasonCode: 'ACCEPTANCE_SOURCE_MOVEMENT_TYPE_INVALID',
        };
      }
      return outstandingCapped(ctx);
    };

    /**
     * A10/B6 Close — unlike every other entry in this table, "sufficiency" here isn't affordability, it's
     * eligibility (see domain/closeEligibility.ts) PLUS an exact-amount check: the caller's own amount
     * (auto-derived client-side from the current Confirmed Balance, never user-typed — see
     * function-strategy.ts's own MovementDerivationStrategy.amountAutoFilledFrom) must equal
     * ctx.confirmedBalance exactly, not merely be within it, since this movement's whole purpose is to
     * write the balance down to precisely 0. release() below re-runs the same two checks against the
     * THEN-current state before actually flipping status, since Confirmed Balance/eligibility can move in
     * the window between Maker Submit and Checker Release.
     */
    const closeShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ROOT_INSTRUMENT_TYPES.has(ctx.contract.instrumentType)) {
        return {
          ok: false,
          error: `Close only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${ctx.contract.instrumentType} is not eligible.`,
        };
      }
      const eligibility = this.evaluateContractCloseEligibility(ctx.contract);
      if (!eligibility.eligible) {
        return {
          ok: false,
          error: `Cannot Close ${ctx.contract.instrumentType} ${ctx.contract.naturalKey.lcNumber} — ${eligibility.reasons.join(' ')}`,
          reasonCode: 'CLOSE_NOT_ELIGIBLE',
        };
      }
      if (!ctx.ceilingAmount.equals(ctx.confirmedBalance)) {
        return {
          ok: false,
          error:
            `Close amount must exactly equal the current Confirmed Balance (${ctx.confirmedBalance.toFixed()}) — ` +
            `submitted ${ctx.ceilingAmount.toFixed()}. Re-derive the amount from the current balance and resubmit.`,
          reasonCode: 'CLOSE_AMOUNT_MISMATCH',
        };
      }
      return { ok: true };
    };

    return {
      // Design doc §5 — no sufficiency check at all (ISSUE/AMEND_INCREASE on LC; CREATE on
      // Acceptance/EPLC_EXAMINATION; ISSUE on SHGT). SHGT's own ISSUE and EPLC_EXAMINATION's own
      // CREATE already ran their own instrument-specific sufficiency check earlier, inside
      // createMovement()'s "creating a new contract" branch, before this table is ever consulted for a
      // brand-new contract's first movement — see checkShgtIssueSufficiency()/
      // checkPresentDocsIssueSufficiency() above.
      ISSUE: { isCreating: true, checkSufficiency: noCheck },
      CREATE: { isCreating: true, checkSufficiency: noCheck },
      AMEND_INCREASE: { isCreating: false, checkSufficiency: noCheck },
      // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 — A2/B2 Extend Expiry. noCheck, same
      // treatment as AMEND_INCREASE above — it never touches Balance/ceilingAmount (assertValidAmount()
      // already enforces amount === "0" before this is even reached).
      AMEND_EXPIRY: { isCreating: false, checkSufficiency: noCheck },
      // A6/B4 Calculated Maturity Date (2026-08-23) — A2/B2 Update Maturity Date Calendars. Same
      // treatment as AMEND_EXPIRY immediately above — never touches Balance/ceilingAmount
      // (assertValidAmount() already enforces amount === "0" before this is even reached).
      AMEND_MATURITY_CALENDARS: { isCreating: false, checkSufficiency: noCheck },
      AMEND: { isCreating: false, checkSufficiency: amendShaped },
      AMEND_DECREASE: { isCreating: false, checkSufficiency: decreaseShaped },
      UTILIZE: { isCreating: false, checkSufficiency: utilizeShaped },
      HONOUR: { isCreating: false, checkSufficiency: utilizeShaped },
      ACCEPT: { isCreating: false, checkSufficiency: utilizeShaped },
      PARTIAL_REDEEM: { isCreating: false, checkSufficiency: outstandingCapped },
      FULL_REDEEM: { isCreating: false, checkSufficiency: outstandingCapped },
      REIMBURSE: { isCreating: false, checkSufficiency: outstandingCapped },
      RECLASSIFY_OUT: { isCreating: false, checkSufficiency: outstandingCapped },
      PARTIAL_SETTLE: { isCreating: false, checkSufficiency: acceptanceSettlementShaped },
      FULL_SETTLE: { isCreating: false, checkSufficiency: acceptanceSettlementShaped },
      CLOSE: { isCreating: false, checkSufficiency: closeShaped },
    };
  }

  /**
   * Business instruction 2026-08-20 ("A2 Decrease 輸入金額控制規則 B2, A3 & B3 都適用") — shared by
   * AMEND_DECREASE (A2) and AMEND's own Decrease direction (B2): checked against Tight Available
   * Balance, computed per instrumentType the same way assembleSnapshot() computes the persisted
   * BalanceSnapshot.tightAvailableBalance field (SHGT exposure for IPLC_LC/EPLC_LC, Present Docs
   * Earmark for EPLC_CONFIRMATION).
   */
  private checkDecreaseShapedSufficiency(ctx: MovementSufficiencyContext): MovementSufficiencyOutcome {
    const { contract, existingMovements, confirmedBalance, availableBalance, ceilingAmount, req } = ctx;
    const pendingDecreaseTotal = computePendingDecreaseTotal(existingMovements);
    let tightAvailableForDecrease = availableBalance;
    if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
      const shgtMovements = this.movements.listShgtMovementsForParent(contract.logicalContractId);
      tightAvailableForDecrease = confirmedBalance.minus(pendingDecreaseTotal).minus(computeOffBalanceExposure(shgtMovements));
    } else if (contract.instrumentType === 'EPLC_CONFIRMATION') {
      // Deliberately STRICT (no provisionally-consumed override) — an AMEND_DECREASE is a genuinely
      // independent transaction against the LC's own balance, same posture as B3's own new-presentation
      // check; it must never benefit from another PENDING B4's own provisional netting.
      const examinationMovements = this.movements.listExaminationMovementsForParent(contract.logicalContractId);
      tightAvailableForDecrease = confirmedBalance.minus(pendingDecreaseTotal).minus(computePresentDocsEarmark(examinationMovements));
    }
    return checkAmendDecreaseSufficiency({
      amount: parseMonetaryAmount(req.amount).abs(),
      ceilingAmount: ceilingAmount.abs(),
      tightAvailableBalance: tightAvailableForDecrease,
    });
  }

  /** UTILIZE/HONOUR/ACCEPT — nets outstanding SHGT off-balance exposure for IPLC_LC/EPLC_LC only. */
  private checkUtilizeShapedSufficiency(ctx: MovementSufficiencyContext): MovementSufficiencyOutcome {
    const { contract, existingMovements, confirmedBalance, availableBalance, ceilingAmount, req } = ctx;
    let offBalanceExposure = new Decimal(0);
    if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
      const shgtMovements = this.movements.listShgtMovementsForParent(contract.logicalContractId);
      // THIS movement (the LC's own UTILIZE) isn't inserted yet, so it can't appear in `existingMovements`
      // for assembleSnapshot()'s own automatic businessEventId derivation to pick up — req.businessEventId
      // matches ONLY A3S's own matched-SG redemption leg it just created in THIS same compound submission
      // (see computeOffBalanceExposure()'s own doc comment for why this is the one deliberate exception to
      // "a PENDING redemption never counts as netted").
      const matchedPendingUtilizeBusinessEventIds = req.businessEventId ? new Set([req.businessEventId]) : undefined;
      offBalanceExposure = computeOffBalanceExposure(shgtMovements, matchedPendingUtilizeBusinessEventIds);
    }
    const pendingDecreaseTotal = computePendingDecreaseTotal(existingMovements);
    return checkUtilizeSufficiency({
      requestedAmount: ceilingAmount,
      availableBalance,
      confirmedBalance,
      pendingDecreaseTotal,
      offBalanceExposure,
    });
  }

  /**
   * BAL-142 (2026-08-20, reviewer-directed decomposition of createMovement()'s own worst Cognitive
   * Complexity finding — 71 vs. an allowed 15) — SHGT ISSUE and EPLC_EXAMINATION CREATE's own
   * creation-time sufficiency checks share one shape (resolve parent → confirmed/pendingDecreaseTotal →
   * gather existing siblings → compute earmark/exposure → call the domain check → throw on failure) and
   * used to live as two structurally-identical inline if-blocks inside createMovement()'s own "creating a
   * new contract" branch. Collapsed into a registry keyed by `${instrumentType}:${movementType}` — the
   * SAME "table over conditional chain" convention buildMovementTypeRegistry() already established in
   * this file, extended to this earlier, contract-creation-time dispatch point. Keyed by the FULL
   * instrumentType+movementType pair, not instrumentType alone, deliberately preserving the exact
   * original guard (`req.instrumentType === 'SHGT' && req.movementType === 'ISSUE'` etc.) — SHGT/
   * EPLC_EXAMINATION only ever use one creating movementType each in practice, but keying on instrumentType
   * alone would silently run this check against a hypothetical malformed SHGT+CREATE request the original
   * code never did (a genuine, if inconsequential, behavior change this extraction must not introduce).
   */
  private buildNewContractSufficiencyRegistry(): Readonly<Record<string, (req: CreateMovementRequest) => void>> {
    return {
      'SHGT:ISSUE': (req) => this.checkNewShgtSufficiency(req),
      'EPLC_EXAMINATION:CREATE': (req) => this.checkNewPresentDocsSufficiency(req),
    };
  }

  /**
   * Business instruction 2026-08-14 ("SG issue amount should be less than the LC Current Balance"),
   * business-confirmed fix 2026-08-14 (v0.11, nets out other already-outstanding SG exposure on the same
   * LC first — see design doc v0.10 changelog for the reversal record this overrides). Checked BEFORE
   * `createContract()` — a rejected request must never leave an orphaned, empty BalanceContract row
   * behind. Throws on failure; a plain return means the request may proceed. desiger-comments.md F-02:
   * the actual sufficiency comparison lives in domain/offBalanceExposure.ts's own
   * checkShgtIssueSufficiency() — this method is pure code motion, same condition/messages as before.
   */
  private checkNewShgtSufficiency(req: CreateMovementRequest): void {
    if (!req.parentLogicalContractId) {
      throw new RequestValidationError("parentLogicalContractId is required to check SG Issue against the parent LC's Available Balance.");
    }
    const parentLc = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
    if (!parentLc) {
      throw new RequestValidationError(`Parent LC (logicalContractId ${req.parentLogicalContractId}) not found or not ACTIVE.`);
    }
    const parentMovements = this.movements.listByContract(parentLc.balanceContractId);
    const parentConfirmed = computeConfirmedBalance(parentMovements);
    const parentPendingDecreaseTotal = computePendingDecreaseTotal(parentMovements);
    const existingShgtMovements = this.movements.listShgtMovementsForParent(parentLc.logicalContractId);
    const existingShgtExposure = computeOffBalanceExposure(existingShgtMovements);
    // Quality-report-balance.md BAL-115 — parseMonetaryAmount() is the only module allowed to construct a
    // Decimal from a wire string; the HTTP route already validates this, but this service method is also
    // called directly from tests/other callers that bypass the route.
    const requestedAmount = parseMonetaryAmount(req.amount);
    const sgCheck = checkShgtIssueSufficiency({ requestedAmount, parentConfirmedBalance: parentConfirmed, parentPendingDecreaseTotal, existingShgtExposure });
    if (!sgCheck.ok) throw new InsufficientBalanceError(sgCheck.error, { reasonCode: sgCheck.reasonCode });
  }

  /**
   * Business-reported gap 2026-08-15 ("B3 沒檢查到單金額超過 Balance餘額"), hardened the same day into a
   * running "Present Earmark Amount" that nets Σ other still-PENDING presentations, not just the one
   * submitted (see computePresentDocsEarmark's own doc comment). Deliberately STRICT (no
   * provisionally-consumed derivation) — this is a NEW, genuinely independent presentation's own
   * sufficiency check, same posture as checkNewShgtSufficiency()'s own new-SG-Issue check: it must never
   * rely on capacity a DIFFERENT, still-unapproved B4 Accept has only provisionally freed — see
   * derivePresentDocsProvisionallyConsumedIds()'s own doc comment. desiger-comments.md F-02: the actual
   * sufficiency comparison lives in domain/offBalanceExposure.ts's own checkPresentDocsIssueSufficiency().
   */
  private checkNewPresentDocsSufficiency(req: CreateMovementRequest): void {
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
    const parentPendingDecreaseTotal = computePendingDecreaseTotal(parentMovements);
    const existingExaminationMovements = this.movements.listExaminationMovementsForParent(parentConfirmation.logicalContractId);
    const presentDocsEarmark = computePresentDocsEarmark(existingExaminationMovements);
    // Quality-report-balance.md BAL-115 — see checkNewShgtSufficiency()'s own comment above.
    const requestedAmount = parseMonetaryAmount(req.amount);
    const presentDocsCheck = checkPresentDocsIssueSufficiency({
      requestedAmount,
      parentConfirmedBalance: parentConfirmed,
      parentPendingDecreaseTotal,
      presentDocsEarmark,
      parentConfirmationBalanceContractId: parentConfirmation.balanceContractId,
    });
    if (!presentDocsCheck.ok) throw new InsufficientBalanceError(presentDocsCheck.error, { reasonCode: presentDocsCheck.reasonCode });
  }

  /**
   * @param includeAnyStatus opt-in (default false, preserving every existing transaction-creating
   *   caller's own ACTIVE-only behavior — same "Maker-ACTION picker vs. inquiry-only context" split as
   *   CatalogFilter.requireIssueReleased). Look Up Current Balance / Inquire Events pass true so a
   *   CLOSED (A10/B6) contract stays resolvable for inquiry even though it's no longer selectable to act
   *   on — see BalanceContractStore.findByNaturalKey()'s own doc comment.
   */
  resolveContract(instrumentType: InstrumentType, naturalKey: NaturalKey, includeAnyStatus = false): BalanceContract | undefined {
    return includeAnyStatus ? this.contracts.findByNaturalKey(instrumentType, naturalKey) : this.contracts.findActiveByNaturalKey(instrumentType, naturalKey);
  }

  catalog(filter: CatalogFilter): CatalogPage {
    return this.contracts.listCatalog(filter);
  }

  /**
   * A10/B6 Close — the ONE shared eligibility check (domain/closeEligibility.ts) used by
   * listCloseEligibleContracts() below (Step-1 picker hint), createMovement()'s own closeShaped
   * sufficiency check (Maker Submit), and release()'s own re-check (Checker Approve). Walks the whole
   * event tree via parentLogicalContractId — the root's own movements plus every SG/Acceptance/
   * Examination child's own movements — not just this contract's own history.
   *
   * @param excludeMovementId release()'s own re-check passes the CLOSE movement's own movementId here —
   *   at that point it is STILL PENDING (this runs before updateStatus() flips it), so without excluding
   *   it, its own "open event" scan would always see itself and self-reject every Release. createMovement()
   *   never needs this (the new CLOSE movement isn't inserted yet at that point).
   * @param preFetched analysis/Balance-Component-DB-Optimization-Analysis.md P2 N+1 fix (2026-08-21) —
   *   listCloseEligibleContracts() below batch-fetches all 4 movement lists for its WHOLE candidate set up
   *   front (one query each, not one per candidate) and passes the slice for THIS contract here instead of
   *   letting this method issue its own per-candidate queries. createMovement()/release()'s own single-
   *   contract call sites omit this (undefined), unchanged from before this fix — they still query
   *   directly, exactly as this method always has.
   */
  private evaluateContractCloseEligibility(
    contract: BalanceContract,
    excludeMovementId?: string,
    preFetched?: { ownMovements: BalanceMovement[]; sgMovements: BalanceMovement[]; acceptanceMovements: BalanceMovement[]; examinationMovements: BalanceMovement[] },
  ): CloseEligibilityResult {
    const ownMovements = (preFetched?.ownMovements ?? this.movements.listByContract(contract.balanceContractId)).filter(
      (m) => m.movementId !== excludeMovementId,
    );
    let hasOpenEvents = ownMovements.some((m) => m.status === 'PENDING');

    const sgMovements =
      preFetched?.sgMovements ?? (contract.instrumentType === 'IPLC_LC' ? this.movements.listShgtMovementsForParent(contract.logicalContractId) : []);
    if (sgMovements.some((m) => m.status === 'PENDING')) hasOpenEvents = true;

    const acceptanceMovements = preFetched?.acceptanceMovements ?? this.movements.listAcceptanceMovementsForParent(contract.logicalContractId);
    if (acceptanceMovements.some((m) => m.status === 'PENDING')) hasOpenEvents = true;

    // A RELEASED-but-not-yet-presentDocsConsumedAt EPLC_EXAMINATION/CREATE (B3 Checker-approved, but B4
    // hasn't Honoured/Accepted it yet) is not caught by a plain PENDING scan — see
    // domain/offBalanceExposure.ts's own computePresentDocsEarmark doc comment for why `status ===
    // 'RELEASED'` alone doesn't mean this exposure is actually resolved.
    if (contract.instrumentType === 'EPLC_CONFIRMATION') {
      const examinationMovements = preFetched?.examinationMovements ?? this.movements.listExaminationMovementsForParent(contract.logicalContractId);
      for (const m of examinationMovements) {
        if (m.status === 'PENDING') hasOpenEvents = true;
        if (m.status === 'RELEASED' && m.movementType === 'CREATE' && !m.presentDocsConsumedAt) hasOpenEvents = true;
      }
    }

    return evaluateCloseEligibility({
      alreadyClosed: contract.status === 'CLOSED',
      rootConfirmedBalance: computeConfirmedBalance(ownMovements),
      sgConfirmedBalance: computeConfirmedBalance(sgMovements),
      acceptanceConfirmedBalance: computeConfirmedBalance(acceptanceMovements),
      hasOpenEvents,
    });
  }

  /**
   * A10/B6 Close, Step-1 picker hint — every ACTIVE root contract of this instrumentType currently
   * eligible for Close. Eligibility spans multiple tables/instrument types (SG/Acceptance/Examination
   * children), not expressible as a single SQL WHERE clause the way CatalogFilter.requireIssueReleased
   * is — so this fetches one capped raw batch (same "capped batch, then filter, then paginate over the
   * FILTERED result" convention CatalogPickerService already uses on the Angular side — see that
   * service's own doc comment) and evaluates each candidate in memory. 200 is a deliberate, documented
   * cap, not a silent truncation: large enough for this prototype's own data volumes, revisit if a real
   * deployment's ACTIVE-catalog size per instrumentType ever approaches it.
   *
   * analysis/Balance-Component-DB-Optimization-Analysis.md P2 N+1 fix (2026-08-21) — used to call
   * evaluateContractCloseEligibility() once per candidate with no preFetched data, so each candidate ran
   * its own 3-4 queries (up to ~800 for a full 200-item batch). Every instrumentType in ONE call shares the
   * same `instrumentType` param (SG only applies when it's IPLC_LC, Examination only when
   * EPLC_CONFIRMATION — the same condition evaluateContractCloseEligibility() itself branches on), so the
   * 4 movement lists this whole batch could ever need are fetched in ONE query each up front instead, and
   * sliced per candidate from the resulting Maps — a constant ~5 queries total regardless of candidate
   * count, not 1 + 4N.
   */
  listCloseEligibleContracts(
    instrumentType: InstrumentType,
    opts: { lcNumber?: string; page?: number; pageSize?: number; expiredBefore?: string } = {},
  ): CatalogPage {
    if (!ROOT_INSTRUMENT_TYPES.has(instrumentType)) {
      throw new RequestValidationError(`Close only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${instrumentType} is not eligible.`);
    }
    const rawBatch = this.contracts.listCatalog({ instrumentType, status: 'ACTIVE', lcNumber: opts.lcNumber, pageSize: 200 }).items;

    const balanceContractIds = rawBatch.map((c) => c.balanceContractId);
    const logicalContractIds = rawBatch.map((c) => c.logicalContractId);
    const ownMovementsByContract = this.movements.listByContractIds(balanceContractIds);
    const sgMovementsByParent = instrumentType === 'IPLC_LC' ? this.movements.listShgtMovementsForParents(logicalContractIds) : new Map<string, BalanceMovement[]>();
    const acceptanceMovementsByParent = this.movements.listAcceptanceMovementsForParents(logicalContractIds);
    const examinationMovementsByParent =
      instrumentType === 'EPLC_CONFIRMATION' ? this.movements.listExaminationMovementsForParents(logicalContractIds) : new Map<string, BalanceMovement[]>();

    const eligible = rawBatch.filter(
      (c) =>
        this.evaluateContractCloseEligibility(c, undefined, {
          ownMovements: ownMovementsByContract.get(c.balanceContractId) ?? [],
          sgMovements: sgMovementsByParent.get(c.logicalContractId) ?? [],
          acceptanceMovements: acceptanceMovementsByParent.get(c.logicalContractId) ?? [],
          examinationMovements: examinationMovementsByParent.get(c.logicalContractId) ?? [],
        }).eligible,
    );

    // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §0.1, GAP-15 discovery-query fix (2026-08-23) —
    // Layer 1 (the ONLY decision-making layer) of the three-layer expiry-discovery design: lets an
    // external batch system ask "which Close-eligible contracts have also passed their expiryDate", so it
    // doesn't have to page through the whole eligible set client-side to find candidates worth acting on.
    // Deliberately a filter applied AFTER evaluateCloseEligibility() above, never folded into that
    // function itself — evaluateCloseEligibility() must stay independent of expiryDate (the established
    // "cancellation before expiry" design: A10/B6 Close is legitimately allowed before expiry too, so
    // making eligibility itself expiry-gated would break that). A contract with no expiryDate recorded
    // (legacy, pre-Phase-0 data) never matches an expiredBefore filter — same "absent means never trip a
    // date-driven action" convention closeEligibility.ts's own design already uses for absent balances.
    const filtered = opts.expiredBefore ? eligible.filter((c) => c.expiryDate != null && c.expiryDate < opts.expiredBefore!) : eligible;

    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 10;
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
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
    // Business instruction 2026-08-20 ("Tight Available Balance 應該用 Confirmed LC Balance 減其他金額,
    // 因為 APPROVED 才可以動用" / "A2 B2 Decrease Submit 後，對 Tight LC Balance 也是減項") — see
    // computePendingDecreaseTotal()'s own doc comment for the full asymmetric-netting rationale.
    const pendingDecreaseTotal = computePendingDecreaseTotal(movements);

    let offBalanceExposure: string | null = null;
    let tightAvailableBalance: string | null = null;
    if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
      // Business-reported scenario 2026-08-20 ("A35 Refer to S02 G02 Tight Available Balance -8000???",
      // live-reproduced: A1 Issue 10,000 → A8 SG Issue 8,000 → A35 Bill Amount 10,000 Submit) — derives
      // WHICH still-PENDING SG redemptions computeOffBalanceExposure() should ALSO net (its own
      // RELEASED-only default is otherwise correct — see that function's own doc comment) by scanning
      // THIS SAME `movements` list (the LC's own contract) for a still-PENDING `UTILIZE` sharing that
      // redemption's own `businessEventId` — i.e. A3S's own matched second leg. This one derivation feeds
      // every caller of assembleSnapshot() uniformly (the live `GET .../balance` query, the movement's own
      // persisted `eventSnapshot`, and `release()`'s own re-capture) — no separate override needed at any
      // call site: `movements` already includes the just-built (not-yet-inserted) movement object when
      // called from createMovement()'s own eventSnapshot capture, so its own `businessEventId` is picked
      // up automatically the same way an already-persisted one is for a later live query.
      const matchedPendingUtilizeBusinessEventIds = new Set(
        movements.filter((m) => m.status === 'PENDING' && m.movementType === 'UTILIZE' && m.businessEventId).map((m) => m.businessEventId as string),
      );
      const exposure = computeOffBalanceExposure(shgtMovements, matchedPendingUtilizeBusinessEventIds);
      offBalanceExposure = exposure.toFixed();
      tightAvailableBalance = confirmed.minus(pendingDecreaseTotal).minus(exposure).toFixed();
    }

    // Business instruction 2026-08-15 ("Present Docs Earmark (Pending/Approved)") — EPLC_CONFIRMATION only.
    let presentDocsEarmarkPending: string | null = null;
    let presentDocsEarmarkApproved: string | null = null;
    if (contract.instrumentType === 'EPLC_CONFIRMATION') {
      // Business-reported scenario 2026-08-20 ("B4 U02 也有類似問題 Tight Available Balance -10000",
      // Export-side twin of the SG one above) — derives which B3 records B4's own still-PENDING
      // HONOUR/ACCEPT already references (via referencedTransactionId, not businessEventId — B3/B4 never
      // share one, B3 was created in an earlier, separate submission) from THIS SAME `movements` list, the
      // same "automatic from movements, no per-call-site override" pattern the SG exposure block above
      // uses — see derivePresentDocsProvisionallyConsumedIds()'s own doc comment.
      const provisionallyConsumedIds = derivePresentDocsProvisionallyConsumedIds(movements);
      presentDocsEarmarkPending = computePresentDocsEarmarkPending(examinationMovements).toFixed();
      presentDocsEarmarkApproved = computePresentDocsEarmarkApproved(examinationMovements, provisionallyConsumedIds).toFixed();
      // 2026-08-18, user-requested ("Would it be possible to have the same [Tight Available Balance]
      // field for the Export Confirmed LC?") — EPLC_CONFIRMATION has no sibling SHGT exposure to net
      // out (SHGT is Import-only, always a child of IPLC_LC), so this is NOT the same offBalanceExposure
      // computation as above; it reuses the genuine Export-side analog instead — the exact
      // Pending+Approved-combined figure B3's own createMovement() sufficiency check (below) already
      // nets against Available internally (computePresentDocsEarmark == presentDocsEarmarkPending +
      // presentDocsEarmarkApproved, see offBalanceExposure.ts's own doc comments on all three
      // functions) — this just surfaces that same figure as a persisted/queryable BalanceSnapshot field
      // instead of a value computed only inline at submission time.
      tightAvailableBalance = confirmed.minus(pendingDecreaseTotal).minus(computePresentDocsEarmark(examinationMovements, provisionallyConsumedIds)).toFixed();
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
      examinationMovements = this.movements
        .listExaminationMovementsForParent(parent.logicalContractId)
        .filter((m) => m.movementId !== childMovement.movementId);
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
    return {
      acceptanceEventSnapshot: this.resolveAcceptanceSibling(contract, rootInstrumentType),
      sgEventSnapshot: this.resolveSgSibling(contract, rootInstrumentType),
    };
  }

  /** See captureSiblingSnapshots()'s own doc comment for the full "why" — this half resolves the ONE unambiguous Acceptance sibling. Pure code motion, 2026-08-20, no condition changed. */
  private resolveAcceptanceSibling(contract: BalanceContract, rootInstrumentType: InstrumentType): BalanceSnapshot | null {
    if (contract.instrumentType === 'IPLC_ACCEPTANCE' || contract.instrumentType === 'EPLC_ACCEPTANCE') return null;
    const acceptanceType = ACCEPTANCE_TYPE_BY_ROOT[rootInstrumentType];
    if (!acceptanceType) return null;
    const candidates = this.contracts.listCatalog({ instrumentType: acceptanceType, lcNumber: contract.naturalKey.lcNumber }).items;
    const only = candidates.length === 1 ? candidates[0] : undefined;
    return only ? this.getBalanceSnapshot(only.balanceContractId) : null;
  }

  /** See captureSiblingSnapshots()'s own doc comment for the full "why" — this half resolves the ONE unambiguous SG sibling (IPLC_LC only, SHGT is Import-only). Pure code motion, 2026-08-20, no condition changed. */
  private resolveSgSibling(contract: BalanceContract, rootInstrumentType: InstrumentType): BalanceSnapshot | null {
    if (contract.instrumentType === 'SHGT' || rootInstrumentType !== 'IPLC_LC') return null;
    const candidates = this.contracts.listCatalog({ instrumentType: 'SHGT', lcNumber: contract.naturalKey.lcNumber }).items;
    const only = candidates.length === 1 ? candidates[0] : undefined;
    return only ? this.getBalanceSnapshot(only.balanceContractId) : null;
  }

  /**
   * BAL-141 (2026-08-20 quality pass) — createMovement()/release() each independently resolved "own
   * SHGT/EPLC_EXAMINATION siblings -> eventSnapshot -> parent's rootEventSnapshot -> unambiguous
   * Acceptance/SG siblings" in the same four-step shape, differing only in which movements list and
   * which child-movement-object to pass through. Collapsed into one shared bundle; each caller applies
   * the result to its own destination (BalanceMovement fields for createMovement(), updateStatus()
   * params — routed via resolveSnapshotWriteTarget() below — for release()).
   *
   * @param ownMovements this contract's own movement list AS OF the moment being captured — includes
   *   the not-yet-inserted new movement for createMovement()'s own call, or the RELEASED-simulated list
   *   for release()'s own call.
   * @param childMovementForRootCapture the SAME movement, in the EXACT status/acknowledgedAt it has at
   *   this capture moment (PENDING for createMovement(), RELEASED for release()) — see
   *   captureRootEventSnapshot()'s own doc comment for why this can't just be re-read from ownMovements.
   */
  private captureSnapshotBundle(
    contract: BalanceContract,
    ownMovements: readonly BalanceMovement[],
    childMovementForRootCapture: BalanceMovement,
  ): {
    eventSnapshot: BalanceSnapshot;
    rootEventSnapshot: BalanceSnapshot | null;
    acceptanceEventSnapshot: BalanceSnapshot | null;
    sgEventSnapshot: BalanceSnapshot | null;
  } {
    const ownShgtMovements =
      contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC'
        ? this.movements.listShgtMovementsForParent(contract.logicalContractId)
        : [];
    const ownExaminationMovements =
      contract.instrumentType === 'EPLC_CONFIRMATION' ? this.movements.listExaminationMovementsForParent(contract.logicalContractId) : [];
    const eventSnapshot = this.assembleSnapshot(contract, ownMovements, ownShgtMovements, ownExaminationMovements);

    const parent = this.resolveParentContract(contract);
    const rootEventSnapshot = parent ? this.captureRootEventSnapshot(parent, contract.instrumentType, childMovementForRootCapture) : null;

    const rootInstrumentType = parent?.instrumentType ?? contract.instrumentType;
    const siblings = this.captureSiblingSnapshots(contract, rootInstrumentType);

    return { eventSnapshot, rootEventSnapshot, acceptanceEventSnapshot: siblings.acceptanceEventSnapshot, sgEventSnapshot: siblings.sgEventSnapshot };
  }

  /**
   * BAL-141 — see release()'s own call site for the full "why" (BAL-123/2026-08-18 A4 finalize-freeze
   * requirement, "做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變"). Resolves ONCE, up front,
   * which persisted-snapshot columns a release() call should write the captureSnapshotBundle() result
   * into — replacing four separate inline ternaries scattered across the updateStatus() call (Fowler,
   * "Replace Flag Argument with Resolved Policy Object"). Only a Sight-tenor IPLC_LC/UTILIZE (A4
   * finalizing A3/A3S) routes to the finalize* columns; every other release() call uses the plain ones.
   * rootEventSnapshot has no finalize variant — it is always (re)written into the same column, see
   * release()'s own call site.
   *
   * Reviewer-noted (2026-08-20): takes the already-computed `isSightUtilizeFinalize` rather than
   * re-deriving it from `movement`/`contract` itself — release() also needs the same boolean for its own
   * BAL-123 Maker-Submit gate check, earlier in the method; computing it once and passing it through
   * avoids evaluating the identical `movementType`/`instrumentType`/`tenorType` expression twice.
   */
  private resolveSnapshotWriteTarget(isSightUtilizeFinalize: boolean): {
    eventSnapshotField: 'eventSnapshot' | 'finalizeEventSnapshot';
    acceptanceSnapshotField: 'acceptanceEventSnapshot' | 'finalizeAcceptanceEventSnapshot';
    sgSnapshotField: 'sgEventSnapshot' | 'finalizeSgEventSnapshot';
  } {
    return isSightUtilizeFinalize
      ? {
          eventSnapshotField: 'finalizeEventSnapshot',
          acceptanceSnapshotField: 'finalizeAcceptanceEventSnapshot',
          sgSnapshotField: 'finalizeSgEventSnapshot',
        }
      : { eventSnapshotField: 'eventSnapshot', acceptanceSnapshotField: 'acceptanceEventSnapshot', sgSnapshotField: 'sgEventSnapshot' };
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

  /**
   * BAL-142 (2026-08-20, reviewer-directed decomposition of createMovement()'s own worst Cognitive
   * Complexity finding — 71 vs. an allowed 15) — pure code motion: resolves an existing contract by
   * balanceContractId/naturalKey, or creates a brand-new one (re-ISSUE guard, Root-Issue-Released guard,
   * Acceptance Tenor consistency, and the SHGT/EPLC_EXAMINATION creation-time sufficiency checks via
   * newContractSufficiencyRegistry above), exactly as createMovement() used to do inline before this
   * extraction. Every condition/error message is byte-for-byte identical to before.
   */
  private resolveOrCreateContract(req: CreateMovementRequest): BalanceContract {
    let contract: BalanceContract | undefined;
    if (req.balanceContractId) {
      contract = this.contracts.findById(req.balanceContractId);
    } else if (req.naturalKey) {
      contract = this.contracts.findActiveByNaturalKey(req.instrumentType, req.naturalKey);
    }

    // Business-reported gap 2026-08-14: "Issue LC Number 後不能再 Issue 同一筆 LC
    // Number" — a creating movementType (ISSUE/CREATE) against a natural key
    // that ALREADY resolves to an ACTIVE contract must be rejected outright,
    // never silently applied as an extra movement on top of the existing one
    // (that would double-count the Ceiling/Confirmed Balance). This only
    // applies to the naturalKey path — an explicit balanceContractId already
    // implies the caller knows the contract exists.
    if (contract && req.naturalKey && this.movementTypeRegistry[req.movementType]?.isCreating) {
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

    if (contract) {
      // OAS-GAP-16 direction (a), 2026-08-22 — CURRENCY DERIVATION rule 1 (balance-component-api.yaml,
      // documented since v1.0.0, now genuinely enforced): an existing contract's own currency is
      // authoritative; a caller-supplied value that disagrees is rejected, omitting it entirely is fine.
      if (req.currency && req.currency !== contract.currency) {
        throw new CurrencyMismatchError(
          `Supplied currency "${req.currency}" does not match this contract's own currency "${contract.currency}" ` +
            `(balanceContractId ${contract.balanceContractId}) — omit currency entirely; it is derived automatically ` +
            `from the resolved contract.`,
        );
      }
      return contract;
    }

    if (!req.naturalKey) throw new RequestValidationError('naturalKey or balanceContractId is required.');
    if (!this.movementTypeRegistry[req.movementType]?.isCreating) {
      throw new NotFoundError(`No ${req.instrumentType} Logical Contract for this natural key yet — only ISSUE/CREATE may implicitly create one.`);
    }

    // See assertRootIssueReleased's own doc comment — creating a NEW CHILD contract (A6/A7 Acceptance,
    // A8 SG Issue, B3 Present Docs) under a parent LC/Confirmation requires that parent's own ISSUE to
    // already be Checker-Released. Resolved defensively here (each instrument-specific block below
    // re-resolves the same parent for its own sufficiency check) — a not-found/inactive parent falls
    // through to that block's own, more specific error instead of a generic one here.
    //
    // OAS-GAP-16 direction (a) — CURRENCY DERIVATION rule 2, same 2026-08-22 change: a new child
    // contract takes its currency from THIS parent, never freely typed. A not-found parent leaves
    // `derivedCurrency` undefined, falling through to rule 3's "genuinely root" branch below — same
    // lenient "not-found parent is someone else's more specific error to raise" posture the
    // assertRootIssueReleased check right above already uses.
    let derivedCurrency: string | undefined;
    if (req.parentLogicalContractId) {
      const parentForIssueCheck = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
      if (parentForIssueCheck) {
        this.assertRootIssueReleased(parentForIssueCheck, `create a new ${req.instrumentType} under it`);
        if (req.currency && req.currency !== parentForIssueCheck.currency) {
          throw new CurrencyMismatchError(
            `Supplied currency "${req.currency}" does not match the parent contract's own currency ` +
              `"${parentForIssueCheck.currency}" (parentLogicalContractId ${req.parentLogicalContractId}) — omit ` +
              `currency entirely; it is derived automatically from the parent.`,
          );
        }
        derivedCurrency = parentForIssueCheck.currency;

        // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 (2026-08-23) — B3 Present Docs
        // (EPLC_EXAMINATION/CREATE) presentation-vs-expiry check, run against the PARENT's own
        // expiryDate (this new EPLC_EXAMINATION contract has no expiryDate of its own — it's a
        // presentation record, not an LC). See createMovement()'s own A3/A3S UTILIZE check below for the
        // sibling call site "before checkUtilizeSufficiency"/"before checkPresentDocsIssueSufficiency"
        // the spec's own §2/§3 tables both describe.
        if (req.instrumentType === 'EPLC_EXAMINATION' && req.movementType === 'CREATE') {
          this.assertPresentationNotAfterExpiry(parentForIssueCheck.expiryDate, req.documentPresentationDate);
        }
      }
    }

    // Business instruction 2026-08-14: "不然流程控制無法處理 這也是BALANCE
    // COMPONENT範圍之一" — Design doc §7 Tenor Type Routing says a Sight LC
    // never produces an Acceptance, and Seller's/Buyer's Usance Acceptances
    // must carry the SAME Tenor Type their parent LC declared at ISSUE. This
    // is enforced here, not left as an unchecked convention, precisely to
    // stop a maker from creating a flow-inconsistent Acceptance by mistake.
    // desiger-comments.md F-02: the actual check now lives in
    // domain/tenorRouting.ts's own checkAcceptanceTenorConsistency() — pure
    // code motion, same condition/messages as before this extraction.
    if (
      (req.instrumentType === 'IPLC_ACCEPTANCE' || req.instrumentType === 'EPLC_ACCEPTANCE') &&
      req.movementType === 'CREATE' &&
      req.parentLogicalContractId
    ) {
      const parent = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
      const tenorCheck = checkAcceptanceTenorConsistency({
        parentTenorType: parent?.tenorType,
        parentBalanceContractId: parent?.balanceContractId,
        requestedTenorType: req.tenorType,
      });
      if (!tenorCheck.ok) throw new RequestValidationError(tenorCheck.error);
    }

    // BAL-142 — SHGT ISSUE / EPLC_EXAMINATION CREATE's own creation-time sufficiency checks; see
    // buildNewContractSufficiencyRegistry()'s own doc comment for why this is a registry dispatch rather
    // than two inline if-blocks. Checked BEFORE createContract() — a rejected request must never leave an
    // orphaned, empty BalanceContract row behind.
    const newContractCheck = this.newContractSufficiencyRegistry[`${req.instrumentType}:${req.movementType}`];
    if (newContractCheck) newContractCheck(req);

    // OAS-GAP-16 direction (a) — CURRENCY DERIVATION rule 3: a genuinely root new Logical Contract (no
    // parent resolved above) requires currency to be caller-supplied; it becomes this new contract's own
    // authoritative value for every future movement against it or anything created under it.
    if (!derivedCurrency) {
      if (!req.currency) {
        throw new RequestValidationError(
          'currency is required when creating a new root Logical Contract (no existing resolution and no resolvable parentLogicalContractId).',
        );
      }
      derivedCurrency = req.currency;
    }

    // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1 (2026-08-23) — A1/B1 root ISSUE requires
    // expiryDate; every other creating movementType (SHGT ISSUE, Acceptance CREATE, EPLC_EXAMINATION
    // CREATE — all reach this method via the parent-derivation branch above, never this "genuinely root"
    // one) is unaffected. issueDate stays optional here (createContract() defaults it to today).
    if (ROOT_INSTRUMENT_TYPES.has(req.instrumentType) && req.movementType === 'ISSUE' && !req.expiryDate) {
      throw new RequestValidationError(`expiryDate is required when issuing a new root ${req.instrumentType} (A1/B1).`);
    }

    // Maturity-Date-Tenor-Basis-Decision-Review.md v29 §3.1 (business-confirmed) — AFTER_SIGHT/
    // SELLERS_USANCE and tenorBasis-on-a-SIGHT-contract are always rejected when the caller actually
    // supplies a tenorBasis. Deliberately NOT enforced as "tenorBasis is required for Usance" at this
    // layer (same reasoning as the Clearing Bank Calendar Profile note just below — a hard 400 for a
    // missing tenorBasis would reject the large pre-existing corpus of Usance-tenor A1/B1 test fixtures
    // that predate this field). Guarding the call itself on `req.tenorBasis != null` means
    // validateTenorBasisTypeCombination()'s own "tenorBasis is required" branch is never reached here —
    // only fires for a caller who actually opts in by supplying one.
    if (req.tenorBasis != null) {
      const tenorBasisCheck = validateTenorBasisTypeCombination(req.tenorBasis, req.tenorType);
      if (!tenorBasisCheck.ok) throw new RequestValidationError(tenorBasisCheck.error);
    }
    if (req.tenorBasis === 'FIXED_MATURITY_DATE' && !req.fixedMaturityDate) {
      throw new RequestValidationError('fixedMaturityDate is required when tenorBasis is FIXED_MATURITY_DATE.');
    }

    // A6/B4 Calculated Maturity Date (2026-08-23, user-directed) — "required for Usance, not for Sight" is
    // enforced as an ANGULAR FORM validation rule (A1/B1's own required-field styling, gated on tenorType
    // the same way tenorDays already is — see builder-fields.ts), deliberately NOT a server-side
    // RequestValidationError here: a hard 400 at this layer would also reject the large, pre-existing
    // corpus of Usance-tenor A1/B1 test fixtures that predate this feature and have nothing to do with
    // it (every A6/B4/tenor-consistency test in app.test.ts/caseWalkthroughs.test.ts, none of which ever
    // supply maturityDateCalendars). Optional here keeps this feature purely additive — see
    // getMaturityDateCalendarsFromParent()'s own null-fallback for what happens when a Usance LC has none
    // on file (gracefully unaffected, not an error).

    return this.createContract(req, derivedCurrency);
  }

  /**
   * Business requirement 2026-08-19 ("A1-A9, B1-B5 Amount figure should > 0") — server-side backstop for
   * submit-rules.ts's own client-side validateSubmit() guard on the Angular side, which is trivially
   * bypassable by any caller that doesn't go through that UI (confirmed live 2026-08-21: a direct
   * `POST /balance-movements` with `amount: "0"` or `amount: "-5000"` was accepted outright before this
   * fix). Called from BOTH createMovement() (Submit) and release() (Approve) — user-reported
   * ("SUBMIT & RELEASE API 也要有交易金額控制檢查") — same defense-in-depth posture as A10/B6 Close's own
   * eligibility/amount re-check at Release: a Submit-time-only check can't catch a bad amount that
   * reached PENDING some other way (a future second caller, a migration, a seeded fixture).
   *
   * AMEND (B2's own movementType only) is the one case where Direction (Increase/Decrease) is carried by
   * the amount's own sign rather than a distinct movementType (see buildSubmitRequest()'s own doc comment
   * on the Angular side, and MOVEMENT_DIRECTION.AMEND's own fixed +1 in balanceDerivation.ts) — only an
   * exact zero is rejected there, a negative sign is legitimate. CLOSE's own amount is a system-derived
   * write-off that legitimately reaches exactly 0 (an already fully-utilized LC, see
   * domain/closeEligibility.ts) but must never be negative. Every other movementType requires a strictly
   * positive magnitude — this is the general case a raw API caller could otherwise use to create a
   * zero- or negative-faced LC/Acceptance/SG/etc., corrupting every balance derived from it.
   */
  private assertValidAmount(movementType: string, amount: string): void {
    const amt = parseMonetaryAmount(amount);
    if (movementType === 'AMEND') {
      if (amt.isZero()) throw new RequestValidationError(`amount "${amount}" must not be zero for AMEND — Direction is carried by its own sign.`);
      return;
    }
    if (movementType === 'CLOSE') {
      if (amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must not be negative for CLOSE.`);
      return;
    }
    // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 (2026-08-23) — A2/B2 Extend Expiry only
    // ever changes BalanceContract.expiryDate, never Balance/ceilingAmount (see this method's own doc
    // comment for the general rule this is an exception to) — amount carries no meaning here at all, so
    // it's required to be exactly 0 rather than merely "not negative" like CLOSE above.
    if (movementType === 'AMEND_EXPIRY') {
      if (!amt.isZero()) {
        throw new RequestValidationError(`amount "${amount}" must be exactly 0 for AMEND_EXPIRY — this movement only changes expiryDate, never the Balance/ceilingAmount.`);
      }
      return;
    }
    // A6/B4 Calculated Maturity Date (2026-08-23) — A2/B2's own Update Maturity Date Calendars
    // amendment, same "numerically inert, exactly 0" shape as AMEND_EXPIRY immediately above.
    if (movementType === 'AMEND_MATURITY_CALENDARS') {
      if (!amt.isZero()) {
        throw new RequestValidationError(
          `amount "${amount}" must be exactly 0 for AMEND_MATURITY_CALENDARS — this movement only changes the Standing calendar reference config, never the Balance/ceilingAmount.`,
        );
      }
      return;
    }
    if (amt.isZero() || amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must be greater than 0.`);
  }

  /**
   * A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 — shared by A3/A3S's UTILIZE
   * (createMovement()) and B3's EPLC_EXAMINATION/CREATE (resolveOrCreateContract(), checked against the
   * PARENT's own expiryDate). Deliberately a no-op — not a "documentPresentationDate is required" gate —
   * when either side is absent: a legacy contract with no recorded expiryDate has nothing to compare
   * against, and a caller that omits documentPresentationDate entirely gets no NEW rejection from this
   * check (matches the spec's own code sketch, which only ever compares two present values; making
   * documentPresentationDate itself mandatory was not part of what was approved).
   */
  private assertPresentationNotAfterExpiry(expiryDate: string | null | undefined, documentPresentationDate: string | null | undefined): void {
    if (!expiryDate || !documentPresentationDate) return;
    if (documentPresentationDate > expiryDate) {
      throw new RequestValidationError(
        `documentPresentationDate (${documentPresentationDate}) must not be after this contract's own expiryDate (${expiryDate}).`,
        { reasonCode: 'PRESENTATION_AFTER_EXPIRY' },
      );
    }
  }

  /**
   * A6/B4 Calculated Maturity Date (`Maturity-Date-Business-Day-Convention-Decision-Request.md`, resolved
   * 2026-08-23) — the ONE genuinely async, I/O-performing public method on this class (everything else is
   * synchronous, matching `node:sqlite`'s own synchronous `DatabaseSync` — see `db/index.ts`'s doc
   * comment). Deliberately NOT folded into `createMovement()` itself: that method, and every test that
   * calls it directly, stays 100% synchronous and unchanged — this is called separately, and awaited,
   * by `routes/balanceMovements.ts`'s own POST handler BEFORE it calls the (still-synchronous)
   * `createMovement()`, passing the result through as a plain `maturityDate` on the request — exactly the
   * same shape `maturityDate` has always had (see `CreateMovementRequest.maturityDate`'s own doc comment),
   * just now sometimes server-computed instead of only ever caller-supplied. Opt-in only: a caller that
   * doesn't supply `calendars` never reaches this method, and `createMovement()`'s own existing
   * `req.maturityDate ?? null` passthrough is completely unaffected for every other caller.
   *
   * `sourceDate` is the already-resolved Contractual Maturity Date candidate — Maturity-Date-Tenor-Basis-
   * Decision-Review.md v29 §8: `tenorBasis === 'FIXED_MATURITY_DATE'` uses `fixedMaturityDate` directly
   * (no Tenor Days arithmetic); every other supported path uses `domain/maturityDateCalculation.ts`'s own
   * `computeSourceDate(baseDate, tenorDays)`. The caller (routes/balanceMovements.ts) resolves which one
   * applies — this method performs no Base Date resolution of its own, only the Standing holiday/weekend
   * adjustment step.
   */
  async calculateAcceptanceMaturityDate(params: {
    sourceDate: string;
    currency?: string;
    calendars: StandingCalendarRef[];
    combinationRule?: AdjustBusinessDayRequest['combinationRule'];
    convention?: AdjustBusinessDayRequest['convention'];
  }): Promise<{ operationalPaymentDate: string; standingCalculationId: string; calendarSnapshotId: string }> {
    const request = buildAdjustBusinessDayRequest({
      sourceDate: params.sourceDate,
      currency: params.currency,
      calendars: params.calendars,
      combinationRule: params.combinationRule,
      convention: params.convention,
    });
    const response = await adjustBusinessDay(request);
    return { operationalPaymentDate: response.adjustedDate, standingCalculationId: response.calculationId, calendarSnapshotId: response.calendarSnapshotId };
  }

  /**
   * A6/B4 Calculated Maturity Date (2026-08-23) — the LC/Confirmation's own Standing calendar config,
   * captured once at A1/B1 root ISSUE and amendable via A2/B2's own AMEND_MATURITY_CALENDARS (see
   * BalanceContract.maturityDateCalendars's own doc comment). Read by `routes/balanceMovements.ts`'s own
   * POST handler, BEFORE it calls `calculateAcceptanceMaturityDate()`, so a Maker creating an Acceptance
   * (A6, or B4's own Usance-branch compound-submission leg) never re-types/re-selects the calendar
   * config per Acceptance — it's inherited automatically from the parent, same "father decides, child
   * inherits" pattern `carriedCurrency`/`tenorType`/`tenorDays` already use elsewhere in this codebase.
   * Returns `null` (not an error) when the parent has no calendars configured — the caller falls back to
   * today's plain, uncalculated `maturityDate` passthrough in that case, exactly as if this feature
   * didn't exist for that LC.
   */
  getMaturityDateCalendarsFromParent(
    parentLogicalContractId: string,
  ): { calendars: MaturityDateCalendarRef[]; combinationRule: string | null; convention: string | null; tenorBasis: TenorBasis | null; fixedMaturityDate: string | null } | null {
    const parent = this.contracts.findActiveByLogicalContractId(parentLogicalContractId);
    if (!parent?.maturityDateCalendars?.length) return null;
    return {
      calendars: parent.maturityDateCalendars,
      combinationRule: parent.maturityDateCombinationRule ?? null,
      convention: parent.maturityDateConvention ?? null,
      // Maturity-Date-Tenor-Basis-Decision-Review.md v29 §3.1/§4/§8 — added alongside the pre-existing
      // calendar fields above so routes/balanceMovements.ts's Risk Containment Gate can resolve the
      // Contractual Maturity Date candidate (currently only the FIXED_MATURITY_DATE path) from the SAME
      // parent lookup, without a second round trip to the contract store.
      tenorBasis: parent.tenorBasis ?? null,
      fixedMaturityDate: parent.fixedMaturityDate ?? null,
    };
  }

  createMovement(req: CreateMovementRequest): CreateMovementResult {
    // Checked BEFORE resolveOrCreateContract() — a rejected ISSUE/CREATE must never leave an orphaned,
    // empty BalanceContract row behind (same "checked before createContract()" posture the SG/Present-
    // Docs sufficiency checks already use, a few lines below in resolveOrCreateContract() itself).
    this.assertValidAmount(req.movementType, req.amount);

    // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 (2026-08-23) — A2/B2 Extend Expiry
    // requires the new expiryDate up front, same "required, checked before touching the contract" posture
    // as assertValidAmount() above and resolveOrCreateContract()'s own A1/B1 expiryDate check below.
    if (req.movementType === 'AMEND_EXPIRY' && !req.expiryDate) {
      throw new RequestValidationError('expiryDate is required for AMEND_EXPIRY.');
    }
    // A6/B4 Calculated Maturity Date (2026-08-23) — same "required, checked up front" posture as
    // AMEND_EXPIRY immediately above.
    if (req.movementType === 'AMEND_MATURITY_CALENDARS' && !req.maturityDateCalendars?.length) {
      throw new RequestValidationError('maturityDateCalendars is required (and must be non-empty) for AMEND_MATURITY_CALENDARS.');
    }

    const contract = this.resolveOrCreateContract(req);

    // Maturity-Date-Tenor-Basis-Decision-Review.md v29 §3.2/§8 (business-confirmed) — B4's own routing
    // (HONOUR vs. ACCEPT) is decided client-side today with no server-side check at all; this adds one,
    // but ONLY when the contract actually has a tenorBasis on file (guarded, same soft-rollout posture as
    // resolveOrCreateContract()'s own tenorBasis validation above) — a legacy EPLC_CONFIRMATION with no
    // tenorBasis would otherwise resolve to MANUAL_REVIEW_REQUIRED (missing tenorBasis) and break every
    // pre-existing B4 flow that predates this field. Only fires for a contract that opted in.
    if (contract.instrumentType === 'EPLC_CONFIRMATION' && (req.movementType === 'HONOUR' || req.movementType === 'ACCEPT') && contract.tenorBasis != null) {
      const routeResolution = resolveExportSettlementRoute({ tenorBasis: contract.tenorBasis, tenorType: contract.tenorType ?? 'SIGHT' });
      if (routeResolution.status === 'MANUAL_REVIEW_REQUIRED') {
        throw new RequestValidationError(`Cannot resolve Export settlement route for ${contract.naturalKey.lcNumber} — ${routeResolution.reason}`);
      }
      const expectedMovementType = routeResolution.route === 'HONOUR' ? 'HONOUR' : 'ACCEPT';
      if (req.movementType !== expectedMovementType) {
        throw new RequestValidationError(
          `Requested movementType "${req.movementType}" does not match this Confirmation's own resolved settlement route ` +
            `("${routeResolution.route}", derived from tenorBasis=${contract.tenorBasis}/tenorType=${contract.tenorType}) — expected "${expectedMovementType}".`,
        );
      }
    }

    // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2 (2026-08-23) — A3/A3S Document Arrival
    // (IPLC_LC/EPLC_LC UTILIZE) presentation-vs-expiry check. Scoped to movementType === 'UTILIZE'
    // specifically, NOT the broader utilizeShaped sufficiency-check family it shares a dispatch entry
    // with in buildMovementTypeRegistry() — HONOUR/ACCEPT (B4) route through that same entry but must
    // NOT get this check (B4's own expiry-related behavior, per the spec's own §2/§3 tables, is the
    // separate Calculated Maturity Date auto-fill, not this reject-if-late rule).
    if (req.movementType === 'UTILIZE') {
      this.assertPresentationNotAfterExpiry(contract.expiryDate, req.documentPresentationDate);
    }

    // OAS-GAP-16 direction (a), 2026-08-22 — the request-layer currency-decimal-scale check
    // (validation/requestSchema.ts) only runs when the caller supplied `currency`, since that layer has
    // no contract to resolve one from. Now that `currency` is optional on every non-root call, re-run the
    // same check here against the RESOLVED contract's own currency — covers both the omitted case (only
    // checked here) and the supplied-and-matching case (re-checked defensively; the two can never
    // disagree by this point, resolveOrCreateContract() already rejected a mismatch).
    const scaleViolation = describeAmountScaleViolation(req.amount, contract.currency);
    if (scaleViolation) throw new RequestValidationError(scaleViolation);

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

    // BAL-141 — table lookup replacing the former NO_CHECK/AMEND-special-case/UTILIZE_SHAPED/
    // OUTSTANDING_CAPPED if/else-if chain; see MovementTypeDescriptor's own doc comment (module top).
    // SHGT's own ISSUE and EPLC_EXAMINATION's own CREATE already ran their own instrument-specific
    // sufficiency check earlier, inside the "creating a new contract" branch above (before
    // createContract()) — a rejected check there never leaves an orphaned, empty BalanceContract row
    // behind; the registry's own ISSUE/CREATE entries are a deliberate no-op down here.
    const descriptor = this.movementTypeRegistry[req.movementType];
    if (!descriptor) {
      throw new RequestValidationError(`Unrecognized movementType "${req.movementType}" for instrumentType ${req.instrumentType}.`);
    }
    // Bug fixed 2026-08-15 (outstanding-capped shape) — must check against `available` (nets out other
    // still-PENDING redemptions on this same SG), not the static `confirmed` balance; see shgtRedeem.ts's
    // own doc comment for the live scenario this was caught from.
    const sufficiency = descriptor.checkSufficiency({
      contract,
      existingMovements,
      confirmedBalance: confirmed,
      availableBalance: available,
      ceilingAmount,
      req,
    });
    if (sufficiency && !sufficiency.ok) {
      throw new InsufficientBalanceError(sufficiency.error, sufficiency.reasonCode ? { reasonCode: sufficiency.reasonCode } : undefined);
    }
    const warnings: MovementWarning[] | null = sufficiency?.warning ? [sufficiency.warning] : null;

    // analysis/contingent-liability-ledger.html — server-derived once, here, at creation time; never
    // recomputed later (Event-Level Relationship requirement). Uses the RESOLVED contract's own
    // tenorType (its declared Sight/Buyer's Usance/Seller's Usance, set at Issue) and, since 2026-08-22
    // (OAS-GAP-16 direction (a)), its own resolved currency too — not req.tenorType/req.currency, which
    // are only ever (optionally) supplied when THIS call is itself the one creating that contract; for
    // every other movement against an already-existing contract, contract.tenorType/currency are the
    // only source, and req.currency may be omitted entirely.
    const contingentAccountEntry = deriveContingentAccountEntry({
      instrumentType: req.instrumentType,
      movementType: req.movementType,
      amount: req.amount,
      currency: contract.currency,
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
      currency: contract.currency,
      legRef: req.legRef ?? null,
      accountEntries: req.exposureNature === 'MEMO' ? null : (req.accountEntries ?? null),
      contingentAccountEntry,
      status: 'PENDING',
      transactionDate: req.transactionDate ?? null,
      businessDate: req.businessDate ?? null,
      valueDate: req.valueDate ?? null,
      documentPresentationDate: req.documentPresentationDate ?? null,
      triggeredByExpiry: req.triggeredByExpiry ?? null,
      // §2/§3 — AMEND_EXPIRY only (the required-if-AMEND_EXPIRY check above already ran); null passthrough
      // for every other movementType, harmless if a caller supplies it anyway (never read back except by
      // this movementType's own release() branch).
      expiryDate: req.expiryDate ?? null,
      // A6/B4 Calculated Maturity Date (2026-08-23) — AMEND_MATURITY_CALENDARS only (the required-if
      // check above already ran); null passthrough otherwise, same posture as expiryDate immediately
      // above.
      maturityDateCalendars: req.maturityDateCalendars ?? null,
      maturityDateCombinationRule: req.maturityDateCombinationRule ?? null,
      maturityDateConvention: req.maturityDateConvention ?? null,
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
    // SAVED TO DB == EVENT BALANCE SNAPSHOT") — eventSnapshot/rootEventSnapshot/siblings, captured
    // in-memory (existingMovements is already fetched above for the sufficiency checks; `movement` isn't
    // inserted yet — no extra DB read, same "simulate rather than round-trip" posture release() below
    // uses). See captureSnapshotBundle()'s own doc comment for what it bundles and why.
    const snapshotBundle = this.captureSnapshotBundle(contract, [...existingMovements, movement], movement);
    movement.eventSnapshot = snapshotBundle.eventSnapshot;
    movement.rootEventSnapshot = snapshotBundle.rootEventSnapshot;
    movement.acceptanceEventSnapshot = snapshotBundle.acceptanceEventSnapshot;
    movement.sgEventSnapshot = snapshotBundle.sgEventSnapshot;

    const result = this.movements.insert(movement);
    if (!result.created) return { created: false, existing: result.existing };
    return { created: true, movement };
  }

  release(movementId: string, releasedBy: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);

    applyStatusTransition({ currentStatus: movement.status, action: 'RELEASE', createdBy: movement.createdBy, actingUser: releasedBy });

    // Re-check (not just at Submit) — see assertValidAmount()'s own doc comment for why. Uses the
    // movement's own already-persisted amount, unchanged since Submit (movements are immutable once
    // created); this is a pure defense-in-depth backstop, not expected to ever actually fire for a
    // movement createMovement() itself created — only for one that reached PENDING some other way.
    this.assertValidAmount(movement.movementType, movement.amount);

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

    // A10/B6 Close — re-run the SAME eligibility check createMovement() ran at Submit, against the
    // THEN-current state, before actually flipping status (Checker Approve is the 3rd of 3 layers sharing
    // evaluateContractCloseEligibility() — see that method's own doc comment). Confirmed Balance is also
    // re-verified still EXACTLY equal to this movement's own frozen ceilingAmount (`before`, computed just
    // above, IS that current figure) — a movement's own ceilingAmount is fixed forever at Submit time
    // (never recomputed here, same invariant every other movementType relies on), so if anything changed
    // it in the Submit-to-Approve window, this Close would either under- or over-write the real balance;
    // safer to force a fresh Submit with the current figure than to special-case CLOSE into recomputing
    // its own amount at Release time.
    if (movement.movementType === 'CLOSE') {
      const eligibility = this.evaluateContractCloseEligibility(contract, movement.movementId);
      if (!eligibility.eligible) {
        throw new IllegalStateTransitionError(
          `Cannot release CLOSE movement ${movementId} — eligibility no longer holds: ${eligibility.reasons.join(' ')} Cancel this CLOSE request and re-submit.`,
          { reasonCode: 'CLOSE_NOT_ELIGIBLE' },
        );
      }
      if (!parseMonetaryAmount(movement.ceilingAmount).equals(before)) {
        throw new IllegalStateTransitionError(
          `Cannot release CLOSE movement ${movementId} — Confirmed Balance has changed since Submit ` +
            `(was ${movement.ceilingAmount}, now ${before.toFixed()}). Cancel this CLOSE request and re-submit with the current figure.`,
          { reasonCode: 'CLOSE_AMOUNT_MISMATCH' },
        );
      }
    }

    const releasedAt = this.now();
    // Compute the after-figure by simulating this one movement flipping to RELEASED,
    // rather than a second DB round-trip — cheaper and avoids a two-write window.
    const after = before.plus(computeConfirmedBalance([{ ...movement, status: 'RELEASED' }]));

    // 2026-08-17 ("...SAVED TO DB == EVENT BALANCE SNAPSHOT") — this movement's own contract's own plain
    // balance AS OF THIS RELEASE, plus root/sibling snapshots (see captureSnapshotBundle()'s own doc
    // comment for what it bundles). Same in-memory simulation posture as before/after above: flip this
    // one movement to RELEASED in the already-fetched movement list rather than reading the DB again
    // after updateStatus() below writes it.
    const releasedSelf = { ...movement, status: 'RELEASED' as const };
    const ownMovements = this.movements.listByContract(contract.balanceContractId).map((m) => (m.movementId === movementId ? releasedSelf : m));
    const snapshotBundle = this.captureSnapshotBundle(contract, ownMovements, releasedSelf);

    // 2026-08-18 ("做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變" / "SNAP SHOT保留當時 LC,
    // SG, ACCEPTANCE BALANCE 不會因為後續交易改變") — for every OTHER movement this release-time bundle
    // overwrites eventSnapshot/acceptanceEventSnapshot/sgEventSnapshot directly (whatever
    // createMovement() originally captured). But for a Sight-tenor IPLC_LC/UTILIZE
    // (isSightUtilizeFinalize — this release() call IS A4 finalizing A3's own earlier submission), those
    // three must instead stay frozen at Create-time — Inquire Events' own 'create' row reads them
    // directly (reproduces LC S01 exactly: SG G01 didn't exist yet when A3 was submitted, so its own
    // sgEventSnapshot was correctly null then; without this, A4's own much-later Release would silently
    // overwrite that correct "didn't exist yet" picture with SG G01's by-then-existing balance) — so
    // this release-time bundle goes into the finalize* columns instead. See
    // resolveSnapshotWriteTarget()'s own doc comment, and types.ts's BalanceMovement.eventSnapshot/
    // finalizeEventSnapshot doc comments. rootEventSnapshot has no finalize variant — it is always
    // (re)written here just like every other child-ledger movement, not discarded (B3/EPLC_EXAMINATION's
    // own former special-case here was SUPERSEDED 2026-08-18 — its own release() call is now its own
    // genuine finalization event, so "Confirmed LC Balance" as of THIS Release is correctly captured).
    const snapshotTarget = this.resolveSnapshotWriteTarget(isSightUtilizeFinalize);
    const snapshotFields: Partial<UpdateMovementStatusParams> = {};
    snapshotFields[snapshotTarget.eventSnapshotField] = JSON.stringify(snapshotBundle.eventSnapshot);
    // acceptanceEventSnapshot/sgEventSnapshot use presence-based (not COALESCE) column writes in
    // updateStatus() — only the ACTIVE key of this pair is set below, so the inactive one is OMITTED
    // entirely (not merely passed null), same "hasAcceptanceEventSnapshot/hasSgEventSnapshot correctly
    // compute to 0" behavior the original inline ternaries preserved.
    snapshotFields[snapshotTarget.acceptanceSnapshotField] = snapshotBundle.acceptanceEventSnapshot
      ? JSON.stringify(snapshotBundle.acceptanceEventSnapshot)
      : null;
    snapshotFields[snapshotTarget.sgSnapshotField] = snapshotBundle.sgEventSnapshot ? JSON.stringify(snapshotBundle.sgEventSnapshot) : null;

    this.movements.updateStatus({
      movementId,
      status: 'RELEASED',
      releasedBy,
      releasedAt,
      balanceBefore: before.toFixed(),
      balanceAfter: after.toFixed(),
      rootEventSnapshot: snapshotBundle.rootEventSnapshot ? JSON.stringify(snapshotBundle.rootEventSnapshot) : null,
      ...snapshotFields,
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

    // A10/B6 Close — the movement itself is now RELEASED (recording WHO/WHEN, same as every other
    // movement); this side effect additionally retires the CONTRACT it acted on, mirroring how the
    // referencedTransactionId branch above updates a DIFFERENT record's own state as a release() side
    // effect. ContractStatus.CLOSED was reserved in types.ts from the original design but never
    // previously set anywhere — this is the one place it now is.
    if (movement.movementType === 'CLOSE') {
      this.contracts.markClosed(contract.balanceContractId, releasedAt);
    }

    // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 (2026-08-23) — A2/B2 Extend Expiry: the
    // requested new expiryDate (carried on the movement itself since Submit, createMovement()'s own
    // check already guaranteed it's present for this movementType) becomes the contract's own authoritative
    // expiryDate only once a Checker actually approves it — same "mutate the contract at Release, not
    // Submit" posture as CLOSE's own markClosed() call immediately above.
    if (movement.movementType === 'AMEND_EXPIRY') {
      this.contracts.updateExpiryDate(contract.balanceContractId, movement.expiryDate!);
    }

    // A6/B4 Calculated Maturity Date (2026-08-23) — A2/B2 Update Maturity Date Calendars: the requested
    // new calendar config (carried on the movement since Submit, createMovement()'s own check already
    // guaranteed it's present for this movementType) becomes the contract's own authoritative config
    // only once a Checker actually approves it — same "mutate the contract at Release, not Submit"
    // posture as AMEND_EXPIRY immediately above.
    if (movement.movementType === 'AMEND_MATURITY_CALENDARS') {
      this.contracts.updateMaturityDateCalendars(
        contract.balanceContractId,
        movement.maturityDateCalendars!,
        movement.maturityDateCombinationRule ?? null,
        movement.maturityDateConvention ?? null,
      );
    }

    // Maturity-Date-Tenor-Basis-Decision-Review.md v29 §4/§8 (business-confirmed) — an Acceptance CREATE
    // whose Maturity Date was already computed (contract.maturityDateStatus === 'PENDING_APPROVAL', i.e.
    // it has a verified Base Date, currently only via the FIXED_MATURITY_DATE path) becomes formally
    // APPROVED — the only status downstream consumers (A7/B5 settlement) may reference — at THIS Checker
    // Release, not at Submit. A contract still at 'PENDING_BASE_DATE' (no verified Base Date source) is
    // untouched; releasing the movement itself is still legal (it just can't reach Settlement yet).
    if (movement.movementType === 'CREATE' && (contract.instrumentType === 'IPLC_ACCEPTANCE' || contract.instrumentType === 'EPLC_ACCEPTANCE') && contract.maturityDateStatus === 'PENDING_APPROVAL') {
      this.contracts.markMaturityDateApproved(contract.balanceContractId);
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
   *
   * 2026-08-20 ("SUBMIT/EC/APPROVE DATETIME/USER") — writes `cancelledBy`/`cancelledAt` instead of
   * reusing `releasedBy`/`releasedAt` (the original design, disambiguated only by `status ===
   * 'CANCELLED'`) so the UI can show Submit/EC/Approve as three independently-populated facts — see
   * types.ts's own `cancelledAt` doc comment.
   */
  cancel(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    applyStatusTransition({ currentStatus: movement.status, action: 'CANCEL', createdBy: movement.createdBy, actingUser: cancelledBy });
    this.movements.updateStatus({
      movementId,
      status: 'CANCELLED',
      cancelledBy,
      cancelledAt: this.now(),
      reasonCode: reasonCode ?? 'MAKER_EC',
      remarks,
    });
    return this.movements.findById(movementId)!;
  }

  /**
   * B3's OWN former acknowledge()-only design was REMOVED 2026-08-18 (business instruction, "所有交易要
   * RELEASE過後 才能根據流程走下一個交易") — B3 now uses the standard `release()` above directly, a real
   * PENDING -> RELEASED transition on B3's own record. See `release()`'s own `markPresentDocsConsumed`
   * side effect for what tracks "consumed by B4" now, and `domain/offBalanceExposure.ts`'s own doc
   * comment for the accounting reasoning behind the split.
   *
   * Restored 2026-08-20, RE-PURPOSED for A3/A3S instead (business instruction, "A3 A3S 交易 Approve 過後
   * 不要再顯示") — A3/A3S's own Checker step is still deliberately acknowledgment-only (the LC's own
   * UTILIZE genuinely stays PENDING; A4/A6 finalizes it for real later, see design doc §5.x), but until
   * now that acknowledgment was purely client-side (never persisted), so the Checker Queue kept
   * re-offering an already-approved item forever. Mirrors `submitByMaker()` below exactly — same
   * `guardSecondaryAction()` helper, same "record a second actor's action without touching status" shape
   * — sets `acknowledgedBy`/`acknowledgedAt` only. IPLC_LC/UTILIZE only, the same target shape A4's own
   * `submitByMaker()` uses (A3/A3S's own UTILIZE, before A4 ever touches it).
   */
  acknowledgeArrival(movementId: string, acknowledgedBy: string): BalanceMovement {
    return this.guardSecondaryAction(movementId, {
      presentTense: 'acknowledge',
      pastTense: 'acknowledged',
      validate: (contract, movement) => {
        if (!contract || contract.instrumentType !== 'IPLC_LC' || movement.movementType !== 'UTILIZE') {
          throw new RequestValidationError(
            `acknowledgeArrival() only applies to an IPLC_LC UTILIZE movement (A3/A3S Document Arrival) — ` +
              `movement ${movementId} is ${contract?.instrumentType ?? 'unknown'}/${movement.movementType}.`,
          );
        }
      },
      alreadyDoneAt: (movement) => movement.acknowledgedAt,
      alreadyDoneBy: (movement) => movement.acknowledgedBy,
      persist: (id, now) => this.movements.acknowledge({ movementId: id, acknowledgedBy, acknowledgedAt: now }),
    });
  }

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
   * because B3's own former `acknowledge()` and `submitByMaker()` both needed it. That B3 `acknowledge()`
   * was removed 2026-08-18; `acknowledgeArrival()` above (restored 2026-08-20, re-purposed for A3/A3S)
   * and `submitByMaker()` are this helper's two callers now.
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

  /** `currency` is the caller's own OAS-GAP-16-derived value (resolveOrCreateContract()'s own three
   * CURRENCY DERIVATION rules) — never read from `req.currency` directly here, since for a new CHILD
   * contract it comes from the parent, not necessarily from what the caller typed (or omitted). */
  private createContract(req: CreateMovementRequest, currency: string): BalanceContract {
    const now = this.now();
    const contract: BalanceContract = {
      balanceContractId: randomUUID(),
      logicalContractId: randomUUID(),
      contractVersion: 1,
      instrumentType: req.instrumentType,
      naturalKey: req.naturalKey!,
      parentLogicalContractId: req.parentLogicalContractId ?? null,
      status: 'ACTIVE',
      currency,
      tolerancePct: req.tolerancePct ?? null,
      tenorType: req.tenorType ?? null,
      tenorDays: req.tenorDays ?? null,
      maturityDate: req.maturityDate ?? null,
      // §1 — expiryDate is required (enforced in resolveOrCreateContract()) for A1/B1 root ISSUE, and
      // simply carried through as-is for every other creating movementType (SHGT ISSUE, Acceptance
      // CREATE, etc.), where it was never required and stays null unless a caller supplies one anyway.
      // issueDate defaults to today's Business Date when the caller omits it — spec's own "optional at
      // A1/B1, defaults to today" rule; ignored by every non-root creating movementType too.
      //
      // Bug fixed 2026-08-23 (user-reported, "Inquire Event S101, there is no issue date... shown" —
      // traced to the ROOT cause, not just a display gap): this used to default to the bare `now`
      // ISO-8601 TIMESTAMP (e.g. "2026-08-23T02:25:31.804Z"), not a plain date. That directly violates
      // this whole feature's own "Business Date ≠ Technical Timestamp" architectural invariant
      // (LC-Expiry-Acceptance-Maturity-Control-Review.md) — expiryDate/issueDate are Business Dates,
      // always a plain "YYYY-MM-DD" (confirmed by every caller-supplied expiryDate in this codebase,
      // which always IS plain — it round-trips through an HTML `<input type="date">` on the Angular
      // side). A full timestamp default was the one place this service silently broke that invariant —
      // and HTML's own `<input type="date">` doesn't error on the mismatch, it just renders blank,
      // which is what actually surfaced this as an "Issue Date isn't shown" report rather than a
      // visible format error at Submit time. `now.slice(0, 10)` takes the UTC calendar-date portion of
      // the ISO-8601 timestamp (positions 0-9 are always exactly "YYYY-MM-DD" per the spec) — today's
      // Business Date, not "the exact instant this ran".
      expiryDate: req.expiryDate ?? null,
      issueDate: req.issueDate ?? now.slice(0, 10),
      // A6/B4 Calculated Maturity Date (2026-08-23) — optional at A1/B1 root ISSUE (the ONLY place a
      // caller ever sets this directly; every Acceptance CREATE under it reads it back automatically
      // via getMaturityDateCalendarsFromParent(), never supplies its own), same plain passthrough
      // convention as maturityDate/tolerancePct above. Amendable later via A2/B2 AMEND_MATURITY_CALENDARS
      // (see release()'s own branch) — harmless to also carry through here for a non-root creating
      // movementType (SHGT ISSUE, Acceptance CREATE itself, EPLC_EXAMINATION CREATE), since none of
      // those ever populate it in practice.
      maturityDateCalendars: req.maturityDateCalendars ?? null,
      maturityDateCombinationRule: req.maturityDateCombinationRule ?? null,
      maturityDateConvention: req.maturityDateConvention ?? null,
      // Maturity-Date-Tenor-Basis-Decision-Review.md v29 §3.1 — set on the root LC/Confirmation at A1/B1
      // (harmless passthrough for every other creating movementType, same posture as maturityDateCalendars
      // above; a non-root creating movementType never actually populates these in practice).
      tenorBasis: req.tenorBasis ?? null,
      fixedMaturityDate: req.fixedMaturityDate ?? null,
      // v29 §4/§5/§8 (Risk Containment Gate) — only ever set for a genuinely computed value (see
      // routes/balanceMovements.ts's own Risk Containment Gate logic, which resolves these BEFORE
      // calling createMovement() — this method itself performs no calculation, only persistence).
      // contractualMaturityDate present -> the caller already resolved a verified Base Date (currently
      // only the FIXED_MATURITY_DATE path) -> PENDING_APPROVAL; absent -> PENDING_BASE_DATE, the safe
      // default for every tenorBasis this service cannot yet verify a Base Date for. Only meaningful for
      // an Acceptance contract (IPLC_ACCEPTANCE/EPLC_ACCEPTANCE) — null for every other instrumentType.
      contractualMaturityDate: req.contractualMaturityDate ?? null,
      operationalPaymentDate: req.operationalPaymentDate ?? null,
      standingCalculationId: req.standingCalculationId ?? null,
      calendarSnapshotId: req.calendarSnapshotId ?? null,
      maturityDateStatus:
        req.instrumentType === 'IPLC_ACCEPTANCE' || req.instrumentType === 'EPLC_ACCEPTANCE'
          ? req.contractualMaturityDate
            ? 'PENDING_APPROVAL'
            : 'PENDING_BASE_DATE'
          : null,
      openingBalance: '0',
      effectiveFrom: now,
      createdBy: req.createdBy,
      createdAt: now,
    };
    this.contracts.insert(contract);
    return contract;
  }
}
