import { TestBed } from '@angular/core/testing';
import { MakerActionBarComponent } from './maker-action-bar.component';
import { MakerActionBarState } from './maker-action-bar.policy';

const state: MakerActionBarState = {
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
  functionCode: 'B3',
};

describe('MakerActionBarComponent', () => {
  it('renders and emits ordinary submit and cancel actions', () => {
    const fixture = TestBed.createComponent(MakerActionBarComponent);
    fixture.componentRef.setInput('state', state);
    const submit = jest.fn();
    const cancel = jest.fn();
    fixture.componentInstance.submitTransaction.subscribe(submit);
    fixture.componentInstance.cancelSelection.subscribe(cancel);
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    expect((fixture.nativeElement as HTMLElement).querySelector('.tb-submit-actions')).not.toBeNull();
    expect(buttons[0].textContent).toContain('Submit B3');
    expect(buttons[0].classList).toContain('tb-btn--primary');
    buttons[0].click();
    buttons[1].click();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('renders A4 actions with the existing disabled rule', () => {
    const fixture = TestBed.createComponent(MakerActionBarComponent);
    fixture.componentRef.setInput('state', { ...state, releasesExistingMovementInPlace: true, hasSelectedPayMovement: false });
    fixture.detectChanges();

    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.tb-btn--primary');
    expect(submit?.textContent).toContain('Submit A4');
    expect(submit?.disabled).toBe(true);
  });

  it('emits Fix Pending actions', () => {
    const fixture = TestBed.createComponent(MakerActionBarComponent);
    fixture.componentRef.setInput('state', { ...state, fixPendingMode: true });
    const save = jest.fn();
    const cancel = jest.fn();
    fixture.componentInstance.saveFixPending.subscribe(save);
    fixture.componentInstance.cancelFixPending.subscribe(cancel);
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    buttons[0].click();
    buttons[1].click();
    expect(save).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('renders Save Fix Pending instead of the disabled Submit A4 during A4 Fix Pending', () => {
    const fixture = TestBed.createComponent(MakerActionBarComponent);
    fixture.componentRef.setInput('state', {
      ...state,
      releasesExistingMovementInPlace: true,
      hasSubmitResult: true,
      formLocked: true,
      fixPendingMode: true,
    });
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Save Fix Pending', 'Cancel']);
    expect(buttons[0].disabled).toBe(false);
  });

  it('emits Delete Pending actions in A4 review mode', () => {
    const fixture = TestBed.createComponent(MakerActionBarComponent);
    fixture.componentRef.setInput('state', { ...state, releasesExistingMovementInPlace: true, deletePendingReviewMode: true });
    const confirm = jest.fn();
    const cancel = jest.fn();
    fixture.componentInstance.confirmDeletePending.subscribe(confirm);
    fixture.componentInstance.cancelDeletePending.subscribe(cancel);
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.find((button) => button.textContent?.includes('Confirm Delete Pending'))).toBeDefined();
    expect(buttons.find((button) => button.textContent?.includes('Submit A4'))).toBeUndefined();
    buttons.find((button) => button.textContent?.includes('Confirm Delete Pending'))?.click();
    buttons.at(-1)?.click();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
