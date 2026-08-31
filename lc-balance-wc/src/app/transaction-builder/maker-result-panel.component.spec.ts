import { TestBed } from '@angular/core/testing';
import { BalanceMovement } from './balance-component-api.service';
import { MakerResultPanelComponent } from './maker-result-panel.component';

const movement = {
  movementId: 'movement-1',
  status: 'PENDING',
  movementType: 'UTILIZE',
  contingentAccountEntry: { accountEntryId: 'entry-1' },
} as unknown as BalanceMovement;

describe('MakerResultPanelComponent', () => {
  it('has no feedback when there is no submission error', () => {
    expect(new MakerResultPanelComponent().errorFeedback).toBeNull();
  });
  it('renders result state and keeps result actions styled inside the child boundary', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('result', movement);
    fixture.componentRef.setInput('instrumentType', 'IPLC_LC');
    fixture.componentRef.setInput('fixPendingSupported', true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('EARMARKING');
    expect(element.textContent).toContain('Account Entries');
    expect(element.textContent).toContain('Fix Pending');
    expect(element.querySelector('.tb-maker-result-actions .tb-btn')).not.toBeNull();
  });

  it('emits semantic account-entry and fix-pending actions', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('result', movement);
    fixture.componentRef.setInput('instrumentType', 'IPLC_LC');
    fixture.componentRef.setInput('fixPendingSupported', true);
    const accountEntries = jest.fn();
    const fixPending = jest.fn();
    fixture.componentInstance.openAccountEntries.subscribe(accountEntries);
    fixture.componentInstance.fixPending.subscribe(fixPending);
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    buttons.find((button) => button.textContent?.trim() === 'Account Entries')?.click();
    buttons.find((button) => button.textContent?.trim() === 'Fix Pending')?.click();

    expect(accountEntries).toHaveBeenCalledWith({ movement, instrumentType: 'IPLC_LC', phase: null });
    expect(fixPending).toHaveBeenCalledTimes(1);
  });

  it('shows and emits Delete Pending for an enabled PENDING Maker Result', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('result', movement);
    fixture.componentRef.setInput('deletePendingSupported', true);
    const requested = jest.fn();
    fixture.componentInstance.deletePending.subscribe(requested);
    fixture.detectChanges();

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.trim() === 'Delete Pending');
    expect(button).toBeDefined();
    button?.click();
    expect(requested).toHaveBeenCalledTimes(1);
  });

  it('never shows Delete Pending while Maker Queue Fix Pending is active', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('result', movement);
    fixture.componentRef.setInput('deletePendingSupported', true);
    fixture.componentRef.setInput('fixPendingMode', true);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Delete Pending');
  });

  it('does not show Delete Pending when disabled or after the result leaves PENDING', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('result', movement);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Delete Pending');

    fixture.componentRef.setInput('deletePendingSupported', true);
    fixture.componentRef.setInput('result', { ...movement, status: 'CANCELLED' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Delete Pending');
  });

  it('renders an error without exposing result-only actions', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('error', 'Submission failed');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Unable to submit the transaction');
    expect(element.querySelector('button')).toBeNull();
    expect(fixture.componentInstance.statusLabel).toBe('');
  });

  it('classifies Maker Submit HTTP failures from the preserved raw cause', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('error', 'Http failure response for /api/balance-movements: 500 Internal Server Error');
    fixture.componentRef.setInput('errorCause', { status: 500, error: { message: 'DATABASE_BUSY' } });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Balance service temporarily unavailable');
    expect(text).toContain('BAL-SVC-HTTP-500');
    expect(text).not.toContain('BAL-UI-UNEXPECTED');
  });

  it('emits the standalone compound-leg fallback when the primary result has no account entry', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    const primary = { ...movement, contingentAccountEntry: null } as BalanceMovement;
    const sgRedemption = { ...movement, movementId: 'sg-redemption' } as BalanceMovement;
    fixture.componentRef.setInput('result', primary);
    fixture.componentRef.setInput('compoundLegs', { arrivalSgRedeemMovement: sgRedemption });
    const accountEntries = jest.fn();
    fixture.componentInstance.openAccountEntries.subscribe(accountEntries);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')?.click();

    expect(accountEntries).toHaveBeenCalledWith({ movement: sgRedemption, instrumentType: 'SHGT', phase: undefined });
  });

  it('hides post-submit actions during delete-pending review', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('result', movement);
    fixture.componentRef.setInput('fixPendingSupported', true);
    fixture.componentRef.setInput('deletePendingReviewMode', true);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.tb-maker-result-actions')).toBeNull();
  });
});
