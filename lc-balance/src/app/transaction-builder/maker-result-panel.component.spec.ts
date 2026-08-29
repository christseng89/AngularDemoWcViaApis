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

  it('renders an error without exposing result-only actions', () => {
    const fixture = TestBed.createComponent(MakerResultPanelComponent);
    fixture.componentRef.setInput('error', 'Submission failed');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Submission failed');
    expect(element.querySelector('button')).toBeNull();
    expect(fixture.componentInstance.statusLabel).toBe('');
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
