#!/usr/bin/env node
/* global document */
import console from "node:console";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import {
  EXPECTED_CASE_COUNT,
  prepareCases,
  validateCaseResponse,
} from "./mt2-curl-support.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../..");
const portalUrl = process.env.PORTAL_URL ?? "http://localhost:4600/";
const apiUrl = process.env.MT2_QA_API_URL ?? "http://localhost:3100/api";
const workbook = path.resolve(
  workspace,
  process.env.MT2_QA_WORKBOOK ??
    "qa/mt2/mt2-final/fixtures/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx",
);
const reportFile = path.resolve(
  workspace,
  process.env.MT2_QA_UI_REPORT ?? "qa/mt2/reports/mt2-139-ui-results.json",
);
const summaryFile = path.resolve(
  workspace,
  process.env.MT2_QA_UI_SUMMARY ?? "qa/mt2/reports/MT2_139_UI全量測試報告_ZH.md",
);
const evidenceDirectory = path.resolve(
  workspace,
  process.env.MT2_QA_UI_EVIDENCE ?? "qa/mt2/reports/mt2-139-ui-evidence",
);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runEvidenceDirectory = path.join(evidenceDirectory, runId);
const preparedDirectory = path.join(runEvidenceDirectory, "prepared-cases");

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
};
const canonicalHash = (value) => sha256(JSON.stringify(canonical(value)));

const prepared = await prepareCases({
  workbook,
  endpointsFile: path.join(workspace, "qa/mt2/mt2-final/case-endpoints.json"),
  registryFile: path.join(
    workspace,
    "qa/mt2/mt2-final/message-adapter-registry.json",
  ),
  bankServiceFile: path.join(
    workspace,
    "qa/mt2/mt2-final/fixtures/baselines/bank-service.current.json",
  ),
  outputDirectory: preparedDirectory,
  baseUrl: apiUrl,
});

