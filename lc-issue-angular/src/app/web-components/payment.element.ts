import { EventBus, fmt, round, acctsByCcy, BalanceDetail, ChargeDetail } from './shared';

class PaymentComponent extends HTMLElement {
  private _charges = new Map<string, ChargeDetail>();
  private _bal: BalanceDetail | null = null;
  private _appId = '';
  /** Per-currency selected account override: ccy → acctId */
  private _acctSel = new Map<string, string>();
  private _offBal?: () => void;
  private _offChg?: () => void;
  private _offApp?: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // Pick up applicant from form if already set
    this._appId = (document.getElementById('f-app') as HTMLSelectElement)?.value ?? '';

    this._offBal = EventBus.on<BalanceDetail>('balance-resolved', d => {
      this._bal = d; this._draw();
    });
    this._offChg = EventBus.on<ChargeDetail>('charge-resolved', d => {
      this._charges.set(`${d.type}|${d.label}`, d);
      this._draw();
      this._maybeReady();
    });
    this._offApp = EventBus.on<string>('applicant-changed', id => {
      this._appId = id ?? '';
      // Clear account selections so they re-derive for the new customer
      this._acctSel.clear();
      this._draw();
    });
    this._draw();
  }

  disconnectedCallback() {
    this._offBal?.(); this._offChg?.(); this._offApp?.();
  }

  private _maybeReady() {
    const hasNonZero = [...this._charges.values()].some(c => c.amount > 0);
    if (this._bal && hasNonZero) {
      EventBus.emit('payment-ready', {
        balance: this._bal,
        charges: [...this._charges.values()],
        totalLcy: [...this._charges.values()].reduce((s, c) => s + (c.amountLcy ?? 0), 0)
      });
      const btn = document.getElementById('lc-submit') as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
    }
  }

  private _onAcctChange(ccy: string, acctId: string) {
    this._acctSel.set(ccy, acctId);
    this._draw();
  }

  private _draw() {
    const CCY_COLORS: Record<string, { bg: string; border: string; text: string; title: string }> = {
      USD: { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8', title: '客戶 USD 帳戶 Dr' },
      EUR: { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6', title: '客戶 EUR 帳戶 Dr' },
      JPY: { bg: '#fef3c7', border: '#fde68a', text: '#92400e', title: '客戶 JPY 帳戶 Dr' },
      GBP: { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d', title: '客戶 GBP 帳戶 Dr' },
      TWD: { bg: '#dcfce7', border: '#86efac', text: '#15803d', title: '客戶 TWD 帳戶 Dr' },
    };

    // Group charges by payCcy, skip zero-amount entries
    const byCcy = new Map<string, { items: ChargeDetail[]; payTotal: number; lcyTotal: number }>();
    let grandLcy = 0;

    this._charges.forEach(c => {
      if (c.zero || c.amount <= 0) return;
      const ccy = c.currency ?? 'TWD';
      if (!byCcy.has(ccy)) byCcy.set(ccy, { items: [], payTotal: 0, lcyTotal: 0 });
      const g = byCcy.get(ccy)!;
      g.items.push(c);
      g.payTotal += c.amount;
      g.lcyTotal += c.amountLcy ?? 0;
      grandLcy   += c.amountLcy ?? 0;
    });

    const hasSummary = byCcy.size > 0;

    // Build per-currency blocks
    const ccyBlocks = [...byCcy.entries()].map(([ccy, data]) => {
      const col = CCY_COLORS[ccy] ?? { bg: '#f1f5f9', border: '#e2e8f0', text: '#1e293b', title: `客戶 ${ccy} 帳戶 Dr` };

      // Account selection
      const accts = acctsByCcy(this._appId, ccy);
      const selId = this._acctSel.get(ccy) ?? accts[0]?.id ?? '';
      const selAcct = accts.find(a => a.id === selId) ?? accts[0];
      const acctBlock = accts.length > 1
        ? `<select data-ccy="${ccy}" style="font-size:10px;border:1px solid ${col.border};
             border-radius:4px;padding:2px 5px;background:${col.bg};color:${col.text};
             cursor:pointer;outline:none;max-width:240px;">
             ${accts.map(a => `<option value="${a.id}"${a.id === selId ? ' selected' : ''}>${a.name} (${a.no})</option>`).join('')}
           </select>`
        : selAcct
          ? `<span style="font-size:10px;color:${col.text};font-weight:600">${selAcct.name} <span style="font-weight:400;color:#64748b">(${selAcct.no})</span></span>`
          : `<span style="font-size:10px;color:#94a3b8">— 帳號待確認 —</span>`;

      const rows = data.items.map(item => `
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#64748b;padding:1.5px 0">
          <span>${item.label}${item.optional ? '<span style="font-size:8px;color:#9ca3af"> [選填]</span>' : ''}${item.noFx ? '<span style="font-size:7px;color:#15803d;margin-left:3px">[無換匯]</span>' : ''}${item.minApplied ? '<span style="font-size:7px;color:#1e40af;margin-left:3px">[MIN]</span>' : ''}</span>
          <span style="font-family:Consolas,monospace">${fmt(item.amount, ccy)}</span>
        </div>`).join('');

      const twdEquiv = ccy === 'TWD'
        ? round(data.payTotal, 0)
        : round(data.lcyTotal, 0);

      return `
        <div data-ccy-block="${ccy}" style="border:1.5px solid ${col.border};border-radius:7px;background:${col.bg};padding:9px 12px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:11px;font-weight:700;color:${col.text}">${col.title}</span>
            <span style="font-size:13px;font-weight:700;color:${col.text};font-family:Consolas,monospace">${fmt(data.payTotal, ccy)}</span>
          </div>
          <div style="margin-bottom:5px">${acctBlock}</div>
          <div style="border-top:1px dashed ${col.border};padding-top:4px">${rows}</div>
          ${ccy !== 'TWD' ? `<div style="font-size:9px;color:#64748b;margin-top:4px;text-align:right">≈ TWD ${twdEquiv.toLocaleString('en-US')}</div>` : ''}
        </div>`;
    }).join('');

    this.shadowRoot!.innerHTML = `
      <style>
        :host{display:block;font-family:'Segoe UI',sans-serif}
        .wrap{border:1.5px solid ${hasSummary ? '#f97316' : '#e2e8f0'};border-radius:10px;
              background:${hasSummary ? '#fff7ed' : '#f8fafc'};padding:14px;transition:all .3s}
        .title{font-size:12px;font-weight:700;color:#9a3412;margin-bottom:${hasSummary ? '10px' : '0'}}
        .cl-box{border:1.5px solid #93c5fd;border-radius:7px;background:#eff6ff;
                padding:9px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
        .cl-lbl{font-size:10px;color:#1d4ed8;font-weight:600}
        .cl-val{font-size:11px;font-weight:700;color:#1d4ed8;font-family:Consolas,monospace}
        .total{display:flex;justify-content:space-between;align-items:center;
               padding:9px 12px;background:#fef2f2;border:2px solid #dc2626;border-radius:7px;margin-top:8px}
        .tl{font-size:11px;font-weight:700;color:#dc2626}
        .tv{font-size:15px;font-weight:700;color:#dc2626;font-family:Consolas,monospace}
        .note{font-size:9px;color:#94a3b8;margin-top:6px}
        .empty{font-size:10px;color:#94a3b8}
        .eh{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;
            letter-spacing:.05em;margin:6px 0 3px}
      </style>
      <div class="wrap">
        <div class="title">📋 客戶帳戶扣款彙整（CA Debit Summary）</div>
        ${this._bal ? `
          <div class="eh">分錄 Entry 1 — 或有負債（Off-Balance）</div>
          <div class="cl-box">
            <span class="cl-lbl">Dr Customer Liability on LC</span>
            <span class="cl-val">${fmt(this._bal.balFcy, this._bal.ccy)}</span>
          </div>
          <div class="cl-box" style="flex-direction:row-reverse">
            <span class="cl-lbl">Cr Contingent Liability on LC</span>
            <span class="cl-val">${fmt(this._bal.balFcy, this._bal.ccy)}</span>
          </div>
          ${hasSummary ? '<div class="eh">分錄 Entry 2 — 費用扣款（各幣別分開）</div>' : ''}
        ` : ''}
        ${hasSummary ? `
          ${ccyBlocks}
          <div class="total">
            <span class="tl">等值合計（≈ TWD）</span>
            <span class="tv">${fmt(grandLcy, 'TWD')}</span>
          </div>
          <div class="note">* 各幣別從對應帳戶分別扣款 · 收入以 TWD 入帳 · 匯差另記 FX P&amp;L</div>
        ` : `<div class="empty" style="margin-top:${this._bal ? '8px' : '0'}">等待費用計算完成後顯示彙整…</div>`}
      </div>`;

    // Bind account select dropdowns
    this.shadowRoot!.querySelectorAll<HTMLSelectElement>('select[data-ccy]').forEach(sel => {
      sel.addEventListener('change', () => this._onAcctChange(sel.dataset['ccy']!, sel.value));
    });
  }
}

if (!customElements.get('payment-component')) {
  customElements.define('payment-component', PaymentComponent);
}
