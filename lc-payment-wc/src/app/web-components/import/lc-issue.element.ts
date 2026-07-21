import {
  JournalResult, fmt,
  ChargeItem, renderChargeSection, groupChargesByCcy,
  CUSTOMERS,
} from '../shared';

const CCY_OPTIONS = ['USD', 'EUR', 'JPY', 'GBP'];
const COUNTRIES   = ['US', 'DE', 'JP', 'GB', 'CN', 'AU'];

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
  .sum-card{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 18px}
  .sum-title{font-size:11px;font-weight:700;color:#0369a1;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
  .sum-grid{display:grid;grid-template-columns:1fr auto;gap:5px 24px;font-size:13px}
  .sl{color:#6b7280} .sv{font-weight:600;color:#111827;text-align:right;font-family:Consolas,monospace;white-space:nowrap}
  .sep{grid-column:1/-1;border:none;border-top:1px dashed #bae6fd;margin:4px 0}
  .total-lbl{color:#1e3a5f;font-weight:700} .total-val{color:#1d4ed8;font-weight:700;font-size:14px}
`;

export class LcIssueElement extends HTMLElement {
  private _form = {
    lcAmount: 100000, lcCurrency: 'USD', marginRate: 10, commRate: 0.25, tolerancePct: 0,
    applicantId: 'C-001', beneficiaryCountry: 'US',
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
    const s   = this._result.summary;
    const ccy = this._form.lcCurrency;
    // Margin: default = transaction currency (foreign); options = [foreign, TWD]
    // Commission: default = TWD; options = [TWD, foreign]
    // SWIFT: always TWD (read-only)
    this._charges = [
      { id: 'margin', label: '保證金 Margin',    amtTwd: Number(s['marginTwd']), ccy,    ccyOptions: [ccy, 'TWD'] },
      { id: 'comm',   label: '手續費 Commission', amtTwd: Number(s['commTwd']),   ccy: 'TWD', ccyOptions: ['TWD', ccy] },
      { id: 'swift',  label: 'SWIFT Fee',         amtTwd: Number(s['swiftTwd']),  ccy: 'TWD', ccyOptions: ['TWD', ccy] },
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
      <div class="card-title">A1 — Import LC Issue</div>
      <form id="form">
        <div class="form-grid">
          <label>客戶 Customer
            <select id="applicantId">${CUSTOMERS.map(c =>
              `<option value="${c.id}" ${c.id === f.applicantId ? 'selected' : ''}>${c.id} ${c.name}</option>`).join('')}
            </select>
          </label>
          <label>LC Amount <input type="number" id="lcAmount" value="${f.lcAmount}" min="0.01" step="any" required/></label>
          <label>LC Currency
            <select id="lcCurrency">${CCY_OPTIONS.map(c =>
              `<option value="${c}" ${c === f.lcCurrency ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
          <label>Margin Rate (%) <input type="number" id="marginRate" value="${f.marginRate}" min="0" max="100" step="0.5"/></label>
          <label>Commission Rate (%) <input type="number" id="commRate" value="${f.commRate}" min="0" step="0.01"/></label>
          <label>Tolerance (%) <input type="number" id="tolerancePct" value="${f.tolerancePct}" min="0" step="0.5"/></label>
          <label>Beneficiary Country
            <select id="beneficiaryCountry">${COUNTRIES.map(c =>
              `<option value="${c}" ${c === f.beneficiaryCountry ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
        </div>
        <button class="btn" type="submit" ${this._loading ? 'disabled' : ''}>${this._loading ? 'Calculating…' : 'Calculate Journal Entries'}</button>
      </form>
      ${this._loading ? '<div class="spinner">Fetching from server…</div>' : ''}
      ${this._error   ? `<div class="err">⚠ ${this._error}</div>` : ''}
      ${s ? `<div class="result-section">
        <div class="sum-card">
          <div class="sum-title">Transaction Summary</div>
          <div class="sum-grid">
            <span class="sl">LC Amount</span><span class="sv">${f.lcCurrency} ${fmt(Number(s['lcAmount']), f.lcCurrency)}</span>
            <span class="sl">Margin (${s['marginRate']}%) — ${f.lcCurrency}</span><span class="sv">${f.lcCurrency} ${fmt(Number(s['marginLcAmt']), f.lcCurrency)} ≈ TWD ${fmt(Number(s['marginTwd']), 'TWD')}</span>
            <span class="sl">LC Balance (Amt × (1+Tol ${s['tolerancePct']}%))</span><span class="sv">${f.lcCurrency} ${fmt(Number(s['lcBalance']), f.lcCurrency)}</span>
            <span class="sl">Commission (${s['commRate']}% of LC Balance)</span><span class="sv">TWD ${fmt(Number(s['commTwd']), 'TWD')}</span>
            <span class="sl">SWIFT Fee</span><span class="sv">TWD ${fmt(Number(s['swiftTwd']), 'TWD')}</span>
            <hr class="sep"/>
            <span class="sl total-lbl">Total Dr CA (TWD equiv.)</span><span class="sv total-val">TWD ${fmt(Number(s['totalDrCaTwd']), 'TWD')}</span>
            <span class="sl">FX Rate</span><span class="sv">${f.lcCurrency}/TWD = ${s['fxRate']}</span>
          </div>
        </div>
        ${renderChargeSection({ charges: this._charges, rates, appId: f.applicantId, payAccts: this._payAccts })}
        <journal-entry entries="${JSON.stringify(this._result!.entries).replace(/"/g, '&quot;')}"></journal-entry>
      </div>` : ''}
    </div>`;

    this._shadow.getElementById('form')?.addEventListener('submit', e => { e.preventDefault(); this._calc(false); });

    const bs = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLSelectElement | null)
      ?.addEventListener('change', e => {
        (f as Record<string, unknown>)[k] = (e.target as HTMLSelectElement).value;
        if (k === 'applicantId') { this._payAccts = {}; if (this._result) this._draw(); }
        if (k === 'lcCurrency')  { this._charges = []; this._payAccts = {}; }
      });
    const bn = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLInputElement | null)
      ?.addEventListener('change', e => { (f as Record<string, unknown>)[k] = Number((e.target as HTMLInputElement).value); });
    bs('applicantId', 'applicantId'); bn('lcAmount', 'lcAmount'); bs('lcCurrency', 'lcCurrency');
    bn('marginRate', 'marginRate'); bn('commRate', 'commRate'); bn('tolerancePct', 'tolerancePct');
    bs('beneficiaryCountry', 'beneficiaryCountry');

    // Charge currency change → re-call server with new selections to update journal entries
    for (const c of this._charges) {
      (this._shadow.getElementById(`charge-ccy-${c.id}`) as HTMLSelectElement | null)
        ?.addEventListener('change', e => {
          c.ccy = (e.target as HTMLSelectElement).value;
          this._calc(true);  // re-calc with current charge selections, no form reset
        });
    }
    // Payment account selects (no re-calc needed)
    const groups = groupChargesByCcy(this._charges, rates);
    for (const g of groups) {
      (this._shadow.getElementById(`pay-acct-${g.ccy}`) as HTMLSelectElement | null)
        ?.addEventListener('change', e => { this._payAccts[g.ccy] = (e.target as HTMLSelectElement).value; });
    }
  }

  // fromChargeChange=true: keep _charges intact, just refresh journal entries
  // fromChargeChange=false (default): full reset — new form submission
  private async _calc(fromChargeChange = false) {
    // Capture selections before any reset
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
      const res = await fetch('/api/import/issue/calc', {
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
customElements.define('lc-issue-payment', LcIssueElement);
