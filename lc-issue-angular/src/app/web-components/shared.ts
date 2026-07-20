/**
 * Shared utilities and services for Web Components
 * (framework-agnostic — no Angular dependencies)
 */

// ── Constants ─────────────────────────────────────────────────

export const PAY_CCYS = ['TWD', 'USD', 'EUR', 'JPY', 'GBP'] as const;
export type PayCcy = typeof PAY_CCYS[number];

/** Minimum commission in TWD (四捨五入後比較) */
export const MIN_COMM = 1000;

/** SWIFT fixed fee in TWD */
export const SWIFT_FEE = 800;

// ── Rounding helper ───────────────────────────────────────────
/**
 * Proper 四捨五入: Math.round-based, avoids JS toFixed() floating-point edge cases.
 * e.g. round(24.615, 2) = 24.62  (vs (24.615).toFixed(2) = "24.61")
 */
export function round(n: number, d = 2): number {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
}

// ── Server-Side API Service ───────────────────────────────────
// All financial calculations run on the Node/Express backend (backend/server.js).
// These methods are the client-side gateway — they call the server and return results.

export interface ChargeInput {
  id: string;
  type: string;
  label: string;
  payCcy: string;
  amount?: number;
  amtCcy?: string;
}

export interface ChargeResult {
  id: string;
  type: string;
  label: string;
  payCcy: string;
  twdAmt: number;
  payAmt: number;
  state: 'resolved' | 'zero' | 'error';
  detail: Record<string, unknown>;
  minApplied?: boolean;
  minPayCcy?: number | null;
  noFx?: boolean;
  errMsg?: string;
  spreadInfo?: { name: string; tier: string; spread: number } | null;
}

export interface CalcRequest {
  lcAmount: number;
  lcCurrency: string;
  marginRate: number;
  commRate: number;
  applicantId: string;
  beneficiaryCountry: string;
  charges: ChargeInput[];
}

export interface CalcResponse {
  rows: ChargeResult[];
  rates: Record<string, number>;
  at: string;
}

