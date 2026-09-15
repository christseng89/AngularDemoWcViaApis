import { chromium } from "@playwright/test";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitForClearingValues = async (page, expected) => {
  await page.waitForFunction((codes) => {
    const select = [...document.querySelectorAll("select")].find((element) =>
      element.labels?.[0]?.textContent?.includes("Clearing System"),
    );
    if (!select) return false;
    const actual = [...select.options]
      .map((option) => option.value)
      .filter(Boolean);
    return (
      actual.length === codes.length && codes.every((code) => actual.includes(code))
    );
  }, expected);
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
try {
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  await page.goto(process.env.PORTAL_URL ?? "http://localhost:4400/", {
    waitUntil: "networkidle",
  });
  const activeEntities = await fetch(
    "http://localhost:3100/api/booking-branch-entities",
  )
    .then((response) => response.json())
    .then((records) => records.filter((record) => record.status === "ACTIVE"));
  assert(
    activeEntities.length === 10 &&
      ["TW01", "ZA01", "AE01", "DE01", "CN01", "KR01"].every((code) =>
        activeEntities.some((entity) => entity.branchCode === code),
      ),
    "The governed entity seed must expose exactly 10 Active booking branches",
  );
  const clearingCatalogue = await fetch(
    "http://localhost:3100/api/reference/clearing-systems?currency=EUR&settlementCountry=DE",
  )
    .then((response) => response.json())
    .then((response) => response.items.map((item) => item.code));
  assert(
    ["T2", "EURO1", "STEP2_SCT", "TIPS", "RT1", "RPS_SEPA"].every(
      (code) => clearingCatalogue.includes(code),
    ),
    "Standing Data must retain the full EUR/DE clearing capability catalogue",
  );
  await page
    .getByRole("button", { name: "SSI Resolution", exact: true })
    .click();
  const consumer = page.getByLabel("Consumer"),
    businessFunction = page.getByLabel("Business Function"),
    currency = page.getByLabel("Currency (ISO 4217)"),
    country = page.getByLabel(
      "Settlement Country（advanced optional override）",
    ),
    clearing = page.getByLabel("Clearing System（advanced optional override）"),
    counterparty = page.getByLabel("Counterparty（Bank Directory / BIC）");
  const optionValues = (locator) =>
    locator
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));
  assert(
    JSON.stringify(await optionValues(consumer)) ===
      JSON.stringify(["TRADE_FINANCE", "TREASURY", "CENTRAL_PAYMENT"]),
    "Consumer must remain the three business-system consumers",
  );
  const tradeFinanceFunctions = [
    "IMPORT_LC_BANK_REIMBURSEMENT",
    "EXPORT_LC_PROCEEDS_SETTLEMENT",
    "IMPORT_COLLECTION_PAYMENT",
    "EXPORT_COLLECTION_PROCEEDS_SETTLEMENT",
    "LC_REIMBURSEMENT_SETTLEMENT",
    "STANDBY_LC_CLAIM_PAYMENT",
    "DEMAND_GUARANTEE_CLAIM_PAYMENT",
  ];
  assert(
    JSON.stringify((await optionValues(businessFunction)).sort()) ===
      JSON.stringify([...tradeFinanceFunctions].sort()),
    "Trade Finance must expose only its seven payment-triggering functions",
  );
  const groupLabels = await businessFunction
    .locator("optgroup")
    .evaluateAll((groups) => groups.map((group) => group.label));
  assert(
    groupLabels.every((label) => label.includes(" / ")) &&
      groupLabels.some((label) => label.startsWith("IMPORT /")),
    "Business Function options must retain Category / Module grouping",
  );
  assert(
    (await page.getByRole("button", { name: "選擇…", exact: true }).count()) ===
      0 &&
      (await page.locator('[aria-labelledby="function-picker-title"]').count()) ===
        0,
    "The legacy Business Function picker button and dialog must be absent",
  );
  const treasuryRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/resolve/clearing-options") &&
      request.method() === "POST" &&
      request.postDataJSON()?.consumer === "TREASURY",
  );
  await consumer.selectOption("TREASURY");
  const treasuryPayload = (await treasuryRequest).postDataJSON();
  assert(
    (await businessFunction.inputValue()) === "FX_SETTLEMENT" &&
      JSON.stringify((await optionValues(businessFunction)).sort()) ===
        JSON.stringify(["FX_SETTLEMENT", "MONEY_MARKET_SETTLEMENT"].sort()) &&
      treasuryPayload.businessFunction === "FX_SETTLEMENT" &&
      treasuryPayload.product === "TREASURY_FX" &&
      treasuryPayload.paymentLeg === "INTERBANK_SETTLEMENT" &&
      treasuryPayload.messageType === "pacs.009.001.12",
    "Treasury switch must select and synchronize its first valid function",
  );
  const paymentRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/resolve/clearing-options") &&
      request.method() === "POST" &&
      request.postDataJSON()?.consumer === "CENTRAL_PAYMENT",
  );
  await consumer.selectOption("CENTRAL_PAYMENT");
  const paymentPayload = (await paymentRequest).postDataJSON();
  assert(
    JSON.stringify(await optionValues(businessFunction)) ===
      JSON.stringify(["CUSTOMER_CREDIT_TRANSFER"]) &&
      paymentPayload.businessFunction === "CUSTOMER_CREDIT_TRANSFER" &&
      paymentPayload.product === "CENTRAL_PAYMENT" &&
      paymentPayload.paymentLeg === "CUSTOMER_TRANSFER" &&
      paymentPayload.messageType === "pacs.008.001.12",
    "Central Payment switch must synchronize product, leg, and message type",
  );
  const tradeFinanceRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/resolve/clearing-options") &&
      request.method() === "POST" &&
      request.postDataJSON()?.consumer === "TRADE_FINANCE",
  );
  await consumer.selectOption("TRADE_FINANCE");
  const tradeFinancePayload = (await tradeFinanceRequest).postDataJSON();
  assert(
    (await businessFunction.inputValue()) ===
      "IMPORT_LC_BANK_REIMBURSEMENT" &&
      tradeFinancePayload.product === "IMPORT_LC" &&
      tradeFinancePayload.paymentLeg === "BANK_REIMBURSEMENT" &&
      tradeFinancePayload.messageType === "pacs.009.001.12",
    "Returning to Trade Finance must restore a valid synchronized function",
  );
  await counterparty.selectOption("CITIUS33");
  await currency.selectOption("USD");
  await waitForClearingValues(page, ["USD_CHATS", "FEDWIRE"]);
  let values = await clearing
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert(
    ["USD_CHATS", "FEDWIRE"].every((code) => values.includes(code)) &&
      !values.includes("CHIPS") &&
      !values.includes("T2") &&
      !values.some((code) => code.startsWith("FPS_")),
    "USD clearing dependency is incorrect",
  );
  await country.selectOption("HK");
  await waitForClearingValues(page, ["USD_CHATS"]);
  values = await clearing
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert(
    values.filter(Boolean).length === 1 && values.includes("USD_CHATS"),
    "HK override must retain only the HK USD rail",
  );
  await clearing.selectOption("USD_CHATS");
  await page
    .getByRole("button", { name: "2. Preview Resolution", exact: true })
    .click();
  await page.locator(".decision-pass").waitFor();
  assert(
    (await page.locator(".decision-pass").innerText()).match(
      /RESOLVED|MULTIPLE_CANDIDATES/,
    ),
    "HK USD CHATS route must resolve",
  );
  await country.selectOption("");
  await currency.selectOption("EUR");
  await counterparty.selectOption("DEUTDEFF");
  await country.selectOption("DE");
  await waitForClearingValues(page, ["T2", "EURO1"]);
  values = await clearing
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert(
    values.filter(Boolean).length === 2 &&
      ["T2", "EURO1"].every((code) => values.includes(code)) &&
      !values.includes("EUR_CHATS") &&
      !values.includes("STEP2_SCT") &&
      !values.includes("TIPS") &&
      !values.includes("RT1") &&
      !values.includes("RPS_SEPA") &&
      !values.includes("TARGET") &&
      !values.includes("TARGET2") &&
      !(await clearing.innerText()).includes("TARGET2"),
    "EUR + DE must expose only SSI-backed T2 and EURO1 using current names",
  );
  await country.selectOption("HK");
  await waitForClearingValues(page, ["EUR_CHATS"]);
  values = await clearing
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert(
    values.includes("EUR_CHATS") && !values.includes("T2"),
    "EUR + HK must expose EUR_CHATS without pan-European rails",
  );
  await country.selectOption("");
  await currency.selectOption("HKD");
  await waitForClearingValues(page, ["HKD_CHATS"]);
  values = await clearing
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert(
    values.includes("HKD_CHATS") &&
      !values.includes("FPS_HKD") &&
      !values.includes("FPS_RMB"),
    "HKD FPS dependency is incorrect",
  );
  await currency.selectOption("CNY");
  await waitForClearingValues(page, ["CIPS"]);
  values = await clearing
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert(
    values.includes("CIPS") &&
      !values.includes("RMB_CHATS") &&
      !values.includes("FPS_RMB") &&
      !values.includes("FPS_HKD"),
    "RMB FPS dependency is incorrect",
  );
  await counterparty.selectOption("BARCGB22");
  await currency.selectOption("GBP");
  await country.selectOption("GB");
  await waitForClearingValues(page, ["CHAPS"]);
  values = await clearing
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert(
    values.filter(Boolean).length === 1 && values.includes("CHAPS"),
    "GBP + GB must expose only the eligible SSI-backed CHAPS channel",
  );
  await page
    .getByRole("button", { name: "SWIFT Data Service", exact: true })
    .click();
  await page.getByRole("button", { name: "SSI", exact: true }).click();
  await page.locator(".table-scroll").waitFor();
  assert(
    (await page.getByRole("columnheader", { name: "Scope", exact: true }).count()) ===
      0,
    "SSI Index must not expose the legacy Scope column",
  );
  assert(
    (await page.getByRole("button", { name: "檢視", exact: true }).count()) ===
      0,
    "Index must not expose View buttons",
  );
  await page.locator(".sort-heading").first().click();
  const ssiRow = page.locator("tbody .data-row", { hasText: "SSI-DEMO-006" });
  const idCell = ssiRow.locator('td[data-column="route.ssiCode"]');
  assert(
    (await idCell.evaluate((cell) => getComputedStyle(cell).whiteSpace)) ===
      "nowrap",
    "SSI identifier must stay on one line",
  );
  const scroll = page.locator(".table-scroll");
  const dimensions = await scroll.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  assert(
    dimensions.scroll > dimensions.client,
    "Narrow viewport must retain horizontal table scrolling",
  );
  await ssiRow.dblclick();
  await page.getByRole("heading", { name: "檢視 SSI", exact: true }).waitFor();
  assert(
    (await page
      .getByText("Related RTGS / Clearing System", { exact: true })
      .count()) > 0,
    "SSI detail must show Related RTGS/Clearing",
  );
  await page
    .getByText("完整欄位、適用性與治理證據", { exact: true })
    .click();
  assert(
    (await page.getByText("SSI Scope", { exact: true }).count()) > 0 &&
      (await page.getByText("STANDING", { exact: true }).count()) > 0,
    "SSI Detail must retain the governed Scope field and value",
  );
  await page
    .getByRole("button", { name: "取消 / Cancel", exact: true })
    .click();
  await ssiRow.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "檢視 SSI", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "取消 / Cancel", exact: true })
    .click();
  for (const tab of ["RMA Authorisation", "Nostro Account", "Entities"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const row = page.locator("tbody .data-row").first();
    await row.focus();
    await page.keyboard.press(" ");
    await page
      .getByRole("heading", { name: `檢視 ${tab}`, exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "取消 / Cancel", exact: true })
      .click();
    const revoke = page
      .locator("tbody .data-row")
      .first()
      .getByRole("button", { name: "撤銷", exact: true });
    if (await revoke.count()) {
      await revoke.click();
      await page.locator(".delete-dialog").waitFor();
      await page
        .locator(".delete-dialog")
        .getByRole("button", { name: "取消", exact: true })
        .click();
    }
  }
  const noticePage = await browser.newPage();
  await noticePage.route("**/api/reference/currencies", (route) =>
    route.abort(),
  );
  await noticePage.goto(process.env.PORTAL_URL ?? "http://localhost:4400/", {
    waitUntil: "networkidle",
  });
  const notice = noticePage.locator(".notice.warning").first();
  await notice.waitFor();
  await noticePage.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  const colours = await notice.evaluate((element) => ({
    color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
    button: getComputedStyle(element.querySelector("button")).color,
  }));
  assert(
    colours.color !== colours.background && colours.button === colours.color,
    "Dark notice and close button must use explicit contrasting colours",
  );
  console.log(
    JSON.stringify(
      {
        clearingUi: "PASS",
        eligibleUsd: ["USD_CHATS", "FEDWIRE"],
        eligibleEurDe: ["T2", "EURO1"],
        eligibleGbpGb: ["CHAPS"],
        consumerFunctions: {
          TRADE_FINANCE: tradeFinanceFunctions,
          TREASURY: ["FX_SETTLEMENT", "MONEY_MARKET_SETTLEMENT"],
          CENTRAL_PAYMENT: ["CUSTOMER_CREDIT_TRANSFER"],
        },
        standingDataEurDe: clearingCatalogue,
        ssiNoWrap: true,
        horizontalScroll: dimensions,
        keyboardAndDoubleClick: ["SSI", "RMA", "Nostro", "Entities"],
        activeEntities: activeEntities.length,
        darkNotice: colours,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
