import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:4400/";
const CHROME =
  process.env.PLAYWRIGHT_BROWSER_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUTPUT = path.resolve(
  ROOT,
  process.env.UAT_REPORT_PATH ??
    "qa/mt2/reports/MT2XX_v15.1_browser_UAT_postfix_20260911.json",
);
const WORKBOOK = path.join(
  ROOT,
  "qa/mt2/uat/MT2xx_SSI_Resolution_UAT執行清單_v15.1.xlsx",
);

const pairs = [
  { pair: 1, bic: "CITIUS33", ccy: "USD", chosen: "SSI-DEMO-001", count: 2 },
  { pair: 2, bic: "BARCGB22", ccy: "GBP", chosen: null, count: 3 },
  { pair: 3, bic: "BARCGB22", ccy: "USD", chosen: "SSI-DEMO-024", count: 1 },
  { pair: 4, bic: "DEUTDEFF", ccy: "EUR", chosen: "SSI-DEMO-005", count: 3 },
  { pair: 5, bic: "DBSSSGSG", ccy: "SGD", chosen: "SSI-DEMO-007", count: 2 },
  { pair: 6, bic: "BOTKJPJT", ccy: "JPY", chosen: "SSI-DEMO-009", count: 2 },
  { pair: 7, bic: "HSBCHKHH", ccy: "HKD", chosen: "SSI-DEMO-011", count: 2 },
  { pair: 8, bic: "BOFAUS3N", ccy: "AUD", chosen: "SSI-DEMO-013", count: 2 },
  { pair: 9, bic: "CHASUS33", ccy: "CAD", chosen: "SSI-DEMO-015", count: 2 },
  { pair: 10, bic: "CHASUS33", ccy: "USD", chosen: "SSI-DEMO-021", count: 1 },
  { pair: 11, bic: "SCBLGB2L", ccy: "CHF", chosen: "SSI-DEMO-017", count: 2 },
  { pair: 12, bic: "BNPAFRPP", ccy: "CNY", chosen: "SSI-DEMO-019", count: 2 },
];
const messages = ["MT202", "MT205", "MT202COV", "MT205COV"];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function caseId(pair, messageIndex) {
  return `UAT-V151-${String((pair - 1) * 4 + messageIndex + 1).padStart(3, "0")}`;
}

async function openMessage(page, message) {
  if ((await page.getByRole("button", { name: "← Back to Payment Message Index", exact: true }).count()) > 0) {
    await page.getByRole("button", { name: "← Back to Payment Message Index", exact: true }).click();
  }
  await page.getByRole("link", { name: `Select ${message}`, exact: true }).click();
  await page.getByRole("radio", { name: "MX — pacs.009.001.08", exact: true }).check();
}

async function preview(page, input) {
  await page.getByLabel("Counterparty（Bank Directory / BIC）").selectOption(`BANK-SVC-${input.bic}`);
  await page.getByLabel("Currency (ISO 4217)").selectOption(input.ccy);
  await page.getByLabel("Booking Branch / Entity（本行）").selectOption("HK01");
  await page.getByLabel("Transaction Reference").fill(input.reference);
  await page.getByRole("button", { name: "2. Preview Resolution", exact: true }).click();
  await page.locator("article.result-panel").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const text = document.querySelector("article.result-panel")?.textContent ?? "";
    return text.includes("SSI_RESOLVED") || text.includes("SSI_AMBIGUOUS") || text.includes("PROFILE_INCOMPLETE");
  });
}

