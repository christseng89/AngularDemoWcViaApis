import {
  JournalResult, fmt, escapeHtml,
  ChargeItem, renderChargeSection, groupChargesByCcy,
  CUSTOMERS, CCYS,
} from '../shared';

const STYLES = `
  :host{display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px}
  .card-title{font-size:15px;font-weight:700;color:#1e3a5f;margin:0 0 16px;padding-bottom:10px;border-bottom:2px solid #d1fae5}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
  label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#374151}
  input,select{border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:100%;box-sizing:border-box;outline:none}
  input:focus,select:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.15)}
  .hint{font-size:11px;color:#6b7280;margin-top:2px}
  .btn{margin-top:16px;background:#059669;color:#fff;border:none;border-radius:7px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer}
  .btn:hover{background:#047857} .btn:disabled{background:#6ee7b7;cursor:not-allowed}
  .spinner{margin-top:16px;color:#059669;font-size:13px;font-style:italic}
  .err{margin-top:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:13px}
  .result-section{margin-top:20px;display:flex;flex-direction:column;gap:14px}
  .sum-card{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px}
  .sum-title{font-size:11px;font-weight:700;color:#15803d;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
  .sum-grid{display:grid;grid-template-columns:1fr auto;gap:5px 24px;font-size:13px}
  .sl{color:#6b7280} .sv{font-weight:600;color:#111827;text-align:right;font-family:Consolas,monospace;white-space:nowrap}
  .sep{grid-column:1/-1;border:none;border-top:1px dashed #bbf7d0;margin:4px 0}
  .total-lbl{color:#1e3a5f;font-weight:700} .total-val{color:#059669;font-weight:700;font-size:14px}
`;

export class LcExportConfirmedElement extends HTMLElement {
  private _form = {
    applicantId: 'C-001',
    lcAmount:    500000,
    lcCurrency:  'USD',
    confRate:    0.2,
    tenorDays:   90,
    tolerancePct: 0,
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
    const ccy = this._form.lcCurrency;
    // Confirming commission: default TWD, can also pay in LC currency
    this._charges = [
      { id: 'comm', label: '保兌費 Confirming Commission', amtTwd: Number(s['confCommTwd']), ccy: 'TWD', ccyOptions: ['TWD', ccy] },
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
    const quartersPreview = Math.ceil(f.tenorDays / 90);
    this._initCharges();

    this._shadow.innerHTML = `<style>${STYLES}</style>
    <div class="card">
      <div class="card-title">B2 — Export LC Confirmed</div>
      <form id="form">
        <div class="form-grid">
          <label>客戶 Customer
            <select id="applicantId">${CUSTOMERS.map(c =>
              `<option value="${c.id}" ${c.id === f.applicantId ? 'selected' : ''}>${c.id} ${c.name}</option>`).join('')}
            </select>
          </label>
          <label>LC Amount <input type="number" id="lcAmount" value="${f.lcAmount}" min="0.01" step="any" required/></label>
          <label>LC Currency
            <select id="lcCurrency">${CCYS.map(c =>
              `<option value="${c}" ${c === f.lcCurrency ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
          <label>Confirming Rate (%) <input type="number" id="confRate" value="${f.confRate}" min="0" step="0.01"/></label>
          <label>Tenor Days
            <input type="number" id="tenorDays" value="${f.tenorDays}" min="1" step="1"/>
            <span class="hint">→ ${quartersPreview} quarter(s) of 90 days</span>
          </label>
          <label>Tolerance (%) <input type="number" id="tolerancePct" value="${f.tolerancePct}" min="0" step="0.5"/></label>
        </div>
        <button class="btn" type="submit" ${this._loading ? 'disabled' : ''}>${this._loading ? 'Calculating…' : 'Calculate Confirming Commission'}</button>
      </form>
      ${this._loading ? '<div class="spinner">Fetching from server…</div>' : ''}
      ${this._error   ? `<div class="err">⚠ ${escapeHtml(this._error)}</div>` : ''}
      ${s ? `<div class="result-section">
        <div class="sum-card">
          <div class="sum-title">Confirming Commission Summary</div>
          <div class="sum-grid">
            <span class="sl">LC Amount</span><span class="sv">${f.lcCurrency} ${fmt(Number(s['lcAmount']), f.lcCurrency)}</span>
            <span class="sl">LC Balance (Amt × (1+Tol ${s['tolerancePct']}%))</span><span class="sv">${f.lcCurrency} ${fmt(Number(s['lcBalance']), f.lcCurrency)}</span>
            <span class="sl">Tenor / Quarters</span><span class="sv">${s['tenorDays']} days = ${s['quarters']} qtr(s)</span>
            <span class="sl">Confirming Rate</span><span class="sv">${f.confRate}% per quarter (of LC Balance)</span>
            <span class="sl">FX Rate</span><span class="sv">${f.lcCurrency}/TWD = ${s['fxRate']}</span>
            <span class="sl">Raw Commission</span><span class="sv">TWD ${fmt(Number(s['rawTwd']), 'TWD')}</span>
            <span class="sl">Min Applied?</span><span class="sv">${s['minimumApplied'] ? 'Yes (min TWD 1,000)' : 'No'}</span>
            <hr class="sep"/>
            <span class="sl total-lbl">Confirming Commission</span><span class="sv total-val">TWD ${fmt(Number(s['confCommTwd']), 'TWD')}</span>
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
        if (k === 'lcCurrency')  { this._charges = []; this._payAccts = {}; }
      });
    const bn = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLInputElement | null)
      ?.addEventListener('change', e => {
        (f as Record<string, unknown>)[k] = Number((e.target as HTMLInputElement).value);
        if (k === 'tenorDays') this._draw();  // update quarters preview immediately
      });
    bs('applicantId', 'applicantId'); bn('lcAmount', 'lcAmount');
    bs('lcCurrency', 'lcCurrency');   bn('confRate', 'confRate'); bn('tenorDays', 'tenorDays');
    bn('tolerancePct', 'tolerancePct');

    for (const c of this._charges) {
      (this._shadow.getElementById(`charge-ccy-${c.id}`) as HTMLSelectElement | null)
        ?.addEventListener('change', e => {
          c.ccy = (e.target as HTMLSelectElement).value;
          this._calculate(true);  // re-calc so journal Dr CA ccy updates
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
      const body = { ...this._form, beneficiaryId: this._form.applicantId, chargeSelections };
      const res = await fetch('/api/export/confirmed/calc', {
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
customElements.define('lc-export-confirmed', LcExportConfirmedElement);
