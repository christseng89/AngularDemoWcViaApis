import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const apiBase = process.env.SSI_BFF_URL ?? "http://localhost:3100/api";
const registryPath = resolve(
  root,
  "qa/mt2/reports/evidence/v15.2/assertion-registry.json",
);
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const registered = new Map(
  registry.cases.map((entry) => [entry.caseId, entry]),
);
const sha256 = (raw) =>
  createHash("sha256").update(raw).digest("hex").toUpperCase();
const valueAt = (body, key) => body[key] ?? body.mx?.[key] ?? null;
const snapshotIdentityIsValid = (body) =>
  /^[0-9a-f]{64}$/i.test(valueAt(body, "snapshotHash") ?? "") &&
  valueAt(body, "snapshotIdentityMethod") ===
    "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1";

const commonRequest = (caseId, counterparty, currency) => ({
  correlationId: `${caseId}-${randomUUID()}`,
  sourceMessageType: "MT202",
  messageType: "pacs.009.001.08",
  currency,
  counterpartyBankServiceId: `BANK-SVC-${counterparty}`,
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-11",
  amount: "1000000",
  messagingService: "FINPLUS",
  transactionReference: caseId,
  paymentBeneficiaryInstitutionInput: counterparty,
});

const bookRequest = (caseId, debit, credit, currency, receiver) => ({
  correlationId: `${caseId}-${randomUUID()}`,
  sourceMessageType: "MT202",
  messageType: "pacs.009.001.08",
  currency,
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-11",
  amount: "1000000",
  transactionReference: caseId,
  scenarioCode: "BOOK_TRANSFER_SAME_RECEIVER",
  ownDebitAccountId: debit.id,
  ownDebitAccountVersion: debit.version,
  ownCreditAccountId: credit.id,
  ownCreditAccountVersion: credit.version,
  receiverBankServiceId: `BANK-SVC-${receiver}`,
});

const accounts = {
  citiPrimary: { id: "fe5d672f-311e-4eb9-88bf-f8538d45793c", version: 4 },
  citiExport: { id: "d28b0fc3-a0d8-4e16-a5e4-64325760b331", version: 4 },
  hkdHsbc: { id: "f976e74f-4f58-4efd-86b9-48921a3db5a0", version: 9 },
  usdHsbc: { id: "d4ee3d85-7ad4-4767-9046-33a050705a78", version: 4 },
};

const generic = [
  ["GEN-202-01", "CITIUS33", "USD", "SSI-DEMO-001", 44, "CITIUS33", false],
  ["GEN-202-02", "CHASUS33", "USD", "SSI-DEMO-021", 39, "CITIUS33", false],
  ["OMIT-57A-01", "BARCGB22", "USD", "SSI-DEMO-024", 19, "CITIUS33", true],
  ["OMIT-57A-02", "BNPAFRPP", "CNY", "SSI-DEMO-019", 44, "BKCHCNBJ", true],
  ["OMIT-57A-03", "BOFAUS3N", "AUD", "SSI-DEMO-013", 39, "CTBAAU2S", true],
  ["OMIT-57A-04", "CHASUS33", "CAD", "SSI-DEMO-015", 39, "ROYCCAT2", true],
  ["OMIT-57A-05", "CHASUS33", "USD", "SSI-DEMO-021", 39, "CITIUS33", true],
  ["OMIT-57A-06", "SCBLGB2L", "CHF", "SSI-DEMO-017", 39, "UBSWCHZH80A", true],
  ["PROV-00", "CITIUS33", "USD", "SSI-DEMO-001", 44, "CITIUS33", false],
  ["PROV-01", "BARCGB22", "USD", "SSI-DEMO-024", 19, "CITIUS33", false],
  ["PROV-02", "BNPAFRPP", "CNY", "SSI-DEMO-019", 44, "BKCHCNBJ", false],
  ["PROV-03", "BOFAUS3N", "AUD", "SSI-DEMO-013", 39, "CTBAAU2S", false],
  ["PROV-04", "CHASUS33", "CAD", "SSI-DEMO-015", 39, "ROYCCAT2", false],
  ["PROV-05", "CHASUS33", "USD", "SSI-DEMO-021", 39, "CITIUS33", false],
  ["PROV-06", "SCBLGB2L", "CHF", "SSI-DEMO-017", 39, "UBSWCHZH80A", false],
];

