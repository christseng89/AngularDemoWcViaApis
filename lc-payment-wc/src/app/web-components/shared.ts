// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DrCrEntry {
  leg: 'Dr' | 'Cr';
  account: string;
  accountType: 'CA' | 'Nostro' | 'IBL' | 'EBL' | 'Margin' | 'Income' | 'FX';
  ccy: string;
  amount: number;
  amountTwd: number;
  description: string;
}

export interface JournalResult {
  entries: DrCrEntry[];
  summary: Record<string, unknown>;
  rates: Record<string, number>;
  at: string;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function round(n: number, d: number): number {
  const factor = Math.pow(10, d);
  return Math.round(n * factor) / factor;
}

export function fmt(amount: number, ccy: string): string {
  const decimals = (ccy === 'TWD' || ccy === 'JPY') ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

// ─── Currency list ────────────────────────────────────────────────────────────

export const CCYS = ['USD', 'EUR', 'JPY', 'GBP', 'TWD'] as const;

// ─── Customer DDA Account Database ───────────────────────────────────────────
// Used by collection grids to let the bank officer choose which account to debit.
// pledge=true → 保證金帳號, excluded from fee-collection dropdowns by default.

export interface DdaAcct {
  id: string;
  name: string;
  no: string;
  ccys: string[];
  pledge?: boolean;
}

export const DDA_ACCTS: Record<string, DdaAcct[]> = {
  'C-001': [
    { id: 'A1-T1', name: 'Acme 台幣往來帳戶',    no: '014-10-12345', ccys: ['TWD'] },
    { id: 'A1-U1', name: 'Acme 美元貿易帳戶',    no: '014-20-11001', ccys: ['USD'] },
    { id: 'A1-U2', name: 'Acme 美元保證金帳戶',  no: '014-20-11002', ccys: ['USD'], pledge: true },
    { id: 'A1-FX', name: 'Acme 外幣綜合帳戶',    no: '014-30-99001', ccys: ['USD', 'EUR', 'JPY', 'GBP'] },
  ],
  'C-002': [
    { id: 'A2-T1',  name: 'Beta 台幣往來帳戶',   no: '026-10-22200', ccys: ['TWD'] },
    { id: 'A2-ALL', name: 'Beta 綜合帳戶',        no: '026-30-88800', ccys: ['TWD', 'USD', 'EUR', 'JPY', 'GBP'] },
  ],
  'C-003': [
    { id: 'A3-T1', name: 'Gamma 台幣帳戶',        no: '012-10-77700', ccys: ['TWD'] },
    { id: 'A3-U1', name: 'Gamma 美元帳戶',        no: '012-20-55501', ccys: ['USD'] },
    { id: 'A3-E1', name: 'Gamma 歐元帳戶',        no: '012-20-55502', ccys: ['EUR'] },
    { id: 'A3-J1', name: 'Gamma 日圓帳戶',        no: '012-20-55503', ccys: ['JPY'] },
    { id: 'A3-G1', name: 'Gamma 英鎊帳戶',        no: '012-20-55504', ccys: ['GBP'] },
  ],
  '_default': [
    { id: 'DEF-T',  name: '台幣往來帳戶',         no: 'TWD-DEFAULT',  ccys: ['TWD'] },
    { id: 'DEF-FX', name: '外幣綜合帳戶',         no: 'FX-DEFAULT',   ccys: ['USD', 'EUR', 'JPY', 'GBP'] },
  ],
};

/** Return accounts for applicant+currency. Excludes pledge accounts by default. */
export function ddaAcctsByCcy(appId: string, ccy: string, includePledge = false): DdaAcct[] {
  const pool = DDA_ACCTS[appId] ?? DDA_ACCTS['_default'];
  return pool.filter(a => a.ccys.includes(ccy) && (includePledge || !a.pledge));
}

/** Customer list for the applicant dropdown */
export const CUSTOMERS: { id: string; name: string }[] = [
  { id: 'C-001', name: 'Acme Corp' },
  { id: 'C-002', name: 'Beta Ltd' },
  { id: 'C-003', name: 'Gamma Inc' },
];

// ─── API Service (singleton) ──────────────────────────────────────────────────

class ApiServiceClass {
  private readonly base = '/api';

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try { msg = JSON.parse(text)?.error ?? text; } catch {}
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  calcImportIssue(body: {
    lcAmount: number;
    lcCurrency: string;
    marginRate: number;
    commRate: number;
    tolerancePct: number;
    applicantId: string;
    beneficiaryCountry: string;
  }): Promise<JournalResult> {
    return this.post('/import/issue/calc', body as Record<string, unknown>);
  }

  calcImportSettlement(body: {
    billAmount: number;
    billCurrency: string;
    marginHeldTwd: number;
    corrBankCharges: number;
    corrBankChargesCcy: string;
  }): Promise<JournalResult> {
    return this.post('/import/settlement/calc', body as Record<string, unknown>);
  }

  calcImportSightPayment(body: {
    billAmount: number;
    billCurrency: string;
    corrBankCharges: number;
    corrBankChargesCcy: string;
  }): Promise<JournalResult> {
    return this.post('/import/sight-payment/calc', body as Record<string, unknown>);
  }

  calcImportSightSettlement(body: {
    iblAmount: number;
    iblCurrency: string;
    marginHeldTwd: number;
  }): Promise<JournalResult> {
    return this.post('/import/sight-settlement/calc', body as Record<string, unknown>);
  }

  calcExportAdvise(body: {
    lcAmount: number;
    lcCurrency: string;
    advRate: number;
  }): Promise<JournalResult> {
    return this.post('/export/advise/calc', body as Record<string, unknown>);
  }

  calcExportConfirmed(body: {
    lcAmount: number;
    lcCurrency: string;
    confRate: number;
    tenorDays: number;
    tolerancePct: number;
  }): Promise<JournalResult> {
    return this.post('/export/confirmed/calc', body as Record<string, unknown>);
  }

  calcExportNego(body: {
    billAmount: number;
    billCurrency: string;
    negoRate: number;
    discountDays: number;
    discountRate: number;
  }): Promise<JournalResult> {
    return this.post('/export/nego/calc', body as Record<string, unknown>);
  }

  calcExportSettlement(body: {
    billAmount: number;
    billCurrency: string;
    eblHeldTwd: number;
    settlementType: 'ebl' | 'direct';
  }): Promise<JournalResult> {
    return this.post('/export/settlement/calc', body as Record<string, unknown>);
  }

  getFxRates(): Promise<JournalResult> {
    return this.get('/fx/rates');
  }
}

export const ApiService = new ApiServiceClass();

// ─── Charge Grid + Payment Collection ────────────────────────────────────────
// Each summary screen builds a ChargeItem[] from the server result, lets the
// user choose a collection currency per charge, then groups by ccy for the
// Payment Collection section (DDA account selection).

export interface ChargeItem {
  id: string;           // unique key — used as DOM element id suffix
  label: string;        // display name (Chinese + English)
  amtTwd: number;       // amount in TWD (server-computed, read-only)
  ccy: string;          // currently selected collection currency (mutable)
  ccyOptions: string[]; // selectable currencies (length 1 → read-only display)
}

/** Amount in the charge's selected currency, converted from amtTwd */
export function chargeAmt(item: ChargeItem, rates: Record<string, number>): number {
  if (item.ccy === 'TWD') return round(item.amtTwd, 0);
  const r = rates[`${item.ccy}/TWD`] ?? 0;
  return r ? round(item.amtTwd / r, item.ccy === 'JPY' ? 0 : 2) : 0;
}

/** Group charges by their selected ccy → { ccy, totalAmt, totalTwd }[] */
export function groupChargesByCcy(
  charges: ChargeItem[],
  rates: Record<string, number>,
): { ccy: string; totalAmt: number; totalTwd: number }[] {
  const map = new Map<string, { totalAmt: number; totalTwd: number }>();
  for (const c of charges) {
    const prev = map.get(c.ccy) ?? { totalAmt: 0, totalTwd: 0 };
    map.set(c.ccy, {
      totalAmt: prev.totalAmt + chargeAmt(c, rates),
      totalTwd: prev.totalTwd + c.amtTwd,
    });
  }
  return [...map.entries()].map(([ccy, v]) => ({ ccy, ...v }));
}

export interface ChargeSectionOpts {
  charges: ChargeItem[];
  rates: Record<string, number>;
  appId: string;
  payAccts: Record<string, string>;   // { 'USD': acctId, 'TWD': acctId }
  creditMode?: boolean;               // true → 入帳 (export credit to exporter)
  chargeTitle?: string;
}

/**
 * Renders a two-part blue card:
 *   Top: Charge Grid table (per-charge currency selector + TWD equivalent)
 *   Bottom: Payment Collection table (grouped by ccy → DDA account dropdown)
 *
 * DOM IDs emitted:
 *   charge-ccy-{item.id}  — currency <select> for each charge row
 *   pay-acct-{ccy}        — account <select> for each payment row
 */
export function renderChargeSection(opts: ChargeSectionOpts): string {
  const {
    charges, rates, appId, payAccts,
    creditMode = false,
    chargeTitle = '費用明細 / Charge Details',
  } = opts;

  const totalTwd = charges.reduce((s, c) => s + c.amtTwd, 0);

  // ── Charge rows ──────────────────────────────────────────────────────────
  const chargeRows = charges.map(c => {
    const amt = chargeAmt(c, rates);
    const ccyCell = c.ccyOptions.length > 1
      ? `<select id="charge-ccy-${c.id}" style="${FIELD_STYLE}padding:5px 8px;">${
          c.ccyOptions.map(o => `<option value="${o}" ${o === c.ccy ? 'selected' : ''}>${o}</option>`).join('')
        }</select>`
      : `<div style="font-size:12px;font-weight:700;color:#374151;padding:5px 0;">${c.ccy}</div>`;

    return `<tr>
      <td style="padding:6px 8px;font-size:13px;color:#374151;">${c.label}</td>
      <td style="padding:6px 4px;width:100px;">${ccyCell}</td>
      <td style="padding:6px 8px;text-align:right;font-family:Consolas,monospace;font-size:13px;font-weight:600;color:#1e3a5f;white-space:nowrap;">${c.ccy}&nbsp;${fmt(amt, c.ccy)}</td>
      <td style="padding:6px 8px;text-align:right;font-size:12px;color:#6b7280;white-space:nowrap;">TWD&nbsp;${fmt(c.amtTwd, 'TWD')}</td>
    </tr>`;
  }).join('');

  // ── Payment rows ─────────────────────────────────────────────────────────
  const groups = groupChargesByCcy(charges, rates);
  const acctLabel = creditMode ? '入帳帳號 Credit Account' : '扣帳帳號 Debit Account';
  const payTitle  = creditMode ? '入帳明細 / Payment Receipt' : '扣帳明細 / Payment Collection';

  const payRows = groups.map(g => {
    const accts = ddaAcctsByCcy(appId, g.ccy);
    const sel   = payAccts[g.ccy] || (accts[0]?.id ?? '');
    const acctCell =
      accts.length === 0
        ? `<div style="${FIELD_STYLE}color:#dc2626;font-size:12px;">— No account</div>`
        : accts.length === 1
          ? `<div style="${FIELD_STYLE}background:#f1f5f9;cursor:default;font-size:12px;">${accts[0].no}　${accts[0].name}</div>`
          : `<select id="pay-acct-${g.ccy}" style="${FIELD_STYLE}font-size:12px;">${
              accts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${a.no}　${a.name}</option>`).join('')
            }</select>`;

    return `<tr>
      <td style="padding:6px 8px;">
        <span style="display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:#dbeafe;color:#1e40af;">${g.ccy}</span>
      </td>
      <td style="padding:6px 8px;text-align:right;font-family:Consolas,monospace;font-size:13px;font-weight:700;color:#1e3a5f;white-space:nowrap;">${g.ccy}&nbsp;${fmt(g.totalAmt, g.ccy)}</td>
      <td style="padding:6px 8px;">${acctCell}</td>
    </tr>`;
  }).join('');

  const TH = 'text-align:left;font-size:11px;font-weight:700;color:#64748b;padding:4px 8px;border-bottom:1px solid #bfdbfe;';
  const THR = TH + 'text-align:right;';

  return `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;">
      <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em;">${chargeTitle}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead><tr>
          <th style="${TH}">費用項目 Charge</th>
          <th style="${TH}">付款幣別 CCY</th>
          <th style="${THR}">金額 Amount</th>
          <th style="${THR}">TWD等值</th>
        </tr></thead>
        <tbody>
          ${chargeRows}
          <tr style="border-top:2px solid #bfdbfe;">
            <td colspan="2" style="padding:6px 8px;font-size:12px;font-weight:700;color:#1e3a5f;">合計 Total</td>
            <td></td>
            <td style="padding:6px 8px;text-align:right;font-family:Consolas,monospace;font-size:13px;font-weight:700;color:#1d4ed8;white-space:nowrap;">TWD&nbsp;${fmt(totalTwd, 'TWD')}</td>
          </tr>
        </tbody>
      </table>

      <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em;">${payTitle}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${TH}">付款幣別</th>
          <th style="${THR}">${creditMode ? '入帳金額' : '付款金額'}</th>
          <th style="${TH}">${acctLabel}</th>
        </tr></thead>
        <tbody>${payRows}</tbody>
      </table>
    </div>`;
}

// ─── Shared Payment-Details renderer (legacy — kept for reference) ────────────
// Renders the 付款幣別 / 付款金額 / 扣帳(入)帳帳號 row that appears below every
// summary card.  Uses FX rates already returned by the server — no extra call.

export interface PayDetailsOpts {
  /** Base amount already in TWD (totalDrCaTwd, netCaTwd, etc.) */
  netTwd: number;
  /** rates dict from JournalResult, e.g. { 'USD/TWD': 32.5, … } */
  rates: Record<string, number>;
  /** Currently selected payment currency */
  payCcy: string;
  /** Currently selected account id (empty → auto-select first) */
  payAcctId: string;
  /** Applicant / beneficiary id — used to look up DDA accounts */
  appId: string;
  /** Label for the amount field */
  amtLabel?: string;
  /** true → export direction: show 入帳帳號 instead of 扣帳帳號 */
  creditMode?: boolean;
}

export function renderPaymentDetails(o: PayDetailsOpts): string {
  const {
    netTwd, rates, payCcy, payAcctId, appId,
    amtLabel = '付款金額 Amount',
    creditMode = false,
  } = o;

  // ── Compute payment amount in selected currency ──
  let payAmt: number;
  if (payCcy === 'TWD') {
    payAmt = round(netTwd, 0);
  } else {
    const rate = rates[`${payCcy}/TWD`] ?? 0;
    payAmt = rate ? round(netTwd / rate, payCcy === 'JPY' ? 0 : 2) : 0;
  }

  // ── Account dropdown ──
  const accts   = ddaAcctsByCcy(appId, payCcy);
  const selAcct = payAcctId || (accts[0]?.id ?? '');
  const acctInner =
    accts.length === 0
      ? `<div style="${FIELD_STYLE}color:#dc2626;">— No account found</div>`
      : accts.length === 1
        ? `<div style="${FIELD_STYLE}background:#f1f5f9;cursor:default;">${accts[0].no}　${accts[0].name}</div>`
        : `<select id="pay-acct" style="${FIELD_STYLE}">${
            accts.map(a =>
              `<option value="${a.id}" ${a.id === selAcct ? 'selected' : ''}>${a.no}　${a.name}</option>`
            ).join('')
          }</select>`;

  const acctLabel = creditMode ? '入帳帳號 Credit Account' : '扣帳帳號 Debit Account';
  const hint      = creditMode
    ? 'Select the beneficiary account to credit the payment proceeds.'
    : 'Select the customer DDA account to debit upon confirmation.';

  const CCY_OPTS  = ['TWD', 'USD', 'EUR', 'JPY', 'GBP'];
  const ccySel    = CCY_OPTS.map(c =>
    `<option value="${c}" ${c === payCcy ? 'selected' : ''}>${c}</option>`
  ).join('');

  return `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;">
      <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.06em;">
        付款明細 / Payment Details
      </div>
      <div style="display:grid;grid-template-columns:140px 1fr 2fr;gap:12px;align-items:end;">
        <div>
          <div style="${LBL_STYLE}">付款幣別 Currency</div>
          <select id="pay-ccy" style="${FIELD_STYLE}">${ccySel}</select>
        </div>
        <div>
          <div style="${LBL_STYLE}">${amtLabel}</div>
          <input readonly value="${payCcy} ${fmt(payAmt, payCcy)}"
            style="${FIELD_STYLE}background:#f1f5f9;color:#1e3a5f;font-weight:700;font-family:Consolas,monospace;cursor:default;" />
        </div>
        <div>
          <div style="${LBL_STYLE}">${acctLabel}</div>
          ${acctInner}
        </div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#6b7280;">${hint}</div>
    </div>`;
}

const FIELD_STYLE =
  'border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;' +
  'width:100%;box-sizing:border-box;outline:none;';
const LBL_STYLE =
  'font-size:11px;font-weight:700;color:#374151;margin-bottom:4px;';
