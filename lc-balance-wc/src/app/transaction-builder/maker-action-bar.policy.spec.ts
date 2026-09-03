import { MakerActionBarState, deriveMakerActionBarView } from './maker-action-bar.policy';
import { EXPORT_FUNCTIONS, IMPORT_FUNCTIONS } from './balance-component.model';
import { deriveFunctionStrategy } from './function-strategy';

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

  it('replaces the dedicated A4 submit actions with Fix Pending Save and Cancel', () => {
    const view = deriveMakerActionBarView({
      ...baseState,
      releasesExistingMovementInPlace: true,
      hasSubmitResult: true,
      formLocked: true,
      fixPendingMode: true,
    });
    expect(view.showA4Submit).toBe(false);
    expect(view.showA4Cancel).toBe(false);
    expect(view.showGenericSubmit).toBe(false);
    expect(view.showFixPendingActions).toBe(true);
    expect(view.fixPendingSaveDisabled).toBe(false);
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
      expect(view.showA4Submit).toBe(false);
    }
  });

  it('reports the in-progress label and all existing submit guards', () => {
    const view = deriveMakerActionBarView({ ...baseState, submitting: true, functionCode: null });
    expect(view.genericSubmitLabel).toBe('Submitting…');
    expect(view.genericSubmitDisabled).toBe(true);
    expect(view.a4SubmitDisabled).toBe(true);
  });

  describe.each([...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS])('$code action-mode matrix', (fn) => {
    const releasesExistingMovementInPlace = deriveFunctionStrategy(fn).checkerRelease.releasesExistingMovementInPlace;

    it('shows exactly one normal Submit path', () => {
      const view = deriveMakerActionBarView({ ...baseState, functionCode: fn.code, releasesExistingMovementInPlace });
      expect(Number(view.showA4Submit) + Number(view.showGenericSubmit)).toBe(1);
      expect(view.showA4Submit).toBe(releasesExistingMovementInPlace);
      expect(view.showFixPendingActions).toBe(false);
      expect(view.showDeletePendingActions).toBe(false);
    });

    it('shows only Fix Pending actions while editing', () => {
      const view = deriveMakerActionBarView({
        ...baseState,
        functionCode: fn.code,
        releasesExistingMovementInPlace,
        hasSubmitResult: true,
        formLocked: true,
        fixPendingMode: true,
      });
      expect(view.showA4Submit).toBe(false);
      expect(view.showGenericSubmit).toBe(false);
      expect(view.showFixPendingActions).toBe(true);
      expect(view.showDeletePendingActions).toBe(false);
    });

    it('shows only Delete Pending actions while reviewing deletion', () => {
      const view = deriveMakerActionBarView({
        ...baseState,
        functionCode: fn.code,
        releasesExistingMovementInPlace,
        hasSubmitResult: true,
        formLocked: true,
        deletePendingReviewMode: true,
      });
      expect(view.showA4Submit).toBe(false);
      expect(view.showGenericSubmit).toBe(false);
      expect(view.showFixPendingActions).toBe(false);
      expect(view.showDeletePendingActions).toBe(true);
    });
  });
});
