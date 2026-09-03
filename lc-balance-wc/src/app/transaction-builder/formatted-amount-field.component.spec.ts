import { FormControl } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { FieldTypeConfig } from '@ngx-formly/core';
import { FormattedAmountFieldComponent } from './formatted-amount-field.component';

describe('FormattedAmountFieldComponent', () => {
  function render(value: string | null = '') {
    const fixture = TestBed.createComponent(FormattedAmountFieldComponent);
    const control = new FormControl(value);
    fixture.componentInstance.field = {
      key: 'amount',
      model: { amount: value },
      props: { type: 'text' },
      formControl: control,
      options: { showError: () => false },
    } as FieldTypeConfig;
    fixture.detectChanges();
    return { fixture, control, input: fixture.nativeElement.querySelector('input') as HTMLInputElement };
  }

  function type(input: HTMLInputElement, value: string, caret = value.length): void {
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('shows grouped digits while keeping the FormControl value comma-free', () => {
    const { control, input } = render();

    type(input, '1234');

    expect(input.value).toBe('1,234');
    expect(input.selectionStart).toBe(5);
    expect(control.value).toBe('1234');
  });

  it('falls back to the rendered value length when the browser does not expose a selectionStart', () => {
    const { fixture, control } = render();
    const component = fixture.componentInstance;
    const input = {
      value: '1234',
      selectionStart: null,
      setSelectionRange: jest.fn(),
    } as unknown as HTMLInputElement;

    component.onInput({ target: input } as unknown as Event);

    expect(input.value).toBe('1,234');
    expect(input.setSelectionRange).toHaveBeenCalledWith(5, 5);
    expect(control.value).toBe('1234');
  });

  it('keeps an empty nullable control empty and preserves a caret at the start', () => {
    const { control, input } = render(null);

    expect(input.value).toBe('');
    type(input, '1234', 0);

    expect(input.value).toBe('1,234');
    expect(input.selectionStart).toBe(0);
    expect(control.value).toBe('1234');

    type(input, '');
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    expect(control.value).toBe('');
  });

  it('preserves decimals and formats an initial canonical value', () => {
    const { control, input } = render('1234567.89');

    expect(input.value).toBe('1,234,567.89');
    expect(control.value).toBe('1234567.89');
  });

  it('keeps a trailing decimal point while typing and canonicalizes it on blur', () => {
    const { control, input } = render();

    type(input, '1234.');
    expect(input.value).toBe('1,234.');
    expect(control.value).toBe('1234.');

    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    expect(input.value).toBe('1,234');
    expect(control.value).toBe('1234');
  });

  it('keeps shorthand raw while typing and expands it on blur', () => {
    const { control, input } = render();

    type(input, '1m2k3h');
    expect(input.value).toBe('1m2k3h');
    expect(control.value).toBe('1m2k3h');

    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(input.value).toBe('1,002,300');
    expect(control.value).toBe('1002300');
  });

  it('supports additive hundred shorthand on blur', () => {
    const { control, input } = render();

    type(input, '3h2h');
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(input.value).toBe('500');
    expect(control.value).toBe('500');
  });

  it('leaves unsupported shorthand visible for the existing validator', () => {
    const { control, input } = render();

    type(input, '1t');
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(input.value).toBe('1t');
    expect(control.value).toBe('1t');
  });

  it('accepts pasted grouped numbers but stores no separators', () => {
    const { control, input } = render();

    type(input, '1,234,567.25');

    expect(input.value).toBe('1,234,567.25');
    expect(control.value).toBe('1234567.25');
  });

  it('updates the display when the FormControl changes externally', () => {
    const { fixture, control, input } = render();

    control.setValue('9876543.21');
    fixture.detectChanges();

    expect(input.value).toBe('9,876,543.21');
    expect(control.value).toBe('9876543.21');
  });
});
