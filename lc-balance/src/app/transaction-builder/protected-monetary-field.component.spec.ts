import { FormControl } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { FieldTypeConfig } from '@ngx-formly/core';
import { ProtectedMonetaryFieldComponent } from './protected-monetary-field.component';

describe('ProtectedMonetaryFieldComponent', () => {
  function render(model: Record<string, unknown>, props: FieldTypeConfig['props'] = {}) {
    const fixture = TestBed.createComponent(ProtectedMonetaryFieldComponent);
    fixture.componentInstance.field = {
      key: 'amount',
      model,
      props,
      formControl: new FormControl(),
    } as FieldTypeConfig;
    fixture.detectChanges();
    return fixture;
  }

  it('renders the protected amount using the selected currency minor-unit scale', () => {
    const fixture = render({ amount: '1234567.5', currency: 'USD' }, { label: 'Amount', required: true });
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input') as HTMLInputElement;

    expect(element.querySelector('label')?.textContent).toContain('Amount');
    expect(element.querySelector('label')?.classList.contains('required')).toBe(true);
    expect(input.value).toBe('1,234,567.50');
    expect(input.disabled).toBe(true);
  });

  it('rounds and displays a zero-decimal currency without decimal places', () => {
    const fixture = render({ amount: '1234.5', currency: 'JPY' }, { label: 'Amount' });

    expect(((fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement).value).toBe('1,235');
    expect((fixture.nativeElement as HTMLElement).querySelector('label')?.classList.contains('required')).toBe(false);
  });

  it('renders an empty protected field when the model has no amount', () => {
    const fixture = render({ currency: 'USD' }, { label: 'Amount' });

    expect(((fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement).value).toBe('');
  });
});
