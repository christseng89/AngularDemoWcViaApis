import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync("qa/mt2/mt2-final/ui-journeys.json", "utf8"),
);
const portalUrl = process.env.PORTAL_URL ?? config.portalUrl;
const browserPath =
  process.env.PLAYWRIGHT_BROWSER_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executePattern = "/resolution-page-definitions/execute";
const receiverLookupPattern = "/lookups/own-account-receivers";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const fetchJson = async (page, path) =>
  page.evaluate(async (url) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(`${url}: HTTP ${response.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }, path);

const paymentScenarios = (index) =>
  index.items.flatMap((item) =>
    item.scenarioDetails.map((scenario) => ({
      ...scenario,
      messageType: item.messageCode,
      scenarioCount: item.scenarioCount,
      executable: item.executable && scenario.executable,
    })),
  );

const openPaymentIndex = async (page) => {
  await page
    .getByRole("button", { name: config.entryButton, exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Search Payment Message Index" })
    .waitFor();
};

const openScenario = async (page, scenario) => {
  const search = page.getByLabel("Search payment message index");
  await search.fill(scenario.messageType);
  const messageGroup = page.getByLabel(
    `Open ${scenario.messageType} scenarios`,
  );
  await messageGroup.waitFor();
  await messageGroup.click();
  if (scenario.scenarioCount > 1) {
    const drawer = page.getByRole("dialog", { name: "Select a scenario" });
    await drawer.waitFor();
    const audience =
      scenario.audience === "QA_TEST_ONLY" ? "QA / test only" : "Operational";
    await drawer.getByRole("tab", { name: audience }).click();
    await drawer.getByLabel("Search scenarios").fill(scenario.label);
    const scenarioLink = drawer.getByRole("link", {
      name: `Open ${scenario.label}`,
    });
    await scenarioLink.waitFor();
    await scenarioLink.click();
  }
  await page.locator("ssi-generic-parameter-form form").waitFor();
};

const assertCurrentControls = async (page, scenarioId) => {
  const form = page.locator("ssi-generic-parameter-form form");
  const fields = form.locator(".parameter-field");
  assert((await fields.count()) > 0, `${scenarioId}: no parameter controls`);
  const unlabeled = await fields.evaluateAll((elements) =>
    elements
      .filter(
        (element) =>
          !element.querySelector("label, legend") &&
          !element.querySelector('input[type="hidden"]'),
      )
      .map((element) => element.textContent?.trim() ?? ""),
  );
  assert(
    unlabeled.length === 0,
    `${scenarioId}: unlabeled controls: ${unlabeled.join(", ")}`,
  );
  const bankLookups = form.locator("ssi-bank-service-lookup");
  assert(
    (await bankLookups.count()) > 0,
    `${scenarioId}: current Bank Service control is absent`,
  );
  for (let index = 0; index < (await bankLookups.count()); index += 1) {
    const lookup = bankLookups.nth(index);
    const hidden = lookup.locator("xpath=..").locator('input[type="hidden"]');
    assert(
      (await hidden.count()) === 1,
      `${scenarioId}: Bank Service stable identity control is absent`,
    );
    const selected = lookup.locator(".lookup-selection strong");
    if (await selected.count())
      assert(
        Boolean((await selected.innerText()).trim()),
        `${scenarioId}: selected Bank Service BIC is blank`,
      );
  }
  assert(
    (await form
      .locator(
        'input[name*="bic" i]:not([readonly]), input[id*="bic" i]:not([readonly])',
      )
      .count()) === 0,
    `${scenarioId}: manual BIC input is exposed`,
  );
  return bankLookups.count();
};

const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(portalUrl, { waitUntil: "networkidle" });
  await openPaymentIndex(page);
  const index = await fetchJson(
    page,
    "/api/v1/resolution-page-definitions/index?businessDomain=PAYMENT",
  );
  const scenarios = paymentScenarios(index);
  for (const messageType of config.messageTypes)
    assert(
      scenarios.some((scenario) => scenario.messageType === messageType),
      `${messageType} missing from Payment Message Index`,
    );

  let bankRoleControls = 0;
  let executionEvidence = null;
  for (const journey of config.scenarioJourneys) {
    const scenario = scenarios.find(
      (candidate) => candidate.scenarioId === journey.code,
    );
    assert(scenario, `${journey.code} missing from parameter-driven index`);
    assert(scenario.executable, `${journey.code} is not executable`);
    await openScenario(page, scenario);
    bankRoleControls += await assertCurrentControls(page, scenario.scenarioId);

    if (!executionEvidence) {
      const resolve = page.getByRole("button", {
        name: "Resolve SSI",
        exact: true,
      });
      await resolve.waitFor();
      await resolve.click({ trial: true, timeout: 15_000 });
      assert(!(await resolve.isDisabled()), `${journey.code}: Resolve SSI disabled`);
      const [request] = await Promise.all([
        page.waitForRequest(
          (candidate) =>
            candidate.url().includes(executePattern) &&
            candidate.method() === "POST",
        ),
        resolve.click(),
      ]);
      const payload = request.postDataJSON();
      assert(
        payload.scenarioId === scenario.scenarioId,
        "execution request scenario identity mismatch",
      );
      assert(
        payload.values && typeof payload.values === "object",
        "execution request must submit parameter values",
      );
      executionEvidence = {
        scenarioId: payload.scenarioId,
        valueCount: Object.keys(payload.values).length,
      };
    }

    const back = page.getByRole("button", { name: "Back to transaction index" });
    await back.click();
    await page
      .getByRole("heading", { name: "Search Payment Message Index" })
      .waitFor();
  }

  const failurePage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  let executionRequests = 0;
  failurePage.on("request", (request) => {
    if (request.url().includes(executePattern)) executionRequests += 1;
  });
  await failurePage.route(`**${receiverLookupPattern}**`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "BANK_SERVICE_LOOKUP_UNAVAILABLE" }),
    }),
  );
  await failurePage.goto(portalUrl, { waitUntil: "networkidle" });
  await openPaymentIndex(failurePage);
  const representativeScenarioId = config.scenarioJourneys[0]?.code;
  const representative = scenarios.find(
    (scenario) =>
      scenario.scenarioId === representativeScenarioId &&
      scenario.audience === "OPERATIONAL" &&
      scenario.executable,
  );
  assert(
    representative,
    `representative ${representativeScenarioId ?? "MT202"} scenario is absent`,
  );
  await openScenario(failurePage, representative);
  await failurePage
    .getByText("Bank Service lookup is unavailable.", { exact: true })
    .first()
    .waitFor({ timeout: 15_000 });
  const failedResolve = failurePage.getByRole("button", {
    name: "Resolve SSI",
    exact: true,
  });
  assert(await failedResolve.isDisabled(), "Resolve remains enabled after lookup failure");
  assert(executionRequests === 0, "execution request emitted after lookup failure");
  await failurePage.close();

  console.log(
    JSON.stringify({
      suite: "mt2-final-ui",
      status: "PASS",
      messageTypes: config.messageTypes.length,
      scenarioCodes: config.scenarioJourneys.length,
      bankRoleControls,
      executionEvidence,
      bankServiceFailureClosed: true,
    }),
  );
} finally {
  await browser.close();
}
