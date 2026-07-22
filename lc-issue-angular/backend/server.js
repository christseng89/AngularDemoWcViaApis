/**
 * LC Issue — Charge Calculation Server
 * ======================================
 * All financial calculations run HERE, not in the browser.
 *
 * Endpoints:
 *   GET  /api/config/defaults     — return server-authoritative default form values
 *   GET  /api/fx/rates            — return all FX rates (for Payment Grid display)
 *   GET  /api/fx/rate/:from/:to   — return single rate
 *   GET  /api/applicant/:id       — return applicant spread info
 *   POST /api/charges/calc        — main endpoint: compute all charge rows
 *
 * PRODUCTION NOTE: Replace the hardcoded RATES/APPLICANTS/POSTAGE tables with
 * real data sources (FX feed API, CRM, pricing engine, etc.).
 */

'use strict';

const express = require('express');
const cors    = require('cors');

const app = express();
app.use(express.json());
app.use(cors());   // allow Angular dev server on :4200 to call :3000

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_COMM  = 1000;   // TWD
const SWIFT_FEE = 800;    // TWD default (before country lookup)

// Simulated FX rate table (base: TWD).
// In production: call a real FX feed (e.g. Bloomberg, Reuters, internal treasury system).
const RATES = {
  'USD/TWD': 32.50,
  'EUR/TWD': 35.20,
  'JPY/TWD': 0.218,
  'GBP/TWD': 41.20,
  'USD/EUR': 1.0860,
  'EUR/USD': 0.9208,
  'JPY/USD': 0.00671,
  'GBP/USD': 1.268,
};

// Simulated customer spread table.
// In production: query CRM / internal pricing engine by applicant ID.
const APPLICANTS = {
  'C-001': { name: 'Acme Corp',  tier: 'A', spread: 0.05 },  // spread in %
  'C-002': { name: 'Beta Ltd',   tier: 'B', spread: 0.10 },
  'C-003': { name: 'Gamma Inc',  tier: 'C', spread: 0.15 },
};

// SWIFT postage fee by beneficiary country (TWD).
// In production: query a postage/routing fee table.
const POSTAGE = { US: 800, UK: 900, DE: 950, JP: 850, CN: 750 };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Proper 四捨五入 — avoids JS toFixed() floating-point edge cases */
function round(n, d = 2) {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
}

/** decimal places for currency — TWD and JPY are integer-only (四捨五入到整數位) */
function dp(ccy) { return (ccy === 'JPY' || ccy === 'TWD') ? 0 : 2; }

/**
 * Look up FX rate (cross-rate via TWD if direct pair not available).
 * Throws if rate cannot be derived.
 */
function getRate(from, to) {
  if (from === to) return 1;
  const key = `${from}/${to}`;
  if (RATES[key] != null) return RATES[key];
  const inv = RATES[`${to}/${from}`];
  if (inv != null) return 1 / inv;
  // Try cross via TWD
  const fTwd = RATES[`${from}/TWD`];
  const tTwd = RATES[`${to}/TWD`];
  if (fTwd && tTwd) return fTwd / tTwd;
  throw new Error(`匯率 ${key} 無法取得`);
}

// ── Core calculation ──────────────────────────────────────────────────────────

/**
 * Calculate a single charge row.
 * All financial arithmetic runs here on the server.
 *
 * @param {object} charge     - { id, type, label, payCcy, amount?, amtCcy? }
 * @param {object} ctx        - { lcAmount, lcCurrency, marginRate, commRate, applicantId, beneficiaryCountry }
 * @returns {object}          - Row result merged into the charge: { twdAmt, payAmt, state, detail, ... }
 */
