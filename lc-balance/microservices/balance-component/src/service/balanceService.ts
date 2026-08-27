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
import { DeletePendingAuditStore } from '../store/deletePendingAuditStore';
import { applyStatusTransition, assertMakerCheckerSeparation } from '../domain/statusTransition';
import { deriveContingentAccountEntry } from '../domain/contingentAccountEntry';
import { computeCeilingAmount } from '../domain/tolerance';
import { computeAvailableBalance, computeConfirmedBalance, computePendingDecreaseTotal, MOVEMENT_DIRECTION } from '../domain/balanceDerivation';
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
import { evaluateCloseEligibility, type CloseEligibilityResult } from '../domain/closeEligibility';
import { evaluateExpiryEligibility, isPastExpiryGrace, type ExpiryEligibilityResult } from '../domain/expiryEligibility';
import { isPastAutoCloseGrace } from '../domain/autoCloseGracePeriod';
import { domesticNonBusinessDayReason } from '../domain/domesticCalendar';
import { computeReopenRestoreAmount } from '../domain/reopenRestoration';
import {
  AUTO_CLOSE_ENABLED,
  AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS,
  AUTO_CLOSE_REASON_CODE,
  AUTO_EXPIRY_ENABLED,
  BATCH_CHECKER_ACTOR,
  BATCH_MAKER_ACTOR,
  EXPIRY_SWEEP_INTERVAL,
  MAIL_FLOAT_GRACE_DAYS,
  toIntervalMs,
} from '../config';
import { CurrencyMismatchError, IllegalStateTransitionError, InsufficientBalanceError, NaturalKeyAlreadyExistsError, NotFoundError, RequestValidationError } from '../errors';
import type {
  AccountEntry,
  BalanceContract,
  BalanceMovement,
  BalanceSnapshot,
  DeletePendingAuditWithContract,
  ExposureNature,
  InstrumentType,
  MovementStatus,
  MovementWarning,
  NaturalKey,
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
type MovementSufficiencyOutcome = { ok: true; warning?: MovementWarning } | { ok: false; error: string };

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
 * User-directed 2026-08-26 ("UI必輸欄位 API也是必輸欄位 三者一體") — mirrors the Angular client's own
 * `NATURAL_KEY_FIELDS_BY_INSTRUMENT` (balance-component.model.ts), the table `requiredNaturalKeyFields()`
 * reads to decide which of IB Number/SG Number is mandatory, per instrumentType, on a creating movement
 * (A6/A8/B3's own naturalKey field). `lcNumber` itself is always required on any creating movement
 * regardless of instrumentType — enforced unconditionally in assertNaturalKeyFieldsRequired() below, not
 * listed per-type here.
 */
const NATURAL_KEY_FIELDS_BY_INSTRUMENT: Readonly<Record<InstrumentType, ReadonlyArray<'ibNumber' | 'sgNumber'>>> = {
  IPLC_LC: [],
  EPLC_LC: [],
  IPLC_ACCEPTANCE: ['ibNumber'],
  EPLC_ACCEPTANCE: ['ibNumber'],
  SHGT: ['sgNumber'],
  EPLC_CONFIRMATION: [],
  EPLC_DUE_FROM_ISSUING_BANK: ['ibNumber'],
  EPLC_ACCEPTANCE_REIMB_RECEIVABLE: ['ibNumber'],
  EPLC_EXPORT_BILLS_DISCOUNTED: ['ibNumber'],
  EPLC_EXAMINATION: ['ibNumber'],
};

/**
 * User-directed 2026-08-26 — mirrors `dynamicSecondaryRefLabel`/`ctx.dynamicSecondaryRefLabel` client-side
 * (each of these movementTypes has a `TransactionFunction.secondaryRefLabel` set — Amendment No./Times for
 * A2/B2 incl. their own AMEND_EXPIRY_DATE third option, IB/EB Number for A3/A3S/B4). Deliberately NOT
 * every movementType that CAN carry a `sourceTransactionRef` — ISSUE/CREATE/PARTIAL_REDEEM/FULL_REDEEM/
 * PARTIAL_SETTLE/FULL_SETTLE/CLOSE/EXPIRE/REOPEN/REVERSAL all resolve their own identifying reference a
 * different way (naturalKey field, two-field LC+IB/SG search, or reasonCode) and stay optional here, same
 * as before this fix.
 */
const SECONDARY_REF_REQUIRED_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'AMEND_INCREASE',
  'AMEND_DECREASE',
  'AMEND',
  'AMEND_EXPIRY_DATE',
  'UTILIZE',
  'HONOUR',
  'ACCEPT',
]);

/**
 * User-directed 2026-08-26 — mirrors builder-fields.ts's own `required: !!selectedFunction?.
 * tenorTypeOptions?.length`: exactly the 3 (instrumentType, movementType) pairs the Angular client ever
 * submits directly with a Tenor Type picker shown (A1/B1's own ISSUE, A6's own CREATE) — B4's own
 * internal EPLC_ACCEPTANCE leg is server-derived from its parent Confirmation's tenorType, never a
 * separate client submission, so it is deliberately NOT in this set.
 */
const TENOR_TYPE_REQUIRED_PAIRS: ReadonlySet<string> = new Set(['IPLC_LC:ISSUE', 'EPLC_CONFIRMATION:ISSUE', 'IPLC_ACCEPTANCE:CREATE']);

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
  /**
   * F1 (external BA review) — IPLC_LC/EPLC_LC/EPLC_CONFIRMATION ISSUE only (A1/B1). See types.ts's
   * BalanceContract.expiryDate doc comment for the UCP 600 Art. 6(d) rationale.
   */
  expiryDate?: string | null;
  /**
   * F1 (external BA review) — optional override of the per-side config default
   * (MAIL_FLOAT_GRACE_DAYS.IMPORT/EXPORT); when omitted, createContract() below fills in the config
   * default for this instrumentType's side, frozen on the contract from then on — see config.ts's own
   * top doc comment.
   */
  mailFloatGraceDays?: number | null;
  /**
   * F1 (external BA review) — `AMEND_EXPIRY_DATE` only (A2/B2's third amendment option, also the
   * Expiry Extension Amendment entry point once EXPIRED). The new expiryDate value this amendment sets
   * on Checker Release; validated against businessDate (must be strictly later) at both Submit and
   * Release. Ignored for every other movementType.
   */
  newExpiryDate?: string | null;
  /**
   * F1 (external BA review) — `REVERSAL` only. The movementId being reversed — internal-only (never set
   * by an external client; Extension Amendment/Reopen's own release()-time handling is the sole caller
   * that ever passes this when internally invoking createMovement() to build a REVERSAL leg).
   */
  reversalOfMovementId?: string | null;
  transactionDate?: string | null;
  businessDate?: string | null;
  valueDate?: string | null;
  sourceModule?: string | null;
  sourceFunction?: string | null;
  sourceTransactionRef?: string | null;
  /** See BalanceMovement.referencedTransactionId's own doc comment in types.ts for the full rule. */
  referencedTransactionId?: string | null;
  /**
   * F1 proposal §13.1 item 4 (CLOSE)/item 3(a) (REOPEN), BA-ratified 2026-08-25 — mandatory for CLOSE
   * and REOPEN (assertReasonCodeRequired() below rejects a Submit with none); optional/passthrough for
   * every other movementType, same as before this fix. AUTO CLOSE (processSweepCandidate()) always
   * supplies config.ts's own AUTO_CLOSE_REASON_CODE here internally rather than being exempted from the
   * check.
   */
  reasonCode?: string | null;
  /**
   * F1 proposal §13.1 item 2 (BA-ratified 2026-08-25) — `AMEND_EXPIRY_DATE`/`REOPEN` only, upstream
   * consent passthrough. This service does NOT judge whether consent was actually obtained — it only
   * accepts, shape-validates (`consentStatus` against a fixed enum in requestSchema.ts), and persists
   * these for audit. Ignored (but harmlessly stored, same posture as reasonCode) for every other
   * movementType.
   */
  amendmentApproved?: boolean | null;
  amendmentEffective?: string | null;
  consentStatus?: 'NOT_REQUIRED' | 'OBTAINED' | null;
  createdBy: string;
}

export type CreateMovementResult = { created: true; movement: BalanceMovement } | { created: false; existing: BalanceMovement };

export class BalanceService {
  private readonly contracts: BalanceContractStore;
  private readonly movements: BalanceMovementStore;
  private readonly deletePendingAudit: DeletePendingAuditStore;
  private readonly movementTypeRegistry: Readonly<Record<string, MovementTypeDescriptor>>;
  private readonly newContractSufficiencyRegistry: Readonly<Record<string, (req: CreateMovementRequest) => void>>;

