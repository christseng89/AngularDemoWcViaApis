import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const portalUrl = process.env.PORTAL_URL ?? "http://localhost:4600/";
const browserPath =
  process.env.PLAYWRIGHT_BROWSER_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const outputDirectory = process.env.UAT_OUTPUT_DIR ?? "qa/mt347/reports/latest";
const domainFilter = process.env.UAT_DOMAIN;
const scenarioFilter = process.env.UAT_SCENARIO;
const scenarioFilters = process.env.UAT_SCENARIOS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const polarityFilter = process.env.UAT_POLARITY;
const scenarioLimit = Number(process.env.UAT_SCENARIO_LIMIT ?? "0");
const counterpartyLimit = Number(process.env.UAT_COUNTERPARTY_LIMIT ?? "3");
const shardTotal = Number(process.env.UAT_SHARD_TOTAL ?? "1");
const shardIndex = Number(process.env.UAT_SHARD_INDEX ?? "0");
if (
  !Number.isInteger(shardTotal) ||
  shardTotal < 1 ||
  !Number.isInteger(shardIndex) ||
  shardIndex < 0 ||
  shardIndex >= shardTotal
)
  throw new Error(`Invalid UAT shard ${shardIndex}/${shardTotal}`);
const currencyFieldSelector = "#parameter-context-currency";
const counterpartyLookupSelector =
  "#parameter-context-counterpartyBankServiceId + ssi-bank-service-lookup";
const positiveFixturePath = "qa/mt347/fixtures/mt347-positive.v1.json";
const positiveFixtureText = await readFile(positiveFixturePath, "utf8");
const positiveFixture = JSON.parse(positiveFixtureText);
const positiveFixtureSha256 = createHash("sha256")
  .update(positiveFixtureText)
  .digest("hex")
  .toUpperCase();
const identityOraclePath =
  "qa/mt347/fixtures/mt347-executable-counterparties.v4.json";
const identityOracleText = await readFile(identityOraclePath, "utf8");
const expandedPositiveFixture = JSON.parse(identityOracleText);
const identityOracleSha256 = createHash("sha256")
  .update(identityOracleText)
  .digest("hex")
  .toUpperCase();
const positiveOracleByCase = new Map(
  positiveFixture.records.map((record) => [record.testCaseId, record]),
);
const negativeFixturePath = "qa/mt347/fixtures/mt347-negative.v1.json";
const negativeFixtureText = await readFile(negativeFixturePath, "utf8");
const negativeFixture = JSON.parse(negativeFixtureText);
const negativeFixtureSha256 = createHash("sha256")
  .update(negativeFixtureText)
  .digest("hex")
  .toUpperCase();
