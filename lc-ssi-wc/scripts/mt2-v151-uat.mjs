import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const apiBase = process.env.SSI_BFF_URL ?? 'http://localhost:3100/api';
const allowListPath = resolve(root, 'parameters', 'cov-profile-allow-list.v15.1.json');
const snapshotPath = resolve(
  root,
  'qa',
  'mt2-final',
  'fixtures',
  'baselines',
  'ssi-demo.v15.1-post-migration.sqlite',
);
const reportPath = resolve(
  root,
  'qa',
  'reports',
  'MT2XX_v15.1_post_migration_tie_scan_20260911.json',
);
const sha256 = (value) => createHash('sha256').update(value).digest('hex').toUpperCase();
const profile = JSON.parse(await readFile(allowListPath, 'utf8'));
const snapshotSha256 = sha256(await readFile(snapshotPath));
const messages = ['MT202', 'MT205', 'MT202COV', 'MT205COV'];
const results = [];

for (const [pairIndex, pair] of profile.pairs.entries()) {
  for (const sourceMessageType of messages) {
    const transactionReference = `V151-${pairIndex + 1}-${sourceMessageType}-${pair.currency}`;
    const request = {
      sourceMessageType,
      messageType: profile.messageDefinitionId,
      currency: pair.currency,
      counterpartyBankServiceId: `BANK-SVC-${pair.counterpartyBic}`,
      consumer: 'CENTRAL_PAYMENT',
      product: 'CENTRAL_PAYMENT',
      businessFunction: 'INTERBANK_TRANSFER',
      paymentLeg: 'INTERBANK_SETTLEMENT',
      direction: 'OUTBOUND',
      bookingEntity: pair.bookingEntity,
      valueDate: '2026-09-11',
      amount: '1000000',
      messagingService: 'FINPLUS',
      transactionReference,
      paymentBeneficiaryInstitutionInput: pair.counterpartyBic,
      ...(sourceMessageType.endsWith('COV')
        ? {
            block3: { '119': 'COV' },
            sequenceB: { '50A': 'DEMOHKHH', '59': 'BENEFICIARY' },
          }
        : {}),
    };
    const response = await fetch(`${apiBase}/settlements/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = await response.json();
    const mx = body.mx ?? {};
    const expectedAmbiguous = pair.counterpartyBic === 'BARCGB22' && pair.currency === 'GBP';
    const expectedStatus = expectedAmbiguous ? 422 : 200;
    const expectedCode = expectedAmbiguous ? 'SSI_AMBIGUOUS' : 'SSI_RESOLVED';
    const assertions = {
      httpStatus: response.status === expectedStatus,
      decision: mx.code === expectedCode,
      currency:
        expectedAmbiguous || body.chosenRoute?.currency === pair.currency,
      failClosedShape:
        !expectedAmbiguous ||
        (body.chosenRoute === null &&
          body.canonicalRoles === null &&
          body.roleProvenance === null &&
          body.messageComposerContext === null &&
          body.payloadGenerated === false),
      noCoreFallback:
        !sourceMessageType.endsWith('COV') || mx.code !== 'PROFILE_INCOMPLETE',
    };
    results.push({
      pair: pairIndex + 1,
      counterpartyBic: pair.counterpartyBic,
      currency: pair.currency,
      bookingEntity: pair.bookingEntity,
      sourceMessageType,
      expectedStatus,
      expectedCode,
      actualStatus: response.status,
      actualCode: mx.code,
      chosenSsiCode: body.chosenRoute?.ssiCode ?? null,
      candidateSsiCodes: (body.candidates ?? []).map(({ ssiCode }) => ssiCode),
      assertions,
      passed: Object.values(assertions).every(Boolean),
    });
  }
}

const excludedCovResponse = await fetch(`${apiBase}/settlements/resolve`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sourceMessageType: 'MT202COV',
    messageType: profile.messageDefinitionId,
    currency: 'USD',
    counterpartyBankServiceId: 'BANK-SVC-NSSIUSN1',
    consumer: 'CENTRAL_PAYMENT',
    product: 'CENTRAL_PAYMENT',
    businessFunction: 'INTERBANK_TRANSFER',
    paymentLeg: 'INTERBANK_SETTLEMENT',
    direction: 'OUTBOUND',
    bookingEntity: 'HK01',
    valueDate: '2026-09-11',
    amount: '1000000',
    messagingService: 'FINPLUS',
    transactionReference: 'V151-NEGATIVE-NO-COV-FALLBACK',
    paymentBeneficiaryInstitutionInput: 'NSSIUSN1',
    block3: { '119': 'COV' },
    sequenceB: { '50A': 'DEMOHKHH', '59': 'BENEFICIARY' },
  }),
});
const excludedCovBody = await excludedCovResponse.json();
const negativeControls = [
  {
    control: 'CONF-COV-02-NO-CORE-FALLBACK',
    counterpartyBic: 'NSSIUSN1',
    sourceMessageType: 'MT202COV',
    actualStatus: excludedCovResponse.status,
    actualCode: excludedCovBody.mx?.code,
    payloadGenerated: excludedCovBody.mx?.payloadGenerated,
    passed:
      excludedCovResponse.status === 503 &&
      excludedCovBody.mx?.code === 'PROFILE_INCOMPLETE' &&
      excludedCovBody.mx?.payloadGenerated === false,
  },
];

const totals = {
  planned: results.length,
  passed: results.filter(({ passed }) => passed).length,
  resolved: results.filter(({ actualCode }) => actualCode === 'SSI_RESOLVED').length,
  ambiguous: results.filter(({ actualCode }) => actualCode === 'SSI_AMBIGUOUS').length,
  profileIncomplete: results.filter(({ actualCode }) => actualCode === 'PROFILE_INCOMPLETE').length,
};
const tieGroups = profile.pairs
  .filter((pair) => pair.counterpartyBic === 'BARCGB22' && pair.currency === 'GBP')
  .map((pair) => ({
    counterpartyBic: pair.counterpartyBic,
    currency: pair.currency,
    bookingEntity: pair.bookingEntity,
    topRankTieSsiCodes: ['SSI-DEMO-003', 'SSI-DEMO-022'],
    lowerRankedEligibleSsiCodes: ['SSI-DEMO-004'],
    affectedMessages: messages,
  }));
const report = {
  reportVersion: '15.1',
  generatedAt: new Date().toISOString(),
  apiBase,
  snapshotPath: 'qa/fixtures/mt2/baselines/ssi-demo.v15.1-post-migration.sqlite',
  snapshotSha256,
  groupingKeys: [
    'counterpartyBic',
    'currency',
    'bookingEntity',
    'consumer',
    'product',
    'businessFunction',
    'paymentLeg',
    'direction',
    'messageType',
    'businessService',
    'sourceMessageType',
  ],
  controlledRankKeys: ['priority', 'routePreference', 'specificity'],
  totals,
  tieGroups,
  negativeControls,
  estimateVariance: {
    expected: { resolved: 44, ambiguous: 4, profileIncomplete: 0 },
    actual: {
      resolved: totals.resolved,
      ambiguous: totals.ambiguous,
      profileIncomplete: totals.profileIncomplete,
    },
    differences: [],
  },
  results,
};

if (totals.passed !== totals.planned)
  throw new Error(`v15.1 UAT failed ${totals.planned - totals.passed}/${totals.planned} cases`);
if (totals.resolved !== 44 || totals.ambiguous !== 4 || totals.profileIncomplete !== 0)
  throw new Error(`Unexpected post-DG ledger: ${JSON.stringify(totals)}`);
if (!negativeControls.every(({ passed }) => passed))
  throw new Error(`Negative COV controls failed: ${JSON.stringify(negativeControls)}`);

await mkdir(resolve(root, 'qa', 'mt2', 'reports'), { recursive: true });
const reportText = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(reportPath, reportText, 'utf8');
await writeFile(`${reportPath}.sha256.txt`, `${sha256(Buffer.from(reportText))}  ${reportPath.split(/[\\/]/).pop()}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, reportSha256: sha256(Buffer.from(reportText)), ...totals }, null, 2));