function calcCharge(charge, ctx) {
  const {
    lcAmount, lcCurrency = 'USD',
    marginRate = 0, commRate = 0.25, tolerancePct = 0,
    applicantId, beneficiaryCountry,
  } = ctx;

  const {
    id, type, label = type,
    payCcy = 'TWD',
    amount = 0, amtCcy = 'TWD',
  } = charge;

  let twdAmt = 0, payAmt = 0;
  let detail = {};
  let minApplied = false, minPayCcy = null, noFx = false;

  try {
    // ── margin ───────────────────────────────────────────────────────────────
    if (type === 'margin') {
      const rp = parseFloat(marginRate) || 0;
      if (!rp || rp <= 0) {
        return { id, type, label, payCcy, twdAmt: 0, payAmt: 0,
                 state: 'zero', noFx: false, detail: { ratePct: 0 } };
      }
      const lcTwd = getRate(lcCurrency, 'TWD');
      const mLC   = lcAmount * (rp / 100);
      twdAmt = round(mLC * lcTwd, 2);
      detail = { ratePct: rp, lcAmt: lcAmount, lcCcy: lcCurrency, mLC, lcTwd };

      if (payCcy === lcCurrency) {
        // noFx: paying in LC currency — no intermediate TWD conversion
        noFx   = true;
        payAmt = round(mLC, dp(payCcy));
      } else if (payCcy === 'TWD') {
        payAmt = twdAmt;
      } else {
        const pcTwd = getRate(payCcy, 'TWD');
        payAmt = round(twdAmt / pcTwd, dp(payCcy));
      }

    // ── commission ───────────────────────────────────────────────────────────
    } else if (type === 'commission') {
      const base = parseFloat(commRate) / 100;                      // e.g. 0.25% → 0.0025
      const appInfo = APPLICANTS[applicantId];
      const spr  = appInfo ? appInfo.spread / 100 : 0;              // e.g. 0.05% → 0.0005
      const eff  = base + spr;
      const tol  = (parseFloat(tolerancePct) || 0) / 100;           // e.g. 5 → 0.05
      const balFcy = lcAmount * (1 + tol);                          // LC Balance = LC Amount × (1 + tolerance%)
      const cLC  = balFcy * eff;
      const lcTwd = getRate(lcCurrency, 'TWD');
      const raw  = round(cLC * lcTwd, 2);

      minApplied = raw < MIN_COMM;
      twdAmt     = Math.max(raw, MIN_COMM);
      detail = { base, spr, eff, cLC, lcCcy: lcCurrency, lcAmt: lcAmount, tol, balFcy, lcTwd, raw, MIN_COMM };

      if (payCcy === 'TWD') {
        payAmt = twdAmt;
      } else {
        const pcTwd = getRate(payCcy, 'TWD');
        payAmt = round(twdAmt / pcTwd, dp(payCcy));
        if (minApplied) minPayCcy = round(MIN_COMM / pcTwd, dp(payCcy));
      }

    // ── swift / postage ──────────────────────────────────────────────────────
    } else if (type === 'swift') {
      twdAmt = beneficiaryCountry
        ? (POSTAGE[beneficiaryCountry] ?? SWIFT_FEE)
        : SWIFT_FEE;
      detail = { country: beneficiaryCountry, fee: twdAmt };

      if (payCcy === 'TWD') {
        payAmt = twdAmt;
      } else {
        const pcTwd = getRate(payCcy, 'TWD');
        payAmt = round(twdAmt / pcTwd, dp(payCcy));
      }

    // ── other (custom user-entered amount) ───────────────────────────────────
    } else if (type === 'other') {
      const ac = amtCcy || 'TWD';
      if (ac !== 'TWD') {
        const acRate = getRate(ac, 'TWD');
        twdAmt = round(amount * acRate, 2);
        detail = { amtCcy: ac, amt: amount, acRate };
      } else {
        twdAmt = amount;
        detail = { amtCcy: 'TWD', amt: amount };
      }

      if (payCcy === 'TWD') {
        payAmt = twdAmt;
      } else {
        const pcTwd = getRate(payCcy, 'TWD');
        payAmt = round(twdAmt / pcTwd, dp(payCcy));
      }
    }

    const state = (!twdAmt || twdAmt === 0) ? 'zero' : 'resolved';
    return {
      id, type, label, payCcy, twdAmt, payAmt, state,
      detail, minApplied, minPayCcy, noFx,
      spreadInfo: APPLICANTS[applicantId] ?? null,
    };

  } catch (err) {
    return { id, type, label, payCcy, twdAmt: 0, payAmt: 0,
             state: 'error', errMsg: err.message, detail: {} };
  }
}

// Server-authoritative default field values for the LC Issue form.
// In production: derive from branch/product policy config rather than hardcoding.
const DEFAULTS = {
  lcCurrency:   'USD',
  lcAmount: 100,
  tolerancePct: 15,
  commissionPct: 0.25,
  marginPct:    0,
};

// ── Routes ────────────────────────────────────────────────────────────────────

/** Return server-authoritative default values for initializing the LC Issue form */
app.get('/api/config/defaults', (req, res) => {
  res.json({ ...DEFAULTS, at: new Date().toISOString() });
});

/** Return all known FX rates (used by Payment Grid for TWD equiv display) */
app.get('/api/fx/rates', (req, res) => {
  res.json({ rates: RATES, at: new Date().toISOString() });
});

