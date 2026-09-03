import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FieldType, FieldTypeConfig, FormlyModule } from '@ngx-formly/core';
import { parseAmountShorthand } from './amount-shorthand';

function commaFree(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).replace(/,/g, '');
}

function groupNumericInput(value: string): string {
  if (!/^\d*(?:\.\d*)?$/.test(value)) return value;

  const decimalAt = value.indexOf('.');
  const whole = decimalAt < 0 ? value : value.slice(0, decimalAt);
  const fraction = decimalAt < 0 ? '' : value.slice(decimalAt + 1);
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalAt < 0 ? groupedWhole : `${groupedWhole}.${fraction}`;
}

function logicalCaret(value: string, caret: number): number {
  return value.slice(0, caret).replace(/,/g, '').length;
}

function renderedCaret(value: string, logicalPosition: number): number {
  if (logicalPosition === 0) return 0;
  let remaining = logicalPosition;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ',') remaining -= 1;
    if (remaining === 0) return index + 1;
  }
  return value.length;
}

@Component({
  selector: 'app-formatted-amount-field',
  standalone: true,
  imports: [FormlyModule],
  template: `
    <input
      type="text"
      class="form-control"
      [value]="displayValue"
      [formlyAttributes]="field"
      [class.is-invalid]="showError"
      [attr.aria-describedby]="id + '-formly-validation-error'"
      [attr.aria-invalid]="showError"
      (input)="onInput($event)"
      (blur)="onBlur($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormattedAmountFieldComponent extends FieldType<FieldTypeConfig> implements OnInit {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  displayValue = '';

  ngOnInit(): void {
    this.displayValue = groupNumericInput(commaFree(this.formControl.value));
    this.formControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.displayValue = groupNumericInput(commaFree(value));
      this.changeDetector.markForCheck();
    });
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const caret = logicalCaret(input.value, input.selectionStart ?? input.value.length);
    const raw = commaFree(input.value);
    const formatted = groupNumericInput(raw);

    this.displayValue = formatted;
    input.value = formatted;
    input.setSelectionRange(renderedCaret(formatted, caret), renderedCaret(formatted, caret));
    this.formControl.setValue(raw);
    this.formControl.markAsDirty();
  }

  onBlur(event: FocusEvent): void {
    const input = event.target as HTMLInputElement;
    const raw = commaFree(this.formControl.value);
    const parseCandidate = /^\d+\.$/.test(raw) ? raw.slice(0, -1) : raw;
    const parsed = parseCandidate ? parseAmountShorthand(parseCandidate) : null;

    if (parsed?.ok) {
      this.formControl.setValue(parsed.value);
      this.displayValue = groupNumericInput(parsed.value);
      input.value = this.displayValue;
    }
    this.formControl.markAsTouched();
  }
}
