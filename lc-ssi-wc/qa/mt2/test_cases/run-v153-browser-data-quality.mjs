/* global process, console */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const portalUrl = process.env.PORTAL_URL ?? "http://localhost:4400/";
const chrome =
  process.env.PLAYWRIGHT_BROWSER_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const outputPath = path.resolve(
  root,
  "qa/mt2/reports/MT2XX_v15.3_browser_DATA_QUALITY_409_20260912.json",
);
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex").toUpperCase();

const browser = await chromium.launch({ headless: true, executablePath: chrome });
let evidence;
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await page.goto(portalUrl, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Payment SSI Resolution", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Select MT202", exact: true })
    .or(page.getByRole("button", { name: "Select MT202", exact: true }))
    .dblclick();
  await page
    .getByLabel("Counterparty（Bank Directory / BIC）")
    .selectOption("BANK-SVC-BARCGB22");
  await page.getByLabel("Currency (ISO 4217)").selectOption("GBP");
  await page.getByLabel("Value Date").fill("2026-09-12");
  await page
    .getByLabel("Transaction Reference")
    .fill("BROWSER-DATA-QUALITY-409");
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
  const uiText = await panel.innerText();
  const mx = body.mx ?? body;
  const assertions = {
    browserRequestTargetsCorruptScope:
      response.request().postDataJSON().counterpartyBankServiceId ===
        "BANK-SVC-BARCGB22" &&
      response.request().postDataJSON().currency === "GBP",
    http409: response.status() === 409,
    controlledCode: mx.code === "INCORRECT_SSI_CONFIGURATION",
    developmentRuntimePolicy:
      mx.runtimeEnvironment === "development" &&
      mx.statusPolicyVersion === "SSI-CONFIG-HTTP-01",
    notRetryable: mx.retryable === false,
    failClosed:
      mx.chosenRoute === null &&
      Array.isArray(mx.candidates) &&
      mx.candidates.length === 0 &&
      mx.canonicalRoles === null &&
      mx.roleProvenance === null &&
      mx.messageComposerContext === null &&
      mx.payloadGenerated === false &&
      mx.renderedPayload === null,
    issueDetails:
      Array.isArray(mx.dataIssues) &&
      mx.dataIssues.length > 0 &&
      mx.dataIssues.every(
        (issue) =>
          issue.violation === "PURPOSE_APPLICABILITY_MISMATCH" &&
          issue.remediation ===
            "REMOVE_INVALID_APPLICABILITY_OR_CREATE_PURPOSE_BUILT_ROUTE",
      ),
    remediationProvided:
      Array.isArray(mx.remediationSteps) && mx.remediationSteps.length >= 4,
    governanceDestination:
      mx.repairQueue?.required === false &&
      mx.governanceDestination === "CONFIGURATION_GOVERNANCE",
    uiLabelsDataProblem:
      uiText.includes("Incorrect SSI") &&
      uiText.includes("SSI 主檔資料錯誤") &&
      uiText.includes("INCORRECT_SSI_CONFIGURATION"),
    noConfirmAction:
      (await page.getByRole("button", { name: /Confirm Resolution/ }).count()) ===
      0,
    noSettlementPayload:
      (await page
        .locator('[aria-label="Settlement mapping response preview"]')
        .count()) === 0,
  };
  evidence = {
    schemaVersion: "1.0",
    reportType: "V15.3_BROWSER_DATA_QUALITY_409",
    generatedAt: new Date().toISOString(),
    channel: "Playwright Chromium browser UI with captured network evidence",
    runtimeEnvironment: "development",
    statusPolicyVersion: "SSI-CONFIG-HTTP-01",
    portalUrl,
    request: response.request().postDataJSON(),
    responseStatus: response.status(),
    responseBody: body,
    uiText,
    assertions,
    passed: Object.values(assertions).every(Boolean),
  };
} finally {
  await browser.close();
}

const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(outputPath, bytes, "utf8");
await writeFile(`${outputPath}.sha256.txt`, `${sha256(bytes)}  ${outputPath}\n`);
console.log(
  JSON.stringify(
    { outputPath, responseStatus: evidence.responseStatus, passed: evidence.passed },
    null,
    2,
  ),
);
if (!evidence.passed) process.exitCode = 1;