async function resolvedEvidence(page) {
  const previewCodes = await page.locator('[aria-label="Resolution preview evidence"] code').allTextContents();
  const chosenText = await page.locator(".contract-route-card.chosen").innerText();
  const alternatives = await page.locator(".contract-route-list .contract-route-card").allTextContents();
  const confirm = page.getByRole("button", { name: "3. Confirm Resolution", exact: true });
  const confirmVisible = await confirm.isVisible();
  const confirmEnabled = confirmVisible && (await confirm.isEnabled());
  if (confirmEnabled) await confirm.click();
  await page.getByRole("button", { name: "Confirmed", exact: true }).waitFor({ state: "visible" });
  const tokenCodes = await page.locator(".token code").allTextContents();
  return {
    previewResolutionToken: previewCodes[0] ?? null,
    previewSnapshotHash: previewCodes[1] ?? null,
    chosenText,
    alternatives,
    confirmVisible,
    confirmEnabled,
    confirmedResolutionToken: tokenCodes[2] ?? null,
    confirmedSnapshotHash: tokenCodes[3] ?? null,
  };
}

async function runMatrix(page) {
  const results = [];
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex];
    await openMessage(page, message);
    for (const pair of pairs) {
      const id = caseId(pair.pair, messageIndex);
      await preview(page, { ...pair, reference: id });
      const ambiguous = pair.chosen === null;
      if (ambiguous) {
        const panelText = await page.locator("article.result-panel").innerText();
        const candidateCards = await page.locator('[aria-label="Unordered SSI candidates"] .contract-route-card').allTextContents();
        const confirmCount = await page.getByRole("button", { name: /Confirm Resolution|Confirmed/ }).count();
        const passed =
          panelText.includes("SSI_AMBIGUOUS") &&
          panelText.includes("HTTP 422") &&
          candidateCards.length === pair.count &&
          pair.chosen === null &&
          confirmCount === 0;
        results.push({
          caseId: id,
          pair: pair.pair,
          message,
          counterparty: pair.bic,
          currency: pair.ccy,
          expected: { httpStatus: 422, code: "SSI_AMBIGUOUS", candidates: pair.count, confirm: false },
          actual: { httpStatus: panelText.includes("HTTP 422") ? 422 : null, code: panelText.includes("SSI_AMBIGUOUS") ? "SSI_AMBIGUOUS" : null, candidateCards, confirmCount },
          passed,
        });
        continue;
      }

      const evidence = await resolvedEvidence(page);
      const chosenMatches = evidence.chosenText.includes(pair.chosen) && evidence.chosenText.includes(pair.ccy);
      const previewEvidencePresent = Boolean(evidence.previewResolutionToken && evidence.previewSnapshotHash);
      const confirmedEvidencePresent = Boolean(evidence.confirmedResolutionToken && evidence.confirmedSnapshotHash);
      const evidenceDistinct =
        evidence.previewResolutionToken !== evidence.confirmedResolutionToken ||
        evidence.previewSnapshotHash !== evidence.confirmedSnapshotHash;
      const passed =
        chosenMatches &&
        evidence.alternatives.length === pair.count - 1 &&
        evidence.confirmVisible &&
        evidence.confirmEnabled &&
        previewEvidencePresent &&
        confirmedEvidencePresent;
      results.push({
        caseId: id,
        pair: pair.pair,
        message,
        counterparty: pair.bic,
        currency: pair.ccy,
        expected: { httpStatus: 200, code: "SSI_RESOLVED", chosenSsiCode: pair.chosen, candidates: pair.count, confirm: true },
        actual: { ...evidence, alternativeCount: evidence.alternatives.length },
        assertions: {
          chosenMatches,
          previewEvidencePresent,
          confirmedEvidencePresent,
          previewAndConfirmedEvidenceVisible:
            previewEvidencePresent && confirmedEvidencePresent,
          evidenceDistinct,
          evidenceEqualityRequired: false,
        },
        passed,
      });
    }
  }
  return results.sort((left, right) => left.caseId.localeCompare(right.caseId));
}

async function runNorthstar(page, message) {
  await openMessage(page, message);
  await preview(page, { bic: "NSSIUSN1", ccy: "USD", reference: `NORTHSTAR-${message}` });
  const text = await page.locator("article.result-panel").innerText();
  const confirmCount = await page.getByRole("button", { name: /Confirm Resolution|Confirmed/ }).count();
  return {
    id: `NORTHSTAR-${message}`,
    actual: { httpStatus: text.includes("HTTP 503") ? 503 : null, code: text.includes("PROFILE_INCOMPLETE") ? "PROFILE_INCOMPLETE" : null, confirmCount },
    passed: text.includes("HTTP 503") && text.includes("PROFILE_INCOMPLETE") && confirmCount === 0,
  };
}