  constructor(
    db: Db,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.contracts = new BalanceContractStore(db);
    this.movements = new BalanceMovementStore(db);
    this.deletePendingAudit = new DeletePendingAuditStore(db);
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
    // BA-confirmed 2026-08-21 (TF_Balance_Component_Mapping Rule #1, "SG discharge is instrument-based,
    // not amount-based") — A9 (standalone Shipping Guarantee Redemption) must be Full Redeem only. This
    // was previously enforced ONLY client-side (Angular's A9 screen locks the Amount field and hardcodes
    // movementType: 'FULL_REDEEM') — any other caller (curl, a future second UI, an integration test)
    // could still submit a Partial Redeem directly against the API. Business-confirmed 2026-08-24: enforce
    // it server-side too, at both Maker Submit (here) and Checker Release (release()'s own re-check
    // below) — same defense-in-depth posture as every other client-side-only gate this codebase has
    // since closed (BAL-123's A4 gate, the Amount > 0 backstop). A3S's own matched SG redemption leg is
    // NOT affected: it is genuinely tied to a real Document Arrival via a shared `businessEventId` (see
    // this file's own doc comment history for the A3S/documentArrivalWithSg leg) — that link, not the
    // movementType string alone, is what distinguishes "A9 standalone" from "A3S matched" at the API
    // level, since A3S's own MIN(Bill, SG Outstanding) match can also legitimately equal the full
    // outstanding balance.
    const outstandingCapped: MovementSufficiencyCheck = (ctx) => {
      if (ctx.contract.instrumentType === 'SHGT' && ctx.req.movementType === 'PARTIAL_REDEEM' && !ctx.req.businessEventId) {
        return {
          ok: false,
          error:
            'A9 (Shipping Guarantee Redemption) must be Full Redeem only — Partial Redeem is rejected unless ' +
            'matched to a Document Arrival (A3S), linked via businessEventId.',
        };
      }
      return checkRedeemSufficiency({ redeemAmount: ctx.ceilingAmount, sgAvailableBalance: ctx.availableBalance });
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
        return { ok: false, error: `Cannot Close ${ctx.contract.instrumentType} ${ctx.contract.naturalKey.lcNumber} — ${eligibility.reasons.join(' ')}` };
      }
      if (!ctx.ceilingAmount.equals(ctx.confirmedBalance)) {
        return {
          ok: false,
          error:
            `Close amount must exactly equal the current Confirmed Balance (${ctx.confirmedBalance.toFixed()}) — ` +
            `submitted ${ctx.ceilingAmount.toFixed()}. Re-derive the amount from the current balance and resubmit.`,
        };
      }
      return { ok: true };
    };

