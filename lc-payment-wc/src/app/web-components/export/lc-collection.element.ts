import {
  JournalResult, fmt,
  ChargeItem, renderChargeSection, groupChargesByCcy,
  CUSTOMERS,
} from '../shared';

// B5 — Export LC Settlement without EBL (On Collection)
// Dr Nostro (bill−fbc) | Dr CA (FBC) only if FBC ccy ≠ Cr CA ccy
// Dr CA (ColFee) only if ColFee ccy ≠ Cr CA ccy
// Cr CA = bill − (embedded FBC) − (embedded ColFee) | Cr Collection Fee Income (TWD)

const CCY_OPTIONS = ['USD', 'EUR', 'JPY', 'GBP'];

const STYLES = `
  :host{display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px}
  .card-title{font-size:15px;font-weight:700;color:#1e3a5f;margin:0 0 16px;padding-bottom:10px;border-bottom:2px solid #fed7aa}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
  label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#374151}
  input,select{border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:100%;box-sizing:border-box;outline:none}
  input:focus,select:focus{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.15)}
  .btn{margin-top:16px;background:#ea580c;color:#fff;border:none;border-radius:7px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer}
  .btn:hover{background:#c2410c} .btn:disabled{background:#fed7aa;cursor:not-allowed}
  .spinner{margin-top:16px;color:#f97316;font-size:13px;font-style:italic}
  .err{margin-top:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:13px}
  .result-section{margin-top:20px;display:flex;flex-direction:column;gap:14px}
  .sum-card{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 18px}
  .sum-title{font-size:11px;font-weight:700;color:#c2410c;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em}
  .sum-grid{display:grid;grid-template-columns:1fr auto;gap:5px 24px;font-size:13px}
  .sl{color:#6b7280} .sv{font-weight:600;color:#111827;text-align:right;font-family:Consolas,monospace;white-space:nowrap}
  .sep{grid-column:1/-1;border:none;border-top:1px dashed #fed7aa;margin:4px 0}
  .total-lbl{color:#1e3a5f;font-weight:700} .total-val{color:#ea580c;font-weight:700;font-size:14px}
`;

export class LcExportCollectionElement extends HTMLElement {
  private _form = {
    beneficiaryId:      'C-001',
    billAmount:         200000,
    billCurrency:       'USD',
    collectionRate:     0.05,   // % of bill TWD
    foreignBankCharges: 50,     // in billCurrency (transaction ccy)
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
    const fbc = Number(s['foreignBankCharges']) || 0;
    // FBC: if same ccy as bill credit → embedded in Cr CA; if different → Dr CA separately
    const charges: ChargeItem[] = fbc > 0
      ? [{ id: 'fbc', label: '外行費 Foreign Bank Charges', amtTwd: Number(s['fbcTwd']), ccy, ccyOptions: [ccy, 'TWD'] }]
      : [];
    // Collection fee: always shown — customer selects TWD or billCcy to pay
    charges.push({ id: 'colFee', label: '代收手續費 Collection Fee', amtTwd: Number(s['collectionFee']), ccy: 'TWD', ccyOptions: ['TWD', ccy] });
    // Bill credit: shows actual Cr CA net (after any embedded charges)
    charges.push({ id: 'net', label: '票款入帳 Bill Credit', amtTwd: Number(s['crCaTwd']), ccy, ccyOptions: [ccy, 'TWD'] });
    this._charges = charges;
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
    const fbc    = s ? Number(s['foreignBankCharges']) : 0;
    const fbcTwd = s ? Number(s['fbcTwd']) : 0;
    const colFee = s ? Number(s['collectionFee']) : 0;

    this._shadow.innerHTML = `<style>${STYLES}</style>
    <div class="card">
      <div class="card-title">B5 — Export LC On Collection (Settlement without EBL)</div>
      <form id="form">
        <div class="form-grid">
          <label>出口商 Beneficiary
            <select id="beneficiaryId">${CUSTOMERS.map(c =>
              `<option value="${c.id}" ${c.id === f.beneficiaryId ? 'selected' : ''}>${c.id} ${c.name}</option>`).join('')}
            </select>
          </label>
          <label>Bill Amount <input type="number" id="billAmount" value="${f.billAmount}" min="0.01" step="any" required/></label>
          <label>Bill Currency
            <select id="billCurrency">${CCY_OPTIONS.map(c =>
              `<option value="${c}" ${c === f.billCurrency ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
          <label>Collection Rate (%) <input type="number" id="collectionRate" value="${f.collectionRate}" min="0" step="0.001"/></label>
          <label>Foreign Bank Charges (${f.billCurrency})
            <input type="number" id="foreignBankCharges" value="${f.foreignBankCharges}" min="0" step="any"/>
          </label>
        </div>
        <button class="btn" type="submit" ${this._loading ? 'disabled' : ''}>${this._loading ? 'Calculating…' : 'Calculate Collection'}</button>
      </form>
      ${this._loading ? '<div class="spinner">Fetching from server…</div>' : ''}
      ${this._error   ? `<div class="err">⚠ ${this._error}</div>` : ''}
      ${s ? `<div class="result-section">
        <div class="sum-card">
          <div class="sum-title">On Collection Summary</div>
          <div class="sum-grid">
            <span class="sl">Bill Amount</span><span class="sv">${f.billCurrency} ${fmt(Number(s['billAmount']), f.billCurrency)}</span>
            <span class="sl">Bill TWD</span><span class="sv">TWD ${fmt(Number(s['billTwd']), 'TWD')}</span>
            <span class="sl">Collection Fee (${f.collectionRate}%)</span><span class="sv">TWD ${fmt(colFee, 'TWD')}${s['minimumApplied'] ? ' (min)' : ''}</span>
            ${fbc > 0 ? `<span class="sl">Foreign Bank Charges</span><span class="sv">${f.billCurrency} ${fmt(fbc, f.billCurrency)} ≈ TWD ${fmt(fbcTwd, 'TWD')}</span>` : ''}
            <span class="sl">FX Rate</span><span class="sv">${f.billCurrency}/TWD = ${s['fxRate']}</span>
          </div>
        </div>
        ${renderChargeSection({ charges: this._charges, rates, appId: f.beneficiaryId, payAccts: this._payAccts, creditMode: true })}
        <journal-entry entries="${JSON.stringify(this._result!.entries).replace(/"/g, '&quot;')}"></journal-entry>
      </div>` : ''}
    </div>`;

    this._shadow.getElementById('form')?.addEventListener('submit', e => { e.preventDefault(); this._calculate(false); });

    const bs = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLSelectElement | null)
      ?.addEventListener('change', e => {
        (f as Record<string, unknown>)[k] = (e.target as HTMLSelectElement).value;
        if (k === 'beneficiaryId') { this._payAccts = {}; if (this._result) this._draw(); }
        if (k === 'billCurrency')  { this._charges = []; this._payAccts = {}; }
      });
    const bn = (id: string, k: keyof typeof f) => (this._shadow.getElementById(id) as HTMLInputElement | null)
      ?.addEventListener('change', e => { (f as Record<string, unknown>)[k] = Number((e.target as HTMLInputElement).value); });
    bs('beneficiaryId', 'beneficiaryId'); bn('billAmount', 'billAmount');
    bs('billCurrency', 'billCurrency');   bn('collectionRate', 'collectionRate');
    bn('foreignBankCharges', 'foreignBankCharges');

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
      const res = await fetch('/api/export/collection/calc', {
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
customElements.define('lc-export-collection', LcExportCollectionElement);