async function runStale(page) {
  await openMessage(page, "MT202");
  await preview(page, { bic: "BARCGB22", ccy: "USD", reference: "UI-STALE-01" });
  const before = await page.locator("article.result-panel").innerText();
  await page.getByLabel("Currency (ISO 4217)").selectOption("SGD");
  const after = await page.locator("article.result-panel").innerText();
  return {
    caseId: "UI-STALE-01",
    actual: { beforeResolved: before.includes("SSI_RESOLVED"), after },
    passed: before.includes("SSI_RESOLVED") && after.includes("尚未執行 Resolution") && !after.includes("SSI_RESOLVED"),
  };
}

async function runRace(page) {
  let delayedUsd = false;
  await page.route("**/settlements/resolve", async (route) => {
    const body = route.request().postDataJSON();
    if (!delayedUsd && body?.currency === "USD") {
      delayedUsd = true;
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await openMessage(page, "MT202");
  await page.getByLabel("Counterparty（Bank Directory / BIC）").selectOption("BANK-SVC-BARCGB22");
  await page.getByLabel("Currency (ISO 4217)").selectOption("USD");
  await page.getByLabel("Transaction Reference").fill("UI-RACE-01-USD");
  await page.getByRole("button", { name: "2. Preview Resolution", exact: true }).click();
  await page.getByLabel("Currency (ISO 4217)").selectOption("GBP");
  await page.getByLabel("Transaction Reference").fill("UI-RACE-01-GBP");
  await page.getByRole("button", { name: "2. Preview Resolution", exact: true }).click();
  await page.waitForTimeout(1800);
  const text = await page.locator("article.result-panel").innerText();
  await page.unroute("**/settlements/resolve");
  return {
    caseId: "UI-RACE-01",
    browserExecuted: true,
    delayMs: 1500,
    actual: { delayedUsd, finalText: text },
    passed: delayedUsd && text.includes("SSI_AMBIGUOUS") && text.includes("HTTP 422") && !text.includes("SSI-DEMO-024"),
  };
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) consoleErrors.push({ type: message.type(), text: message.text() });
  });
  await page.goto(PORTAL_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Payment SSI Resolution", exact: true }).click();
  const results = await runMatrix(page);
  const northstar = [await runNorthstar(page, "MT202COV"), await runNorthstar(page, "MT205COV")];
  const stale = await runStale(page);
  const race = await runRace(page);
  const failed = results.filter((result) => !result.passed);
  const report = {
    reportVersion: "POST-FIX-1",
    generatedAt: new Date().toISOString(),
    channel: "Playwright Chromium browser UI",
    target: { portalUrl: PORTAL_URL, workbook: path.relative(ROOT, WORKBOOK), workbookSha256: sha256(await readFile(WORKBOOK)) },
    summary: {
      planned: results.length,
      executed: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      resolved: results.filter((result) => result.expected.code === "SSI_RESOLVED").length,
      ambiguous: results.filter((result) => result.expected.code === "SSI_AMBIGUOUS").length,
      northstarPassed: northstar.filter((item) => item.passed).length,
      stalePassed: stale.passed,
      racePassed: race.passed,
      blockedReleased: failed.length === 0 && northstar.every((item) => item.passed) && stale.passed && race.passed,
    },
    browserExecuted: { results, northstar, stale, race, consoleErrors },
    automatedEvidence: {
      governedDelayedResponseComponentTest: "apps/ssi-portal/src/app/component-behavior.spec.ts",
      distinction: "UI-RACE-01 is also browser-executed here using a governed 1500 ms Playwright response delay; component evidence remains separate corroboration.",
    },
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.summary));
  if (!report.summary.blockedReleased) process.exitCode = 1;
} finally {
  await browser.close();
}
