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
    expect(c.pendingAmendmentBalanceEffect).toBeNull();
    expect(c.amendmentTolerancePct).toBeNull();
    expect(c.amendmentToleranceBeforePct).toBeNull();
    expect(c.pendingAmendments).toEqual([]);
    expect(c.variant).toBe('full');
    expect(c.appearance).toBe('current');
  });

  it('renders every pending amendment in Current Balance without collapsing same-LC references', () => {
    const fixture = TestBed.createComponent(BalanceSnapshotBoxComponent);
    fixture.componentRef.setInput('snapshot', {
      currency: 'USD',
      confirmedBalance: '100000',
      availableBalance: '130000',
      pendingEarmarkTotal: '30000',
    } as BalanceSnapshot);
    fixture.componentRef.setInput('pendingAmendments', [
      { reference: 'A01', balanceEffect: '32000', toleranceBeforePct: '0', toleranceAfterPct: '20', isPending: true },
      { reference: 'A02', balanceEffect: '-2000', toleranceBeforePct: '0', toleranceAfterPct: '5', isPending: true },
    ]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Pending Amendment Balance Effect (A01)');
    expect(text).toContain('32,000.00');
    expect(text).toContain('0% → 20%');
    expect(text).toContain('Pending Amendment Balance Effect (A02)');
    expect(text).toContain('-2,000.00');
    expect(text).toContain('0% → 5%');
  });

  it('labels a released amendment as the applied Amendment Balance Effect', () => {
    const fixture = TestBed.createComponent(BalanceSnapshotBoxComponent);
    fixture.componentRef.setInput('snapshot', { currency: 'USD', confirmedBalance: '138000', availableBalance: '138000', pendingEarmarkTotal: '0' } as BalanceSnapshot);
    fixture.componentRef.setInput('pendingAmendments', [
      { reference: 'A04', balanceEffect: '-18000', toleranceBeforePct: '20', toleranceAfterPct: '15', isPending: false },
    ]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Amendment Balance Effect (A04)');
    expect(text).not.toContain('Pending Amendment Balance Effect (A04)');
    expect(text).toContain('20% → 15%');
  });

  it('shows an A2/B2 pending amendment effect and tolerance separately from the net pending total', () => {
    const fixture = TestBed.createComponent(BalanceSnapshotBoxComponent);
    fixture.componentRef.setInput('snapshot', {
      currency: 'USD',
      confirmedBalance: '100000',
      availableBalance: '122000',
      pendingEarmarkTotal: '22000',
      offBalanceExposure: '0',
      tightAvailableBalance: '90000',
    } as BalanceSnapshot);
    fixture.componentRef.setInput('pendingAmendmentBalanceEffect', '32000');
    fixture.componentRef.setInput('amendmentTolerancePct', '20');
    fixture.componentRef.setInput('amendmentToleranceBeforePct', '0');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Pending Earmark Total');
    expect(text).toContain('22,000.00');
    expect(text).toContain('Pending Amendment Balance Effect');
    expect(text).toContain('32,000.00');
    expect(text).toContain('Amendment Tolerance');
    expect(text).toContain('0% → 20%');
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