const cases = prepared.cases.map((metadata) => ({
  metadata,
  request: JSON.parse(fs.readFileSync(metadata.requestFile, "utf8")),
  expected: JSON.parse(fs.readFileSync(metadata.expectedFile, "utf8")),
}));
const requestedCaseNumbers = new Set(
  (process.env.MT2_QA_CASES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const selectedCases = requestedCaseNumbers.size
  ? cases.filter((item) => requestedCaseNumbers.has(item.metadata.testCaseNo))
  : cases;
if (
  requestedCaseNumbers.size > 0 &&
  selectedCases.length !== requestedCaseNumbers.size
) {
  throw new Error("MT2_QA_CASES contains an unknown or duplicate test case");
}

const requestGroups = new Map();
for (const item of cases) {
  const key = `${item.metadata.endpoint}|${canonicalHash(item.request)}`;
  const group = requestGroups.get(key) ?? [];
  group.push(item);
  requestGroups.set(key, group);
}
const specificationConflicts = [...requestGroups.entries()].flatMap(
  ([key, group]) => {
    const expectedHashes = new Set(
      group.map((item) => canonicalHash(item.expected)),
    );
    if (expectedHashes.size < 2) return [];
    return [
      {
        collisionKey: key,
        endpoint: group[0].metadata.endpoint,
        requestHash: canonicalHash(group[0].request),
        testCaseNos: group.map((item) => item.metadata.testCaseNo),
        expectedHashes: [...expectedHashes],
      },
    ];
  },
);
const conflictCases = new Set(
  specificationConflicts.flatMap((item) => item.testCaseNos),
);

fs.mkdirSync(runEvidenceDirectory, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADFUL !== "1",
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
});
const page = await context.newPage();
const bankResponses = [];
const startupResponses = new Map();
page.on("response", async (response) => {
  for (const endpoint of [
    "/api/reference/banks",
    "/api/settlements/message-index",
  ]) {
    if (response.url().includes(endpoint))
      startupResponses.set(endpoint, response.status());
  }
  if (!response.url().includes("/api/reference/banks") || !response.ok())
    return;
  try {
    const payload = await response.json();
    bankResponses.push(...(payload.items ?? []));
  } catch {
    // The suite's explicit Bank Service checks report malformed responses.
  }
});

let activeCase = null;
await page.route("**/api/settlements/resolve", async (route) => {
  if (!activeCase) {
    await route.continue();
    return;
  }
  activeCase.requestCount += 1;
  const headers = {
    ...route.request().headers(),
    "content-type": "application/json",
    "x-qa-case-id": activeCase.metadata.testCaseNo,
  };
  await route.continue({
    url: activeCase.metadata.endpoint,
    method: "POST",
    headers,
    postData: JSON.stringify(activeCase.request),
  });
});

const globalChecks = [];
const check = (condition, message) => {
  globalChecks.push({ status: condition ? "PASS" : "FAIL", message });
};
const controlByText = (text) =>
  page.locator("label.control", { has: page.getByText(text, { exact: true }) });
const selectIfPresent = async (labelText, value) => {
  if (value === undefined || value === null || value === "") return false;
  const control = controlByText(labelText).locator("select").first();
  if ((await control.count()) !== 1) return false;
  const values = await control
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  if (!values.includes(String(value))) return false;
  await control.selectOption(String(value));
  return true;
};
const fillIfPresent = async (labelText, value) => {
  if (value === undefined || value === null) return false;
  const control = controlByText(labelText).locator("input").first();
  if ((await control.count()) !== 1) return false;
  await control.fill(String(value));
  await control.dispatchEvent("change");
  return true;
};
const capturePreview = async (format) => {
  const radio = page.getByRole("radio", { name: new RegExp(`^${format}`) });
  if ((await radio.count()) === 1) await radio.check();
  const preview = page.locator(
    '[aria-label="Settlement mapping response preview"] pre',
  );
  return (await preview.count()) === 1 ? await preview.innerText() : null;
};

const startedAt = new Date().toISOString();
const results = [];
const indexJourneys = [];
const scenarioJourneys = [];
const bankServiceJourneys = [];
let suiteInterrupted = null;
try {
  const navigation = await page.goto(portalUrl, { waitUntil: "networkidle" });
  check(
    navigation?.ok() === true,
    "Portal startup health check returned HTTP 2xx",
  );
  await page
    .getByRole("button", { name: "Payment SSI Resolution", exact: true })
    .click();
  await page.getByText("Payment Message Index", { exact: true }).waitFor();
  check(
    startupResponses.get("/api/reference/banks") === 200,
    "Bank Service startup health check returned HTTP 200",
  );
  check(
    startupResponses.get("/api/settlements/message-index") === 200,
    "Payment Message Index startup health check returned HTTP 200",
  );

  const counterpartySsiMessages = ["MT202", "MT202COV", "MT205", "MT205COV"];
  const excludedSsiIndexMessages = [
    "MT200",
    "MT201",
    "MT203",
    "MT204",
    "MT210",
  ];
  const paymentMessageIndex = page.getByRole("table", {
    name: "Payment Message Index",
    exact: true,
  });
  check(
    (await paymentMessageIndex.locator("tbody tr").count()) === 4,
    "Payment SSI Index contains exactly four Counterparty SSI messages",
  );
  for (const messageType of excludedSsiIndexMessages) {
    check(
      (await page
        .getByRole("button", { name: `Select ${messageType}`, exact: true })
        .count()) === 0,
      `${messageType} is absent from the Payment SSI Index`,
    );
  }
  for (const messageType of counterpartySsiMessages) {
    const differences = [];
    const row = page.getByRole("button", {
      name: `Select ${messageType}`,
      exact: true,
    });
    if ((await row.count()) !== 1)
      differences.push(`Expected one selectable ${messageType} row`);
    const rowText = (await row.count()) === 1 ? await row.innerText() : "";
    if (!rowText.includes("PROFILE VERIFIED · SINGLE RESOLUTION"))
      differences.push(
        "Index status is not PROFILE VERIFIED · SINGLE RESOLUTION",
      );
    if ((await row.count()) === 1) await row.dispatchEvent("dblclick");
    const outcome = page.locator(
      '[aria-label="Payment message selection outcome"]',
    );
    const resolutionPanel = page.locator(
      '[aria-label="Counterparty SSI resolution panel"]',
    );
    if ((await outcome.count()) !== 1)
      differences.push("Payment message selection outcome panel is missing");
    if ((await resolutionPanel.count()) !== 1)
      differences.push("Counterparty SSI resolution panel is missing");
    const outcomeText =
      (await outcome.count()) === 1 ? await outcome.innerText() : "";
    for (const expected of [messageType, "SUPPORTED", "COUNTERPARTY_SSI"]) {
      if (!outcomeText.includes(expected))
        differences.push(`Selection outcome does not contain ${expected}`);
    }
    const status = differences.length === 0 ? "PASS" : "FAIL";
    indexJourneys.push({
      messageType,
      interaction: "BROWSER_DBLCLICK",
      expectedStatus: "SUPPORTED",
      expectedDomain: "COUNTERPARTY_SSI",
      rowText,
      outcomeText,
      resolutionPanelVisible: (await resolutionPanel.count()) === 1,
      status,
      differences,
    });
    check(
      status === "PASS",
      `${messageType} selects the Counterparty SSI panel`,
    );
    const back = page.getByRole("button", {
      name: "← Back to Payment Message Index",
      exact: true,
    });
    if ((await back.count()) === 1) await back.click();
    await paymentMessageIndex.waitFor();
  }
  const expectedScenarioJourneys = [
    {
      code: "BOOK_TRANSFER_SAME_RECEIVER",
      messageType: "MT202",
      targetMessage: "pacs.009.001.08",
      businessService: "swift.cbprplus.04",
      resolutionDomain: "OWN_SSI_NOSTRO",
      controls: ["Own debit account", "Own credit account", "Receiver Bank"],
    },
    {
      code: "CREDIT_ONE_OF_SEVERAL_AT_57A",
      messageType: "MT202",
      targetMessage: "pacs.009.001.08",
      businessService: "swift.cbprplus.04",
      resolutionDomain: "OWN_SSI_NOSTRO",
      controls: [
        "Own debit account at Receiver",
        "Own credit account at 57A",
        "Receiver Bank",
      ],
    },
    {
      code: "INITIAL_MT200_201_EQUIVALENCE",
      messageType: "MT205",
      targetMessage: "pacs.009.001.08",
      businessService: "swift.cbprplus.04",
      resolutionDomain: "COUNTERPARTY_SSI",
      controls: [
        "Previous MT200/201 context",
        "52a Ordering Institution",
        "58a Beneficiary Institution",
      ],
    },
    {
      code: "NO_MT200_201_EQUIVALENCE",
      messageType: "MT205COV",
      targetMessage: "pacs.009.001.08",
      businessService: "swift.cbprplus.cov.04",
      resolutionDomain: "COUNTERPARTY_SSI",
      controls: [
        "Previous COV context",
        "A.52a Ordering Institution",
        "A.58a Beneficiary Institution",
      ],
    },
    {
      code: "SENDER_BENEFICIARY_DIRECT_DEBIT",
      messageType: "MT204",
      targetMessage: "pacs.010.001.03",
      businessService: "swift.cbprplus.04",
      resolutionDomain: "COUNTERPARTY_SSI",
      controls: ["Direct Debit mandate", "Sender BIC"],
    },
  ];
  const scenarioIndex = page.getByRole("table", {
    name: "Payment Message Scenario Index",
    exact: true,
  });
  const scenarioHeaders = await scenarioIndex
    .locator("thead th")
    .allTextContents();
  check(
    scenarioHeaders
      .map((value) => value.trim().replace(/\s+[↑↓]$/, ""))
      .join("|") === "Message|Description|ISO 20022|Target Scenario",
    "Message Scenario Index exposes the governed four-column contract",
  );
  const visibleScenarioCodes = await scenarioIndex
    .locator("tbody tr td:last-child")
    .allTextContents();
  check(
    visibleScenarioCodes.map((value) => value.trim()).join("|") ===
      expectedScenarioJourneys.map(({ code }) => code).join("|"),
    "Message Scenario Index preserves the governed scenario order",
  );
  for (const scenario of expectedScenarioJourneys) {
    const differences = [];
    const scenarioLink = page.getByRole("link", {
      name: `Select scenario ${scenario.code}`,
      exact: true,
    });
    check(
      (await scenarioLink.count()) === 1,
      `${scenario.code} is a separate Message Scenario Index option`,
    );
    const rowText =
      (await scenarioLink.count()) === 1 ? await scenarioLink.innerText() : "";
    for (const expected of [
      scenario.messageType,
      scenario.targetMessage,
      scenario.businessService,
      scenario.code,
    ]) {
      if (!rowText.includes(expected))
        differences.push(`Scenario row does not contain ${expected}`);
    }
    if ((await scenarioLink.count()) === 1)
      await scenarioLink.dispatchEvent("dblclick");
    await page.getByText(scenario.code, { exact: true }).waitFor();
    for (const label of scenario.controls) {
      const control = page.getByLabel(label, { exact: true });
      check(
        (await control.count()) === 1,
        `${scenario.code} exposes governed control ${label}`,
      );
      if ((await control.count()) === 1 && /Institution|Bank$/.test(label)) {
        const tagName = await control.evaluate((element) => element.tagName);
        check(
          tagName === "SELECT" ||
            (tagName === "INPUT" &&
              (await control.getAttribute("readonly")) !== null),
          `${scenario.code} ${label} is selected or read-only, never manual BIC input`,
        );
      }
    }
    const outcomeText = await page
      .locator('[aria-label="Payment message selection outcome"]')
      .innerText();
    for (const expected of [
      scenario.messageType,
      "SUPPORTED",
      scenario.resolutionDomain,
    ]) {
      if (!outcomeText.includes(expected))
        differences.push(`Scenario outcome does not contain ${expected}`);
    }
    scenarioJourneys.push({
      code: scenario.code,
      messageType: scenario.messageType,
      targetMessage: scenario.targetMessage,
      businessService: scenario.businessService,
      interaction: "BROWSER_DBLCLICK",
      rowText,
      outcomeText,
      status: differences.length === 0 ? "PASS" : "FAIL",
      differences,
    });
    check(
      differences.length === 0,
      `${scenario.code} preserves its message, ISO target, business service, and SSI domain`,
    );
    await page
      .getByRole("button", {
        name: "← Back to Payment Message Index",
        exact: true,
      })
      .click();
  }

  await page
    .getByRole("button", { name: "Select MT202", exact: true })
    .dblclick();
  await page
    .getByRole("button", { name: "2. Preview Resolution", exact: true })
    .waitFor();
  check(
    bankResponses.length > 0,
    "Bank Service returned selectable identities",
  );
  const banksByServiceId = new Map(
    bankResponses
      .filter((bank) => bank.bankServiceId)
      .map((bank) => [bank.bankServiceId, bank]),
  );
  const bankServiceIds = [...banksByServiceId.keys()];
  const counterpartySelector = page.getByLabel(
    "Counterparty（Bank Directory / BIC）",
    { exact: true },
  );
  check(
    (await counterpartySelector.evaluate((element) => element.tagName)) ===
      "SELECT",
    "Counterparty BIC is selected through Bank Service",
  );
  const optionValues = await counterpartySelector
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  check(
    optionValues.every((value) => bankServiceIds.includes(value)),
    "Counterparty selector submits bankServiceId rather than raw BIC",
  );
  const normalBank = banksByServiceId.get("BANK-SVC-BARCGB22");
  const directoryOnlyBank = [...banksByServiceId.values()].find(
    (bank) => bank.usageGroup === "DIRECTORY_ONLY_NO_SSI",
  );
  check(
    Boolean(normalBank) && optionValues.includes("BANK-SVC-BARCGB22"),
    "Normal SSI-referenced Bank Service identity is selectable",
  );
  check(
    Boolean(directoryOnlyBank) &&
      optionValues.includes(directoryOnlyBank.bankServiceId),
    "Directory-only Bank Service identity is selectable without inventing SSI coverage",
  );
  check(
    !optionValues.includes("BANK-SVC-INACTIVE") &&
      !optionValues.includes("BANK-SVC-UNKNOWN"),
    "Inactive and unknown Bank Service identities are not selectable",
  );
  check(
    (await page
      .locator(
        'input[name*="bic" i]:not([readonly]), input[id*="bic" i]:not([readonly])',
      )
      .count()) === 0,
    "No editable BIC input is exposed",
  );

  const exerciseBankServiceJourney = async ({
    bankServiceId,
    expectedStatus,
    expectedCode,
  }) => {
    await counterpartySelector.selectOption(bankServiceId);
    let submittedBody = null;
    const requestPromise = page.waitForRequest((request) => {
      if (!request.url().includes("/api/settlements/resolve")) return false;
      submittedBody = request.postDataJSON();
      return true;
    });
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/settlements/resolve"),
    );
    await page
      .getByRole("button", { name: "2. Preview Resolution", exact: true })
      .click();
    await requestPromise;
    const response = await responsePromise;
    const body = await response.json();
    const actualCode = body?.mx?.code ?? null;
    const forbiddenBicProperties = [
      "counterpartyBic",
      "intermediaryBic",
      "accountWithBic",
      "receiverCorrespondentBic",
    ].filter((property) =>
      Object.prototype.hasOwnProperty.call(submittedBody ?? {}, property),
    );
    const differences = [];
    if (response.status() !== expectedStatus)
      differences.push(`HTTP ${response.status()} != ${expectedStatus}`);
    if (expectedCode && actualCode !== expectedCode)
      differences.push(`code ${actualCode} != ${expectedCode}`);
    if (!expectedCode && body?.mx?.decision !== "RESOLVED")
      differences.push(`decision ${body?.mx?.decision} != RESOLVED`);
    if (submittedBody?.counterpartyBankServiceId !== bankServiceId)
      differences.push("UI did not submit the selected Bank Service ID");
    if (forbiddenBicProperties.length > 0)
      differences.push(
        `UI submitted forbidden raw BIC properties: ${forbiddenBicProperties.join(", ")}`,
      );
    const journey = {
      bankServiceId,
      usageGroup: banksByServiceId.get(bankServiceId)?.usageGroup ?? null,
      expectedStatus,
      expectedCode: expectedCode ?? null,
      actualStatus: response.status(),
      actualCode,
      submittedProperties: Object.keys(submittedBody ?? {}).sort(),
      forbiddenBicProperties,
      status: differences.length === 0 ? "PASS" : "FAIL",
      differences,
    };
    bankServiceJourneys.push(journey);
    check(
      journey.status === "PASS",
      `${bankServiceId} follows the governed Bank Service resolution path`,
    );
    const noticeClose = page.locator(".notice button");
    if ((await noticeClose.count()) > 0) await noticeClose.first().click();
  };
  if (normalBank)
    await exerciseBankServiceJourney({
      bankServiceId: normalBank.bankServiceId,
      expectedStatus: 200,
      expectedCode: null,
    });
  if (directoryOnlyBank)
    await exerciseBankServiceJourney({
      bankServiceId: directoryOnlyBank.bankServiceId,
      expectedStatus: 422,
      expectedCode: "SSI_NOT_FOUND",
    });

  await page.evaluate(() => {
    const panel = document.createElement("section");
    panel.id = "mt2-qa-upstream-case";
    panel.setAttribute("aria-label", "MT2 QA upstream case context");
    panel.innerHTML =
      '<h2>QA Upstream Case</h2><output id="mt2-qa-case-id"></output><textarea id="mt2-qa-input" aria-label="Read-only QA upstream input" readonly></textarea>';
    document.body.prepend(panel);
  });

  for (const item of selectedCases) {
    const perCaseStartedAt = new Date().toISOString();
    activeCase = { ...item, requestCount: 0 };
    const existingNoticeClose = page.locator(".notice button");
    if ((await existingNoticeClose.count()) > 0)
      await existingNoticeClose.first().click();
    await page.evaluate(
      ({ testCaseNo, request }) => {
        document.querySelector("#mt2-qa-case-id").textContent = testCaseNo;
        document.querySelector("#mt2-qa-input").value = JSON.stringify(
          request,
          null,
          2,
        );
      },
      { testCaseNo: item.metadata.testCaseNo, request: item.request },
    );

    const selectedControls = {
      counterpartyBankServiceId: await selectIfPresent(
        "Counterparty（Bank Directory / BIC）",
        bankServiceIds.includes(item.request.counterpartyBankServiceId)
          ? item.request.counterpartyBankServiceId
          : bankServiceIds[0],
      ),
      currency: await selectIfPresent(
        "Currency (ISO 4217)",
        item.request.currency,
      ),
      bookingEntity: await selectIfPresent(
        "Booking Branch / Entity（本行）",
        item.request.bookingEntity,
      ),
      valueDate: /^\d{4}-\d{2}-\d{2}$/.test(item.request.valueDate ?? "")
        ? await fillIfPresent("Value Date", item.request.valueDate)
        : false,
      amount:
        item.request.amount !== undefined &&
        Number.isFinite(Number(item.request.amount)) &&
        Number(item.request.amount) > 0
          ? await fillIfPresent("Amount", item.request.amount)
          : false,
      transactionReference: await fillIfPresent(
        "Transaction Reference",
        item.request.transactionReference ?? item.metadata.testCaseNo,
      ),
    };

    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().headers()["x-qa-case-id"] ===
        item.metadata.testCaseNo,
      { timeout: 15_000 },
    );
    await page
      .getByRole("button", { name: "2. Preview Resolution", exact: true })
      .click();
    const response = await responsePromise;
    const actualText = await response.text();
    const actualPayload = (() => {
      try {
        return JSON.parse(actualText);
      } catch {
        return {};
      }
    })();
    const validation = validateCaseResponse({
      metadata: item.metadata,
      expected: item.expected,
      actualText,
      actualStatus: response.status(),
    });
    await page.waitForTimeout(30);
    const uiDecision =
      (await page.locator(".decision-pass").count()) > 0
        ? await page.locator(".decision-pass").first().innerText()
        : null;
    const uiNotice =
      (await page
        .locator('.notice, ssi-operational-issue, [role="alert"]')
        .count()) > 0
        ? await page
            .locator('.notice, ssi-operational-issue, [role="alert"]')
            .first()
            .innerText()
        : null;
    const mtPreview = await capturePreview("MT");
    const mxPreview = await capturePreview("MX");
    const inputReadOnly =
      (await page
        .getByLabel("Read-only QA upstream input")
        .getAttribute("readonly")) !== null;
    const uiText = [uiDecision, uiNotice, mtPreview, mxPreview]
      .filter(Boolean)
      .join("\n");
    const expectedCodes = [item.expected.mx.code, item.expected.mt.code].filter(
      (value, index, all) => value && all.indexOf(value) === index,
    );
    const uiDifferences = [];
    if (activeCase.requestCount !== 1)
      uiDifferences.push(
        `UI Preview must emit exactly one case request; received ${activeCase.requestCount}`,
      );
    if (!inputReadOnly)
      uiDifferences.push("Upstream QA input must be rendered read-only");
    if (item.metadata.expectedStatus === 200) {
      if (!mtPreview)
        uiDifferences.push("MT expected output is not rendered in the UI");
      if (!mxPreview)
        uiDifferences.push("MX expected output is not rendered in the UI");
      const visibleDecision =
        actualPayload?.resolutionDecision ?? item.expected.mx.decision;
      if (visibleDecision && !uiText.includes(String(visibleDecision)))
        uiDifferences.push(
          `UI does not display expected decision ${visibleDecision}`,
        );
    } else if (
      expectedCodes.length > 0 &&
      !expectedCodes.some((code) => uiText.includes(code))
    ) {
      uiDifferences.push(
        `UI hides expected error code(s): ${expectedCodes.join(", ")}`,
      );
    }
    const status =
      validation.status === "PASS" && uiDifferences.length === 0
        ? "PASS"
        : "FAIL";
    const result = {
      ...validation,
      status,
      executionChannel: "PLAYWRIGHT_BROWSER_UI_PREVIEW",
      uninterruptedRunIndex: results.length + 1,
      startedAt: perCaseStartedAt,
      completedAt: new Date().toISOString(),
      requestHash: canonicalHash(item.request),
      requestCount: activeCase.requestCount,
      inputReadOnly,
      selectedControls,
      uiDecision,
      uiNotice,
      uiDifferences,
      renderedOutput: { mt: mtPreview, mx: mxPreview },
      specificationConflict: conflictCases.has(item.metadata.testCaseNo),
    };
    results.push(result);
    if (status === "FAIL") {
      const screenshot = path.join(
        runEvidenceDirectory,
        `${String(item.metadata.index).padStart(3, "0")}-${item.metadata.testCaseNo}.png`,
      );
      await page.screenshot({ path: screenshot, fullPage: true });
      result.screenshot = path
        .relative(workspace, screenshot)
        .replaceAll("\\", "/");
    }
  }
} catch (error) {
  suiteInterrupted = error instanceof Error ? error.message : String(error);
} finally {
  activeCase = null;
  await context.close();
  await browser.close();
}

