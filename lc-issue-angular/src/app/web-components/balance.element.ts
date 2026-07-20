/**
 * <balance-component>
 *
 * Displays the LC Balance (face amount + tolerance %) in both LC currency and TWD.
 *
 * NO arithmetic here — all business logic runs on the server (POST /api/balance/calc).
 * This component only:
 *   1. Collects attribute inputs (lc-amount, tolerance-pct, lc-currency)
 *   2. Sends them to the backend
 *   3. Renders the response
 *   4. Emits EventBus 'balance-resolved' with the server result
 *
 * This ensures API callers (non-UI) get identical results from the same endpoint.
 */
import { EventBus, fmt, STATE_CFG, baseStyle } from './shared';

interface BalanceResult {
  balFcy: number;
  balLcy: number;
  fx:     number;
  ccy:    string;
  amt:    number;
  tol:    number;
  at:     string;
}

class BalanceComponent extends HTMLElement {
  private _s = 'idle';
  private _r: BalanceResult | null = null;
  private _err: string | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _calcId = 0;   // cancel token

  static get observedAttributes() {
    return ['lc-amount', 'tolerance-pct', 'lc-currency'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() { this._draw(); }
  disconnectedCallback() { if (this._timer) clearTimeout(this._timer); }

  attributeChangedCallback(_: string, ov: string | null, nv: string | null) {
    if (ov === nv) return;
    if (this._s === 'resolved') this._s = 'stale';
    this._schedule();
  }

  private _schedule() {
    if (this._timer) clearTimeout(this._timer);
    if (this._s !== 'stale') { this._s = 'pending'; this._draw(); }
    this._timer = setTimeout(() => this._calc(), 500);
  }

  private async _calc() {
    const lcAmount     = parseFloat(this.getAttribute('lc-amount') ?? '');
    const tolerancePct = parseFloat(this.getAttribute('tolerance-pct') ?? '0');
    const lcCurrency   = this.getAttribute('lc-currency');

    if (!lcAmount || isNaN(lcAmount) || lcAmount <= 0 || !lcCurrency) {
      this._s = 'idle'; this._r = null;
      EventBus.emit('balance-cleared', {});
      this._draw(); return;
    }

    const id = ++this._calcId;
    this._s = 'loading'; this._draw();

    try {
      const res = await fetch('/api/balance/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lcAmount, lcCurrency, tolerancePct }),
      });

      if (id !== this._calcId) return;   // superseded by a newer request

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      this._r  = await res.json() as BalanceResult;
      this._s  = 'resolved';
      this._err = null;
      this._draw();
      EventBus.emit('balance-resolved', { ...this._r });
    } catch (e: unknown) {
      if (id !== this._calcId) return;
      this._s   = 'error';
      this._err = e instanceof Error ? e.message : '計算失敗';
      this._draw();
    }
  }

  private _draw() {
    const s = this._s, r = this._r;
    const cfg   = STATE_CFG[s] ?? STATE_CFG['idle'];
    const ccy   = this.getAttribute('lc-currency') ?? '---';
    const isData = (s === 'resolved' || s === 'stale') && r;

    this.shadowRoot!.innerHTML = `
      <style>${baseStyle(cfg)}</style>
      <div class="wrap">
        <div class="hd">
          <span class="title">LC Balance（伺服器計算）🔒</span>
          <span class="badge">${cfg.icon} ${cfg.badge}</span>
        </div>
        ${isData && r ? `
          <div class="row" style="${s === 'stale' ? 'opacity:.5' : ''}">
            <span class="lbl">LC Balance (${r.ccy})</span>
            <span class="val">${fmt(r.balFcy, r.ccy)}</span>
          </div>
          <div class="row" style="${s === 'stale' ? 'opacity:.5' : ''}">
            <span class="lbl">LC Balance LCY (TWD)</span>
            <span class="val">${fmt(r.balLcy, 'TWD')}</span>
          </div>
          <div class="hint">
            ${r.ccy}/TWD: ${r.fx.toFixed(4)} · = ${fmt(r.amt, r.ccy)} × (1 + ${(r.tol * 100).toFixed(1)}%)
            ${s === 'stale' ? ' · 🕐 重新計算中…' : ' · POST /api/balance/calc'}
          </div>
        ` : `
          <div class="msg" style="margin-top:4px">${
            s === 'idle'    ? '請填寫 LC Amount 及 Currency 後自動計算' :
            s === 'pending' ? '等待輸入完成…' :
            s === 'loading' ? `⏳ 後端計算 ${ccy} LC Balance 中…` :
            '⚠ ' + (this._err ?? '計算失敗')
          }</div>
        `}
      </div>`;
  }
}

if (!customElements.get('balance-component')) {
  customElements.define('balance-component', BalanceComponent);
}
