import {
  EventBus, FxService, ApplicantService, PostageService,
  fmt, round, MIN_COMM, STATE_CFG, baseStyle, BalanceDetail
} from './shared';

class ChargeComponent extends HTMLElement {
  private _s = 'idle';
  private _r: { amt: number; lcy: number; ccy: string; meta: Record<string, unknown> } | null = null;
  private _err: string | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _bal: BalanceDetail | null = null;
  private _appInfo: { name: string; tier: string; spread: number } | null = null;
  private _offBal?: () => void;
  private _offClr?: () => void;

  static get observedAttributes() {
    return ['rate', 'amount', 'amount-currency', 'payment-currency', 'label', 'async-applicant-id', 'lookup-country'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._offBal = EventBus.on<BalanceDetail>('balance-resolved', d => {
      const wasOk = this._s === 'resolved' || this._s === 'zero';
      this._bal = d;
      if (wasOk) this._s = 'stale';
      this._schedule();
    });
    this._offClr = EventBus.on('balance-cleared', () => {
      const type = this.getAttribute('type');
      if (type === 'margin' || type === 'commission') {
        this._bal = null; this._s = 'idle'; this._r = null;
        this._draw(); this._emitZero();
      }
    });
    this._draw();
    this._schedule();
  }

  disconnectedCallback() {
    this._offBal?.(); this._offClr?.();
    if (this._timer) clearTimeout(this._timer);
  }

  attributeChangedCallback(n: string, ov: string | null, nv: string | null) {
    if (ov === nv) return;
    if (n === 'async-applicant-id') this._appInfo = null;
    if (this._s === 'resolved' || this._s === 'zero') this._s = 'stale';
    this._schedule();
  }

  private _schedule() {
    if (this._timer) clearTimeout(this._timer);
    const d = this.getAttribute('type') === 'commission' ? 600 : 400;
    this._timer = setTimeout(() => this._calc(), d);
  }

  private _emitZero() {
    EventBus.emit('charge-resolved', {
      type: this.getAttribute('type'), label: this.getAttribute('label'),
      amount: 0, currency: this.getAttribute('payment-currency') ?? 'TWD',
      amountLcy: 0, optional: this.hasAttribute('optional'), zero: true
    });
  }

  private async _calc() {
    const type   = this.getAttribute('type') ?? '';
    const payCcy = this.getAttribute('payment-currency') ?? 'TWD';
    const isOpt  = this.hasAttribute('optional');
    const label  = this.getAttribute('label') ?? type;
    const meta: Record<string, unknown> = {};
    const dp     = (ccy: string) => ccy === 'JPY' ? 0 : 2;

    try {
      let amt = 0, lcy = 0;

      // ── fixed: custom amount in any amtCcy, paid in payCcy ──────────────
      if (type === 'fixed') {
        amt = parseFloat(this.getAttribute('amount') ?? '0') || 0;
        if (amt === 0 && isOpt) { this._finish('zero', 0, 0, payCcy, meta, label); return; }
        this._s = 'loading'; this._draw();

        const amtCcy = this.getAttribute('amount-currency') || 'TWD';

        // Step 1: amtCcy → TWD (accounting base)
        if (amtCcy !== 'TWD') {
          const amtRate = await FxService.getRate(amtCcy, 'TWD');
          lcy = round(amt * amtRate, 2);
          meta['amtCcy']   = amtCcy;
          meta['amtRate']  = amtRate.toFixed(4);
          meta['amtLcy']   = lcy;
          meta['inputAmt'] = amt;    // original entered amount in amtCcy
        } else {
          lcy = amt;
        }

        // Step 2: TWD → payCcy (payment amount)
        let payAmt: number;
        if (payCcy === 'TWD') {
          payAmt = lcy;
        } else if (payCcy === amtCcy) {
          payAmt = amt;  // direct — avoids double-conversion rounding loss
        } else {
          const pcRate = await FxService.getRate(payCcy, 'TWD');
          payAmt = round(lcy / pcRate, dp(payCcy));
        }

        this._finish('resolved', payAmt, lcy, payCcy, meta, label); return;
      }

      // ── postage (SWIFT fee): TWD base from country lookup, payable in any ccy ──
      if (type === 'postage') {
        const country = this.getAttribute('lookup-country');
        if (!country) {
          if (isOpt) { this._finish('zero', 0, 0, payCcy, meta, label); }
          else       { this._s = 'idle'; this._draw(); }
          return;
        }
        this._s = 'loading'; this._draw();
        const twdAmt = await PostageService.lookup(country);   // always TWD
        lcy = twdAmt;
        meta['country'] = country;
        let payAmt: number;
        if (payCcy === 'TWD') {
          payAmt = lcy;
        } else {
          const pcRate = await FxService.getRate(payCcy, 'TWD');
          payAmt = round(lcy / pcRate, dp(payCcy));
          meta[`TWD/${payCcy}`] = (1 / pcRate).toFixed(6);
        }
        this._finish('resolved', payAmt, lcy, payCcy, meta, label); return;
      }

      if (!this._bal) { this._s = 'idle'; this._draw(); return; }

      // ── margin ─────────────────────────────────────────────────────────
      if (type === 'margin') {
        const rateAttr = this.getAttribute('rate');
        const rate = parseFloat(rateAttr ?? '0') / 100;
        if (!rateAttr && isOpt) {
          meta['defaulted'] = true;
          this._finish('zero', 0, 0, payCcy, meta, label); return;
        }
        this._s = 'loading'; this._draw();
        const { balFcy, ccy: lcCcy } = this._bal;
        const marginBase = balFcy * rate;   // in LC currency

        if (payCcy === lcCcy) {
          // 無換匯: paying in LC currency — use LC amount directly, compute TWD for accounting
          const fx = await FxService.getRate(lcCcy, 'TWD');
          amt = round(marginBase, dp(payCcy));
          lcy = round(marginBase * fx, 2);
          meta['noFx'] = true;
        } else {
          const lcTwd = await FxService.getRate(lcCcy, 'TWD');
          lcy = round(marginBase * lcTwd, 2);
          if (payCcy === 'TWD') {
            amt = lcy;
          } else {
            const pcRate = await FxService.getRate(payCcy, 'TWD');
            amt = round(lcy / pcRate, dp(payCcy));
          }
          meta['noFx'] = false;
        }
        meta['note'] = `${this._bal.ccy} ${balFcy.toFixed(2)} × ${(rate * 100).toFixed(2)}%`;
        this._finish('resolved', amt, lcy, payCcy, meta, label); return;
      }

      // ── commission ─────────────────────────────────────────────────────
      if (type === 'commission') {
        const appId = this.getAttribute('async-applicant-id');
        const rate  = parseFloat(this.getAttribute('rate') ?? '0') / 100;
        if (!appId) { this._s = 'idle'; this._draw(); return; }

        this._s = 'loading'; this._draw();
        if (!this._appInfo) this._appInfo = await ApplicantService.getInfo(appId);
        const spread = this._appInfo.spread / 100;
        const totalRate = rate + spread;
        const { balFcy, ccy: lcCcy } = this._bal;
        const commBase = balFcy * totalRate;   // in LC currency

        // Step 1: compute TWD amount (before min)
        const lcTwd = await FxService.getRate(lcCcy, 'TWD');
        const rawLcy = round(commBase * lcTwd, 2);

        // Apply minimum (MIN_COMM TWD)
        const minApplied = rawLcy < MIN_COMM;
        lcy = minApplied ? MIN_COMM : rawLcy;

        meta['minApplied'] = minApplied;
        meta['rawLcy']     = rawLcy;

        // Step 2: TWD → payCcy
        let minPayCcy: number | null = null;
        if (payCcy === 'TWD') {
          amt = lcy;
        } else {
          const pcRate = await FxService.getRate(payCcy, 'TWD');
          amt = round(lcy / pcRate, dp(payCcy));
          if (minApplied) {
            minPayCcy = round(MIN_COMM / pcRate, dp(payCcy));
          }
          meta[`${lcCcy}/TWD`] = lcTwd.toFixed(4);
          meta[`TWD/${payCcy}`] = (1 / pcRate).toFixed(6);
        }
        meta['minPayCcy']  = minPayCcy;
        meta['applicant']  = this._appInfo;
        meta['baseRate']   = `${(rate * 100).toFixed(2)}%`;
        meta['spreadRate'] = `${(spread * 100).toFixed(2)}%`;
        meta['totalRate']  = `${(totalRate * 100).toFixed(2)}%`;
        this._finish('resolved', amt, lcy, payCcy, meta, label); return;
      }

      this._s = 'idle'; this._draw();
    } catch (e: unknown) {
      this._s = 'error';
      this._err = e instanceof Error ? e.message : '計算失敗';
      this._draw();
    }
  }

  private _finish(
    state: string, amt: number, lcy: number,
    ccy: string, meta: Record<string, unknown>, label: string
  ) {
    this._r = { amt, lcy, ccy, meta };
    this._s = state; this._err = null;
    this._draw();
    EventBus.emit('charge-resolved', {
      type: this.getAttribute('type'), label,
      amount: amt, currency: ccy, amountLcy: lcy,
      optional: this.hasAttribute('optional'), zero: state === 'zero',
      noFx: meta['noFx'] as boolean | undefined,
      minApplied: meta['minApplied'] as boolean | undefined,
      minPayCcy:  meta['minPayCcy'] as number | null | undefined,
      meta
    });
  }

  private _draw() {
    const s = this._s, r = this._r;
    const cfg = STATE_CFG[s] ?? STATE_CFG['idle'];
    const isOpt = this.hasAttribute('optional');
    const label = this.getAttribute('label') ?? this.getAttribute('type');
    const isData = (s === 'resolved' || s === 'zero' || s === 'stale') && r;
    const appInfo = r?.meta?.['applicant'] as { name: string; tier: string; spread: number } | undefined;
    const minApplied = r?.meta?.['minApplied'] as boolean | undefined;
    const noFx       = r?.meta?.['noFx'] as boolean | undefined;
    const minPayCcy  = r?.meta?.['minPayCcy'] as number | null | undefined;
    const amtCcy     = r?.meta?.['amtCcy'] as string | undefined;
    const payCcy     = r?.ccy ?? 'TWD';

    let hints: string[] = [];
    if (appInfo) hints.push(`${appInfo.name} · ${appInfo.tier}級 · 基本 ${r!.meta['baseRate']} + Spread ${r!.meta['spreadRate']} = ${r!.meta['totalRate']}`);
    if (r?.meta?.['note']) hints.push(r.meta['note'] as string);
    if (r?.meta?.['defaulted']) hints.push('選填欄位未設定，以 0 計算');
    if (r?.meta?.['country'])   hints.push(`SWIFT 費率：${r.meta['country']} 查表`);
    // Other charge: amtCcy → TWD conversion detail
    if (amtCcy && amtCcy !== 'TWD') {
      const inputAmt = r!.meta['inputAmt'] as number;
      hints.push(
        `${amtCcy} ${inputAmt.toFixed(2)} × ${r!.meta['amtRate']} (${amtCcy}/TWD)`
        + ` = TWD ${(r!.meta['amtLcy'] as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }
    // Commission min detail
    if (minApplied && minPayCcy != null && payCcy !== 'TWD') {
      hints.push(`MIN TWD ${MIN_COMM.toLocaleString()} = ${fmt(minPayCcy, payCcy)} 已套用`);
    } else if (minApplied) {
      hints.push(`MIN TWD ${MIN_COMM.toLocaleString()} 已套用`);
    }
    // Generic FX rates (exclude special meta keys)
    const SKIP = new Set(['note','defaulted','country','amtCcy','amtRate','amtLcy','inputAmt',
                          'minApplied','rawLcy','minPayCcy','noFx','applicant','baseRate','spreadRate','totalRate']);
    Object.entries(r?.meta ?? {})
      .filter(([k]) => k.includes('/') && !SKIP.has(k))
      .forEach(([k, v]) => hints.push(`${k}: ${v}`));

    this.shadowRoot!.innerHTML = `
      <style>${baseStyle(cfg)}</style>
      <div class="wrap">
        <div class="hd">
          <span class="title">
            ${label} 🔒
            ${isOpt ? '<span class="opt-tag">選填</span>' : ''}
            ${noFx  ? '<span class="nofx-tag">無換匯</span>' : ''}
            ${minApplied ? '<span class="min-tag">MIN</span>' : ''}
          </span>
          <span class="badge">${cfg.icon} ${cfg.badge}</span>
        </div>
        ${isData && r ? `
          <div class="row" style="${s === 'stale' ? 'opacity:.5' : ''}">
            <span class="lbl">收費金額</span>
            <span class="val">${fmt(r.amt, r.ccy)}</span>
          </div>
          ${r.ccy !== 'TWD' ? `
          <div class="row" style="${s === 'stale' ? 'opacity:.5' : ''}">
            <span class="lbl">折合新台幣</span>
            <span class="val">${fmt(r.lcy, 'TWD')}</span>
          </div>` : ''}
          ${hints.length ? `<div class="hint">${hints.join(' · ')}</div>` : ''}
          ${s === 'stale' ? '<div style="font-size:9px;color:#d97706;margin-top:3px">🕐 重新計算中…</div>' : ''}
        ` : `
          <div class="msg" style="margin-top:4px">${
            s === 'idle'    ? (isOpt ? '選填欄位，空白時以 0 計算' : '等待前置條件完成…') :
            s === 'pending' ? '等待輸入完成…' :
            s === 'loading' ? '⏳ 計算中（查詢匯率 / 客戶資料…）' :
            '⚠ ' + (this._err ?? '計算失敗')
          }</div>
        `}
      </div>`;
  }
}

if (!customElements.get('charge-component')) {
  customElements.define('charge-component', ChargeComponent);
}
