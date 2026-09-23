import { TestBed } from '@angular/core/testing';
import { CheckerExcessReviewComponent } from './checker-excess-review.component';

describe('CheckerExcessReviewComponent', () => {
  it('renders the one identical Checker approval UI used by every positive Excess flow', () => {
    const fixture = TestBed.createComponent(CheckerExcessReviewComponent);
    fixture.componentRef.setInput('amount', '20');
    fixture.componentRef.setInput('currency', 'USD');
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
    expect(text).toContain('Excess Review');
    expect((fixture.nativeElement.querySelector('.tb-excess-review__amount-label') as HTMLElement).textContent).toBe('This Exceed Amount:');
    expect((fixture.nativeElement.querySelector('.tb-excess-review__amount') as HTMLElement).textContent?.trim()).toBe('20.00 USD');
    expect(text).toContain('Checker Approve');
    expect(text).not.toContain('Applicant Waiver');
    expect(text).not.toContain('Export Authorization Claim');
    expect(text).not.toContain('Authorization status');
  });

  it('emits the common Checker approval without owning release business logic', () => {
    const fixture = TestBed.createComponent(CheckerExcessReviewComponent);
    const approvals: boolean[] = [];
    fixture.componentInstance.approvedChange.subscribe((value) => approvals.push(value));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).click();

    expect(approvals).toEqual([true]);
  });
});