const negativeOracleByCase = new Map(
  negativeFixture.records.map((record) => [record.testCaseId, record]),
);
const expandedOracleByCell = new Map(
  expandedPositiveFixture.records.map((record) => [
    `${record.testCaseId}:${record.currency}:${record.counterpartyBankServiceId}`,
    record,
  ]),
);
const configuredCurrencies = process.env.TREASURY_CURRENCIES?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const scenarioRows = (index) => {
  const seen = new Set();
  const rows = [];
  for (const item of index.items) {
    for (const scenario of item.scenarioDetails) {
      if (!item.executable || !scenario.executable) continue;
      const key = `${item.businessDomain}:${scenario.scenarioId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        businessDomain: item.businessDomain,
        messageType: item.messageCode,
        scenarioId: scenario.scenarioId,
        scenarioLabel: scenario.label,
        scenarioCount: item.scenarioCount,
        polarity: scenario.polarity,
        audience: scenario.audience,
        sequence: scenario.sequence,
        definitionId: item.definitionId,
        definitionVersion: item.definitionVersion,
        contractSha256: item.contractSha256,
        query: item.query,
      });
    }
  }
  return rows;
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

const loadIndex = (page, businessDomain) =>
  fetchJson(
    page,
    `/api/v1/resolution-page-definitions/index?businessDomain=${businessDomain}`,
  );

const definitionPath = (query) => {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  return `/api/v1/resolution-page-definitions?${parameters}`;
};

const visibleScenarioFields = (contract, selectedScenario) => {
  const policies = new Map(
    (selectedScenario.fieldPolicies ?? []).map((policy) => [
      policy.fieldId,
      policy,
    ]),
  );
  const presentationOrder = contract.fields
    .filter((field) => selectedScenario.fieldIds.includes(field.fieldId))
    .map((field, sourceIndex) => ({ ...field, sourceIndex }))
    .sort(
      (left, right) =>
        (left.displayOrder ?? 0) - (right.displayOrder ?? 0) ||
        left.sourceIndex - right.sourceIndex,
    );
  const pending = [...presentationOrder];
  const ordered = [];
  const includedIds = new Set(presentationOrder.map(({ fieldId }) => fieldId));
  while (pending.length > 0) {
    const nextIndex = pending.findIndex((field) => {
      const dependencies = [
        ...(field.optionSource?.dependsOnFieldIds ?? []),
        ...(field.lookup?.dependency?.dependsOnFieldIds ?? []),
      ].filter((fieldId) => includedIds.has(fieldId));
      return dependencies.every((fieldId) =>
        ordered.some((candidate) => candidate.fieldId === fieldId),
      );
    });
    if (nextIndex < 0) {
      ordered.push(...pending);
      break;
    }
    ordered.push(pending.splice(nextIndex, 1)[0]);
  }
  return ordered
    .filter((field) => {
      const policy = policies.get(field.fieldId);
      if (
        policy &&
        (policy.applicability !== "APPLICABLE" ||
          policy.inputOwnership !== "TRANSACTION_USER" ||
          policy.visibility !== "USER_INPUT" ||
          policy.processingPolicy !== "APPLY")
      )
        return false;
      return (policy?.visibility ?? field.visibility) === "USER_INPUT";
    })
    .map((field, sourceIndex) => ({
      ...field,
      required: policies.get(field.fieldId)?.required ?? field.required,
      sourceIndex,
    }));
};

const assertPageContract = async (page, scenario) => {
  const envelope = await fetchJson(page, definitionPath(scenario.query));
  assert(
    envelope.contractSha256 === scenario.contractSha256,
    "index/definition SHA mismatch",
  );
  assert(
    envelope.contract.definitionId === scenario.definitionId,
    "loaded definitionId mismatch",
  );
  assert(
    envelope.contract.definitionVersion === scenario.definitionVersion,
    "loaded definitionVersion mismatch",
  );
  const selectedScenario = envelope.contract.scenarios.find(
    ({ scenarioId }) => scenarioId === scenario.scenarioId,
  );
  assert(
    selectedScenario,
    `selected scenario ${scenario.scenarioId} is absent from contract`,
  );
  const expectedFields = visibleScenarioFields(
    envelope.contract,
    selectedScenario,
  );
  const rendered = await page
    .locator(".parameter-field")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const control = element.querySelector("input[id], select[id]");
        const label = element.querySelector("label, legend")?.textContent ?? "";
        return {
          inputId: control?.id ?? "",
          label: label.replaceAll("*", "").replaceAll(/\s+/g, " ").trim(),
          required: element.querySelector(".required") !== null,
        };
      }),
    );
  const expectedInputIds = expectedFields.map(
    ({ fieldId }) => `parameter-${fieldId.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`,
  );
  assert(
    JSON.stringify(rendered.map(({ inputId }) => inputId)) ===
      JSON.stringify(expectedInputIds),
    `input order/visibility mismatch: expected ${expectedInputIds.join(",")}; actual ${rendered.map(({ inputId }) => inputId).join(",")}`,
  );
  expectedFields.forEach((field, index) => {
    const tagAndOption = `${field.swiftTag ?? ""}${field.swiftOption ?? ""}`;
    const expectedLabel = tagAndOption
      ? `SWIFT ${tagAndOption} • ${field.label}`
      : field.label;
    assert(
      rendered[index].label === expectedLabel,
      `${field.fieldId}: human label mismatch; expected=${JSON.stringify(expectedLabel)} actual=${JSON.stringify(rendered[index].label)}`,
    );
    assert(
      rendered[index].required === field.required,
      `${field.fieldId}: required marker mismatch`,
    );
    assert(
      !/bankServiceId|^tag[._]/i.test(field.label),
      `${field.fieldId}: internal identifier exposed as label`,
    );
    if (field.dataType === "SWIFT_BIC")
      assert(
        field.lookup &&
          field.lookup.provider === field.lookup.action &&
          ["SSI_COUNTERPARTY", "BANK_SERVICE"].includes(
            field.lookup.provider,
          ) &&
          field.lookup.endpoint.startsWith("/api/") &&
          field.lookup?.valueField === "bankServiceId" &&
          field.lookup?.displayField === "bic",
        `${field.fieldId}: Bank Service lookup semantics mismatch`,
      );
  });
  const summary = await page.locator(".definition-summary").innerText();
  assert(
    summary.includes(envelope.contract.display.familyLabel),
    "family label is absent",
  );
  assert(
    summary.includes(envelope.contract.messageType),
    "message label is absent",
  );
  const audit = page.locator("details.workbench-audit");
  await audit.locator("summary").click();
  assert(
    (await audit.innerText()).includes(envelope.contractSha256),
    "contract SHA absent in UI audit",
  );
  return {
    contractSha256: envelope.contractSha256,
    polarity: selectedScenario.polarity,
    visibleFieldIds: expectedFields.map(({ fieldId }) => fieldId),
    requiredFieldIds: expectedFields
      .filter(({ required }) => required)
      .map(({ fieldId }) => fieldId),
  };
};

const openDomain = async (page, businessDomain) => {
  const domainLabel =
    businessDomain === "TREASURY" ? "Treasury" : "Trade finance";
  await page
    .locator("button:visible", { hasText: `${domainLabel} SSI Resolution` })
    .first()
    .click();
  await page
    .getByRole("heading", { name: `Search ${domainLabel} Message Index` })
    .waitFor();
};

const openScenario = async (page, scenario) => {
  const domainLabel =
    scenario.businessDomain === "TREASURY" ? "Treasury" : "Trade finance";
  const search = page.getByLabel(
    `Search ${domainLabel.toLowerCase()} message index`,
  );
  await search.fill(scenario.messageType);
  const group = page.getByLabel(`Open ${scenario.messageType} scenarios`);
  await group.waitFor();
  await group.click();

  if (scenario.scenarioCount > 1) {
    const drawer = page.getByRole("dialog", { name: "Select a scenario" });
    await drawer.waitFor();
    const audienceLabel =
      scenario.audience === "QA_TEST_ONLY" ? "QA / test only" : "Operational";
    await drawer.getByRole("tab", { name: audienceLabel }).click();
    const drawerSearch = drawer.getByLabel("Search scenarios");
    await drawerSearch.fill(scenario.scenarioLabel);
    const scenarioLink = drawer.getByRole("link", {
      name: `Open ${scenario.scenarioLabel}`,
    });
    await scenarioLink.waitFor();
    await scenarioLink.click();
  }
  await page.locator("ssi-generic-parameter-form form").waitFor();
};

const assertNoPageHorizontalScroll = async (page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `page horizontal overflow ${dimensions.scrollWidth} > ${dimensions.clientWidth}`,
  );
  return dimensions;
};

const assertRequiredLabels = async (page) => {
  const problems = await page
    .locator("ssi-generic-parameter-form")
    .evaluate((root) => {
      const issues = [];
      for (const marker of root.querySelectorAll(".required")) {
        const label = marker.closest("label, legend");
        if (!label?.textContent?.trim())
          issues.push("required marker without label");
      }
      for (const input of root.querySelectorAll(
        "input:not([type=hidden]), select",
      )) {
        const id = input.getAttribute("id");
        if (!id) {
          issues.push("visible field without id");
          continue;
        }
        if (
          !root.querySelector(`label[for="${CSS.escape(id)}"]`) &&
          !input.closest("fieldset")
        )
          issues.push(`${id}: no label or fieldset legend`);
      }
      return issues;
    });
  assert(problems.length === 0, `field labels: ${problems.join("; ")}`);
};

const waitForLookup = (page, currency) =>
  page.waitForResponse(
    (response) => {
      if (!response.url().includes("/lookups/ssi-counterparties")) return false;
      const url = new URL(response.url());
      return (
        url.searchParams.get("currency") === currency &&
        !url.searchParams.has("query")
      );
    },
    { timeout: 15_000 },
  );

const selectLookupRow = async (dialog, bankServiceId, lookup) => {
  const item = lookup.items.find(
    (candidate) => candidate.bankServiceId === bankServiceId,
  );
  assert(item, `lookup item ${bankServiceId} is absent`);
  const row = dialog.locator("tbody tr", { hasText: item.bic });
  await row.getByRole("button", { name: "Select", exact: true }).click();
  return item;
};

const assertPositiveOracle = (scenario, currency, counterparty, result) => {
  const baseOracle = positiveOracleByCase.get(scenario.scenarioId);
  assert(baseOracle, `${scenario.scenarioId}: positive TDD oracle is absent`);
  const expandedOracle = expandedOracleByCell.get(
    `${scenario.scenarioId}:${currency}:${counterparty.bankServiceId}`,
  );
  const roleValues = expandedOracle?.roleValues ?? baseOracle.ssiRoleValues;
  const expectedResolvedKeys = [
    ...new Set([
      ...Object.keys(baseOracle.expectedTags),
      ...(baseOracle.expectedPresentTags ?? []),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  const explicitlyQualifiedKeys = [
    baseOracle.inputContract,
    baseOracle.expectedOutput,
  ]
    .flatMap((text) => text.match(/\b[A-Z0-9]+\.\d{2}[A-Z]\b/g) ?? [])
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));
  const actualResolvedKeys = result.fields
    .filter(({ resolutionStatus }) => resolutionStatus === "RESOLVED")
    .map(
      ({ sequenceId, swiftTag, swiftOption }) =>
        `${sequenceId}.${swiftTag}${swiftOption}`,
    )
    .sort();
  if (expectedResolvedKeys.length > 0 || Object.keys(roleValues).length === 0)
    assert(
      JSON.stringify(actualResolvedKeys) ===
        JSON.stringify(expectedResolvedKeys),
      `TDD tag/option oracle mismatch: expected ${expectedResolvedKeys.join(",")}; actual ${actualResolvedKeys.join(",")}`,
    );
  else
    for (const key of explicitlyQualifiedKeys)
      assert(
        actualResolvedKeys.includes(key),
        `TDD explicitly required tag/option ${key} is absent`,
      );
  for (const [role, expectedBic] of Object.entries(roleValues)) {
    const field = result.fields.find(
      (candidate) =>
        candidate.role === role && candidate.resolutionStatus === "RESOLVED",
    );
    assert(field, `TDD role ${role} is absent from resolved fields`);
    assert(
      field.institution?.bic === expectedBic ||
        field.value?.includes(expectedBic),
      `${role}: expected BIC ${expectedBic}, got ${field.institution?.bic ?? field.value ?? "absent"}`,
    );
  }
  if (expandedOracle) {
    assert(
      result.evidence.selectedSsi?.id === expandedOracle.identity.ssi.id,
      "selected SSI identity differs from independent fixture oracle",
    );
    assert(
      result.evidence.selectedApplicability?.id ===
        expandedOracle.identity.applicability.id,
      "selected applicability differs from independent fixture oracle",
    );
  }
  return {
    sourceWorkbook: positiveFixture.sourceWorkbook,
    sourceWorkbookSha256: positiveFixture.sourceWorkbookSha256,
    mrgEvidence: baseOracle.mrgEvidence,
    expectedResolvedKeys,
    explicitlyQualifiedKeys,
    expectedRoleValues: roleValues,
    tagOracleMode:
      expectedResolvedKeys.length > 0 || Object.keys(roleValues).length === 0
        ? "EXACT_EXPECTED_TAGS"
        : "EXPLICIT_TAGS_PLUS_ROLE_VALUES",
    expandedCellOracle: Boolean(expandedOracle),
  };
};

const completeRequiredBankServiceLookups = async (page, scenario) => {
  const selections = [];
  const oracle = positiveOracleByCase.get(scenario.scenarioId);
  const fields = page.locator(".parameter-field", {
    has: page.locator("ssi-bank-service-lookup"),
  });
  for (let index = 0; index < (await fields.count()); index += 1) {
    const field = fields.nth(index);
    if (!(await field.locator(".required").count())) continue;
    const hidden = field.locator("input[type=hidden]");
    const fieldId = await hidden.getAttribute("id");
    const initialBankServiceId = await hidden.inputValue();
    if (initialBankServiceId) {
      selections.push({
        fieldId,
        initialBankServiceId,
        bankServiceId: initialBankServiceId,
        bic: null,
        selectionAction: "PRESERVED_PRESELECTED",
      });
      continue;
    }
    const lookup = field.locator("ssi-bank-service-lookup");
    const picker = lookup.getByRole("dialog");
    if (!(await picker.isVisible().catch(() => false)))
      await lookup.locator(".lookup-picker-button:not([disabled])").click();
    await picker.waitFor();
    const governedRoleValue = fieldId?.includes("beneficiaryBankServiceId")
      ? oracle?.transactionRoleValues?.BENEFICIARY_BANK
      : undefined;
    const governedBic = governedRoleValue?.trim().match(/[A-Z0-9]{8,11}$/)?.[0];
    const selectedRow = governedBic
      ? picker.locator("tbody tr", { hasText: governedBic })
      : picker.locator("tbody tr:has(button.select-button)").first();
    await selectedRow.waitFor();
    const bic = (await selectedRow.locator("td").first().innerText()).trim();
    await selectedRow
      .getByRole("button", { name: "Select", exact: true })
      .click();
    selections.push({
      fieldId,
      initialBankServiceId,
      bankServiceId: await hidden.inputValue(),
      bic,
      selectionAction: "ORACLE_SELECTED",
    });
  }
  return selections;
};

const negativeHttpStatus = (expectedHttp) => {
  if (expectedHttp.startsWith("422")) return 422;
  if (expectedHttp.startsWith("409 DEV/DEMO")) return 409;
  return null;
};

const negativeExpectedCodes = (expectedStatus) => {
  const explicit = expectedStatus.match(/exact API code ([A-Z0-9-]+)/)?.[1];
  if (explicit) return [explicit];
  return expectedStatus
    .split("/")
    .filter((part) => !part.includes("FAIL_CLOSED"))
    .map((part) => part.trim().match(/^[A-Z][A-Z0-9_]*/)?.[0])
    .filter(Boolean);
};

const resolveNegativeResult = async ({
  page,
  scenario,
  currency,
  counterparty,
  requiredBankServiceSelections,
  executeResponse,
  executeText,
}) => {
  const oracle = negativeOracleByCase.get(scenario.scenarioId);
  assert(oracle, `${scenario.scenarioId}: negative TDD oracle is absent`);
  const expectedHttpStatus = negativeHttpStatus(oracle.expectedHttp);
  assert(
    expectedHttpStatus,
    `Unsupported negative HTTP oracle: ${oracle.expectedHttp}`,
  );
  assert(
    executeResponse.status() === expectedHttpStatus,
    `negative execute expected HTTP ${expectedHttpStatus}, got ${executeResponse.status()}: ${executeText.slice(0, 500)}`,
  );
  const failureBody = JSON.parse(executeText);
  assert(
    failureBody.payloadGenerated === false,
    "negative execution generated a payload",
  );
  assert(
    typeof failureBody.code === "string" && failureBody.code.length > 0,
    "negative execution error code is absent",
  );
  const expectedCodes = negativeExpectedCodes(oracle.expectedStatus);
  assert(
    expectedCodes.includes(failureBody.code),
    `negative expected error code ${expectedCodes.join(" or ")}, got ${failureBody.code}`,
  );
  const failure = page.locator("ssi-resolution-failure .failure");
  await failure.waitFor();
  assert(
    (await failure.locator("code").innerText()).trim() === failureBody.code,
    "UI failure code differs from API response",
  );
  return {
    businessDomain: scenario.businessDomain,
    messageType: scenario.messageType,
    scenarioId: scenario.scenarioId,
    sequence: scenario.sequence,
    currency,
    bankServiceId: counterparty.bankServiceId,
    bic: counterparty.bic,
    requiredBankServiceSelections,
    executeHttpStatus: executeResponse.status(),
    errorCode: failureBody.code,
    payloadGenerated: failureBody.payloadGenerated,
    oracle: {
      sourceWorkbook: negativeFixture.sourceWorkbook,
      sourceWorkbookSha256: negativeFixture.sourceWorkbookSha256,
      expectedHttp: oracle.expectedHttp,
      expectedStatus: oracle.expectedStatus,
      expectedOutput: oracle.expectedOutput,
      mrgEvidence: oracle.mrgEvidence,
    },
    passed: true,
  };
};

const resolveSelectedCounterparty = async (
  page,
  scenario,
  currency,
  lookupComponent,
  counterparty,
) => {
  const requiredBankServiceSelections =
    await completeRequiredBankServiceLookups(page, scenario);
  const preserved = {
    currency,
    bankServiceId: await lookupComponent
      .locator("xpath=..")
      .locator("input[type=hidden]")
      .inputValue(),
  };
  const [executeResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/resolution-page-definitions/execute") &&
        response.request().method() === "POST",
      { timeout: 20_000 },
    ),
    page.getByRole("button", { name: "Resolve SSI", exact: true }).click(),
  ]);
  const executeText = await executeResponse.text();
  if (scenario.polarity === "NEGATIVE")
    return resolveNegativeResult({
      page,
      scenario,
      currency,
      counterparty,
      requiredBankServiceSelections,
      executeResponse,
      executeText,
    });
  assert(
    executeResponse.ok(),
    `execute HTTP ${executeResponse.status()}: ${executeText.slice(0, 500)}; request=${executeResponse.request().postData()}; required bank selections=${JSON.stringify(requiredBankServiceSelections)}`,
  );
  const result = JSON.parse(executeText);
  assert(
    result.scenarioId === scenario.scenarioId,
    "execution scenario identity mismatch",
  );
  assert(Array.isArray(result.fields), "execution result fields are absent");
  const oracle = assertPositiveOracle(scenario, currency, counterparty, result);

  const resultDialog = page.getByRole("dialog", { name: "Resolution result" });
  await resultDialog.waitFor();
  const resultRows = resultDialog.locator(".resolution-result-table tbody tr");
  assert(
    (await resultRows.count()) === result.fields.length,
    `result DOM/API row mismatch ${await resultRows.count()} != ${result.fields.length}`,
  );
  for (const field of result.fields) {
    const tagAndOption = `${field.swiftTag ?? ""}${field.swiftOption ?? ""}`;
    const row = resultDialog
      .locator(
        `.resolution-result-table tbody tr[data-status="${field.resolutionStatus}"]`,
      )
      .filter({ hasText: tagAndOption });
    assert(
      await row.count(),
      `${tagAndOption}/${field.resolutionStatus} is absent from result modal`,
    );
    if (field.institution?.bic)
      assert(
        await row.filter({ hasText: field.institution.bic }).count(),
        `${tagAndOption} BIC is absent`,
      );
  }
  await resultDialog.getByLabel("Close resolution result").click();
  await resultDialog.waitFor({ state: "detached" });
  assert(
    (await page.locator(currencyFieldSelector).inputValue()) ===
      preserved.currency,
    "Close reset Currency",
  );
  assert(
    (await lookupComponent
      .locator("xpath=..")
      .locator("input[type=hidden]")
      .inputValue()) === preserved.bankServiceId,
    "Close reset Counterparty",
  );
  return {
    businessDomain: scenario.businessDomain,
    messageType: scenario.messageType,
    scenarioId: scenario.scenarioId,
    sequence: scenario.sequence,
    currency,
    bankServiceId: counterparty.bankServiceId,
    bic: counterparty.bic,
    requiredBankServiceSelections,
    executeHttpStatus: executeResponse.status(),
    resultOutcome: result.outcome,
    oracle,
    resultFields: result.fields.map((field) => ({
      sequenceId: field.sequenceId,
      tagAndOption: `${field.swiftTag ?? ""}${field.swiftOption ?? ""}`,
      bic: field.institution?.bic ?? null,
      resolutionStatus: field.resolutionStatus,
      reasonCode: field.reasonCode ?? null,
    })),
    passed: true,
  };
};

const exerciseCurrency = async (page, scenario, currency) => {
  const currencyField = page.locator(currencyFieldSelector);
  const availableCurrencies = await currencyField
    .locator("option")
    .evaluateAll((options) =>
      options
        .filter((option) => !option.disabled)
        .map((option) => option.value),
    );
  assert(
    availableCurrencies.includes(currency),
    `Currency ${currency} is not offered (${availableCurrencies.join(", ")})`,
  );

  if ((await currencyField.inputValue()) === currency) {
    const alternateCurrency = availableCurrencies.find(
      (candidate) => candidate !== currency,
    );
    assert(
      alternateCurrency,
      "Currency control has no alternate value to refresh lookup",
    );
    const alternateLookupPromise = waitForLookup(page, alternateCurrency);
    await currencyField.selectOption(alternateCurrency);
    await alternateLookupPromise;
  }

  const lookupResponsePromise = waitForLookup(page, currency);
  await currencyField.selectOption(currency);
  const lookupResponse = await lookupResponsePromise;
  assert(lookupResponse.ok(), `lookup HTTP ${lookupResponse.status()}`);
  const lookup = await lookupResponse.json();
  assert(lookup.provider === "SSI_COUNTERPARTY", "unexpected lookup provider");
  assert(
    lookup.items.length === 3,
    `expected 3 SSI choices, got ${lookup.items.length}`,
  );
  assert(lookup.defaultSelection, "governed defaultSelection is absent");
  assert(
    lookup.defaultSelection.reasonCode === "GOVERNED_CURRENCY_DEFAULT" &&
      lookup.defaultSelection.dependency?.fieldId === "context.currency" &&
      lookup.defaultSelection.dependency?.value === currency,
    "governed default dependency does not match selected currency",
  );
  const defaultItem = lookup.items.find(
    ({ bankServiceId }) => bankServiceId === lookup.defaultSelection.value,
  );
  assert(defaultItem, "governed default is not present in lookup items");

  const lookupComponent = page.locator(counterpartyLookupSelector);
  const stableIdInput = lookupComponent
    .locator("xpath=..")
    .locator("input[type=hidden]");
  await stableIdInput.waitFor({ state: "attached" });
  await page.waitForFunction(
    ({ selector, expected }) =>
      document.querySelector(selector)?.value === expected,
    {
      selector: `#${await stableIdInput.getAttribute("id")}`,
      expected: defaultItem.bankServiceId,
    },
    { timeout: 15_000 },
  );
  await lookupComponent.locator(".lookup-selection").waitFor();
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector(
          "#parameter-context-counterpartyBankServiceId + ssi-bank-service-lookup .lookup-selection strong",
        )
        ?.textContent?.trim() === expected,
    defaultItem.bic,
    { timeout: 15_000 },
  );
  assert(
    (
      await lookupComponent.locator(".lookup-selection strong").innerText()
    ).trim() === defaultItem.bic,
    "visible governed default BIC mismatch",
  );
  assert(
    await lookupComponent.locator(".lookup-selection small").count(),
    "selected SSI institution name is absent",
  );
  assert(
    (await stableIdInput.inputValue()) === defaultItem.bankServiceId,
    "hidden stable bankServiceId mismatch",
  );

  // A required downstream lookup may already be open while its asynchronous
  // choices settle. Complete it before exercising the counterparty picker so
  // its modal backdrop cannot intercept the Change action.
  await completeRequiredBankServiceLookups(page, scenario);

  await lookupComponent
    .getByRole("button", { name: "Change", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: /Counterparty|Receiver|Bank Service/i,
  });
  await picker.waitFor();
  await picker.locator("button.select-button").first().waitFor();
  const pickerRows = picker.locator("tbody tr:has(button.select-button)");
  assert(
    (await pickerRows.count()) === lookup.items.length,
    `picker expected ${lookup.items.length} governed SSI choices, got ${await pickerRows.count()}`,
  );

  await picker.getByLabel("Close").click();
  const executions = [];
  const orderedCounterparties = [
    defaultItem,
    ...lookup.items.filter(
      ({ bankServiceId }) => bankServiceId !== defaultItem.bankServiceId,
    ),
  ].slice(0, counterpartyLimit);
  for (const [index, counterparty] of orderedCounterparties.entries()) {
    if (index > 0) {
      await lookupComponent
        .getByRole("button", { name: "Change", exact: true })
        .click();
      const currentPicker = page.getByRole("dialog", {
        name: /Counterparty|Receiver|Bank Service/i,
      });
      await currentPicker.waitFor();
      await currentPicker.locator("button.select-button").first().waitFor();
      await selectLookupRow(currentPicker, counterparty.bankServiceId, lookup);
    }
    assert(
      (await lookupComponent
        .locator("xpath=..")
        .locator("input[type=hidden]")
        .inputValue()) === counterparty.bankServiceId,
      `Change did not select stable ID ${counterparty.bankServiceId}`,
    );
    try {
      executions.push(
        await resolveSelectedCounterparty(
          page,
          scenario,
          currency,
          lookupComponent,
          counterparty,
        ),
      );
    } catch (error) {
      executions.push({
        businessDomain: scenario.businessDomain,
        messageType: scenario.messageType,
        scenarioId: scenario.scenarioId,
        sequence: scenario.sequence,
        currency,
        bankServiceId: counterparty.bankServiceId,
        bic: counterparty.bic,
        passed: false,
        error: errorMessage(error),
      });
      const resultDialog = page.getByRole("dialog", {
        name: "Resolution result",
      });
      if (await resultDialog.count())
        await resultDialog.getByLabel("Close resolution result").click();
    }
  }

  return {
    currency,
    lookupHttpStatus: lookupResponse.status(),
    ssiChoiceCount: lookup.items.length,
    defaultBankServiceId: defaultItem.bankServiceId,
    defaultBic: defaultItem.bic,
    executions,
    noHorizontalScroll: await assertNoPageHorizontalScroll(page),
  };
};

