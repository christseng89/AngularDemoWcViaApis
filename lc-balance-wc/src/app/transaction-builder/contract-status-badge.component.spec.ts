import { TestBed } from '@angular/core/testing';
import { ContractStatusBadgeComponent } from './contract-status-badge.component';

function render(status: string, closingPending = false): HTMLElement {
  const fixture = TestBed.createComponent(ContractStatusBadgeComponent);
  fixture.componentRef.setInput('status', status);
  fixture.componentRef.setInput('closingPending', closingPending);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ContractStatusBadgeComponent', () => {
  it('renders ACTIVE as approved', () => {
    const element = render('ACTIVE');
    expect(element.textContent).toContain('ACTIVE');
    expect(element.querySelector('.tb-status-badge')?.classList).toContain('tb-status-badge--approved');
  });

  it('renders an active contract with closing pending as CLOSING', () => {
    const element = render('ACTIVE', true);
    expect(element.textContent).toContain('CLOSING');
    expect(element.querySelector('.tb-status-badge')?.classList).toContain('tb-status-badge--negative');
  });

  it('renders CLOSED as negative', () => {
    const element = render('CLOSED');
    expect(element.textContent).toContain('CLOSED');
    expect(element.querySelector('.tb-status-badge')?.classList).toContain('tb-status-badge--negative');
  });
});
