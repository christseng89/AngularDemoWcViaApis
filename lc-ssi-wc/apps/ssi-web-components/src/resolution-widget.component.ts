import { ChangeDetectionStrategy, Component, input, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'ssi-resolution-widget', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host{display:block;font:14px system-ui;color:#17252b}.card{border:1px solid #cad5d0;border-radius:8px;padding:18px;background:#f8f9f5}.tag{font:11px monospace;color:#607174}.route{margin:14px 0;padding:12px;background:#14282d;color:#dfffa5;border-radius:5px;white-space:pre-wrap}button{border:0;border-radius:4px;background:#b9f227;padding:9px 14px;font-weight:700}`],
  template: `<section class="card"><span class="tag">SSI RESOLUTION WEB COMPONENT</span><h3>{{ counterpartyId() }} · {{ currency() }}</h3><button (click)="resolve()">Resolve</button>@if(result();as value){<pre class="route">{{ value }}</pre>}</section>`,
})
export class ResolutionWidgetComponent {
  private readonly http = inject(HttpClient);
  readonly counterpartyId = input('BANK-001'); readonly currency = input('USD'); readonly businessFunction = input('REIMBURSEMENT_CLAIM');
  readonly result = signal('');
  async resolve(): Promise<void> {
    try {
      const value = await firstValueFrom(this.http.post('http://localhost:3100/api/resolve', { counterpartyId: this.counterpartyId(), currency: this.currency(), businessFunction: this.businessFunction(), transactionReference: `WC-${Date.now()}` }));
      this.result.set(JSON.stringify(value, null, 2));
    } catch { this.result.set('Resolution failed closed.'); }
  }
}
