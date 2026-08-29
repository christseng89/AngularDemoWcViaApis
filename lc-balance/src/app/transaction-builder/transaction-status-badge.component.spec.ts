import { TestBed } from '@angular/core/testing';
import { TransactionStatusBadgeComponent } from './transaction-status-badge.component';

function render(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(TransactionStatusBadgeComponent);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('TransactionStatusBadgeComponent', () => {
  it('renders an ordinary released movement as approved', () => {
    const element = render({ status: 'RELEASED', instrumentType: 'IPLC_LC', movementType: 'ISSUE' });
    expect(element.textContent).toContain('APPROVED');
    expect(element.querySelector('.tb-status-badge')?.classList).toContain('tb-status-badge--approved');
  });

  it('preserves the EARMARKING/EARMARKED lifecycle', () => {
    let element = render({ status: 'PENDING', instrumentType: 'IPLC_LC', movementType: 'UTILIZE' });
    expect(element.textContent).toContain('EARMARKING');
    expect(element.querySelector('.tb-status-badge')?.classList).toContain('tb-status-badge--pending');

    element = render({
      status: 'PENDING',
      instrumentType: 'IPLC_LC',
      movementType: 'UTILIZE',
      acknowledgedAt: '2026-08-29T00:00:00Z',
    });
    expect(element.textContent).toContain('EARMARKED');
    expect(element.querySelector('.tb-status-badge')?.classList).toContain('tb-status-badge--earmark');
  });

  it('uses finalized semantics and applies an optional caller layout class', () => {
    const element = render({
      status: 'RELEASED',
      instrumentType: 'IPLC_LC',
      movementType: 'UTILIZE',
      phase: 'finalize',
      extraClass: 'ms-2',
    });
    expect(element.textContent).toContain('APPROVED');
    expect(element.querySelector('.tb-status-badge')?.classList).toContain('ms-2');
  });
});
