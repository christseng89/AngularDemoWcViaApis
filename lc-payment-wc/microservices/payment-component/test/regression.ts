/**
 * Regression test against the 6 FSD-verified scenarios (FSD §2.3.2, §2.3.3,
 * §6.5), mirroring §13 of Payment_Component_Calculation_Validation.docx —
 * every input number here is copied verbatim from the FSD/Calculation docs,
 * not independently assumed. Run with `npm run test:regression`.
 *
 * Also runs one real end-to-end HTTP round trip against the actual Express
 * app (not just the domain functions in isolation) to confirm the wiring in
 * app.ts/routes/paymentInstructions.ts works, not only the pure logic.
 */
import Decimal from 'decimal.js';
import type { PaymentLegInput } from '../src/types';
import { classify } from '../src/domain/classification';
import { validateDrCrBalance } from '../src/domain/balanceValidation';
import { accountDescFor, VOUCHER_CODE_PREFIXES } from '../src/domain/voucherDescription';
import { createApp } from '../src/app';

let failures = 0;
let passes = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passes += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function leg(accountType: PaymentLegInput['accountType'], amountTxCcy = '100'): PaymentLegInput {
  return { accountNo: 'ACC', accountType, currency: 'EUR', amountTxCcy };
}

// ---------------------------------------------------------------------------
// §13.1 — Classification formula, 6/6 FSD-verified scenarios
// ---------------------------------------------------------------------------

interface ClassificationScenario {
  id: number;
  label: string;
  debit: PaymentLegInput['accountType'][];
  credit: PaymentLegInput['accountType'][];
  expected: boolean;
}

const scenarios: ClassificationScenario[] = [
  { id: 1, label: 'IPLC_PayAcceptWithDiscount, DISCNT_FLG=YES, STL_FLG=By Loan', debit: ['INTERNAL'], credit: ['INTERNAL'], expected: false },
  { id: 2, label: 'IPLC_PayAcceptWithDiscount, DISCNT_FLG=YES, STL_FLG≠By Loan', debit: ['CUSTOMER'], credit: ['INTERNAL'], expected: true },
  { id: 3, label: 'IPLC_PaymentAtMaturity, STL_FLG≠By Loan (default)', debit: ['CUSTOMER'], credit: ['CUSTOMER'], expected: false },
  { id: 4, label: 'EXCO_Payment, Cr default CUSTOMER; Dr selected NOSTRO', debit: ['NOSTRO'], credit: ['CUSTOMER'], expected: true },
  { id: 5, label: 'FSD §2.3.2 — reimbursement fee, beneficiary bears', debit: ['NOSTRO'], credit: ['VOSTRO'], expected: true },
  { id: 6, label: 'FSD §2.3.3 — reimbursement fee, applicant bears (multi-leg)', debit: ['CUSTOMER'], credit: ['VOSTRO', 'NOSTRO'], expected: true },
];

console.log('§13.1 Classification formula — 6 FSD-verified scenarios');
for (const s of scenarios) {
  const result = classify('test-instr', s.debit.map((t) => leg(t)), s.credit.map((t) => leg(t)));
  check(
    `scenario ${s.id}: ${s.label} -> paymentComponentRelated=${result.paymentComponentRelated}`,
    result.paymentComponentRelated === s.expected,
    `expected ${s.expected}, got ${result.paymentComponentRelated}`,
  );
}

// ---------------------------------------------------------------------------
// §13.2 — Balance validation (V8) against scenario 6's real amounts:
// FSD text: "借方(800,020)與貸方(800,000 + 20)配平"
// ---------------------------------------------------------------------------

console.log('\n§13.2 Balance validation (V8) — scenario 6 real amounts');
{
  const debitLegs: PaymentLegInput[] = [leg('CUSTOMER', '800020')];
  const creditLegs: PaymentLegInput[] = [leg('VOSTRO', '800000'), leg('NOSTRO', '20')];
  try {
    const result = validateDrCrBalance(debitLegs, creditLegs);
    check(
      'debit total 800020 == credit total 800020 (V8 exact equality)',
      result.debitTotal.equals(new Decimal('800020')) && result.creditTotal.equals(new Decimal('800020')) && result.difference.isZero(),
      `debitTotal=${result.debitTotal.toFixed()} creditTotal=${result.creditTotal.toFixed()}`,
    );
  } catch (err) {
    check('scenario 6 balance validation should not throw', false, String(err));
  }

  // Negative check: an unbalanced pair (one cent off) must be rejected.
  try {
    validateDrCrBalance([leg('CUSTOMER', '800020')], [leg('VOSTRO', '800000'), leg('NOSTRO', '19.99')]);
    check('unbalanced legs (800020 vs 800019.99) must throw BusinessValidationError', false, 'did not throw');
  } catch {
    check('unbalanced legs (800020 vs 800019.99) must throw BusinessValidationError', true);
  }
}

// ---------------------------------------------------------------------------
// §13.3 — Voucher description formula applied to scenarios 2 and 4
// ---------------------------------------------------------------------------

