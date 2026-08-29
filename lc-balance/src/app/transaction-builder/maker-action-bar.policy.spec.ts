import { MakerActionBarState, deriveMakerActionBarView } from './maker-action-bar.policy';

const baseState: MakerActionBarState = {
  releasesExistingMovementInPlace: false,
  hasSelectedContract: true,
  hasSelectedPayMovement: true,
  submitting: false,
  hasSubmitResult: false,
  naturalKeyLocked: true,
  formLocked: false,
  fixPendingMode: false,
  deletePendingReviewMode: false,
  requiresEligibleTarget: true,
  submitReady: true,
  actionBusy: false,
  fixPendingSaveReady: true,
  functionCode: 'A3',
};

describe('deriveMakerActionBarView', () => {
  it('derives the ordinary transaction submit and cancel actions', () => {
    expect(deriveMakerActionBarView(baseState)).toMatchObject({
      showGenericSubmit: true,
      genericSubmitDisabled: false,
      genericSubmitLabel: 'Submit A3',
      showGenericCancel: true,
      showA4Submit: false,
      showFixPendingActions: false,
      showDeletePendingActions: false,
    });
  });

  it('keeps the A4 submit path separate and disables it without a selected movement', () => {
    const view = deriveMakerActionBarView({
      ...baseState,
      releasesExistingMovementInPlace: true,
      hasSelectedPayMovement: false,
    });
    expect(view.showA4Submit).toBe(true);
    expect(view.a4SubmitDisabled).toBe(true);
    expect(view.showA4Cancel).toBe(true);
    expect(view.showGenericSubmit).toBe(false);
  });

  it('replaces ordinary actions with Fix Pending actions', () => {
    const view = deriveMakerActionBarView({ ...baseState, fixPendingMode: true, fixPendingSaveReady: false });
    expect(view.showGenericSubmit).toBe(false);
    expect(view.showGenericCancel).toBe(false);
    expect(view.showFixPendingActions).toBe(true);
    expect(view.fixPendingSaveDisabled).toBe(true);
  });

  it('shows Delete Pending actions for both ordinary and A4 review modes', () => {
    for (const releasesExistingMovementInPlace of [false, true]) {
      const view = deriveMakerActionBarView({
        ...baseState,
        releasesExistingMovementInPlace,
        deletePendingReviewMode: true,
      });
      expect(view.showDeletePendingActions).toBe(true);
      expect(view.showGenericSubmit).toBe(false);
    }
  });

  it('reports the in-progress label and all existing submit guards', () => {
    const view = deriveMakerActionBarView({ ...baseState, submitting: true, functionCode: null });
    expect(view.genericSubmitLabel).toBe('Submitting…');
    expect(view.genericSubmitDisabled).toBe(true);
    expect(view.a4SubmitDisabled).toBe(true);
  });
});