const planned = [
  {
    caseId: "BOOK-01",
    request: bookRequest(
      "BOOK-01",
      accounts.citiPrimary,
      accounts.citiExport,
      "USD",
      "CITIUS33",
    ),
    expectedStatus: 200,
    evaluate(body, status) {
      const mx = body.mx ?? {};
      const checks = [
        status === 200 &&
          mx.code === "RESOLVED" &&
          mx.resolutionDomain === "OWN_SSI_NOSTRO" &&
          body.mt?.renderingDecisions?.["57A"]?.outcome ===
            "OMITTED_BY_RULE" &&
          body.mt?.omitted?.includes("57A"),
        mx.counterpartySsiResolution === "SKIPPED" &&
          mx.chosenRoute === null &&
          Array.isArray(mx.candidates) &&
          mx.candidates.length === 0,
        body.mt?.tags?.["53B"] === "/DEMO-NOSTRO-001-PRIMARY" &&
          body.mt?.renderingDecisions?.["53B"]?.option === "B",
        body.mt?.tags?.["58A"] === "/DEMO-NOSTRO-001-EXPCOLL\nDEMOHKHH",
        mx.roleProvenance?.sender?.source === "OWN_ENTITY" &&
          mx.roleProvenance?.creditAccount?.source === "OWN_SSI_NOSTRO" &&
          mx.resolutionTrace?.counterpartySsiQueried === false,
        mx.messageComposerContext?.DbtrAcct?.value !==
          mx.messageComposerContext?.CdtrAcct?.value,
        mx.messageComposerContext?.DbtrAcct?.value ===
          body.mt?.tags?.["53B"]?.slice(1) &&
          mx.messageComposerContext?.SttlmAcct?.value ===
            mx.messageComposerContext?.DbtrAcct?.value &&
          mx.messageComposerContext?.CdtrAcct?.value ===
            body.mt?.tags?.["58A"]?.split("\n")[0]?.slice(1) &&
          snapshotIdentityIsValid(body),
      ];
      return checks;
    },
  },
  {
    caseId: "BOOK-02",
    request: bookRequest(
      "BOOK-02",
      accounts.hkdHsbc,
      accounts.usdHsbc,
      "HKD",
      "HSBCHKHH",
    ),
    expectedStatus: 422,
    evaluate: (body, status) => [
      status === 422 &&
        body.mx?.code === "OPTION_CONSTRAINT_VIOLATION" &&
        body.mx?.reasonCode === "OWN_ACCOUNT_CURRENCY_MISMATCH",
    ],
  },
  {
    caseId: "BOOK-03",
    request: bookRequest(
      "BOOK-03",
      accounts.citiPrimary,
      accounts.usdHsbc,
      "USD",
      "CITIUS33",
    ),
    expectedStatus: 422,
    evaluate: (body, status) => [
      status === 422 &&
        body.mx?.code === "OPTION_CONSTRAINT_VIOLATION" &&
        body.mx?.reasonCode === "OWN_ACCOUNT_RECEIVER_MISMATCH",
    ],
  },
  {
    caseId: "BOOK-04",
    request: bookRequest(
      "BOOK-04",
      accounts.citiPrimary,
      accounts.citiExport,
      "USD",
      "CITIUS33",
    ),
    expectedStatus: 200,
    evaluate: (body, status) => [
      status === 200 &&
        body.mx?.counterpartySsiResolution === "SKIPPED" &&
        body.mx?.resolutionTrace?.counterpartySsiQueried === false &&
        JSON.stringify(body).includes("SSI-DEMO-") === false,
    ],
  },
];

