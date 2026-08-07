import {
  JournalResult, fmt, escapeHtml,
  ChargeItem, renderChargeSection, groupChargesByCcy,
  CUSTOMERS, CCYS,
} from '../shared';

const STYLES = `
  :host{display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px}
  .card-title{font-size:15px;font-weight:700;color:#1e3a5f;margin:0 0 16px;padding-bottom:10px;border-bottom:2px solid #dbeafe}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
  label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#374151}
  input,select{border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:100%;box-sizing:border-box;outline:none}
  input:focus,select:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
  .btn{margin-top:16px;background:#1d4ed8;color:#fff;border:none;border-radius:7px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer}
  .btn:hover{background:#1e40af} .btn:disabled{background:#93c5fd;cursor:not-allowed}
  .spinner{margin-top:16px;color:#3b82f6;font-size:13px;font-style:italic}
  .err{margin-top:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:13px}
  .result-section{margin-top:20px;display:flex;flex-direction:column;gap:14px}
  .sum-card{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px}
  .sum-title{font-size:11px;font-weight:700;color:#15803d;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
  .sum-grid{display:grid;grid-template-columns:1fr auto;gap:5px 24px;font-size:13px}
  .sl{color:#6b7280} .sv{font-weight:600;color:#111827;text-align:right;font-family:Consolas,monospace;white-space:nowrap}
  .sep{grid-column:1/-1;border:none;border-top:1px dashed #d1fae5;margin:4px 0}
  .total-lbl{color:#1e3a5f;font-weight:700} .total-val{color:#1d4ed8;font-weight:700;font-size:14px}
  .note{margin-top:10px;font-size:12px;color:#4b5563;background:#fff;border-left:3px solid #86efac;padding:6px 10px;border-radius:0 4px 4px 0}
`;

export class LcImportSettlementElement extends HTMLElement {
  private _form = {
    applicantId: 'C-001',
    billAmount: 100000,
    billCurrency: 'USD',
    marginHeld: 10000,         // in billCurrency (foreign) — was marginHeldTwd
    corrBankCharges: 50,
    corrBankChargesCcy: 'USD',
  };
  private _result: JournalResult | null = null;
  private _loading = false; private _error: string | null = null; private _reqId = 0;
  private _charges: ChargeItem[] = [];
  private _payAccts: Record<string, string> = {};
  private _shadow: ShadowRoot;

  constructor() { super(); this._shadow = this.attachShadow({ mode: 'open' }); }
  connectedCallback() { this._draw(); }

  private _initCharges() {
    if (!this._result || this._charges.length) return;
    const s = this._result.summary;
    const billCcy = this._form.billCurrency;
    // ONE net charge row: billAmount + corrCharges − marginHeld (in billCcy)
    this._charges = [
      {
        id: 'net',
        label: '淨付款 Net CA Payment',
        amtTwd: Number(s['netCaTwd']),
        ccy: billCcy,
        ccyOptions: [billCcy, 'TWD'],
      },
    ];
  }

  private _chargeSelections(): Record<string, string> {
    const sel: Record<string, string> = {};
    for (const c of this._charges) sel[c.id] = c.ccy;
    return sel;
  }

