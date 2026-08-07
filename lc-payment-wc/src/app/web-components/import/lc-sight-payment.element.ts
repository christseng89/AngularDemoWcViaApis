import {
  JournalResult, fmt, escapeHtml,
  ChargeItem, renderChargeSection, groupChargesByCcy,
  CUSTOMERS, CCYS,
} from '../shared';

// A3 — Import LC Sight Payment (IBL Lodgement)
// IBL = Bill Amount − Margin (net bank exposure).
// Margin Pledge Dr'd to fund Nostro. Dr CA for corr charges (customer's chosen ccy).

const STYLES = `
  :host{display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px}
  .card-title{font-size:15px;font-weight:700;color:#1e3a5f;margin:0 0 16px;padding-bottom:10px;border-bottom:2px solid #dbeafe}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
  label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#374151}
  input,select{border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:100%;box-sizing:border-box;outline:none}
  input:focus,select:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
  .btn{margin-top:16px;background:#1d4ed8;color:#fff;border:none;border-radius:7px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer}
  .btn:hover{background:#1e40af} .btn:disabled{background:#93c5fd;cursor:not-allowed}
  .spinner{margin-top:16px;color:#3b82f6;font-size:13px;font-style:italic}
  .err{margin-top:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:13px}
  .result-section{margin-top:20px;display:flex;flex-direction:column;gap:14px}
  .sum-card{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 18px}
  .sum-title{font-size:11px;font-weight:700;color:#b45309;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
  .sum-grid{display:grid;grid-template-columns:1fr auto;gap:5px 24px;font-size:13px}
  .sl{color:#6b7280} .sv{font-weight:600;color:#111827;text-align:right;font-family:Consolas,monospace;white-space:nowrap}
  .sep{grid-column:1/-1;border:none;border-top:1px dashed #fde68a;margin:4px 0}
  .total-lbl{color:#1e3a5f;font-weight:700} .total-val{color:#b45309;font-weight:700;font-size:14px}
`;

export class LcSightPaymentElement extends HTMLElement {
  private _form = {
    applicantId:        'C-001',
    billAmount:         100000,
    billCurrency:       'USD',
    marginHeld:         10000,   // in billCurrency (from A1 LC issuance)
    corrBankCharges:    50,
    corrBankChargesCcy: 'USD',
  };
  private _result: JournalResult | null = null;
  private _loading = false; private _error: string | null = null; private _reqId = 0;
  private _charges: ChargeItem[] = [];
  private _payAccts: Record<string, string> = {};
  private _shadow: ShadowRoot;

  constructor() { super(); this._shadow = this.attachShadow({ mode: 'open' }); }
  connectedCallback(): void { this._draw(); }

  private _initCharges() {
    if (!this._result || this._charges.length) return;
    const s   = this._result.summary;
    const ccy = this._form.billCurrency;
    // Corr bank charges: default in transaction ccy (foreign), option for TWD
    this._charges = [
      { id: 'corr', label: '電報費 Corr Bank Charges', amtTwd: Number(s['corrChargeTwd']), ccy, ccyOptions: [ccy, 'TWD'] },
    ];
  }

  private _chargeSelections(): Record<string, string> {
    const sel: Record<string, string> = {};
    for (const c of this._charges) sel[c.id] = c.ccy;
    return sel;
  }

