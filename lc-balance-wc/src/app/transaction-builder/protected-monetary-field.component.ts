import { Component } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import { formatCurrencyAmount } from './balance-component.model';

@Component({
  selector: 'app-protected-monetary-field',
  standalone: true,
  template: `
    <label class="form-label" [class.required]="props.required">{{ props.label }}</label>
    <input class="form-control" type="text" [value]="displayValue" disabled />
  `,
})
export class ProtectedMonetaryFieldComponent extends FieldType<FieldTypeConfig> {
  get displayValue(): string {
    return formatCurrencyAmount(this.model?.[String(this.key)], this.model?.currency);
  }
}