  private _draw() {
    const f = this._form; const s = this._result?.summary;
    const rates = (this._result?.rates ?? {}) as Record<string, number>;
    this._initCharges();

    this._shadow.innerHTML = `<style>${STYLES}</style>
    <div class="card">
      <div class="card-title">A2 — Import LC Settlement (Sight / Usance)</div>
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
        <button class="btn" type="submit" ${this._loading ? 'disabled' : ''}>${this._loading ? 'Calculating…' : 'Calculate Settlement'}</button>
      </form>
      ${this._loading ? '<div class="spinner">Fetching from server…</div>' : ''}
      ${this._error   ? `<div class="err">⚠ ${escapeHtml(this._error)}</div>` : ''}
      ${s ? `<div class="result-section">
        <div class="sum-card">
          <div class="sum-title">Settlement Summary</div>
          <div class="sum-grid">
            <span class="sl">Bill Amount</span><span class="sv">${f.billCurrency} ${fmt(Number(s['billAmount']), f.billCurrency)}</span>
            <span class="sl">Bill TWD</span><span class="sv">TWD ${fmt(Number(s['billTwd']), 'TWD')}</span>
            <span class="sl">Corr Bank Charges</span><span class="sv">${f.corrBankChargesCcy} ${fmt(Number(s['corrBankCharges']), f.corrBankChargesCcy)} ≈ TWD ${fmt(Number(s['corrChargeTwd']), 'TWD')}</span>
            <span class="sl">Gross Pay TWD</span><span class="sv">TWD ${fmt(Number(s['totalPayTwd']), 'TWD')}</span>
            <hr class="sep"/>
            <span class="sl">Margin Released (${f.billCurrency})</span><span class="sv">${f.billCurrency} ${fmt(Number(s['marginHeld']), f.billCurrency)} ≈ TWD ${fmt(Number(s['marginTwd']), 'TWD')}</span>
            <span class="sl total-lbl">Net CA Payment (${f.billCurrency})</span><span class="sv total-val">${f.billCurrency} ${fmt(Number(s['netBillCcy']), f.billCurrency)} ≈ TWD ${fmt(Number(s['netCaTwd']), 'TWD')}</span>
          </div>
          <div class="note">Margin held in transaction currency released against gross payment. Net = Bill + Corr − Margin.</div>
        </div>
        ${renderChargeSection({ charges: this._charges, rates, appId: f.applicantId, payAccts: this._payAccts })}
        <journal-entry entries="${escapeHtml(JSON.stringify(this._result!.entries))}"></journal-entry>
      </div>` : ''}
    </div>`;

    this._shadow.getElementById('form')?.addEventListener('submit', e => { e.preventDefault(); this._calc(false); });
    const bs = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLSelectElement | null)
      ?.addEventListener('change', e => {
        (f as Record<string, unknown>)[k] = (e.target as HTMLSelectElement).value;
        if (k === 'applicantId') { this._payAccts = {}; if (this._result) this._draw(); }
        if (k === 'billCurrency' || k === 'corrBankChargesCcy') { this._charges = []; this._payAccts = {}; }
      });
    const bn = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLInputElement | null)
      ?.addEventListener('change', e => { (f as Record<string, unknown>)[k] = Number((e.target as HTMLInputElement).value); });
    bs('applicantId', 'applicantId'); bn('billAmount', 'billAmount'); bs('billCurrency', 'billCurrency');
    bn('marginHeld', 'marginHeld'); bn('corrBankCharges', 'corrBankCharges'); bs('corrBankChargesCcy', 'corrBankChargesCcy');

    for (const c of this._charges) {
      (this._shadow.getElementById(`charge-ccy-${c.id}`) as HTMLSelectElement | null)
        ?.addEventListener('change', e => {
          c.ccy = (e.target as HTMLSelectElement).value;
          this._calc(true);  // re-calc to update journal entry Dr CA currency
        });
    }
    const groups = groupChargesByCcy(this._charges, rates);
    for (const g of groups) {
      (this._shadow.getElementById(`pay-acct-${g.ccy}`) as HTMLSelectElement | null)
        ?.addEventListener('change', e => { this._payAccts[g.ccy] = (e.target as HTMLSelectElement).value; });
    }
  }

  private async _calc(fromChargeChange = false) {
    const chargeSelections = this._chargeSelections();

    if (!fromChargeChange) {
      this._charges = [];
      this._payAccts = {};
    }

    const id = ++this._reqId;
    this._loading = true;
    this._error = null;
    this._draw();

    try {
      const body = { ...this._form, chargeSelections };
      const res = await fetch('/api/import/settlement/calc', {
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
customElements.define('lc-import-settlement', LcImportSettlementElement);