  private _draw(): void {
    const f = this._form; const s = this._result?.summary;
    const rates = (this._result?.rates ?? {}) as Record<string, number>;
    this._initCharges();

    this._shadow.innerHTML = `<style>${STYLES}</style>
    <div class="card">
      <div class="card-title">A3 — Import LC Sight Payment (IBL Lodgement)</div>
      <form id="form">
        <div class="form-grid">
          <label>客戶 Customer
            <select id="applicantId">${CUSTOMERS.map(c =>
              `<option value="${c.id}" ${c.id === f.applicantId ? 'selected' : ''}>${c.id} ${c.name}</option>`).join('')}
            </select>
          </label>
          <label>Bill Amount <input type="number" id="billAmount" value="${f.billAmount}" min="0.01" step="any" required/></label>
          <label>Bill Currency
            <select id="billCurrency">${CCYS.map(c =>
              `<option value="${c}" ${c === f.billCurrency ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
          <label>Margin Held (${f.billCurrency})
            <input type="number" id="marginHeld" value="${f.marginHeld}" min="0" step="any"/>
          </label>
          <label>Corr Bank Charges <input type="number" id="corrBankCharges" value="${f.corrBankCharges}" min="0" step="any"/></label>
          <label>Corr Charges CCY
            <select id="corrBankChargesCcy">${CCYS.map(c =>
              `<option value="${c}" ${c === f.corrBankChargesCcy ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
        </div>
        <button class="btn" type="submit" ${this._loading ? 'disabled' : ''}>${this._loading ? 'Calculating…' : 'Calculate IBL Lodgement'}</button>
      </form>
      ${this._loading ? '<div class="spinner">Fetching from server…</div>' : ''}
      ${this._error   ? `<div class="err">⚠ ${escapeHtml(this._error)}</div>` : ''}
      ${s ? `<div class="result-section">
        <div class="sum-card">
          <div class="sum-title">IBL Lodgement Summary</div>
          <div class="sum-grid">
            <span class="sl">Bill Amount</span><span class="sv">${f.billCurrency} ${fmt(Number(s['billAmount']), f.billCurrency)}</span>
            <span class="sl">Margin Held (${f.billCurrency})</span><span class="sv">${f.billCurrency} ${fmt(Number(s['marginHeld']), f.billCurrency)} ≈ TWD ${fmt(Number(s['marginTwd']), 'TWD')}</span>
            <span class="sl total-lbl">Net IBL Lodged (${f.billCurrency})</span><span class="sv total-val">${f.billCurrency} ${fmt(Number(s['iblAmount']), f.billCurrency)} ≈ TWD ${fmt(Number(s['iblTwd']), 'TWD')}</span>
            <hr class="sep"/>
            <span class="sl">Corr Charges</span><span class="sv">${f.corrBankChargesCcy} ${fmt(Number(s['corrBankCharges']), f.corrBankChargesCcy)} ≈ TWD ${fmt(Number(s['corrChargeTwd']), 'TWD')}</span>
            <span class="sl">Nostro Total (${f.billCurrency})</span><span class="sv">${f.billCurrency} ${fmt(Number(s['nostroTotal']), f.billCurrency)} ≈ TWD ${fmt(Number(s['nostroTotalTwd']), 'TWD')}</span>
            <span class="sl">FX Rate</span><span class="sv">${f.billCurrency}/TWD = ${s['fxRate']}</span>
          </div>
        </div>
        ${renderChargeSection({ charges: this._charges, rates, appId: f.applicantId, payAccts: this._payAccts })}
        <journal-entry entries="${escapeHtml(JSON.stringify(this._result!.entries))}"></journal-entry>
      </div>` : ''}
    </div>`;

    this._shadow.getElementById('form')?.addEventListener('submit', e => { e.preventDefault(); this._calculate(false); });

    const bs = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLSelectElement | null)
      ?.addEventListener('change', e => {
        (f as Record<string, unknown>)[k] = (e.target as HTMLSelectElement).value;
        if (k === 'applicantId') { this._payAccts = {}; if (this._result) this._draw(); }
        if (k === 'billCurrency') { this._charges = []; this._payAccts = {}; }
      });
    const bn = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLInputElement | null)
      ?.addEventListener('change', e => { (f as Record<string, unknown>)[k] = Number((e.target as HTMLInputElement).value); });
    bs('applicantId', 'applicantId'); bn('billAmount', 'billAmount');
    bs('billCurrency', 'billCurrency'); bn('marginHeld', 'marginHeld');
    bn('corrBankCharges', 'corrBankCharges'); bs('corrBankChargesCcy', 'corrBankChargesCcy');

    for (const c of this._charges) {
      (this._shadow.getElementById(`charge-ccy-${c.id}`) as HTMLSelectElement | null)
        ?.addEventListener('change', e => {
          c.ccy = (e.target as HTMLSelectElement).value;
          this._calculate(true);
        });
    }
    const groups = groupChargesByCcy(this._charges, rates);
    for (const g of groups) {
      (this._shadow.getElementById(`pay-acct-${g.ccy}`) as HTMLSelectElement | null)
        ?.addEventListener('change', e => { this._payAccts[g.ccy] = (e.target as HTMLSelectElement).value; });
    }
  }

  private async _calculate(fromChargeChange = false): Promise<void> {
    const chargeSelections = this._chargeSelections();
    if (!fromChargeChange) { this._charges = []; this._payAccts = {}; }
    const id = ++this._reqId; this._loading = true; this._error = null; this._draw();
    try {
      const body = { ...this._form, chargeSelections };
      const res = await fetch('/api/import/sight-payment/calc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (id !== this._reqId) return;
      if (!res.ok) { const t = await res.text(); let m = t; try { m = JSON.parse(t)?.error ?? t; } catch {} throw new Error(m); }
      this._result = await res.json();
    } catch (e: unknown) {
      if (id !== this._reqId) return;
      this._error = (e as Error).message; this._result = null;
    } finally {
      if (id === this._reqId) { this._loading = false; this._draw(); }
    }
  }
}
customElements.define('lc-sight-payment', LcSightPaymentElement);
