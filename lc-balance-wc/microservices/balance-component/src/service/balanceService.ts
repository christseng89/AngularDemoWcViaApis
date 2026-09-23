/** Coordinates domain policies and persistence for HTTP use cases. Business math stays in `domain/`. */
import { createHash, randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { describeAmountScaleViolation, formatMonetaryAmount, parseMonetaryAmount } from '../money';
import type { Db } from '../db';
import { BalanceContractStore, CatalogFilter, CatalogPage } from '../store/balanceContractStore';
import { BalanceMovementStore } from '../store/balanceMovementStore';
import { DeletePendingAuditStore } from '../store/deletePendingAuditStore';
import { FixPendingAuditStore } from '../store/fixPendingAuditStore';
import { ExcessAccountStore } from '../store/excessAccountStore';
import { ExcessLedgerStore } from '../store/excessLedgerStore';
import { applyStatusTransition, assertMakerCheckerSeparation } from '../domain/statusTransition';
import { deriveContingentAccountEntry } from '../domain/contingentAccountEntry';
import { BalanceAccountMappingService } from './balanceAccountMappingService';
import {
  computeCeilingAmount,
  computeMonetaryAmendment,
  computeResultingTolerancePct,
  MONETARY_AMENDMENT_TYPES,
  type ToleranceChangeDirection,
} from '../domain/tolerance';
import {
  computeAvailableBalance,
  computeConfirmedBalance,
  computeFaceAmount,
  computePendingDecreaseTotal,
  MOVEMENT_DIRECTION,
} from '../domain/balanceDerivation';
import {
  checkPresentDocsIssueSufficiency,
  checkShgtIssueSufficiency,
  checkUtilizeSufficiency,
  computeOffBalanceExposure,
  computePresentDocsEarmark,
} from '../domain/offBalanceExposure';
import { checkAmendDecreaseSufficiency } from '../domain/amendDecrease';
import { checkRedeemSufficiency } from '../domain/shgtRedeem';
import { computeReopenRestoreAmount } from '../domain/reopenRestoration';
import { MovementRequestValidator, ROOT_INSTRUMENT_TYPES } from './movementRequestValidator';
import { BalanceSnapshotService } from './balanceSnapshotService';
import { ContractLifecycleEligibilityService } from './contractLifecycleEligibilityService';
import { LifecycleSweepService } from './lifecycleSweepService';
import { BalanceQueryService } from './balanceQueryService';
import { MovementSnapshotService } from './movementSnapshotService';
import { MovementReleasePolicyService, type CheckerExcessRevaluationResult, type CheckerExcessRuntime } from './movementReleasePolicyService';
import { MovementReleaseSideEffectService } from './movementReleaseSideEffectService';
import { MovementContractService } from './movementContractService';
import {
  MakerExcessSubmitService,
  type MakerExcessSubmitCommand,
  type MakerExcessSubmitDependencies,
  type MakerExcessCurrentFacts,
  type MakerExcessSubmitResult,
} from './makerExcessSubmitService';
import { MakerExcessConcurrencyError, SqliteMakerExcessUnitOfWork, SqliteUnitOfWork } from './unitOfWork';
import { CommandIdempotencyStore } from '../store/commandIdempotencyStore';
import { ExcessCommandAttemptAuditStore } from '../store/excessCommandAttemptAuditStore';
import { ExcessDecisionSnapshotStore } from '../store/excessDecisionSnapshotStore';
import { FxRateSnapshotStore } from '../store/fxRateSnapshotStore';
import { ExportAssetStore, type ExportAssetPosting, type ExportAuthorizationSnapshot } from '../store/exportAssetStore';
import { planExportAssetPosting, type ExportAuthorizationClaim } from '../domain/exportAssetPosting';
import { prepareExcessFunctionSplit } from '../domain/excessFunctionStrategy';
import { planWholeDeletePending } from '../domain/excessPendingLifecycle';
import { calculateMinimumRequiredIncrease, type MinimumRequiredIncreaseResult } from '../domain/minimumRequiredIncrease';
import { computeEffectiveAllowanceLimitOwner, evaluateOwnerExcessAllowance, selectExcessProcessingRoute } from '../domain/excessPolicy';
import { resolvePbdFallbackAuthorization } from '../config/excessPolicyConfig';
import { usdParDecision, type CurrencyExchangeRequest } from '../integration/currencyExchange';
import { IllegalStateTransitionError, InsufficientBalanceError, NotFoundError, RequestValidationError } from '../errors';
import type {
  AccountEntry,
  BalanceContract,
  BalanceMovement,
  BalanceSnapshot,
  DeletePendingAuditWithContract,
  ExposureNature,
  FixPendingAuditRecord,
  ExcessFunctionCode,
  InstrumentType,
  MovementStatus,
  MovementWarning,
  NaturalKey,
  TenorType,
} from '../types';

/** One registry entry owns each movement type's creation semantics and sufficiency policy. */
interface MovementSufficiencyContext {
  contract: BalanceContract;
  existingMovements: readonly BalanceMovement[];
  confirmedBalance: Decimal;
  availableBalance: Decimal;
  ceilingAmount: Decimal;
  req: CreateMovementRequest;
  /** Excludes the edited/released movement from open-event eligibility scans to avoid self-rejection. */
  excludeMovementId?: string;
}

/** Sufficiency checks return either success (with an optional warning) or a validation error. */
type MovementSufficiencyOutcome = { ok: true; warning?: MovementWarning } | { ok: false; error: string };

type MovementSufficiencyCheck = (ctx: MovementSufficiencyContext) => MovementSufficiencyOutcome | null;

interface MovementTypeDescriptor {
  /** Design doc §5 — creates a new Logical Contract when the natural key doesn't yet resolve. */
  isCreating: boolean;
  /** Returns null when this request needs no sufficiency check at all. */
  checkSufficiency: MovementSufficiencyCheck;
}

/** Reuses the store's status-update parameter contract. */
type UpdateMovementStatusParams = Parameters<BalanceMovementStore['updateStatus']>[0];

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
  /** Monetary amendment-only magnitude. The resulting tolerancePct is calculated and protected. */
  toleranceChangePct?: string | null;
  toleranceChangeDirection?: ToleranceChangeDirection | null;
  exposureNature?: ExposureNature;
  /** Acceptance tenor is audit/reporting metadata; Seller's and Buyer's Usance share balance mechanics. */
  tenorType?: TenorType | null;
  tenorDays?: number | null;
  maturityDate?: string | null;
  /** Contract expiry date for A1/B1 issuance. */
  expiryDate?: string | null;
  mailFloatGraceDays?: number | null;
  newExpiryDate?: string | null;
  reversalOfMovementId?: string | null;
  transactionDate?: string | null;
  businessDate?: string | null;
  valueDate?: string | null;
  sourceModule?: string | null;
  sourceFunction?: string | null;
  sourceTransactionRef?: string | null;
  /** See BalanceMovement.referencedTransactionId's own doc comment in types.ts for the full rule. */
  referencedTransactionId?: string | null;
  reasonCode?: string | null;
  amendmentApproved?: boolean | null;
  amendmentEffective?: string | null;
  consentStatus?: 'NOT_REQUIRED' | 'OBTAINED' | null;
  createdBy: string;
}

export type CreateMovementResult = { created: true; movement: BalanceMovement } | { created: false; existing: BalanceMovement };

interface PrepareMovementOptions {
  movementId?: string;
  existingContractOnly?: boolean;
  contractOverride?: BalanceContract;
  /** Server-authoritative locked Covered amount for a positive-Excess B4 reclassification. */
  ceilingAmountOverride?: string;
}

type PreparedMovementSufficiency = Readonly<{ kind: 'SUFFICIENT' }> | Readonly<{ kind: 'INSUFFICIENT_AVAILABLE_BALANCE'; message: string }>;

type PreparedMovementResult =
  Readonly<{ created: false; existing: BalanceMovement }> | Readonly<{ created: true; movement: BalanceMovement; sufficiency: PreparedMovementSufficiency }>;

export type BalanceMakerExcessRuntime = Pick<MakerExcessSubmitDependencies, 'policy' | 'fx'>;

export interface A3MakerExcessControl {
  actorContext: string;
  idempotencyKey: string;
  decisionTime: string;
}

export interface ExcessPreviewRequest {
  functionCode: Extract<ExcessFunctionCode, 'A3' | 'A3S' | 'B3'>;
  request?: CreateMovementRequest;
  requests?: readonly CreateMovementRequest[];
  excludeMovementId?: string;
  decisionTime: string;
}

export interface ExcessPreviewResult {
  previousExcessAmountTransaction: string;
  thisExcessAmountTransaction: string;
  totalExcessAmountTransaction: string;
  maxExcessAmountTransaction: string;
  eligible: boolean;
  businessResultCode: 'EXCESS_LIMIT_EXCEEDED' | 'INSUFFICIENT_AVAILABLE_BALANCE' | null;
}

