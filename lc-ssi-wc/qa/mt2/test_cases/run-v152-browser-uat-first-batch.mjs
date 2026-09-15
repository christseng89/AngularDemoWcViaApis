/* global process, setTimeout, console */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const portalUrl = process.env.PORTAL_URL ?? "http://localhost:4600/";
const uatApiBase = process.env.UAT_API_BASE ?? "http://localhost:3100/api";
const dataVersion = process.env.UAT_DATA_VERSION ?? "v15.2";
const v153 = dataVersion === "v15.3";
const chrome = process.env.PLAYWRIGHT_BROWSER_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const output = path.resolve(root, process.env.UAT_REPORT_PATH ??
  "qa/mt2/reports/MT2XX_v15.2_browser_UAT_rerun_20260911.json");

const BOOK = {
  debitCiti: "fe5d672f-311e-4eb9-88bf-f8538d45793c",
  creditCiti: "d28b0fc3-a0d8-4e16-a5e4-64325760b331",
  debitHkd: "f976e74f-4f58-4efd-86b9-48921a3db5a0",
  creditHsbcUsd: "d4ee3d85-7ad4-4767-9046-33a050705a78",
};

const VIA_CASES = [
  { suffix: "01", bic: "BARCGB22", currency: "USD", chosen: "SSI-DEMO-024", version: 19, agent: "CITIUS33", sttlmAcct: "DEMO-NOSTRO-USD-IMPCOLL-BARC-PRIMARY" },
  { suffix: "02", bic: "BNPAFRPP", currency: "CNY", chosen: "SSI-DEMO-019", version: 44, agent: "BKCHCNBJ", sttlmAcct: "DEMO-NOSTRO-010-PRIMARY-PRIMARY" },
  { suffix: "03", bic: "BOFAUS3N", currency: "AUD", chosen: "SSI-DEMO-013", version: 39, agent: "CTBAAU2S", sttlmAcct: "DEMO-NOSTRO-007-PRIMARY-PRIMARY" },
  { suffix: "04", bic: "CHASUS33", currency: "CAD", chosen: "SSI-DEMO-015", version: 39, agent: "ROYCCAT2", sttlmAcct: "DEMO-NOSTRO-008-PRIMARY-PRIMARY" },
  { suffix: "05", bic: "CHASUS33", currency: "USD", chosen: "SSI-DEMO-021", version: 39, agent: "CITIUS33", sttlmAcct: "DEMO-NOSTRO-001-EXPCOLL-PRIMARY" },
  { suffix: "06", bic: "SCBLGB2L", currency: "CHF", chosen: "SSI-DEMO-017", version: 39, agent: "UBSWCHZH80A", sttlmAcct: "DEMO-NOSTRO-009-PRIMARY-PRIMARY" },
].map((item, index) => ({
  ...item,
  ...(v153
    ? {
        chosen: `SSI-UAT-GEN-${String([3, 12, 8, 9, 10, 11][index]).padStart(2, "0")}`,
        version: 1,
        ...(index === 0 || index === 4
          ? { sttlmAcct: "DEMO-NOSTRO-001-PRIMARY-PRIMARY" }
          : {}),
      }
    : {}),
}));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function contractFields(body) {
  const mx = body?.mx ?? body ?? {};
  const roles = mx?.canonicalRoles ?? null;
  const composer = mx?.messageComposerContext ?? null;
  return {
    httpStatus: mx?.httpStatus ?? null,
    decision: body?.resolutionDecision ?? mx?.decision ?? null,
    code: body?.code ?? mx?.code ?? null,
    reasonCode: mx?.reasonCode ?? body?.reasonCode ?? null,
    resolutionDomain: mx?.resolutionDomain ?? null,
    counterpartySsiResolution: mx?.counterpartySsiResolution ?? null,
    chosenRoute: body?.chosenRoute ?? mx?.chosenRoute ?? null,
    candidates: mx?.candidates ?? body?.candidates ?? [],
    roles,
    roleProvenance: body?.roleProvenance ?? mx?.roleProvenance ?? null,
    messageComposerContext: composer,
    renderingDecisions: body?.renderingDecisions ?? body?.mt?.renderingDecisions ?? null,
    snapshotHash: body?.snapshotHash ?? mx?.snapshotHash ?? null,
    snapshotIdentityMethod:
      body?.snapshotIdentityMethod ?? mx?.snapshotIdentityMethod ?? null,
    resolutionToken: body?.resolutionToken ?? mx?.resolutionToken ?? null,
    payloadGenerated: mx?.payloadGenerated ?? body?.payloadGenerated ?? null,
    cdtr: composer?.Cdtr ?? null,
  };
}