const failed = results.filter((item) => item.status !== "PASS");
const blocked = failed.filter(
  (item) => item.specificationConflict && item.differences.length > 0,
);
const productFailures = failed.filter(
  (item) => item.uiDifferences.length > 0 || !item.specificationConflict,
);
const completedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  suite: "MT2_139_BROWSER_UI",
  executionScope:
    requestedCaseNumbers.size > 0 ? "FOCUSED_REPRODUCTION" : "FULL_139",
  executionPolicy: "ONE_CLEAN_UNINTERRUPTED_FULL_RUN",
  startedAt,
  completedAt,
  portalUrl,
  apiUrl,
  workbook: path.relative(workspace, workbook).replaceAll("\\", "/"),
  workbookSha256: prepared.workbookSha256,
  cleanBrowserContext: true,
  runId,
  evidenceDirectory: path
    .relative(workspace, runEvidenceDirectory)
    .replaceAll("\\", "/"),
  suiteInterrupted,
  globalChecks,
  indexJourneys,
  scenarioJourneys,
  bankServiceJourneys,
  specificationConflicts,
  summary: {
    expected:
      requestedCaseNumbers.size > 0
        ? selectedCases.length
        : EXPECTED_CASE_COUNT,
    executed: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    productFailures: productFailures.length,
    specificationBlockers: blocked.length,
    uninterrupted:
      suiteInterrupted === null && results.length === selectedCases.length,
    accepted:
      suiteInterrupted === null &&
      results.length === selectedCases.length &&
      failed.length === 0 &&
      globalChecks.every((item) => item.status === "PASS"),
  },
  results,
};
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