const executeScenario = async (page, scenario) => {
  const startedAt = new Date().toISOString();
  const result = {
    ...scenario,
    startedAt,
    checks: [],
    passed: false,
    error: null,
  };
  try {
    await openScenario(page, scenario);
    result.pageContract = await assertPageContract(page, scenario);
    await assertRequiredLabels(page);
    await assertNoPageHorizontalScroll(page);
    const apiCurrencies = await page
      .locator(currencyFieldSelector)
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));
    assert(
      apiCurrencies.length === 5,
      `API-driven currency option count is ${apiCurrencies.length}, expected 5`,
    );
    const currencies = configuredCurrencies ?? apiCurrencies;
    for (const currency of currencies)
      result.checks.push(await exerciseCurrency(page, scenario, currency));
    const failedExecutions = result.checks.flatMap((check) =>
      check.executions.filter((execution) => !execution.passed),
    );
    result.passed = failedExecutions.length === 0;
    if (failedExecutions.length > 0)
      result.error = `${failedExecutions.length} counterparty executions failed`;
  } catch (error) {
    result.error = errorMessage(error);
    const safeName =
      `${scenario.businessDomain}-${scenario.scenarioId}`.replaceAll(
        /[^A-Za-z0-9_-]/g,
        "_",
      );
    await page.screenshot({
      path: `${outputDirectory}/FAIL-${safeName}.png`,
      fullPage: true,
    });
  } finally {
    result.finishedAt = new Date().toISOString();
    try {
      const back = page.getByRole("button", {
        name: "Back to transaction index",
      });
      await back.click({ timeout: 5_000 });
      const domainLabel =
        scenario.businessDomain === "TREASURY" ? "Treasury" : "Trade finance";
      await page
        .getByRole("heading", { name: `Search ${domainLabel} Message Index` })
        .waitFor({ timeout: 5_000 });
    } catch (recoveryError) {
      result.recoveryError = errorMessage(recoveryError);
      try {
        await page.goto(portalUrl, { waitUntil: "networkidle" });
        await openDomain(page, scenario.businessDomain);
      } catch (reloadError) {
        result.reloadError = errorMessage(reloadError);
      }
    }
  }
  return result;
};

