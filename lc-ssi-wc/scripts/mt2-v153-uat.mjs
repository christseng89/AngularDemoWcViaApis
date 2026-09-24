import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const apiBase = process.env.SSI_BFF_URL ?? "http://localhost:3100/api";
const expectationPath = resolve(
  root,
  "qa/reports/latest/mt2/MT2XX_v15.3_migration_expected_20260912.json",
);
const outputPath = resolve(
  root,
  "qa/reports/latest/mt2/MT2XX_v15.3_api_UAT_20260912.json",
);
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex").toUpperCase();
const expectation = JSON.parse(await readFile(expectationPath, "utf8"));

const sourceMessageTypeOf = (caseKey) =>
  ["MT202COV", "MT205COV", "MT202", "MT205"].find((message) =>
    caseKey.endsWith(message),
  );

const requestFor = (sourceMessageType, counterpartyBic, currency, caseKey) => ({
  sourceMessageType,
  messageType: "pacs.009.001.08",
  currency,
  counterpartyBankServiceId: `BANK-SVC-${counterpartyBic}`,
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-12",
  amount: "1000000",
  messagingService: "FINPLUS",
  transactionReference: `V153-${caseKey}`,
  paymentBeneficiaryInstitutionInput: counterpartyBic,
  ...(sourceMessageType.endsWith("COV")
    ? {
        block3: { "119": "COV" },
        sequenceB: { "50A": "DEMOHKHH", "59": "BENEFICIARY" },
      }
    : {}),
});

const execute = async (request) => {
  const response = await fetch(`${apiBase}/settlements/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return { status: response.status, body: await response.json() };
};

const formalCases = [];
for (const expected of expectation.formalUat.cases) {
  const sourceMessageType = sourceMessageTypeOf(expected.caseKey);
  if (!sourceMessageType) throw new Error(`Unknown case key: ${expected.caseKey}`);
  const request = requestFor(
    sourceMessageType,
    expected.counterpartyBic,
    expected.currency,
    expected.caseKey,
  );
  const { status, body } = await execute(request);
  const chosen = body.chosenRoute ?? body.mx?.chosenRoute ?? {};
  const assertions = {
    httpStatus: status === 200,
    decision: body.mx?.code === expected.expectedDecision,
    chosenSsiCode: chosen.ssiCode === expected.expectedSsiCode,
    chosenSsiVersion: chosen.ssiVersion === expected.expectedSsiVersion,
    accountReference: chosen.accountId === expected.expectedAccountReference,
    currency: chosen.currency === expected.currency,
    routePurpose: chosen.routePurpose === expected.expectedRoutePurpose,
    selectedBy: chosen.selectedBy === expected.expectedSelectedBy,
    snapshotIdentity:
      body.snapshotHash?.toUpperCase() ===
        expectation.overlayLogicalSnapshotSha256 &&
      body.snapshotIdentityMethod === "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
  };
  formalCases.push({
    caseKey: expected.caseKey,
    request,
    actualStatus: status,
    actualDecision: body.mx?.code,
    actualChosenRoute: chosen,
    resolutionToken: body.resolutionToken,
    assertions,
    passed: Object.values(assertions).every(Boolean),
  });
}

const ambiguityCases = [];
const ambiguity = expectation.qaAmbiguityControls;
for (const sourceMessageType of ambiguity.journeys) {
  const caseKey = `QA-TIE-${sourceMessageType}`;
  const request = requestFor(
    sourceMessageType,
    ambiguity.counterpartyBic,
    ambiguity.currency,
    caseKey,
  );
  const { status, body } = await execute(request);
  const candidateCodes = (body.candidates ?? []).map(({ ssiCode }) => ssiCode).sort();
  const expectedCodes = ambiguity.expectedCandidates
    .map(({ ssiCode }) => ssiCode)
    .sort();
  const assertions = {
    httpStatus: status === ambiguity.expectedStatus,
    decision: body.mx?.code === ambiguity.expectedDecision,
    failClosed:
      body.chosenRoute === null &&
      body.canonicalRoles === null &&
      body.roleProvenance === null &&
      body.messageComposerContext === null &&
      body.payloadGenerated === false,
    candidates:
      JSON.stringify(candidateCodes) === JSON.stringify(expectedCodes),
    ambiguityReason:
      body.ambiguityReason === "TIED_ON_CONTROLLED_RANK_KEYS",
    snapshotIdentity:
      body.snapshotHash?.toUpperCase() ===
      expectation.overlayLogicalSnapshotSha256,
  };
  ambiguityCases.push({
    caseKey,
    request,
    actualStatus: status,
    actualDecision: body.mx?.code,
    candidates: body.candidates,
    assertions,
    passed: Object.values(assertions).every(Boolean),
  });
}

const totals = {
  formalPlanned: formalCases.length,
  formalPassed: formalCases.filter(({ passed }) => passed).length,
  ambiguityPlanned: ambiguityCases.length,
  ambiguityPassed: ambiguityCases.filter(({ passed }) => passed).length,
};
const report = {
  schemaVersion: "1.0",
  reportType: "V15.3_API_UAT",
  generatedAt: new Date().toISOString(),
  apiBase,
  expectationPath: "qa/reports/latest/mt2/MT2XX_v15.3_migration_expected_20260912.json",
  expectationSha256: sha256(await readFile(expectationPath)),
  logicalSnapshotSha256: expectation.overlayLogicalSnapshotSha256,
  totals,
  passed:
    totals.formalPassed === totals.formalPlanned &&
    totals.ambiguityPassed === totals.ambiguityPlanned,
  formalCases,
  ambiguityCases,
};
const bytes = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(outputPath, bytes);
await writeFile(`${outputPath}.sha256.txt`, `${sha256(bytes)}  ${outputPath}\n`);
console.log(JSON.stringify({ outputPath, ...totals, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
