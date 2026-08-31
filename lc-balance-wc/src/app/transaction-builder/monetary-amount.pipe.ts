import { Pipe, PipeTransform } from '@angular/core';
import { formatCurrencyAmount } from './balance-component.model';

@Pipe({ name: 'monetaryAmount', standalone: true, pure: true })
export class MonetaryAmountPipe implements PipeTransform {
  transform(value: string | number | null | undefined, currency: string | null | undefined): string {
    return formatCurrencyAmount(value, currency);
  }
}