for (const [
  caseId,
  counterparty,
  currency,
  ssiCode,
  ssiVersion,
  agent,
  requireOmission,
] of generic) {
  planned.push({
    caseId,
    request: commonRequest(caseId, counterparty, currency),
    expectedStatus: 200,
    evaluate(body, status) {
      const mx = body.mx ?? {};
      const roles = mx.canonicalRoles ?? {};
      const provenance = mx.roleProvenance ?? {};
      const agentOk =
        status === 200 &&
        body.chosenRoute?.ssiCode === ssiCode &&
        body.chosenRoute?.ssiVersion === ssiVersion &&
        body.chosenRoute?.currency === currency &&
        roles.instructedAgent === agent &&
        roles.creditorAgent === agent &&
        provenance.instructedAgent?.sourceField === "actualReceiverBic" &&
        provenance.creditorAgent?.sourceField === "accountWithBic";
      const sourceOk =
        mx.messageComposerContext?.Cdtr?.value === counterparty &&
        mx.messageComposerContext?.Cdtr?.source === "REQUEST_PASS_THROUGH" &&
        snapshotIdentityIsValid(body);
      return requireOmission
        ? [
            agentOk &&
              body.mt?.omitted?.includes("57a") &&
              body.renderingDecisions?.["MT202.57a"]?.outcome ===
                "OMITTED_BY_RULE",
            sourceOk,
          ]
        : caseId.startsWith("PROV-") && caseId !== "PROV-00"
          ? [agentOk, sourceOk]
          : [agentOk && sourceOk];
    },
  });
}