async function enterResolution(page) {
  await page.goto(portalUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Payment SSI Resolution", exact: true }).click();
}

async function resetToIndex(page) {
  const back = page.getByRole("button", { name: "← Back to Payment Message Index", exact: true });
  if (await back.count()) await back.click();
}

async function openBookScenario(page) {
  await resetToIndex(page);
  await page.getByRole("link", { name: "Select scenario BOOK_TRANSFER_SAME_RECEIVER", exact: true }).press("Enter");
  await page.getByLabel("Own debit account").waitFor({ state: "visible" });
}

async function openGeneric(page) {
  await resetToIndex(page);
  await page.getByRole("link", { name: "Select MT202", exact: true }).click();
}

async function setCommon(page, currency, reference) {
  await page.getByLabel("Currency (ISO 4217)").selectOption(currency);
  await page.getByLabel("Booking Branch / Entity（本行）").selectOption("HK01");
  await page.getByLabel("Transaction Reference").fill(reference);
}

async function resolveAndCapture(page) {
  const pending = page.waitForResponse((response) =>
    response.url().endsWith("/settlements/resolve") && response.request().method() === "POST");
  await page.getByRole("button", { name: "2. Preview Resolution", exact: true }).click();
  const response = await pending;
  let body = null;
  try { body = await response.json(); } catch { body = { unparsedText: await response.text() }; }
  await page.locator("article.result-panel").waitFor({ state: "visible" });
  await page.waitForTimeout(100);
  const headers = await response.allHeaders();
  return {
    request: response.request().postDataJSON(),
    responseStatus: response.status(),
    responseHeaders: Object.fromEntries(Object.entries(headers).filter(([key]) =>
      /correlation|request[-_]id|trace/i.test(key))),
    responseBody: body,
    observed: contractFields(body),
    uiText: await page.locator("article.result-panel").innerText(),
    renderedOutput: await page.locator('[aria-label="Settlement mapping response preview"] pre').count()
      ? await page.locator('[aria-label="Settlement mapping response preview"] pre').innerText()
      : null,
  };
}

function result(caseId, capture, checks, evidenceChecks = {}) {
  const assertions = Object.fromEntries(Object.entries(checks).map(([key, fn]) => {
    try { return [key, Boolean(fn(capture))]; } catch { return [key, false]; }
  }));
  const evidenceAssertions = Object.fromEntries(Object.entries(evidenceChecks).map(([key, fn]) => {
    try { return [key, Boolean(fn(capture))]; } catch { return [key, false]; }
  }));
  const behaviorPassed = Object.values(assertions).every(Boolean);
  const evidenceComplete = Object.values(evidenceAssertions).every(Boolean);
  return { caseId, browserExecuted: true, ...capture, assertions, evidenceAssertions,
    behaviorPassed, evidenceComplete, passed: behaviorPassed && evidenceComplete };
}

async function configureBook(page, { debit, credit, receiver, currency, reference }) {
  await openBookScenario(page);
  await setCommon(page, currency, reference);
  await page.getByLabel("Own debit account").selectOption(debit);
  await page.getByLabel("Own credit account").selectOption(credit);
  await page.getByLabel("Receiver Bank").selectOption(receiver);
}

async function runBook(page, id, input, expected) {
  await configureBook(page, input);
  const capture = await resolveAndCapture(page);
  return result(id, capture, {
    requestScenarioBound: (x) => x.request.scenarioCode === "BOOK_TRANSFER_SAME_RECEIVER",
    requestAccountIdsBound: (x) => x.request.ownDebitAccountId === input.debit && x.request.ownCreditAccountId === input.credit,
    requestVersionsBound: (x) => Number(x.request.ownDebitAccountVersion) > 0 && Number(x.request.ownCreditAccountVersion) > 0,
    requestReceiverBound: (x) => x.request.receiverBankServiceId === input.receiver,
    http: (x) => x.responseStatus === expected.http,
    decisionOrCode: (x) => [x.observed.decision, x.observed.code].includes(expected.code),
    reason: (x) => expected.reason ? x.observed.reasonCode === expected.reason : !x.observed.reasonCode,
    ownDomain: (x) => x.observed.resolutionDomain === "OWN_SSI_NOSTRO",
    counterpartySsiSkipped: (x) => x.observed.counterpartySsiResolution === "SKIPPED",
    noCounterpartyChosen: (x) => x.observed.chosenRoute === null && Array.isArray(x.observed.candidates) && x.observed.candidates.length === 0,
    payloadShape: (x) => expected.http === 200
      ? x.observed.payloadGenerated === true && Boolean(x.observed.snapshotHash && x.observed.resolutionToken) &&
        x.observed.snapshotIdentityMethod === "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1"
      : x.observed.payloadGenerated === false && x.observed.roleProvenance === null &&
        x.observed.messageComposerContext === null && Boolean(x.observed.snapshotHash) &&
        x.observed.snapshotIdentityMethod === "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
    bookRendering: (x) => expected.http !== 200 || (
      x.responseBody?.mt?.tags?.["53B"] === "/DEMO-NOSTRO-001-PRIMARY" &&
      x.responseBody?.mt?.renderingDecisions?.["57A"]?.outcome === "OMITTED_BY_RULE" &&
      x.responseBody?.mt?.tags?.["58A"] === "/DEMO-NOSTRO-001-EXPCOLL\nDEMOHKHH" &&
      x.observed.messageComposerContext?.DbtrAcct?.value === "DEMO-NOSTRO-001-PRIMARY" &&
      x.observed.messageComposerContext?.SttlmAcct?.value === "DEMO-NOSTRO-001-PRIMARY" &&
      x.observed.messageComposerContext?.CdtrAcct?.value === "DEMO-NOSTRO-001-EXPCOLL"
    ),
    ownProvenanceOnly: (x) => expected.http !== 200 || (
      !JSON.stringify(x.observed.roleProvenance).includes("COUNTERPARTY_SSI") &&
      x.observed.roleProvenance?.receiver?.source === "RECEIVER_BANK_SERVICE" &&
      x.observed.roleProvenance?.receiver?.bankServiceId === input.receiver
    ),
  }, {
    correlationPresent: (x) => Boolean(x.request.correlationId || Object.keys(x.responseHeaders).length > 0),
    noLegacyCounterpartyBinding: (x) => !("counterpartyBankServiceId" in x.request),
    counterpartySsiNotQueried: (x) => x.responseBody?.mx?.resolutionTrace?.counterpartySsiQueried === false,
  });
}

async function runGeneric(page, id, { bic, currency, chosen, version, agent, sttlmAcct }) {
  await openGeneric(page);
  await setCommon(page, currency, id);
  await page.getByLabel("Counterparty（Bank Directory / BIC）").selectOption(`BANK-SVC-${bic}`);
  const capture = await resolveAndCapture(page);
  return result(id, capture, {
    noScenarioInRequest: (x) => !("scenarioCode" in x.request),
    http200: (x) => x.responseStatus === 200,
    resolved: (x) => x.observed.code === "SSI_RESOLVED",
    chosen: (x) => x.observed.chosenRoute?.ssiCode === chosen && Number(x.observed.chosenRoute?.ssiVersion) === version,
    currency: (x) => x.observed.chosenRoute?.currency === currency,
    instructedAgent: (x) => x.observed.roles?.instructedAgent === agent,
    creditorAgent: (x) => x.observed.roles?.creditorAgent === agent,
    cdtrPassThrough: (x) => x.observed.cdtr?.value === bic && x.observed.cdtr?.source === "REQUEST_PASS_THROUGH",
    instructedProvenance: (x) => {
      const p = x.observed.roleProvenance?.instructedAgent;
      return p?.value === agent && p?.source === "COUNTERPARTY_SSI" && p?.sourceField === "actualReceiverBic" && p?.ssiCode === chosen && Number(p?.ssiVersion) === version;
    },
    creditorProvenance: (x) => {
      const p = x.observed.roleProvenance?.creditorAgent;
      return p?.value === agent && p?.source === "COUNTERPARTY_SSI" && p?.sourceField === "accountWithBic" && p?.ssiCode === chosen && Number(p?.ssiVersion) === version;
    },
    settlementAccount: (x) => x.observed.messageComposerContext?.SttlmAcct?.value === sttlmAcct,
    mt57OmittedByRule: (x) => x.responseBody?.renderingDecisions?.["MT202.57a"]?.outcome === "OMITTED_BY_RULE",
    mt58TransactionContext: (x) => x.responseBody?.fieldProvenance?.["58A"]?.source === "TRANSACTION_CONTEXT",
    evidenceVisible: (x) => Boolean(x.observed.snapshotHash && x.observed.resolutionToken),
  }, {
    correlationPresent: (x) => Boolean(x.request.correlationId || Object.keys(x.responseHeaders).length > 0),
  });
}

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  if (uatApiBase !== "http://localhost:3100/api") {
    await page.route("http://localhost:3100/api/**", async (route) => {
      const target = route.request().url().replace(
        "http://localhost:3100/api",
        uatApiBase,
      );
      const response = await route.fetch({ url: target });
      await route.fulfill({ response });
    });
  }
  await enterResolution(page);
  results.push(await runBook(page, "BOOK-01", {
    debit: BOOK.debitCiti, credit: BOOK.creditCiti, receiver: "BANK-SVC-CITIUS33", currency: "USD", reference: "BOOK-01",
  }, { http: 200, code: "RESOLVED" }));
  results.push(await runBook(page, "BOOK-02", {
    debit: BOOK.debitHkd, credit: BOOK.creditHsbcUsd, receiver: "BANK-SVC-HSBCHKHH", currency: "HKD", reference: "BOOK-02",
  }, { http: 422, code: "OPTION_CONSTRAINT_VIOLATION", reason: "OWN_ACCOUNT_CURRENCY_MISMATCH" }));
  results.push(await runBook(page, "BOOK-03", {
    debit: BOOK.debitCiti, credit: BOOK.creditHsbcUsd, receiver: "BANK-SVC-CITIUS33", currency: "USD", reference: "BOOK-03",
  }, { http: 422, code: "OPTION_CONSTRAINT_VIOLATION", reason: "OWN_ACCOUNT_RECEIVER_MISMATCH" }));
  results.push(await runBook(page, "BOOK-04", {
    debit: BOOK.debitCiti, credit: BOOK.creditCiti, receiver: "BANK-SVC-CITIUS33", currency: "USD", reference: "BOOK-04",
  }, { http: 200, code: "RESOLVED" }));

  await configureBook(page, { debit: BOOK.debitCiti, credit: BOOK.creditCiti, receiver: "BANK-SVC-CITIUS33", currency: "USD", reference: "BOOK-05-STALE" });
  const before = await resolveAndCapture(page);
  await page.getByLabel("Own credit account").selectOption(BOOK.creditHsbcUsd);
  const staleText = await page.locator("article.result-panel").innerText();
  const staleToken = before.observed.resolutionToken;
  const stalePassed = Boolean(staleToken) &&
    staleText.includes("尚未執行 Resolution") && !staleText.includes(staleToken);

  await openBookScenario(page);
  await setCommon(page, "USD", "BOOK-05-RACE-A");
  await page.getByLabel("Own debit account").selectOption(BOOK.debitCiti);
  await page.getByLabel("Own credit account").selectOption(BOOK.creditCiti);
  await page.getByLabel("Receiver Bank").selectOption("BANK-SVC-CITIUS33");
  const raceNetworkEvents = [];
  let releaseFirstStarted;
  const firstStarted = new Promise((resolve) => { releaseFirstStarted = resolve; });
  let releaseFirstCompleted;
  const firstCompleted = new Promise((resolve) => { releaseFirstCompleted = resolve; });
  await page.route("**/settlements/resolve", async (route) => {
    const request = route.request();
    const sequence = raceNetworkEvents.length === 0 ? "A" : "B";
    const event = {
      sequence,
      requestStartedAt: new Date().toISOString(),
      request: request.postDataJSON(),
    };
    raceNetworkEvents.push(event);
    if (sequence === "A") releaseFirstStarted();
    const target = request.url().replace(
      "http://localhost:3100/api",
      uatApiBase,
    );
    const response = await route.fetch({ url: target });
    event.upstreamResponseAt = new Date().toISOString();
    event.responseStatus = response.status();
    try { event.responseBody = await response.json(); }
    catch { event.responseBody = { unparsedText: await response.text() }; }
    if (sequence === "A") {
      event.delayMs = 1500;
      await new Promise((resolve) => setTimeout(resolve, event.delayMs));
    }
    event.browserFulfilledAt = new Date().toISOString();
    await route.fulfill({ response });
    if (sequence === "A") releaseFirstCompleted();
  });
  const first = page.getByRole("button", { name: "2. Preview Resolution", exact: true }).click();
  await firstStarted;
  await page.waitForTimeout(50);
  await page.getByLabel("Own credit account").selectOption(BOOK.creditHsbcUsd);
  await page.getByLabel("Transaction Reference").fill("BOOK-05-RACE-B");
  const secondCapture = await resolveAndCapture(page);
  const domAfterB = {
    capturedAt: new Date().toISOString(),
    text: await page.locator("article.result-panel").innerText(),
    correlationId: secondCapture.request.correlationId,
  };
  await first;
  await firstCompleted;
  await page.waitForTimeout(200);
  const domAfterDelayedA = {
    capturedAt: new Date().toISOString(),
    text: await page.locator("article.result-panel").innerText(),
  };
  await page.unroute("**/settlements/resolve");
  const eventA = raceNetworkEvents.find((event) => event.sequence === "A");
  const eventB = raceNetworkEvents.find((event) => event.sequence === "B");
  const responseCorrelation = (event) => contractFields(event?.responseBody).resolutionToken !== undefined
    ? (event?.responseBody?.mx?.correlationId ?? event?.responseBody?.correlationId)
    : null;
  const responseSnapshot = (event) => contractFields(event?.responseBody).snapshotHash;
  const racePassed = raceNetworkEvents.length === 2 &&
    Boolean(eventA?.request?.correlationId) && Boolean(eventB?.request?.correlationId) &&
    eventA.request.correlationId !== eventB.request.correlationId &&
    responseCorrelation(eventA) === eventA.request.correlationId &&
    responseCorrelation(eventB) === eventB.request.correlationId &&
    Date.parse(eventB.browserFulfilledAt) < Date.parse(eventA.browserFulfilledAt) &&
    responseSnapshot(eventA) === before.observed.snapshotHash &&
    responseSnapshot(eventB) === before.observed.snapshotHash &&
    secondCapture.observed.reasonCode === "OWN_ACCOUNT_RECEIVER_MISMATCH" &&
    domAfterB.text === secondCapture.uiText &&
    domAfterDelayedA.text === domAfterB.text &&
    !domAfterDelayedA.text.includes(eventA.responseBody?.mx?.resolutionToken ?? "__NO_A_TOKEN__");
  const book05EvidenceComplete = Boolean(secondCapture.request.correlationId) &&
    !("counterpartyBankServiceId" in secondCapture.request) &&
    secondCapture.responseBody?.mx?.resolutionTrace?.counterpartySsiQueried === false &&
    raceNetworkEvents.every((event) => Boolean(event.requestStartedAt && event.upstreamResponseAt &&
      event.browserFulfilledAt && event.responseBody && event.request?.correlationId));
  results.push({
    caseId: "BOOK-05",
    browserExecuted: true,
    stale: { before, afterText: staleText, passed: stalePassed },
    race: {
      delayMs: 1500,
      networkEvents: raceNetworkEvents,
      secondCapture,
      domAfterB,
      domAfterDelayedA,
      passed: racePassed,
    },
    behaviorPassed: stalePassed && racePassed,
    evidenceComplete: book05EvidenceComplete,
    passed: stalePassed && racePassed && book05EvidenceComplete,
  });

  results.push(await runGeneric(page, "GEN-202-01", { bic: "CITIUS33", currency: "USD", chosen: v153 ? "SSI-UAT-GEN-01" : "SSI-DEMO-001", version: v153 ? 1 : 44, agent: "CITIUS33", sttlmAcct: "DEMO-NOSTRO-001-PRIMARY-PRIMARY" }));
  results.push(await runGeneric(page, "GEN-202-02", { bic: "CHASUS33", currency: "USD", chosen: v153 ? "SSI-UAT-GEN-10" : "SSI-DEMO-021", version: v153 ? 1 : 39, agent: "CITIUS33", sttlmAcct: v153 ? "DEMO-NOSTRO-001-PRIMARY-PRIMARY" : "DEMO-NOSTRO-001-EXPCOLL-PRIMARY" }));
  for (const item of VIA_CASES) {
    results.push(await runGeneric(page, `OMIT-57A-${item.suffix}`, item));
  }
  results.push(await runGeneric(page, "PROV-00", { bic: "CITIUS33", currency: "USD", chosen: v153 ? "SSI-UAT-GEN-01" : "SSI-DEMO-001", version: v153 ? 1 : 44, agent: "CITIUS33", sttlmAcct: "DEMO-NOSTRO-001-PRIMARY-PRIMARY" }));
  for (const item of VIA_CASES) {
    results.push(await runGeneric(page, `PROV-${item.suffix}`, item));
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  channel: "Playwright Chromium browser UI with network evidence",
  portalUrl,
  apiBase: uatApiBase,
  dataVersion,
  scope: `${dataVersion} BOOK-01..05, GEN-202-01..02, OMIT-57A-01..06, PROV-00..06`,
  summary: {
    planned: results.length,
    executed: results.length,
    behaviorPassed: results.filter((x) => x.behaviorPassed).length,
    evidenceComplete: results.filter((x) => x.evidenceComplete).length,
    fullyPassed: results.filter((x) => x.passed).length,
    failed: results.filter((x) => !x.passed).length,
  },
  results,
};
await mkdir(path.dirname(output), { recursive: true });
const bytes = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(output, bytes, "utf8");
console.log(JSON.stringify({ output, sha256: sha256(bytes), summary: report.summary }, null, 2));
if (report.summary.failed) process.exitCode = 1;
