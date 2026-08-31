import { TestBed } from '@angular/core/testing';
import { ProtectedTransactionIdentityComponent } from './protected-transaction-identity.component';

describe('ProtectedTransactionIdentityComponent', () => {
  it('renders configured identity rows only when visible', () => {
    const fixture = TestBed.createComponent(ProtectedTransactionIdentityComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('items', [
      { label: 'LC Number', value: 'LC-1' },
      { label: 'IB Number', value: 'IB-1' },
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('LC-1');
    expect(element.textContent).toContain('IB-1');
    expect(element.querySelectorAll('.tb-protected-natural-key__item')).toHaveLength(2);
  });
});