const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const ledger = {
  schemaVersion: "1.0",
  kind: "GENERIC_SSI_BROWSER_UAT_MATRIX",
  startedAt: new Date().toISOString(),
  portalUrl,
  browserPath,
  configuredCurrencies: configuredCurrencies ?? null,
  shard: { index: shardIndex, total: shardTotal },
  oracleAuthority: {
    tddMrgSemantics: {
      path: positiveFixturePath,
      sha256: positiveFixtureSha256,
      purpose: "TAG_OPTION_ROLE_BIC",
    },
    negativeTddMrgSemantics: {
      path: negativeFixturePath,
      sha256: negativeFixtureSha256,
      purpose: "EXPECTED_HTTP_FAIL_CLOSED_AND_NO_PAYLOAD",
    },
    syntheticIdentity: {
      path: identityOraclePath,
      sha256: identityOracleSha256,
      purpose: "SELECTED_SSI_AND_APPLICABILITY_IDENTITY",
      rationale:
        "The canonical reload manifest governs v4 identities; the prior v2 artifact contains UUIDs derived from the superseded v3 variant namespace.",
    },
  },
  results: [],
};

try {
  await mkdir(outputDirectory, { recursive: true });
  await page.goto(portalUrl, { waitUntil: "networkidle" });
  const domains = ["TREASURY", "TRADE_FINANCE"].filter(
    (domain) => !domainFilter || domain === domainFilter,
  );
  for (const businessDomain of domains) {
    await openDomain(page, businessDomain);
    const index = await loadIndex(page, businessDomain);
    const matchingScenarios = scenarioRows(index)
      .filter(
        (scenario) =>
          (!scenarioFilter || scenario.scenarioId === scenarioFilter) &&
          (!scenarioFilters || scenarioFilters.includes(scenario.scenarioId)) &&
          (!polarityFilter || scenario.polarity === polarityFilter),
      )
      .filter((_, index) => index % shardTotal === shardIndex);
    const scenarios = scenarioLimit
      ? matchingScenarios.slice(0, scenarioLimit)
      : matchingScenarios;
    for (const scenario of scenarios) {
      ledger.results.push(await executeScenario(page, scenario));
      await writeFile(
        `${outputDirectory}/generic-ssi-browser-uat-matrix.partial.json`,
        `${JSON.stringify(ledger, null, 2)}\n`,
        "utf8",
      );
      console.log(
        `[${ledger.results.length}] ${scenario.businessDomain} ${scenario.scenarioId}: ${ledger.results.at(-1).passed ? "PASS" : "FAIL"}`,
      );
    }
    const home = page.getByRole("button", {
      name: "SSI Workbench",
      exact: true,
    });
    if (await home.count()) await home.click();
  }
} finally {
  await browser.close();
}

ledger.finishedAt = new Date().toISOString();
ledger.summary = {
  scenarios: ledger.results.length,
  currencyExecutions: ledger.results.reduce(
    (total, result) => total + result.checks.length,
    0,
  ),
  counterpartyExecutions: ledger.results.reduce(
    (scenarioTotal, result) =>
      scenarioTotal +
      result.checks.reduce(
        (currencyTotal, check) => currencyTotal + check.executions.length,
        0,
      ),
    0,
  ),
  passed: ledger.results.filter((result) => result.passed).length,
  failed: ledger.results.filter((result) => !result.passed).length,
};
const json = `${JSON.stringify(ledger, null, 2)}\n`;
const jsonPath = `${outputDirectory}/generic-ssi-browser-uat-matrix.json`;
await writeFile(jsonPath, json, "utf8");
await writeFile(
  `${jsonPath}.sha256.txt`,
  `${createHash("sha256").update(json).digest("hex").toUpperCase()}  generic-ssi-browser-uat-matrix.json\n`,
  "utf8",
);

console.log(JSON.stringify(ledger.summary, null, 2));
if (ledger.summary.failed) process.exitCode = 1;
/* global CSS, URL, URLSearchParams, document */