export const ApiService = {
  /**
   * Send all charge rows to the backend for calculation.
   * The server computes twdAmt, payAmt, detail etc. and returns the full results.
   */
  async calcCharges(req: CalcRequest): Promise<CalcResponse> {
    const res = await fetch('/api/charges/calc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    return res.json() as Promise<CalcResponse>;
  },

  /** Fetch current FX rates from server (for Payment Grid TWD equiv display) */
  async getFxRates(): Promise<Record<string, number>> {
    const res = await fetch('/api/fx/rates');
    if (!res.ok) throw new Error('Failed to fetch FX rates');
    const data = await res.json() as { rates: Record<string, number> };
    return data.rates;
  },
};

// ── Customer Account Database ─────────────────────────────────
// Mirrors CUST_ACCTS in v3 HTML demo.
// 一幣多帳 (one currency, multiple accounts) → dropdown in PaymentGrid
// 一帳多幣 (one account, multiple currencies) → appears in each applicable currency group
// 一帳號   (single account for that currency) → auto-default, no dropdown

export interface CustAcct {
  id: string;
  name: string;
  no: string;
  ccys: string[];
  /** pledge=true → 保證金/擔保帳號，僅用於到單抵扣，不出現在費用扣帳下拉選單 */
  pledge?: boolean;
}

export const CUST_ACCTS: Record<string, CustAcct[]> = {
  'C-001': [
    { id:'A1-T1', name:'Acme 台幣往來帳戶',   no:'014-10-12345', ccys:['TWD'] },
    { id:'A1-U1', name:'Acme 美元貿易帳戶',   no:'014-20-11001', ccys:['USD'] },
    { id:'A1-U2', name:'Acme 美元保證金帳戶', no:'014-20-11002', ccys:['USD'], pledge: true },
    { id:'A1-FX', name:'Acme 外幣綜合帳戶',   no:'014-30-99001', ccys:['USD','EUR','JPY','GBP'] },
  ],
  'C-002': [
    { id:'A2-T1', name:'Beta 台幣往來帳戶',   no:'026-10-22200', ccys:['TWD'] },
    { id:'A2-ALL',name:'Beta 綜合帳戶',        no:'026-30-88800', ccys:['TWD','USD','EUR','JPY','GBP'] },
  ],
  'C-003': [
    { id:'A3-T1', name:'Gamma 台幣帳戶',       no:'012-10-77700', ccys:['TWD'] },
    { id:'A3-U1', name:'Gamma 美元帳戶',       no:'012-20-55501', ccys:['USD'] },
    { id:'A3-E1', name:'Gamma 歐元帳戶',       no:'012-20-55502', ccys:['EUR'] },
    { id:'A3-J1', name:'Gamma 日圓帳戶',       no:'012-20-55503', ccys:['JPY'] },
    { id:'A3-G1', name:'Gamma 英鎊帳戶',       no:'012-20-55504', ccys:['GBP'] },
  ],
  '_default': [
    { id:'DEF-T', name:'台幣往來帳戶',         no:'TWD-DEFAULT',  ccys:['TWD'] },
    { id:'DEF-FX',name:'外幣綜合帳戶',         no:'FX-DEFAULT',   ccys:['USD','EUR','JPY','GBP'] },
  ],
};

/**
 * Return accounts for a given applicant that support the requested currency.
 * Pledge/保證金 accounts are excluded by default (includePledge=false).
 * They are only relevant at document presentation (到單), not at LC issuance fee collection.
 */
export function acctsByCcy(appId: string, ccy: string, includePledge = false): CustAcct[] {
  const pool = CUST_ACCTS[appId] ?? CUST_ACCTS['_default'];
  return pool.filter(a => a.ccys.includes(ccy) && (includePledge || !a.pledge));
}

// ── Shared EventBus ───────────────────────────────────────────
// Decoupled from Angular's DI; Web Components use this directly.
// Angular's EventBusService wraps this same instance.

export interface BalanceDetail {
  balFcy: number; balLcy: number; fx: number;
  ccy: string; amt: number; tol: number;
}
export interface ChargeDetail {
  type: string; label: string;
  amount: number; currency: string; amountLcy: number;
  optional: boolean; zero?: boolean;
  /** Margin paid in LC currency: no intermediate FX conversion */
  noFx?: boolean;
  /** Commission min (MIN_COMM TWD) was applied */
  minApplied?: boolean;
  /** MIN_COMM converted to payment currency (for non-TWD display) */
  minPayCcy?: number | null;
  meta?: Record<string, unknown>;
}

type Handler<T = unknown> = (d: T) => void;

const _lastBalance: { value: BalanceDetail | null } = { value: null };
const _lastCharges = new Map<string, unknown>();   // chargeId → charge obj (for PaymentGrid replay)
const _lastAppId: { value: string | null } = { value: null };
const _handlers: Record<string, Handler[]> = {};

export const EventBus = {
  emit(type: string, detail: unknown): void {
    if (type === 'balance-resolved')  _lastBalance.value = detail as BalanceDetail;
    if (type === 'balance-cleared')   _lastBalance.value = null;
    if (type === 'charge-update')     _lastCharges.set((detail as { id: string }).id, detail);
    if (type === 'charge-remove')     _lastCharges.delete((detail as { id: string }).id);
    if (type === 'applicant-changed') _lastAppId.value = detail as string;
    (_handlers[type] || []).forEach(fn => { try { fn(detail); } catch {} });
  },

  on<T = unknown>(type: string, fn: Handler<T>): () => void {
    if (!_handlers[type]) _handlers[type] = [];
    _handlers[type].push(fn as Handler);
    // Replay last known value for late subscribers
    if (type === 'balance-resolved' && _lastBalance.value) fn(_lastBalance.value as T);
    if (type === 'charge-update')    _lastCharges.forEach(c => fn(c as T));
    if (type === 'applicant-changed' && _lastAppId.value != null) fn(_lastAppId.value as T);
    return () => { _handlers[type] = _handlers[type].filter(x => x !== fn); };
  },

  get lastBalance() { return _lastBalance.value; },

  reset(): void {
    Object.keys(_handlers).forEach(k => delete _handlers[k]);
    _lastBalance.value = null;
    _lastCharges.clear();
    _lastAppId.value = null;
  }
};

// ── Utilities ─────────────────────────────────────────────────

/**
 * Format a number as a currency string.
 * Uses round() to ensure proper 四捨五入; JPY = 0 decimals.
 */
export function fmt(amount: number | null, currency: string): string {
  if (amount == null || isNaN(amount)) return '---';
  const dp = (currency === 'TWD' || currency === 'JPY') ? 0 : 2;
  const opts: Intl.NumberFormatOptions = { minimumFractionDigits: dp, maximumFractionDigits: dp };
  return `${currency} ${round(amount, dp).toLocaleString('en-US', opts)}`;
}

export const STATE_CFG: Record<string, { border: string; bg: string; text: string; icon: string; badge: string }> = {
  idle:    { border:'#e2e8f0', bg:'#f8fafc', text:'#94a3b8', icon:'—',  badge:'IDLE'     },
  pending: { border:'#fbbf24', bg:'#fffbeb', text:'#d97706', icon:'⏱', badge:'PENDING'  },
  loading: { border:'#93c5fd', bg:'#eff6ff', text:'#2563eb', icon:'⏳', badge:'LOADING'  },
  resolved:{ border:'#86efac', bg:'#f0fdf4', text:'#15803d', icon:'✓',  badge:'RESOLVED' },
  zero:    { border:'#d1d5db', bg:'#f9fafb', text:'#9ca3af', icon:'0',  badge:'DEFAULT'  },
  stale:   { border:'#d1d5db', bg:'#f9fafb', text:'#9ca3af', icon:'🕐', badge:'STALE'    },
  error:   { border:'#fca5a5', bg:'#fef2f2', text:'#dc2626', icon:'⚠',  badge:'ERROR'    },
};

export function baseStyle(cfg: typeof STATE_CFG[string]): string {
  return `
    :host{display:block;font-family:'Segoe UI',sans-serif}
    .wrap{border:1.5px dashed ${cfg.border};border-radius:8px;background:${cfg.bg};
          padding:10px 13px;transition:border-color .2s,background .2s}
    .hd{display:flex;justify-content:space-between;align-items:center}
    .title{font-size:11px;font-weight:700;color:#475569}
    .badge{font-size:8px;font-weight:700;color:${cfg.text};padding:2px 8px;
           border:1px solid ${cfg.border};border-radius:99px;white-space:nowrap}
    .row{display:flex;justify-content:space-between;align-items:baseline;padding:2px 0}
    .lbl{font-size:10px;color:#64748b}
    .val{font-size:12px;font-weight:700;color:${cfg.text};font-family:Consolas,monospace}
    .hint{font-size:9px;color:#94a3b8;margin-top:4px;padding-top:4px;border-top:1px solid ${cfg.border}}
    .msg{font-size:10px;color:${cfg.text};padding:3px 0}
    .opt-tag{font-size:8px;font-weight:700;padding:1px 5px;border-radius:99px;
             background:#fff7ed;color:#c2410c;margin-left:4px}
    .nofx-tag{font-size:8px;font-weight:700;padding:1px 5px;border-radius:99px;
              background:#f0fdf4;color:#15803d;border:1px solid #86efac;margin-left:4px}
    .min-tag{font-size:8px;font-weight:700;padding:1px 5px;border-radius:99px;
             background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;margin-left:4px}
  `;
}
