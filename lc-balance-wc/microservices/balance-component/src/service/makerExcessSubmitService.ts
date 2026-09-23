import type { ExcessPolicyConfig, ExcessAllowanceOwnerType, PbdFallbackAuthorization } from '../config/excessPolicyConfig';
import { resolvePbdFallbackAuthorization } from '../config/excessPolicyConfig';
import { computeEffectiveAllowanceLimitOwner, evaluateOwnerExcessAllowance, selectExcessProcessingRoute } from '../domain/excessPolicy';
import { assertExcessOwnerCurrencyInvariant, prepareExcessFunctionSplit, type ExcessFunctionSplitInput } from '../domain/excessFunctionStrategy';
import { usdParDecision, type CurrencyExchangeRequest, type FxDecision, type CurrencyExchangeQuote } from '../integration/currencyExchange';
import type { ExcessFunctionCode } from '../types';
import { parseMonetaryAmount } from '../money';
import {
  calculateMinimumRequiredIncrease,
  type MinimumRequiredIncreaseResult,
} from '../domain/minimumRequiredIncrease';

export interface MakerExcessSubmitCommand {
  commandType: 'MAKER_SUBMIT';
  functionCode: ExcessFunctionCode;
  ownerType: ExcessAllowanceOwnerType;
  ownerId: string;
  ownerCurrency: string;
  transactionAmountOwner: string;
  movementId: string;
  actorContext: string;
  idempotencyKey: string;
  requestHash: string;
  decisionTime: string;
}

export interface MakerExcessSubmitResponse {
  httpStatus: 201;
  body: {
    movementId: string;
    workflowStatus: 'PENDING';
    coveredAmountOwner: string;
    excessAmountOwner: string;
    excessDecision: 'WITHIN_ALLOWANCE';
    businessResultCode: null;
    releaseEligibility: 'ELIGIBLE';
  };
}

