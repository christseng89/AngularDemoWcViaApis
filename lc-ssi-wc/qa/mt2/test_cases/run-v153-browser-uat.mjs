/* global process, console */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const portalUrl = process.env.PORTAL_URL ?? "http://localhost:4600/";
const chrome =
  process.env.PLAYWRIGHT_BROWSER_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const expectationPath = path.resolve(
  root,
  "qa/mt2/reports/MT2XX_v15.3_migration_expected_20260912.json",
);
const outputPath = path.resolve(
  root,
  "qa/mt2/reports/MT2XX_v15.3_browser_UAT_20260912.json",
);
const expectation = JSON.parse(await readFile(expectationPath, "utf8"));
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex").toUpperCase();
const sourceMessageTypeOf = (caseKey) =>
  ["MT202COV", "MT205COV", "MT202", "MT205"].find((message) =>
    caseKey.endsWith(message),
  );

async function enterResolution(page) {
  await page.goto(portalUrl, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Payment SSI Resolution", exact: true })
    .click();
}

async function selectMessage(page, message) {
  const back = page.getByRole("button", {
    name: "← Back to Payment Message Index",
    exact: true,
  });
  if (await back.count()) await back.click();
  await page
    .getByRole("button", { name: `Select ${message}`, exact: true })
    .dblclick();
  await page.getByLabel("Currency (ISO 4217)").waitFor({ state: "visible" });
}

async function executeUiCase(page, input) {
  await selectMessage(page, input.sourceMessageType);
  await page
    .getByLabel("Counterparty（Bank Directory / BIC）")
    .selectOption(`BANK-SVC-${input.counterpartyBic}`);
  await page.getByLabel("Currency (ISO 4217)").selectOption(input.currency);
  await page
    .getByLabel("Booking Branch / Entity（本行）")
    .selectOption("HK01");
  await page.getByLabel("Value Date").fill("2026-09-12");
  await page.getByLabel("Transaction Reference").fill(input.caseKey);
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/settlements/resolve") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "2. Preview Resolution", exact: true })
    .click();
  const response = await pending;
  const body = await response.json();
  const panel = page.locator("article.result-panel");
  await panel.waitFor({ state: "visible" });
  return {
    request: response.request().postDataJSON(),
    responseStatus: response.status(),
    responseBody: body,
    uiText: await panel.innerText(),
  };
}

const result = (caseKey, capture, assertions) => ({
  caseKey,
  browserExecuted: true,
  responseStatus: capture.responseStatus,
  request: capture.request,
  responseBody: capture.responseBody,
  uiText: capture.uiText,
  assertions,
  passed: Object.values(assertions).every(Boolean),
});

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const formalCases = [];
const ambiguityCases = [];
const noSsiCases = [];
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await enterResolution(page);

  for (const expected of expectation.formalUat.cases) {
    const sourceMessageType = sourceMessageTypeOf(expected.caseKey);
    const capture = await executeUiCase(page, {
      caseKey: `BROWSER-${expected.caseKey}`,
      sourceMessageType,
      counterpartyBic: expected.counterpartyBic,
      currency: expected.currency,
    });
    const body = capture.responseBody;
    const chosen = body.chosenRoute ?? body.mx?.chosenRoute ?? {};
    formalCases.push(
      result(expected.caseKey, capture, {
        browserRequestMessage: capture.request.sourceMessageType === sourceMessageType,
        browserRequestCounterparty:
          capture.request.counterpartyBankServiceId ===
          `BANK-SVC-${expected.counterpartyBic}`,
        browserRequestCurrency: capture.request.currency === expected.currency,
        httpStatus: capture.responseStatus === 200,
        decision: body.mx?.code === "SSI_RESOLVED",
        chosenSsiCode: chosen.ssiCode === expected.expectedSsiCode,
        chosenSsiVersion: chosen.ssiVersion === expected.expectedSsiVersion,
        accountReference: chosen.accountId === expected.expectedAccountReference,
        currency: chosen.currency === expected.currency,
        routePurpose: chosen.routePurpose === expected.expectedRoutePurpose,
        selectedBy: chosen.selectedBy === expected.expectedSelectedBy,
        snapshotIdentity:
          body.snapshotHash?.toUpperCase() ===
            expectation.overlayLogicalSnapshotSha256 &&
          body.snapshotIdentityMethod ===
            "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
        uiResolved: /SSI_RESOLVED|RESOLVED/.test(capture.uiText),
      }),
    );
  }

  for (const sourceMessageType of expectation.qaAmbiguityControls.journeys) {
    const caseKey = `QA-TIE-${sourceMessageType}`;
    const capture = await executeUiCase(page, {
      caseKey: `BROWSER-${caseKey}`,
      sourceMessageType,
      counterpartyBic: expectation.qaAmbiguityControls.counterpartyBic,
      currency: expectation.qaAmbiguityControls.currency,
    });
    const body = capture.responseBody;
    const expectedCodes = expectation.qaAmbiguityControls.expectedCandidates
      .map(({ ssiCode }) => ssiCode)
      .sort();
    const actualCodes = (body.candidates ?? [])
      .map(({ ssiCode }) => ssiCode)
      .sort();
    ambiguityCases.push(
      result(caseKey, capture, {
        httpStatus: capture.responseStatus === 422,
        decision: body.mx?.code === "SSI_AMBIGUOUS",
        failClosed:
          body.chosenRoute === null &&
          body.canonicalRoles === null &&
          body.roleProvenance === null &&
          body.messageComposerContext === null &&
          body.payloadGenerated === false,
        candidateSet:
          JSON.stringify(actualCodes) === JSON.stringify(expectedCodes),
        ambiguityReason:
          body.ambiguityReason === "TIED_ON_CONTROLLED_RANK_KEYS",
        uiAmbiguous: capture.uiText.includes("SSI_AMBIGUOUS"),
      }),
    );
  }

  for (const currency of ["EUR", "SGD", "JPY", "HKD", "AUD", "CAD", "CHF", "CNY"]) {
    const caseKey = `NO-SSI-BARC-${currency}`;
    const capture = await executeUiCase(page, {
      caseKey: `BROWSER-${caseKey}`,
      sourceMessageType: "MT202",
      counterpartyBic: "BARCGB22",
      currency,
    });
    const body = capture.responseBody;
    noSsiCases.push(
      result(caseKey, capture, {
        httpStatus: capture.responseStatus === 422,
        decision: body.mx?.code === "SSI_NOT_FOUND",
        noRoute:
          (body.chosenRoute ?? body.mx?.chosenRoute ?? null) === null &&
          (body.candidates ?? body.mx?.candidates ?? []).length === 0,
        payloadNotGenerated:
          (body.payloadGenerated ?? body.mx?.payloadGenerated) === false,
        uiNoSsi: capture.uiText.includes("SSI_NOT_FOUND"),
      }),
    );
  }
} finally {
  await browser.close();
}

const all = [...formalCases, ...ambiguityCases, ...noSsiCases];
const report = {
  schemaVersion: "1.0",
  reportType: "V15.3_BROWSER_UAT",
  generatedAt: new Date().toISOString(),
  channel: "Playwright Chromium browser UI with captured network evidence",
  portalUrl,
  logicalSnapshotSha256: expectation.overlayLogicalSnapshotSha256,
  summary: {
    planned: all.length,
    executed: all.length,
    passed: all.filter(({ passed }) => passed).length,
    failed: all.filter(({ passed }) => !passed).length,
    formal: { planned: formalCases.length, passed: formalCases.filter(({ passed }) => passed).length },
    ambiguity: { planned: ambiguityCases.length, passed: ambiguityCases.filter(({ passed }) => passed).length },
    noSsi: { planned: noSsiCases.length, passed: noSsiCases.filter(({ passed }) => passed).length },
  },
  formalCases,
  ambiguityCases,
  noSsiCases,
};
const bytes = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(outputPath, bytes, "utf8");
await writeFile(`${outputPath}.sha256.txt`, `${sha256(bytes)}  ${outputPath}\n`);
console.log(JSON.stringify({ outputPath, summary: report.summary }, null, 2));
if (report.summary.failed) process.exitCode = 1;
