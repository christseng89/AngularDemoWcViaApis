export interface MakerActionBarState {
  releasesExistingMovementInPlace: boolean;
  hasSelectedContract: boolean;
  hasSelectedPayMovement: boolean;
  submitting: boolean;
  hasSubmitResult: boolean;
  naturalKeyLocked: boolean;
  formLocked: boolean;
  fixPendingMode: boolean;
  deletePendingReviewMode: boolean;
  requiresEligibleTarget: boolean;
  submitReady: boolean;
  actionBusy: boolean;
  fixPendingSaveReady: boolean;
  functionCode: string | null;
}

export interface MakerActionBarView {
  showA4Submit: boolean;
  a4SubmitDisabled: boolean;
  showA4Cancel: boolean;
  showGenericSubmit: boolean;
  genericSubmitDisabled: boolean;
  genericSubmitLabel: string;
  showGenericCancel: boolean;
  showFixPendingActions: boolean;
  fixPendingSaveDisabled: boolean;
  showDeletePendingActions: boolean;
}

/** Converts Maker workflow state into presentation-only action visibility and enablement.
 * Workflow modes (Fix/Delete Pending) always replace a Function's normal Submit path, including A4's
 * dedicated submitByMaker action; no screen may expose two competing commands for the same record.
 */
export function deriveMakerActionBarView(state: MakerActionBarState): MakerActionBarView {
  const genericMode = !state.releasesExistingMovementInPlace;
  const standardMode = !state.fixPendingMode && !state.deletePendingReviewMode;

  return {
    showA4Submit: state.releasesExistingMovementInPlace && standardMode && state.hasSelectedContract,
    a4SubmitDisabled: !state.hasSelectedPayMovement || state.submitting || state.hasSubmitResult,
    showA4Cancel: state.releasesExistingMovementInPlace && standardMode && state.naturalKeyLocked && !state.formLocked,
    showGenericSubmit: genericMode && standardMode,
    genericSubmitDisabled: state.submitting || state.hasSubmitResult || !state.submitReady,
    genericSubmitLabel: state.submitting ? 'Submitting…' : `Submit ${state.functionCode ?? ''}`.trim(),
    showGenericCancel:
      genericMode && standardMode && state.requiresEligibleTarget && state.naturalKeyLocked && !state.formLocked,
    showFixPendingActions: state.fixPendingMode,
    fixPendingSaveDisabled: state.actionBusy || !state.fixPendingSaveReady,
    showDeletePendingActions: state.deletePendingReviewMode,
  };
}
