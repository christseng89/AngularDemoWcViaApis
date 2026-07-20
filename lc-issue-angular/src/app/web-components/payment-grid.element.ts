/**
 * <payment-grid>
 *
 * Groups resolved charges by payment currency; one row per currency.
 * Payment currency and amount are display-only — no user override.
 * All arithmetic (TWD equiv, balance check) runs on POST /api/payment/reconcile.
 */
import { EventBus, fmt, round, acctsByCcy, CUST_ACCTS } from './shared';

interface ChargeObj {
  id: string; type: string; label: string;
  twdAmt: number; payCcy: string; payAmt: number;
  state: string; minApplied?: boolean;
}

interface OvrEntry {
  acctId?: string | null;   // account selection only — no manual amount
}

interface ReconGroup  { ccy: string; twdEquiv: number; }
interface ReconResult {
  groups: ReconGroup[]; totalTwd: number; totalEquiv: number;
  diff: number; balanced: boolean; at: string;
}

const BCSS = () => `
  :host{display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;}
  *{box-sizing:border-box;}
  .spin{display:inline-block;animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
`;

function fmtN(n: number, d = 0): string {
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtC(n: number | null | undefined, ccy: string): string {
  if (n == null || isNaN(n as number)) return '—';
  return fmt(n as number, ccy);
}

const CCY_COLORS: Record<string, [string, string, string]> = {
  TWD: ['#dcfce7', '#15803d', '#86efac'],
  USD: ['#dbeafe', '#1e40af', '#93c5fd'],
  EUR: ['#ede9fe', '#6d28d9', '#c4b5fd'],
  JPY: ['#fef9c3', '#854d0e', '#fde68a'],
  GBP: ['#fce7f3', '#9d174d', '#f9a8d4'],
};
function ccyBadge(ccy: string): string {
  const [bg, fc, bd] = CCY_COLORS[ccy] ?? ['#f1f5f9', '#475569', '#e2e8f0'];
  return `<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:8px;
    background:${bg};color:${fc};border:1px solid ${bd};white-space:nowrap;">${ccy}</span>`;
}

class PaymentGridEl extends HTMLElement {
  private _charges    = new Map<string, ChargeObj>();
  private _ovr        = new Map<string, OvrEntry>();   // acctId only
  private _appId      = '';
  private _reconResult: ReconResult | null = null;
  private _reconId    = 0;
  private _unsub: Array<() => void> = [];

  constructor() { super(); this.attachShadow({ mode: 'open' }); }

  connectedCallback() {
    this._appId = (document.getElementById('f-app') as HTMLSelectElement | null)?.value ?? '';

    this._unsub.push(EventBus.on<string>('applicant-changed', id => {
      this._appId = id ?? '';
      for (const [k, v] of this._ovr) this._ovr.set(k, { acctId: null });
      this._draw();
    }));
    this._unsub.push(EventBus.on<ChargeObj>('charge-update', chg => {
      this._charges.set(chg.id, chg);
      this._reconcile();
    }));
    this._unsub.push(EventBus.on<{ id: string }>('charge-remove', d => {
      this._charges.delete(d.id);
      this._reconcile();
    }));
    this._unsub.push(EventBus.on('fx-updated', () => {
      if (this._charges.size > 0) this._reconcile();
    }));
    this._draw();
  }

  disconnectedCallback() { this._unsub.forEach(f => f()); }

  // ── Aggregate charges by payCcy ───────────────────────────────────────────
  private _buildRawGroups() {
    const raw = new Map<string, { twdTotal: number; payTotal: number; charges: ChargeObj[] }>();
    for (const chg of this._charges.values()) {
      if (!['resolved', 'zero'].includes(chg.state)) continue;
      if (!(chg.twdAmt > 0)) continue;
      const ccy = chg.payCcy ?? 'TWD';
      if (!raw.has(ccy)) raw.set(ccy, { twdTotal: 0, payTotal: 0, charges: [] });
      const g = raw.get(ccy)!;
      g.twdTotal = round(g.twdTotal + (chg.twdAmt ?? 0), 0);
      g.payTotal += chg.payAmt ?? 0;
      g.charges.push(chg);
    }
    return raw;
  }

  // ── Server reconciliation ─────────────────────────────────────────────────
  private async _reconcile() {
    const raw = this._buildRawGroups();
    if (raw.size === 0) { this._reconResult = null; this._draw(); return; }

    const groups = [...raw.entries()].map(([ccy, g]) => ({
      ccy,
      finalAmt: round(g.payTotal, ccy === 'JPY' ? 0 : 4),
      twdTotal: g.twdTotal,
    }));

    const id = ++this._reconId;
    try {
      const res = await fetch('/api/payment/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
      if (id !== this._reconId) return;
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error); }
      this._reconResult = await res.json() as ReconResult;
    } catch {
      if (id !== this._reconId) return;
      this._reconResult = null;
    }
    this._draw();
    this._maybeReady();
  }

  private _maybeReady() {
    if (!this._reconResult?.balanced) return;
    const pending = [...this._charges.values()].filter(c => ['loading','stale'].includes(c.state));
    if (pending.length > 0 || this._charges.size === 0) return;
    EventBus.emit('payment-ready', { ...this._reconResult });
  }

  private _onAcctChange(ccy: string, acctId: string) {
    if (!this._ovr.has(ccy)) this._ovr.set(ccy, {});
    this._ovr.get(ccy)!.acctId = acctId;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  private _draw() {
    const allChgs    = [...this._charges.values()];
    const pending    = allChgs.filter(c => ['loading','stale'].includes(c.state));
    const raw        = this._buildRawGroups();
    const recon      = this._reconResult;
    const balanced   = recon?.balanced ?? false;
    const totalTwd   = recon?.totalTwd   ?? 0;
    const totalEquiv = recon?.totalEquiv ?? 0;
    const diff       = recon?.diff       ?? 0;

    const ready = raw.size > 0 && pending.length === 0 && allChgs.length > 0 && recon != null;
    const btn  = document.getElementById('lc-submit') as HTMLButtonElement | null;
    const hint = document.getElementById('submit-hint');
    if (btn)  btn.classList.toggle('ready', ready && balanced);
    if (hint) hint.textContent = ready && balanced
      ? '✓ 計算完成且平帳，可送出申請'
      : ready && !balanced
        ? `⚠ 付款 TWD 等值差額 TWD ${fmtN(Math.abs(diff))}，請確認`
        : pending.length > 0 ? '⟳ 費用計算中…'
        : '請填入必要資料並等待計算完成';

    const twdEquivByCcy = new Map((recon?.groups ?? []).map(g => [g.ccy, g.twdEquiv]));

    const displayGroups = [...raw.entries()].map(([ccy, g]) => {
      const ovr    = this._ovr.get(ccy) ?? {};
      const accts  = acctsByCcy(this._appId, ccy);
      const acctId = ovr.acctId ?? (accts[0]?.id ?? null);
      return { ccy, charges: g.charges, twdTotal: g.twdTotal,
               payTotal: g.payTotal, acctId,
               twdEquiv: twdEquivByCcy.get(ccy) ?? null };
    });

    const acctCell = (g: typeof displayGroups[number]): string => {
      const accts = acctsByCcy(this._appId, g.ccy);
      if (!accts.length) return `<span style="color:#ef4444;font-size:11px;font-weight:600;">無可用帳號</span>`;
      if (accts.length === 1) {
        const a = accts[0];
        return `<div style="display:flex;flex-direction:column;gap:2px;">
          <span style="font-size:11px;font-weight:600;color:#0f172a;">${a.name}</span>
          <span style="font-size:9px;font-weight:700;color:#64748b;background:#f1f5f9;
            border-radius:4px;padding:1px 5px;letter-spacing:.04em;">${a.no}</span>
        </div>`;
      }
      const opts = accts.map(a =>
        `<option value="${a.id}"${a.id === g.acctId ? ' selected' : ''}>${a.name}　${a.no}</option>`
      ).join('');
      return `<select class="asel" data-ccy="${g.ccy}" data-f="acct">${opts}</select>`;
    };

    // Payment amount cell: currency badge + amount, display-only
    const payAmtCell = (g: typeof displayGroups[number]): string => {
      const dp    = g.ccy === 'JPY' ? 0 : 2;
      const amt   = g.payTotal.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      return `<div style="display:flex;align-items:center;gap:8px;">
        ${ccyBadge(g.ccy)}
        <span style="font-size:13px;font-weight:700;color:#0f172a;font-family:Consolas,monospace;">${amt}</span>
      </div>`;
    };

    this.shadowRoot!.innerHTML = `
    <style>
      ${BCSS()}
      .wrap{display:flex;flex-direction:column;gap:10px;}
      .empty{color:#94a3b8;font-size:11px;text-align:center;padding:14px;
             border:1.5px solid #e2e8f0;border-radius:8px;}
      .gtable{border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      thead{background:#1e3a5f;color:#fff;}
      th{padding:8px 10px;font-size:9px;font-weight:700;letter-spacing:.06em;
         text-transform:uppercase;text-align:left;white-space:nowrap;}
      .srv-badge{font-size:9px;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;
                 border-radius:5px;padding:1px 6px;font-weight:600;margin-left:6px;}
      .grow{border-bottom:1px solid #f1f5f9;}.grow:hover{background:#fafbff;}
      td{padding:8px 10px;vertical-align:middle;}
      .fchip{font-size:9px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;
             padding:2px 7px;color:#475569;}
      .asel{border:1px solid #d1d5db;border-radius:5px;padding:4px 6px;font-size:11px;
            font-weight:600;background:#fff;cursor:pointer;outline:none;width:100%;}
      .asel:hover{border-color:#3b82f6;}
      .tot-row td{font-weight:700;font-size:12px;border-top:2px solid #e2e8f0;
                  padding:8px 10px;background:#f8fafc;}
      .bal{border:1.5px solid ${balanced ? '#86efac' : '#fca5a5'};border-radius:8px;
           background:${balanced ? '#f0fdf4' : '#fef2f2'};padding:10px 16px;
           display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}
      .bal-badge{font-size:12px;font-weight:700;padding:4px 14px;border-radius:8px;
                 color:${balanced ? '#15803d' : '#dc2626'};
                 border:1.5px solid ${balanced ? '#86efac' : '#fca5a5'};
                 background:${balanced ? '#dcfce7' : '#fee2e2'};}
      .pending{color:#d97706;font-size:10px;text-align:center;padding:5px;
               border:1px solid #fde68a;border-radius:6px;background:#fffbeb;}
      .leg{font-size:10px;color:#64748b;padding:7px 12px;background:#f8fafc;
           border:1.5px solid #e2e8f0;border-radius:8px;display:flex;gap:14px;flex-wrap:wrap;}
    </style>
    <div class="wrap">
      ${displayGroups.length === 0 && !pending.length
        ? `<div class="empty">尚無費用資料，請在 Charge Grid 設定費用與付款幣別</div>`
        : displayGroups.length === 0
        ? `<div class="empty"><span class="spin">⟳</span> 費用計算中…</div>`
        : `<div class="gtable"><table>
            <thead><tr>
              <th>費用明細</th>
              <th style="text-align:right">原幣合計</th>
              <th style="text-align:right">TWD 本幣合計</th>
              <th>扣帳帳號</th>
              <th>付款幣別 / 付款金額</th>
              <th style="text-align:right">TWD 等值 <span class="srv-badge">⚙ Server</span></th>
            </tr></thead>
            <tbody>
              ${displayGroups.map(g => `
              <tr class="grow">
                <td><div style="display:flex;flex-wrap:wrap;gap:4px;">
                  ${g.charges.map(c => `<span class="fchip">${c.label}</span>`).join('')}
                </div></td>
                <td style="text-align:right;padding-right:14px;font-weight:700;white-space:nowrap;">
                  ${fmtC(g.payTotal, g.ccy)}</td>
                <td style="text-align:right;padding-right:14px;font-weight:700;white-space:nowrap;color:#64748b;">
                  ${fmtC(g.twdTotal, 'TWD')}</td>
                <td style="min-width:220px;">${acctCell(g)}</td>
                <td style="min-width:180px;">${payAmtCell(g)}</td>
                <td style="text-align:right;padding-right:14px;font-weight:700;white-space:nowrap;
                    color:${g.ccy !== 'TWD' ? '#7c3aed' : '#0f172a'};">
                  ${g.twdEquiv != null ? fmtC(g.twdEquiv, 'TWD') : '<span class="spin">⟳</span>'}
                </td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="tot-row">
                <td colspan="2">合計</td>
                <td style="text-align:right;padding-right:14px;">${recon ? fmtC(totalTwd, 'TWD') : '—'}</td>
                <td colspan="2"></td>
                <td style="text-align:right;padding-right:14px;color:${balanced ? '#15803d' : '#dc2626'};">
                  ${recon ? fmtC(totalEquiv, 'TWD') : '<span class="spin">⟳</span>'}
                </td>
              </tr>
            </tfoot>
          </table></div>`}

      ${pending.length > 0
        ? `<div class="pending">⟳ 部分費用計算中，付款指示將自動更新</div>` : ''}

      ${displayGroups.length > 0 ? `
      <div class="bal">
        <div style="font-size:11px;color:#475569;">
          TWD 費用合計 <strong>${fmtC(totalTwd,'TWD')}</strong>
          &nbsp;=&nbsp; 付款 TWD 等值 <strong>${fmtC(totalEquiv,'TWD')}</strong>
          &nbsp;|&nbsp; 差額 <strong style="color:${balanced ? '#15803d' : '#dc2626'};">
            TWD ${fmtN(Math.abs(diff))}</strong>
          ${balanced ? '' : `<em style="font-size:10px;color:#94a3b8;">&nbsp;(聯絡業務調整)</em>`}
          <span style="font-size:9px;color:#0369a1;background:#f0f9ff;border:1px solid #bae6fd;
                border-radius:4px;padding:1px 6px;margin-left:8px;">⚙ POST /api/payment/reconcile</span>
        </div>
        <span class="bal-badge">${balanced ? '✓ TWD 平帳' : '⚠ 未平帳'}</span>
      </div>
      <div class="leg">
        <span>📌 <strong>帳號</strong>：一幣多帳時下拉選取，單一帳號自動 Default</span>
        <span>🔒 <strong>付款金額</strong>：系統計算，不可覆蓋</span>
        <span>🔒 <strong>平帳判斷</strong>：後端執行 (|差額| &lt; TWD 1)</span>
      </div>` : ''}
    </div>`;

    this.shadowRoot!.querySelectorAll<HTMLSelectElement>('[data-f="acct"]').forEach(el =>
      el.addEventListener('change', () => this._onAcctChange(el.dataset['ccy']!, el.value)));
  }
}

if (!customElements.get('payment-grid')) {
  customElements.define('payment-grid', PaymentGridEl);
}
