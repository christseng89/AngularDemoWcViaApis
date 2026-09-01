import { randomUUID } from 'crypto';
import { MAIL_FLOAT_GRACE_DAYS } from '../config';
import { checkAcceptanceTenorConsistency } from '../domain/tenorRouting';
import { CurrencyMismatchError, IllegalStateTransitionError, NaturalKeyAlreadyExistsError, NotFoundError, RequestValidationError } from '../errors';
import type { BalanceContractStore } from '../store/balanceContractStore';
import type { BalanceMovementStore } from '../store/balanceMovementStore';
import type { BalanceContract } from '../types';
import type { CreateMovementRequest } from './balanceService';
import { ROOT_INSTRUMENT_TYPES } from './movementRequestValidator';

export interface NewContractPolicyPort {
  isCreatingMovement(movementType: string): boolean;
  assertCreationSufficiency(request: CreateMovementRequest): void;
}

/** Resolves or creates the contract targeted by a movement command. */
export class MovementContractService {
  constructor(
    private readonly contracts: BalanceContractStore,
    private readonly movements: BalanceMovementStore,
    private readonly policies: NewContractPolicyPort,
    private readonly now: () => string,
    private readonly newId: () => string = randomUUID,
  ) {}

  resolveOrCreate(req: CreateMovementRequest): BalanceContract {
    const contract = this.resolve(req);
    if (contract && req.naturalKey && this.policies.isCreatingMovement(req.movementType)) {
      throw new NaturalKeyAlreadyExistsError(
        `An ACTIVE ${req.instrumentType} already exists for natural key ${JSON.stringify(req.naturalKey)} ` +
          `(balanceContractId ${contract.balanceContractId}) — cannot ${req.movementType} again. ` +
          `Use AMEND_INCREASE/AMEND_DECREASE${req.instrumentType === 'EPLC_CONFIRMATION' ? '/AMEND' : ''} to change it instead.`,
      );
    }

    if (contract && ROOT_INSTRUMENT_TYPES.has(contract.instrumentType) && req.movementType !== 'ISSUE') {
      this.assertRootIssueReleased(contract, `process a ${req.movementType} event`);
    }
    if (contract) this.assertContractStatusEligible(contract, req.movementType);
    this.assertReferencedTransactionEligible(req, contract);
    if (contract && req.currency !== contract.currency) {
      throw new CurrencyMismatchError(
        `Supplied currency "${req.currency}" does not match this contract's own currency "${contract.currency}" ` +
          `(balanceContractId ${contract.balanceContractId}).`,
      );
    }
    if (contract) return contract;

    this.assertMayCreate(req);
    this.assertParentReady(req);
    this.assertAcceptanceTenor(req);
    this.policies.assertCreationSufficiency(req);
    return this.create(req);
  }

  private resolve(req: CreateMovementRequest): BalanceContract | undefined {
    if (req.balanceContractId) return this.contracts.findById(req.balanceContractId);
    if (!req.naturalKey) return undefined;

    const active = this.contracts.findActiveByNaturalKey(req.instrumentType, req.naturalKey);
    if (active) return active;
    if (req.movementType === 'AMEND_EXPIRY_DATE') {
      return this.contracts.findExpiredByNaturalKey(req.instrumentType, req.naturalKey);
    }
    if (req.movementType === 'REOPEN') {
      return this.contracts.findClosedByNaturalKey(req.instrumentType, req.naturalKey);
    }
    return undefined;
  }

  private assertMayCreate(req: CreateMovementRequest): void {
    if (!req.naturalKey) throw new RequestValidationError('naturalKey or balanceContractId is required.');
    if (!this.policies.isCreatingMovement(req.movementType)) {
      throw new NotFoundError(`No ${req.instrumentType} Logical Contract for this natural key yet — only ISSUE/CREATE may implicitly create one.`);
    }
  }

  private assertParentReady(req: CreateMovementRequest): void {
    if (!req.parentLogicalContractId) return;
    const parent = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
    if (!parent) {
      throw new RequestValidationError(
        `Cannot create ${req.instrumentType} — parent logical contract ${req.parentLogicalContractId} was not found or not ACTIVE.`,
      );
    }
    this.assertRootIssueReleased(parent, `create a new ${req.instrumentType} under it`);
    if (req.currency !== parent.currency) {
      throw new CurrencyMismatchError(
        `Supplied currency "${req.currency}" does not match the parent contract's own currency ` +
          `"${parent.currency}" (parentLogicalContractId ${req.parentLogicalContractId}).`,
      );
    }
  }

