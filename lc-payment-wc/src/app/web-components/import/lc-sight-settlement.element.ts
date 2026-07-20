import {
  JournalResult, fmt,
  ChargeItem, renderChargeSection, groupChargesByCcy,
  CUSTOMERS,
} from '../shared';

// A4 — Import LC Sight Settlement (IBL → Customer)
// Margin was consumed in A3 (used to fund Nostro).
// iblAmount = Bill − Margin (net from A3). Customer simply repays the IBL.
// Dr CA (chosen ccy) / Cr IBL (transaction ccy).

const CCY_OPTIONS = ['USD', 'EUR', 'JPY', 'GBP'];

const STYLES = `
  :host{display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px}
  .card-title{font-size:15px;font-weight:700;color:#1e3a5f;margin:0 0 16px;padding-bottom:10px;border-bottom:2px solid #dbeafe}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
  label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#374151}
  input,select{border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:100%;box-sizing:border-box;outline:none}
  input:focus,select:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
  .hint{font-size:11px;color:#6b7280;margin-top:2px}
  .btn{margin-top:16px;background:#1d4ed8;color:#fff;border:none;border-radius:7px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer}
  .btn:hover{background:#1e40af} .btn:disabled{background:#93c5fd;cursor:not-allowed}
  .spinner{margin-top:16px;color:#3b82f6;font-size:13px;font-style:italic}
  .err{margin-top:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:13px}
  .result-section{margin-top:20px;display:flex;flex-direction:column;gap:14px}
  .sum-card{background:#fdf4ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px 18px}
  .sum-title{font-size:11px;font-weight:700;color:#7e22ce;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
  .sum-grid{display:grid;grid-template-columns:1fr auto;gap:5px 24px;font-size:13px}
  .sl{color:#6b7280} .sv{font-weight:600;color:#111827;text-align:right;font-family:Consolas,monospace;white-space:nowrap}
  .sep{grid-column:1/-1;border:none;border-top:1px dashed #e9d5ff;margin:4px 0}
  .total-lbl{color:#1e3a5f;font-weight:700} .total-val{color:#1d4ed8;font-weight:700;font-size:14px}
  .note{margin-top:10px;font-size:12px;color:#4b5563;background:#fff;border-left:3px solid #c084fc;padding:6px 10px;border-radius:0 4px 4px 0}
`;

export class LcSightSettlementElement extends HTMLElement {
  private _form = {
    applicantId: 'C-001',
    iblAmount:   90000,    // net IBL from A3 (= bill − margin), in transaction ccy
    iblCurrency: 'USD',
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
    const ccy = this._form.iblCurrency;
    // Customer repays IBL: default in transaction ccy (foreign), option for TWD
    this._charges = [
      { id: 'net', label: '還款 IBL Repayment', amtTwd: Number(s['iblTwd']), ccy, ccyOptions: [ccy, 'TWD'] },
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
      <div class="card-title">A4 — Import LC Sight Settlement (IBL → Customer)</div>
      <form id="form">
        <div class="form-grid">
          <label>客戶 Customer
            <select id="applicantId">${CUSTOMERS.map(c =>
              `<option value="${c.id}" ${c.id === f.applicantId ? 'selected' : ''}>${c.id} ${c.name}</option>`).join('')}
            </select>
          </label>
          <label>IBL Amount (Net)
            <input type="number" id="iblAmount" value="${f.iblAmount}" min="0.01" step="any" required/>
            <span class="hint">= Bill Amount − Margin (from A3)</span>
          </label>
          <label>IBL Currency
            <select id="iblCurrency">${CCY_OPTIONS.map(c =>
              `<option value="${c}" ${c === f.iblCurrency ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
        </div>
        <button class="btn" type="submit" ${this._loading ? 'disabled' : ''}>${this._loading ? 'Calculating…' : 'Calculate IBL Settlement'}</button>
      </form>
      ${this._loading ? '<div class="spinner">Fetching from server…</div>' : ''}
      ${this._error   ? `<div class="err">⚠ ${this._error}</div>` : ''}
      ${s ? `<div class="result-section">
        <div class="sum-card">
          <div class="sum-title">IBL Settlement Summary</div>
          <div class="sum-grid">
            <span class="sl total-lbl">IBL Amount (Net)</span><span class="sv total-val">${f.iblCurrency} ${fmt(Number(s['iblAmount']), f.iblCurrency)}</span>
            <span class="sl">IBL TWD Equiv.</span><span class="sv">TWD ${fmt(Number(s['iblTwd']), 'TWD')}</span>
            <span class="sl">FX Rate</span><span class="sv">${f.iblCurrency}/TWD = ${s['fxRate']}</span>
          </div>
          <div class="note">Margin was consumed in A3 (used to fund Nostro). This repayment clears only the net IBL advance.</div>
        </div>
        ${renderChargeSection({ charges: this._charges, rates, appId: f.applicantId, payAccts: this._payAccts })}
        <journal-entry entries="${JSON.stringify(this._result!.entries).replace(/"/g, '&quot;')}"></journal-entry>
      </div>` : ''}
    </div>`;

    this._shadow.getElementById('form')?.addEventListener('submit', e => { e.preventDefault(); this._calculate(false); });

    const bs = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLSelectElement | null)
      ?.addEventListener('change', e => {
        (f as Record<string, unknown>)[k] = (e.target as HTMLSelectElement).value;
        if (k === 'applicantId') { this._payAccts = {}; if (this._result) this._draw(); }
        if (k === 'iblCurrency') { this._charges = []; this._payAccts = {}; }
      });
    const bn = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLInputElement | null)
      ?.addEventListener('change', e => { (f as Record<string, unknown>)[k] = Number((e.target as HTMLInputElement).value); });
    bs('applicantId', 'applicantId'); bn('iblAmount', 'iblAmount'); bs('iblCurrency', 'iblCurrency');

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
      const res = await fetch('/api/import/sight-settlement/calc', {
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
customElements.define('lc-sight-settlement', LcSightSettlementElement);
