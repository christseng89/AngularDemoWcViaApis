/**
 * <charge-grid> — Server-Side Calculation Edition
 *
 * All financial calculations run on the Node/Express backend (backend/server.js).
 * This component is responsible ONLY for:
 *   1. Collecting user inputs (payCcy, other charge amounts)
 *   2. Sending them to POST /api/charges/calc
 *   3. Rendering the server's response in a table
 *   4. Emitting charge-update / charge-remove events for Payment Grid
 *
 * Attributes (set via _push() in LcIssueComponent):
 *   lc-amount           LC face amount
 *   lc-currency         USD | EUR | JPY | GBP
 *   margin-rate         Margin %
 *   comm-rate           Commission base %
 *   applicant-id        Customer ID
 *   beneficiary-country ISO country code
 */
import {
  EventBus, ApiService, round, fmt, MIN_COMM, SWIFT_FEE, PAY_CCYS,
  ChargeInput, ChargeResult
} from './shared';

interface ChargeRow {
  id: string;
  type: string;
  label: string;
  fixed: boolean;
  payOpts: string[];
  payCcy: string;
  // user-entered fields for "other" rows
  amount?: number;
  amtCcy?: string;
  // server-returned fields (merged via Object.assign after calc)
  state: string;
  twdAmt?: number;
  payAmt?: number;
  detail?: Record<string, unknown> | null;
  minApplied?: boolean;
  minPayCcy?: number | null;
  noFx?: boolean;
  spreadInfo?: { name: string; tier: string; spread: number } | null;
  errMsg?: string;
}

const ST: Record<string, { border: string; bg: string; label: string; lc: string }> = {
  idle:    { border:'#e2e8f0', bg:'#f8fafc', label:'IDLE',    lc:'#94a3b8' },
  loading: { border:'#93c5fd', bg:'#eff6ff', label:'LOADING', lc:'#3b82f6' },
  resolved:{ border:'#86efac', bg:'#f0fdf4', label:'✓',       lc:'#16a34a' },
  zero:    { border:'#d1d5db', bg:'#f9fafb', label:'DEFAULT', lc:'#9ca3af' },
  stale:   { border:'#fde68a', bg:'#fffbeb', label:'STALE',   lc:'#d97706' },
  error:   { border:'#fca5a5', bg:'#fef2f2', label:'ERR',     lc:'#dc2626' },
};

const BCSS = () => `
  :host{display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;}
  *{box-sizing:border-box;}
  .spin{display:inline-block;animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
`;