  /** Mirrors the Transaction Index status gate for direct API callers. */
  private assertContractStatusEligible(contract: BalanceContract, movementType: string): void {
    if (movementType === 'REOPEN' || movementType === 'REVERSAL') return;
    if (movementType === 'CLOSE' && (contract.status === 'ACTIVE' || contract.status === 'EXPIRED')) return;
    if (movementType === 'AMEND_EXPIRY_DATE') {
      if (contract.status === 'ACTIVE' || contract.status === 'EXPIRED') return;
      throw new IllegalStateTransitionError(
        `Cannot amend the Expiry Date of a ${contract.status} contract — only ACTIVE or EXPIRED contracts are eligible.`,
      );
    } else if (contract.status === 'ACTIVE') {
      return;
    }
    throw new IllegalStateTransitionError(
      `Cannot process ${movementType} against ${contract.instrumentType} ${contract.naturalKey.lcNumber} — ` +
        `contract status ${contract.status} is not eligible for this transaction. Refresh the Index and select an eligible transaction.`,
    );
  }

  /** Rechecks A6/B4 Step-2 Index eligibility at the microservice boundary. */
  private assertReferencedTransactionEligible(req: CreateMovementRequest, target: BalanceContract | undefined): void {
    if (!req.referencedTransactionId) return;
    const source = this.movements.findById(req.referencedTransactionId);
    if (!source) throw new NotFoundError(`Referenced transaction ${req.referencedTransactionId} was not found.`);
    const sourceContract = this.contracts.findById(source.balanceContractId);

    if (req.instrumentType === 'IPLC_ACCEPTANCE' && req.movementType === 'CREATE') {
      const sameParent =
        !!sourceContract &&
        (sourceContract.logicalContractId === req.parentLogicalContractId || sourceContract.naturalKey.lcNumber === req.naturalKey?.lcNumber);
      const eligible =
        sameParent &&
        sourceContract.instrumentType === 'IPLC_LC' &&
        source.movementType === 'UTILIZE' &&
        source.status === 'PENDING' &&
        !!source.acknowledgedAt &&
        !source.makerSubmittedAt;
      if (!eligible) {
        throw new IllegalStateTransitionError(
          `Referenced transaction ${source.movementId} is not eligible for A6 — select an acknowledged, still-PENDING Document Arrival from the same LC.`,
        );
      }
    }

    if (req.instrumentType === 'EPLC_CONFIRMATION' && (req.movementType === 'HONOUR' || req.movementType === 'ACCEPT')) {
      const sameParent = !!sourceContract && !!target && sourceContract.parentLogicalContractId === target.logicalContractId;
      const alreadySelected = !!target && this.movements.listByContract(target.balanceContractId).some(
        (movement) =>
          movement.eventSeq !== req.eventSeq && movement.status === 'PENDING' && movement.referencedTransactionId === source.movementId,
      );
      const eligible =
        sameParent &&
        sourceContract.instrumentType === 'EPLC_EXAMINATION' &&
        source.movementType === 'CREATE' &&
        source.status === 'RELEASED' &&
        !source.presentDocsConsumedAt &&
        !alreadySelected;
      if (!eligible) {
        throw new IllegalStateTransitionError(
          `Referenced transaction ${source.movementId} is not eligible for B4 — select a released, unconsumed Present Docs record from the same Confirmation.`,
        );
      }
    }
  }

  private assertAcceptanceTenor(req: CreateMovementRequest): void {
    if (
      (req.instrumentType !== 'IPLC_ACCEPTANCE' && req.instrumentType !== 'EPLC_ACCEPTANCE') ||
      req.movementType !== 'CREATE' ||
      !req.parentLogicalContractId
    ) {
      return;
    }
    const parent = this.contracts.findActiveByLogicalContractId(req.parentLogicalContractId);
    const result = checkAcceptanceTenorConsistency({
      parentTenorType: parent?.tenorType,
      parentBalanceContractId: parent?.balanceContractId,
      requestedTenorType: req.tenorType,
    });
    if (!result.ok) throw new RequestValidationError(result.error);
  }

  private assertRootIssueReleased(root: BalanceContract, actionDescription: string): void {
    const issue = this.movements.listByContract(root.balanceContractId).find((movement) => movement.movementType === 'ISSUE');
    if (!issue || issue.status !== 'RELEASED') {
      throw new IllegalStateTransitionError(
        `Cannot ${actionDescription} — ${root.instrumentType} ${root.naturalKey.lcNumber} ` +
          `(balanceContractId ${root.balanceContractId}) has not been Checker-Released yet ` +
          `(its own ISSUE is still ${issue?.status ?? 'missing'}). Release the Issue first.`,
      );
    }
  }

  private create(req: CreateMovementRequest): BalanceContract {
    const now = this.now();
    const isRoot = ROOT_INSTRUMENT_TYPES.has(req.instrumentType);
    const mailFloatGraceDays = isRoot
      ? (req.mailFloatGraceDays ?? (req.instrumentType === 'EPLC_CONFIRMATION' ? MAIL_FLOAT_GRACE_DAYS.EXPORT : MAIL_FLOAT_GRACE_DAYS.IMPORT))
      : null;
    const contract: BalanceContract = {
      balanceContractId: this.newId(),
      logicalContractId: this.newId(),
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
