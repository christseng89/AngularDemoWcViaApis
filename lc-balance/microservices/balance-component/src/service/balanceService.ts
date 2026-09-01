/** Coordinates domain policies and persistence for HTTP use cases. Business math stays in `domain/`. */
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { describeAmountScaleViolation, parseMonetaryAmount } from '../money';
import type { Db } from '../db';
import { BalanceContractStore, CatalogFilter, CatalogPage } from '../store/balanceContractStore';
import { BalanceMovementStore } from '../store/balanceMovementStore';
import { DeletePendingAuditStore } from '../store/deletePendingAuditStore';
import { FixPendingAuditStore } from '../store/fixPendingAuditStore';
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
import { MovementReleasePolicyService } from './movementReleasePolicyService';
import { MovementReleaseSideEffectService } from './movementReleaseSideEffectService';
import { MovementContractService } from './movementContractService';
import { IllegalStateTransitionError, InsufficientBalanceError, NotFoundError, RequestValidationError } from '../errors';
import type {
  AccountEntry,
  BalanceContract,
  BalanceMovement,
  BalanceSnapshot,
  DeletePendingAuditWithContract,
  ExposureNature,
  FixPendingAuditRecord,
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

  constructor(
    db: Db,
    private readonly now: () => string = () => new Date().toISOString(),
    stores: BalanceServiceStores = createSqliteBalanceServiceStores(db),
  ) {
    this.db = db;
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
    this.releasePolicy = new MovementReleasePolicyService(
      this.movements,
      this.contracts,
      this.requestValidator,
      this.lifecycleEligibility,
      (movementType) => !!this.movementTypeRegistry[movementType]?.isCreating,
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

    /** B2 AMEND encodes direction by sign; only a negative amount runs the decrease check. */
    const amendShaped: MovementSufficiencyCheck = (ctx) => (ctx.ceilingAmount.isNegative() ? this.checkDecreaseShapedSufficiency(ctx) : null);
    const decreaseShaped: MovementSufficiencyCheck = (ctx) => this.checkDecreaseShapedSufficiency(ctx);
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
      if (ctx.existingMovements.some((m) => m.movementType === 'REVERSAL' && m.reversalOfMovementId === targetId)) {
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

  /** A2/B2 decreases are capped by the same Tight Available Balance exposed in snapshots. */
  private checkDecreaseShapedSufficiency(ctx: MovementSufficiencyContext): MovementSufficiencyOutcome {
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

  resolveContract(instrumentType: InstrumentType, naturalKey: NaturalKey, includeAnyStatus = false): BalanceContract | undefined {
    return this.queries.resolveContract(instrumentType, naturalKey, includeAnyStatus);
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

  createMovement(req: CreateMovementRequest): CreateMovementResult {
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

    const contract = this.movementContracts.resolveOrCreate(req);

    const existing = this.movements.findByContractAndEventSeq(contract.balanceContractId, req.eventSeq);
    if (existing) return { created: false, existing };

    if (req.movementType === 'REOPEN') {
      const restoreAmount = computeReopenRestoreAmount(this.movements.listByContract(contract.balanceContractId));
      req = { ...req, amount: restoreAmount.toFixed() };
      this.requestValidator.assertValidAmount(req.movementType, req.amount);
    }

    const ceilingAmount = computeCeilingAmount(req.amount, contract.tolerancePct, req.movementType, contract.instrumentType, contract.currency);

    const existingMovements = this.movements.listByContract(contract.balanceContractId);

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
    if (sufficiency && !sufficiency.ok) throw new InsufficientBalanceError(sufficiency.error);
    const warnings: MovementWarning[] | null = sufficiency?.warning ? [sufficiency.warning] : null;

    let reversedDirection: 1 | -1 | undefined;
    if (req.movementType === 'REVERSAL' && req.reversalOfMovementId) {
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

    const snapshotBundle = this.movementSnapshots.captureBundle(contract, [...existingMovements, movement], movement);
    movement.eventSnapshot = snapshotBundle.eventSnapshot;
    movement.rootEventSnapshot = snapshotBundle.rootEventSnapshot;
    movement.acceptanceEventSnapshot = snapshotBundle.acceptanceEventSnapshot;
    movement.sgEventSnapshot = snapshotBundle.sgEventSnapshot;

    const result = this.movements.insert(movement);
    if (!result.created) return { created: false, existing: result.existing };
    this.applyCreateSideEffects(movement);
    return { created: true, movement };
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
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);

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
    this.releasePolicy.assertEligibility(movement, contract, before);

    const releasedAt = this.now();
    const after =
      movement.movementType === 'REVERSAL'
        ? computeConfirmedBalance(
            this.movements
              .listByContract(contract.balanceContractId)
              .map((m) => (m.movementId === movement.movementId ? { ...m, status: 'RELEASED' as const } : m)),
          )
        : before.plus(computeConfirmedBalance([{ ...movement, status: 'RELEASED' }]));

    const releasedSelf = { ...movement, status: 'RELEASED' as const };
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
      releasedBy,
      releasedAt,
      balanceBefore: before.toFixed(),
      balanceAfter: after.toFixed(),
      rootEventSnapshot: snapshotBundle.rootEventSnapshot ? JSON.stringify(snapshotBundle.rootEventSnapshot) : null,
      ...snapshotFields,
    });

    this.releaseSideEffects.applyStandard(movement, contract, releasedBy, releasedAt);
    this.releaseSideEffects.applyExpiryAmendment(movement, contract, releasedBy, releasedAt);

    return this.movements.findById(movementId)!;
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
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    if (movement.acknowledgedAt && movement.status === 'PENDING') {
      throw new IllegalStateTransitionError(
        `Cannot Delete Pending ${movementId} — already Checker-acknowledged (EARMARKED) and still awaiting a final A4/A6 decision. Reject it via A4/A6 first (re-enables Delete Pending), then retry.`,
      );
    }
    applyStatusTransition({ currentStatus: movement.status, action: 'CANCEL', createdBy: movement.createdBy, actingUser: cancelledBy });
    // The status policy already limits cancellation to PENDING or REJECTED.
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
    this.applyCancelSideEffects(movement);
    if (this.movementTypeRegistry[movement.movementType]?.isCreating) {
      const siblingMovements = this.movements.listByContract(movement.balanceContractId).filter((m) => m.movementId !== movementId);
      if (siblingMovements.length === 0) {
        this.contracts.markCancelled(movement.balanceContractId, cancelledAt);
      }
    }
    return this.movements.findById(movementId)!;
  }

  editPending(movementId: string, patch: EditMovementRequest): BalanceMovement {
    const old = this.movements.findById(movementId);
    if (!old) throw new NotFoundError(`No BalanceMovement ${movementId}`);

    applyStatusTransition({ currentStatus: old.status, action: 'EDIT', createdBy: old.createdBy, actingUser: patch.editedBy });

    const contract = this.contracts.findById(old.balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${old.balanceContractId} (owner of movement ${old.movementId})`);

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
      const after = { ...old, remarks, editedBy: patch.editedBy, editedAt };
      this.db.exec('BEGIN');
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
        this.db.exec('COMMIT');
        return this.movements.findById(old.movementId)!;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }

    const isCreatingEdit = !!this.movementTypeRegistry[old.movementType]?.isCreating;

    const isArrivalWithSgCompound = contract.instrumentType === 'IPLC_LC' && old.movementType === 'UTILIZE' && !!old.businessEventId;

    this.db.exec('BEGIN');
    try {
      const result = isArrivalWithSgCompound
        ? this.applyArrivalWithSgCompoundEdit(old, contract, patch)
        : this.applyEditToMovement(old, contract, patch, isCreatingEdit);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private applyEditToMovement(old: BalanceMovement, contract: BalanceContract, patch: EditMovementRequest, isCreatingEdit: boolean): BalanceMovement {
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

    const ceilingAmount = computeCeilingAmount(merged.amount, merged.tolerancePct, merged.movementType, merged.instrumentType, contract.currency);
    const existingMovements = this.movements.listByContract(contract.balanceContractId).filter((m) => m.movementId !== old.movementId);


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
    if (sufficiency && !sufficiency.ok) throw new InsufficientBalanceError(sufficiency.error);
    const warnings: MovementWarning[] | null = sufficiency?.warning ? [sufficiency.warning] : null;

    // Book the same tolerance-adjusted ceiling applied to confirmed balance.
    const contingentAccountEntry = deriveContingentAccountEntry({
      instrumentType: contract.instrumentType,
      movementType: merged.movementType,
      amount: ceilingAmount.toFixed(),
      currency: contract.currency,
      tenorType: merged.tenorType, // the PATCHED tenor when isCreatingEdit — a Sight->Usance Fix Pending edit must produce the correspondingly-worded Dr/Cr pair, not the pre-edit one
    });

    const editedAt = this.now();
    const correction = {
      businessEventId: merged.businessEventId ?? null,
      exposureNature: merged.exposureNature ?? old.exposureNature,
      amount: merged.amount,
      ceilingAmount: ceilingAmount.toFixed(),
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
      afterSnapshot: correction as unknown as Record<string, unknown>,
      editedBy: patch.editedBy,
      editedAt,
    });
    this.movements.applyFixPendingCorrection({
      movementId: old.movementId,
      ...correction,
      createdBy: patch.editedBy,
      createdAt: editedAt,
      editedBy: patch.editedBy,
      editedAt,
    });

    return this.movements.findById(old.movementId)!;
  }

  private applyArrivalWithSgCompoundEdit(old: BalanceMovement, contract: BalanceContract, patch: EditMovementRequest): BalanceMovement {
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
      tenorType: null,
    });

    const editedAt = this.now();
    const sgCorrection = {
      businessEventId, // oldSg was found VIA this exact non-null value (findByBusinessEventId), never a fallback
      exposureNature: oldSg.exposureNature,
      amount: newSgRedeemAmount.toFixed(),
      ceilingAmount: newSgRedeemAmount.toFixed(), // SHGT is never tolerance-applicable — ceiling === amount, same as every other SHGT movement in this codebase
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
      afterSnapshot: { ...sgCorrection, movementType: newSgMovementType } as unknown as Record<string, unknown>,
      editedBy: patch.editedBy,
      editedAt,
    });
    this.movements.applyFixPendingCorrection({
      movementId: oldSg.movementId,
      ...sgCorrection,
      createdBy: patch.editedBy,
      createdAt: editedAt,
      editedBy: patch.editedBy,
      editedAt,
    });

    return this.applyEditToMovement(old, contract, patch, false);
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
      tolerancePct: patch.tolerancePct ?? contract.tolerancePct,
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
        if (movement.businessEventId) this.requestValidator.assertA3SBillCoversShippingGuarantee(movement.businessEventId, movement.amount);
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
          throw new IllegalStateTransitionError(
            `Movement ${movementId} is not eligible for A4 — select a PENDING Document Arrival under an ACTIVE Sight LC.`,
          );
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