export type ExcessPreviewOutcome =
  Readonly<{ ok: true; preview: ExcessPreviewResult }> | Readonly<{ ok: false; code: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE' }>;

export interface A3SEligibleSgAlternative {
  balanceContractId: string;
  sgNumber: string;
  currency: string;
  eligibleCapacityOwner: string;
}

export type A3SMakerExcessSubmitResult =
  | MakerExcessSubmitResult
  | Readonly<{
      ok: false;
      httpStatus: 409;
      code: 'A3S_RESELECT_ELIGIBLE_SG';
      eligibleAlternatives: readonly A3SEligibleSgAlternative[];
    }>;

export interface A3CheckerExcessControl {
  checkerContext: string;
  idempotencyKey: string;
  decisionTime: string;
  applicantWaiverValidationResult?: 'CONFIRMED' | 'NOT_CONFIRMED';
  waiverReference?: string;
  waiverDate?: string;
  waiverEvidence?: string;
}

export interface B4ExportAssetCheckerControl {
  checkerContext: string;
  decisionTime: string;
  authorization: ExportAuthorizationClaim;
}

export interface B4ExportAssetReleaseResult {
  movement: BalanceMovement;
  authorization: ExportAuthorizationSnapshot;
  assets: readonly ExportAssetPosting[];
}

export type A3CheckerExcessResult =
  Exclude<CheckerExcessRevaluationResult, { ok: false }> | Readonly<{ ok: false; code: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE' | 'IDEMPOTENCY_CONFLICT' }>;

export type A3CheckerAcknowledgeResult =
  | (Extract<CheckerExcessRevaluationResult, { ok: true }> & { movement: BalanceMovement })
  | Readonly<{ kind: 'LEGACY_RELEASE'; movement: BalanceMovement }>
  | Readonly<{ ok: false; code: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE' | 'IDEMPOTENCY_CONFLICT' | 'EXCESS_LIMIT_EXCEEDED' }>;

export type OwnCheckerExcessReleaseResult =
  | (Extract<CheckerExcessRevaluationResult, { ok: true }> & { movement: BalanceMovement })
  | Readonly<{
      ok: false;
      code: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE' | 'IDEMPOTENCY_CONFLICT' | 'EXCESS_LIMIT_EXCEEDED' | 'APPLICANT_WAIVER_REQUIRED';
    }>;

export type MakerExcessFixResult =
  | Readonly<{
      ok: true;
      movement: BalanceMovement;
      coveredAmountOwner: string;
      excessAmountOwner: string;
      excessDecision: 'NOT_REQUIRED' | 'WITHIN_ALLOWANCE';
    }>
  | Readonly<{ ok: false; code: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE' | 'IDEMPOTENCY_CONFLICT' }>
  | Readonly<{ ok: false; code: 'EXCESS_LIMIT_EXCEEDED'; guidance: MinimumRequiredIncreaseResult }>;

export type DeletePendingExcessResult = Readonly<{ ok: true; movement: BalanceMovement }> | Readonly<{ ok: false; code: 'IDEMPOTENCY_CONFLICT' }>;

export interface EditMovementRequest {
  amount: string;
  editMode?: 'STANDARD' | 'REMARKS_ONLY';
  remarks?: string | null;
  legRef?: string | null;
  accountEntries?: AccountEntry[] | null;
  businessEventId?: string | null;
  exposureNature?: ExposureNature;
  newExpiryDate?: string | null;
  transactionDate?: string | null;
  businessDate?: string | null;
  valueDate?: string | null;
  sourceModule?: string | null;
  sourceFunction?: string | null;
  referencedTransactionId?: string | null;
  reasonCode?: string | null;
  amendmentApproved?: boolean | null;
  amendmentEffective?: string | null;
  consentStatus?: 'NOT_REQUIRED' | 'OBTAINED' | null;
  tolerancePct?: string | null;
  toleranceChangePct?: string | null;
  toleranceChangeDirection?: ToleranceChangeDirection | null;
  tenorType?: TenorType | null;
  tenorDays?: number | null;
  expiryDate?: string | null;
  mailFloatGraceDays?: number | null;
  editedBy: string;
}

/** Carries contract fields unchanged unless the contract's creating movement owns the edit. */
function creatingOnly<T>(isCreatingEdit: boolean, patched: T | null | undefined, existing: T | null | undefined): T | null | undefined {
  return isCreatingEdit ? (patched ?? existing) : existing;
}

function canonicalHash(value: unknown): string {
  const canonicalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(canonicalize);
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      );
    }
    return candidate;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

/** Persistence port bundle: production uses SQLite stores; tests or future adapters can inject alternatives. */
export interface BalanceServiceStores {
  contracts: BalanceContractStore;
  movements: BalanceMovementStore;
  deletePendingAudit: DeletePendingAuditStore;
  fixPendingAudit: FixPendingAuditStore;
}

export function createSqliteBalanceServiceStores(db: Db): BalanceServiceStores {
  return {
    contracts: new BalanceContractStore(db),
    movements: new BalanceMovementStore(db),
    deletePendingAudit: new DeletePendingAuditStore(db),
    fixPendingAudit: new FixPendingAuditStore(db),
  };
}

export class BalanceService {
  private readonly contracts: BalanceContractStore;
  private readonly movements: BalanceMovementStore;
  private readonly deletePendingAudit: DeletePendingAuditStore;
  private readonly fixPendingAudit: FixPendingAuditStore;
  private readonly movementTypeRegistry: Readonly<Record<string, MovementTypeDescriptor>>;
  private readonly newContractSufficiencyRegistry: Readonly<Record<string, (req: CreateMovementRequest) => void>>;
  private readonly requestValidator: MovementRequestValidator;
  private readonly snapshotService = new BalanceSnapshotService();
  private readonly lifecycleEligibility: ContractLifecycleEligibilityService;
  private readonly lifecycleSweep: LifecycleSweepService;
  private readonly queries: BalanceQueryService;
  private readonly movementSnapshots: MovementSnapshotService;
  private readonly releasePolicy: MovementReleasePolicyService;
  private readonly releaseSideEffects: MovementReleaseSideEffectService;
  private readonly movementContracts: MovementContractService;
  /** Raw SQLite handle used only for atomic Fix Pending audit + correction writes. */
  private readonly db: Db;
  private readonly accountMappings: BalanceAccountMappingService;

  constructor(
    db: Db,
    private readonly now: () => string = () => new Date().toISOString(),
    stores: BalanceServiceStores = createSqliteBalanceServiceStores(db),
    private readonly makerExcessRuntime?: BalanceMakerExcessRuntime,
  ) {
    this.db = db;
    this.accountMappings = new BalanceAccountMappingService(db, undefined, this.now);
    this.contracts = stores.contracts;
    this.movements = stores.movements;
    this.deletePendingAudit = stores.deletePendingAudit;
    this.fixPendingAudit = stores.fixPendingAudit;
    this.movementTypeRegistry = this.buildMovementTypeRegistry();
    this.newContractSufficiencyRegistry = this.buildNewContractSufficiencyRegistry();
    this.requestValidator = new MovementRequestValidator(this.movements, (movementType) => !!this.movementTypeRegistry[movementType]?.isCreating);
    this.lifecycleEligibility = new ContractLifecycleEligibilityService(this.contracts, this.movements);
    this.queries = new BalanceQueryService(this.contracts, this.movements, this.deletePendingAudit, this.fixPendingAudit, this.snapshotService);
    this.movementSnapshots = new MovementSnapshotService(this.contracts, this.movements, this.snapshotService, this.queries);
    const checkerExcessRuntime = this.createCheckerExcessRuntime();
    this.releasePolicy = new MovementReleasePolicyService(
      this.movements,
      this.contracts,
      this.requestValidator,
      this.lifecycleEligibility,
      (movementType) => !!this.movementTypeRegistry[movementType]?.isCreating,
      checkerExcessRuntime,
    );
    this.releaseSideEffects = new MovementReleaseSideEffectService(this.contracts, this.movements, this.lifecycleEligibility, {
      createMovement: (request) => this.createMovement(request),
      release: (movementId, releasedBy) => this.release(movementId, releasedBy),
    });
    this.movementContracts = new MovementContractService(
      this.contracts,
      this.movements,
      {
        isCreatingMovement: (movementType) => !!this.movementTypeRegistry[movementType]?.isCreating,
        assertCreationSufficiency: (request) => {
          const check = this.newContractSufficiencyRegistry[`${request.instrumentType}:${request.movementType}`];
          if (check) check(request);
        },
      },
      this.now,
    );
    this.lifecycleSweep = new LifecycleSweepService(this.contracts, this.movements, {
      createMovement: (request) => this.createMovement(request),
      release: (movementId, releasedBy) => this.release(movementId, releasedBy),
    });
  }

  private buildMovementTypeRegistry(): Readonly<Record<string, MovementTypeDescriptor>> {
    const noCheck: MovementSufficiencyCheck = () => null;

    /** Any nominal amendment can reduce the upper limit when its tolerance changes. */
    const amendShaped: MovementSufficiencyCheck = (ctx) => this.checkAmendmentSufficiency(ctx);
    /** Design doc §6/§6.1 — sufficiency against Available Balance, plus the §6.1 off-balance check (0 exposure for non-LC instrumentTypes). */
    const utilizeShaped: MovementSufficiencyCheck = (ctx) => this.checkUtilizeShapedSufficiency(ctx);
    /** Redemption, settlement, reimbursement and reclassification cannot exceed outstanding balance. */
    // Standalone A9 must fully redeem the SG; an A3S-linked redemption is identified by businessEventId.
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

    /** Close requires current eligibility and an amount exactly equal to Confirmed Balance; Release rechecks both. */
    const closeShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ROOT_INSTRUMENT_TYPES.has(ctx.contract.instrumentType)) {
        return {
          ok: false,
          error: `Close only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${ctx.contract.instrumentType} is not eligible.`,
        };
      }
      const eligibility = this.lifecycleEligibility.evaluateClose(ctx.contract, ctx.excludeMovementId);
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

    const expireShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ROOT_INSTRUMENT_TYPES.has(ctx.contract.instrumentType)) {
        return {
          ok: false,
          error: `EXPIRE only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${ctx.contract.instrumentType} is not eligible.`,
        };
      }
      const eligibility = this.lifecycleEligibility.evaluateExpiry(ctx.contract);
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

    /** Expiry amendment: ACTIVE is ordinary; EXPIRED additionally requires no open events; other states reject. */
    const amendExpiryDateShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ctx.req.newExpiryDate) {
        return { ok: false, error: 'newExpiryDate is required for AMEND_EXPIRY_DATE.' };
      }
      if (ctx.contract.status !== 'ACTIVE' && ctx.contract.status !== 'EXPIRED') {
        return { ok: false, error: `Cannot amend the Expiry Date of a ${ctx.contract.status} contract — only ACTIVE or EXPIRED contracts are eligible.` };
      }
      if (ctx.contract.status === 'EXPIRED') {
        const { hasOpenEvents } = this.lifecycleEligibility.gatherEventTree(ctx.contract);
        if (hasOpenEvents) {
          return {
            ok: false,
            error: 'Cannot submit an Expiry Extension Amendment — one or more Events under this LC (including child ledgers) are not yet fully resolved.',
          };
        }
      }
      const businessDate = ctx.req.businessDate ?? this.now();
      if (ctx.req.newExpiryDate <= businessDate) {
        return { ok: false, error: `newExpiryDate (${ctx.req.newExpiryDate}) must be strictly later than the Business Date (${businessDate}).` };
      }
      return { ok: true };
    };

    const reversalShaped: MovementSufficiencyCheck = (ctx) => {
      const targetId = ctx.req.reversalOfMovementId;
      if (!targetId) return { ok: false, error: 'reversalOfMovementId is required for REVERSAL.' };
      const target = ctx.existingMovements.find((m) => m.movementId === targetId);
      if (!target) return { ok: false, error: `REVERSAL target movement "${targetId}" was not found on this contract.` };
      if (target.status !== 'RELEASED') return { ok: false, error: `Cannot REVERSAL movement "${targetId}" — it is ${target.status}, not RELEASED.` };
      if (ctx.existingMovements.some((m) => m.reversalOfMovementId === targetId && (m.status === 'PENDING' || m.status === 'RELEASED'))) {
        return { ok: false, error: `Movement "${targetId}" has already been reversed.` };
      }
      if (!ctx.ceilingAmount.equals(parseMonetaryAmount(target.ceilingAmount))) {
        return { ok: false, error: `REVERSAL amount must exactly equal the reversed movement's own ceilingAmount (${target.ceilingAmount}).` };
      }
      return { ok: true };
    };

    /** Reopen requires CLOSED with no open events; its amount is derived from the restoration chain. */
    const reopenShaped: MovementSufficiencyCheck = (ctx) => {
      if (!ROOT_INSTRUMENT_TYPES.has(ctx.contract.instrumentType)) {
        return {
          ok: false,
          error: `Reopen only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${ctx.contract.instrumentType} is not eligible.`,
        };
      }
      if (ctx.contract.status !== 'CLOSED') {
        return {
          ok: false,
          error: `Cannot Reopen ${ctx.contract.instrumentType} ${ctx.contract.naturalKey.lcNumber} — current status is ${ctx.contract.status}, not CLOSED.`,
        };
      }
      const { hasOpenEvents } = this.lifecycleEligibility.gatherEventTree(ctx.contract, ctx.excludeMovementId);
      if (hasOpenEvents) {
        return { ok: false, error: 'Cannot Reopen — one or more Events under this LC (including child ledgers) are not yet fully resolved.' };
      }
      return { ok: true };
    };

    return {
      ISSUE: { isCreating: true, checkSufficiency: noCheck },
      CREATE: { isCreating: true, checkSufficiency: noCheck },
      AMEND_INCREASE: { isCreating: false, checkSufficiency: amendShaped },
      AMEND: { isCreating: false, checkSufficiency: amendShaped },
      AMEND_DECREASE: { isCreating: false, checkSufficiency: amendShaped },
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
      // Automatic expiry.
      EXPIRE: { isCreating: false, checkSufficiency: expireShaped },
      // A2/B2 expiry-date amendment.
      AMEND_EXPIRY_DATE: { isCreating: false, checkSufficiency: amendExpiryDateShaped },
      // Internal reversal only.
      REVERSAL: { isCreating: false, checkSufficiency: reversalShaped },
      // A11/B7 reopen.
      REOPEN: { isCreating: false, checkSufficiency: reopenShaped },
    };
  }

  /** Any amendment whose recalculated upper limit falls is capped by Tight Available Balance. */
  private checkAmendmentSufficiency(ctx: MovementSufficiencyContext): MovementSufficiencyOutcome {
    const { contract, existingMovements, confirmedBalance, availableBalance, ceilingAmount, req } = ctx;
    const pendingDecreaseTotal = computePendingDecreaseTotal(existingMovements);
    let tightAvailableForDecrease = availableBalance;
    if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
      const shgtMovements = this.movements.listShgtMovementsForParent(contract.logicalContractId);
      tightAvailableForDecrease = confirmedBalance.minus(pendingDecreaseTotal).minus(computeOffBalanceExposure(shgtMovements));
    } else if (contract.instrumentType === 'EPLC_CONFIRMATION') {
      // Amendment decreases cannot use capacity provisionally freed by another pending transaction.
      const examinationMovements = this.movements.listExaminationMovementsForParent(contract.logicalContractId);
      tightAvailableForDecrease = confirmedBalance.minus(pendingDecreaseTotal).minus(computePresentDocsEarmark(examinationMovements));
    }
    // The amendment registry only routes movement types present in MOVEMENT_DIRECTION.
    const direction = MOVEMENT_DIRECTION[req.movementType] as 1 | -1;
    const balanceDelta = ceilingAmount.times(direction);
    const upperLimitReduction = balanceDelta.isNegative() ? balanceDelta.abs() : new Decimal(0);
    return checkAmendDecreaseSufficiency({
      amount: parseMonetaryAmount(req.amount).abs(),
      ceilingAmount: upperLimitReduction,
      tightAvailableBalance: tightAvailableForDecrease,
    });
  }

  /** UTILIZE/HONOUR/ACCEPT — nets outstanding SHGT off-balance exposure for IPLC_LC/EPLC_LC only. */
  private checkUtilizeShapedSufficiency(ctx: MovementSufficiencyContext): MovementSufficiencyOutcome {
    const { contract, existingMovements, confirmedBalance, availableBalance, ceilingAmount, req } = ctx;
    const { offBalanceExposure, pendingDecreaseTotal } = this.utilizeTightAvailableComponents(contract, existingMovements, req.businessEventId);
    return checkUtilizeSufficiency({
      requestedAmount: ceilingAmount,
      availableBalance,
      confirmedBalance,
      pendingDecreaseTotal,
      offBalanceExposure,
    });
  }

  private utilizeTightAvailableComponents(
    contract: BalanceContract,
    existingMovements: readonly BalanceMovement[],
    businessEventId?: string | null,
  ): {
    pendingDecreaseTotal: Decimal;
    offBalanceExposure: Decimal;
    tightAvailable: Decimal;
    shgtMovements: readonly BalanceMovement[];
  } {
    let offBalanceExposure = new Decimal(0);
    let shgtMovements: readonly BalanceMovement[] = [];
    if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
      shgtMovements = this.movements.listShgtMovementsForParent(contract.logicalContractId);
      const matchedPendingUtilizeBusinessEventIds = businessEventId ? new Set([businessEventId]) : undefined;
      offBalanceExposure = computeOffBalanceExposure(shgtMovements, matchedPendingUtilizeBusinessEventIds);
    }
    const confirmed = computeConfirmedBalance(existingMovements);
    const pendingDecreaseTotal = computePendingDecreaseTotal(existingMovements);
    const rawTightAvailable = confirmed.minus(pendingDecreaseTotal).minus(offBalanceExposure);
    return {
      pendingDecreaseTotal,
      offBalanceExposure,
      tightAvailable: rawTightAvailable.isNegative() ? new Decimal(0) : rawTightAvailable,
      shgtMovements,
    };
  }

  /** Creation checks are keyed by instrument + movement type to avoid applying a policy to malformed shapes. */
  private buildNewContractSufficiencyRegistry(): Readonly<Record<string, (req: CreateMovementRequest) => void>> {
    return {
      'SHGT:ISSUE': (req) => this.checkNewShgtSufficiency(req),
      'EPLC_EXAMINATION:CREATE': (req) => this.checkNewPresentDocsSufficiency(req),
    };
  }

  /** Checks SG capacity before contract creation so rejection cannot leave an orphan contract. */
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
    // Parse wire amounts here because direct service callers can bypass HTTP validation.
    const requestedAmount = parseMonetaryAmount(req.amount);
    const sgCheck = checkShgtIssueSufficiency({ requestedAmount, parentConfirmedBalance: parentConfirmed, parentPendingDecreaseTotal, existingShgtExposure });
    if (!sgCheck.ok) throw new InsufficientBalanceError(sgCheck.error);
  }

  /** B3 includes all pending presentations and never spends capacity only provisionally freed by B4. */
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
    // Direct callers still require canonical monetary parsing.
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

  resolveContract(instrumentType: InstrumentType, naturalKey: NaturalKey): BalanceContract | undefined {
    return this.queries.resolveContract(instrumentType, naturalKey);
  }

  resolveContractAnyStatus(instrumentType: InstrumentType, naturalKey: NaturalKey): BalanceContract | undefined {
    return this.queries.resolveContractAnyStatus(instrumentType, naturalKey);
  }

  catalog(filter: CatalogFilter): CatalogPage {
    return this.queries.catalog(filter);
  }

  /** Inquire Delete Pending's own LC Catalog step (§11) — see BalanceContractStore.listWithDeletePendingHistory()'s own doc comment. */
  catalogWithDeletePendingHistory(filter: { instrumentType: InstrumentType; q?: string; page?: number; pageSize?: number }): CatalogPage {
    return this.queries.catalogWithDeletePendingHistory(filter);
  }

  runAutoExpirySweep(asOf: Date = new Date()): { balanceContractId: string; ok: boolean; error?: string }[] {
    return this.lifecycleSweep.runAutoExpiry(asOf);
  }

  runAutoCloseSweep(asOf: Date = new Date()): { balanceContractId: string; ok: boolean; error?: string }[] {
    return this.lifecycleSweep.runAutoClose(asOf);
  }

  runExpirySweepCycle(asOf: Date = new Date()): {
    expiry: { balanceContractId: string; ok: boolean; error?: string }[];
    close: { balanceContractId: string; ok: boolean; error?: string }[];
  } {
    return this.lifecycleSweep.runCycle(asOf);
  }

  listCloseEligibleContracts(instrumentType: InstrumentType, opts: { lcNumber?: string; page?: number; pageSize?: number } = {}): CatalogPage {
    return this.lifecycleEligibility.listCloseEligible(instrumentType, opts);
  }

  listReopenEligibleContracts(instrumentType: InstrumentType, opts: { lcNumber?: string; page?: number; pageSize?: number } = {}): CatalogPage {
    return this.lifecycleEligibility.listReopenEligible(instrumentType, opts);
  }

  getBalanceSnapshot(balanceContractId: string, asOfEventSeq?: number): BalanceSnapshot {
    return this.queries.getBalanceSnapshot(balanceContractId, asOfEventSeq);
  }

  listMovements(balanceContractId: string): BalanceMovement[] {
    return this.queries.listMovements(balanceContractId);
  }

  /** Inquire Delete Pending's own View action (§11) — resolves a contract directly by ID, no natural key required. */
  getContractById(balanceContractId: string): BalanceContract {
    return this.queries.getContractById(balanceContractId);
  }

  /** Balance snapshot "as of" one specific movement in the timeline — resolves its own contract, no separate balanceContractId needed from the caller. */
  getBalanceSnapshotAsOfMovement(movementId: string): BalanceSnapshot {
    return this.queries.getBalanceSnapshotAsOfMovement(movementId);
  }

  findByBusinessEventId(businessEventId: string): BalanceMovement[] {
    return this.queries.findByBusinessEventId(businessEventId);
  }

  listMyMovements(params: { createdBy: string; statuses?: MovementStatus[]; q?: string }): {
    items: Array<{ movement: BalanceMovement; contract: BalanceContract }>;
  } {
    return this.queries.listMyMovements(params);
  }

  listDeletePendingAudit(filter: { lcNumber?: string; deletedBy?: string; from?: string; to?: string; page?: number; pageSize?: number }): {
    items: DeletePendingAuditWithContract[];
    total: number;
    page: number;
    pageSize: number;
  } {
    return this.queries.listDeletePendingAudit(filter);
  }

  listFixPendingAudit(movementId: string): FixPendingAuditRecord[] {
    return this.queries.listFixPendingAudit(movementId);
  }

  private deriveMovementCeilingAmount(req: CreateMovementRequest, contract: BalanceContract, existingMovements: readonly BalanceMovement[]): Decimal {
    if (req.movementType === 'AMEND_EXPIRY_DATE' && req.reversalOfMovementId) {
      return parseMonetaryAmount(req.amount);
    }
    if (!MONETARY_AMENDMENT_TYPES.has(req.movementType)) {
      const tolerancePct = req.movementType === 'ISSUE' ? (req.tolerancePct ?? contract.tolerancePct) : contract.tolerancePct;
      return computeCeilingAmount(req.amount, tolerancePct, req.movementType, contract.instrumentType, contract.currency);
    }

    try {
      return computeMonetaryAmendment({
        currentFaceAmount: computeFaceAmount(existingMovements),
        currentTolerancePct: contract.tolerancePct,
        amendmentAmount: req.amount,
        movementType: req.movementType,
        newTolerancePct: this.resultingTolerancePct(req, contract),
        instrumentType: contract.instrumentType,
        currency: contract.currency,
      }).movementCeilingAmount;
    } catch (error) {
      // computeMonetaryAmendment deliberately throws Error for every invalid domain input.
      throw new RequestValidationError((error as Error).message);
    }
  }

  private resultingTolerancePct(req: CreateMovementRequest, contract: BalanceContract): string | null {
    if (!MONETARY_AMENDMENT_TYPES.has(req.movementType)) return req.tolerancePct ?? contract.tolerancePct ?? null;
    if (req.toleranceChangePct == null) return contract.tolerancePct ?? null;
    let direction = req.toleranceChangeDirection;
    if (req.movementType === 'AMEND_INCREASE') direction = 'INCREASE';
    if (req.movementType === 'AMEND_DECREASE') direction = 'DECREASE';
    try {
      return computeResultingTolerancePct(contract.tolerancePct, req.toleranceChangePct, direction!);
    } catch (error) {
      throw new RequestValidationError((error as Error).message);
    }
  }

  private correctedTolerancePct(req: CreateMovementRequest, contract: BalanceContract): string | null {
    if (req.movementType === 'ISSUE') return this.resultingTolerancePct(req, contract);
    if (MONETARY_AMENDMENT_TYPES.has(req.movementType)) return contract.tolerancePct ?? null;
    return null;
  }

  private movementToleranceChangeDirection(req: CreateMovementRequest): ToleranceChangeDirection | null {
    if (!MONETARY_AMENDMENT_TYPES.has(req.movementType)) return null;
    if (req.movementType === 'AMEND_INCREASE') return 'INCREASE';
    if (req.movementType === 'AMEND_DECREASE') return 'DECREASE';
    return req.toleranceChangeDirection ?? null;
  }

  createMovement(req: CreateMovementRequest): CreateMovementResult {
    this.assertA6LockedLegalAmount(req);
    const b4LockedSplit = this.resolvePositiveB3SplitForB4(req);
    const prepared = this.prepareMovement(req, b4LockedSplit ? { ceilingAmountOverride: b4LockedSplit.coveredAmountOwner } : {});
    if (!prepared.created) return prepared;
    if (prepared.sufficiency.kind === 'INSUFFICIENT_AVAILABLE_BALANCE') {
      throw new InsufficientBalanceError(prepared.sufficiency.message);
    }
    this.refreshPreparedMovementSnapshots(prepared.movement);
    return this.insertPreparedMovement(prepared.movement);
  }

  /**
   * An acknowledged A3/A3S fixes the Legal/Covered/Excess attribution used by
   * the later A6 Acceptance.  A6 therefore carries the complete locked Legal
   * amount; accepting only Covered (or any newly supplied amount) would lose
   * or recreate Excess and break the immutable attribution.
   */
  private assertA6LockedLegalAmount(req: CreateMovementRequest): void {
    if (req.instrumentType !== 'IPLC_ACCEPTANCE' || req.movementType !== 'CREATE' || !req.referencedTransactionId) return;
    const ledger = new ExcessLedgerStore(this.db);
    const locked =
      ledger.findApprovedUtilizationByMovement(req.referencedTransactionId) ?? ledger.listOutstandingReservationsByMovement(req.referencedTransactionId).at(-1);
    if (!locked) return;
    if (!new Decimal(req.amount).equals(locked.transactionAmountOwner)) {
      throw new RequestValidationError('A6 amount must match the locked A3/A3S Legal amount.');
    }
  }

  /**
   * FROZEN V2 B4 Maker seam. Legal remains the caller-visible amount while
   * only the authoritative B3-locked Covered amount consumes Confirmation
   * capacity. No caller flag can bypass ordinary sufficiency.
   */
  private resolvePositiveB3SplitForB4(req: CreateMovementRequest) {
    if (req.instrumentType !== 'EPLC_CONFIRMATION' || (req.movementType !== 'HONOUR' && req.movementType !== 'ACCEPT') || !req.referencedTransactionId) {
      return undefined;
    }
    const target = this.movementContracts.resolveExistingAndValidate(req);
    const source = this.movements.findById(req.referencedTransactionId);
    const sourceContract = source ? this.contracts.findById(source.balanceContractId) : undefined;
    if (!source || !sourceContract || sourceContract.parentLogicalContractId !== target.logicalContractId) {
      throw new RequestValidationError('B4 must reference a B3 owned by the same Export Confirmation.');
    }
    const approved = new ExcessLedgerStore(this.db).findApprovedUtilizationByMovement(source.movementId);
    if (!approved || !new Decimal(approved.excessAmountOwner).greaterThan(0)) return undefined;
    const legal = new Decimal(approved.transactionAmountOwner);
    const covered = new Decimal(approved.coveredAmountOwner);
    const excess = new Decimal(approved.excessAmountOwner);
    if (!covered.plus(excess).equals(legal)) throw new MakerExcessConcurrencyError('Locked B3 Covered and Excess no longer reconcile to Legal amount.');
    if (!new Decimal(req.amount).equals(legal) || req.currency !== approved.ownerCurrency || target.currency !== approved.ownerCurrency) {
      throw new RequestValidationError('B4 amount/currency must match the locked B3 Legal split.');
    }
    return approved;
  }

  isMakerExcessConfigured(): boolean {
    return this.makerExcessRuntime !== undefined;
  }

  hasExcessReservation(movementId: string): boolean {
    const rows = this.db
      .prepare(
        `SELECT event_type, allowance_amount_owner
         FROM excess_ledger_events
         WHERE movement_id = ? AND event_type IN ('PENDING_RESERVATION', 'RESERVATION_RELEASE')`,
      )
      .all(movementId) as unknown as { event_type: 'PENDING_RESERVATION' | 'RESERVATION_RELEASE'; allowance_amount_owner: string }[];
    const outstanding = rows.reduce(
      (total, row) => (row.event_type === 'PENDING_RESERVATION' ? total.plus(row.allowance_amount_owner) : total.minus(row.allowance_amount_owner)),
      new Decimal(0),
    );
    return outstanding.gt(0);
  }

  hasExcessLedgerFacts(movementId: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM excess_ledger_events WHERE movement_id = ? LIMIT 1').get(movementId));
  }

  hasCheckerExcessReleaseReplay(movementId: string, checkerContext: string, idempotencyKey: string): boolean {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 FROM command_idempotency
           WHERE command_type = 'CHECKER_OWN_RELEASE' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
        )
        .get(movementId, checkerContext, idempotencyKey),
    );
  }

  hasMakerExcessFixReplay(movementId: string, actorContext: string, idempotencyKey: string): boolean {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 FROM command_idempotency
           WHERE command_type = 'FIX_PENDING' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
        )
        .get(movementId, actorContext, idempotencyKey),
    );
  }

  assertPostAcknowledgeA3SAmountFixNotAttempted(movementId: string, patch: EditMovementRequest): void {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    const contract = this.contracts.findById(movement.balanceContractId);
    if (contract && this.isA3SCompoundMovement(movement, contract) && movement.acknowledgedAt && patch.editMode !== 'REMARKS_ONLY') {
      throw new IllegalStateTransitionError(
        `Cannot Fix or Resubmit Amount for A3S movement ${movement.movementId} after Checker Acknowledge. ` +
          'The linked Shipping Guarantee redemption, capacity consumption and attribution are already committed.',
      );
    }
  }

  resolveExcessReleaseTarget(movementId: string): string | null {
    if (this.hasExcessReservation(movementId)) return movementId;
    const movement = this.movements.findById(movementId);
    if (movement?.referencedTransactionId && this.hasExcessReservation(movement.referencedTransactionId)) {
      return movement.referencedTransactionId;
    }
    return null;
  }

  /**
   * Read-only event-level context for the A4/A6/B4 Checker screen. This deliberately resolves the
   * selected movement (A4's original A3 UTILIZE, A6's Acceptance referencing it, or B4's Honour /
   * Acceptance referencing B3) to that source event's own Excess. It must never use the LC account
   * aggregate: an earlier B01 can be covered-only while a later B02 on the same LC has positive
   * Excess.
   */
  getExcessReleaseContext(movementId: string): {
    sourceMovementId: string | null;
    thisExcessAmountOwner: string;
    ownerCurrency: string;
    requiresApplicantWaiver: boolean;
    requiresExportAuthorization: boolean;
  } {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    if (this.requiresB4ExportAssetGate(movement)) {
      const sourceMovementId = movement.referencedTransactionId!;
      const approved = new ExcessLedgerStore(this.db).findApprovedUtilizationByMovement(sourceMovementId)!;
      return {
        sourceMovementId,
        thisExcessAmountOwner: approved.excessAmountOwner,
        ownerCurrency: approved.ownerCurrency,
        requiresApplicantWaiver: false,
        requiresExportAuthorization: true,
      };
    }
    const sourceMovementId = this.resolveExcessReleaseTarget(movementId);
    if (!sourceMovementId) {
      return {
        sourceMovementId: null,
        thisExcessAmountOwner: '0',
        ownerCurrency: movement.currency,
        requiresApplicantWaiver: false,
        requiresExportAuthorization: false,
      };
    }
    const reservation = new ExcessLedgerStore(this.db).listOutstandingReservationsByMovement(sourceMovementId).at(-1);
    if (!reservation) {
      return {
        sourceMovementId: null,
        thisExcessAmountOwner: '0',
        ownerCurrency: movement.currency,
        requiresApplicantWaiver: false,
        requiresExportAuthorization: false,
      };
    }
    return {
      sourceMovementId,
      thisExcessAmountOwner: reservation.excessAmountOwner,
      ownerCurrency: reservation.ownerCurrency,
      requiresApplicantWaiver: false,
      requiresExportAuthorization: false,
    };
  }

  /** Read-only Maker preview. It deliberately stops before idempotency claims, account creation, snapshots, or movement persistence. */
  async previewExcess(input: ExcessPreviewRequest): Promise<ExcessPreviewOutcome> {
    if (!this.makerExcessRuntime) throw new RequestValidationError('Maker Excess runtime is not configured.');
    const facts = this.deriveExcessPreviewFacts(input);
    const split = prepareExcessFunctionSplit(facts.splitInput);
    const policy = this.makerExcessRuntime.policy.resolve(facts.ownerType, input.decisionTime);
    if (policy.ownerType !== facts.ownerType) throw new Error('Resolved Excess policy owner type does not match the preview owner type.');
    const precision = policy.currencyPrecisions[split.ownerCurrency];
    if (precision === undefined) throw new Error(`Missing owner-currency precision for ${split.ownerCurrency}.`);

    const account = new ExcessAccountStore(this.db).getByOwner(facts.ownerType, facts.ownerId);
    const emptyAggregate = {
      pendingReservedOwner: formatMonetaryAmount(new Decimal(0), precision),
      approvedUtilizedOwner: formatMonetaryAmount(new Decimal(0), precision),
    };
    const aggregate = account
      ? input.excludeMovementId
        ? new ExcessLedgerStore(this.db).aggregateForAccountExcludingMovement(account.excessAccountId, input.excludeMovementId, precision)
        : new ExcessLedgerStore(this.db).aggregateForAccount(account.excessAccountId, precision)
      : emptyAggregate;
    const previous = new Decimal(aggregate.pendingReservedOwner).plus(aggregate.approvedUtilizedOwner);
    const proposed = new Decimal(split.proposedExcessOwner);

    if (
      selectExcessProcessingRoute({ configuredMaximumUsd: policy.configuredMaximumUsd, allowancePercentage: policy.allowancePercentage }) ===
      'LEGACY_SUFFICIENCY'
    ) {
      const eligible = proposed.isZero();
      return {
        ok: true,
        preview: {
          previousExcessAmountTransaction: formatMonetaryAmount(previous, precision),
          thisExcessAmountTransaction: formatMonetaryAmount(proposed, precision),
          totalExcessAmountTransaction: formatMonetaryAmount(previous.plus(proposed), precision),
          maxExcessAmountTransaction: formatMonetaryAmount(new Decimal(0), precision),
          eligible,
          businessResultCode: eligible ? null : 'INSUFFICIENT_AVAILABLE_BALANCE',
        },
      };
    }

    const fxRequest: CurrencyExchangeRequest = {
      fromCurrency: 'USD',
      toCurrency: split.ownerCurrency,
      amount: policy.configuredMaximumUsd,
      ratePurpose: 'BOOKING',
      decisionTime: input.decisionTime,
      correlationId: `EXCESS-PREVIEW-${input.excludeMovementId ?? randomUUID()}`,
      policyVersion: policy.policyVersion,
    };
    const fxDecision =
      split.ownerCurrency === 'USD'
        ? usdParDecision(fxRequest)
        : await this.makerExcessRuntime.fx.resolveConfiguredMaximum({
            request: fxRequest,
            commandIdempotencyKey: fxRequest.correlationId,
            maxStalenessSeconds: policy.fxMaxStalenessSeconds,
            pbdAuthorization: resolvePbdFallbackAuthorization(policy, input.decisionTime),
          });
    if (!fxDecision.ok) return fxDecision;

    const effectiveLimit = computeEffectiveAllowanceLimitOwner({
      approvedContractualMaximumOwner: facts.approvedContractualMaximumOwner,
      allowancePercentage: policy.allowancePercentage,
      configuredMaximumOwner: fxDecision.quote.convertedAmount,
      ownerCurrencyPrecision: precision,
    });
    const total = previous.plus(proposed);
    const eligible = total.lessThanOrEqualTo(effectiveLimit);
    return {
      ok: true,
      preview: {
        previousExcessAmountTransaction: formatMonetaryAmount(previous, precision),
        thisExcessAmountTransaction: formatMonetaryAmount(proposed, precision),
        totalExcessAmountTransaction: formatMonetaryAmount(total, precision),
        maxExcessAmountTransaction: formatMonetaryAmount(new Decimal(effectiveLimit), precision),
        eligible,
        businessResultCode: eligible ? null : 'EXCESS_LIMIT_EXCEEDED',
      },
    };
  }

  async submitA3ExcessByMaker(req: CreateMovementRequest, control: A3MakerExcessControl): Promise<MakerExcessSubmitResult> {
    if (!this.makerExcessRuntime) throw new RequestValidationError('Maker Excess runtime is not configured.');
    if (req.instrumentType !== 'IPLC_LC' || req.movementType !== 'UTILIZE') {
      throw new RequestValidationError('A3 Excess Submit requires an existing IPLC_LC UTILIZE movement request.');
    }
    if (req.createdBy !== control.actorContext) throw new RequestValidationError('Maker actor must match movement createdBy.');

    const ownerIdentity = this.movementContracts.resolveExistingIdentity(req);
    const requestHash = canonicalHash({ functionCode: 'A3', request: req });
    const idempotency = new CommandIdempotencyStore(this.db);
    const idempotencyScope = {
      commandType: 'MAKER_SUBMIT' as const,
      ownerId: ownerIdentity.logicalContractId,
      actorContext: control.actorContext,
      key: control.idempotencyKey,
      requestHash,
    };
    const preflight = idempotency.resolve(idempotencyScope);
    if (preflight.kind === 'REPLAY') return preflight.response;
    if (preflight.kind === 'CONFLICT') return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };

    const contract = this.movementContracts.resolveExistingAndValidate(req);
    const movementId = randomUUID();
    const command: MakerExcessSubmitCommand = {
      commandType: 'MAKER_SUBMIT',
      functionCode: 'A3',
      ownerType: 'IMPORT_LC',
      ownerId: contract.logicalContractId,
      ownerCurrency: contract.currency,
      transactionAmountOwner: req.amount,
      movementId,
      actorContext: control.actorContext,
      idempotencyKey: control.idempotencyKey,
      requestHash,
      decisionTime: control.decisionTime,
    };
    const prepared = this.prepareMovement(req, { movementId, existingContractOnly: true });
    if (!prepared.created) throw new MakerExcessConcurrencyError('Movement identity already exists before Maker Excess persistence.');
    if (this.isA3SCompoundMovement(prepared.movement, contract)) {
      throw new RequestValidationError('A3S Maker Excess Submit requires the compound Excess boundary; standalone A3 routing is not allowed.');
    }
    const currentFacts = { load: () => this.deriveA3MakerExcessFacts(contract.balanceContractId, prepared.movement) };

    const unitOfWork = new SqliteMakerExcessUnitOfWork(this.db, {
      readFactsVersion: () => currentFacts.load().factsVersion,
      insertMovement: (bundle) => {
        if (bundle.movementId !== prepared.movement.movementId) throw new MakerExcessConcurrencyError('Prepared movement identity changed.');
        if (
          bundle.ownerCurrency !== prepared.movement.currency ||
          !new Decimal(bundle.coveredAmountOwner).plus(bundle.excessAmountOwner).equals(prepared.movement.amount)
        ) {
          throw new MakerExcessConcurrencyError('Prepared movement amount or currency changed from the Excess decision basis.');
        }
        this.applyCoveredBalanceAmount(prepared.movement, contract, bundle.coveredAmountOwner);
        this.refreshPreparedMovementSnapshots(prepared.movement);
        const inserted = this.insertPreparedMovement(prepared.movement);
        if (!inserted.created) throw new MakerExcessConcurrencyError('Prepared movement was concurrently inserted.');
      },
      now: this.now,
    });
    const orchestrator = new MakerExcessSubmitService({
      ...this.makerExcessRuntime,
      currentFacts,
      idempotency: { preflight: (scope) => idempotency.resolve(scope) },
      legacy: {
        submit: () => {
          return new SqliteUnitOfWork(this.db).execute(() => {
            const claimed = idempotency.resolve(idempotencyScope);
            if (claimed.kind === 'REPLAY') {
              if ('kind' in claimed.response && claimed.response.kind === 'LEGACY_SUBMIT') return claimed.response;
              throw new MakerExcessConcurrencyError('Idempotency response type changed before legacy persistence.');
            }
            if (claimed.kind === 'CONFLICT') throw new MakerExcessConcurrencyError('Idempotency payload changed before legacy persistence.');
            this.createMovement(req);
            const response = { kind: 'LEGACY_SUBMIT' as const };
            idempotency.insert(idempotencyScope, response, this.now());
            return response;
          });
        },
      },
      unitOfWork,
    });
    return orchestrator.submit(command);
  }

  async submitCreatingExcessByMaker(
    req: CreateMovementRequest,
    functionCode: Extract<ExcessFunctionCode, 'B3'>,
    control: A3MakerExcessControl,
  ): Promise<MakerExcessSubmitResult> {
    if (!this.makerExcessRuntime) throw new RequestValidationError('Maker Excess runtime is not configured.');
    const expectedShape = req.instrumentType === 'EPLC_EXAMINATION' && req.movementType === 'CREATE';
    if (!expectedShape) throw new RequestValidationError(`${functionCode} Excess Submit request shape is invalid.`);
    if (req.createdBy !== control.actorContext) throw new RequestValidationError('Maker actor must match movement createdBy.');
    if (!req.parentLogicalContractId) throw new RequestValidationError(`${functionCode} parentLogicalContractId is required.`);

    const parent = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
    const expectedParentType = 'EPLC_CONFIRMATION';
    if (!parent || parent.instrumentType !== expectedParentType) {
      throw new RequestValidationError(`${functionCode} requires an ACTIVE ${expectedParentType} allowance owner.`);
    }
    const ownerType = 'EXPORT_CONFIRMATION' as const;
    const requestHash = canonicalHash({ functionCode, request: req });
    const idempotency = new CommandIdempotencyStore(this.db);
    const idempotencyScope = {
      commandType: 'MAKER_SUBMIT' as const,
      ownerId: parent.logicalContractId,
      actorContext: control.actorContext,
      key: control.idempotencyKey,
      requestHash,
    };
    const preflight = idempotency.resolve(idempotencyScope);
    if (preflight.kind === 'REPLAY') return preflight.response;
    if (preflight.kind === 'CONFLICT') return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };

    const plannedContract = this.movementContracts.prepareNewForExcess(req);
    const movementId = randomUUID();
    const prepared = this.prepareMovement(req, { movementId, contractOverride: plannedContract });
    if (!prepared.created) throw new MakerExcessConcurrencyError('Movement identity already exists before Maker Excess persistence.');
    const loadFacts = (): MakerExcessCurrentFacts => {
      const currentParent = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId!);
      if (!currentParent || currentParent.balanceContractId !== parent.balanceContractId) {
        throw new MakerExcessConcurrencyError(`${functionCode} allowance owner changed before persistence.`);
      }
      const parentMovements = this.movements.listByContract(currentParent.balanceContractId);
      const approvedContractualMaximumOwner = computeFaceAmount(parentMovements).toFixed();
      const examinations = this.movements.listExaminationMovementsForParent(currentParent.logicalContractId);
      const capacity = Decimal.max(
        0,
        computeConfirmedBalance(parentMovements).minus(computePendingDecreaseTotal(parentMovements)).minus(computePresentDocsEarmark(examinations)),
      );
      return {
        ownerType,
        ownerId: currentParent.logicalContractId,
        factsVersion: canonicalHash({ parent: currentParent, parentMovements, examinations, prepared: prepared.movement }),
        approvedContractualMaximumOwner,
        splitInput: {
          functionCode: 'B3',
          transactionCurrency: prepared.movement.currency,
          ownerCurrency: currentParent.currency,
          transactionAmountOwner: prepared.movement.amount,
          confirmationTightAvailableOwner: capacity.toFixed(),
        },
      };
    };
    const command: MakerExcessSubmitCommand = {
      commandType: 'MAKER_SUBMIT',
      functionCode,
      ownerType,
      ownerId: parent.logicalContractId,
      ownerCurrency: parent.currency,
      transactionAmountOwner: req.amount,
      movementId,
      actorContext: control.actorContext,
      idempotencyKey: control.idempotencyKey,
      requestHash,
      decisionTime: control.decisionTime,
    };
    const unitOfWork = new SqliteMakerExcessUnitOfWork(this.db, {
      readFactsVersion: () => loadFacts().factsVersion,
      insertMovement: (bundle) => {
        if (bundle.movementId !== prepared.movement.movementId) throw new MakerExcessConcurrencyError('Prepared movement identity changed.');
        this.contracts.insert(plannedContract);
        this.applyCoveredBalanceAmount(prepared.movement, plannedContract, bundle.coveredAmountOwner);
        this.refreshPreparedMovementSnapshots(prepared.movement);
        const inserted = this.insertPreparedMovement(prepared.movement);
        if (!inserted.created) throw new MakerExcessConcurrencyError('Prepared movement was concurrently inserted.');
      },
      now: this.now,
    });
    return new MakerExcessSubmitService({
      ...this.makerExcessRuntime,
      currentFacts: { load: loadFacts },
      idempotency: { preflight: (scope) => idempotency.resolve(scope) },
      legacy: {
        submit: () =>
          new SqliteUnitOfWork(this.db).execute(() => {
            const claimed = idempotency.resolve(idempotencyScope);
            if (claimed.kind === 'REPLAY') {
              if ('kind' in claimed.response && claimed.response.kind === 'LEGACY_SUBMIT') return claimed.response;
              throw new MakerExcessConcurrencyError('Idempotency response type changed before legacy persistence.');
            }
            if (claimed.kind === 'CONFLICT') throw new MakerExcessConcurrencyError('Idempotency payload changed before legacy persistence.');
            this.createMovement(req);
            const response = { kind: 'LEGACY_SUBMIT' as const };
            idempotency.insert(idempotencyScope, response, this.now());
            return response;
          }),
      },
      unitOfWork,
    }).submit(command);
  }

  async submitA3SExcessByMaker(requests: readonly CreateMovementRequest[], control: A3MakerExcessControl): Promise<A3SMakerExcessSubmitResult> {
    if (!this.makerExcessRuntime) throw new RequestValidationError('Maker Excess runtime is not configured.');
    if (requests.length !== 2) throw new RequestValidationError('A3S Excess Submit requires exactly two compound legs.');
    const sgRequest = requests.find(
      (request) => request.instrumentType === 'SHGT' && (request.movementType === 'FULL_REDEEM' || request.movementType === 'PARTIAL_REDEEM'),
    );
    const lcRequest = requests.find((request) => request.instrumentType === 'IPLC_LC' && request.movementType === 'UTILIZE');
    if (!sgRequest || !lcRequest || !sgRequest.businessEventId || sgRequest.businessEventId !== lcRequest.businessEventId) {
      throw new RequestValidationError('A3S requires one linked SG redemption and one LC UTILIZE sharing a businessEventId.');
    }
    if (requests.some((request) => request.createdBy !== control.actorContext)) {
      throw new RequestValidationError('Maker actor must match every compound movement createdBy.');
    }
    const lc = this.movementContracts.resolveExistingIdentity(lcRequest);
    if (lc.instrumentType !== 'IPLC_LC') throw new RequestValidationError('A3S allowance owner must be an Import LC.');
    const sg = this.movementContracts.resolveExistingIdentity(sgRequest);
    if (sg.instrumentType !== 'SHGT' || sg.parentLogicalContractId !== lc.logicalContractId) {
      throw new RequestValidationError('A3S Shipping Guarantee must belong to the same Import LC allowance owner.');
    }
    const requestHash = canonicalHash({ functionCode: 'A3S', requests });
    const idempotency = new CommandIdempotencyStore(this.db);
    const idempotencyScope = {
      commandType: 'MAKER_SUBMIT' as const,
      ownerId: lc.logicalContractId,
      actorContext: control.actorContext,
      key: control.idempotencyKey,
      requestHash,
    };
    const preflight = idempotency.resolve(idempotencyScope);
    if (preflight.kind === 'REPLAY') return preflight.response;
    if (preflight.kind === 'CONFLICT') return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };

    const sgMovementId = randomUUID();
    const lcMovementId = randomUUID();
    const preparedSg = this.prepareMovement(sgRequest, { movementId: sgMovementId, existingContractOnly: true });
    const preparedLc = this.prepareMovement(lcRequest, { movementId: lcMovementId, existingContractOnly: true });
    if (!preparedSg.created || !preparedLc.created) throw new MakerExcessConcurrencyError('A3S compound movement identity already exists.');
    const selectedSgMovements = this.movements.listByContract(sg.balanceContractId);
    const selectedSgAvailable = computeAvailableBalance(computeConfirmedBalance(selectedSgMovements), selectedSgMovements);
    if (new Decimal(preparedSg.movement.amount).greaterThan(selectedSgAvailable)) {
      throw new InsufficientBalanceError(
        `Requested SG redemption ${preparedSg.movement.amount} exceeds the existing SG Available Balance ${selectedSgAvailable.toFixed()}.`,
      );
    }
    const loadFacts = (): MakerExcessCurrentFacts => {
      const currentLc = this.contracts.findById(lc.balanceContractId);
      if (!currentLc || currentLc.status !== 'ACTIVE') throw new MakerExcessConcurrencyError('A3S Import LC owner changed before persistence.');
      const lcMovements = this.movements.listByContract(currentLc.balanceContractId);
      const shgtMovements = this.movements.listShgtMovementsForParent(currentLc.logicalContractId);
      const confirmed = computeConfirmedBalance(lcMovements);
      const pendingDecreaseTotal = computePendingDecreaseTotal(lcMovements);
      const residualParent = Decimal.max(0, confirmed.minus(pendingDecreaseTotal).minus(computeOffBalanceExposure(shgtMovements)));
      return {
        ownerType: 'IMPORT_LC',
        ownerId: currentLc.logicalContractId,
        factsVersion: canonicalHash({ lc: currentLc, lcMovements, shgtMovements, preparedSg: preparedSg.movement, preparedLc: preparedLc.movement }),
        approvedContractualMaximumOwner: computeFaceAmount(lcMovements).toFixed(),
        splitInput: {
          functionCode: 'A3S',
          transactionCurrency: preparedLc.movement.currency,
          ownerCurrency: currentLc.currency,
          transactionAmountOwner: preparedLc.movement.amount,
          baseParentTightAvailableOwner: residualParent.toFixed(),
          currentSgRedemptionAmountOwner: preparedSg.movement.amount,
        },
      };
    };
    const initialFacts = loadFacts();
    const a3sSplitInput = initialFacts.splitInput;
    if (a3sSplitInput.functionCode !== 'A3S') {
      throw new MakerExcessConcurrencyError('Prepared A3S facts changed function code.');
    }
    const initialSplit = prepareExcessFunctionSplit(initialFacts.splitInput);
    if (new Decimal(initialSplit.proposedExcessOwner).greaterThan(0)) {
      const selectedCapacity = new Decimal(a3sSplitInput.currentSgRedemptionAmountOwner);
      const eligibleAlternatives = this.contracts
        .listReleasedActiveChildren(lc.logicalContractId, 'SHGT')
        .filter((candidate) => candidate.balanceContractId !== sg.balanceContractId)
        .map((candidate) => {
          const candidateMovements = this.movements.listByContract(candidate.balanceContractId);
          const available = computeAvailableBalance(computeConfirmedBalance(candidateMovements), candidateMovements);
          return {
            balanceContractId: candidate.balanceContractId,
            sgNumber: candidate.naturalKey.sgNumber ?? '',
            currency: candidate.currency,
            eligibleCapacityOwner: available.toFixed(),
            available,
          };
        })
        .filter((candidate) => candidate.sgNumber && candidate.available.greaterThan(selectedCapacity))
        .map((candidate) => ({
          balanceContractId: candidate.balanceContractId,
          sgNumber: candidate.sgNumber,
          currency: candidate.currency,
          eligibleCapacityOwner: candidate.eligibleCapacityOwner,
        }));
      if (eligibleAlternatives.length > 0) {
        return { ok: false, httpStatus: 409, code: 'A3S_RESELECT_ELIGIBLE_SG', eligibleAlternatives };
      }
    }
    const command: MakerExcessSubmitCommand = {
      commandType: 'MAKER_SUBMIT',
      functionCode: 'A3S',
      ownerType: 'IMPORT_LC',
      ownerId: lc.logicalContractId,
      ownerCurrency: lc.currency,
      transactionAmountOwner: lcRequest.amount,
      movementId: lcMovementId,
      actorContext: control.actorContext,
      idempotencyKey: control.idempotencyKey,
      requestHash,
      decisionTime: control.decisionTime,
    };
    const unitOfWork = new SqliteMakerExcessUnitOfWork(this.db, {
      readFactsVersion: () => loadFacts().factsVersion,
      insertMovement: (bundle) => {
        if (bundle.movementId !== preparedLc.movement.movementId) throw new MakerExcessConcurrencyError('Prepared A3S identity changed.');
        this.refreshPreparedMovementSnapshots(preparedSg.movement);
        if (!this.insertPreparedMovement(preparedSg.movement).created) throw new MakerExcessConcurrencyError('A3S SG leg was concurrently inserted.');
        this.applyCoveredBalanceAmount(preparedLc.movement, lc, bundle.coveredAmountOwner);
        this.refreshPreparedMovementSnapshots(preparedLc.movement);
        if (!this.insertPreparedMovement(preparedLc.movement).created) throw new MakerExcessConcurrencyError('A3S LC leg was concurrently inserted.');
      },
      now: this.now,
    });
    return new MakerExcessSubmitService({
      ...this.makerExcessRuntime,
      currentFacts: { load: loadFacts },
      idempotency: { preflight: (scope) => idempotency.resolve(scope) },
      legacy: {
        submit: () =>
          new SqliteUnitOfWork(this.db).execute(() => {
            const claimed = idempotency.resolve(idempotencyScope);
            if (claimed.kind === 'REPLAY') {
              if ('kind' in claimed.response && claimed.response.kind === 'LEGACY_SUBMIT') return claimed.response;
              throw new MakerExcessConcurrencyError('Idempotency response type changed before A3S legacy persistence.');
            }
            if (claimed.kind === 'CONFLICT') throw new MakerExcessConcurrencyError('Idempotency payload changed before A3S legacy persistence.');
            for (const request of [sgRequest, lcRequest]) {
              const created = this.createMovement(request);
              if (!created.created) throw new MakerExcessConcurrencyError('A3S compound leg already exists.');
            }
            const response = { kind: 'LEGACY_SUBMIT' as const };
            idempotency.insert(idempotencyScope, response, this.now());
            return response;
          }),
      },
      unitOfWork,
    }).submit(command);
  }

  async revalueA3ExcessByChecker(movementId: string, control: A3CheckerExcessControl): Promise<A3CheckerExcessResult> {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    applyStatusTransition({
      currentStatus: movement.status,
      action: 'RELEASE',
      createdBy: movement.createdBy,
      actingUser: control.checkerContext,
    });
    const contract = this.contracts.findById(movement.balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${movement.balanceContractId}`);
    const ownerFacts = this.deriveCheckerExcessFacts(movement, contract);
    if (movement.currency !== ownerFacts.splitInput.ownerCurrency) {
      throw new RequestValidationError(
        contract.instrumentType === 'IPLC_LC'
          ? `A3 transaction currency "${movement.currency}" does not match Import LC owner currency "${ownerFacts.splitInput.ownerCurrency}".`
          : `Transaction currency "${movement.currency}" does not match allowance owner currency "${ownerFacts.splitInput.ownerCurrency}".`,
      );
    }
    const makerExcessDecision = this.db
      .prepare(
        `SELECT 1 FROM excess_decision_snapshots
         WHERE movement_id = ? AND action IN ('MAKER_SUBMIT', 'FIX_PENDING', 'RESUBMIT')
         LIMIT 1`,
      )
      .get(movementId);
    if (!makerExcessDecision) return { kind: 'LEGACY_RELEASE' };

    const requestHash = canonicalHash({ movementId, decisionTime: control.decisionTime });
    const auditStore = new ExcessCommandAttemptAuditStore(this.db);
    const auditScope = {
      movementId,
      actorContext: control.checkerContext,
      commandIdempotencyKey: control.idempotencyKey,
      requestHash,
    };
    const preflight = auditStore.resolve(auditScope);
    if (preflight.kind === 'REPLAY') return { ok: false, code: preflight.resultCode };
    if (preflight.kind === 'CONFLICT') return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };

    const result = await this.releasePolicy.revalueExcessAtCheckerRelease({ movementId, ...control });
    if ('ok' in result && !result.ok) {
      const recorded = auditStore.recordCheckerFxFailure({
        ...result.auditContext,
        ...auditScope,
        resultCode: result.code,
        decisionTime: control.decisionTime,
        createdAt: this.now(),
      });
      return recorded.kind === 'CONFLICT' ? { ok: false, code: 'IDEMPOTENCY_CONFLICT' } : { ok: false, code: recorded.resultCode };
    }
    return result;
  }

  async acknowledgeA3ExcessByChecker(movementId: string, control: A3CheckerExcessControl): Promise<A3CheckerAcknowledgeResult> {
    const replayRow = this.db
      .prepare(
        `SELECT response_body FROM command_idempotency
         WHERE command_type = 'CHECKER_ACKNOWLEDGE' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
      )
      .get(movementId, control.checkerContext, control.idempotencyKey) as { response_body: string } | undefined;
    if (replayRow) return JSON.parse(replayRow.response_body) as A3CheckerAcknowledgeResult;

    const result = await this.revalueA3ExcessByChecker(movementId, control);
    if ('kind' in result) {
      return new SqliteUnitOfWork(this.db).execute(() => {
        const currentMovement = this.movements.findById(movementId);
        if (!currentMovement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
        const contract = this.contracts.findById(currentMovement.balanceContractId);
        if (!contract) throw new NotFoundError(`No BalanceContract ${currentMovement.balanceContractId}`);
        const linkedSgRedemption = this.resolveLinkedA3SRedemption(currentMovement, contract);
        const createdAt = this.now();
        if (linkedSgRedemption) {
          this.commitA3SCheckerEffects(linkedSgRedemption.movementId, control.checkerContext);
        }
        const response: A3CheckerAcknowledgeResult = {
          ...result,
          movement: this.acknowledgeArrival(movementId, control.checkerContext),
        };
        this.insertCheckerAcknowledgeIdempotency(movementId, control, response, createdAt);
        return response;
      });
    }
    if (!result.ok) return result;

    const decisions = new ExcessDecisionSnapshotStore(this.db);
    const fxSnapshots = new FxRateSnapshotStore(this.db);
    const persisted = new SqliteUnitOfWork(this.db).execute(() => {
      const currentMovement = this.movements.findById(movementId);
      if (!currentMovement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
      const currentFacts = this.deriveA3MakerExcessFacts(currentMovement.balanceContractId, currentMovement, currentMovement.movementId);
      if (currentFacts.factsVersion !== result.facts.factsVersion) {
        throw new MakerExcessConcurrencyError('Current Excess facts changed before Checker Acknowledge persistence.');
      }
      const contract = this.contracts.findById(currentMovement.balanceContractId);
      if (!contract) throw new NotFoundError(`No BalanceContract ${currentMovement.balanceContractId}`);
      const linkedSgRedemption = this.resolveLinkedA3SRedemption(currentMovement, contract);
      const createdAt = this.now();
      if (result.releaseEligibility === 'ELIGIBLE' && linkedSgRedemption) {
        this.commitA3SCheckerEffects(linkedSgRedemption.movementId, control.checkerContext);
      }
      fxSnapshots.insert({
        fxSnapshotId: randomUUID(),
        movementId,
        decisionPoint: 'CHECKER_RELEASE',
        quote: result.fxSnapshot,
        createdAt,
      });
      decisions.insertChecker(
        {
          movementId,
          excessAccountId: result.facts.excessAccountId,
          factsVersion: result.facts.factsVersion,
          ownerCurrency: result.facts.ownerCurrency,
          effectiveLimitOwner: result.effectiveLimitOwner,
          excessDecision: result.excessDecision,
          businessResultCode: result.businessResultCode,
          releaseEligibility: result.releaseEligibility,
          policySnapshot: result.policy,
          commandIdempotencyKey: control.idempotencyKey,
          actorContext: control.checkerContext,
          decisionTime: control.decisionTime,
        },
        createdAt,
      );
      const response: A3CheckerAcknowledgeResult =
        result.releaseEligibility === 'BLOCKED'
          ? { ok: false, code: 'EXCESS_LIMIT_EXCEEDED' }
          : { ...result, movement: this.acknowledgeArrival(movementId, control.checkerContext) };
      this.insertCheckerAcknowledgeIdempotency(movementId, control, response, createdAt);
      return response;
    });
    return persisted;
  }

  /** FROZEN V2 B4-only authorization and two-leg asset posting boundary. */
  releaseB4ExportAssetsByChecker(movementId: string, control: B4ExportAssetCheckerControl): B4ExportAssetReleaseResult {
    const store = new ExportAssetStore(this.db);
    const replay = store.findAuthorizationByB4(movementId);
    if (replay) {
      if (replay.checkerContext !== control.checkerContext) throw new IllegalStateTransitionError('B4 Export assets were already posted by another Checker.');
      const movement = this.movements.findById(movementId);
      if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
      return { movement, authorization: replay, assets: store.listPostingsByB4(movementId) };
    }

    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    const contract = this.contracts.findById(movement.balanceContractId);
    if (!contract || contract.instrumentType !== 'EPLC_CONFIRMATION' || !['HONOUR', 'ACCEPT'].includes(movement.movementType)) {
      throw new RequestValidationError('B4 Export Asset posting requires a pending Confirmation HONOUR or ACCEPT movement.');
    }
    const sourceB3MovementId = movement.referencedTransactionId;
    if (!sourceB3MovementId) throw new RequestValidationError('B4 Export Asset posting requires a referenced B3 movement.');
    const source = this.movements.findById(sourceB3MovementId);
    const sourceContract = source ? this.contracts.findById(source.balanceContractId) : undefined;
    if (
      !source ||
      !sourceContract ||
      sourceContract.instrumentType !== 'EPLC_EXAMINATION' ||
      sourceContract.parentLogicalContractId !== contract.logicalContractId ||
      source.movementType !== 'CREATE' ||
      source.status !== 'RELEASED'
    ) {
      throw new RequestValidationError('B4 must reference one Released B3 owned by the same Export Confirmation.');
    }
    const approved = new ExcessLedgerStore(this.db).findApprovedUtilizationByMovement(sourceB3MovementId);
    if (!approved || !new Decimal(approved.excessAmountOwner).greaterThan(0)) {
      throw new RequestValidationError('B4 Export Asset posting requires a positive locked B3 Approved Excess split.');
    }
    if (
      movement.currency !== approved.ownerCurrency ||
      contract.currency !== approved.ownerCurrency ||
      !new Decimal(movement.amount).equals(approved.transactionAmountOwner)
    ) {
      throw new RequestValidationError('B4 amount/currency must match the locked B3 Legal split.');
    }

    const plan = planExportAssetPosting({
      makerContext: movement.createdBy,
      checkerContext: control.checkerContext,
      ownerCurrency: approved.ownerCurrency,
      legalAmountOwner: approved.transactionAmountOwner,
      coveredAmountOwner: approved.coveredAmountOwner,
      excessAmountOwner: approved.excessAmountOwner,
      tenorBehavior: movement.movementType === 'HONOUR' ? 'SIGHT' : 'USANCE',
      authorization: control.authorization,
    });
    const mappings = plan.assets.map((asset) => {
      const mapping = this.accountMappings.findByKey(asset.mappingKey);
      if (!mapping) throw new RequestValidationError(`No active Balance Account mapping ${asset.mappingKey}.`);
      return mapping;
    });

    return new SqliteUnitOfWork(this.db).execute(() => {
      if (store.findAuthorizationByB4(movementId)) throw new MakerExcessConcurrencyError('B4 Export assets were concurrently posted.');
      const current = this.movements.findById(movementId);
      const currentApproved = new ExcessLedgerStore(this.db).findApprovedUtilizationByMovement(sourceB3MovementId);
      if (
        !current ||
        current.status !== 'PENDING' ||
        !currentApproved ||
        canonicalHash(currentApproved) !== canonicalHash(approved) ||
        current.createdBy !== movement.createdBy ||
        current.amount !== movement.amount ||
        current.currency !== movement.currency
      ) {
        throw new MakerExcessConcurrencyError('B4 or its locked B3 split changed before asset posting.');
      }
      const createdAt = this.now();
      const authorization: ExportAuthorizationSnapshot = {
        authorizationSnapshotId: randomUUID(),
        b4MovementId: movementId,
        sourceB3MovementId,
        claimStatus: control.authorization.claimStatus,
        authorizationReference: control.authorization.claimStatus === 'SUBMITTED' ? control.authorization.authorizationReference : undefined,
        authorizedAmountOwner: control.authorization.claimStatus === 'SUBMITTED' ? control.authorization.authorizedAmountOwner : undefined,
        authorizedCurrency: control.authorization.claimStatus === 'SUBMITTED' ? control.authorization.authorizedCurrency : undefined,
        authorizationValidationResult: control.authorization.authorizationValidationResult,
        checkerContext: control.checkerContext,
        decisionTime: control.decisionTime,
        confirmedAt: createdAt,
        excessDebtor: plan.excessDebtor,
        createdAt,
      };
      store.insertAuthorization(authorization);
      const businessEventId = movement.businessEventId ?? randomUUID();
      const assets = plan.assets.map((asset, index): ExportAssetPosting => ({
        postingId: randomUUID(),
        businessEventId,
        b4MovementId: movementId,
        sourceB3MovementId,
        balanceType: asset.balanceType,
        amountOwner: asset.amountOwner,
        ownerCurrency: asset.ownerCurrency,
        debtor: asset.debtor,
        mappingKey: asset.mappingKey,
        mappingVersion: mappings[index]!.version,
        accountANumber: mappings[index]!.accountA.accountNumber,
        accountBNumber: mappings[index]!.accountB.accountNumber,
        authorizationSnapshotId: authorization.authorizationSnapshotId,
        createdAt,
      }));
      assets.forEach((asset) => store.insertPosting(asset));
      const released = this.releaseMovement(movementId, control.checkerContext, true);
      return { movement: released, authorization, assets };
    });
  }

  async releaseExcessByChecker(movementId: string, control: A3CheckerExcessControl): Promise<OwnCheckerExcessReleaseResult> {
    const replayRow = this.db
      .prepare(
        `SELECT response_body FROM command_idempotency
         WHERE command_type = 'CHECKER_OWN_RELEASE' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
      )
      .get(movementId, control.checkerContext, control.idempotencyKey) as { response_body: string } | undefined;
    if (replayRow) return JSON.parse(replayRow.response_body) as OwnCheckerExcessReleaseResult;

    const excessMovementId = this.resolveExcessReleaseTarget(movementId);
    if (!excessMovementId) throw new MakerExcessConcurrencyError('Pending Excess reservation no longer exists at Checker Release.');

    const ledger = new ExcessLedgerStore(this.db);
    const sourceMovement = this.movements.findById(excessMovementId);
    if (!sourceMovement) throw new NotFoundError(`No BalanceMovement ${excessMovementId}`);
    const sourceContract = this.contracts.findById(sourceMovement.balanceContractId);
    if (!sourceContract) throw new NotFoundError(`No BalanceContract ${sourceMovement.balanceContractId}`);
    const result = await this.revalueA3ExcessByChecker(excessMovementId, control);
    if ('kind' in result) throw new MakerExcessConcurrencyError('Excess reservation unexpectedly resolved through the legacy Checker path.');
    if (!result.ok) return result;

    const decisions = new ExcessDecisionSnapshotStore(this.db);
    const fxSnapshots = new FxRateSnapshotStore(this.db);
    return new SqliteUnitOfWork(this.db).execute(() => {
      const currentMovement = this.movements.findById(excessMovementId);
      if (!currentMovement) throw new NotFoundError(`No BalanceMovement ${excessMovementId}`);
      const currentContract = this.contracts.findById(currentMovement.balanceContractId);
      if (!currentContract) throw new NotFoundError(`No BalanceContract ${currentMovement.balanceContractId}`);
      const current = this.deriveCheckerExcessFacts(currentMovement, currentContract);
      if (current.factsVersion !== result.facts.factsVersion) {
        throw new MakerExcessConcurrencyError('Current Excess facts changed before Checker Release persistence.');
      }
      const reservation = ledger
        .listByAccount(result.facts.excessAccountId)
        .find((event) => event.movementId === excessMovementId && event.eventType === 'PENDING_RESERVATION');
      if (!reservation) throw new MakerExcessConcurrencyError('Pending Excess reservation no longer exists at Checker Release.');
      const usesAcknowledgedArrivalSplit =
        currentContract.instrumentType === 'IPLC_LC' && currentMovement.movementType === 'UTILIZE' && Boolean(currentMovement.acknowledgedAt);
      const createdAt = this.now();
      fxSnapshots.insert({ fxSnapshotId: randomUUID(), movementId: excessMovementId, decisionPoint: 'CHECKER_RELEASE', quote: result.fxSnapshot, createdAt });
      decisions.insertChecker(
        {
          movementId: excessMovementId,
          excessAccountId: result.facts.excessAccountId,
          factsVersion: result.facts.factsVersion,
          ownerCurrency: result.facts.ownerCurrency,
          effectiveLimitOwner: result.effectiveLimitOwner,
          excessDecision: result.excessDecision,
          businessResultCode: result.businessResultCode,
          releaseEligibility: result.releaseEligibility,
          policySnapshot: result.policy,
          commandIdempotencyKey: control.idempotencyKey,
          actorContext: control.checkerContext,
          decisionTime: control.decisionTime,
        },
        createdAt,
      );
      const response: OwnCheckerExcessReleaseResult =
        result.releaseEligibility === 'BLOCKED'
          ? { ok: false, code: 'EXCESS_LIMIT_EXCEEDED' }
          : (() => {
              // Release the exact Maker reservation. Checker revaluation may have
              // changed the fresh Excess amount, but it must not leave a residual
              // pending reservation or release more than Maker reserved.
              ledger.insert({
                excessEventId: randomUUID(),
                excessAccountId: result.facts.excessAccountId,
                movementId: excessMovementId,
                eventType: 'RESERVATION_RELEASE',
                ownerCurrency: reservation.ownerCurrency,
                transactionAmountOwner: reservation.transactionAmountOwner,
                coveredAmountOwner: reservation.coveredAmountOwner,
                excessAmountOwner: reservation.excessAmountOwner,
                amountOwner: reservation.amountOwner,
                policyVersion: result.policy.policyVersion,
                sourceExcessEventId: reservation.excessEventId,
                createdBy: control.checkerContext,
                createdAt,
              });
              ledger.insert({
                excessEventId: randomUUID(),
                excessAccountId: result.facts.excessAccountId,
                movementId: excessMovementId,
                eventType: 'APPROVED_UTILIZATION',
                ownerCurrency: usesAcknowledgedArrivalSplit ? reservation.ownerCurrency : result.facts.ownerCurrency,
                transactionAmountOwner: usesAcknowledgedArrivalSplit ? reservation.transactionAmountOwner : currentMovement.amount,
                coveredAmountOwner: usesAcknowledgedArrivalSplit
                  ? reservation.coveredAmountOwner
                  : new Decimal(currentMovement.amount).minus(result.facts.proposedExcessOwner).toFixed(),
                excessAmountOwner: usesAcknowledgedArrivalSplit ? reservation.excessAmountOwner : result.facts.proposedExcessOwner,
                amountOwner: usesAcknowledgedArrivalSplit ? reservation.amountOwner : result.facts.proposedExcessOwner,
                policyVersion: result.policy.policyVersion,
                sourceExcessEventId: reservation.excessEventId,
                createdBy: control.checkerContext,
                createdAt,
              });
              return { ...result, movement: this.release(movementId, control.checkerContext) };
            })();
      this.db
        .prepare(
          `INSERT INTO command_idempotency (
            idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
            request_hash, response_status, response_body, created_at
          ) VALUES (?, 'CHECKER_OWN_RELEASE', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          movementId,
          control.checkerContext,
          control.idempotencyKey,
          canonicalHash({ movementId, excessMovementId, action: 'CHECKER_OWN_RELEASE' }),
          'ok' in response && !response.ok ? 409 : 200,
          JSON.stringify(response),
          createdAt,
        );
      return response;
    });
  }

  private prepareMovement(req: CreateMovementRequest, options: PrepareMovementOptions = {}): PreparedMovementResult {
    if (req.movementType !== 'REOPEN') {
      this.requestValidator.assertValidAmount(req.movementType, req.amount);
    }
    this.requestValidator.assertReasonCodeRequired(req.movementType, req.reasonCode);
    this.requestValidator.assertExpiryDateRequired(req);
    this.requestValidator.assertExpiryDateIsBusinessDay(req);
    this.requestValidator.assertNaturalKeyFieldsRequired(req);
    this.requestValidator.assertSecondaryRefRequired(req);
    this.requestValidator.assertTenorRequired(req);
    this.requestValidator.assertToleranceNonNegative(req.tolerancePct);
    this.requestValidator.assertToleranceAllowed(req.movementType, req.tolerancePct);
    this.requestValidator.assertToleranceChangeAllowed(req.movementType, req.tolerancePct, req.toleranceChangePct, req.toleranceChangeDirection);

    const contract =
      options.contractOverride ??
      (options.existingContractOnly ? this.movementContracts.resolveExistingAndValidate(req) : this.movementContracts.resolveOrCreate(req));

    const existing = this.movements.findByContractAndEventSeq(contract.balanceContractId, req.eventSeq);
    if (existing) return { created: false, existing };

    this.requestValidator.assertMonetaryAmendmentChangesTerms(req.movementType, req.amount, req.toleranceChangePct, contract.tolerancePct);

    const existingMovements = this.movements.listByContract(contract.balanceContractId);

    if (req.movementType === 'REOPEN') {
      const restoreAmount = computeReopenRestoreAmount(this.movements.listByContract(contract.balanceContractId));
      req = { ...req, amount: restoreAmount.toFixed() };
      this.requestValidator.assertValidAmount(req.movementType, req.amount);
    }

    if (req.movementType === 'AMEND_EXPIRY_DATE' && contract.status === 'EXPIRED') {
      // Cancelled/rejected Extension attempts are audit history, not balance history. Use the latest
      // effective RELEASED movement so a retry still finds the EXPIRE whose Tight Balance must be
      // restored. Looking at the last row of any status incorrectly produced a zero-value Extension
      // whenever the Maker had cancelled an earlier attempt (live S01 reproduction, 2026-09-03).
      const trailing = existingMovements
        .filter((movement) => movement.status === 'RELEASED')
        .sort((left, right) => left.eventSeq - right.eventSeq)
        .pop();
      if (trailing?.status === 'RELEASED' && trailing.movementType === 'EXPIRE') {
        req = { ...req, amount: trailing.ceilingAmount, reversalOfMovementId: trailing.movementId };
      }
    }

    const ceilingAmount = options.ceilingAmountOverride
      ? parseMonetaryAmount(options.ceilingAmountOverride)
      : this.deriveMovementCeilingAmount(req, contract, existingMovements);

    if (req.sourceTransactionRef) {
      const duplicateRef = existingMovements.find((m) => m.sourceTransactionRef === req.sourceTransactionRef && m.status !== 'CANCELLED');
      if (duplicateRef) {
        throw new RequestValidationError(
          `sourceTransactionRef "${req.sourceTransactionRef}" is already used by movement ${duplicateRef.movementId} ` +
            `(eventSeq ${duplicateRef.eventSeq}) against this same contract — secondary reference numbers must be unique per contract.`,
        );
      }
    }

    const confirmed = computeConfirmedBalance(existingMovements);
    const available = computeAvailableBalance(confirmed, existingMovements);

    const descriptor = this.movementTypeRegistry[req.movementType];
    if (!descriptor) {
      throw new RequestValidationError(`Unrecognized movementType "${req.movementType}" for instrumentType ${req.instrumentType}.`);
    }
    // Use available balance so other pending redemptions remain reserved.
    const sufficiency = descriptor.checkSufficiency({
      contract,
      existingMovements,
      confirmedBalance: confirmed,
      availableBalance: available,
      ceilingAmount,
      req,
    });
    const warnings: MovementWarning[] | null = sufficiency?.ok && sufficiency.warning ? [sufficiency.warning] : null;
    const preparedSufficiency: PreparedMovementSufficiency =
      sufficiency && !sufficiency.ok ? { kind: 'INSUFFICIENT_AVAILABLE_BALANCE', message: sufficiency.error } : { kind: 'SUFFICIENT' };

    let reversedDirection: 1 | -1 | undefined;
    if ((req.movementType === 'REVERSAL' || req.movementType === 'AMEND_EXPIRY_DATE') && req.reversalOfMovementId) {
      const original = this.movements.findById(req.reversalOfMovementId);
      const originalDirection = original ? MOVEMENT_DIRECTION[original.movementType] : undefined;
      if (originalDirection === 1 || originalDirection === -1) reversedDirection = originalDirection;
    }

    const contingentAccountEntry = deriveContingentAccountEntry({
      instrumentType: req.instrumentType,
      movementType: req.movementType,
      amount: ceilingAmount.toFixed(),
      currency: req.currency,
      tenorType: contract.tenorType,
      reversedDirection,
      accountMapping: this.accountMappingFor(contract),
    });

    const movement: BalanceMovement = {
      movementId: options.movementId ?? randomUUID(),
      balanceContractId: contract.balanceContractId,
      eventSeq: req.eventSeq,
      businessEventId: req.businessEventId ?? null,
      movementType: req.movementType,
      exposureNature: req.exposureNature ?? 'CONTINGENT',
      amount: req.amount,
      ceilingAmount: ceilingAmount.toFixed(),
      tolerancePct: this.correctedTolerancePct(req, contract),
      toleranceChangePct: MONETARY_AMENDMENT_TYPES.has(req.movementType) ? (req.toleranceChangePct ?? null) : null,
      toleranceChangeDirection: this.movementToleranceChangeDirection(req),
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

    return { created: true, movement, sufficiency: preparedSufficiency };
  }

  /** Rebuilds immutable snapshots inside the command transaction after the facts-version guard. */
  private refreshPreparedMovementSnapshots(movement: BalanceMovement): void {
    const contract = this.contracts.findById(movement.balanceContractId);
    if (!contract) throw new MakerExcessConcurrencyError('Prepared movement Balance Contract no longer exists.');
    const currentMovements = this.movements.listByContract(contract.balanceContractId);
    const snapshotBundle = this.movementSnapshots.captureBundle(contract, [...currentMovements, movement], movement);
    movement.eventSnapshot = snapshotBundle.eventSnapshot;
    movement.rootEventSnapshot = snapshotBundle.rootEventSnapshot;
    movement.acceptanceEventSnapshot = snapshotBundle.acceptanceEventSnapshot;
    movement.sgEventSnapshot = snapshotBundle.sgEventSnapshot;
  }

  /** Legal amount stays on `amount`; only Covered may affect formal balance and its server-derived voucher. */
  private applyCoveredBalanceAmount(movement: BalanceMovement, contract: BalanceContract, coveredAmountOwner: string): void {
    movement.ceilingAmount = coveredAmountOwner;
    movement.contingentAccountEntry = deriveContingentAccountEntry({
      instrumentType: contract.instrumentType,
      movementType: movement.movementType,
      amount: coveredAmountOwner,
      currency: movement.currency,
      tenorType: contract.tenorType,
      accountMapping: this.accountMappingFor(contract),
    });
  }

  private insertPreparedMovement(movement: BalanceMovement): CreateMovementResult {
    const result = this.movements.insert(movement);
    if (!result.created) return { created: false, existing: result.existing };
    this.applyCreateSideEffects(movement);
    return { created: true, movement };
  }

  private deriveExcessPreviewFacts(input: ExcessPreviewRequest): MakerExcessCurrentFacts {
    if (input.functionCode === 'A3S') return this.deriveA3SPreviewFacts(input);
    if (!input.request || input.requests !== undefined) throw new RequestValidationError(`${input.functionCode} preview requires exactly one request.`);
    const req = input.request;

    if (input.functionCode === 'A3') {
      if (req.instrumentType !== 'IPLC_LC' || req.movementType !== 'UTILIZE') {
        throw new RequestValidationError('A3 Excess Preview requires an IPLC_LC UTILIZE request.');
      }
      const contract = this.movementContracts.resolveExistingAndValidate(req);
      const movement = this.preparePreviewMovement(req, contract, input.excludeMovementId);
      if (this.isA3SCompoundMovement(movement, contract)) {
        throw new RequestValidationError('A3S preview requires the compound A3S boundary.');
      }
      return this.deriveA3MakerExcessFacts(contract.balanceContractId, movement, input.excludeMovementId);
    }

    if (req.instrumentType !== 'EPLC_EXAMINATION' || req.movementType !== 'CREATE' || !req.parentLogicalContractId) {
      throw new RequestValidationError('B3 Excess Preview requires an EPLC_EXAMINATION CREATE request with parentLogicalContractId.');
    }
    const parent = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
    if (!parent || parent.instrumentType !== 'EPLC_CONFIRMATION') {
      throw new RequestValidationError('B3 requires an ACTIVE EPLC_CONFIRMATION allowance owner.');
    }
    if (input.excludeMovementId) {
      const old = this.requirePreviewExcludedMovement(input.excludeMovementId);
      const contract = this.contracts.findById(old.balanceContractId);
      if (!contract || contract.instrumentType !== 'EPLC_EXAMINATION' || contract.parentLogicalContractId !== parent.logicalContractId) {
        throw new RequestValidationError('excludeMovementId does not identify the B3 movement being previewed.');
      }
      return this.deriveCheckerExcessFacts(this.copyPreviewAmount(old, req), contract);
    }
    const plannedContract = this.movementContracts.prepareNewForExcess(req);
    const prepared = this.prepareMovement(req, { movementId: randomUUID(), contractOverride: plannedContract });
    if (!prepared.created) throw new RequestValidationError('B3 preview movement identity already exists; use excludeMovementId for Fix Pending.');
    return this.deriveCheckerExcessFacts(prepared.movement, plannedContract);
  }

  private deriveA3SPreviewFacts(input: ExcessPreviewRequest): MakerExcessCurrentFacts {
    if (!input.requests || input.request !== undefined || input.requests.length !== 2) {
      throw new RequestValidationError('A3S Excess Preview requires exactly two compound requests.');
    }
    const sgRequest = input.requests.find(
      (candidate) => candidate.instrumentType === 'SHGT' && (candidate.movementType === 'FULL_REDEEM' || candidate.movementType === 'PARTIAL_REDEEM'),
    );
    const lcRequest = input.requests.find((candidate) => candidate.instrumentType === 'IPLC_LC' && candidate.movementType === 'UTILIZE');
    if (!sgRequest || !lcRequest || !sgRequest.businessEventId || sgRequest.businessEventId !== lcRequest.businessEventId) {
      throw new RequestValidationError('A3S requires linked SG redemption and LC UTILIZE requests sharing a businessEventId.');
    }
    const lc = this.movementContracts.resolveExistingAndValidate(lcRequest);
    const sg = this.movementContracts.resolveExistingAndValidate(sgRequest);
    if (lc.instrumentType !== 'IPLC_LC' || sg.instrumentType !== 'SHGT' || sg.parentLogicalContractId !== lc.logicalContractId) {
      throw new RequestValidationError('A3S Shipping Guarantee must belong to the same Import LC allowance owner.');
    }

    if (input.excludeMovementId) {
      const old = this.requirePreviewExcludedMovement(input.excludeMovementId);
      if (old.balanceContractId !== lc.balanceContractId) {
        throw new RequestValidationError('excludeMovementId does not identify the A3S LC movement being previewed.');
      }
      return this.deriveA3MakerExcessFacts(lc.balanceContractId, this.copyPreviewAmount(old, lcRequest), old.movementId, sgRequest.amount);
    }

    const preparedSg = this.prepareMovement(sgRequest, { movementId: randomUUID(), existingContractOnly: true });
    const preparedLc = this.prepareMovement(lcRequest, { movementId: randomUUID(), existingContractOnly: true });
    if (!preparedSg.created || !preparedLc.created) {
      throw new RequestValidationError('A3S preview movement identity already exists; use excludeMovementId for Fix Pending.');
    }
    const selectedSgMovements = this.movements.listByContract(sg.balanceContractId);
    const selectedSgAvailable = computeAvailableBalance(computeConfirmedBalance(selectedSgMovements), selectedSgMovements);
    if (new Decimal(preparedSg.movement.amount).greaterThan(selectedSgAvailable)) {
      throw new InsufficientBalanceError(
        `Requested SG redemption ${preparedSg.movement.amount} exceeds the existing SG Available Balance ${selectedSgAvailable.toFixed()}.`,
      );
    }
    const lcMovements = this.movements.listByContract(lc.balanceContractId);
    const shgtMovements = this.movements.listShgtMovementsForParent(lc.logicalContractId);
    const residualParent = Decimal.max(
      0,
      computeConfirmedBalance(lcMovements).minus(computePendingDecreaseTotal(lcMovements)).minus(computeOffBalanceExposure(shgtMovements)),
    );
    return {
      ownerType: 'IMPORT_LC',
      ownerId: lc.logicalContractId,
      factsVersion: canonicalHash({ lc, lcMovements, shgtMovements, preparedSg: preparedSg.movement, preparedLc: preparedLc.movement }),
      approvedContractualMaximumOwner: computeFaceAmount(lcMovements).toFixed(),
      splitInput: {
        functionCode: 'A3S',
        transactionCurrency: preparedLc.movement.currency,
        ownerCurrency: lc.currency,
        transactionAmountOwner: preparedLc.movement.amount,
        baseParentTightAvailableOwner: residualParent.toFixed(),
        currentSgRedemptionAmountOwner: preparedSg.movement.amount,
      },
    };
  }

  private preparePreviewMovement(req: CreateMovementRequest, contract: BalanceContract, excludeMovementId?: string): BalanceMovement {
    if (excludeMovementId) {
      const old = this.requirePreviewExcludedMovement(excludeMovementId);
      if (old.balanceContractId !== contract.balanceContractId) {
        throw new RequestValidationError('excludeMovementId does not identify the movement being previewed.');
      }
      return this.copyPreviewAmount(old, req);
    }
    const prepared = this.prepareMovement(req, { movementId: randomUUID(), existingContractOnly: true });
    if (!prepared.created) throw new RequestValidationError('Preview movement identity already exists; use excludeMovementId for Fix Pending.');
    return prepared.movement;
  }

  private requirePreviewExcludedMovement(movementId: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement || (movement.status !== 'PENDING' && movement.status !== 'REJECTED')) {
      throw new RequestValidationError('excludeMovementId must identify a PENDING or REJECTED movement.');
    }
    return movement;
  }

  private copyPreviewAmount(old: BalanceMovement, req: CreateMovementRequest): BalanceMovement {
    if (old.eventSeq !== req.eventSeq || old.currency !== req.currency) {
      throw new RequestValidationError('Fix Pending preview must preserve the movement eventSeq and currency.');
    }
    return { ...old, amount: req.amount, ceilingAmount: req.amount, businessEventId: req.businessEventId ?? old.businessEventId };
  }

  private deriveA3MakerExcessFacts(
    balanceContractId: string,
    preparedMovement: BalanceMovement,
    excludePersistedMovementId?: string,
    currentSgRedemptionAmountOverride?: string,
  ): MakerExcessCurrentFacts {
    const contract = this.contracts.findById(balanceContractId);
    if (!contract) throw new MakerExcessConcurrencyError('Prepared movement Balance Contract no longer exists.');
    const existingMovements = this.movements.listByContract(balanceContractId).filter((movement) => movement.movementId !== excludePersistedMovementId);
    if (this.isA3SCompoundMovement(preparedMovement, contract)) {
      const linkedSgRedemptions = this.movements.findByBusinessEventId(preparedMovement.businessEventId!).filter((candidate) => {
        if (candidate.movementType !== 'FULL_REDEEM' && candidate.movementType !== 'PARTIAL_REDEEM') return false;
        const candidateContract = this.contracts.findById(candidate.balanceContractId);
        return candidateContract?.instrumentType === 'SHGT' && candidateContract.parentLogicalContractId === contract.logicalContractId;
      });
      if (linkedSgRedemptions.length !== 1) throw new MakerExcessConcurrencyError('A3S current facts require exactly one linked SG redemption.');
      const components = this.utilizeTightAvailableComponents(contract, existingMovements);
      const baseParentTight = Decimal.max(0, components.tightAvailable);
      const canonicalShgtMovements = [...components.shgtMovements].sort((left, right) => left.movementId.localeCompare(right.movementId));
      return {
        ownerType: 'IMPORT_LC',
        ownerId: contract.logicalContractId,
        factsVersion: canonicalHash({
          contract,
          existingMovements,
          shgtMovements: canonicalShgtMovements,
          prepared: preparedMovement,
          linkedSgRedemption: linkedSgRedemptions[0],
          currentSgRedemptionAmountOverride,
        }),
        approvedContractualMaximumOwner: computeFaceAmount(existingMovements).toFixed(),
        splitInput: {
          functionCode: 'A3S',
          transactionCurrency: preparedMovement.currency,
          ownerCurrency: contract.currency,
          transactionAmountOwner: preparedMovement.amount,
          baseParentTightAvailableOwner: baseParentTight.toFixed(),
          currentSgRedemptionAmountOwner: currentSgRedemptionAmountOverride ?? linkedSgRedemptions[0]!.amount,
        },
      };
    }
    const { tightAvailable, shgtMovements } = this.utilizeTightAvailableComponents(contract, existingMovements, preparedMovement.businessEventId);
    const canonicalShgtMovements = [...shgtMovements].sort((left, right) => left.movementId.localeCompare(right.movementId));
    return {
      ownerType: 'IMPORT_LC',
      ownerId: contract.logicalContractId,
      factsVersion: canonicalHash({ contract, existingMovements, shgtMovements: canonicalShgtMovements, prepared: preparedMovement }),
      approvedContractualMaximumOwner: computeFaceAmount(existingMovements).toFixed(),
      splitInput: {
        functionCode: 'A3',
        transactionCurrency: preparedMovement.currency,
        ownerCurrency: contract.currency,
        transactionAmountOwner: preparedMovement.amount,
        importLcTightAvailableOwner: tightAvailable.toFixed(),
      },
    };
  }

  private deriveCheckerExcessFacts(movement: BalanceMovement, contract: BalanceContract, currentSgRedemptionAmountOverride?: string): MakerExcessCurrentFacts {
    if (contract.instrumentType === 'IPLC_LC' && movement.movementType === 'UTILIZE') {
      return this.deriveA3MakerExcessFacts(contract.balanceContractId, movement, movement.movementId, currentSgRedemptionAmountOverride);
    }
    const functionCode = contract.instrumentType === 'EPLC_EXAMINATION' && movement.movementType === 'CREATE' ? ('B3' as const) : undefined;
    if (!functionCode || !contract.parentLogicalContractId) {
      throw new RequestValidationError('Checker Excess revaluation supports A3/A3S or B3 movements only.');
    }
    const parent = this.contracts.findActiveByLogicalContractId(contract.parentLogicalContractId);
    const expectedParentType = 'EPLC_CONFIRMATION';
    if (!parent || parent.instrumentType !== expectedParentType) {
      throw new MakerExcessConcurrencyError(`${functionCode} allowance owner is no longer an ACTIVE ${expectedParentType}.`);
    }
    const parentMovements = this.movements.listByContract(parent.balanceContractId);
    const approvedContractualMaximumOwner = computeFaceAmount(parentMovements).toFixed();
    const siblingExaminations = this.movements
      .listExaminationMovementsForParent(parent.logicalContractId)
      .filter((candidate) => candidate.balanceContractId !== contract.balanceContractId);
    const tightAvailable = Decimal.max(
      0,
      computeConfirmedBalance(parentMovements).minus(computePendingDecreaseTotal(parentMovements)).minus(computePresentDocsEarmark(siblingExaminations)),
    );
    return {
      ownerType: 'EXPORT_CONFIRMATION',
      ownerId: parent.logicalContractId,
      factsVersion: canonicalHash({ parent, parentMovements, siblingExaminations, contract, movement }),
      approvedContractualMaximumOwner,
      splitInput: {
        functionCode,
        transactionCurrency: movement.currency,
        ownerCurrency: parent.currency,
        transactionAmountOwner: movement.amount,
        confirmationTightAvailableOwner: tightAvailable.toFixed(),
      },
    };
  }

  private createCheckerExcessRuntime(): CheckerExcessRuntime | undefined {
    if (!this.makerExcessRuntime) return undefined;
    const accounts = new ExcessAccountStore(this.db);
    const ledger = new ExcessLedgerStore(this.db);
    return {
      policy: this.makerExcessRuntime.policy,
      fx: this.makerExcessRuntime.fx,
      ownerIdentity: {
        load: (movement, contract) => {
          const facts = this.deriveCheckerExcessFacts(movement, contract);
          if (movement.currency !== facts.splitInput.ownerCurrency) {
            const message =
              contract.instrumentType === 'IPLC_LC'
                ? `A3 transaction currency "${movement.currency}" does not match Import LC owner currency "${facts.splitInput.ownerCurrency}".`
                : `Transaction currency "${movement.currency}" does not match allowance owner currency "${facts.splitInput.ownerCurrency}".`;
            throw new RequestValidationError(message);
          }
          return { ownerType: facts.ownerType, ownerId: facts.ownerId, ownerCurrency: facts.splitInput.ownerCurrency };
        },
      },
      currentFacts: {
        load: (movement, contract) => {
          const current = this.deriveCheckerExcessFacts(movement, contract);
          const split = prepareExcessFunctionSplit(current.splitInput);
          const account = accounts.getByOwner(current.ownerType, current.ownerId);
          if (!account) throw new MakerExcessConcurrencyError(`No Excess account for ${current.ownerType} ${current.ownerId}.`);
          if (account.ownerCurrency !== split.ownerCurrency) {
            throw new MakerExcessConcurrencyError('Allowance owner currency changed before Checker Release.');
          }
          const lockedReservation = movement.acknowledgedAt
            ? ledger
                .listByAccount(account.excessAccountId)
                .find((event) => event.movementId === movement.movementId && event.eventType === 'PENDING_RESERVATION')
            : undefined;
          return {
            ownerType: current.ownerType,
            ownerId: current.ownerId,
            ownerCurrency: split.ownerCurrency,
            approvedContractualMaximumOwner: current.approvedContractualMaximumOwner,
            // A3/A3S Acknowledge locks Legal/Covered/Excess. A4/A6
            // revalidates that locked Excess instead of splitting it again.
            proposedExcessOwner: lockedReservation?.excessAmountOwner ?? split.proposedExcessOwner,
            excessAccountId: account.excessAccountId,
            factsVersion: current.factsVersion,
          };
        },
      },
      allowance: {
        loadExcludingMovement: ({ excessAccountId, movementId, ownerCurrencyPrecision }) => {
          const aggregate = ledger.aggregateForAccountExcludingMovement(excessAccountId, movementId, ownerCurrencyPrecision);
          return {
            approvedUtilizedOwner: aggregate.approvedUtilizedOwner,
            otherPendingReservedOwner: aggregate.pendingReservedOwner,
          };
        },
      },
    };
  }

  private applyCreateSideEffects(movement: BalanceMovement): void {
    if (!movement.referencedTransactionId) return;
    const referenced = this.movements.findById(movement.referencedTransactionId);
    if (!referenced) return;
    const referencedContract = this.contracts.findById(referenced.balanceContractId);
    if (
      referencedContract?.instrumentType === 'IPLC_LC' &&
      referenced.movementType === 'UTILIZE' &&
      referenced.status === 'PENDING' &&
      referenced.acknowledgedAt &&
      !referenced.makerSubmittedAt
    ) {
      this.movements.submitByMaker({ movementId: referenced.movementId, makerSubmittedBy: movement.createdBy, makerSubmittedAt: movement.createdAt });
    }
  }

  private applyCancelSideEffects(movement: BalanceMovement): void {
    if (!movement.referencedTransactionId) return;
    const referenced = this.movements.findById(movement.referencedTransactionId);
    if (!referenced) return;
    const referencedContract = this.contracts.findById(referenced.balanceContractId);
    if (
      referencedContract?.instrumentType === 'IPLC_LC' &&
      referenced.movementType === 'UTILIZE' &&
      referenced.status === 'PENDING' &&
      referenced.makerSubmittedAt
    ) {
      this.movements.withdrawMakerSubmit(referenced.movementId, false);
    }
  }

  release(movementId: string, releasedBy: string): BalanceMovement {
    return this.releaseMovement(movementId, releasedBy, false);
  }

  private releaseMovement(movementId: string, releasedBy: string, b4ExportAssetGateSatisfied: boolean): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);

    if (!b4ExportAssetGateSatisfied && this.requiresB4ExportAssetGate(movement)) {
      throw new RequestValidationError('Positive B3 Excess must use the B4 Export authorization and asset posting action.');
    }

    applyStatusTransition({ currentStatus: movement.status, action: 'RELEASE', createdBy: movement.createdBy, actingUser: releasedBy });

    const contract = this.contracts.findById(movement.balanceContractId)!;
    if (
      contract.instrumentType === 'SHGT' &&
      (movement.movementType === 'FULL_REDEEM' || movement.movementType === 'PARTIAL_REDEEM') &&
      movement.businessEventId
    ) {
      const arrivals = this.movements.findByBusinessEventId(movement.businessEventId).filter((linked) => linked.movementType === 'UTILIZE');
      if (arrivals.length !== 1) throw new RequestValidationError(`A3S event ${movement.businessEventId} must reference exactly one Document Arrival.`);
      this.requestValidator.assertA3SBillCoversShippingGuarantee(movement.businessEventId, arrivals[0]!.amount);
    }
    const isUtilizeFinalize = movement.movementType === 'UTILIZE' && contract.instrumentType === 'IPLC_LC' && contract.tenorType != null;

    this.releasePolicy.assertSubmitGuards(movement, contract, isUtilizeFinalize);

    const before = computeConfirmedBalance(this.movements.listByContract(contract.balanceContractId));
    if (MONETARY_AMENDMENT_TYPES.has(movement.movementType)) {
      this.requestValidator.assertMonetaryAmendmentChangesTerms(movement.movementType, movement.amount, movement.toleranceChangePct, contract.tolerancePct);
      const withoutCurrent = this.movements.listByContract(contract.balanceContractId).filter((candidate) => candidate.movementId !== movement.movementId);
      const expected = this.deriveMovementCeilingAmount(
        {
          instrumentType: contract.instrumentType,
          balanceContractId: contract.balanceContractId,
          movementType: movement.movementType,
          eventSeq: movement.eventSeq,
          amount: movement.amount,
          currency: movement.currency,
          toleranceChangePct: movement.toleranceChangePct,
          toleranceChangeDirection: movement.toleranceChangeDirection,
          createdBy: movement.createdBy,
        },
        contract,
        withoutCurrent,
      );
      if (!expected.equals(parseMonetaryAmount(movement.ceilingAmount))) {
        throw new IllegalStateTransitionError(
          `Cannot release monetary amendment ${movement.movementId} — the LC amount or tolerance has changed since Submit ` +
            `(stored balance effect ${movement.ceilingAmount}, now ${expected.toFixed()}). Cancel it and re-submit against the latest approved LC terms.`,
        );
      }
    }
    this.releasePolicy.assertEligibility(movement, contract, before);

    const releasedAt = this.now();
    const releasedTolerancePct = MONETARY_AMENDMENT_TYPES.has(movement.movementType)
      ? this.resultingTolerancePct(
          {
            instrumentType: contract.instrumentType,
            movementType: movement.movementType,
            eventSeq: movement.eventSeq,
            amount: movement.amount,
            currency: movement.currency,
            toleranceChangePct: movement.toleranceChangePct,
            toleranceChangeDirection: movement.toleranceChangeDirection,
            createdBy: movement.createdBy,
          },
          contract,
        )
      : movement.tolerancePct;
    const after =
      movement.movementType === 'REVERSAL' || (movement.movementType === 'AMEND_EXPIRY_DATE' && movement.reversalOfMovementId)
        ? computeConfirmedBalance(
            this.movements
              .listByContract(contract.balanceContractId)
              .map((m) => (m.movementId === movement.movementId ? { ...m, status: 'RELEASED' as const } : m)),
          )
        : before.plus(computeConfirmedBalance([{ ...movement, status: 'RELEASED' }]));

    const releasedSelf = { ...movement, status: 'RELEASED' as const, tolerancePct: releasedTolerancePct };
    const ownMovements = this.movements.listByContract(contract.balanceContractId).map((m) => (m.movementId === movementId ? releasedSelf : m));
    const snapshotBundle = this.movementSnapshots.captureBundle(contract, ownMovements, releasedSelf);

    const snapshotTarget = this.movementSnapshots.resolveWriteTarget(isUtilizeFinalize);
    const snapshotFields: Partial<UpdateMovementStatusParams> = {};
    snapshotFields[snapshotTarget.eventSnapshotField] = JSON.stringify(snapshotBundle.eventSnapshot);
    snapshotFields[snapshotTarget.acceptanceSnapshotField] = snapshotBundle.acceptanceEventSnapshot
      ? JSON.stringify(snapshotBundle.acceptanceEventSnapshot)
      : null;
    snapshotFields[snapshotTarget.sgSnapshotField] = snapshotBundle.sgEventSnapshot ? JSON.stringify(snapshotBundle.sgEventSnapshot) : null;

    this.movements.updateStatus({
      movementId,
      status: 'RELEASED',
      ...(MONETARY_AMENDMENT_TYPES.has(movement.movementType) ? { tolerancePct: releasedTolerancePct } : {}),
      releasedBy,
      releasedAt,
      balanceBefore: before.toFixed(),
      balanceAfter: after.toFixed(),
      rootEventSnapshot: snapshotBundle.rootEventSnapshot ? JSON.stringify(snapshotBundle.rootEventSnapshot) : null,
      ...snapshotFields,
    });

    this.releaseSideEffects.applyStandard(releasedSelf, contract, releasedBy, releasedAt);
    this.releaseSideEffects.applyExpiryAmendment(movement, contract, releasedBy, releasedAt);

    return this.movements.findById(movementId)!;
  }

  private requiresB4ExportAssetGate(movement: BalanceMovement): boolean {
    if (!['HONOUR', 'ACCEPT'].includes(movement.movementType) || !movement.referencedTransactionId) return false;
    const contract = this.contracts.findById(movement.balanceContractId);
    if (contract?.instrumentType !== 'EPLC_CONFIRMATION') return false;
    const approved = new ExcessLedgerStore(this.db).findApprovedUtilizationByMovement(movement.referencedTransactionId);
    return Boolean(approved && new Decimal(approved.excessAmountOwner).greaterThan(0));
  }

  requiresB4ExportAssetAuthorization(movementId: string): boolean {
    const movement = this.movements.findById(movementId);
    return Boolean(movement && this.requiresB4ExportAssetGate(movement));
  }

  // Automatic expiry retires the contract after releasing its movement.

  reject(movementId: string, releasedBy: string, reasonCode: string, remarks?: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    applyStatusTransition({ currentStatus: movement.status, action: 'REJECT', createdBy: movement.createdBy, actingUser: releasedBy });
    this.movements.updateStatus({ movementId, status: 'REJECTED', releasedBy, releasedAt: this.now(), reasonCode, remarks });
    return this.movements.findById(movementId)!;
  }

  cancel(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): BalanceMovement {
    return new SqliteUnitOfWork(this.db).execute(() => this.cancelWithinTransaction(movementId, cancelledBy, reasonCode, remarks));
  }

  deletePendingExcessByMaker(
    movementId: string,
    input: { cancelledBy: string; reasonCode?: string; remarks?: string },
    idempotencyKey: string,
  ): DeletePendingExcessResult {
    const requestHash = canonicalHash({ movementId, ...input });
    const readReplay = () =>
      this.db
        .prepare(
          `SELECT request_hash, response_body FROM command_idempotency
           WHERE command_type = 'DELETE_PENDING' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
        )
        .get(movementId, input.cancelledBy, idempotencyKey) as { request_hash: string; response_body: string } | undefined;
    const replay = readReplay();
    if (replay) {
      return replay.request_hash === requestHash
        ? (JSON.parse(replay.response_body) as DeletePendingExcessResult)
        : { ok: false, code: 'IDEMPOTENCY_CONFLICT' };
    }

    return new SqliteUnitOfWork(this.db).execute(() => {
      const claimed = readReplay();
      if (claimed) {
        return claimed.request_hash === requestHash
          ? (JSON.parse(claimed.response_body) as DeletePendingExcessResult)
          : ({ ok: false, code: 'IDEMPOTENCY_CONFLICT' } as const);
      }
      const movement = this.cancelWithinTransaction(movementId, input.cancelledBy, input.reasonCode, input.remarks);
      const response = { ok: true as const, movement };
      this.db
        .prepare(
          `INSERT INTO command_idempotency (
            idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
            request_hash, response_status, response_body, created_at
          ) VALUES (?, 'DELETE_PENDING', ?, ?, ?, ?, 200, ?, ?)`,
        )
        .run(randomUUID(), movementId, input.cancelledBy, idempotencyKey, requestHash, JSON.stringify(response), this.now());
      return response;
    });
  }

  private cancelWithinTransaction(movementId: string, cancelledBy: string, reasonCode?: string, remarks?: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    applyStatusTransition({ currentStatus: movement.status, action: 'CANCEL', createdBy: movement.createdBy, actingUser: cancelledBy });
    // The movement store persists the legacy product name CANCELLED; at the
    // Excess workflow boundary this is the approved whole-movement DELETED state.
    const statusBefore = movement.status as 'PENDING' | 'REJECTED';
    const cancelledAt = this.now();
    const contract = this.contracts.findById(movement.balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${movement.balanceContractId} (owner of movement ${movement.movementId})`);
    const linkedPendingSgRedemptions = this.isA3SCompoundMovement(movement, contract)
      ? this.movements.findByBusinessEventId(movement.businessEventId!).filter((candidate) => {
          if (candidate.status !== 'PENDING' || (candidate.movementType !== 'FULL_REDEEM' && candidate.movementType !== 'PARTIAL_REDEEM')) return false;
          const candidateContract = this.contracts.findById(candidate.balanceContractId);
          return candidateContract?.instrumentType === 'SHGT' && candidateContract.parentLogicalContractId === contract.logicalContractId;
        })
      : [];
    if (linkedPendingSgRedemptions.length > 1) {
      throw new MakerExcessConcurrencyError(`A3S event ${movement.businessEventId} has more than one linked Pending SG redemption.`);
    }
    const ledger = new ExcessLedgerStore(this.db);
    const reservations = ledger.listOutstandingReservationsByMovement(movementId);
    if (reservations.length > 1) {
      throw new MakerExcessConcurrencyError(`Movement ${movementId} has more than one outstanding Pending Excess Reservation.`);
    }

    this.movements.updateStatus({
      movementId,
      status: 'CANCELLED',
      cancelledBy,
      cancelledAt,
      // A rejected movement keeps its Checker rejection reason/remarks on the
      // movement; the distinct deletion reason/remarks live in delete audit.
      ...(statusBefore === 'PENDING' ? { reasonCode: reasonCode ?? 'MAKER_EC', remarks } : { remarks: movement.remarks }),
    });
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

    for (const reservation of reservations) {
      const plan = planWholeDeletePending({
        workflowStatus: statusBefore,
        pendingReservationOwner: reservation.amountOwner,
      });
      ledger.insert({
        excessEventId: randomUUID(),
        excessAccountId: reservation.excessAccountId,
        movementId,
        eventType: 'RESERVATION_RELEASE',
        ownerCurrency: reservation.ownerCurrency,
        transactionAmountOwner: reservation.transactionAmountOwner,
        coveredAmountOwner: reservation.coveredAmountOwner,
        excessAmountOwner: reservation.excessAmountOwner,
        amountOwner: plan.reservationReleaseOwner,
        policyVersion: reservation.policyVersion,
        sourceExcessEventId: reservation.excessEventId,
        createdBy: cancelledBy,
        createdAt: cancelledAt,
      });
      const accounts = new ExcessAccountStore(this.db);
      const account = accounts.getById(reservation.excessAccountId);
      if (!account || !accounts.advanceVersion(account.excessAccountId, account.version, reservation.policyVersion, cancelledAt)) {
        throw new MakerExcessConcurrencyError('Allowance account changed before Delete Pending commit.');
      }
    }

    const linkedPendingSg = linkedPendingSgRedemptions[0];
    if (linkedPendingSg) {
      applyStatusTransition({ currentStatus: linkedPendingSg.status, action: 'CANCEL', createdBy: linkedPendingSg.createdBy, actingUser: cancelledBy });
      this.movements.updateStatus({
        movementId: linkedPendingSg.movementId,
        status: 'CANCELLED',
        cancelledBy,
        cancelledAt,
        reasonCode: reasonCode ?? 'MAKER_EC',
        remarks,
      });
    }

    this.applyCancelSideEffects(movement);
    if (this.movementTypeRegistry[movement.movementType]?.isCreating) {
      const siblingMovements = this.movements.listByContract(movement.balanceContractId).filter((m) => m.movementId !== movementId);
      if (siblingMovements.length === 0) {
        this.contracts.markCancelled(movement.balanceContractId, cancelledAt);
      }
    }
    return this.movements.findById(movementId)!;
  }

  async editPendingExcessByMaker(
    movementId: string,
    patch: EditMovementRequest,
    control: { actorContext: string; idempotencyKey: string; decisionTime: string },
  ): Promise<MakerExcessFixResult> {
    if (!this.makerExcessRuntime) throw new RequestValidationError('Maker Excess runtime is not configured.');
    const requestHash = canonicalHash({ movementId, patch });
    const replay = this.db
      .prepare(
        `SELECT request_hash, response_body FROM command_idempotency
         WHERE command_type = 'FIX_PENDING' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
      )
      .get(movementId, control.actorContext, control.idempotencyKey) as { request_hash: string; response_body: string } | undefined;
    if (replay) {
      return replay.request_hash === requestHash ? (JSON.parse(replay.response_body) as MakerExcessFixResult) : { ok: false, code: 'IDEMPOTENCY_CONFLICT' };
    }
    const old = this.movements.findById(movementId);
    if (!old) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    applyStatusTransition({ currentStatus: old.status, action: 'EDIT', createdBy: old.createdBy, actingUser: patch.editedBy });
    if (patch.editedBy !== control.actorContext) throw new RequestValidationError('Maker actor must match Fix Pending editedBy.');
    if (patch.editMode === 'REMARKS_ONLY') throw new RequestValidationError('Remarks-only correction does not use the Excess Amount Fix boundary.');
    const allowedKeys = new Set(['amount', 'editedBy', 'remarks']);
    if (Object.keys(patch).some((key) => !allowedKeys.has(key))) {
      throw new RequestValidationError('Excess Amount Fix may change amount and remarks only; identity, reference, currency and linked fields are protected.');
    }
    const contract = this.contracts.findById(old.balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${old.balanceContractId}`);
    if (this.isA3SCompoundMovement(old, contract) && old.acknowledgedAt) {
      throw new IllegalStateTransitionError(
        `Cannot Fix or Resubmit Amount for A3S movement ${old.movementId} after Checker Acknowledge. ` +
          'The linked Shipping Guarantee redemption, capacity consumption and attribution are already committed.',
      );
    }
    this.requestValidator.assertValidAmount(old.movementType, patch.amount);
    const syntheticMovement = { ...old, amount: patch.amount, ceilingAmount: patch.amount };
    const sgRedemptionAmount = this.prepareA3SFixRedemptionAmount(old, contract, patch.amount);
    const facts = this.deriveCheckerExcessFacts(syntheticMovement, contract, sgRedemptionAmount);
    const policy = this.makerExcessRuntime.policy.resolve(facts.ownerType, control.decisionTime);
    if (
      selectExcessProcessingRoute({
        configuredMaximumUsd: policy.configuredMaximumUsd,
        allowancePercentage: policy.allowancePercentage,
      }) === 'LEGACY_SUFFICIENCY'
    ) {
      const legacySplit = prepareExcessFunctionSplit(facts.splitInput);
      return new SqliteUnitOfWork(this.db).execute(() => {
        const claimed = this.db
          .prepare(
            `SELECT request_hash, response_body FROM command_idempotency
             WHERE command_type = 'FIX_PENDING' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
          )
          .get(movementId, control.actorContext, control.idempotencyKey) as { request_hash: string; response_body: string } | undefined;
        if (claimed) {
          return claimed.request_hash === requestHash
            ? (JSON.parse(claimed.response_body) as MakerExcessFixResult)
            : ({ ok: false, code: 'IDEMPOTENCY_CONFLICT' } as const);
        }
        const accounts = new ExcessAccountStore(this.db);
        const ledger = new ExcessLedgerStore(this.db);
        const account = accounts.getByOwner(facts.ownerType, facts.ownerId);
        if (!account) throw new MakerExcessConcurrencyError('Pending Excess account no longer exists at legacy Fix Pending.');
        const events = ledger.listByAccount(account.excessAccountId).filter((event) => event.movementId === movementId);
        const releasedSources = new Set(events.filter((event) => event.eventType === 'RESERVATION_RELEASE').map((event) => event.sourceExcessEventId));
        const reservations = events.filter((event) => event.eventType === 'PENDING_RESERVATION' && !releasedSources.has(event.excessEventId));
        if (reservations.length !== 1) throw new MakerExcessConcurrencyError('Legacy Fix Pending requires exactly one outstanding reservation.');
        const reservation = reservations[0]!;
        // The existing legacy sufficiency gate runs before any reservation write.
        // An over-capacity replacement throws and the outer transaction preserves
        // both the original movement and reservation.
        const edited = this.editPending(movementId, patch);
        const createdAt = this.now();
        ledger.insert({
          ...reservation,
          excessEventId: randomUUID(),
          eventType: 'RESERVATION_RELEASE',
          sourceExcessEventId: reservation.excessEventId,
          createdBy: control.actorContext,
          createdAt,
        });
        if (!accounts.advanceVersion(account.excessAccountId, account.version, policy.policyVersion, createdAt)) {
          throw new MakerExcessConcurrencyError('Allowance account version changed before legacy Fix Pending commit.');
        }
        const response: MakerExcessFixResult = {
          ok: true,
          movement: edited,
          coveredAmountOwner: legacySplit.coveredAmountOwner,
          excessAmountOwner: '0',
          excessDecision: 'NOT_REQUIRED',
        };
        this.db
          .prepare(
            `INSERT INTO command_idempotency (
              idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
              request_hash, response_status, response_body, created_at
            ) VALUES (?, 'FIX_PENDING', ?, ?, ?, ?, 200, ?, ?)`,
          )
          .run(randomUUID(), movementId, control.actorContext, control.idempotencyKey, requestHash, JSON.stringify(response), createdAt);
        return response;
      });
    }
    const split = prepareExcessFunctionSplit(facts.splitInput);
    const ownerCurrencyPrecision = policy.currencyPrecisions[split.ownerCurrency];
    if (ownerCurrencyPrecision === undefined) throw new Error(`Missing owner-currency precision for ${split.ownerCurrency}.`);
    const fxRequest: CurrencyExchangeRequest = {
      fromCurrency: 'USD',
      toCurrency: split.ownerCurrency,
      amount: policy.configuredMaximumUsd,
      ratePurpose: 'BOOKING',
      decisionTime: control.decisionTime,
      correlationId: movementId,
      policyVersion: policy.policyVersion,
    };
    const fxDecision =
      split.ownerCurrency === 'USD'
        ? usdParDecision(fxRequest)
        : await this.makerExcessRuntime.fx.resolveConfiguredMaximum({
            request: fxRequest,
            commandIdempotencyKey: control.idempotencyKey,
            maxStalenessSeconds: policy.fxMaxStalenessSeconds,
            pbdAuthorization: resolvePbdFallbackAuthorization(policy, control.decisionTime),
          });
    if (!fxDecision.ok) return fxDecision;

    const accounts = new ExcessAccountStore(this.db);
    const ledger = new ExcessLedgerStore(this.db);
    const account = accounts.getByOwner(facts.ownerType, facts.ownerId);
    if (!account) throw new MakerExcessConcurrencyError('Pending Excess account no longer exists at Fix Pending.');
    const effectiveLimitOwner = computeEffectiveAllowanceLimitOwner({
      approvedContractualMaximumOwner: facts.approvedContractualMaximumOwner,
      allowancePercentage: policy.allowancePercentage,
      configuredMaximumOwner: fxDecision.quote.convertedAmount,
      ownerCurrencyPrecision,
    });
    const evaluate = () => {
      const allowance = ledger.aggregateForAccountExcludingMovement(account.excessAccountId, movementId, ownerCurrencyPrecision);
      return {
        allowance,
        result: evaluateOwnerExcessAllowance({
          effectiveLimitOwner,
          approvedUtilizedOwner: allowance.approvedUtilizedOwner,
          otherPendingReservedOwner: allowance.pendingReservedOwner,
          proposedExcessOwner: split.proposedExcessOwner,
          ownerCurrencyPrecision,
        }),
      };
    };
    const limitExceededResult = (allowance: { approvedUtilizedOwner: string; pendingReservedOwner: string }) => ({
      ok: false as const,
      code: 'EXCESS_LIMIT_EXCEEDED' as const,
      guidance: calculateMinimumRequiredIncrease({
        transactionAmountOwner: patch.amount,
        effectiveCapacityOwner: split.coveredAmountOwner,
        approvedContractualMaximumOwner: facts.approvedContractualMaximumOwner,
        allowancePercentage: policy.allowancePercentage,
        configuredMaximumOwner: fxDecision.quote.convertedAmount,
        approvedUtilizedOwner: allowance.approvedUtilizedOwner,
        otherPendingReservedOwner: allowance.pendingReservedOwner,
        ownerCurrencyPrecision,
        capacityGainPerIncrease: '1',
        snapshotTime: control.decisionTime,
        ...(fxDecision.quote.rateOrigin === 'USD_PAR'
          ? {}
          : {
              fxEvidence: {
                rateOrigin: fxDecision.quote.rateOrigin,
                bookingRate: fxDecision.quote.bookingRate,
                providerRateId: fxDecision.quote.providerRateId,
                providerRateVersion: fxDecision.quote.providerRateVersion,
                rateTimestamp: fxDecision.quote.rateTimestamp,
              },
            }),
      }),
    });
    const preflightAllowance = evaluate();
    if (preflightAllowance.result.decision === 'LIMIT_EXCEEDED') return limitExceededResult(preflightAllowance.allowance);

    return new SqliteUnitOfWork(this.db).execute(() => {
      const claimed = this.db
        .prepare(
          `SELECT request_hash, response_body FROM command_idempotency
           WHERE command_type = 'FIX_PENDING' AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
        )
        .get(movementId, control.actorContext, control.idempotencyKey) as { request_hash: string; response_body: string } | undefined;
      if (claimed) {
        return claimed.request_hash === requestHash
          ? (JSON.parse(claimed.response_body) as MakerExcessFixResult)
          : ({ ok: false, code: 'IDEMPOTENCY_CONFLICT' } as const);
      }
      const current = this.movements.findById(movementId);
      if (!current) throw new NotFoundError(`No BalanceMovement ${movementId}`);
      const currentContract = this.contracts.findById(current.balanceContractId);
      if (!currentContract) throw new NotFoundError(`No BalanceContract ${current.balanceContractId}`);
      const currentSgRedemptionAmount = this.prepareA3SFixRedemptionAmount(current, currentContract, patch.amount);
      const currentFacts = this.deriveCheckerExcessFacts(
        { ...current, amount: patch.amount, ceilingAmount: patch.amount },
        currentContract,
        currentSgRedemptionAmount,
      );
      if (currentFacts.factsVersion !== facts.factsVersion) {
        throw new MakerExcessConcurrencyError('Current Excess facts changed before Fix Pending persistence.');
      }
      const lockedAllowance = evaluate();
      if (lockedAllowance.result.decision === 'LIMIT_EXCEEDED') return limitExceededResult(lockedAllowance.allowance);
      const accountAtLock = accounts.getById(account.excessAccountId);
      if (!accountAtLock) throw new MakerExcessConcurrencyError('Pending Excess account disappeared at Fix Pending.');
      const events = ledger.listByAccount(account.excessAccountId).filter((event) => event.movementId === movementId);
      const releasedSources = new Set(events.filter((event) => event.eventType === 'RESERVATION_RELEASE').map((event) => event.sourceExcessEventId));
      const reservations = events.filter((event) => event.eventType === 'PENDING_RESERVATION' && !releasedSources.has(event.excessEventId));
      if (reservations.length !== 1) throw new MakerExcessConcurrencyError('Fix Pending requires exactly one outstanding reservation.');
      const reservation = reservations[0]!;
      const edited = this.editPending(movementId, patch, { allowExcessOverdrawn: true });
      const createdAt = this.now();
      ledger.insert({
        ...reservation,
        excessEventId: randomUUID(),
        eventType: 'RESERVATION_RELEASE',
        sourceExcessEventId: reservation.excessEventId,
        createdBy: control.actorContext,
        createdAt,
      });
      if (new Decimal(split.proposedExcessOwner).gt(0)) {
        ledger.insert({
          excessEventId: randomUUID(),
          excessAccountId: account.excessAccountId,
          movementId,
          eventType: 'PENDING_RESERVATION',
          ownerCurrency: split.ownerCurrency,
          transactionAmountOwner: patch.amount,
          coveredAmountOwner: split.coveredAmountOwner,
          excessAmountOwner: split.proposedExcessOwner,
          amountOwner: split.proposedExcessOwner,
          policyVersion: policy.policyVersion,
          sourceExcessEventId: reservation.excessEventId,
          createdBy: control.actorContext,
          createdAt,
        });
      }
      new FxRateSnapshotStore(this.db).insert({
        fxSnapshotId: randomUUID(),
        movementId,
        decisionPoint: 'FIX_PENDING',
        quote: fxDecision.quote,
        createdAt,
      });
      const excessDecision = new Decimal(split.proposedExcessOwner).isZero() ? ('NOT_REQUIRED' as const) : ('WITHIN_ALLOWANCE' as const);
      new ExcessDecisionSnapshotStore(this.db).insertFix(
        {
          movementId,
          excessAccountId: account.excessAccountId,
          factsVersion: facts.factsVersion,
          ownerCurrency: split.ownerCurrency,
          effectiveLimitOwner,
          excessDecision,
          policySnapshot: policy,
          commandIdempotencyKey: control.idempotencyKey,
          actorContext: control.actorContext,
          decisionTime: control.decisionTime,
        },
        createdAt,
      );
      if (!accounts.advanceVersion(account.excessAccountId, accountAtLock.version, policy.policyVersion, createdAt)) {
        throw new MakerExcessConcurrencyError('Allowance account version changed before Fix Pending commit.');
      }
      const response: MakerExcessFixResult = {
        ok: true,
        movement: edited,
        coveredAmountOwner: split.coveredAmountOwner,
        excessAmountOwner: split.proposedExcessOwner,
        excessDecision,
      };
      this.db
        .prepare(
          `INSERT INTO command_idempotency (
            idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
            request_hash, response_status, response_body, created_at
          ) VALUES (?, 'FIX_PENDING', ?, ?, ?, ?, 200, ?, ?)`,
        )
        .run(randomUUID(), movementId, control.actorContext, control.idempotencyKey, requestHash, JSON.stringify(response), createdAt);
      return response;
    });
  }

  editPending(movementId: string, patch: EditMovementRequest, options: { allowExcessOverdrawn?: boolean } = {}): BalanceMovement {
    const old = this.movements.findById(movementId);
    if (!old) throw new NotFoundError(`No BalanceMovement ${movementId}`);

    applyStatusTransition({ currentStatus: old.status, action: 'EDIT', createdBy: old.createdBy, actingUser: patch.editedBy });

    const contract = this.contracts.findById(old.balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${old.balanceContractId} (owner of movement ${old.movementId})`);

    const isA3SCompound = this.isA3SCompoundMovement(old, contract);
    const isPostAcknowledgeA3S = isA3SCompound && Boolean(old.acknowledgedAt);
    if (isPostAcknowledgeA3S && patch.editMode !== 'REMARKS_ONLY') {
      throw new IllegalStateTransitionError(
        `Cannot Fix or Resubmit Amount for A3S movement ${old.movementId} after Checker Acknowledge. ` +
          'The linked Shipping Guarantee redemption, capacity consumption and attribution are already committed.',
      );
    }

    if (patch.editMode === 'REMARKS_ONLY') {
      const suppliedKeys = Object.keys(patch);
      const allowedKeys = new Set(['amount', 'editedBy', 'editMode', 'remarks']);
      if (suppliedKeys.some((key) => !allowedKeys.has(key))) {
        throw new RequestValidationError('Remarks-only Fix Pending may change remarks only.');
      }
      if (patch.amount !== old.amount) throw new RequestValidationError('Amount cannot be changed in Remarks-only Fix Pending.');
      const remarks = patch.remarks?.trim();
      if (!remarks) throw new RequestValidationError('Remarks is required for Remarks-only Fix Pending.');
      const editedAt = this.now();
      // A Fix Pending save is a resubmission boundary. The audit's after image must match the live
      // movement written below, including REJECTED -> PENDING, so Checker review can resume and the
      // immutable audit never describes a state that did not actually result from this correction.
      const after = { ...old, status: 'PENDING' as const, remarks, editedBy: patch.editedBy, editedAt };
      this.db.exec('SAVEPOINT edit_pending');
      try {
        this.fixPendingAudit.insert({
          auditId: randomUUID(),
          editSeq: this.fixPendingAudit.nextEditSeq(old.movementId),
          movementId: old.movementId,
          balanceContractId: old.balanceContractId,
          eventSeq: old.eventSeq,
          originalCreatedBy: old.createdBy,
          originalCreatedAt: old.createdAt,
          statusBefore: old.status as 'PENDING' | 'REJECTED',
          beforeSnapshot: old as unknown as Record<string, unknown>,
          afterSnapshot: after as unknown as Record<string, unknown>,
          editedBy: patch.editedBy,
          editedAt,
        });
        this.movements.applyRemarksOnlyCorrection({ movementId: old.movementId, remarks, editedBy: patch.editedBy, editedAt });
        this.db.exec('RELEASE SAVEPOINT edit_pending');
        return this.movements.findById(old.movementId)!;
      } catch (err) {
        this.db.exec('ROLLBACK TO SAVEPOINT edit_pending');
        this.db.exec('RELEASE SAVEPOINT edit_pending');
        throw err;
      }
    }

    const isCreatingEdit = !!this.movementTypeRegistry[old.movementType]?.isCreating;

    const isArrivalWithSgCompound = isA3SCompound;

    this.db.exec('SAVEPOINT edit_pending');
    try {
      const result = isArrivalWithSgCompound
        ? this.applyArrivalWithSgCompoundEdit(old, contract, patch, Boolean(options.allowExcessOverdrawn))
        : this.applyEditToMovement(old, contract, patch, isCreatingEdit, Boolean(options.allowExcessOverdrawn));
      this.db.exec('RELEASE SAVEPOINT edit_pending');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK TO SAVEPOINT edit_pending');
      this.db.exec('RELEASE SAVEPOINT edit_pending');
      throw err;
    }
  }

  private isA3SCompoundMovement(movement: BalanceMovement, contract: BalanceContract): boolean {
    if (contract.instrumentType !== 'IPLC_LC' || movement.movementType !== 'UTILIZE' || !movement.businessEventId) return false;
    return this.movements.findByBusinessEventId(movement.businessEventId).some((candidate) => {
      if (candidate.movementId === movement.movementId || (candidate.movementType !== 'FULL_REDEEM' && candidate.movementType !== 'PARTIAL_REDEEM')) {
        return false;
      }
      const candidateContract = this.contracts.findById(candidate.balanceContractId);
      return candidateContract?.instrumentType === 'SHGT' && candidateContract.parentLogicalContractId === contract.logicalContractId;
    });
  }

  private resolveLinkedA3SRedemption(movement: BalanceMovement, contract: BalanceContract): BalanceMovement | undefined {
    if (!this.isA3SCompoundMovement(movement, contract)) return undefined;
    const linked = this.movements.findByBusinessEventId(movement.businessEventId!).filter((candidate) => {
      if (candidate.movementId === movement.movementId || candidate.status !== 'PENDING') return false;
      if (candidate.movementType !== 'FULL_REDEEM' && candidate.movementType !== 'PARTIAL_REDEEM') return false;
      const candidateContract = this.contracts.findById(candidate.balanceContractId);
      return candidateContract?.instrumentType === 'SHGT' && candidateContract.parentLogicalContractId === contract.logicalContractId;
    });
    if (linked.length !== 1) {
      throw new MakerExcessConcurrencyError(
        'A3S Checker Acknowledge requires exactly one linked Pending Shipping Guarantee redemption owned by the same Import LC.',
      );
    }
    return linked[0]!;
  }

  private commitA3SCheckerEffects(linkedSgRedemptionId: string, checkerContext: string): void {
    this.release(linkedSgRedemptionId, checkerContext);
  }

  private insertCheckerAcknowledgeIdempotency(
    movementId: string,
    control: A3CheckerExcessControl,
    response: A3CheckerAcknowledgeResult,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO command_idempotency (
          idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
          request_hash, response_status, response_body, created_at
        ) VALUES (?, 'CHECKER_ACKNOWLEDGE', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        movementId,
        control.checkerContext,
        control.idempotencyKey,
        canonicalHash({ movementId, action: 'CHECKER_ACKNOWLEDGE' }),
        'ok' in response && !response.ok ? 409 : 200,
        JSON.stringify(response),
        createdAt,
      );
  }

  private prepareA3SFixRedemptionAmount(movement: BalanceMovement, contract: BalanceContract, newArrivalAmount: string): string | undefined {
    if (!this.isA3SCompoundMovement(movement, contract)) return undefined;
    const linked = this.movements.findByBusinessEventId(movement.businessEventId!).filter((candidate) => {
      if (candidate.status !== 'PENDING' || (candidate.movementType !== 'FULL_REDEEM' && candidate.movementType !== 'PARTIAL_REDEEM')) return false;
      const candidateContract = this.contracts.findById(candidate.balanceContractId);
      return candidateContract?.instrumentType === 'SHGT' && candidateContract.parentLogicalContractId === contract.logicalContractId;
    });
    if (linked.length !== 1) throw new MakerExcessConcurrencyError('A3S Fix requires exactly one linked Pending SG redemption owned by the same Import LC.');
    const linkedSg = linked[0]!;
    const sgMovements = this.movements.listByContract(linkedSg.balanceContractId).filter((candidate) => candidate.movementId !== linkedSg.movementId);
    const sgConfirmed = computeConfirmedBalance(sgMovements);
    return Decimal.max(0, Decimal.min(parseMonetaryAmount(newArrivalAmount), sgConfirmed)).toFixed();
  }

  private applyEditToMovement(
    old: BalanceMovement,
    contract: BalanceContract,
    patch: EditMovementRequest,
    isCreatingEdit: boolean,
    allowExcessOverdrawn = false,
  ): BalanceMovement {
    const merged = this.buildEditedRequest(old, contract, patch, isCreatingEdit);

    this.requestValidator.assertValidAmount(merged.movementType, merged.amount);
    // Validate scale here because the edit payload omits the contract's locked currency.
    const scaleViolation = describeAmountScaleViolation(merged.amount, contract.currency);
    if (scaleViolation) throw new RequestValidationError(scaleViolation);
    this.requestValidator.assertReasonCodeRequired(merged.movementType, merged.reasonCode);
    this.requestValidator.assertTenorRequired(merged); // reflects the PATCHED tenorType/tenorDays when isCreatingEdit; trivially satisfied (carried-over, already-valid) otherwise
    this.requestValidator.assertExpiryDateRequired(merged); // both already gate on movementType === 'ISSUE' internally — a no-op for a non-creating edit (e.g. A3's own UTILIZE) regardless of isCreatingEdit
    this.requestValidator.assertExpiryDateIsBusinessDay(merged);
    this.requestValidator.assertToleranceNonNegative(merged.tolerancePct); // reflects the PATCHED value when isCreatingEdit (A1/B1 only); carried-over/already-valid otherwise, same posture as assertTenorRequired() above
    this.requestValidator.assertToleranceAllowed(merged.movementType, merged.tolerancePct);
    this.requestValidator.assertToleranceChangeAllowed(merged.movementType, merged.tolerancePct, merged.toleranceChangePct, merged.toleranceChangeDirection);

    const existingMovements = this.movements.listByContract(contract.balanceContractId).filter((m) => m.movementId !== old.movementId);
    this.requestValidator.assertMonetaryAmendmentChangesTerms(merged.movementType, merged.amount, merged.toleranceChangePct, contract.tolerancePct);
    const ceilingAmount = this.deriveMovementCeilingAmount(merged, contract, existingMovements);

    const descriptor = this.movementTypeRegistry[merged.movementType];
    if (!descriptor) throw new RequestValidationError(`Unrecognized movementType "${merged.movementType}" for instrumentType ${merged.instrumentType}.`);
    const confirmed = computeConfirmedBalance(existingMovements);
    const available = computeAvailableBalance(confirmed, existingMovements);
    const sufficiency = descriptor.checkSufficiency({
      contract,
      existingMovements,
      confirmedBalance: confirmed,
      availableBalance: available,
      ceilingAmount,
      req: merged,
      excludeMovementId: old.movementId,
    });
    if (sufficiency && !sufficiency.ok && !allowExcessOverdrawn) throw new InsufficientBalanceError(sufficiency.error);
    const warnings: MovementWarning[] | null = sufficiency?.ok && sufficiency.warning ? [sufficiency.warning] : null;

    // Book the same tolerance-adjusted ceiling applied to confirmed balance.
    const contingentAccountEntry = deriveContingentAccountEntry({
      instrumentType: contract.instrumentType,
      movementType: merged.movementType,
      amount: ceilingAmount.toFixed(),
      currency: contract.currency,
      tenorType: merged.tenorType, // the PATCHED tenor when isCreatingEdit — a Sight->Usance Fix Pending edit must produce the correspondingly-worded Dr/Cr pair, not the pre-edit one
      accountMapping: this.accountMappingFor(contract, merged.tenorType),
    });

    const editedAt = this.now();
    const correction = {
      businessEventId: merged.businessEventId ?? null,
      exposureNature: merged.exposureNature ?? old.exposureNature,
      amount: merged.amount,
      ceilingAmount: ceilingAmount.toFixed(),
      tolerancePct: this.correctedTolerancePct(merged, contract),
      toleranceChangePct: MONETARY_AMENDMENT_TYPES.has(merged.movementType) ? (merged.toleranceChangePct ?? null) : null,
      toleranceChangeDirection: MONETARY_AMENDMENT_TYPES.has(merged.movementType) ? (merged.toleranceChangeDirection ?? null) : null,
      legRef: merged.legRef ?? null,
      accountEntries: merged.exposureNature === 'MEMO' ? null : (merged.accountEntries ?? null),
      contingentAccountEntry,
      reasonCode: merged.reasonCode ?? null,
      warnings,
      newExpiryDate: merged.newExpiryDate ?? null,
      transactionDate: merged.transactionDate ?? null,
      businessDate: merged.businessDate ?? null,
      valueDate: merged.valueDate ?? null,
      sourceModule: merged.sourceModule ?? null,
      sourceFunction: merged.sourceFunction ?? null,
      referencedTransactionId: merged.referencedTransactionId ?? null,
      amendmentApproved: merged.amendmentApproved ?? null,
      amendmentEffective: merged.amendmentEffective ?? null,
      consentStatus: merged.consentStatus ?? null,
    };

    if (isCreatingEdit) {
      // Contract and movement corrections commit or roll back together.
      this.contracts.updateIssueFields(contract.balanceContractId, {
        tolerancePct: merged.tolerancePct,
        tenorType: merged.tenorType,
        tenorDays: merged.tenorDays,
        expiryDate: merged.expiryDate,
        mailFloatGraceDays: patch.mailFloatGraceDays,
      });
    }

    // Fix Pending changes the CURRENT content of the same movement identity, so its persisted Event
    // Snapshot must describe that corrected PENDING movement immediately. Waiting until Checker Release
    // leaves Inquire Events showing the pre-edit balance (for example 11,000 instead of the corrected
    // 22,000 net Pending Earmark). Reload the contract because an ISSUE edit above may also have changed
    // its tolerance/tenor/expiry fields inside this same transaction.
    const snapshotContract = this.contracts.findById(contract.balanceContractId) ?? contract;
    const correctedMovement: BalanceMovement = {
      ...old,
      ...correction,
      status: 'PENDING',
      createdBy: patch.editedBy,
      createdAt: editedAt,
      editedBy: patch.editedBy,
      editedAt,
    };
    const snapshotBundle = this.movementSnapshots.captureBundle(snapshotContract, [...existingMovements, correctedMovement], correctedMovement);
    const correctionWithSnapshots = { ...correction, ...snapshotBundle };

    // Persist the original content before correcting the movement in place.
    this.fixPendingAudit.insert({
      auditId: randomUUID(),
      editSeq: this.fixPendingAudit.nextEditSeq(old.movementId),
      movementId: old.movementId,
      balanceContractId: old.balanceContractId,
      eventSeq: old.eventSeq,
      originalCreatedBy: old.createdBy,
      originalCreatedAt: old.createdAt,
      statusBefore: old.status as 'PENDING' | 'REJECTED', // applyStatusTransition() above guarantees this
      beforeSnapshot: old as unknown as Record<string, unknown>,
      afterSnapshot: correctionWithSnapshots as unknown as Record<string, unknown>,
      editedBy: patch.editedBy,
      editedAt,
    });
    this.movements.applyFixPendingCorrection({
      movementId: old.movementId,
      ...correctionWithSnapshots,
      createdBy: patch.editedBy,
      createdAt: editedAt,
      editedBy: patch.editedBy,
      editedAt,
    });

    return this.movements.findById(old.movementId)!;
  }

  private applyArrivalWithSgCompoundEdit(
    old: BalanceMovement,
    contract: BalanceContract,
    patch: EditMovementRequest,
    allowExcessOverdrawn = false,
  ): BalanceMovement {
    const businessEventId = old.businessEventId!;
    const siblings = this.movements
      .findByBusinessEventId(businessEventId)
      .filter((m) => m.movementId !== old.movementId && m.status === 'PENDING' && (m.movementType === 'FULL_REDEEM' || m.movementType === 'PARTIAL_REDEEM'));
    if (siblings.length !== 1) {
      throw new RequestValidationError(
        `Fix Pending for this Document Arrival w/ Shipping Gtee (A3S) event expected exactly one linked, still-PENDING Shipping Guarantee redemption sharing businessEventId ${businessEventId} — found ${siblings.length}. This compound record cannot be safely Fix-Pending-edited.`,
      );
    }
    const oldSg = siblings[0]!; // length check above guarantees exactly one element
    const sgContract = this.contracts.findById(oldSg.balanceContractId);
    if (!sgContract) throw new NotFoundError(`No BalanceContract ${oldSg.balanceContractId} (owner of linked SG redemption ${oldSg.movementId})`);
    if (sgContract.instrumentType !== 'SHGT' || sgContract.parentLogicalContractId !== contract.logicalContractId) {
      throw new RequestValidationError('A3S Fix linked Shipping Guarantee must be owned by the same Import LC.');
    }

    const newUtilizeAmount = parseMonetaryAmount(patch.amount ?? old.amount);
    const sgExistingExcludingOld = this.movements.listByContract(sgContract.balanceContractId).filter((m) => m.movementId !== oldSg.movementId);
    const sgConfirmed = computeConfirmedBalance(sgExistingExcludingOld);
    const newSgRedeemAmount = Decimal.max(new Decimal(0), Decimal.min(newUtilizeAmount, sgConfirmed));
    const newSgMovementType: 'FULL_REDEEM' | 'PARTIAL_REDEEM' = newSgRedeemAmount.greaterThanOrEqualTo(sgConfirmed) ? 'FULL_REDEEM' : 'PARTIAL_REDEEM';

    this.requestValidator.assertValidAmount(newSgMovementType, newSgRedeemAmount.toFixed());
    const sgAvailable = computeAvailableBalance(sgConfirmed, sgExistingExcludingOld);
    const sgCheck = checkRedeemSufficiency({ redeemAmount: newSgRedeemAmount, sgAvailableBalance: sgAvailable });
    if (!sgCheck.ok) throw new InsufficientBalanceError(sgCheck.error);

    const sgContingentEntry = deriveContingentAccountEntry({
      instrumentType: 'SHGT',
      movementType: newSgMovementType,
      amount: newSgRedeemAmount.toFixed(),
      currency: sgContract.currency,
      tenorType: this.accountingTenorFor(sgContract),
      accountMapping: this.accountMappingFor(sgContract),
    });

    const editedAt = this.now();
    const sgCorrection = {
      businessEventId, // oldSg was found VIA this exact non-null value (findByBusinessEventId), never a fallback
      exposureNature: oldSg.exposureNature,
      amount: newSgRedeemAmount.toFixed(),
      ceilingAmount: newSgRedeemAmount.toFixed(), // SHGT is never tolerance-applicable — ceiling === amount, same as every other SHGT movement in this codebase
      tolerancePct: null,
      legRef: oldSg.legRef ?? null,
      accountEntries: oldSg.accountEntries ?? null,
      contingentAccountEntry: sgContingentEntry,
      reasonCode: oldSg.reasonCode ?? null,
      warnings: null as MovementWarning[] | null,
      newExpiryDate: null,
      transactionDate: oldSg.transactionDate ?? null,
      businessDate: oldSg.businessDate ?? null,
      valueDate: oldSg.valueDate ?? null,
      sourceModule: oldSg.sourceModule ?? null,
      sourceFunction: oldSg.sourceFunction ?? null,
      referencedTransactionId: oldSg.referencedTransactionId ?? null,
      amendmentApproved: oldSg.amendmentApproved ?? null,
      amendmentEffective: oldSg.amendmentEffective ?? null,
      consentStatus: oldSg.consentStatus ?? null,
    };

    const correctedSgMovement: BalanceMovement = {
      ...oldSg,
      ...sgCorrection,
      movementType: newSgMovementType,
      status: 'PENDING',
      createdBy: patch.editedBy,
      createdAt: editedAt,
      editedBy: patch.editedBy,
      editedAt,
    };
    const sgSnapshotBundle = this.movementSnapshots.captureBundle(sgContract, [...sgExistingExcludingOld, correctedSgMovement], correctedSgMovement);
    const sgCorrectionWithSnapshots = { ...sgCorrection, ...sgSnapshotBundle };

    this.movements.setMovementType(oldSg.movementId, newSgMovementType);

    this.fixPendingAudit.insert({
      auditId: randomUUID(),
      editSeq: this.fixPendingAudit.nextEditSeq(oldSg.movementId),
      movementId: oldSg.movementId,
      balanceContractId: oldSg.balanceContractId,
      eventSeq: oldSg.eventSeq,
      originalCreatedBy: oldSg.createdBy,
      originalCreatedAt: oldSg.createdAt,
      statusBefore: oldSg.status as 'PENDING' | 'REJECTED',
      beforeSnapshot: oldSg as unknown as Record<string, unknown>,
      afterSnapshot: { ...sgCorrectionWithSnapshots, movementType: newSgMovementType } as unknown as Record<string, unknown>,
      editedBy: patch.editedBy,
      editedAt,
    });
    this.movements.applyFixPendingCorrection({
      movementId: oldSg.movementId,
      ...sgCorrectionWithSnapshots,
      toleranceChangePct: null,
      toleranceChangeDirection: null,
      createdBy: patch.editedBy,
      createdAt: editedAt,
      editedBy: patch.editedBy,
      editedAt,
    });

    return this.applyEditToMovement(old, contract, patch, false, allowExcessOverdrawn);
  }

  private buildEditedRequest(old: BalanceMovement, contract: BalanceContract, patch: EditMovementRequest, isCreatingEdit: boolean): CreateMovementRequest {
    return {
      instrumentType: contract.instrumentType,
      balanceContractId: contract.balanceContractId,
      movementType: old.movementType,
      eventSeq: old.eventSeq,
      amount: patch.amount,
      currency: contract.currency,
      legRef: patch.legRef,
      accountEntries: patch.accountEntries,
      businessEventId: patch.businessEventId ?? old.businessEventId,
      exposureNature: patch.exposureNature,
      tolerancePct: old.movementType === 'ISSUE' ? (patch.tolerancePct ?? contract.tolerancePct) : null,
      toleranceChangePct: MONETARY_AMENDMENT_TYPES.has(old.movementType) ? (patch.toleranceChangePct ?? old.toleranceChangePct) : null,
      toleranceChangeDirection: MONETARY_AMENDMENT_TYPES.has(old.movementType) ? (patch.toleranceChangeDirection ?? old.toleranceChangeDirection) : null,
      tenorType: creatingOnly(isCreatingEdit, patch.tenorType, contract.tenorType),
      tenorDays: creatingOnly(isCreatingEdit, patch.tenorDays, contract.tenorDays),
      expiryDate: creatingOnly(isCreatingEdit, patch.expiryDate, contract.expiryDate),
      maturityDate: contract.maturityDate,
      newExpiryDate: patch.newExpiryDate,
      transactionDate: patch.transactionDate,
      businessDate: patch.businessDate,
      valueDate: patch.valueDate,
      sourceModule: patch.sourceModule,
      sourceFunction: patch.sourceFunction,
      sourceTransactionRef: old.sourceTransactionRef,
      referencedTransactionId: patch.referencedTransactionId,
      reasonCode: patch.reasonCode,
      amendmentApproved: patch.amendmentApproved,
      amendmentEffective: patch.amendmentEffective,
      consentStatus: patch.consentStatus,
      createdBy: patch.editedBy,
    };
  }

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
        if (this.isA3SCompoundMovement(movement, contract)) {
          this.requestValidator.assertA3SBillCoversShippingGuarantee(movement.businessEventId as string, movement.amount);
        }
        // Acknowledgement bypasses status transition, so enforce maker-checker separation explicitly.
        assertMakerCheckerSeparation(movement.createdBy, acknowledgedBy, 'ACKNOWLEDGE');
      },
      alreadyDoneAt: (movement) => movement.acknowledgedAt,
      alreadyDoneBy: (movement) => movement.acknowledgedBy,
      persist: (id, now) => this.movements.acknowledge({ movementId: id, acknowledgedBy, acknowledgedAt: now }),
    });
  }

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
        if (contract.status !== 'ACTIVE' || (contract.tenorType && contract.tenorType !== 'SIGHT')) {
          throw new IllegalStateTransitionError(`Movement ${movementId} is not eligible for A4 — select a PENDING Document Arrival under an ACTIVE Sight LC.`);
        }
      },
      alreadyDoneAt: (movement) => movement.makerSubmittedAt,
      alreadyDoneBy: (movement) => movement.makerSubmittedBy,
      persist: (id, now) => this.movements.submitByMaker({ movementId: id, makerSubmittedBy, makerSubmittedAt: now }),
    });
  }

  withdrawMakerSubmit(movementId: string, withdrawnBy: string): BalanceMovement {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    const contract = this.contracts.findById(movement.balanceContractId);
    if (!contract || contract.instrumentType !== 'IPLC_LC' || movement.movementType !== 'UTILIZE') {
      throw new RequestValidationError(
        `withdrawMakerSubmit() only applies to an IPLC_LC UTILIZE movement (A4 Sight Settlement) — ` +
          `movement ${movementId} is ${contract?.instrumentType ?? 'unknown'}/${movement.movementType}.`,
      );
    }
    if (movement.status !== 'PENDING' && movement.status !== 'REJECTED') {
      throw new IllegalStateTransitionError(
        `Cannot withdraw Maker Submit for movement ${movementId} — its status is ${movement.status}, not PENDING or REJECTED.`,
      );
    }
    if (!movement.makerSubmittedAt) {
      throw new IllegalStateTransitionError(`Movement ${movementId} was never Maker-Submitted (A4) — nothing to withdraw.`);
    }
    const statusBefore = movement.status;
    const withdrawnAt = this.now();
    this.movements.withdrawMakerSubmit(movementId, movement.status === 'REJECTED');
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
      cancelledBy: withdrawnBy,
      cancelledAt: withdrawnAt,
      reasonCode: 'MAKER_EC',
      remarks: null,
    });
    return this.movements.findById(movementId)!;
  }

  private accountingTenorFor(contract: BalanceContract, override?: TenorType | null): TenorType | null {
    if (override) return override;
    if (contract.instrumentType === 'SHGT' && contract.parentLogicalContractId) {
      return this.contracts.findActiveByLogicalContractId(contract.parentLogicalContractId)?.tenorType ?? null;
    }
    return contract.tenorType ?? null;
  }

  private accountMappingFor(contract: BalanceContract, overrideTenor?: TenorType | null) {
    return this.accountMappings.findFor(contract.instrumentType, this.accountingTenorFor(contract, overrideTenor)) ?? null;
  }

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
}