    /**
     * F1 (external BA review) — AUTO EXPIRY. Same overall shape as closeShaped above (eligibility +
     * exact-amount check, since this movement's whole purpose is also to write the balance down to
     * precisely 0) but uses evaluateContractExpiryEligibility() — deliberately NOT
     * evaluateContractCloseEligibility() (see domain/expiryEligibility.ts's own top doc comment for
     * why the SG/Acceptance-balance-zero conditions must NOT apply to EXPIRE).
     */
    const expireShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ROOT_INSTRUMENT_TYPES.has(ctx.contract.instrumentType)) {
        return {
          ok: false,
          error: `EXPIRE only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${ctx.contract.instrumentType} is not eligible.`,
        };
      }
      const eligibility = this.evaluateContractExpiryEligibility(ctx.contract);
      if (!eligibility.eligible) {
        return { ok: false, error: `Cannot EXPIRE ${ctx.contract.instrumentType} ${ctx.contract.naturalKey.lcNumber} — ${eligibility.reasons.join(' ')}` };
      }
      if (!ctx.ceilingAmount.equals(ctx.confirmedBalance)) {
        return {
          ok: false,
          error:
            `EXPIRE amount must exactly equal the current Confirmed Balance (${ctx.confirmedBalance.toFixed()}) — ` +
            `submitted ${ctx.ceilingAmount.toFixed()}. Re-derive the amount from the current balance and resubmit.`,
        };
      }
      return { ok: true };
    };

    /**
     * F1 (external BA review) §8 — `AMEND_EXPIRY_DATE` (A2/B2's third amendment option). Two modes,
     * branched on the CONTRACT's own current status (not a caller-supplied flag — the request shape is
     * identical either way, only the target contract's state distinguishes them):
     *  - ACTIVE: a plain amendment, no special eligibility beyond the usual root-issue-released guard
     *    already enforced upstream in resolveOrCreateContract().
     *  - EXPIRED: the Expiry Extension Amendment entry point (§8) — additionally requires
     *    hasOpenEvents === false (§8.8, explicit — this is a brand-new code path, it does not inherit
     *    evaluateContractCloseEligibility()'s own protection).
     * Any other status (CLOSED/CANCELLED/SUPERSEDED) is rejected outright — §7.8 confirms EXPIRED is
     * the only non-ACTIVE state this amendment may act on.
     */
    const amendExpiryDateShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ctx.req.newExpiryDate) {
        return { ok: false, error: 'newExpiryDate is required for AMEND_EXPIRY_DATE.' };
      }
      if (ctx.contract.status !== 'ACTIVE' && ctx.contract.status !== 'EXPIRED') {
        return { ok: false, error: `Cannot amend the Expiry Date of a ${ctx.contract.status} contract — only ACTIVE or EXPIRED contracts are eligible.` };
      }
      if (ctx.contract.status === 'EXPIRED') {
        const { hasOpenEvents } = this.gatherEventTree(ctx.contract);
        if (hasOpenEvents) {
          return { ok: false, error: 'Cannot submit an Expiry Extension Amendment — one or more Events under this LC (including child ledgers) are not yet fully resolved.' };
        }
      }
      const businessDate = ctx.req.businessDate ?? this.now();
      if (ctx.req.newExpiryDate <= businessDate) {
        return { ok: false, error: `newExpiryDate (${ctx.req.newExpiryDate}) must be strictly later than the Business Date (${businessDate}).` };
      }
      return { ok: true };
    };

    /**
     * F1 (external BA review) — `REVERSAL`. Never submitted directly by an external client — only ever
     * created internally (Extension Amendment's/Reopen's own release()-time handling, see those
     * branches in release() below). Validates reversalOfMovementId resolves to a real, RELEASED
     * movement on THIS SAME contract with no existing REVERSAL of its own yet, and forces the amount to
     * exactly match what's being reversed (never a caller-supplied figure).
     */
    const reversalShaped: MovementSufficiencyCheck = (ctx) => {
      const targetId = ctx.req.reversalOfMovementId;
      if (!targetId) return { ok: false, error: 'reversalOfMovementId is required for REVERSAL.' };
      const target = ctx.existingMovements.find((m) => m.movementId === targetId);
      if (!target) return { ok: false, error: `REVERSAL target movement "${targetId}" was not found on this contract.` };
      if (target.status !== 'RELEASED') return { ok: false, error: `Cannot REVERSAL movement "${targetId}" — it is ${target.status}, not RELEASED.` };
      if (ctx.existingMovements.some((m) => m.movementType === 'REVERSAL' && m.reversalOfMovementId === targetId)) {
        return { ok: false, error: `Movement "${targetId}" has already been reversed.` };
      }
      if (!ctx.ceilingAmount.equals(parseMonetaryAmount(target.ceilingAmount))) {
        return { ok: false, error: `REVERSAL amount must exactly equal the reversed movement's own ceilingAmount (${target.ceilingAmount}).` };
      }
      return { ok: true };
    };

    /**
     * F1 (external BA review) §9 — A11/B7 Reopen. Only a CLOSED contract is eligible; `hasOpenEvents`
     * required false (§9.8, explicit — same "brand-new resolution path, no inherited protection"
     * rationale as Extension Amendment's own §8.8). Redesigned 2026-08-25: no separate amount check
     * needed here — createMovement()'s own REOPEN branch already overwrites req.amount with the
     * server-computed restore-chain total (domain/reopenRestoration.ts) before this check ever runs, and
     * assertValidAmount() already rejects a negative result of that computation (should never occur).
     */
    const reopenShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ROOT_INSTRUMENT_TYPES.has(ctx.contract.instrumentType)) {
        return { ok: false, error: `Reopen only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${ctx.contract.instrumentType} is not eligible.` };
      }
      if (ctx.contract.status !== 'CLOSED') {
        return { ok: false, error: `Cannot Reopen ${ctx.contract.instrumentType} ${ctx.contract.naturalKey.lcNumber} — current status is ${ctx.contract.status}, not CLOSED.` };
      }
      const { hasOpenEvents } = this.gatherEventTree(ctx.contract);
      if (hasOpenEvents) {
        return { ok: false, error: 'Cannot Reopen — one or more Events under this LC (including child ledgers) are not yet fully resolved.' };
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
      AMEND: { isCreating: false, checkSufficiency: amendShaped },
      AMEND_DECREASE: { isCreating: false, checkSufficiency: decreaseShaped },
      UTILIZE: { isCreating: false, checkSufficiency: utilizeShaped },
      HONOUR: { isCreating: false, checkSufficiency: utilizeShaped },
      ACCEPT: { isCreating: false, checkSufficiency: utilizeShaped },
      PARTIAL_REDEEM: { isCreating: false, checkSufficiency: outstandingCapped },
      FULL_REDEEM: { isCreating: false, checkSufficiency: outstandingCapped },
      REIMBURSE: { isCreating: false, checkSufficiency: outstandingCapped },
      RECLASSIFY_OUT: { isCreating: false, checkSufficiency: outstandingCapped },
      PARTIAL_SETTLE: { isCreating: false, checkSufficiency: outstandingCapped },
      FULL_SETTLE: { isCreating: false, checkSufficiency: outstandingCapped },
      CLOSE: { isCreating: false, checkSufficiency: closeShaped },
      // F1 (external BA review) — AUTO EXPIRY.
      EXPIRE: { isCreating: false, checkSufficiency: expireShaped },
      // F1 (external BA review) — Expiry Extension Amendment entry point (A2/B2 third option).
      AMEND_EXPIRY_DATE: { isCreating: false, checkSufficiency: amendExpiryDateShaped },
      // F1 (external BA review) — internal-only, see reversalShaped's own doc comment.
      REVERSAL: { isCreating: false, checkSufficiency: reversalShaped },
      // F1 (external BA review) — A11/B7 Reopen.
      REOPEN: { isCreating: false, checkSufficiency: reopenShaped },
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
    if (!sgCheck.ok) throw new InsufficientBalanceError(sgCheck.error);
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
    if (!presentDocsCheck.ok) throw new InsufficientBalanceError(presentDocsCheck.error);
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

  /** Inquire Delete Pending's own LC Catalog step (§11) — see BalanceContractStore.listWithDeletePendingHistory()'s own doc comment. */
  catalogWithDeletePendingHistory(filter: { instrumentType: InstrumentType; q?: string; page?: number; pageSize?: number }): CatalogPage {
    return this.contracts.listWithDeletePendingHistory(filter);
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
  /**
   * F1 (external BA review) — the `hasOpenEvents` tree-walk extracted out of
   * evaluateContractCloseEligibility() below so evaluateContractExpiryEligibility() (AUTO EXPIRY) can
   * share it without duplicating the walk. Same parameters/semantics as before this extraction — see
   * evaluateContractCloseEligibility()'s own remaining doc comment for `excludeMovementId`/`preFetched`.
   */
  private gatherEventTree(
    contract: BalanceContract,
    excludeMovementId?: string,
    preFetched?: { ownMovements: BalanceMovement[]; sgMovements: BalanceMovement[]; acceptanceMovements: BalanceMovement[]; examinationMovements: BalanceMovement[] },
  ): { ownMovements: BalanceMovement[]; sgMovements: BalanceMovement[]; acceptanceMovements: BalanceMovement[]; hasOpenEvents: boolean } {
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

    return { ownMovements, sgMovements, acceptanceMovements, hasOpenEvents };
  }

  private evaluateContractCloseEligibility(
    contract: BalanceContract,
    excludeMovementId?: string,
    preFetched?: { ownMovements: BalanceMovement[]; sgMovements: BalanceMovement[]; acceptanceMovements: BalanceMovement[]; examinationMovements: BalanceMovement[] },
  ): CloseEligibilityResult {
    const { ownMovements, sgMovements, acceptanceMovements, hasOpenEvents } = this.gatherEventTree(contract, excludeMovementId, preFetched);

    return evaluateCloseEligibility({
      alreadyClosed: contract.status === 'CLOSED',
      rootConfirmedBalance: computeConfirmedBalance(ownMovements),
      sgConfirmedBalance: computeConfirmedBalance(sgMovements),
      acceptanceConfirmedBalance: computeConfirmedBalance(acceptanceMovements),
      hasOpenEvents,
    });
  }

  /**
   * F1 (external BA review) §7.2 — AUTO EXPIRY's own eligibility, sharing gatherEventTree()'s
   * `hasOpenEvents` walk with evaluateContractCloseEligibility() above but deliberately NOT its SG/
   * Acceptance-balance-zero conditions (see domain/expiryEligibility.ts's own top doc comment for why).
   */
  private evaluateContractExpiryEligibility(contract: BalanceContract, excludeMovementId?: string): ExpiryEligibilityResult {
    const { hasOpenEvents } = this.gatherEventTree(contract, excludeMovementId);
    return evaluateExpiryEligibility({ contractStatus: contract.status, hasOpenEvents });
  }

  /**
   * F1, user-reported live-testing gap (2026-08-25, "Auto Close 時必須把REOPEN狀態交易排除 不然才REOPEN
   * 下一秒就被AUTO CLOSE掉了" / "還有AUTO EXPIRE 也把REOPEN狀態交易排除") — a contract whose own MOST
   * RECENT movement is a still-fresh REOPEN gets one full sweep interval of grace from BOTH background
   * batches before either is allowed to act on it again, giving a human a genuine window to follow up
   * (Extension Amendment, settle SG/Acceptance, etc.) — not a permanent exclusion (that would silently
   * reintroduce F1's own original gap: an ACTIVE contract REOPEN reactivated with its expiryDate
   * genuinely still in the future must still auto-expire once that date for-real arrives; a "latest
   * movement is REOPEN" check with no time bound would block that forever). Deliberately keyed on the
   * LATEST movement, not merely "was ever Reopened" — once any other movement lands on the contract
   * (Extension Amendment, a settlement, a later genuine EXPIRE), this grace window no longer applies.
   *
   * Covers both directions REOPEN can reactivate into: ACTIVE (AUTO EXPIRY's own candidate pool) and
   * EXPIRED (AUTO CLOSE's own candidate pool, reached via §9.2 Option A when the original expiryDate had
   * already passed) — same helper, called from both sweeps.
   */
  private isRecentlyReopened(contract: BalanceContract, asOf: Date): boolean {
    const sorted = [...this.movements.listByContract(contract.balanceContractId)].sort((a, b) => a.eventSeq - b.eventSeq);
    const latest = sorted[sorted.length - 1];
    if (!latest || latest.movementType !== 'REOPEN' || latest.status !== 'RELEASED' || !latest.releasedAt) return false;
    return asOf.getTime() - new Date(latest.releasedAt).getTime() < toIntervalMs(EXPIRY_SWEEP_INTERVAL);
  }

  /**
   * F1 (external BA review) — one batch-processed contract's outcome, returned by
   * runAutoExpirySweep()/runAutoCloseSweep() for logging/testing (never thrown — a single ineligible-
   * by-the-time-we-got-to-it or already-changed-since-listing candidate must not abort the rest of the
   * sweep, same "one candidate's failure doesn't sink the batch" posture the backend 中台's own
   * runCase() interpreter already uses for Business Case replay).
   */
  private processSweepCandidate(
    contract: BalanceContract,
    movementType: 'EXPIRE' | 'CLOSE',
    createdBy: string,
    releasedBy: string,
    reasonCode?: string,
  ): { balanceContractId: string; ok: boolean; error?: string } {
    const ownMovements = this.movements.listByContract(contract.balanceContractId);
    const confirmedBalance = computeConfirmedBalance(ownMovements);
    try {
      const result = this.createMovement({
        instrumentType: contract.instrumentType,
        balanceContractId: contract.balanceContractId,
        movementType,
        eventSeq: Date.now(),
        amount: confirmedBalance.toFixed(),
        currency: contract.currency,
        createdBy,
        reasonCode,
      });
      if (!result.created) {
        return { balanceContractId: contract.balanceContractId, ok: false, error: `idempotency conflict — a movement already exists at this eventSeq (unexpected for a fresh Date.now() eventSeq).` };
      }
      this.release(result.movement.movementId, releasedBy);
      return { balanceContractId: contract.balanceContractId, ok: true };
    } catch (err) {
      return { balanceContractId: contract.balanceContractId, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * F1 (external BA review) — AUTO EXPIRY. Scans every ACTIVE root LC/Confirmation with a recorded
   * expiryDate, past expiryDate + mailFloatGraceDays, and — for each one still actually eligible right
   * now (a candidate can stop qualifying between being listed and being processed, e.g. a concurrent
   * request creating a new PENDING event on it) — creates and releases an EXPIRE movement for the
   * current Confirmed Balance, using BATCH_MAKER_ACTOR/BATCH_CHECKER_ACTOR as createdBy/releasedBy so
   * the existing, unmodified assertMakerCheckerSeparation() check is satisfied by two distinct actor
   * strings rather than any "system bypass" — see config.ts's own top doc comment. No-ops entirely
   * (returns an empty array without touching the DB) when AUTO_EXPIRY_ENABLED is false.
   *
   * F1, user-reported 2026-08-25 ("AUTO EXPIRE 也把REOPEN狀態交易排除") — also skips a contract still
   * within one sweep interval of its own most recent REOPEN (isRecentlyReopened() above); see that
   * method's own doc comment for why this is a time-bounded grace window, not a permanent exclusion.
   */
  runAutoExpirySweep(asOf: Date = new Date()): { balanceContractId: string; ok: boolean; error?: string }[] {
    if (!AUTO_EXPIRY_ENABLED) return [];
    const results: { balanceContractId: string; ok: boolean; error?: string }[] = [];
    for (const contract of this.contracts.listActiveExpirable()) {
      const graceDays = contract.mailFloatGraceDays ?? (contract.instrumentType === 'EPLC_CONFIRMATION' ? MAIL_FLOAT_GRACE_DAYS.EXPORT : MAIL_FLOAT_GRACE_DAYS.IMPORT);
      if (!isPastExpiryGrace(contract.expiryDate, graceDays, asOf)) continue;
      if (this.isRecentlyReopened(contract, asOf)) continue;
      results.push(this.processSweepCandidate(contract, 'EXPIRE', BATCH_MAKER_ACTOR, BATCH_CHECKER_ACTOR));
    }
    return results;
  }

  /**
   * F1 (external BA review) §7.3 — AUTO CLOSE. Independent second batch: scans every EXPIRED root LC/
   * Confirmation and, for each one that passes the SAME evaluateContractCloseEligibility() check A10/B6
   * themselves use (SG/Acceptance balance both zero, no open Events — deliberately the CLOSE-shaped
   * conditions, not EXPIRE's own), creates and releases a CLOSE movement — the exact same movementType/
   * code path a human A10/B6 submission would produce, just with BATCH_MAKER_ACTOR/BATCH_CHECKER_ACTOR
   * as the actor identities. No-ops entirely when AUTO_CLOSE_ENABLED is false.
   *
   * F1, user-reported 2026-08-25 ("Auto Close 時必須把REOPEN狀態交易排除 不然才REOPEN 下一秒就被AUTO
   * CLOSE掉了") — skips a contract still within one sweep interval of its own most recent REOPEN
   * (isRecentlyReopened() above), giving a human genuine time to act after Reopening an already-expired
   * contract (§9.2 Option A) before AUTO CLOSE would otherwise immediately re-close it. Kept as an
   * interim safeguard alongside the Grace Period gate below, per F1 proposal §13.8 — see TODO.md/
   * CLAUDE.md for the reconciliation note.
   *
   * F1 proposal §13.5 (BA-ratified 2026-08-25) — Auto Close Grace Period: also requires
   * `isPastAutoCloseGrace()` (config.ts's AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS bank BUSINESS days off
   * the contract's own `effectiveTo`, i.e. when it became EXPIRED — see domain/autoCloseGracePeriod.ts's
   * own top doc comment). This also closes the ORIGINAL §8.5 gap this comment used to describe as
   * "known, accepted, deliberately deferred" (a freshly-EXPIRED, already-fully-settled contract going
   * straight to CLOSED in the SAME sweep cycle, with no Expiry Extension Amendment window) — that
   * candidate's own `effectiveTo` was just stamped by THIS cycle's own runAutoExpirySweep(), so
   * `isPastAutoCloseGrace()` is false for it until AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS business days
   * later, regardless of how it reached EXPIRED (genuine EXPIRE or REOPEN-to-EXPIRED alike).
   *
   * `reasonCode` on the generated CLOSE movement is always config.ts's own fixed
   * AUTO_CLOSE_REASON_CODE — see assertReasonCodeRequired()'s own doc comment for why AUTO CLOSE
   * satisfies that requirement this way instead of being exempted from it.
   */
  runAutoCloseSweep(asOf: Date = new Date()): { balanceContractId: string; ok: boolean; error?: string }[] {
    if (!AUTO_CLOSE_ENABLED) return [];
    return this.contracts
      .listExpiredContracts()
      .filter((contract) => !this.isRecentlyReopened(contract, asOf))
      .filter((contract) => isPastAutoCloseGrace(contract.effectiveTo, AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS, asOf))
      .map((contract) => this.processSweepCandidate(contract, 'CLOSE', BATCH_MAKER_ACTOR, BATCH_CHECKER_ACTOR, AUTO_CLOSE_REASON_CODE));
  }

  /**
   * F1 (external BA review) — the one entry point server.ts's own background interval calls: AUTO
   * EXPIRY then, in the SAME cycle, AUTO CLOSE (see runAutoCloseSweep()'s own doc comment for the known
   * §8.5 gap this ordering implies). Each sweep independently no-ops per its own feature flag.
   */
  runExpirySweepCycle(asOf: Date = new Date()): { expiry: { balanceContractId: string; ok: boolean; error?: string }[]; close: { balanceContractId: string; ok: boolean; error?: string }[] } {
    const expiry = this.runAutoExpirySweep(asOf);
    const close = this.runAutoCloseSweep(asOf);
    return { expiry, close };
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
  listCloseEligibleContracts(instrumentType: InstrumentType, opts: { lcNumber?: string; page?: number; pageSize?: number } = {}): CatalogPage {
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

    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 10;
    const start = (page - 1) * pageSize;
    return { items: eligible.slice(start, start + pageSize), total: eligible.length, page, pageSize };
  }

  /**
   * F1 (external BA review) §9.6/§11 — A11/B7 Reopen's own Step-1 picker hint, mirroring
   * listCloseEligibleContracts() above exactly (same batched-per-instrumentType N+1 fix) but filtered to
   * CLOSED contracts and checked against gatherEventTree()'s own `hasOpenEvents` walk only — REOPEN has
   * no SG/Acceptance-balance-zero condition of its own (§9.8), unlike Close.
   */
  listReopenEligibleContracts(instrumentType: InstrumentType, opts: { lcNumber?: string; page?: number; pageSize?: number } = {}): CatalogPage {
    if (!ROOT_INSTRUMENT_TYPES.has(instrumentType)) {
      throw new RequestValidationError(`Reopen only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${instrumentType} is not eligible.`);
    }
    const rawBatch = this.contracts.listCatalog({ instrumentType, status: 'CLOSED', lcNumber: opts.lcNumber, pageSize: 200 }).items;

    const balanceContractIds = rawBatch.map((c) => c.balanceContractId);
    const logicalContractIds = rawBatch.map((c) => c.logicalContractId);
    const ownMovementsByContract = this.movements.listByContractIds(balanceContractIds);
    const sgMovementsByParent = instrumentType === 'IPLC_LC' ? this.movements.listShgtMovementsForParents(logicalContractIds) : new Map<string, BalanceMovement[]>();
    const acceptanceMovementsByParent = this.movements.listAcceptanceMovementsForParents(logicalContractIds);
    const examinationMovementsByParent =
      instrumentType === 'EPLC_CONFIRMATION' ? this.movements.listExaminationMovementsForParents(logicalContractIds) : new Map<string, BalanceMovement[]>();

    const eligible = rawBatch.filter(
      (c) =>
        !this.gatherEventTree(c, undefined, {
          ownMovements: ownMovementsByContract.get(c.balanceContractId) ?? [],
          sgMovements: sgMovementsByParent.get(c.logicalContractId) ?? [],
          acceptanceMovements: acceptanceMovementsByParent.get(c.logicalContractId) ?? [],
          examinationMovements: examinationMovementsByParent.get(c.logicalContractId) ?? [],
        }).hasOpenEvents,
    );

    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 10;
    const start = (page - 1) * pageSize;
    return { items: eligible.slice(start, start + pageSize), total: eligible.length, page, pageSize };
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

  /** Inquire Delete Pending's own View action (§11) — resolves a contract directly by ID, no natural key required. */
  getContractById(balanceContractId: string): BalanceContract {
    const contract = this.contracts.findById(balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${balanceContractId}`);
    return contract;
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
   * Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-
   * Proposal-zh.md §2.1) — the Maker Queue's own "My Pending/My Rejected" worklist, cross-contract and
   * cross-instrumentType. Deliberately does NOT filter to single-leg functions here — that's an
   * Angular-side, per-row action-eligibility concern (Delete Pending's own compound-shape exclusion,
   * §2.5), not a data-access one; this method just answers "what's PENDING/REJECTED under this
   * createdBy". Pairs each movement with its own contract so the caller can resolve LC Number/
   * instrumentType/function without a second round trip per row.
   */
  listMyMovements(params: { createdBy: string; statuses?: MovementStatus[]; page?: number; pageSize?: number }): {
    items: Array<{ movement: BalanceMovement; contract: BalanceContract }>;
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
    const statuses = params.statuses ?? (['PENDING', 'REJECTED'] as MovementStatus[]);
    const { items, total } = this.movements.listByCreatedByAndStatus({ createdBy: params.createdBy, statuses, page, pageSize });
    const rows = items.map((movement) => {
      const contract = this.contracts.findById(movement.balanceContractId);
      if (!contract) throw new NotFoundError(`No BalanceContract ${movement.balanceContractId} (owner of movement ${movement.movementId})`);
      return { movement, contract };
    });
    return { items: rows, total, page, pageSize };
  }

  /**
   * Inquire Delete Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §11, BA &
   * business-directed 2026-08-27) — thin pass-through to DeletePendingAuditStore.search(), which owns
   * the actual JOIN/filter/pagination/sort SQL. See that method's own doc comment for the fixed sort
   * order and why Function is not a server-side filter.
   */
  listDeletePendingAudit(filter: { lcNumber?: string; deletedBy?: string; from?: string; to?: string; page?: number; pageSize?: number }): {
    items: DeletePendingAuditWithContract[];
    total: number;
    page: number;
    pageSize: number;
  } {
    return this.deletePendingAudit.search(filter);
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
      // F1 (external BA review) §8.6/§9.6 — AMEND_EXPIRY_DATE/REOPEN are the only two movementTypes
      // that may legitimately target a non-ACTIVE contract (EXPIRED/CLOSED respectively). A Maker
      // typing the natural key directly (rather than picking from a catalog/hint-set that already
      // resolves to a balanceContractId) needs a fallback resolver for exactly those two — dedicated,
      // narrow, never consulted for any other movementType.
      if (!contract && req.movementType === 'AMEND_EXPIRY_DATE') {
        contract = this.contracts.findExpiredByNaturalKey(req.instrumentType, req.naturalKey);
      } else if (!contract && req.movementType === 'REOPEN') {
        contract = this.contracts.findClosedByNaturalKey(req.instrumentType, req.naturalKey);
      }
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

    // A contract's currency is fixed at ISSUE and never changes — currency stays a required
    // request field (see CurrencyMismatchError's own doc comment for why this is validation-only,
    // not the derive/omit design that was proposed and reverted), but a caller-supplied value that
    // disagrees with the resolved contract's own stored currency is rejected outright rather than
    // silently recorded on the new movement.
    if (contract && req.currency !== contract.currency) {
      throw new CurrencyMismatchError(
        `Supplied currency "${req.currency}" does not match this contract's own currency "${contract.currency}" ` +
          `(balanceContractId ${contract.balanceContractId}).`,
      );
    }

    if (contract) return contract;

    if (!req.naturalKey) throw new RequestValidationError('naturalKey or balanceContractId is required.');
    if (!this.movementTypeRegistry[req.movementType]?.isCreating) {
      throw new NotFoundError(`No ${req.instrumentType} Logical Contract for this natural key yet — only ISSUE/CREATE may implicitly create one.`);
    }

    // See assertRootIssueReleased's own doc comment — creating a NEW CHILD contract (A6/A7 Acceptance,
    // A8 SG Issue, B3 Present Docs) under a parent LC/Confirmation requires that parent's own ISSUE to
    // already be Checker-Released. Resolved defensively here (each instrument-specific block below
    // re-resolves the same parent for its own sufficiency check) — a not-found/inactive parent falls
    // through to that block's own, more specific error instead of a generic one here.
    if (req.parentLogicalContractId) {
      const parentForIssueCheck = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
      if (parentForIssueCheck) {
        this.assertRootIssueReleased(parentForIssueCheck, `create a new ${req.instrumentType} under it`);
        // Same currency-consistency guard as the existing-contract case above — a new child contract
        // (Acceptance/SG/Present Docs) always carries its parent LC/Confirmation's own currency; a
        // caller-supplied value that disagrees is rejected rather than silently creating a child
        // contract with a currency its own parent doesn't share.
        if (req.currency !== parentForIssueCheck.currency) {
          throw new CurrencyMismatchError(
            `Supplied currency "${req.currency}" does not match the parent contract's own currency ` +
              `"${parentForIssueCheck.currency}" (parentLogicalContractId ${req.parentLogicalContractId}).`,
          );
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

    return this.createContract(req);
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
    // F1 (external BA review) — EXPIRE shares CLOSE's own zero-amount exemption: an already-fully-
    // utilized LC that has since expired has 0 left to write off, which is a legitimate figure. REOPEN
    // (redesigned 2026-08-25 — see domain/reopenRestoration.ts) shares the same shape: by the time
    // createMovement() calls this, req.amount has already been overwritten with the server-computed
    // restore-chain total (never a caller-typed value — there is nothing for a human to type), which is
    // always a non-negative sum of prior ceilingAmounts; 0 is a legitimate figure (reopening a CLOSE
    // whose own write-off amount was already 0 — an EXPIRE→CLOSE chain where AUTO CLOSE ran with nothing
    // left, before this Reopen even starts restoring it).
    if (movementType === 'CLOSE' || movementType === 'EXPIRE' || movementType === 'REOPEN') {
      if (amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must not be negative for ${movementType}.`);
      return;
    }
    // F1 (external BA review) — AMEND_EXPIRY_DATE has no balance effect of its own — it only ever
    // carries newExpiryDate, amount is always '0' by construction.
    if (movementType === 'AMEND_EXPIRY_DATE') {
      if (!amt.isZero()) throw new RequestValidationError(`amount "${amount}" must be exactly 0 for ${movementType}.`);
      return;
    }
    // F1 (external BA review) — REVERSAL's own amount must exactly equal the movement it reverses
    // (validated in reversalShaped, which has access to that movement's own ceilingAmount); this only
    // rules out a negative figure here, same posture as CLOSE/EXPIRE above.
    if (movementType === 'REVERSAL') {
      if (amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must not be negative for REVERSAL.`);
      return;
    }
    if (amt.isZero() || amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must be greater than 0.`);
  }

  /**
   * F1 proposal §13.1 item 4 (CLOSE) / item 3(a) (REOPEN), BA-ratified 2026-08-25 — both must carry a
   * caller-supplied reasonCode; a human A10/B6/A11/B7 submission with none is rejected outright. AUTO
   * CLOSE satisfies this by always supplying config.ts's own AUTO_CLOSE_REASON_CODE internally (see
   * processSweepCandidate()) rather than being exempted from the check — this function doesn't need to
   * know who's calling. Every other movementType is unaffected — reasonCode stays optional there, same
   * as before this fix (e.g. still tolerated empty on a pre-existing CLOSE row REOPEN's own restore
   * chain walks back over, see domain/reopenRestoration.ts — this check only gates a NEW CLOSE/REOPEN
   * submission, never re-validates an already-stored one).
   */
  private assertReasonCodeRequired(movementType: string, reasonCode: string | null | undefined): void {
    if ((movementType === 'CLOSE' || movementType === 'REOPEN') && !reasonCode) {
      throw new RequestValidationError(`reasonCode is required for ${movementType}.`);
    }
  }

  /**
   * User-reported 2026-08-26 ("A1 B1 Expiry Date 是必輸欄位... 不然AUTO EXPIRY無法處理") — expiryDate was
   * previously optional at ISSUE, which meant a contract issued with none could never surface in
   * runAutoExpirySweep()'s own candidate query (it only scans contracts whose expiry_date IS NOT NULL —
   * see this file's own doc comment above that sweep). Mandatory only for ISSUE against a root
   * instrumentType (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — expiryDate is structurally inert for any child
   * contract (createContract() already nulls it out for those regardless of what's sent), so there is
   * nothing to require there.
   */
  private assertExpiryDateRequired(req: CreateMovementRequest): void {
    if (req.movementType === 'ISSUE' && ROOT_INSTRUMENT_TYPES.has(req.instrumentType) && !req.expiryDate) {
      throw new RequestValidationError(`expiryDate is required for ISSUE against ${req.instrumentType}.`);
    }
  }

  /**
   * User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... FOR A1 B1... UI API都需要") — the
   * LC/Confirmation's own Expiry Date must be a genuine domestic business day, not a Saturday/Sunday or a
   * public holiday. Same scope as assertExpiryDateRequired() just above (ISSUE against a root
   * instrumentType only) — see domesticCalendar.ts's own top doc comment for the calendar itself and why
   * an out-of-range year is treated as "unknown", not rejected.
   */
  private assertExpiryDateIsBusinessDay(req: CreateMovementRequest): void {
    if (req.movementType !== 'ISSUE' || !ROOT_INSTRUMENT_TYPES.has(req.instrumentType) || !req.expiryDate) return;
    const reason = domesticNonBusinessDayReason(req.expiryDate);
    if (reason) {
      throw new RequestValidationError(`expiryDate ${req.expiryDate} falls on a domestic non-business day (${reason}) — pick a genuine business day.`);
    }
  }

  /**
   * User-directed 2026-08-26 ("UI必輸欄位 API也是必輸欄位 三者一體") — the Angular client already blocks
   * Submit without these (naturalKey.lcNumber/ibNumber/sgNumber on a creating movement — see
   * submit-rules.ts's own "LC Number is mandatory."/"IB Number is mandatory."/"SG Number is mandatory..."
   * guards), but nothing on the server enforced it — a direct API caller could still create a contract
   * with a blank/missing lcNumber, or an IPLC_ACCEPTANCE/SHGT/etc. with no ibNumber/sgNumber at all. Only
   * applies when `req.naturalKey` is actually supplied (the balanceContractId path is a different,
   * already-resolved-contract case this doesn't touch).
   */
  private assertNaturalKeyFieldsRequired(req: CreateMovementRequest): void {
    if (!this.movementTypeRegistry[req.movementType]?.isCreating || !req.naturalKey) return;
    if (!req.naturalKey.lcNumber) {
      throw new RequestValidationError(`naturalKey.lcNumber is required for ${req.movementType} against ${req.instrumentType}.`);
    }
    for (const field of NATURAL_KEY_FIELDS_BY_INSTRUMENT[req.instrumentType] ?? []) {
      if (!req.naturalKey[field]) {
        throw new RequestValidationError(`naturalKey.${field} is required for ${req.movementType} against ${req.instrumentType}.`);
      }
    }
  }

  /**
   * User-directed 2026-08-26 — mirrors submit-rules.ts's own `ctx.dynamicSecondaryRefLabel &&
   * !model.secondaryRef` guard (sent as `sourceTransactionRef` on the wire). See
   * SECONDARY_REF_REQUIRED_MOVEMENT_TYPES' own doc comment for exactly which movementTypes this covers.
   */
  private assertSecondaryRefRequired(req: CreateMovementRequest): void {
    if (SECONDARY_REF_REQUIRED_MOVEMENT_TYPES.has(req.movementType) && !req.sourceTransactionRef) {
      throw new RequestValidationError(`sourceTransactionRef is required for ${req.movementType}.`);
    }
  }

  /**
   * User-directed 2026-08-26 — mirrors builder-fields.ts's own `required: !!selectedFunction?.
   * tenorTypeOptions?.length` (Tenor Type) and submit-rules.ts's own A1-only "Tenor Days must be greater
   * than 0 for Seller's/Buyer's Usance" backstop (Tenor Days). Tenor Days is deliberately checked ONLY
   * for IPLC_LC:ISSUE (A1) — B1/A6 have no equivalent client-side backstop today (they rely solely on
   * builder-fields.ts's own live reactive expression, which this server-side mirror does not extend to,
   * to avoid inventing a NEW client-side rule that doesn't actually exist yet).
   */
  private assertTenorRequired(req: CreateMovementRequest): void {
    const pairKey = `${req.instrumentType}:${req.movementType}`;
    if (!TENOR_TYPE_REQUIRED_PAIRS.has(pairKey)) return;
    if (!req.tenorType) {
      throw new RequestValidationError(`tenorType is required for ${req.movementType} against ${req.instrumentType}.`);
    }
    if (pairKey === 'IPLC_LC:ISSUE' && req.tenorType !== 'SIGHT' && !(req.tenorDays && req.tenorDays > 0)) {
      throw new RequestValidationError(`tenorDays must be greater than 0 for ${req.tenorType}.`);
    }
  }

  createMovement(req: CreateMovementRequest): CreateMovementResult {
    // Checked BEFORE resolveOrCreateContract() — a rejected ISSUE/CREATE must never leave an orphaned,
    // empty BalanceContract row behind (same "checked before createContract()" posture the SG/Present-
    // Docs sufficiency checks already use, a few lines below in resolveOrCreateContract() itself).
    // REOPEN is the one exception, checked further below instead — its real amount isn't known (or
    // meaningful to validate) until AFTER the contract is resolved (see the REOPEN branch just below);
    // REOPEN is never a creating movementType, so skipping this early call carries no orphaned-contract
    // risk the way it would for ISSUE/CREATE.
    if (req.movementType !== 'REOPEN') {
      this.assertValidAmount(req.movementType, req.amount);
    }
    this.assertReasonCodeRequired(req.movementType, req.reasonCode);
    this.assertExpiryDateRequired(req);
    this.assertExpiryDateIsBusinessDay(req);
    this.assertNaturalKeyFieldsRequired(req);
    this.assertSecondaryRefRequired(req);
    this.assertTenorRequired(req);

    const contract = this.resolveOrCreateContract(req);

    const existing = this.movements.findByContractAndEventSeq(contract.balanceContractId, req.eventSeq);
    if (existing) return { created: false, existing };

    // F1, redesigned 2026-08-25 (see domain/reopenRestoration.ts's own top doc comment) — REOPEN's own
    // amount is never caller-typed (the UI sends no Amount field for A11/B7 at all); it's the trailing
    // not-yet-reversed EXPIRE/CLOSE write-off chain on THIS contract, computed fresh here so the
    // movement carries a real amount + a real contingentAccountEntry (below) for the Checker to review
    // BEFORE approving — whatever req.amount originally held (if anything) is discarded.
    if (req.movementType === 'REOPEN') {
      const restoreAmount = computeReopenRestoreAmount(this.movements.listByContract(contract.balanceContractId));
      req = { ...req, amount: restoreAmount.toFixed() };
      this.assertValidAmount(req.movementType, req.amount);
    }

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
    if (sufficiency && !sufficiency.ok) throw new InsufficientBalanceError(sufficiency.error);
    const warnings: MovementWarning[] | null = sufficiency?.warning ? [sufficiency.warning] : null;

    // analysis/contingent-liability-ledger.html — server-derived once, here, at creation time; never
    // recomputed later (Event-Level Relationship requirement). Uses the RESOLVED contract's own
    // tenorType (its declared Sight/Buyer's Usance/Seller's Usance, set at Issue) — not req.tenorType,
    // which is only ever supplied when THIS call is itself the one creating that contract; for every
    // other movement against an already-existing contract, contract.tenorType is the only source.
    // F1 (external BA review) — REVERSAL has no fixed MOVEMENT_DIRECTION entry of its own; resolve the
    // movement it reverses (already fetched as part of assembling this REVERSAL's own amount — see the
    // REVERSAL-shaped sufficiency handling above) so deriveContingentAccountEntry() can derive the
    // flipped Dr/Cr pair. undefined for every other movementType (the param is simply ignored).
    let reversedDirection: 1 | -1 | undefined;
    if (req.movementType === 'REVERSAL' && req.reversalOfMovementId) {
      const original = this.movements.findById(req.reversalOfMovementId);
      const originalDirection = original ? MOVEMENT_DIRECTION[original.movementType] : undefined;
      if (originalDirection === 1 || originalDirection === -1) reversedDirection = originalDirection;
    }

    const contingentAccountEntry = deriveContingentAccountEntry({
      instrumentType: req.instrumentType,
      movementType: req.movementType,
      amount: req.amount,
      currency: req.currency,
      tenorType: contract.tenorType,
      reversedDirection,
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
      reversalOfMovementId: req.reversalOfMovementId ?? null,
      reasonCode: req.reasonCode ?? null,
      amendmentApproved: req.amendmentApproved ?? null,
      amendmentEffective: req.amendmentEffective ?? null,
      consentStatus: req.consentStatus ?? null,
      newExpiryDate: req.newExpiryDate ?? null,
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

    // BAL-142-style decomposition (2026-08-26, SonarQube-scan-report.md — release() had grown to
    // Cognitive Complexity 93, the codebase's own worst finding, after createMovement()'s own equivalent
    // guard-accumulation was decomposed by BAL-142). Every extracted method below is pure code motion —
    // verbatim logic/messages/order preserved, split purely by concern: field-level re-checks that don't
    // need the balance figure, movementType-specific eligibility re-checks that do, the write itself
    // (kept inline — it's the one truly sequential, non-reorderable part), and the post-write side
    // effects (AMEND_EXPIRY_DATE kept as its own method, since it's a self-contained sub-state-machine —
    // Extension vs. plain amendment — not a single side-effect call like its siblings).
    this.assertReleaseSubmitGuards(movement, contract, isSightUtilizeFinalize);

    const before = computeConfirmedBalance(this.movements.listByContract(contract.balanceContractId));
    this.assertReleaseEligibility(movement, contract, before);

    const releasedAt = this.now();
    // Compute the after-figure by simulating this one movement flipping to RELEASED,
    // rather than a second DB round-trip — cheaper and avoids a two-write window.
    // F1 (external BA review) — REVERSAL is the one exception: its own signedAmount resolution needs
    // the movement it reverses to be present in the SAME array passed to computeConfirmedBalance() (see
    // domain/balanceDerivation.ts's own doc comment) — a single-row array can never satisfy that, so
    // REVERSAL recomputes over the FULL movement list with this one row's status flipped instead of the
    // single-row delta trick every other (fixed-direction) movementType uses here. Mathematically
    // equivalent result, just computed differently.
    const after =
      movement.movementType === 'REVERSAL'
        ? computeConfirmedBalance(
            this.movements.listByContract(contract.balanceContractId).map((m) => (m.movementId === movement.movementId ? { ...m, status: 'RELEASED' as const } : m)),
          )
        : before.plus(computeConfirmedBalance([{ ...movement, status: 'RELEASED' }]));

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

    this.applyReleaseSideEffects(movement, contract, releasedBy, releasedAt);
    this.applyAmendExpiryDateReleaseSideEffect(movement, contract, releasedBy, releasedAt);

    return this.movements.findById(movementId)!;
  }

  /**
   * release()'s own pre-write, non-balance-dependent guards — amount/secondaryRef/naturalKey-tenor-
   * expiryDate re-checks (creating movementTypes only) and A4's own Maker-Submit gate. Pure code motion
   * out of release() (BAL-142-style decomposition, 2026-08-26, SonarQube-scan-report.md) — verbatim
   * logic/messages/order preserved.
   */
  private assertReleaseSubmitGuards(movement: BalanceMovement, contract: BalanceContract, isSightUtilizeFinalize: boolean): void {
    // Re-check (not just at Submit) — see assertValidAmount()'s own doc comment for why. Uses the
    // movement's own already-persisted amount, unchanged since Submit (movements are immutable once
    // created); this is a pure defense-in-depth backstop, not expected to ever actually fire for a
    // movement createMovement() itself created — only for one that reached PENDING some other way.
    this.assertValidAmount(movement.movementType, movement.amount);
    // User-directed 2026-08-26 ("API包括 MAKER CHECKER") — same defense-in-depth posture as
    // assertValidAmount() just above: re-checked against the movement's own already-persisted
    // sourceTransactionRef, not expected to ever actually fire for a movement createMovement() itself
    // created — only for one that reached PENDING some other way (e.g. a raw DB insert).
    if (SECONDARY_REF_REQUIRED_MOVEMENT_TYPES.has(movement.movementType) && !movement.sourceTransactionRef) {
      throw new RequestValidationError(`sourceTransactionRef is required for ${movement.movementType}.`);
    }

    // Same re-check posture as above, but only meaningful for the movement that ORIGINALLY created this
    // contract (ISSUE/CREATE) — naturalKey/tenorType/tenorDays are fixed on the CONTRACT at that moment
    // and never change afterward, so re-validating them on every other movementType's own release() would
    // just needlessly re-check the same already-valid contract over and over.
    if (this.movementTypeRegistry[movement.movementType]?.isCreating) {
      if (!contract.naturalKey.lcNumber) {
        throw new RequestValidationError(`naturalKey.lcNumber is required for ${movement.movementType} against ${contract.instrumentType}.`);
      }
      for (const field of NATURAL_KEY_FIELDS_BY_INSTRUMENT[contract.instrumentType] ?? []) {
        if (!contract.naturalKey[field]) {
          throw new RequestValidationError(`naturalKey.${field} is required for ${movement.movementType} against ${contract.instrumentType}.`);
        }
      }
      const pairKey = `${contract.instrumentType}:${movement.movementType}`;
      if (TENOR_TYPE_REQUIRED_PAIRS.has(pairKey)) {
        if (!contract.tenorType) {
          throw new RequestValidationError(`tenorType is required for ${movement.movementType} against ${contract.instrumentType}.`);
        }
        if (pairKey === 'IPLC_LC:ISSUE' && contract.tenorType !== 'SIGHT' && !(contract.tenorDays && contract.tenorDays > 0)) {
          throw new RequestValidationError(`tenorDays must be greater than 0 for ${contract.tenorType}.`);
        }
      }
      // User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... API包括 MAKER CHECKER") — same
      // re-check posture as above, against the contract's own already-persisted expiryDate.
      if (movement.movementType === 'ISSUE' && contract.expiryDate) {
        const reason = domesticNonBusinessDayReason(contract.expiryDate);
        if (reason) {
          throw new RequestValidationError(`expiryDate ${contract.expiryDate} falls on a domestic non-business day (${reason}) — pick a genuine business day.`);
        }
      }
    }

    // BAL-123's own Maker/Checker 4-eyes gate — introduced with submitByMaker() itself — used to be
    // enforced ONLY by the reference Transaction Builder client's own checkerAct(), never here, so any
    // other caller (curl, a future second UI, an integration test) could release an A4-type UTILIZE
    // that was never Maker-submitted, defeating the whole point of the gate.
    if (isSightUtilizeFinalize && !movement.makerSubmittedAt) {
      throw new IllegalStateTransitionError(
        `Cannot release movement ${movement.movementId} — A4 (Sight Settlement) requires a Maker Submit ` +
          `(POST /balance-movements/${movement.movementId}/maker-submit) before the Checker can Release it.`,
      );
    }
  }

  /**
   * release()'s own pre-write, balance-dependent eligibility re-checks — CLOSE/EXPIRE/REOPEN's own
   * "still eligible, amount unchanged since Submit" gates, plus A9's own Full-Redeem-only re-check. Pure
   * code motion out of release() (BAL-142-style decomposition, 2026-08-26, SonarQube-scan-report.md) —
   * verbatim logic/messages/order preserved; `before` is the Confirmed Balance release() already
   * computed for its own write.
   */
  private assertReleaseEligibility(movement: BalanceMovement, contract: BalanceContract, before: Decimal): void {
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
          `Cannot release CLOSE movement ${movement.movementId} — eligibility no longer holds: ${eligibility.reasons.join(' ')} Cancel this CLOSE request and re-submit.`,
        );
      }
      if (!parseMonetaryAmount(movement.ceilingAmount).equals(before)) {
        throw new IllegalStateTransitionError(
          `Cannot release CLOSE movement ${movement.movementId} — Confirmed Balance has changed since Submit ` +
            `(was ${movement.ceilingAmount}, now ${before.toFixed()}). Cancel this CLOSE request and re-submit with the current figure.`,
        );
      }
    }

    // F1 (external BA review) — AUTO EXPIRY's own Release-time re-check, same shape/rationale as
    // CLOSE's above (re-run eligibility + exact-amount check against the THEN-current state).
    if (movement.movementType === 'EXPIRE') {
      const eligibility = this.evaluateContractExpiryEligibility(contract, movement.movementId);
      if (!eligibility.eligible) {
        throw new IllegalStateTransitionError(
          `Cannot release EXPIRE movement ${movement.movementId} — eligibility no longer holds: ${eligibility.reasons.join(' ')} Cancel this EXPIRE request and re-submit.`,
        );
      }
      if (!parseMonetaryAmount(movement.ceilingAmount).equals(before)) {
        throw new IllegalStateTransitionError(
          `Cannot release EXPIRE movement ${movement.movementId} — Confirmed Balance has changed since Submit ` +
            `(was ${movement.ceilingAmount}, now ${before.toFixed()}). Cancel this EXPIRE request and re-submit with the current figure.`,
        );
      }
    }

    // F1, redesigned 2026-08-25 — REOPEN's own Release-time re-check, same shape/rationale as CLOSE/
    // EXPIRE above: re-run eligibility, and re-verify the amount frozen at Submit still matches what
    // domain/reopenRestoration.ts would compute fresh right now — a movement's own ceilingAmount is
    // fixed forever at Submit time (never recomputed here), so if the restore-chain total shifted in
    // the Submit-to-Release window (e.g. a second, racing Reopen attempt), forcing a re-submit is safer
    // than silently restoring a stale figure.
    if (movement.movementType === 'REOPEN') {
      if (contract.status !== 'CLOSED') {
        throw new IllegalStateTransitionError(`Cannot release REOPEN movement ${movement.movementId} — contract status is now ${contract.status}, no longer CLOSED.`);
      }
      const { hasOpenEvents } = this.gatherEventTree(contract, movement.movementId);
      if (hasOpenEvents) {
        throw new IllegalStateTransitionError(`Cannot release REOPEN movement ${movement.movementId} — one or more Events under this LC are not yet fully resolved.`);
      }
      // Excludes THIS movement itself — by Release time it already exists in the DB (created at Submit,
      // still PENDING), and since it's the contract's own most RECENT movement by eventSeq, an
      // un-filtered walk would hit it FIRST (movementType REOPEN, not EXPIRE/CLOSE) and immediately
      // stop, always computing 0 — the exact same excludeMovementId shape gatherEventTree() already
      // needs for its own re-check just above.
      const currentRestoreAmount = computeReopenRestoreAmount(
        this.movements.listByContract(contract.balanceContractId).filter((m) => m.movementId !== movement.movementId),
      );
      if (!parseMonetaryAmount(movement.ceilingAmount).equals(currentRestoreAmount)) {
        throw new IllegalStateTransitionError(
          `Cannot release REOPEN movement ${movement.movementId} — the amount to restore has changed since Submit ` +
            `(was ${movement.ceilingAmount}, now ${currentRestoreAmount.toFixed()}). Cancel this Reopen request and re-submit with the current figure.`,
        );
      }
    }

    // A9 Full-Redeem-only re-check (business-confirmed 2026-08-24) — mirrors the Maker-side guard in
    // buildMovementTypeRegistry()'s own outstandingCapped check above. Not expected to ever actually fire
    // for a movement createMovement() itself created (businessEventId is immutable once set, so a
    // movement that passed the Maker-side gate can't later lose it) — pure defense-in-depth for a
    // movement that reached PENDING some other way, same posture assertValidAmount()'s own doc comment
    // already established for this codebase.
    if (contract.instrumentType === 'SHGT' && movement.movementType === 'PARTIAL_REDEEM' && !movement.businessEventId) {
      throw new IllegalStateTransitionError(
        `Cannot release movement ${movement.movementId} — A9 (Shipping Guarantee Redemption) must be Full Redeem only; ` +
          `a standalone Partial Redeem (no businessEventId) is not a legal release target.`,
      );
    }
  }

  /**
   * release()'s own post-write side effects for the referencedTransactionId consumption marker and
   * CLOSE/EXPIRE/REOPEN's own contract-level state changes. AMEND_EXPIRY_DATE is deliberately NOT here —
   * see applyAmendExpiryDateReleaseSideEffect() below, kept as its own method since it's a self-contained
   * sub-state-machine (Extension vs. plain amendment), not a single side-effect call like its siblings.
   * Pure code motion out of release() (BAL-142-style decomposition, 2026-08-26,
   * SonarQube-scan-report.md) — verbatim logic/order preserved (the two methods' relative call order is
   * safe to swap: AMEND_EXPIRY_DATE and REOPEN are mutually exclusive movementTypes on the same
   * movement, so at most one of the two methods' own movementType-gated bodies can ever fire).
   */
  private applyReleaseSideEffects(movement: BalanceMovement, contract: BalanceContract, releasedBy: string, releasedAt: string): void {
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

    // F1 (external BA review) — AUTO EXPIRY's own release() side effect, same shape as CLOSE's above.
    if (movement.movementType === 'EXPIRE') {
      this.contracts.markExpired(contract.balanceContractId, releasedAt);
    }

    // F1 (external BA review) §9, redesigned 2026-08-25 — A11/B7 Reopen. The movement itself already
    // carries its own real restoration amount (computed at Submit, re-verified above) and has just gone
    // through the SAME generic RELEASED-status/balance-update write every other movementType uses — no
    // separate REVERSAL leg(s) to generate any more (see domain/reopenRestoration.ts's own top doc
    // comment for why). All that's left is the contract-level side effect: reactivate to ACTIVE if the
    // contract's own recorded expiryDate is still in the future, else back to EXPIRED (§9.2 Option A — a
    // separate Expiry Extension Amendment is then required to reach ACTIVE; this implementation does not
    // yet offer §9.2 Option B's single-transaction "REOPEN WITH EXTENSION" compound).
    if (movement.movementType === 'REOPEN') {
      const targetStatus = contract.expiryDate && contract.expiryDate > releasedAt ? 'ACTIVE' : 'EXPIRED';
      this.contracts.reactivate(contract.balanceContractId, targetStatus, releasedAt);
    }
  }

  /**
   * release()'s own AMEND_EXPIRY_DATE side effect — Expiry Extension Amendment (contract EXPIRED ->
   * ACTIVE, restoring whatever's still genuinely outstanding) or a plain expiry-date amendment against
   * an ACTIVE contract (no status change). Kept as its own method rather than folded into
   * applyReleaseSideEffects() above — this is a self-contained sub-state-machine in its own right, not a
   * single side-effect call. Pure code motion out of release() (BAL-142-style decomposition, 2026-08-26,
   * SonarQube-scan-report.md) — verbatim logic/messages/order preserved.
   */
  private applyAmendExpiryDateReleaseSideEffect(movement: BalanceMovement, contract: BalanceContract, releasedBy: string, releasedAt: string): void {
    // F1 (external BA review) §8 — Expiry Extension Amendment / plain expiry-date amendment, both
    // carried by AMEND_EXPIRY_DATE. Re-validates the SAME conditions createMovement() checked at
    // Submit, against the THEN-current state (same "Submit-to-Release window" posture CLOSE/EXPIRE
    // above already establish), before applying the side effect.
    if (movement.movementType !== 'AMEND_EXPIRY_DATE') return;

    if (contract.status !== 'ACTIVE' && contract.status !== 'EXPIRED') {
      throw new IllegalStateTransitionError(
        `Cannot release AMEND_EXPIRY_DATE movement ${movement.movementId} — contract status is now ${contract.status}, no longer ACTIVE or EXPIRED.`,
      );
    }
    const newExpiryDate = movement.newExpiryDate;
    if (!newExpiryDate) throw new IllegalStateTransitionError(`AMEND_EXPIRY_DATE movement ${movement.movementId} has no newExpiryDate recorded.`);
    if (newExpiryDate <= releasedAt) {
      throw new IllegalStateTransitionError(
        `Cannot release AMEND_EXPIRY_DATE movement ${movement.movementId} — newExpiryDate (${newExpiryDate}) is no longer strictly later than the Business Date (${releasedAt}).`,
      );
    }
    if (contract.status === 'EXPIRED') {
      // Expiry Extension Amendment (§8) — re-check hasOpenEvents, restore whatever is still genuinely
      // outstanding, reactivate to ACTIVE.
      const { hasOpenEvents } = this.gatherEventTree(contract, movement.movementId);
      if (hasOpenEvents) {
        throw new IllegalStateTransitionError(
          `Cannot release Expiry Extension Amendment ${movement.movementId} — one or more Events under this LC are not yet fully resolved.`,
        );
      }
      // F1, user-reported live-testing bug (2026-08-25, "IMPORT S01 EXTEND後 無法做後續作業" — traced to
      // a real double-restoration): this contract can reach EXPIRED via a genuine EXPIRE, OR via A11/B7
      // Reopen reactivating it back to EXPIRED (§9.2 Option A, when the original expiryDate had already
      // passed) — and since the 2026-08-25 REOPEN redesign, REOPEN restores the balance DIRECTLY on its
      // own signed amount, leaving no REVERSAL trace behind. The OLD "find the most recent EXPIRE with
      // no REVERSAL pointed at it, always reverse it" logic couldn't tell the two paths apart — it kept
      // finding that same already-restored EXPIRE (no REVERSAL row existed for it) and reversed it a
      // SECOND time, double-crediting the balance. EXPIRE can never chain with itself (it requires
      // status ACTIVE, which its own release side effect immediately clears), and CLOSE can never
      // precede an EXPIRED contract (CLOSE only follows EXPIRED, never the reverse) — so the ONLY
      // movement that could ever need reversing here is a RELEASED EXPIRE sitting as this contract's
      // own most recent movement (excluding this AMEND_EXPIRY_DATE itself); if the most recent movement
      // is anything else (a REOPEN, most commonly), a prior action already restored the balance and
      // there is genuinely nothing left to reverse.
      const ownMovements = this.movements.listByContract(contract.balanceContractId).filter((m) => m.movementId !== movement.movementId);
      const trailing = [...ownMovements].sort((a, b) => a.eventSeq - b.eventSeq).pop();
      const expireMovement = trailing && trailing.status === 'RELEASED' && trailing.movementType === 'EXPIRE' ? trailing : undefined;
      if (expireMovement) {
        this.createAndReleaseReversal(expireMovement, releasedBy, movement.businessEventId ?? movement.movementId);
      }
      this.contracts.reactivate(contract.balanceContractId, 'ACTIVE', releasedAt, newExpiryDate);
    } else {
      // Plain amendment against an ACTIVE contract — just persist the new expiry date, no status change, no REVERSAL.
      this.contracts.reactivate(contract.balanceContractId, 'ACTIVE', releasedAt, newExpiryDate);
    }
  }

  /**
   * F1 (external BA review) §8.3 — shared helper: creates and immediately releases one REVERSAL leg
   * against `original`, linked via reversalOfMovementId (the real correlation, checked by
   * reversalShaped above) and businessEventId (grouping, so Inquire Events reads the compound event as
   * one unit — same convention A3S/B4's own linked legs already use). Uses BATCH_MAKER_ACTOR as the
   * REVERSAL's own createdBy — this leg is a mechanical consequence of the human Checker's own approval
   * (`releasedBy`) of the OUTER Expiry Extension Amendment, not a separate human decision of its own,
   * but createdBy/releasedBy must still be two distinct actor strings to satisfy the existing,
   * unmodified assertMakerCheckerSeparation() check (same posture as AUTO EXPIRY/AUTO CLOSE's own
   * BATCH_MAKER_ACTOR/BATCH_CHECKER_ACTOR pairing) — releasedBy here is the REAL Checker, so a system
   * actor is needed on the createdBy side specifically to keep the two distinct. REOPEN (§9) no longer
   * uses this helper — redesigned 2026-08-25 to carry its own real restoration amount directly, see
   * domain/reopenRestoration.ts.
   */
  private createAndReleaseReversal(original: BalanceMovement, releasedBy: string, businessEventId: string): void {
    const originalContract = this.contracts.findById(original.balanceContractId)!;
    const result = this.createMovement({
      instrumentType: originalContract.instrumentType,
      balanceContractId: original.balanceContractId,
      movementType: 'REVERSAL',
      eventSeq: Date.now(),
      amount: original.ceilingAmount,
      currency: original.currency,
      reversalOfMovementId: original.movementId,
      businessEventId,
      createdBy: BATCH_MAKER_ACTOR,
    });
    if (!result.created) throw new Error(`Unexpected idempotency conflict creating a REVERSAL for movement "${original.movementId}".`);
    this.release(result.movement.movementId, releasedBy);
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
    // applyStatusTransition() above only allows CANCEL from PENDING/REJECTED (statusTransition.ts's own
    // LEGAL_TRANSITIONS table) — movement.status is one of those two here, by construction.
    const statusBefore = movement.status as 'PENDING' | 'REJECTED';
    const cancelledAt = this.now();
    const contract = this.contracts.findById(movement.balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${movement.balanceContractId} (owner of movement ${movement.movementId})`);
    this.movements.updateStatus({
      movementId,
      status: 'CANCELLED',
      cancelledBy,
      cancelledAt,
      reasonCode: reasonCode ?? 'MAKER_EC',
      remarks,
    });
    // Fix Pending/Delete Pending Phase (analysis/Balance-Component-FixPending-DeletePending-
    // Proposal-zh.md §10, BA/business-directed 2026-08-27) — a dedicated, append-only audit trail for
    // EVERY Delete Pending action across all A1-A11/B1-B7 functions, one row per cancel() call. A
    // compound function's own cascade (A3S/B4/B5, checker-actions.service.ts's deleteMakerPending())
    // already calls cancel() once per leg, so each leg gets its own independent audit row automatically
    // — no per-function wiring needed. See db/schema.ts's own delete_pending_audit table doc comment.
    const deleteSeq = this.deletePendingAudit.nextDeleteSeq(
      contract.instrumentType,
      contract.naturalKey.lcNumber,
      contract.naturalKey.ibNumber ?? null,
      contract.naturalKey.sgNumber ?? null,
    );
    this.deletePendingAudit.insert({
      auditId: randomUUID(),
      deleteSeq,
      movementId,
      balanceContractId: movement.balanceContractId,
      eventSeq: movement.eventSeq,
      movementType: movement.movementType,
      sourceTransactionRef: movement.sourceTransactionRef ?? null,
      statusBefore,
      cancelledBy,
      cancelledAt,
      reasonCode: reasonCode ?? 'MAKER_EC',
      remarks: remarks ?? null,
    });
    // Fix Pending/Delete Pending — Delete Pending on a root A1/B1 ISSUE (analysis/Balance-Component-
    // FixPending-DeletePending-Proposal-zh.md, user-directed follow-up) — "同一個 LC number必須可以重復
    //使用": without this, the contract this ISSUE created stays ACTIVE forever (cancel() only ever
    // touched the movement), permanently blocking the same natural key via resolveOrCreateContract()'s
    // own re-ISSUE guard (findActiveByNaturalKey()). Safe by construction: assertRootIssueReleased()
    // guarantees no other movement can exist on a root contract while its own ISSUE is still
    // un-Released, so cancelling it always means this contract never became real.
    if (movement.movementType === 'ISSUE' && ROOT_INSTRUMENT_TYPES.has(contract.instrumentType)) {
      this.contracts.markCancelled(movement.balanceContractId, cancelledAt);
    }
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
        // Business-confirmed 2026-08-24 — genuine 4-eyes separation, same rule release()/reject() enforce
        // via applyStatusTransition(); acknowledgeArrival() bypasses that function entirely (it never
        // changes status), so it needs its own explicit call to the same shared check.
        assertMakerCheckerSeparation(movement.createdBy, acknowledgedBy, 'ACKNOWLEDGE');
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

  private createContract(req: CreateMovementRequest): BalanceContract {
    const now = this.now();
    // F1 (external BA review) — expiryDate only meaningful for the 3 root instrumentTypes (mirrors
    // maturityDate/tolerancePct's own "structurally inert for anything else" posture); a caller-supplied
    // mailFloatGraceDays overrides the per-side config default, otherwise the default is captured here
    // and frozen on the contract from then on (see config.ts's own top doc comment for why).
    const isRoot = ROOT_INSTRUMENT_TYPES.has(req.instrumentType);
    const mailFloatGraceDays = isRoot
      ? (req.mailFloatGraceDays ?? (req.instrumentType === 'EPLC_CONFIRMATION' ? MAIL_FLOAT_GRACE_DAYS.EXPORT : MAIL_FLOAT_GRACE_DAYS.IMPORT))
      : null;
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
      expiryDate: isRoot ? (req.expiryDate ?? null) : null,
      mailFloatGraceDays,
      openingBalance: '0',
      effectiveFrom: now,
      createdBy: req.createdBy,
      createdAt: now,
    };
    this.contracts.insert(contract);
    return contract;
  }
}