console.log('\n§13.3 Voucher description formula — scenarios 2 and 4');
{
  const prefix2 = VOUCHER_CODE_PREFIXES['IPLC:PayAcceptWithDiscount'];
  check('scenario 2 Dr accountDesc == IPLC03NULLNULLNULLC', accountDescFor('CUSTOMER', prefix2!) === 'IPLC03NULLNULLNULLC');
  check('scenario 2 Cr accountDesc == IPLC03NULLNULLNULLI', accountDescFor('INTERNAL', prefix2!) === 'IPLC03NULLNULLNULLI');

  const prefix4 = VOUCHER_CODE_PREFIXES['EXCO:Payment'];
  check('scenario 4 Dr accountDesc == EXCO01NULLNULLNULLN', accountDescFor('NOSTRO', prefix4!) === 'EXCO01NULLNULLNULLN');
  check('scenario 4 Cr accountDesc == EXCO01NULLNULLNULLC', accountDescFor('CUSTOMER', prefix4!) === 'EXCO01NULLNULLNULLC');
}

// ---------------------------------------------------------------------------
// End-to-end HTTP smoke test — real Express app, real POST, over the wire.
// ---------------------------------------------------------------------------

async function runHttpSmokeTest(): Promise<void> {
  console.log('\nEnd-to-end HTTP smoke test — POST /payment-component/v1/payment-instructions');
  const app = createApp();
  const server = app.listen(0);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('failed to bind test server');
  }
  const baseUrl = `http://127.0.0.1:${address.port}/payment-component/v1`;

  try {
    // EXCO Payment (scenario 4 shape): Dr NOSTRO / Cr CUSTOMER, balanced 100/100.
    const requestBody = {
      originModule: 'EXCO',
      mainRef: 'EXCO-TEST-0001',
      sequence: 1,
      unitCode: 'HQ',
      debitLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'EUR', amountTxCcy: '100.00' }],
      creditLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '100.00' }],
      sourceFunctionCode: 'Payment',
    };

    const createRes = await fetch(`${baseUrl}/payment-instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const created = (await createRes.json()) as { instructionId: string; classification: { paymentComponentRelated: boolean } };
    check('POST returns 201 for a new natural key', createRes.status === 201, `got ${createRes.status}`);
    check('response classification.paymentComponentRelated == true', created.classification?.paymentComponentRelated === true);
    check('response debitLegs[0].accountDesc == EXCO01NULLNULLNULLN', (created as any).debitLegs?.[0]?.accountDesc === 'EXCO01NULLNULLNULLN');

    // Resubmit the same natural key — must be idempotent (200, not 201).
    const replayRes = await fetch(`${baseUrl}/payment-instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const replayed = (await replayRes.json()) as { instructionId: string };
    check('resubmitting the same natural key returns 200 (idempotent replay)', replayRes.status === 200, `got ${replayRes.status}`);
    check('replay returns the same instructionId', replayed.instructionId === created.instructionId);

    // GET by id round-trips the same data.
    const getRes = await fetch(`${baseUrl}/payment-instructions/${created.instructionId}`);
    check('GET /payment-instructions/:id returns 200', getRes.status === 200, `got ${getRes.status}`);

    // Unbalanced request must be rejected with 409.
    const badRes = await fetch(`${baseUrl}/payment-instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...requestBody,
        mainRef: 'EXCO-TEST-0002',
        creditLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '99.00' }],
      }),
    });
    check('unbalanced legs over HTTP return 409', badRes.status === 409, `got ${badRes.status}`);

    // Malformed request (missing required field) must be rejected with 400.
    const malformedRes = await fetch(`${baseUrl}/payment-instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originModule: 'EXCO' }),
    });
    check('malformed request over HTTP returns 400', malformedRes.status === 400, `got ${malformedRes.status}`);

    // ---------------------------------------------------------------------
    // dryRun — Business Case Simulator's live-preview mode. Same natural key,
    // different amounts, must NOT be idempotent-cached: each dryRun call
    // recomputes fresh, and none of them get persisted (a real POST with the
    // same key afterwards still returns 201, proving dryRun never touched the store).
    // ---------------------------------------------------------------------
    const dryRunBody = {
      originModule: 'EXCO',
      mainRef: 'EXCO-DRYRUN-0001',
      sequence: 1,
      unitCode: 'HQ',
      debitLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'EUR', amountTxCcy: '100.00' }],
      creditLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '100.00' }],
      sourceFunctionCode: 'Payment',
      dryRun: true,
    };
    const dryRun1Res = await fetch(`${baseUrl}/payment-instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dryRunBody),
    });
    const dryRun1 = (await dryRun1Res.json()) as { instructionId: string; debitLegs: { amountTxCcy: string }[] };
    check('dryRun POST returns 200 (never 201)', dryRun1Res.status === 200, `got ${dryRun1Res.status}`);

    const dryRun2Res = await fetch(`${baseUrl}/payment-instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...dryRunBody,
        debitLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'EUR', amountTxCcy: '250.00' }],
        creditLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '250.00' }],
      }),
    });
    const dryRun2 = (await dryRun2Res.json()) as { instructionId: string; debitLegs: { amountTxCcy: string }[] };
    check(
      'second dryRun (same natural key, different amount) is NOT cached — recomputes fresh',
      dryRun2.debitLegs[0]?.amountTxCcy === '250.00' && dryRun1.debitLegs[0]?.amountTxCcy === '100.00',
      `dryRun1=${dryRun1.debitLegs[0]?.amountTxCcy} dryRun2=${dryRun2.debitLegs[0]?.amountTxCcy}`,
    );
    check('dryRun calls get distinct instructionIds (never persisted/reused)', dryRun1.instructionId !== dryRun2.instructionId);

    const realAfterDryRunRes = await fetch(`${baseUrl}/payment-instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dryRunBody, dryRun: false }),
    });
    check(
      'a real (non-dryRun) POST with the same natural key after N dryRuns still returns 201 (dryRun never touched the store)',
      realAfterDryRunRes.status === 201,
      `got ${realAfterDryRunRes.status}`,
    );

    // ---------------------------------------------------------------------
    // /payment-instructions/classify — RPFM GAP-case preview. RTGS is
    // represented as accountType=NOSTRO + rtgsIndicator=true (v1.3.0 — see
    // types.ts AccountType doc comment), not a distinct AccountType value.
    // Balance is intentionally left unbalanced here to confirm the endpoint
    // never throws on imbalance.
    // ---------------------------------------------------------------------
    const classifyRes = await fetch(`${baseUrl}/payment-instructions/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debitLegs: [{ accountNo: 'RTGS-ACC', accountType: 'NOSTRO', rtgsIndicator: true, currency: 'IDR', amountTxCcy: '500000' }],
        creditLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'IDR', amountTxCcy: '499000' }],
      }),
    });
    const classified = (await classifyRes.json()) as {
      classification: { paymentComponentRelated: boolean; nostroXor: boolean; customerXor: boolean };
      balance: { balanced: boolean; difference: string };
      accountEntries: { voucherType: string; drCrIndicator: string; glAccount: string; amount: string; description: string }[];
    };
    check('classify endpoint returns 200 even when unbalanced', classifyRes.status === 200, `got ${classifyRes.status}`);
    check(
      'classify: RTGS(=NOSTRO+flag) debit vs CUSTOMER credit -> paymentComponentRelated=true (customerXor AND nostroXor both fire)',
      classified.classification?.paymentComponentRelated === true &&
        classified.classification?.customerXor === true &&
        classified.classification?.nostroXor === true,
    );
    check('classify: reports balanced=false with correct difference', classified.balance?.balanced === false && classified.balance?.difference === '1000');
    check(
      'classify: returns SETTLEMENT accountEntries for both legs (one Dr, one Cr), without fabricating a voucher prefix',
      classified.accountEntries?.length === 2 &&
        classified.accountEntries.every((e) => e.voucherType === 'SETTLEMENT') &&
        classified.accountEntries.some((e) => e.drCrIndicator === 'D' && e.glAccount === 'RTGS-ACC' && e.amount === '500000') &&
        classified.accountEntries.some((e) => e.drCrIndicator === 'C' && e.glAccount === 'CUST-ACC' && e.amount === '499000') &&
        classified.accountEntries.every((e) => e.description.includes('no Payment Component voucher code prefix')),
    );

    // rtgsIndicator must fold into the SAME nostroXor term as plain NOSTRO — a
    // Dr NOSTRO(rtgs) vs Cr NOSTRO(plain) pairing is "both sides have Nostro",
    // so nostroXor must be false, exactly as a plain Dr NOSTRO / Cr NOSTRO
    // pairing would be. Proves the flag doesn't accidentally create a second,
    // independent classification bucket (the mistake Rev 2 already fixed once
    // for VOSTRO — see ClassificationResult description).
    const classifyRtgsVsNostroRes = await fetch(`${baseUrl}/payment-instructions/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debitLegs: [{ accountNo: 'RTGS-ACC', accountType: 'NOSTRO', rtgsIndicator: true, currency: 'IDR', amountTxCcy: '500000' }],
        creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'IDR', amountTxCcy: '500000' }],
      }),
    });
    const classifiedRtgsVsNostro = (await classifyRtgsVsNostroRes.json()) as {
      classification: { paymentComponentRelated: boolean; nostroXor: boolean };
    };
    check(
      'classify: RTGS(=NOSTRO+flag) debit vs plain NOSTRO credit -> nostroXor=false, paymentComponentRelated=false (both sides are Nostro-family)',
      classifiedRtgsVsNostro.classification?.nostroXor === false && classifiedRtgsVsNostro.classification?.paymentComponentRelated === false,
    );
  } finally {
    // Wait for the server to actually finish closing before returning —
    // calling process.exit() while its async handles are still tearing down
    // crashes libuv on Windows (UV_HANDLE_CLOSING assertion).
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

runHttpSmokeTest()
  .catch((err) => {
    failures += 1;
    console.error('HTTP smoke test crashed:', err);
  })
  .finally(() => {
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exitCode = failures > 0 ? 1 : 0;
  });
