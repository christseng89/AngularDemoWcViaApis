const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the standalone Web Components bundle (npm run build:wc) so the
// framework-free demo at /demo can call /api on the same origin.
app.use('/demo', express.static(path.join(__dirname, '..', 'dist', 'wc')));

// ─── Constants ───────────────────────────────────────────────────────────────
//
// CURRENCIES / RATES are fake/demo data (data/currencies.json, data/fx-rates.json)
// — not traced from a real rate feed or currency master. The real baseline concept
// this models is the STAN "Currency Master" function group (X/EE_SYS/FUNCGRP/
// grp_G49082300152.xml, InquireCurrency F05030701358) — a generic framework CRUD
// screen (JSP screen/STD/Std_Currency_Edit.jsp) with no bespoke field list to
// trace a response shape from, so this endpoint's shape is invented for the demo,
// same category as the pre-existing fake rate table it now replaces.
const CURRENCIES = require('./data/currencies.json');
const RATES = require('./data/fx-rates.json');
const DECIMALS = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.decimals]));

// Guard: every currency in currencies.json must have a TWD rate in fx-rates.json
// (RPFM-style "ensure all currency being used has an exchange rate captured") —
// fail fast at startup rather than let a dropdown silently offer a currency the
// calculators/FX bridge can't actually rate.
for (const c of CURRENCIES) {
  if (c.code === 'TWD') continue;
  if (!(`${c.code}/TWD` in RATES) && !(`TWD/${c.code}` in RATES)) {
    throw new Error(`data/fx-rates.json is missing a TWD rate for currency "${c.code}" (present in data/currencies.json) — every currency offered must have an exchange rate captured.`);
  }
}

const MIN_COMM        = 1000;  // TWD — general minimum (A1 commission)
const MIN_NEGO        = 800;   // TWD — B3 negotiation fee minimum
const MIN_COLLECTION  = 500;   // TWD — B5 collection fee minimum
const ADV_COMM_FLAT   = 500;   // TWD — B1 advising commission (flat)
const SWIFT_FEE       = 800;   // TWD
const CORR_BANK_CHARGES = 50;  // USD default

function rate(ccy, target) {
  const key = `${ccy}/${target}`;
  if (RATES[key] !== undefined) return RATES[key];
  const inv = `${target}/${ccy}`;
  if (RATES[inv] !== undefined) return 1 / RATES[inv];
  throw new Error(`No rate for ${key}`);
}

function dp(ccy) {
  return DECIMALS[ccy] ?? 2;
}

function round(n, d) {
  const factor = Math.pow(10, d);
  return Math.round(n * factor) / factor;
}

function fmtAmt(amount, ccy) {
  return round(amount, dp(ccy));
}

function entry(leg, account, accountType, ccy, amount, amountTwd, description) {
  return {
    leg,
    account,
    accountType,
    ccy,
    amount: fmtAmt(amount, ccy),
    amountTwd: round(amountTwd, 0),
    description,
  };
}

function currentRates() {
  return { ...RATES };
}

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', at: new Date().toISOString() });
});

// ─── FX Rates ────────────────────────────────────────────────────────────────
app.get('/api/fx/rates', (_req, res) => {
  res.json({ entries: [], summary: {}, rates: currentRates(), at: new Date().toISOString() });
});

// ─── Currencies ("Get Currency API") ──────────────────────────────────────────
// Fake/demo data (data/currencies.json) — see the doc comment above CURRENCIES.
app.get('/api/currencies', (_req, res) => {
  res.json({ currencies: CURRENCIES, at: new Date().toISOString() });
});