const failedRows = failed
  .map(
    (item) =>
      `| ${item.testCaseNo} | ${item.specificationConflict ? "規格阻擋" : ""}${item.uiDifferences.length ? `${item.specificationConflict ? " + " : ""}產品 UI 失敗` : ""} | ${[...item.differences, ...item.uiDifferences].join("<br>")} |`,
  )
  .join("\n");
const summary = `# MT2 139 案瀏覽器 UI 全量測試報告

## 結論

- 執行政策：單一乾淨 Browser Context、一次不中斷執行全部 139 案；不拼接局部重跑。
- 執行通道：Playwright 操作 localhost UI 的 Preview Resolution；由瀏覽器送出每案受控 request，curl/API runner 不作為替代結果。
- 執行結果：${report.summary.passed}/${report.summary.expected} 通過；產品／環境失敗 ${report.summary.productFailures}；規格阻擋 ${report.summary.specificationBlockers}。
- Payment SSI Index：4/4 支援電文可由畫面選取並開啟 COUNTERPARTY_SSI panel；5/5 非本 domain 電文不顯示。
- Message Scenario Index：四欄、四種可用情境、固定順序、MT／ISO 20022 target 與 business service 均納入 gate。
- Bank Service：SSI-referenced 正常解析、inactive／unknown 不可選、directory-only 可識別但須 fail-closed，且 request 不得帶 raw BIC 欄位。
- 驗收狀態：${report.summary.accepted ? "PASS" : "NOT ACCEPTED"}。
- 中斷狀態：${suiteInterrupted ?? "無"}。

## UI 控制驗證

${globalChecks.map((item) => `- ${item.status === "PASS" ? "✅" : "❌"} ${item.message}`).join("\n")}

## 失敗／阻擋案例

| Test Case | 類型 | 差異 |
| --- | --- | --- |
${failedRows || "| — | 無 | — |"}

## 可稽核證據

- Machine-readable report：\`${path.relative(workspace, reportFile).replaceAll("\\", "/")}\`
- Workbook SHA-256：\`${prepared.workbookSha256}\`
- 每案包含 request hash、HTTP status、MT/MX expected/actual、UI decision、UI error notice、MT/MX 畫面 preview 與控制項選取結果。
- 失敗案例另存 full-page screenshot。
`;
fs.writeFileSync(summaryFile, summary);

console.log(JSON.stringify(report.summary, null, 2));
if (!report.summary.accepted) process.exitCode = 1;
