import { BalanceSnapshotBoxComponent } from './balance-snapshot-box.component';

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
  });
});