async function execute(item) {
  const response = await fetch(`${apiBase}/settlements/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(item.request),
  });
  const body = await response.json();
  const entry = registered.get(item.caseId);
  if (!entry) throw new Error(`Unregistered case ${item.caseId}`);
  const checks = item.evaluate(body, response.status);
  if (checks.length !== entry.assertionIds.length)
    throw new Error(
      `${item.caseId}: ${checks.length} checks for ${entry.assertionIds.length} assertion IDs`,
    );
  const assertions = entry.assertionIds.map((id, index) => ({
    id,
    passed: Boolean(checks[index]),
    expected: { httpStatus: item.expectedStatus },
    actual: {
      httpStatus: response.status,
      code: body.mx?.code ?? body.code ?? null,
      reasonCode: body.mx?.reasonCode ?? null,
    },
  }));
  const runtimeSnapshotSha256 = valueAt(body, "snapshotHash");
  const runtimeSnapshotIdentityMethod = valueAt(body, "snapshotIdentityMethod");
  const evidence = {
    schemaVersion: "1.0",
    caseId: item.caseId,
    status: assertions.every(({ passed }) => passed) ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    execution: {
      correlationId:
        valueAt(body, "correlationId") || item.request.correlationId,
      tester: "Codex API Evidence Runner",
      executionDate: "2026-09-11",
    },
    source: {
      snapshotSha256: runtimeSnapshotSha256,
      snapshotIdentityMethod: runtimeSnapshotIdentityMethod,
      resolutionToken: valueAt(body, "resolutionToken"),
    },
    request: item.request,
    response: body,
    assertions,
  };
  const destination = resolve(root, entry.evidencePath);
  const raw = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const digest = sha256(raw);
  return {
    summary: {
      caseId: item.caseId,
      status: evidence.status,
      httpStatus: response.status,
      code: body.mx?.code ?? body.code ?? null,
      reasonCode: body.mx?.reasonCode ?? null,
      correlationId: evidence.execution.correlationId,
      resolutionToken: evidence.source.resolutionToken,
      snapshotSha256: runtimeSnapshotSha256,
      evidencePath: entry.evidencePath,
      evidenceSha256: digest,
    },
    destination,
    evidencePath: entry.evidencePath,
    raw,
    digest,
  };
}

async function browserBook05Evidence() {
  const caseId = "BOOK-05";
  const entry = registered.get(caseId);
  const browserReportReference = process.env.SSI_BROWSER_UAT_REPORT;
  if (!browserReportReference)
    throw new Error(
      "SSI_BROWSER_UAT_REPORT is required; archived browser PASS flags must not be reused",
    );
  const browserReportPath = resolve(root, browserReportReference);
  const browserReport = JSON.parse(await readFile(browserReportPath, "utf8"));
  const observed = browserReport.results.find((item) => item.caseId === caseId);
  if (!entry || !observed) throw new Error("BOOK-05 browser evidence is missing");
  const staleToken = valueAt(
    observed.stale?.before?.responseBody ?? {},
    "resolutionToken",
  );
  const second = observed.race?.secondCapture;
  const events = observed.race?.networkEvents ?? [];
  const eventA = events.find((event) => event.sequence === "A");
  const eventB = events.find((event) => event.sequence === "B");
  const staleSnapshot = valueAt(
    observed.stale?.before?.responseBody ?? {},
    "snapshotHash",
  );
  const eventSnapshot = (event) => valueAt(event?.responseBody ?? {}, "snapshotHash");
  const eventCorrelation = (event) => valueAt(event?.responseBody ?? {}, "correlationId");
  const checks = [
    observed.stale?.before?.responseStatus === 200 &&
      Boolean(staleToken) &&
      observed.stale?.afterText?.includes("尚未執行 Resolution") &&
      !observed.stale.afterText.includes(staleToken),
    Number(observed.race?.delayMs) >= 1000 &&
      events.length === 2 &&
      Boolean(eventA?.request?.correlationId) &&
      Boolean(eventB?.request?.correlationId) &&
      eventA.request.correlationId !== eventB.request.correlationId &&
      eventCorrelation(eventA) === eventA.request.correlationId &&
      eventCorrelation(eventB) === eventB.request.correlationId &&
      eventB.request.correlationId === second?.request?.correlationId &&
      Date.parse(eventB.browserFulfilledAt) < Date.parse(eventA.browserFulfilledAt) &&
      eventSnapshot(eventA) === staleSnapshot && eventSnapshot(eventB) === staleSnapshot &&
      observed.race?.domAfterB?.text === second?.uiText &&
      observed.race?.domAfterDelayedA?.text === observed.race?.domAfterB?.text &&
      Date.parse(observed.race?.domAfterDelayedA?.capturedAt) >=
        Date.parse(eventA.browserFulfilledAt),
  ];
  const assertions = entry.assertionIds.map((id, index) => ({
    id,
    passed: checks[index],
    expected: { staleResultCleared: true, delayedResponseIgnored: true },
    actual: {
      staleClearedFromRawDom: checks[0],
      raceRecomputedFromRawTimeline: checks[1],
      delayMs: observed.race?.delayMs ?? null,
      requestACorrelation: eventA?.request?.correlationId ?? null,
      requestBCorrelation: eventB?.request?.correlationId ?? null,
      snapshotA: eventSnapshot(eventA),
      snapshotB: eventSnapshot(eventB),
    },
  }));
  const before = observed.stale.before;
  const evidence = {
    schemaVersion: "1.0",
    caseId,
    status: assertions.every(({ passed }) => passed) ? "PASS" : "FAIL",
    generatedAt: browserReport.generatedAt,
    execution: {
      correlationId: before.request.correlationId,
      tester: "Codex Playwright Chromium UAT",
      executionDate: "2026-09-11",
    },
    source: {
      snapshotSha256: before.responseBody.mx.snapshotHash,
      snapshotIdentityMethod: before.responseBody.mx.snapshotIdentityMethod,
      resolutionToken: before.responseBody.mx.resolutionToken,
    },
    request: {
      stale: observed.stale.before.request,
      raceA: eventA.request,
      raceB: eventB.request,
    },
    response: observed,
    assertions,
  };
  const destination = resolve(root, entry.evidencePath);
  const raw = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const digest = sha256(raw);
  return {
    summary: {
      caseId,
      status: evidence.status,
      httpStatus: "N/A (UI-only)",
      code: "N/A (UI-only)",
      reasonCode: null,
      correlationId: evidence.execution.correlationId,
      resolutionToken: evidence.source.resolutionToken,
      snapshotSha256: evidence.source.snapshotSha256,
      evidencePath: entry.evidencePath,
      evidenceSha256: digest,
    },
    destination,
    evidencePath: entry.evidencePath,
    raw,
    digest,
  };
}

async function explicit57AControl() {
  const request = {
    correlationId: `OPEN-006-${randomUUID()}`,
    sourceMessageType: "MT202",
    messageType: "pacs.009.001.08",
    currency: "USD",
    consumer: "CENTRAL_PAYMENT",
    product: "CENTRAL_PAYMENT",
    businessFunction: "INTERBANK_TRANSFER",
    paymentLeg: "INTERBANK_SETTLEMENT",
    direction: "OUTBOUND",
    bookingEntity: "HK01",
    valueDate: "2026-09-11",
    amount: "1000000",
    transactionReference: "OPEN-006-EXPLICIT-57A",
    scenarioCode: "CREDIT_ONE_OF_SEVERAL_AT_57A",
    ownCreditAccountId: "570a0000-0000-4000-8000-000000000001",
    ownCreditAccountVersion: 1,
    receiverBankServiceId: "BANK-SVC-CITIUS33",
  };
  const response = await fetch(`${apiBase}/settlements/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await response.json();
  const passed =
    response.status === 200 &&
    body.mx?.code === "RESOLVED" &&
    body.mx?.resolutionDomain === "OWN_SSI_NOSTRO" &&
    body.mx?.counterpartySsiResolution === "SKIPPED" &&
    body.mx?.resolutionTrace?.counterpartySsiQueried === false &&
    body.mt?.tags?.["57A"] === "BARCGB22" &&
    body.mt?.tags?.["58A"] === "/QA-OWN-57A-USD-PRIMARY\nDEMOHKHH" &&
    snapshotIdentityIsValid(body);
  return {
    controlId: "OPEN-006-EXPLICIT-57A",
    status: passed ? "PASS" : "FAIL",
    httpStatus: response.status,
    correlationId: valueAt(body, "correlationId") ?? request.correlationId,
    request,
    response: body,
  };
}

// Fetch every response before writing evidence. Nx watch mode observes repository
// writes and may restart the API, so interleaving writes with HTTP calls would
// make otherwise valid UAT cases fail with ECONNRESET.
const executions = [];
for (const item of planned) executions.push(await execute(item));
executions.push(await browserBook05Evidence());
const controls = [await explicit57AControl()];
for (const execution of executions) {
  await mkdir(dirname(execution.destination), { recursive: true });
  const temporary = `${execution.destination}.${process.pid}.tmp`;
  await writeFile(temporary, execution.raw);
  await rename(temporary, execution.destination);
  execFileSync("python", [
    resolve(root, "tools/qa-conformance/conformance.py"),
    "--verify-evidence",
    execution.summary.caseId,
    execution.evidencePath,
    execution.digest,
  ]);
  execFileSync(process.execPath, [
    resolve(root, "scripts/mt2-v152-evidence-verifier.mjs"),
    execution.summary.caseId,
    execution.evidencePath,
    execution.digest,
  ]);
}
const results = executions.map(({ summary }) => summary);
const report = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  snapshotSha256: [...new Set(results.map(({ snapshotSha256 }) => snapshotSha256))],
  planned: results.length,
  passed: results.filter(({ status }) => status === "PASS").length,
  failed: results.filter(({ status }) => status === "FAIL").length,
  results,
  controls,
};
const reportPath = resolve(
  root,
  "qa/mt2/reports/MT2XX_v15.2_api_evidence_20260911.json",
);
const reportRaw = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(reportPath, reportRaw);
await writeFile(
  `${reportPath}.sha256.txt`,
  `${sha256(reportRaw)}  ${reportPath.split(/[\\/]/).pop()}\n`,
);
console.log(
  JSON.stringify(
    { reportPath, reportSha256: sha256(reportRaw), ...report },
    null,
    2,
  ),
);
if (report.failed || controls.some(({ status }) => status === "FAIL"))
  process.exitCode = 1;