// ─── A1. Import LC Issue ──────────────────────────────────────────────────────
// Margin is pledged and held in transaction currency (lcCurrency).
// Dr CA splits by charge selection; Cr Margin is ALWAYS in lcCurrency.
// chargeSelections: { margin: 'USD'|'TWD', comm: 'USD'|'TWD', swift: 'TWD' }
// swift is always TWD and cannot be changed.
app.post('/api/import/issue/calc', (req, res) => {
  try {
    const {
      lcAmount,
      lcCurrency,
      marginRate      = 10,
      commRate        = 0.25,
      tolerancePct    = 0,
      applicantId,
      beneficiaryCountry,
      chargeSelections = {},
    } = req.body;

    if (!lcAmount || !lcCurrency) {
      return res.status(400).json({ error: 'lcAmount and lcCurrency are required' });
    }

    const r = rate(lcCurrency, 'TWD');

    // ── Margin ── held in lcCurrency (foreign)
    const marginLcAmt = round(lcAmount * (marginRate / 100), dp(lcCurrency));
    const marginTwd   = round(marginLcAmt * r, 0);

    // ── Commission ── based on LC Balance = LC Amount × (1 + Tolerance%), always income in TWD
    const lcBalance  = round(lcAmount * (1 + tolerancePct / 100), dp(lcCurrency));
    const rawCommTwd = round(lcBalance * r * (commRate / 100), 0);
    const commTwd    = Math.max(rawCommTwd, MIN_COMM);

    // ── SWIFT ── always TWD
    const swiftTwd = SWIFT_FEE;

    const totalDrCaTwd = marginTwd + commTwd + swiftTwd;

    // ── Determine payment currencies per charge ──
    const marginPayCcy = chargeSelections.margin ?? lcCurrency;  // default: pay margin in foreign
    const commPayCcy   = chargeSelections.comm   ?? 'TWD';       // default: commission in TWD
    const swiftPayCcy  = chargeSelections.swift  ?? 'TWD';       // default: SWIFT in TWD; can be foreign

    // ── Build Dr CA entries (grouped by payment ccy) ──
    const drCaMap = {}; // { ccy: { fcyAmt, twdAmt } }

    function addDrCa(ccy, fcyAmt, twdAmt) {
      if (!drCaMap[ccy]) drCaMap[ccy] = { fcyAmt: 0, twdAmt: 0 };
      drCaMap[ccy].fcyAmt += fcyAmt;
      drCaMap[ccy].twdAmt += twdAmt;
    }

    // Margin Dr CA
    if (marginPayCcy !== 'TWD') {
      addDrCa(lcCurrency, marginLcAmt, marginTwd);
    } else {
      addDrCa('TWD', marginTwd, marginTwd);
    }

    // Commission Dr CA
    if (commPayCcy !== 'TWD') {
      const commFcyAmt = round(commTwd / r, dp(lcCurrency));
      addDrCa(lcCurrency, commFcyAmt, commTwd);
    } else {
      addDrCa('TWD', commTwd, commTwd);
    }

    // SWIFT Dr CA (TWD by default; can be paid in foreign ccy)
    if (swiftPayCcy !== 'TWD') {
      const swiftFcyAmt = round(swiftTwd / r, dp(lcCurrency));
      addDrCa(lcCurrency, swiftFcyAmt, swiftTwd);
    } else {
      addDrCa('TWD', swiftTwd, swiftTwd);
    }

    const entries = [];

    // Dr CA entries (one per currency)
    for (const [ccy, { fcyAmt, twdAmt }] of Object.entries(drCaMap)) {
      const fmtFcy = ccy === 'TWD' ? Math.round(fcyAmt) : round(fcyAmt, dp(ccy));
      entries.push(entry('Dr', `CA - ${applicantId || 'Applicant'}`, 'CA',
        ccy, fmtFcy, Math.round(twdAmt),
        `LC issuance charges (${ccy})`));
    }

    // Cr Margin — ALWAYS in lcCurrency (transaction currency), regardless of how customer paid
    entries.push(entry('Cr', 'Margin Pledge A/C', 'Margin',
      lcCurrency, marginLcAmt, marginTwd,
      `Margin pledge ${marginRate}% of LC ${lcCurrency} ${fmtAmt(lcAmount, lcCurrency)}`));

    // Cr Commission income (TWD)
    entries.push(entry('Cr', 'Commission Income', 'Income',
      'TWD', commTwd, commTwd,
      `LC issuance commission @ ${commRate}%`));

    // Cr SWIFT fee income (TWD)
    entries.push(entry('Cr', 'SWIFT Fee Income', 'Income',
      'TWD', swiftTwd, swiftTwd,
      `SWIFT transmission fee`));

    res.json({
      entries,
      summary: {
        lcAmount,
        lcCurrency,
        marginRate,
        marginLcAmt,   // foreign ccy amount
        marginTwd,     // TWD equivalent for display
        commRate,
        tolerancePct,
        lcBalance,     // LC Amount × (1 + Tolerance%) — commission base
        commTwd,
        swiftTwd,
        totalDrCaTwd,
        applicantId,
        beneficiaryCountry,
        fxRate: r,
      },
      // Echo back effective selections so frontend can restore after re-calc
      chargeSelections: {
        margin: marginPayCcy,
        comm:   commPayCcy,
        swift:  swiftPayCcy,
      },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── A2. Import Settlement (Sight/Usance) ────────────────────────────────────
// Margin is released in transaction currency (billCurrency).
// Net customer payment = billAmount + corrCharges − marginHeld  (all in billCcy).
// chargeSelections: { net: 'USD'|'TWD' }
app.post('/api/import/settlement/calc', (req, res) => {
  try {
    const {
      billAmount,
      billCurrency,
      marginHeld          = 0,         // amount in billCurrency (foreign) — renamed from marginHeldTwd
      corrBankCharges     = CORR_BANK_CHARGES,
      corrBankChargesCcy  = 'USD',
      chargeSelections    = {},
    } = req.body;

    if (!billAmount || !billCurrency) {
      return res.status(400).json({ error: 'billAmount and billCurrency are required' });
    }

    const r = rate(billCurrency, 'TWD');

    // Margin released in foreign ccy
    const marginTwd = round(marginHeld * r, 0);

    // Bill
    const billTwd = round(billAmount * r, 0);

    // Corr charges — convert to billCcy for net calculation
    const corrInBillCcy = corrBankChargesCcy === billCurrency
      ? corrBankCharges
      : round(corrBankCharges * rate(corrBankChargesCcy, billCurrency), dp(billCurrency));
    const corrChargeTwd = round(corrInBillCcy * r, 0);

    const totalPayTwd = billTwd + corrChargeTwd;  // gross (before margin release)

    // Net customer payment in billCcy = gross − margin
    const netBillCcy = round(billAmount + corrInBillCcy - marginHeld, dp(billCurrency));
    const netCaTwd   = round(netBillCcy * r, 0);

    // Payment currency selection (default: billCurrency = foreign)
    const netPayCcy = chargeSelections.net ?? billCurrency;

    const netPayAmt = netPayCcy === 'TWD' ? netCaTwd : netBillCcy;
    const netPayTwd = netPayCcy === 'TWD' ? netCaTwd : netCaTwd;

    const entries = [
      // Release margin in foreign ccy
      entry('Dr', 'Margin Pledge A/C', 'Margin',
        billCurrency, marginHeld, marginTwd,
        'Release margin pledge (transaction currency)'),

      // Customer net payment
      entry('Dr', `CA - Applicant`, 'CA',
        netPayCcy, netPayAmt, netPayTwd,
        `Net payment: bill + corr − margin (${netPayCcy})`),

      // Nostro — gross in billCcy (bill + corr converted to billCcy)
      entry('Cr', 'Nostro Account', 'Nostro',
        billCurrency, round(billAmount + corrInBillCcy, dp(billCurrency)), totalPayTwd,
        `Pay correspondent: bill + charges (${billCurrency})`),
    ];

    res.json({
      entries,
      summary: {
        billAmount,
        billCurrency,
        billTwd,
        marginHeld,      // foreign ccy (NEW — was marginHeldTwd)
        marginTwd,       // TWD equivalent for display
        corrBankCharges,
        corrBankChargesCcy,
        corrInBillCcy,
        corrChargeTwd,
        totalPayTwd,     // gross TWD
        netBillCcy,      // net in foreign ccy
        netCaTwd,        // net TWD equivalent
        billFxRate: r,
        fxRate: r,
      },
      chargeSelections: { net: netPayCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── A3. Import Sight Payment (IBL Lodgement) ────────────────────────────────
// IBL = Bill Amount − Margin (net bank exposure after margin offset).
// Margin Pledge A/C Dr'd (in transaction ccy) to partially fund the Nostro payment.
// Dr CA collects corr bank charges from customer (customer chooses payment ccy).
// Nostro Cr = full bill amount + corr charges (transaction ccy).
// chargeSelections: { corr: billCcy|'TWD' }
app.post('/api/import/sight-payment/calc', (req, res) => {
  try {
    const {
      billAmount,
      billCurrency,
      marginHeld         = 0,                // in billCurrency (from A1 LC issuance)
      corrBankCharges    = CORR_BANK_CHARGES,
      corrBankChargesCcy = 'USD',
      applicantId,
      chargeSelections   = {},
    } = req.body;

    if (!billAmount || !billCurrency) {
      return res.status(400).json({ error: 'billAmount and billCurrency are required' });
    }

    const r         = rate(billCurrency, 'TWD');
    const billTwd   = round(billAmount * r, 0);
    const marginTwd = round(marginHeld * r, 0);

    // Net IBL = bill − margin (transaction ccy)
    const iblAmount = round(billAmount - marginHeld, dp(billCurrency));
    const iblTwd    = round(iblAmount * r, 0);

    // Corr charges → convert to billCcy for Nostro total
    const corrInBillCcy = corrBankChargesCcy === billCurrency
      ? corrBankCharges
      : round(corrBankCharges * rate(corrBankChargesCcy, billCurrency), dp(billCurrency));
    const corrChargeTwd = round(corrInBillCcy * r, 0);

    // Customer pays corr charges in chosen ccy (default: transaction ccy)
    const corrPayCcy = chargeSelections.corr ?? billCurrency;
    const corrPayAmt = corrPayCcy === 'TWD' ? corrChargeTwd : corrInBillCcy;
    const corrPayTwd = corrChargeTwd;

    const entries = [
      // Dr IBL — net bank advance (bill minus margin already held)
      entry('Dr', 'IBL - Inward Bills Lodged', 'IBL',
        billCurrency, iblAmount, iblTwd,
        `Net IBL advance: ${billCurrency} ${billAmount} − margin ${marginHeld}`),

      // Dr Margin Pledge — release margin to fund Nostro (skip if no margin)
      ...(marginHeld > 0 ? [
        entry('Dr', 'Margin Pledge A/C', 'Margin',
          billCurrency, marginHeld, marginTwd,
          'Release margin pledge to fund Nostro payment'),
      ] : []),

      // Dr CA — collect corr bank charges from customer
      entry('Dr', `CA - ${applicantId || 'Applicant'}`, 'CA',
        corrPayCcy, corrPayAmt, corrPayTwd,
        `Correspondent bank charges collected (${corrPayCcy})`),

      // Cr Nostro — full bill + corr charges paid to correspondent (transaction ccy)
      entry('Cr', 'Nostro Account', 'Nostro',
        billCurrency, round(billAmount + corrInBillCcy, dp(billCurrency)), billTwd + corrChargeTwd,
        `Pay correspondent: bill ${billCurrency} ${billAmount} + charges`),
    ];

    res.json({
      entries,
      summary: {
        billAmount, billCurrency, billTwd,
        marginHeld, marginTwd,
        iblAmount, iblTwd,           // net IBL lodged
        corrBankCharges, corrBankChargesCcy, corrInBillCcy, corrChargeTwd,
        nostroTotal: round(billAmount + corrInBillCcy, dp(billCurrency)),
        nostroTotalTwd: billTwd + corrChargeTwd,
        fxRate: r,
      },
      chargeSelections: { corr: corrPayCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── A4. Import Sight Settlement (IBL → Customer) ────────────────────────────
// Margin was ALREADY consumed in A3 (used to fund Nostro payment).
// iblAmount = Bill − Margin (net amount lodged in A3, transaction ccy).
// Customer simply repays the net IBL: Dr CA (chosen ccy) / Cr IBL (transaction ccy).
// chargeSelections: { net: iblCcy|'TWD' }
app.post('/api/import/sight-settlement/calc', (req, res) => {
  try {
    const {
      iblAmount,
      iblCurrency,
      applicantId,
      chargeSelections = {},
    } = req.body;

    if (!iblAmount || !iblCurrency) {
      return res.status(400).json({ error: 'iblAmount and iblCurrency are required' });
    }

    const r      = rate(iblCurrency, 'TWD');
    const iblTwd = round(iblAmount * r, 0);

    // Customer repays net IBL in chosen ccy (default: transaction ccy = foreign)
    const netPayCcy = chargeSelections.net ?? iblCurrency;
    const netPayAmt = netPayCcy === 'TWD' ? iblTwd : iblAmount;
    const netPayTwd = iblTwd;

    const entries = [
      // Dr CA — customer repays net IBL advance
      entry('Dr', `CA - ${applicantId || 'Applicant'}`, 'CA',
        netPayCcy, netPayAmt, netPayTwd,
        `Customer repays IBL: ${iblCurrency} ${iblAmount} (${netPayCcy})`),

      // Cr IBL — clear net advance (transaction ccy)
      entry('Cr', 'IBL - Inward Bills Lodged', 'IBL',
        iblCurrency, iblAmount, iblTwd,
        'Clear net IBL advance'),
    ];

    res.json({
      entries,
      summary: {
        iblAmount,
        iblCurrency,
        iblTwd,
        fxRate: r,
      },
      chargeSelections: { net: netPayCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── B1. Export LC Advise ─────────────────────────────────────────────────────
// Flat TWD 500 advising commission (income always TWD).
// Dr CA in beneficiary's chosen currency.
// chargeSelections: { comm: 'TWD'|lcCcy }
app.post('/api/export/advise/calc', (req, res) => {
  try {
    const { lcAmount, lcCurrency, beneficiaryId, chargeSelections = {} } = req.body;

    if (!lcAmount || !lcCurrency) {
      return res.status(400).json({ error: 'lcAmount and lcCurrency are required' });
    }

    const r          = rate(lcCurrency, 'TWD');
    const advCommTwd = ADV_COMM_FLAT;  // flat TWD 500

    // Beneficiary pays in TWD or foreign ccy
    const commPayCcy = chargeSelections.comm ?? 'TWD';
    const commPayAmt = commPayCcy === 'TWD'
      ? advCommTwd
      : round(advCommTwd / r, dp(lcCurrency));

    const entries = [
      entry('Dr', `CA - ${beneficiaryId || 'Beneficiary'}`, 'CA',
        commPayCcy, commPayAmt, advCommTwd,
        `Advising commission (flat TWD ${ADV_COMM_FLAT}) (${commPayCcy})`),
      entry('Cr', 'Advising Commission Income', 'Income',
        'TWD', advCommTwd, advCommTwd,
        'LC advising commission income'),
    ];

    res.json({
      entries,
      summary: {
        lcAmount, lcCurrency, advCommTwd,
        fxRate: r,
      },
      chargeSelections: { comm: commPayCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── B2. Export LC Confirmed ──────────────────────────────────────────────────
// Commission is bank income (TWD). Dr CA in beneficiary's chosen currency.
// chargeSelections: { comm: 'TWD'|lcCcy }
app.post('/api/export/confirmed/calc', (req, res) => {
  try {
    const {
      lcAmount, lcCurrency, confRate = 0.2, tenorDays = 90, tolerancePct = 0,
      beneficiaryId, chargeSelections = {},
    } = req.body;

    if (!lcAmount || !lcCurrency) {
      return res.status(400).json({ error: 'lcAmount and lcCurrency are required' });
    }

    const r        = rate(lcCurrency, 'TWD');
    const quarters = Math.ceil(tenorDays / 90);

    // Commission is based on LC Balance = LC Amount × (1 + Tolerance%)
    const lcBalance   = round(lcAmount * (1 + tolerancePct / 100), dp(lcCurrency));
    const rawTwd      = round(lcBalance * r * (confRate / 100) * quarters, 0);
    const confCommTwd = Math.max(rawTwd, MIN_COMM);

    // Beneficiary pays in TWD or foreign ccy
    const commPayCcy = chargeSelections.comm ?? 'TWD';
    const commPayAmt = commPayCcy === 'TWD'
      ? confCommTwd
      : round(confCommTwd / r, dp(lcCurrency));

    const entries = [
      entry('Dr', `CA - ${beneficiaryId || 'Beneficiary'}`, 'CA',
        commPayCcy, commPayAmt, confCommTwd,
        `Confirming commission @ ${confRate}% × ${quarters} qtr(s) (${commPayCcy})`),
      entry('Cr', 'Confirming Commission Income', 'Income',
        'TWD', confCommTwd, confCommTwd,
        'LC confirming commission income'),
    ];

    res.json({
      entries,
      summary: {
        lcAmount, lcCurrency, confRate, tenorDays, quarters,
        tolerancePct, lcBalance, rawTwd, confCommTwd,
        minimumApplied: rawTwd < MIN_COMM,
        fxRate: r,
      },
      chargeSelections: { comm: commPayCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── B3. Export LC Nego ───────────────────────────────────────────────────────
// Bank lodges EBL and credits exporter net proceeds (TWD or billCcy).
// Charges (nego fee, discount) are always income in TWD.
// chargeSelections: { net: 'TWD'|billCcy }
app.post('/api/export/nego/calc', (req, res) => {
  try {
    const { billAmount, billCurrency, negoRate = 0.1, discountDays = 0, discountRate = 3, beneficiaryId, chargeSelections = {} } = req.body;

    if (!billAmount || !billCurrency) {
      return res.status(400).json({ error: 'billAmount and billCurrency are required' });
    }

    const r           = rate(billCurrency, 'TWD');
    const billTwd     = round(billAmount * r, 0);
    const rawNegoFee  = round(billTwd * (negoRate / 100), 0);
    const negoFee     = Math.max(rawNegoFee, MIN_NEGO);  // min TWD 800
    const discountAmt = discountDays > 0
      ? round(billTwd * (discountRate / 100) * discountDays / 360, 0)
      : 0;
    const netToExporterTwd = billTwd - negoFee - discountAmt;  // TWD
    // Net in billCcy: deduct fee/discount converted back to foreign
    const netBillCcy = round(billAmount - round((negoFee + discountAmt) / r, dp(billCurrency)), dp(billCurrency));

    // Exporter receives net in TWD (default) or bill currency
    const netPayCcy = chargeSelections.net ?? 'TWD';
    const netPayAmt = netPayCcy === 'TWD' ? netToExporterTwd : netBillCcy;

    const entries = [
      entry('Dr', 'EBL - Export Bills Lodged', 'EBL',
        billCurrency, billAmount, billTwd,
        'Lodge export bill for negotiation'),
      entry('Cr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
        netPayCcy, netPayAmt, netToExporterTwd,
        `Net proceeds to exporter (${netPayCcy})`),
      entry('Cr', 'Nego Fee Income', 'Income',
        'TWD', negoFee, negoFee,
        `Negotiation fee @ ${negoRate}%`),
      ...(discountAmt > 0 ? [
        entry('Cr', 'Discount Income', 'Income',
          'TWD', discountAmt, discountAmt,
          `Discount interest ${discountDays} days @ ${discountRate}%`),
      ] : []),
    ];

    res.json({
      entries,
      summary: {
        billAmount, billCurrency, billTwd,
        negoRate, rawNegoFee, negoFee,
        minimumApplied: rawNegoFee < MIN_NEGO,
        discountDays, discountRate, discountAmt,
        netToExporter: netToExporterTwd,   // TWD (legacy key kept for display)
        netBillCcy,                         // FCY equivalent
        fxRate: r,
      },
      chargeSelections: { net: netPayCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── B4. Export LC Settlement ─────────────────────────────────────────────────
// FBC: correspondent deducts FBC before wiring → Nostro receives bill − FBC.
//
// EBL path:
//   Dr Nostro (bill−fbc) / Dr CA (FBC pass-through) / [Dr FX Loss]
//   Cr EBL (transaction ccy, book rate) / [Cr FX Gain]
//
// Direct path (Nostro receives bill−fbc, credit exporter, charge settlement comm):
//   Same FBC ccy as CA ccy → FBC embedded: Cr CA = bill−fbc (Nostro amount)
//   Diff FBC ccy            → Dr CA (FBC) separately; Cr CA = bill (full)
//   + Dr CA (Comm in chosen ccy) / Cr Comm Income (TWD) — always
//
// chargeSelections: { bill: billCcy|'TWD', fbc: billCcy|'TWD', comm: 'TWD'|billCcy }
app.post('/api/export/settlement/calc', (req, res) => {
  try {
    const {
      billAmount, billCurrency, eblHeldTwd = 0, settlementType = 'ebl',
      beneficiaryId, foreignBankCharges = 0, commRate = 0.05, chargeSelections = {},
    } = req.body;

    if (!billAmount || !billCurrency) {
      return res.status(400).json({ error: 'billAmount and billCurrency are required' });
    }

    const r       = rate(billCurrency, 'TWD');
    const billTwd = round(billAmount * r, 0);

    // FBC — always in billCurrency. Correspondent deducts before wiring.
    const fbc    = Number(foreignBankCharges) || 0;
    const fbcTwd = fbc > 0 ? round(fbc * r, 0) : 0;
    const fbcCcy = fbc > 0 ? (chargeSelections.fbc ?? billCurrency) : billCurrency;

    // Nostro receives net: bill − FBC
    const nostroAmt = fbc > 0 ? round(billAmount - fbc, dp(billCurrency)) : billAmount;
    const nostroTwd = fbc > 0 ? billTwd - fbcTwd : billTwd;

    let entries = [];
    let effectiveBillPayCcy = billCurrency;
    let effectiveCommPayCcy = 'TWD';
    let comm = 0;
    let rawComm = 0;
    // Only meaningful on the Direct-to-CA path (net Cr CA amount after embedding FBC/comm) — stay
    // undefined on the EBL path (no Cr CA leg exists there), so res.json()'s JSON.stringify simply
    // omits them from summary rather than the route throwing "crCaTwd is not defined" (was declared
    // via `const` inside the `else` block below, out of scope for the summary object built after
    // the if/else — a ReferenceError on every EBL settlement).
    let crCaAmt;
    let crCaTwd;

    if (settlementType === 'ebl') {
      // ── EBL path ──
      // Dr CA for FBC (pass-through, always present when fbc > 0)
      const fbcDrEntry = fbc > 0 ? [
        entry('Dr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
          fbcCcy, fbcCcy === 'TWD' ? fbcTwd : fbc, fbcTwd,
          `FBC collected from exporter (${fbcCcy}) — pass-through to correspondent`),
      ] : [];

      const diff = billTwd - eblHeldTwd;
      entries = [
        entry('Dr', 'Nostro Account', 'Nostro',
          billCurrency, nostroAmt, nostroTwd,
          fbc > 0 ? `Receive settlement net of FBC from issuing bank (${billCurrency})` : 'Receive settlement from issuing bank'),
        ...fbcDrEntry,
        ...(diff < 0 ? [
          entry('Dr', 'FX Loss', 'FX', 'TWD', Math.abs(diff), Math.abs(diff), 'FX rate loss on EBL settlement'),
        ] : []),
        entry('Cr', 'EBL - Export Bills Lodged', 'EBL',
          billCurrency, billAmount, eblHeldTwd,
          'Clear EBL advance at original book rate (transaction ccy)'),
        ...(diff > 0 ? [
          entry('Cr', 'FX Gain', 'FX', 'TWD', Math.abs(diff), Math.abs(diff), 'FX rate gain on EBL settlement'),
        ] : []),
      ];
    } else {
      // ── Direct path ──
      effectiveBillPayCcy = chargeSelections.bill ?? billCurrency;
      effectiveCommPayCcy = chargeSelections.comm ?? 'TWD';

      // Settlement commission (similar to collection fee)
      rawComm = Number(commRate) > 0 ? round(billTwd * (Number(commRate) / 100), 0) : 0;
      comm    = rawComm > 0 ? Math.max(rawComm, MIN_COLLECTION) : 0;
      const commPayFcy = effectiveCommPayCcy !== 'TWD' ? round(comm / r, dp(billCurrency)) : comm;

      // Embedding rule: any charge in the SAME ccy as Cr CA → net into Cr CA (no separate Dr CA).
      const fbcEmbedded  = fbc  > 0 && fbcCcy              === effectiveBillPayCcy;
      const commEmbedded = comm > 0 && effectiveCommPayCcy  === effectiveBillPayCcy;

      // Cr CA = bill minus all embedded charges
      crCaAmt = effectiveBillPayCcy === 'TWD'
        ? billTwd    - (fbcEmbedded ? fbcTwd : 0) - (commEmbedded ? comm        : 0)
        : billAmount - (fbcEmbedded ? fbc    : 0) - (commEmbedded ? commPayFcy  : 0);
      crCaTwd = billTwd - (fbcEmbedded ? fbcTwd : 0) - (commEmbedded ? comm : 0);

      // Dr CA (FBC) — only when NOT embedded
      const fbcDrEntry = (!fbcEmbedded && fbc > 0) ? [
        entry('Dr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
          fbcCcy, fbcCcy === 'TWD' ? fbcTwd : fbc, fbcTwd,
          `FBC collected from exporter (${fbcCcy}) — pass-through to correspondent`),
      ] : [];

      // Dr CA (Comm) — only when NOT embedded; Cr Comm Income always present (when comm > 0)
      const commDrEntry = (!commEmbedded && comm > 0) ? [
        entry('Dr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
          effectiveCommPayCcy, effectiveCommPayCcy === 'TWD' ? comm : commPayFcy, comm,
          `Settlement commission @ ${commRate}% (${effectiveCommPayCcy})`),
      ] : [];
      const commCrEntry = comm > 0 ? [
        entry('Cr', 'Settlement Commission Income', 'Income',
          'TWD', comm, comm,
          `Settlement commission @ ${commRate}%`),
      ] : [];

      const embedded = [fbcEmbedded ? 'FBC' : '', commEmbedded ? 'comm' : ''].filter(Boolean);
      const crCaDesc = embedded.length
        ? `Credit exporter net of ${embedded.join(' + ')} (${effectiveBillPayCcy})`
        : `Credit exporter full bill (${effectiveBillPayCcy})`;

      entries = [
        entry('Dr', 'Nostro Account', 'Nostro',
          billCurrency, nostroAmt, nostroTwd,
          fbc > 0 ? `Receive settlement net of FBC from issuing bank (${billCurrency})` : 'Receive direct settlement from issuing bank'),
        ...fbcDrEntry,
        ...commDrEntry,
        entry('Cr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
          effectiveBillPayCcy, crCaAmt, crCaTwd, crCaDesc),
        ...commCrEntry,
      ];
    }

    res.json({
      entries,
      summary: {
        billAmount, billCurrency, billTwd,
        eblHeldTwd, settlementType,
        fxDiff: settlementType === 'ebl' ? billTwd - eblHeldTwd : 0,
        foreignBankCharges: fbc, fbcTwd, fbcCcy,
        commRate, rawComm, comm, commTwd: comm,
        minimumCommApplied: rawComm > 0 && rawComm < MIN_COLLECTION,
        crCaTwd, crCaAmt,  // actual Cr CA amounts (after embedding)
        fxRate: r,
      },
      chargeSelections: { bill: effectiveBillPayCcy, fbc: fbcCcy, comm: effectiveCommPayCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── B5. Export LC Settlement on Collection (without EBL) ───────────────────
// Bank acts as collecting agent — no prior EBL advance.
// FBC: correspondent deducts before wiring → Nostro receives bill − FBC.
//   Dr CA (FBC pass-through, chosen ccy)
//   If fbcCcy = netPayCcy → FBC embedded in Cr CA net; otherwise Dr CA separately.
// Collection fee: 0.05% × billTwd, min TWD 500 — Cr Income always TWD.
//   Customer selects ccy to pay (TWD default or billCcy) → Dr CA (colFee).
//   Collection fee is a SEPARATE Dr CA entry — Cr CA = full bill (or bill−fbc if embedded).
// chargeSelections: { net: billCcy|'TWD', fbc: billCcy|'TWD', colFee: 'TWD'|billCcy }
app.post('/api/export/collection/calc', (req, res) => {
  try {
    const {
      billAmount, billCurrency, collectionRate = 0.05, beneficiaryId,
      foreignBankCharges = 0, chargeSelections = {},
    } = req.body;

    if (!billAmount || !billCurrency) {
      return res.status(400).json({ error: 'billAmount and billCurrency are required' });
    }

    const r             = rate(billCurrency, 'TWD');
    const billTwd       = round(billAmount * r, 0);
    const rawColFee     = round(billTwd * (collectionRate / 100), 0);
    const collectionFee = Math.max(rawColFee, MIN_COLLECTION);  // min TWD 500

    // FBC — correspondent deducts before wiring; bank collects from exporter (pass-through)
    const fbc    = Number(foreignBankCharges) || 0;
    const fbcTwd = fbc > 0 ? round(fbc * r, 0) : 0;
    const fbcCcy = fbc > 0 ? (chargeSelections.fbc ?? billCurrency) : billCurrency;

    // Nostro receives: bill − FBC
    const nostroAmt = fbc > 0 ? round(billAmount - fbc, dp(billCurrency)) : billAmount;
    const nostroTwd = fbc > 0 ? billTwd - fbcTwd : billTwd;

    // Collection fee payment ccy (default TWD, or billCcy)
    const colFeeCcy    = chargeSelections.colFee ?? 'TWD';
    const colFeePayFcy = colFeeCcy !== 'TWD' ? round(collectionFee / r, dp(billCurrency)) : collectionFee;

    // CA credit (net) ccy
    const netPayCcy = chargeSelections.net ?? billCurrency;

    // Embedding rule: any charge in the SAME ccy as Cr CA → net into Cr CA (no separate Dr CA).
    // Different-ccy charges → own Dr CA entry.
    const fbcEmbedded    = fbc > 0 && fbcCcy === netPayCcy;
    const colFeeEmbedded = colFeeCcy === netPayCcy;

    // Cr CA = bill minus all embedded charges
    const crCaFcy = netPayCcy === 'TWD'
      ? billTwd    - (fbcEmbedded ? fbcTwd : 0) - (colFeeEmbedded ? collectionFee   : 0)
      : billAmount - (fbcEmbedded ? fbc    : 0) - (colFeeEmbedded ? colFeePayFcy    : 0);
    const crCaTwd = billTwd - (fbcEmbedded ? fbcTwd : 0) - (colFeeEmbedded ? collectionFee : 0);

    // Dr CA (FBC) — only when NOT embedded
    const fbcDrEntry = (!fbcEmbedded && fbc > 0) ? [
      entry('Dr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
        fbcCcy, fbcCcy === 'TWD' ? fbcTwd : fbc, fbcTwd,
        `FBC collected from exporter (${fbcCcy}) — pass-through to correspondent`),
    ] : [];

    // Dr CA (colFee) — only when NOT embedded
    const colFeeDrEntry = !colFeeEmbedded ? [
      entry('Dr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
        colFeeCcy, colFeeCcy === 'TWD' ? collectionFee : colFeePayFcy, collectionFee,
        `Collection fee @ ${collectionRate}% (${colFeeCcy})`),
    ] : [];

    // Build description for Cr CA showing what was embedded
    const embedded = [fbcEmbedded ? 'FBC' : '', colFeeEmbedded ? 'col.fee' : ''].filter(Boolean);
    const crCaDesc = embedded.length
      ? `Credit exporter net of ${embedded.join(' + ')} (${netPayCcy})`
      : `Credit exporter full bill (${netPayCcy})`;

    const entries = [
      entry('Dr', 'Nostro Account', 'Nostro',
        billCurrency, nostroAmt, nostroTwd,
        fbc > 0 ? `Receive collection net of FBC from issuing bank (${billCurrency})` : 'Receive collection payment from issuing bank'),
      ...fbcDrEntry,
      ...colFeeDrEntry,
      entry('Cr', `CA - ${beneficiaryId || 'Exporter'}`, 'CA',
        netPayCcy, crCaFcy, crCaTwd, crCaDesc),
      entry('Cr', 'Collection Fee Income', 'Income',
        'TWD', collectionFee, collectionFee,
        `Collection fee @ ${collectionRate}%`),
    ];

    res.json({
      entries,
      summary: {
        billAmount, billCurrency, billTwd,
        collectionRate, rawColFee, collectionFee,
        minimumApplied: rawColFee < MIN_COLLECTION,
        foreignBankCharges: fbc, fbcTwd, fbcCcy,
        colFeeCcy,
        crCaTwd, crCaFcy,   // actual Cr CA amounts (after embedding)
        fxRate: r,
      },
      chargeSelections: { net: netPayCcy, fbc: fbcCcy, colFee: colFeeCcy },
      rates: currentRates(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
// Only binds the port when run directly (`node server.js` / `npm start` / `npm run dev`) — guarded
// so `require('./server')` from a test (server.test.js, via supertest) can exercise `app` without
// also trying to listen on :3001, which would collide with an already-running dev instance.
const PORT = 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nlc-payment-wc backend running on port ${PORT}\n`);
    console.log('Endpoints:');
    console.log('  GET  /api/health');
    console.log('  GET  /api/fx/rates');
    console.log('  GET  /api/currencies');
    console.log('  POST /api/import/issue/calc          — A1 (chargeSelections: margin/comm/swift)');
    console.log('  POST /api/import/settlement/calc     — A2 (marginHeld in billCcy, chargeSelections: net)');
    console.log('  POST /api/import/sight-payment/calc  — A3 (bank-internal)');
    console.log('  POST /api/import/sight-settlement/calc — A4 (marginHeld in iblCcy, chargeSelections: net)');
    console.log('  POST /api/export/advise/calc          — B1 (flat TWD 500)');
    console.log('  POST /api/export/confirmed/calc       — B2');
    console.log('  POST /api/export/nego/calc            — B3 (min TWD 800)');
    console.log('  POST /api/export/settlement/calc      — B4 (EBL or direct)');
    console.log('  POST /api/export/collection/calc      — B5 (on collection, min TWD 500)\n');
  });
}

module.exports = app;
