import { BalanceSnapshotBoxComponent } from './balance-snapshot-box.component';
import { TestBed } from '@angular/core/testing';
import { BalanceSnapshot } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit test (same convention as account-entries-dialog.component.spec.ts's
 * own precedent) — this component has no class-level logic at all beyond its four @Input fields (purely
 * presentational, decorator-driven defaults), so there is nothing else to unit-test here. The template
 * itself (identical to the old #balanceSnapshotBox ng-template it replaced) is verified via `ng build`'s
 * strict-template check plus a live in-browser pass against both call sites (Look Up Current Balance and
 * Inquire Events' own Balance Tabs).
 */
describe('BalanceSnapshotBoxComponent', () => {
  it('has the documented @Input defaults', () => {
    const c = new BalanceSnapshotBoxComponent();
    expect(c.title).toBeNull();
    expect(c.status).toBeNull();
    expect(c.snapshot).toBeNull();
    expect(c.impact).toBeNull();
    expect(c.variant).toBe('full');
    expect(c.appearance).toBe('current');
  });

  it('renders the compact default-appearance variant used by Maker', () => {
    const fixture = TestBed.createComponent(BalanceSnapshotBoxComponent);
    fixture.componentRef.setInput('snapshot', {
      confirmedBalance: '100',
      availableBalance: '80',
      pendingEarmarkTotal: '20',
      offBalanceExposure: '10',
      tightAvailableBalance: '70',
    } as BalanceSnapshot);
    fixture.componentRef.setInput('variant', 'compact');
    fixture.componentRef.setInput('appearance', 'default');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Confirmed');
    expect(element.textContent).toContain('Tight Available');
    expect(element.textContent).not.toContain('Pending Earmark Total');
    expect(element.querySelector('.tb-balance-box')?.classList).not.toContain('tb-balance-box--current');
  });
});
