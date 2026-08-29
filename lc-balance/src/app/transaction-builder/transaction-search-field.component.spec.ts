import { TestBed } from '@angular/core/testing';
import { TransactionSearchFieldComponent } from './transaction-search-field.component';

describe('TransactionSearchFieldComponent', () => {
  it('emits changed values and search intent from Enter and the button', async () => {
    const fixture = TestBed.createComponent(TransactionSearchFieldComponent);
    fixture.componentRef.setInput('label', 'LC Number');
    fixture.detectChanges();
    const values: string[] = [];
    let searches = 0;
    fixture.componentInstance.valueChange.subscribe((value) => values.push(value));
    fixture.componentInstance.searchRequested.subscribe(() => searches++);

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'S001';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(values).toEqual(['S001']);
    expect(searches).toBe(2);
    expect(button.classList).toContain('tb-btn--primary');
  });

  it('shows busy state and suppresses search while loading', () => {
    const fixture = TestBed.createComponent(TransactionSearchFieldComponent);
    fixture.componentRef.setInput('label', 'LC Number');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    let searches = 0;
    fixture.componentInstance.searchRequested.subscribe(() => searches++);

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Searching…');
    expect(fixture.nativeElement.querySelector('.tb-spinner')).not.toBeNull();
    expect(searches).toBe(0);
  });
});
