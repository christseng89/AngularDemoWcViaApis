import type { BalanceMovement } from './balance-component-api.service';
import type { CompoundLegState } from './maker-panel.component';
import type { MakerSubmitOutcome } from './maker-submit.service';

export interface MakerWorkflowState {
  submitting: boolean;
  submitResult: BalanceMovement | null;
  submitError: string | null;
  submitErrorCause?: unknown;
  compoundLegs: CompoundLegState;
}

/** Pure state transitions keep submit orchestration out of the visual component. */
export function beginMakerSubmission(state: MakerWorkflowState): MakerWorkflowState {
  return {
    ...state,
    submitting: true,
    submitResult: null,
    submitError: null,
    submitErrorCause: null,
    compoundLegs: {
      ...state.compoundLegs,
      arrivalSgRedeemMovementId: null,
      arrivalSgRedeemMovement: null,
      acceptanceMovement: null,
    },
  };
}

export function reduceMakerSubmitOutcome(state: MakerWorkflowState, outcome: MakerSubmitOutcome): MakerWorkflowState {
  const next: MakerWorkflowState = {
    ...state,
    submitting: false,
    compoundLegs: { ...state.compoundLegs, ...outcome.secondary },
  };
  if (outcome.kind === 'submitted') return { ...next, submitResult: outcome.result, submitError: null, submitErrorCause: null };
  return {
    ...next,
    submitError: outcome.message,
    submitErrorCause: outcome.cause ?? null,
    submitResult: 'result' in outcome && outcome.result !== undefined ? outcome.result : state.submitResult,
  };
}