/** Return a single FX rate */
app.get('/api/fx/rate/:from/:to', (req, res) => {
  try {
    const rate = getRate(req.params.from, req.params.to);
    res.json({ from: req.params.from, to: req.params.to, rate });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Return applicant spread/tier info */
app.get('/api/applicant/:id', (req, res) => {
  const info = APPLICANTS[req.params.id];
  if (!info) return res.status(404).json({ error: `客戶 ${req.params.id} 不存在` });
  res.json(info);
});

/**
 * Main endpoint: compute all charge rows in one shot.
 *
 * Request body:
 * {
 *   lcAmount:           number,
 *   lcCurrency:         string,   // USD | EUR | JPY | GBP
 *   marginRate:         number,   // margin %
 *   commRate:           number,   // commission base %
 *   tolerancePct:       number,   // tolerance % — commission base = LC Balance = lcAmount × (1 + tolerancePct%)
 *   applicantId:        string,
 *   beneficiaryCountry: string,   // ISO country code
 *   charges: [
 *     { id, type, label, payCcy, amount?, amtCcy? }
 *   ]
 * }
 *
 * Response:
 * {
 *   rows: [{ id, type, label, payCcy, twdAmt, payAmt, state, detail, ... }],
 *   rates: { 'USD/TWD': 32.50, ... },
 *   at: ISO datetime
 * }
 */
app.post('/api/charges/calc', (req, res) => {
  const {
    lcAmount, lcCurrency, marginRate, commRate, tolerancePct,
    applicantId, beneficiaryCountry, charges,
  } = req.body;

  if (!Array.isArray(charges)) {
    return res.status(400).json({ error: '`charges` must be an array' });
  }

  const ctx = { lcAmount, lcCurrency, marginRate, commRate, tolerancePct, applicantId, beneficiaryCountry };
  const rows = charges.map(c => calcCharge(c, ctx));

  res.json({ rows, rates: RATES, at: new Date().toISOString() });
});

/**
 * Payment reconciliation — server-authoritative.
 *
 * Computes TWD-equivalent for each payment group and determines whether the
 * payment is balanced against the charge total.
 * The "balanced" business rule (|diff| < 1 TWD) lives here, not in the browser.
 *
 * Request body:
 * {
 *   groups: [
 *     { ccy: string, finalAmt: number, twdTotal: number }
 *   ]
 * }
 *
 * Response:
 * {
 *   groups:     [{ ccy, twdEquiv }],
 *   totalTwd:   number,   // Σ twdTotal  (sum of server-computed charge TWD amounts)
 *   totalEquiv: number,   // Σ twdEquiv  (sum of payment TWD equivalents)
 *   diff:       number,   // totalTwd − totalEquiv
 *   balanced:   boolean,  // |diff| < 1 TWD  ← business rule on server
 *   at:         string,
 * }
 */
app.post('/api/payment/reconcile', (req, res) => {
  const { groups } = req.body;
  if (!Array.isArray(groups)) {
    return res.status(400).json({ error: '`groups` must be an array' });
  }

  try {
    let totalTwd   = 0;
    let totalEquiv = 0;

    const outGroups = groups.map(g => {
      const { ccy, finalAmt = 0, twdTotal = 0 } = g;
      let twdEquiv;
      if (ccy === 'TWD') {
        twdEquiv = round(finalAmt, 0);   // TWD = integer
      } else {
        const rate = getRate(ccy, 'TWD');
        twdEquiv   = round(finalAmt * rate, 0);   // convert to TWD = integer
      }
      totalTwd   += twdTotal;
      totalEquiv += twdEquiv;
      return { ccy, twdEquiv };
    });

    totalTwd   = round(totalTwd,   0);  // TWD integer
    totalEquiv = round(totalEquiv, 0);
    const diff     = round(totalTwd - totalEquiv, 0);
    const balanced = Math.abs(diff) < 1;   // business rule: within 1 TWD is balanced

    res.json({ groups: outGroups, totalTwd, totalEquiv, diff, balanced, at: new Date().toISOString() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * LC Balance calculation — server-authoritative.
 *
 * All arithmetic runs here so that API callers (non-UI) get the same result.
 *
 * Request body:
 * {
 *   lcAmount:     number,   // LC face amount
 *   lcCurrency:   string,   // USD | EUR | JPY | GBP | TWD
 *   tolerancePct: number,   // e.g. 5 → 5%
 * }
 *
 * Response:
 * {
 *   balFcy:  number,  // lcAmount × (1 + tol) in LC currency
 *   balLcy:  number,  // balFcy × fx  (TWD)
 *   fx:      number,  // rate used: lcCurrency/TWD
 *   ccy:     string,
 *   amt:     number,
 *   tol:     number,  // tolerance as decimal (0.05 = 5%)
 *   at:      string,
 * }
 */
app.post('/api/balance/calc', (req, res) => {
  const { lcAmount, lcCurrency = 'USD', tolerancePct = 0 } = req.body;

  if (!lcAmount || isNaN(lcAmount) || lcAmount <= 0) {
    return res.status(400).json({ error: '`lcAmount` must be a positive number' });
  }

  try {
    const tol    = parseFloat(tolerancePct) / 100;          // 5 → 0.05
    const fx     = lcCurrency === 'TWD' ? 1 : getRate(lcCurrency, 'TWD');
    const balFcy = round(lcAmount * (1 + tol), dp(lcCurrency));
    const balLcy = round(balFcy * fx, dp('TWD'));  // TWD = 0 dp

    res.json({ balFcy, balLcy, fx, ccy: lcCurrency, amt: lcAmount, tol, at: new Date().toISOString() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ LC Charge Server listening on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/config/defaults`);
  console.log(`     GET  /api/fx/rates`);
  console.log(`     GET  /api/fx/rate/:from/:to`);
  console.log(`     GET  /api/applicant/:id`);
  console.log(`     POST /api/charges/calc`);
  console.log(`     POST /api/payment/reconcile`);
  console.log(`     POST /api/balance/calc`);
});