export type MakerLegacySubmitResult = Readonly<{ kind: 'LEGACY_SUBMIT' }>;
export type MakerExcessLimitExceededResult = Readonly<{
  ok: false;
  httpStatus: 409;
  code: 'EXCESS_LIMIT_EXCEEDED';
  guidance: MinimumRequiredIncreaseResult;
}>;
export type MakerExcessSubmitResult =
  | MakerExcessSubmitResponse
  | MakerLegacySubmitResult
  | MakerExcessLimitExceededResult
  | Readonly<{ ok: false; code: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE' | 'IDEMPOTENCY_CONFLICT' }>;

export interface MakerExcessCurrentFacts {
  ownerType: ExcessAllowanceOwnerType;
  ownerId: string;
  factsVersion: string;
  approvedContractualMaximumOwner: string;
  splitInput: ExcessFunctionSplitInput;
}

export class MakerExcessFactsChangedError extends Error {
  constructor(readonly expectedFactsVersion: string) {
    super(`Current Excess facts changed after Maker validation (expected version ${expectedFactsVersion}).`);
    this.name = 'MakerExcessFactsChangedError';
  }
}

export interface LockedExcessAllowance {
  excessAccountId: string;
  version: number;
  approvedUtilizedOwner: string;
  otherPendingReservedOwner: string;
}

export interface MakerExcessPersistenceBundle {
  movementId: string;
  ownerType: ExcessAllowanceOwnerType;
  ownerId: string;
  excessAccountId: string;
  expectedAccountVersion: number;
  expectedFactsVersion: string;
  ownerCurrency: string;
  coveredAmountOwner: string;
  excessAmountOwner: string;
  effectiveLimitOwner: string;
  excessDecision: 'WITHIN_ALLOWANCE';
  businessResultCode: null;
  releaseEligibility: 'ELIGIBLE';
  policySnapshot: Readonly<ExcessPolicyConfig>;
  fxSnapshot: CurrencyExchangeQuote;
  idempotency: {
    commandType: 'MAKER_SUBMIT';
    ownerId: string;
    actorContext: string;
    key: string;
    requestHash: string;
    response: MakerExcessSubmitResponse;
  };
  audit: {
    action: 'MAKER_SUBMIT';
    actorContext: string;
    decisionTime: string;
  };
}

export interface MakerExcessAtomicTransaction {
  claimIdempotency(scope: MakerExcessIdempotencyScope): TransactionalIdempotencyClaim;
  assertCurrentFactsVersion(command: MakerExcessSubmitCommand, expectedFactsVersion: string): void;
  lockAllowance(
    ownerType: ExcessAllowanceOwnerType,
    ownerId: string,
    ownerCurrency: string,
    ownerCurrencyPrecision: number,
    policyVersion: string,
  ): LockedExcessAllowance;
  persist(bundle: MakerExcessPersistenceBundle): void;
}

type ReplayableMakerSubmitResponse = MakerExcessSubmitResponse | MakerLegacySubmitResult;
type IdempotencyPreflight = Readonly<{ kind: 'MISS' }> | Readonly<{ kind: 'REPLAY'; response: ReplayableMakerSubmitResponse }> | Readonly<{ kind: 'CONFLICT' }>;
type TransactionalIdempotencyClaim =
  Readonly<{ kind: 'CLAIMED' }> | Readonly<{ kind: 'REPLAY'; response: ReplayableMakerSubmitResponse }> | Readonly<{ kind: 'CONFLICT' }>;

export interface MakerExcessIdempotencyScope {
  commandType: 'MAKER_SUBMIT';
  ownerId: string;
  actorContext: string;
  key: string;
  requestHash: string;
}

export interface MakerExcessSubmitDependencies {
  idempotency: {
    preflight(input: { commandType: 'MAKER_SUBMIT'; ownerId: string; actorContext: string; key: string; requestHash: string }): IdempotencyPreflight;
  };
  currentFacts: { load(command: MakerExcessSubmitCommand): MakerExcessCurrentFacts };
  policy: { resolve(ownerType: ExcessAllowanceOwnerType, decisionTime: string): Readonly<ExcessPolicyConfig> };
  fx: {
    resolveConfiguredMaximum(input: {
      request: CurrencyExchangeRequest;
      commandIdempotencyKey: string;
      maxStalenessSeconds: number;
      pbdAuthorization: PbdFallbackAuthorization;
    }): Promise<FxDecision>;
  };
  legacy: { submit(command: MakerExcessSubmitCommand): MakerLegacySubmitResult };
  unitOfWork: { execute<T>(operation: (transaction: MakerExcessAtomicTransaction) => T): T };
}

export class MakerExcessSubmitService {
  constructor(private readonly dependencies: MakerExcessSubmitDependencies) {}

  async submit(command: MakerExcessSubmitCommand): Promise<MakerExcessSubmitResult> {
    const idempotencyScope: MakerExcessIdempotencyScope = {
      commandType: command.commandType,
      ownerId: command.ownerId,
      actorContext: command.actorContext,
      key: command.idempotencyKey,
      requestHash: command.requestHash,
    };
    const preflight = this.dependencies.idempotency.preflight(idempotencyScope);
    if (preflight.kind === 'REPLAY') return preflight.response;
    if (preflight.kind === 'CONFLICT') return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };

    const facts = this.dependencies.currentFacts.load(command);
    this.assertFactsMatchCommand(command, facts);
    assertExcessOwnerCurrencyInvariant(facts.splitInput);
    const policy = this.dependencies.policy.resolve(command.ownerType, command.decisionTime);
    if (policy.ownerType !== command.ownerType) throw new Error('Resolved Excess policy owner type does not match the command owner type.');
    if (
      selectExcessProcessingRoute({
        configuredMaximumUsd: policy.configuredMaximumUsd,
        allowancePercentage: policy.allowancePercentage,
      }) === 'LEGACY_SUFFICIENCY'
    ) {
      return this.dependencies.legacy.submit(command);
    }

    const split = prepareExcessFunctionSplit(facts.splitInput);
    if (split.proposedExcessOwner === '0') return this.dependencies.legacy.submit(command);

    const ownerCurrencyPrecision = policy.currencyPrecisions[split.ownerCurrency];
    if (ownerCurrencyPrecision === undefined) throw new Error(`Missing owner-currency precision for ${split.ownerCurrency}.`);
    const fxDecision = await this.resolveConfiguredMaximum(command, policy, split.ownerCurrency);
    if (!fxDecision.ok) return fxDecision;

    const effectiveLimitOwner = computeEffectiveAllowanceLimitOwner({
      approvedContractualMaximumOwner: facts.approvedContractualMaximumOwner,
      allowancePercentage: policy.allowancePercentage,
      configuredMaximumOwner: fxDecision.quote.convertedAmount,
      ownerCurrencyPrecision,
    });

    try {
      return this.dependencies.unitOfWork.execute((transaction) => {
        const claim = transaction.claimIdempotency(idempotencyScope);
        if (claim.kind === 'REPLAY') return claim.response;
        if (claim.kind === 'CONFLICT') return { ok: false as const, code: 'IDEMPOTENCY_CONFLICT' as const };
        transaction.assertCurrentFactsVersion(command, facts.factsVersion);
        const locked = transaction.lockAllowance(command.ownerType, command.ownerId, split.ownerCurrency, ownerCurrencyPrecision, policy.policyVersion);
        const allowance = evaluateOwnerExcessAllowance({
          effectiveLimitOwner,
          approvedUtilizedOwner: locked.approvedUtilizedOwner,
          otherPendingReservedOwner: locked.otherPendingReservedOwner,
          proposedExcessOwner: split.proposedExcessOwner,
          ownerCurrencyPrecision,
        });
        if (allowance.decision === 'LIMIT_EXCEEDED') {
          throw new MakerExcessLimitExceededSignal(
            calculateMinimumRequiredIncrease({
              transactionAmountOwner: facts.splitInput.transactionAmountOwner,
              effectiveCapacityOwner: split.coveredAmountOwner,
              approvedContractualMaximumOwner: facts.approvedContractualMaximumOwner,
              allowancePercentage: policy.allowancePercentage,
              configuredMaximumOwner: fxDecision.quote.convertedAmount,
              approvedUtilizedOwner: locked.approvedUtilizedOwner,
              otherPendingReservedOwner: locked.otherPendingReservedOwner,
              ownerCurrencyPrecision,
              capacityGainPerIncrease: '1',
              snapshotTime: command.decisionTime,
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
          );
        }
        const response: MakerExcessSubmitResponse = {
          httpStatus: 201,
          body: {
            movementId: command.movementId,
            workflowStatus: 'PENDING',
            coveredAmountOwner: split.coveredAmountOwner,
            excessAmountOwner: split.proposedExcessOwner,
            excessDecision: 'WITHIN_ALLOWANCE',
            businessResultCode: null,
            releaseEligibility: 'ELIGIBLE',
          },
        };
        transaction.persist({
          movementId: command.movementId,
          ownerType: command.ownerType,
          ownerId: command.ownerId,
          excessAccountId: locked.excessAccountId,
          expectedAccountVersion: locked.version,
          expectedFactsVersion: facts.factsVersion,
          ownerCurrency: split.ownerCurrency,
          coveredAmountOwner: split.coveredAmountOwner,
          excessAmountOwner: split.proposedExcessOwner,
          effectiveLimitOwner,
          excessDecision: 'WITHIN_ALLOWANCE',
          businessResultCode: null,
          releaseEligibility: 'ELIGIBLE',
          policySnapshot: policy,
          fxSnapshot: fxDecision.quote,
          idempotency: {
            commandType: command.commandType,
            ownerId: command.ownerId,
            actorContext: command.actorContext,
            key: command.idempotencyKey,
            requestHash: command.requestHash,
            response,
          },
          audit: { action: 'MAKER_SUBMIT', actorContext: command.actorContext, decisionTime: command.decisionTime },
        });
        return response;
      });
    } catch (error) {
      if (error instanceof MakerExcessLimitExceededSignal) {
        return { ok: false, httpStatus: 409, code: 'EXCESS_LIMIT_EXCEEDED', guidance: error.guidance };
      }
      throw error;
    }
  }

  private resolveConfiguredMaximum(command: MakerExcessSubmitCommand, policy: Readonly<ExcessPolicyConfig>, ownerCurrency: string): Promise<FxDecision> {
    const request: CurrencyExchangeRequest = {
      fromCurrency: 'USD',
      toCurrency: ownerCurrency,
      amount: policy.configuredMaximumUsd,
      ratePurpose: 'BOOKING',
      decisionTime: command.decisionTime,
      correlationId: command.movementId,
      policyVersion: policy.policyVersion,
    };
    if (ownerCurrency === 'USD') return Promise.resolve(usdParDecision(request));
    return this.dependencies.fx.resolveConfiguredMaximum({
      request,
      commandIdempotencyKey: command.idempotencyKey,
      maxStalenessSeconds: policy.fxMaxStalenessSeconds,
      pbdAuthorization: resolvePbdFallbackAuthorization(policy, command.decisionTime),
    });
  }

  private assertFactsMatchCommand(command: MakerExcessSubmitCommand, facts: MakerExcessCurrentFacts): void {
    if (
      facts.ownerType !== command.ownerType ||
      facts.ownerId !== command.ownerId ||
      facts.splitInput.functionCode !== command.functionCode ||
      facts.splitInput.ownerCurrency !== command.ownerCurrency ||
      !parseMonetaryAmount(facts.splitInput.transactionAmountOwner).equals(parseMonetaryAmount(command.transactionAmountOwner))
    ) {
      throw new Error('Current Excess facts do not match the Maker command identity.');
    }
  }
}

class MakerExcessLimitExceededSignal extends Error {
  constructor(readonly guidance: MinimumRequiredIncreaseResult) {
    super('Projected Excess exceeds the effective owner allowance.');
    this.name = 'MakerExcessLimitExceededSignal';
  }
}
