const request = require('supertest');
const app = require('../server');

// B4 — Export LC Settlement (POST /api/export/settlement/calc).
//
// Reviewer-reported bug (2026-08-12): every EBL (clear advance) settlement returned HTTP 500 with
// `{"error":"crCaTwd is not defined"}`. Root cause: `crCaAmt`/`crCaTwd` were declared via `const`
// INSIDE the Direct-to-CA `else` branch only, but the shared `summary` object built after the
// if/else unconditionally referenced them — a ReferenceError on every EBL request, since that
// branch never enters the `else` block where those names exist. Fixed by hoisting both to `let`
// at the top of the route handler (assigned only on the Direct path), so they stay `undefined` —
// and are therefore omitted by `res.json()`'s JSON.stringify — on the EBL path, instead of
// crashing. This file locks in both the reported EBL transaction and a Direct-to-CA regression
// guard so the two paths can't silently regress into each other again.
describe('POST /api/export/settlement/calc (B4 — Export LC Settlement)', () => {
  const reportedEblTransaction = {
    beneficiaryId: 'C-001',
    billAmount: 200000,
    billCurrency: 'USD',
    eblHeldTwd: 6500000,
    settlementType: 'ebl',
    foreignBankCharges: 50,
  };

  describe('EBL (clear advance) — the exact reported transaction', () => {
    it('returns 200, not the "crCaTwd is not defined" 500', async () => {
      const res = await request(app).post('/api/export/settlement/calc').send(reportedEblTransaction);

      expect(res.status).toBe(200);
      expect(res.body.error).toBeUndefined();
    });

    it('summary omits crCaTwd/crCaAmt entirely — those only apply to the Direct-to-CA path (no Cr CA leg exists on an EBL settlement)', async () => {
      const res = await request(app).post('/api/export/settlement/calc').send(reportedEblTransaction);

      expect(res.body.summary).not.toHaveProperty('crCaTwd');
      expect(res.body.summary).not.toHaveProperty('crCaAmt');
    });

    it('books Dr Nostro (bill - FBC) / Dr CA (FBC pass-through) / Cr EBL at the original book rate, with no FX Gain/Loss when bill TWD exactly matches the EBL held amount', () => {
      // USD/TWD = 32.50 (data/fx-rates.json): billTwd = 200000 * 32.5 = 6,500,000 — exactly
      // eblHeldTwd, so diff = 0 and neither the FX Gain nor FX Loss leg should appear.
      return request(app)
        .post('/api/export/settlement/calc')
        .send(reportedEblTransaction)
        .then((res) => {
          expect(res.body.summary.billTwd).toBe(6500000);
          expect(res.body.summary.fxDiff).toBe(0);
          expect(res.body.entries.map((e) => e.accountType)).toEqual(['Nostro', 'CA', 'EBL']);

          const [nostro, ca, ebl] = res.body.entries;
          expect(nostro).toMatchObject({ leg: 'Dr', ccy: 'USD', amount: 199950, amountTwd: 6498375 });
          expect(ca).toMatchObject({ leg: 'Dr', ccy: 'USD', amount: 50, amountTwd: 1625 });
          expect(ebl).toMatchObject({ leg: 'Cr', ccy: 'USD', amount: 200000, amountTwd: 6500000 });
        });
    });
  });

  describe('Direct to CA — regression guard: crCaTwd/crCaAmt must still be present and correct (the `let`-hoisting fix must not change this path\'s values)', () => {
    it('summary includes crCaTwd/crCaAmt, net of the embedded FBC', async () => {
      const res = await request(app)
        .post('/api/export/settlement/calc')
        .send({ ...reportedEblTransaction, settlementType: 'direct', commRate: 0 });

      expect(res.status).toBe(200);
      // FBC (USD 50) embeds into Cr CA since chargeSelections.fbc defaults to billCurrency (USD),
      // same as effectiveBillPayCcy (USD) — so Cr CA = bill - FBC = 199950 (USD) / 6,498,375 (TWD).
      expect(res.body.summary.crCaAmt).toBe(199950);
      expect(res.body.summary.crCaTwd).toBe(6498375);
    });
  });
});