function fmtN(n: number, d = 2): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtC(n: number | null | undefined, ccy: string): string {
  if (n == null || isNaN(n as number)) return '—';
  return fmt(n as number, ccy);
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

class ChargeGridEl extends HTMLElement {
  static get observedAttributes() {
    return ['lc-amount', 'lc-currency', 'margin-rate', 'comm-rate', 'applicant-id', 'beneficiary-country'];
  }

  private _rows: ChargeRow[] = [
    // Margin payCcy is initialised to LC currency in connectedCallback / attributeChangedCallback
    { id:'margin', type:'margin',     label:'保證金 Margin',      fixed:true, payOpts:[...PAY_CCYS], payCcy:'USD', state:'idle' },
    { id:'comm',   type:'commission', label:'手續費 Commission',  fixed:true, payOpts:[...PAY_CCYS], payCcy:'TWD', state:'idle' },
    { id:'swift',  type:'swift',      label:'SWIFT 電文費',       fixed:true, payOpts:[...PAY_CCYS], payCcy:'TWD', state:'idle' },
  ];
  private _otherN = 0;
  /** Cancel token — set to true when a new request supersedes the previous */
  private _currentCalcId = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // Sync margin payCcy to current LC currency on first connect
    const lcCcy = this.getAttribute('lc-currency') ?? 'USD';
    const marginRow = this._rows.find(r => r.id === 'margin');
    if (marginRow) marginRow.payCcy = lcCcy;
    this._draw();
  }

  attributeChangedCallback(n: string, o: string | null, v: string | null) {
    if (o === v) return;
    if (n === 'applicant-id') {
      EventBus.emit('applicant-changed', v ?? '');
    }
    // Margin always pays in LC currency — update whenever LC currency changes
    if (n === 'lc-currency' && v) {
      const marginRow = this._rows.find(r => r.id === 'margin');
      if (marginRow) marginRow.payCcy = v;
    }
    this._recalcAll();
  }

  // ── Row management ──────────────────────────────────────────────────────────
  private _addOther() {
    const id = `other-${++this._otherN}`;
    this._rows.push({
      id, type: 'other', label: `其他費用 ${this._otherN}`,
      fixed: false, payOpts: [...PAY_CCYS], payCcy: 'TWD',
      amount: 0, amtCcy: 'TWD', state: 'idle'
    });
    this._draw();
  }

  private _removeRow(id: string) {
    this._rows = this._rows.filter(r => r.id !== id);
    EventBus.emit('charge-remove', { id });
    this._draw();
  }

  // ── Server call ─────────────────────────────────────────────────────────────
  /**
   * Batch all rows into a single POST /api/charges/calc.
   * The server returns computed results for every row; we update + re-render.
   */
  private async _recalcAll() {
    const lcAmt  = parseFloat(this.getAttribute('lc-amount') ?? '');
    const lcCcy  = this.getAttribute('lc-currency') ?? 'USD';

    // Non-swift rows require a valid LC amount
    if (!lcAmt || lcAmt <= 0) {
      for (const r of this._rows) {
        if (r.type !== 'swift' && r.type !== 'other') {
          r.state = 'idle'; r.twdAmt = undefined; r.payAmt = undefined; r.detail = undefined;
          EventBus.emit('charge-remove', { id: r.id });
        }
      }
      this._draw(); return;
    }

    // Mark all rows loading / stale
    for (const r of this._rows) {
      r.state = ['resolved', 'zero'].includes(r.state) ? 'stale' : 'loading';
    }
    this._draw();

    // Cancel any in-flight request
    const calcId = ++this._currentCalcId;

    try {
      const payload = {
        lcAmount:           lcAmt,
        lcCurrency:         lcCcy,
        marginRate:         parseFloat(this.getAttribute('margin-rate') ?? '0') || 0,
        commRate:           parseFloat(this.getAttribute('comm-rate')   ?? '0.25') || 0.25,
        applicantId:        this.getAttribute('applicant-id') ?? '',
        beneficiaryCountry: this.getAttribute('beneficiary-country') ?? '',
        charges: this._rows.map(r => ({
          id:     r.id,
          type:   r.type,
          label:  r.label,
          payCcy: r.payCcy,
          amount: r.amount,
          amtCcy: r.amtCcy,
        } as ChargeInput)),
      };

      const data = await ApiService.calcCharges(payload);

      // Discard if a newer request has started
      if (calcId !== this._currentCalcId) return;

      // Merge server results back into rows
      for (const result of data.rows) {
        const row = this._rows.find(r => r.id === result.id);
        if (!row) continue;
        Object.assign(row, result);  // server owns: twdAmt, payAmt, state, detail, minApplied, etc.
      }

      // Pass server FX rates to Payment Grid via EventBus
      if (data.rates) EventBus.emit('fx-updated', data.rates);

      this._draw();

      // Notify Payment Grid for each resolved/zero row
      for (const row of this._rows) {
        if (['resolved', 'zero'].includes(row.state)) {
          EventBus.emit('charge-update', this._co(row));
        }
      }
    } catch (e: unknown) {
      if (calcId !== this._currentCalcId) return;
      const msg = e instanceof Error ? e.message : '伺服器計算失敗';
      for (const r of this._rows) { r.state = 'error'; r.errMsg = msg; }
      this._draw();
    }
  }

  /** Single-row re-calc (payCcy change, other amount change) — just calls _recalcAll */
  private _recalcRow(_row: ChargeRow) {
    this._recalcAll();
  }

  /** Minimal charge object for EventBus */
  private _co(row: ChargeRow) {
    return {
      id:         row.id,
      type:       row.type,
      label:      row.label,
      twdAmt:     row.twdAmt ?? 0,
      payCcy:     row.payCcy,
      payAmt:     row.payAmt ?? 0,
      fxRate:     null,
      spreadInfo: row.spreadInfo ?? null,
      minApplied: row.minApplied ?? false,
      state:      row.state,
    };
  }

  // ── Event handlers ──────────────────────────────────────────────────────────
  private _onPayCcyChange(id: string, val: string) {
    const row = this._rows.find(r => r.id === id);
    if (!row) return;
    row.payCcy = val;
    this._recalcAll();
  }

  private _onOtherLabel(id: string, v: string) {
    const row = this._rows.find(r => r.id === id);
    if (row) row.label = v;
  }

  private _onOtherAmt(id: string, v: string) {
    const row = this._rows.find(r => r.id === id);
    if (row) { row.amount = parseFloat(v) || 0; this._recalcRow(row); }
  }

  private _onOtherAmtCcy(id: string, v: string) {
    const row = this._rows.find(r => r.id === id);
    if (!row) return;
    row.amtCcy = v; this._recalcRow(row);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  private _draw() {
    const rows = this._rows;
    const lcCcyNow = this.getAttribute('lc-currency') ?? 'USD';

    const detail = (row: ChargeRow): string => {
      const d = row.detail as Record<string, unknown> | null | undefined;
      if (!d) return '—';

      if (row.type === 'margin') {
        if (!d['ratePct']) return '0%';
        const nofx = row.noFx && row.payCcy === lcCcyNow;
        return `${d['ratePct']}% × ${fmtC(d['lcAmt'] as number, d['lcCcy'] as string)}`
          + (nofx
            ? ` <span class="nofx">無換匯 (同交易幣別)</span>`
            : ` × ${fmtN(d['lcTwd'] as number, 4)} (${d['lcCcy']}/TWD)`);
      }

      if (row.type === 'commission') {
        const appId = this.getAttribute('applicant-id');
        let spr = '';
        if (appId && row.spreadInfo) {
          spr = `+${pct((d['spr'] as number) ?? 0)}<span class="spb">Tier ${row.spreadInfo.tier}·${row.spreadInfo.name}</span>`;
        } else if (appId) {
          spr = 'Spread:—';
        }
        let minLine = '';
        if (row.minApplied) {
          const pc = row.payCcy ?? 'TWD';
          minLine = pc === 'TWD'
            ? `<br><span class="mint">MIN TWD ${fmtN(d['MIN_COMM'] as number, 0)} 已套用</span>`
            : `<br><span class="mint">MIN TWD ${fmtN(d['MIN_COMM'] as number, 0)}`
              + (row.minPayCcy != null ? ` = ${fmtC(row.minPayCcy, pc)} 已套用` : '已套用') + `</span>`;
        }
        return `${pct(d['base'] as number)}${spr ? `<br><span style="color:#d97706">${spr}</span>` : ''}
          <br><strong style="color:#2563eb">Eff:${pct(d['eff'] as number)}</strong>
          <br>${d['lcCcy']}/TWD=${fmtN(d['lcTwd'] as number, 4)}
          ${minLine}`;
      }

      if (row.type === 'swift') {
        const pc = row.payCcy ?? 'TWD';
        return pc === 'TWD'
          ? `固定 TWD ${row.twdAmt ?? SWIFT_FEE}`
          : `固定 TWD ${row.twdAmt ?? SWIFT_FEE} → ${fmtC(row.payAmt, pc)}`;
      }

      if (row.type === 'other') {
        if (d['amtCcy'] && d['amtCcy'] !== 'TWD') {
          return `${fmtC(d['amt'] as number, d['amtCcy'] as string)} × ${fmtN(d['acRate'] as number, 4)} (${d['amtCcy']}/TWD)`
            + `<br>= <strong style="color:#2563eb">TWD ${fmtN(row.twdAmt ?? 0, 2)}</strong>`;
        }
        return `TWD 自訂 ${(row.twdAmt ?? 0) > 0 ? fmtN(row.twdAmt ?? 0, 2) : ''}`;
      }
      return 'TWD 自訂';
    };

    const stCell = (row: ChargeRow): string => {
      const s = row.state ?? 'idle';
      const c = ST[s] ?? ST['idle'];
      const busy = ['loading', 'stale'].includes(s);
      return `<span style="font-size:9px;font-weight:700;color:${c.lc};border:1px solid ${c.border};
              border-radius:8px;padding:2px 6px;background:${c.bg};">
        ${busy ? '<span class="spin">⟳</span> ' : ''}${c.label}</span>`;
    };

    const ccySel = (row: ChargeRow): string => {
      const opts = row.payOpts.map(o =>
        `<option value="${o}"${o === row.payCcy ? ' selected' : ''}>${o}</option>`).join('');
      return row.payOpts.length > 1
        ? `<select class="csy" data-id="${row.id}">${opts}</select>`
        : `<span class="cfy">${row.payCcy}</span>`;
    };

    this.shadowRoot!.innerHTML = `
    <style>
      ${BCSS()}
      .wrap{border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      thead{background:#0f172a;color:#fff;}
      th{padding:8px 10px;font-size:9px;font-weight:700;letter-spacing:.06em;
         text-transform:uppercase;text-align:left;white-space:nowrap;}
      .crow{border-bottom:1px solid #f1f5f9;}.crow:hover{background:#fafbff;}
      td{padding:7px 10px;vertical-align:middle;}
      .tn{color:#94a3b8;font-size:11px;width:26px;}
      .tname{font-weight:600;min-width:100px;}
      .tdet{color:#475569;font-size:11px;line-height:1.6;min-width:200px;}
      .tamt{width:140px;}
      .ttwd{font-weight:700;text-align:right;padding-right:12px;white-space:nowrap;min-width:120px;}
      .tccy{width:90px;}
      .tpay{font-weight:700;color:#15803d;text-align:right;padding-right:12px;white-space:nowrap;min-width:120px;}
      .tst{width:82px;}
      .hint{color:#94a3b8;}.err{color:#dc2626;}
      .li{border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-size:12px;width:100%;outline:none;}
      .li:focus{border-color:#3b82f6;}
      .ai{border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-size:12px;outline:none;}
      .ai:focus{border-color:#3b82f6;}
      .csy{border:1px solid #d1d5db;border-radius:4px;padding:3px 4px;font-size:11px;
           font-weight:600;background:#fff;cursor:pointer;outline:none;width:68px;}
      .csy:hover{border-color:#3b82f6;}
      .acy{border:1px solid #d1d5db;border-radius:4px;padding:2px 3px;font-size:11px;
           font-weight:600;background:#fff;cursor:pointer;outline:none;width:58px;}
      .acy:hover{border-color:#3b82f6;}
      .cfy{font-weight:700;font-size:11px;color:#15803d;border:1px solid #86efac;
           border-radius:6px;padding:2px 8px;background:#f0fdf4;}
      .mint{font-size:9px;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;
            border-radius:6px;padding:1px 5px;font-weight:600;}
      .spb{font-size:8px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;
           border-radius:8px;padding:1px 5px;font-weight:600;margin-left:3px;}
      .nofx{font-size:9px;background:#f0fdf4;color:#15803d;border:1px solid #86efac;
            border-radius:6px;padding:1px 6px;font-weight:600;}
      .srv-badge{font-size:9px;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;
                 border-radius:5px;padding:1px 6px;font-weight:600;margin-left:6px;}
      .add-row td{padding:5px 10px;background:#f8fafc;}
      .abtn{width:100%;border:1.5px dashed #cbd5e1;background:#fff;color:#475569;
            border-radius:5px;padding:5px;font-size:11px;cursor:pointer;}
      .abtn:hover{background:#f1f5f9;}
      tfoot tr td{padding:8px 14px;border-top:2px solid #e2e8f0;background:#f8fafc;
                  font-size:10px;color:#64748b;}
    </style>
    <div class="wrap">
      <table>
        <thead><tr>
          <th>#</th>
          <th>費用名稱 <span class="srv-badge">⚙ Server</span></th>
          <th>計算說明 / Spread Rate</th>
          <th>其他金額 / 幣別</th>
          <th style="text-align:right">本幣金額 (TWD)</th>
          <th>付款幣別 ▸</th>
          <th style="text-align:right">原幣金額</th>
          <th>狀態</th>
        </tr></thead>
        <tbody>
          ${rows.map((row, i) => {
            const ld = ['loading', 'stale'].includes(row.state);
            const op = ld ? 'opacity:.65' : '';
            const twdStr = row.twdAmt != null && !ld
              ? fmtC(row.twdAmt, 'TWD')
              : ld ? '<span class="spin">⟳</span>' : '—';
            const payStr = row.payAmt != null && !ld
              ? fmtC(row.payAmt, row.payCcy ?? 'TWD')
              : ld ? '<span class="spin">⟳</span>' : '—';
            const icon = ({ margin: '🔒', commission: '💼', swift: '📡' } as Record<string, string>)[row.type] ?? '';
            return `<tr class="crow" style="${op}">
              <td class="tn">${i + 1}</td>
              <td class="tname">${row.fixed
                ? `<span style="margin-right:4px">${icon}</span>${row.label}`
                : `<input class="li" data-id="${row.id}" value="${row.label}" placeholder="費用名稱">`}
              </td>
              <td class="tdet">${row.state === 'idle' ? '<span class="hint">等待LC金額</span>'
                : row.state === 'error' ? `<span class="err">⚠ ${row.errMsg ?? '伺服器錯誤'}</span>`
                : detail(row)}</td>
              <td class="tamt">${row.type === 'other'
                ? `<span style="display:flex;gap:3px;align-items:center;">
                     <input class="ai" data-id="${row.id}" type="number" value="${row.amount ?? ''}" placeholder="0" style="width:72px;">
                     <select class="acy" data-id="${row.id}">${PAY_CCYS.map(c =>
                       `<option value="${c}"${c === (row.amtCcy ?? 'TWD') ? ' selected' : ''}>${c}</option>`).join('')}</select>
                   </span>`
                : ''}</td>
              <td class="ttwd">${twdStr}${row.minApplied && !ld
                ? '<span class="mint" style="margin-left:4px">MIN</span>' : ''}</td>
              <td class="tccy">${ccySel(row)}</td>
              <td class="tpay">${row.state === 'error' ? '—' : payStr}</td>
              <td class="tst">${stCell(row)}</td>
            </tr>`;
          }).join('')}
          <tr class="add-row"><td colspan="8">
            <button class="abtn" id="ab">＋ 新增其他費用</button>
          </td></tr>
        </tbody>
        <tfoot><tr><td colspan="8">
          ⚙ Min. Commission = TWD ${fmtN(MIN_COMM, 0)} &nbsp;|&nbsp;
          SWIFT Fixed = TWD ${SWIFT_FEE} &nbsp;|&nbsp;
          🖥 計算由 <strong>Node.js 後端</strong> (POST /api/charges/calc) 執行，前端僅顯示結果
        </td></tr></tfoot>
      </table>
    </div>`;

    this.shadowRoot!.getElementById('ab')?.addEventListener('click', () => this._addOther());
    this.shadowRoot!.querySelectorAll<HTMLSelectElement>('.csy').forEach(s =>
      s.addEventListener('change', () => this._onPayCcyChange(s.dataset['id']!, s.value)));
    this.shadowRoot!.querySelectorAll<HTMLInputElement>('.li').forEach(inp =>
      inp.addEventListener('blur', () => this._onOtherLabel(inp.dataset['id']!, inp.value)));
    this.shadowRoot!.querySelectorAll<HTMLInputElement>('.ai').forEach(inp =>
      inp.addEventListener('blur', () => this._onOtherAmt(inp.dataset['id']!, inp.value)));
    this.shadowRoot!.querySelectorAll<HTMLSelectElement>('.acy').forEach(s =>
      s.addEventListener('change', () => this._onOtherAmtCcy(s.dataset['id']!, s.value)));
  }
}

if (!customElements.get('charge-grid')) {
  customElements.define('charge-grid', ChargeGridEl);
}
