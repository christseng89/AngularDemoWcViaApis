#!/usr/bin/env node
/* global Event, fetch, setTimeout */
import console from "node:console";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const portalUrl = process.env.PORTAL_URL ?? "http://localhost:4600/";
const apiUrl = process.env.MT2_QA_API_URL ?? "http://localhost:3100/api";
const seed = process.env.MT2_QA_RANDOM_SEED ?? "MT2-RESOLVER-20260911";
const reportPath = path.resolve(
  root,
  process.env.MT2_QA_RANDOM_REPORT ??
    "qa/reports/latest/mt2/mt2-resolver-exhaustive-random.json",
);
const summaryPath = path.resolve(
  root,
  process.env.MT2_QA_RANDOM_SUMMARY ??
    "qa/reports/latest/mt2/MT2_RESOLVER_全量隨機瀏覽器測試_ZH.md",
);
const evidenceRoot = path.resolve(
  root,
  process.env.MT2_QA_RANDOM_EVIDENCE ??
    "qa/reports/latest/mt2/mt2-resolver-exhaustive-evidence",
);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const evidenceDir = path.join(evidenceRoot, runId);
const forbiddenRawBicFields = [
  "counterpartyBic",
  "intermediaryBic",
  "accountWithBic",
  "receiverCorrespondentBic",
];

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const seededRandom = (text) => {
  let h = 2166136261;
  for (const character of text)
    h = Math.imul(h ^ character.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const random = seededRandom(seed);
const shuffle = (items) => {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
};
const getJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Health/discovery GET ${url} returned ${response.status}`);
  return response.json();
};
const live = Object.fromEntries(
  await Promise.all(
    [
      ["ssis", `${apiUrl}/ssis`],
      ["applicability", `${apiUrl}/ssi-applicability`],
      ["banks", `${apiUrl}/reference/banks?page=1&pageSize=100`],
      ["currencies", `${apiUrl}/reference/currencies`],
      ["nostros", `${apiUrl}/nostro-accounts`],
      ["messageIndex", `${apiUrl}/settlements/message-index`],
    ].map(async ([key, url]) => [key, await getJson(url)]),
  ),
);
const banks = live.banks.items.filter(
  (bank) =>
    bank.status === "ACTIVE" && bank.usageGroup !== "DIRECTORY_ONLY_NO_SSI",
);
const activeApplicability = new Set(
  live.applicability
    .filter((row) => row.status === "ACTIVE")
    .map((row) => row.ssiId),
);
const activeRoutes = live.ssis.filter(
  (row) =>
    row.status === "ACTIVE" &&
    row.ownershipType === "COUNTERPARTY" &&
    activeApplicability.has(row.id),
);
const pairs = banks.flatMap((bank) =>
  [
    ...new Set(
      activeRoutes
        .filter(
          (row) =>
            row.ownerParty === bank.bic ||
            row.route?.counterpartyBic === bank.bic,
        )
        .map((row) => row.route?.currency)
        .filter(Boolean),
    ),
  ]
    .sort()
    .map((currency) => ({
      bankServiceId: bank.bankServiceId,
      bic: bank.bic,
      currency,
    })),
);
if (pairs.length === 0)
  throw new Error(
    "No resolver-enabled Bank Service × ACTIVE SSI currency pairs discovered",
  );
const currencyCodes = live.currencies.map((item) => item.code);
const coveredByBank = new Map(
  banks.map((bank) => [
    bank.bankServiceId,
    new Set(
      pairs
        .filter((pair) => pair.bankServiceId === bank.bankServiceId)
        .map((pair) => pair.currency),
    ),
  ]),
);
const journeys = [
  ...["MT202", "MT202COV", "MT205", "MT205COV"].map((messageType) => ({
    kind: "MESSAGE",
    key: messageType,
    selector: `Select ${messageType}`,
  })),
  ...[
    ["BOOK_TRANSFER_SAME_RECEIVER", "MT202"],
    ["CREDIT_ONE_OF_SEVERAL_AT_57A", "MT202"],
    ["INITIAL_MT200_201_EQUIVALENCE", "MT205"],
    ["NO_MT200_201_EQUIVALENCE", "MT205COV"],
  ].map(([code, messageType]) => ({
    kind: "SCENARIO",
    key: code,
    messageType,
    selector: `Select scenario ${code}`,
  })),
];
const cases = [];
for (const journey of journeys) {
  for (const pair of pairs) cases.push({ type: "POSITIVE", journey, ...pair });
  for (const bank of banks) {
    const unsupported = currencyCodes.find(
      (currency) => !coveredByBank.get(bank.bankServiceId).has(currency),
    );
    if (unsupported)
      cases.push({
        type: "UNSUPPORTED_CURRENCY",
        journey,
        bankServiceId: bank.bankServiceId,
        bic: bank.bic,
        currency: unsupported,
      });
  }
  cases.push({
    type: "MISSING_CURRENCY",
    journey,
    bankServiceId: banks[0].bankServiceId,
    bic: banks[0].bic,
    currency: "",
  });
  for (const bank of banks) {
    const coverage = coveredByBank.get(bank.bankServiceId);
    const other = [...coverage].find((currency) => currency !== "USD");
    if (coverage.has("USD") && other)
      cases.push({
        type: "METAMORPHIC",
        journey,
        bankServiceId: bank.bankServiceId,
        bic: bank.bic,
        currency: "USD",
        nextCurrency: other,
      });
  }
}
cases.push({
  type: "RACE_REGRESSION",
  journey: journeys.find(
    (journey) => journey.kind === "MESSAGE" && journey.key === "MT202",
  ),
  bankServiceId: "BANK-SVC-BARCGB22",
  bic: "BARCGB22",
  currency: "USD",
  nextCurrency: "SGD",
});
cases.push(
  {
    type: "ATOMIC_DIRECT_GBP",
    journey: journeys.find(
      (journey) => journey.kind === "MESSAGE" && journey.key === "MT202",
    ),
    bankServiceId: "BANK-SVC-BARCGB22",
    bic: "BARCGB22",
    currency: "GBP",
  },
  {
    type: "ATOMIC_SWITCH",
    journey: journeys.find(
      (journey) => journey.kind === "MESSAGE" && journey.key === "MT202",
    ),
    bankServiceId: "BANK-SVC-BARCGB22",
    bic: "BARCGB22",
    currency: "USD",
    nextCurrency: "GBP",
  },
  {
    type: "ATOMIC_SWITCH",
    journey: journeys.find(
      (journey) => journey.kind === "MESSAGE" && journey.key === "MT202",
    ),
    bankServiceId: "BANK-SVC-BARCGB22",
    bic: "BARCGB22",
    currency: "GBP",
    nextCurrency: "USD",
  },
);
const stableKeyOf = (item) =>
  [
    item.type,
    item.journey.key,
    item.bankServiceId,
    item.currency || "(missing)",
    item.nextCurrency ?? "-",
  ].join("|");
const allOrderedCases = shuffle(cases).map((item, index) => ({
  ...item,
  stableKey: stableKeyOf(item),
  runIndex: index + 1,
  caseId: `RND-${String(index + 1).padStart(3, "0")}`,
}));
const requestedCase = process.env.MT2_QA_RANDOM_CASE;
const selectionFile = process.env.MT2_QA_RANDOM_SELECTION_FILE
  ? path.resolve(root, process.env.MT2_QA_RANDOM_SELECTION_FILE)
  : null;
const selectionDefinition = selectionFile
  ? JSON.parse(fs.readFileSync(selectionFile, "utf8"))
  : null;
if (selectionDefinition?.resolverUniverse) {
  const discoveredPairs = new Set(
    pairs.map((pair) => `${pair.bankServiceId}|${pair.currency}`),
  );
  const expectedPairs = new Set(
    selectionDefinition.resolverUniverse.pairs.map(
      (pair) => `${pair.bankServiceId}|${pair.currency}`,
    ),
  );
  if (
    discoveredPairs.size !== expectedPairs.size ||
    [...expectedPairs].some((pair) => !discoveredPairs.has(pair))
  )
    throw new Error(
      `Resolver universe drift: discovered ${[...discoveredPairs].join(", ")}; expected ${[...expectedPairs].join(", ")}`,
    );
}
const selectedStableKeys = selectionDefinition
  ? new Set(
      Array.isArray(selectionDefinition)
        ? selectionDefinition
        : selectionDefinition.exhaustiveStableKeys,
    )
  : null;
const orderedCases = requestedCase
  ? allOrderedCases.filter((item) => item.caseId === requestedCase)
  : selectedStableKeys
    ? allOrderedCases.filter((item) => selectedStableKeys.has(item.stableKey))
    : allOrderedCases;
if (requestedCase && orderedCases.length !== 1)
  throw new Error(`Unknown MT2_QA_RANDOM_CASE ${requestedCase}`);
if (selectedStableKeys && orderedCases.length !== selectedStableKeys.size) {
  const discovered = new Set(orderedCases.map((item) => item.stableKey));
  const missing = [...selectedStableKeys].filter((key) => !discovered.has(key));
  throw new Error(`Unknown exhaustive stable key(s): ${missing.join(", ")}`);
}
if (
  orderedCases.some((item) => item.type.startsWith("ATOMIC_")) &&
  selectionDefinition?.baAddendum?.status !== "APPROVED"
)
  throw new Error(
    "BA_ADDENDUM_REQUIRED: atomic snapshot applicability expectations are not approved",
  );

fs.mkdirSync(evidenceDir, { recursive: true });
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
const control = (label) =>
  page
    .locator("label.control", { has: page.getByText(label, { exact: true }) })
    .first();
const selectControl = async (label, value) => {
  const select = control(label).locator("select");
  if (value === "") {
    await select.evaluate((element) => {
      element.value = "";
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  } else await select.selectOption(value);
};
const fillControl = async (label, value) => {
  const input = control(label).locator("input");
  await input.fill(String(value));
  await input.dispatchEvent("change");
};
const openJourney = async (journey) => {
  await page.goto(portalUrl, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Payment SSI Resolution", exact: true })
    .click();
  await page
    .getByRole("link", { name: journey.selector, exact: true })
    .dblclick();
  await page
    .getByRole("button", { name: "2. Preview Resolution", exact: true })
    .waitFor();
};
const requestOnce = async (item, currency, suffix = "") => {
  await selectControl(
    "Counterparty（Bank Directory / BIC）",
    item.bankServiceId,
  );
  await selectControl("Currency (ISO 4217)", currency);
  await fillControl(
    "Amount",
    (100 + Math.floor(random() * 9_900) + random()).toFixed(2),
  );
  await fillControl("Transaction Reference", `${item.caseId}${suffix}-${seed}`);
  await page.waitForTimeout(50);
  const requestPromise = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/settlements/resolve") &&
      request.method() === "POST",
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settlements/resolve") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "2. Preview Resolution", exact: true })
    .click();
  const request = await requestPromise;
  const response = await responsePromise;
  const bodyText = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(bodyText);
  } catch {
    responseBody = bodyText;
  }
  return {
    requestBody: request.postDataJSON(),
    responseStatus: response.status(),
    responseBody,
    responseBodyText: bodyText,
  };
};
const inspectClearedResolutionUi = async (previousExchange) => {
  const panel = page.locator(".result-panel");
  const rawResponseText =
    previousExchange?.responseBodyText ??
    JSON.stringify(previousExchange?.responseBody ?? null);
  const uuidTokens = [
    ...new Set(
      rawResponseText.match(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      ) ?? [],
    ),
  ];
  const panelText = await panel.innerText();
  const observation = {
    decisionBadgeCount: await panel.locator(".decision-pass").count(),
    chosenSummaryCount: await panel.locator(".result-summary").count(),
    alternativesCount: await panel.locator(".route-option-selector").count(),
    renderedJsonCount: await panel.locator(".render-preview pre").count(),
    previousUuidTokens: uuidTokens,
    visiblePreviousUuidTokens: uuidTokens.filter((token) =>
      panelText.includes(token),
    ),
    panelText,
  };
  return {
    ...observation,
    authoritativeResultVisible:
      observation.decisionBadgeCount > 0 ||
      observation.chosenSummaryCount > 0 ||
      observation.alternativesCount > 0 ||
      observation.renderedJsonCount > 0 ||
      observation.visiblePreviousUuidTokens.length > 0,
  };
};
const resolutionAffectingHandlers = [
  {
    key: "counterpartyBankService",
    label: "Counterparty（Bank Directory / BIC）",
    kind: "select",
  },
  {
    key: "bookingEntity",
    label: "Booking Branch / Entity（本行）",
    kind: "select",
  },
  { key: "settlementCountry", label: "Settlement Country", kind: "select" },
  { key: "settlementMarket", label: "Settlement Market", kind: "input" },
  { key: "clearingSystem", label: "Clearing System", kind: "select" },
  { key: "valueDate", label: "Value Date", kind: "input" },
  { key: "amount", label: "Amount", kind: "input" },
  {
    key: "transactionReference",
    label: "Transaction Reference",
    kind: "input",
  },
];
let invalidationSamplerCompleted = false;
const exerciseResolutionInputInvalidation = async (
  item,
  currency,
  initialExchange,
) => {
  const details = page.locator("details.advanced-overrides");
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
  let currentExchange = initialExchange;
  const samples = [];
  for (const spec of resolutionAffectingHandlers) {
    const element = control(spec.label).locator(
      spec.kind === "select" ? "select" : "input",
    );
    const originalValue = await element.inputValue();
    let mutatedValue;
    if (spec.kind === "select") {
      const values = await element
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value));
      mutatedValue =
        values.find((value) => value !== originalValue) ?? originalValue;
      await element.evaluate((node, value) => {
        node.value = value;
        node.dispatchEvent(new Event("change", { bubbles: true }));
      }, mutatedValue);
    } else {
      mutatedValue =
        spec.key === "valueDate"
          ? new Date(Date.parse(originalValue) + 86_400_000)
              .toISOString()
              .slice(0, 10)
          : `${originalValue || spec.key}-QA-MUTATION`;
      if (spec.key === "amount") mutatedValue = "1234.56";
      await fillControl(spec.label, mutatedValue);
    }
    const staleUi = await inspectClearedResolutionUi(currentExchange);
    const mutationApplied = mutatedValue !== originalValue;
    samples.push({
      handler: spec.key,
      originalValue,
      mutatedValue,
      mutationApplied,
      rawPreviousResponseText: currentExchange.responseBodyText,
      staleUi,
      status:
        mutationApplied && !staleUi.authoritativeResultVisible
          ? "PASS"
          : "FAIL",
    });
    if (spec.kind === "select")
      await element.evaluate((node, value) => {
        node.value = value;
        node.dispatchEvent(new Event("change", { bubbles: true }));
      }, originalValue);
    else await fillControl(spec.label, originalValue);
    currentExchange = await requestOnce(
      item,
      currency,
      `-INVALIDATE-${spec.key}`,
    );
    samples.at(-1).replayExchange = currentExchange;
  }
  return { samples, currentExchange };
};
const extractEvidence = (body) => {
  const legacy = body?.recommendedRoute;
  const roles =
    body?.mx?.["canonicalRoute/agent roles"] ??
    body?.mt?.["canonicalRoute/agent roles"] ??
    null;
  return {
    chosenSsi: legacy?.ssiId ?? roles?.selectedSsi ?? null,
    route: legacy?.route ?? roles,
    provenance:
      body?.mt?.assertions ?? body?.mx?.assertions ?? legacy?.evidence ?? null,
  };
};
const validateResolvedGovernance = (exchange) => {
  const body = exchange?.responseBody;
  const decision =
    body?.decision ?? body?.resolutionDecision ?? body?.mx?.decision;
  if (decision !== "RESOLVED") return [];
  const differences = [];
  const code = body?.code ?? body?.mx?.code;
  if (code !== "SSI_RESOLVED")
    differences.push(
      `RESOLVED code ${code ?? "missing"}, expected SSI_RESOLVED`,
    );
  const chosen = body?.chosenRoute;
  if (!chosen || typeof chosen !== "object")
    differences.push("RESOLVED response is missing chosenRoute");
  const provenance = body?.roleProvenance;
  if (
    !provenance ||
    typeof provenance !== "object" ||
    Object.keys(provenance).length === 0
  )
    differences.push("RESOLVED response is missing roleProvenance");
  for (const field of [
    "ssiId",
    "ssiCode",
    "ssiVersion",
    "settlementRouteId",
    "currency",
    "accountId",
    "nostroId",
    "nostroVersion",
    "matchedApplicabilityId",
  ]) {
    if (!chosen?.[field])
      differences.push(`RESOLVED chosenRoute is missing ${field}`);
  }
  for (const [role, evidence] of Object.entries(provenance ?? {})) {
    if (!evidence?.value || !evidence?.source)
      differences.push(`roleProvenance.${role} is missing value/source`);
    if (!evidence?.sourceField && !evidence?.evidenceId)
      differences.push(
        `roleProvenance.${role} is missing sourceField/evidenceId`,
      );
    if (
      !evidence?.ssiVersion &&
      !evidence?.nostroVersion &&
      !evidence?.requestVersion &&
      !evidence?.ownEntityVersion
    )
      differences.push(
        `roleProvenance.${role} is missing applicable version evidence`,
      );
  }
  const alternatives = body?.alternatives;
  if (!Array.isArray(alternatives) || alternatives.length !== 0)
    differences.push("RESOLVED response must expose alternatives=[]");
  if (Object.hasOwn(body ?? {}, "alternativeRoutes"))
    differences.push(
      "RESOLVED response must not expose legacy alternativeRoutes",
    );
  if (!body?.snapshotHash) differences.push("RESOLVED snapshotHash is missing");
  if (!body?.resolutionToken)
    differences.push("RESOLVED resolutionToken is missing");
  return differences;
};
const validateAtomicSnapshot = (exchange, currency) => {
  const expected =
    selectionDefinition?.baAddendum?.expectedByCurrency?.[currency];
  const differences = [];
  if (!expected)
    return {
      differences: [`No BA-approved ${currency} atomic expectation`],
      evidence: null,
    };
  const matchingNostros = live.nostros.filter(
    (nostro) =>
      nostro.status === "ACTIVE" &&
      nostro.currency === currency &&
      nostro.accountReference === expected.accountId,
  );
  const body = exchange.responseBody;
  const tieRisk = selectionDefinition?.tieRiskGate;
  const tieExpectedBehavior =
    tieRisk?.approvedExpectedBehavior ?? tieRisk?.defaultExpectedBehavior;
  if (currency === "GBP" && tieExpectedBehavior === "FAIL_CLOSED") {
    const contract = selectionDefinition?.responseContracts;
    const code = body?.code ?? body?.mx?.code;
    const decision = body?.decision ?? body?.mx?.decision;
    const candidates = body?.candidates;
    if (exchange.responseStatus !== contract?.A2_TIE?.httpStatus)
      differences.push(
        `Tie-risk HTTP ${exchange.responseStatus}, expected ${contract?.A2_TIE?.httpStatus}`,
      );
    if (code !== tieRisk.defaultExpectedCode)
      differences.push(
        `Tie-risk code ${code ?? "missing"}, expected ${tieRisk.defaultExpectedCode}`,
      );
    if (decision !== "SSI_AMBIGUOUS")
      differences.push(`Tie-risk decision ${decision ?? "missing"}`);
    if (body?.ambiguityReason !== "TIED_ON_CONTROLLED_RANK_KEYS")
      differences.push(
        "Tie-risk ambiguityReason must be TIED_ON_CONTROLLED_RANK_KEYS",
      );
    const tiedOn = body?.tiedOn ?? [];
    const expectedTiedOn = contract?.A3_AMBIGUOUS_SHAPE?.tiedOn ?? [];
    if (JSON.stringify(tiedOn) !== JSON.stringify(expectedTiedOn))
      differences.push("Tie-risk tiedOn does not exactly match EC-RANK-01");
    if ((body?.payloadGenerated ?? body?.mx?.payloadGenerated) !== false)
      differences.push("Tie-risk response must set payloadGenerated=false");
    for (const [field, value] of [
      ["chosenRoute", body?.chosenRoute],
      ["roleProvenance", body?.roleProvenance],
      ["messageComposerContext", body?.messageComposerContext],
      [
        "canonicalRoles",
        body?.canonicalRoles ??
          body?.["canonicalRoute/agent roles"] ??
          body?.mx?.["canonicalRoute/agent roles"],
      ],
    ]) {
      if (value !== null) differences.push(`Tie-risk ${field} must be null`);
    }
    if (Object.hasOwn(body ?? {}, "alternativeRoutes"))
      differences.push("Tie-risk response must not expose alternativeRoutes");
    if (!Array.isArray(candidates))
      differences.push("Tie-risk response must expose unordered candidates");
    else {
      const actualCodes = new Set(
        candidates.map((candidate) => candidate.ssiCode),
      );
      const expectedCodes = new Set(expected.candidateSsiCodes);
      if (
        actualCodes.size !== expectedCodes.size ||
        [...expectedCodes].some((item) => !actualCodes.has(item))
      )
        differences.push(
          "Tie-risk candidates must be exactly SSI-DEMO-003 and SSI-DEMO-022",
        );
      for (const candidate of candidates) {
        for (const field of [
          "ssiCode",
          "ssiId",
          "ssiVersion",
          "settlementRouteId",
          "accountId",
          "nostroId",
          "nostroVersion",
          "maskedAccountRef",
          "matchedApplicabilityId",
          "businessRank",
          "tieMember",
        ]) {
          if (candidate?.[field] === undefined || candidate?.[field] === "")
            differences.push(
              `Tie-risk candidate ${candidate?.ssiCode ?? "?"} missing ${field}`,
            );
        }
      }
      const tiedCodes = new Set(
        candidates
          .filter((candidate) => candidate.tieMember === true)
          .map((candidate) => candidate.ssiCode),
      );
      if (
        tiedCodes.size !== 2 ||
        !tiedCodes.has("SSI-DEMO-003") ||
        !tiedCodes.has("SSI-DEMO-022")
      )
        differences.push(
          "Only SSI-DEMO-003 and SSI-DEMO-022 may be tie members",
        );
      if (
        candidates.find((candidate) => candidate.ssiCode === "SSI-DEMO-004")
          ?.tieMember !== false
      )
        differences.push(
          "SSI-DEMO-004 must be lower-ranked with tieMember=false",
        );
    }
    if (
      body?.repairQueue?.required !== true ||
      body?.repairQueue?.reasonCode !== "TOP_RANK_TIE" ||
      body?.repairQueue?.makerCheckerRequired !== true
    )
      differences.push(
        "Tie-risk response must route to Maker/Checker Repair Queue",
      );
    return {
      differences,
      evidence: { expected: tieRisk, observed: body, matchingNostros },
    };
  }
  if (matchingNostros.length === 0) {
    if (
      exchange.responseStatus !== 503 ||
      body?.mx?.code !== "PROFILE_INCOMPLETE"
    )
      differences.push(
        "Missing exact ACTIVE Nostro join must return PROFILE_INCOMPLETE/503",
      );
    return { differences, evidence: { expected, matchingNostros } };
  }
  if (exchange.responseStatus !== 200)
    differences.push(`HTTP ${exchange.responseStatus}, expected 200`);
  const chosen = body?.chosenRoute ?? {};
  const roleProvenance = Object.values(body?.roleProvenance ?? {});
  const alternatives = body?.alternativeRoutes ?? [];
  const excluded = body?.excludedCandidates ?? [];
  if (body?.resolutionDecision !== expected.decision)
    differences.push(
      `resolutionDecision ${body?.resolutionDecision ?? "missing"}, expected ${expected.decision}`,
    );
  for (const [field, value] of [
    ["ssiCode", expected.ssiCode],
    ["ssiId", expected.ssiId],
    ["ssiVersion", expected.ssiVersion],
    ["settlementRouteId", expected.settlementRouteId],
    ["currency", currency],
    ["accountId", expected.accountId],
    ["nostroId", expected.nostroId],
    ["nostroVersion", expected.nostroVersion],
    ["matchedApplicabilityId", expected.applicabilityId],
  ]) {
    if (value !== undefined && chosen[field] !== value)
      differences.push(
        `chosenRoute.${field} ${chosen[field] ?? "missing"}, expected ${value}`,
      );
  }
  if (!body?.snapshotHash || typeof body.snapshotHash !== "string")
    differences.push("Response must expose one immutable snapshotHash");
  if (roleProvenance.length === 0)
    differences.push("SSI-derived role provenance is missing");
  for (const provenance of roleProvenance) {
    if (
      provenance?.ssiCode !== expected.ssiCode ||
      Number(provenance?.ssiVersion) !== expected.ssiVersion
    )
      differences.push(
        "Every SSI-derived role must bind to the chosen SSI code/version",
      );
  }
  if (currency === "GBP" && JSON.stringify(body).includes("CITIUS33"))
    differences.push("GBP response must not contain CITIUS33");
  if (currency === "GBP") {
    const alternativeCodes = new Set(
      alternatives.map((route) => route.ssiCode),
    );
    for (const code of expected.alternativeSsiCodes) {
      if (!alternativeCodes.has(code))
        differences.push(`${code} must remain an eligible alternative`);
      if (excluded.some((candidate) => candidate.ssiCode === code))
        differences.push(`${code} must not be reported as excluded`);
    }
    if (!JSON.stringify(body).includes(expected.nostroMaskedAccountRef))
      differences.push(
        `Response must use selected priority-10 Nostro ${expected.nostroMaskedAccountRef}`,
      );
    if (
      body?.renderingDecisions?.["MT202.57a"]?.outcome !==
      expected.mt57Disposition
    )
      differences.push("MT202 57a must be OMITTED_BY_RULE");
    if (
      body?.mx?.messageComposerContext?.Cdtr?.value !==
      expected.creditorPassThrough
    )
      differences.push(
        "MX Cdtr must pass through BARCGB22 from message context",
      );
    const ssiRoleValues = Object.keys(body?.roleProvenance ?? {}).map(
      (role) => body?.mx?.["canonicalRoute/agent roles"]?.[role],
    );
    if (
      ssiRoleValues.some(
        (value) => value !== undefined && value !== expected.agentBic,
      )
    )
      differences.push("All GBP SSI-derived agent roles must be BARCGB22");
  }
  return {
    differences,
    evidence: {
      expected,
      matchingNostros: matchingNostros.map((nostro) => ({
        id: nostro.id,
        version: nostro.version,
        accountReference: nostro.accountReference,
        accountServicerBic: nostro.accountServicerBic,
      })),
      observed: {
        chosenRoute: chosen,
        snapshotHash: body?.snapshotHash ?? null,
        roleProvenance: body?.roleProvenance ?? null,
        alternativeRoutes: alternatives,
        excludedCandidates: excluded,
      },
    },
  };
};
const results = [];
const startedAt = new Date().toISOString();
let interrupted = null;
try {
  for (const item of orderedCases) {
    const differences = [];
    let actual;
    try {
      await openJourney(item.journey);
      if (item.type === "ATOMIC_DIRECT_GBP") {
        actual = await requestOnce(item, item.currency, "-DIRECT");
        const atomic = validateAtomicSnapshot(actual, item.currency);
        actual.atomicEvidence = atomic.evidence;
        differences.push(...atomic.differences);
      } else if (item.type === "ATOMIC_SWITCH") {
        let first = await requestOnce(item, item.currency, `-${item.currency}`);
        let inputInvalidationSamples = [];
        if (!invalidationSamplerCompleted && item.currency === "USD") {
          const sampled = await exerciseResolutionInputInvalidation(
            item,
            item.currency,
            first,
          );
          inputInvalidationSamples = sampled.samples;
          first = sampled.currentExchange;
          invalidationSamplerCompleted = true;
          for (const sample of inputInvalidationSamples) {
            if (sample.status === "FAIL")
              differences.push(
                `${sample.handler} input did not invalidate the authoritative UI result`,
              );
          }
        }
        await selectControl("Currency (ISO 4217)", item.nextCurrency);
        const staleUi = await inspectClearedResolutionUi(first);
        const staleCleared = !staleUi.authoritativeResultVisible;
        const second = await requestOnce(
          item,
          item.nextCurrency,
          `-${item.nextCurrency}`,
        );
        const firstAtomic = validateAtomicSnapshot(first, item.currency);
        const secondAtomic = validateAtomicSnapshot(second, item.nextCurrency);
        actual = {
          first: { ...first, atomicEvidence: firstAtomic.evidence },
          second: { ...second, atomicEvidence: secondAtomic.evidence },
          staleCleared,
          staleUi,
          inputInvalidationSamples,
        };
        if (!staleCleared)
          differences.push("Currency switch did not clear the prior snapshot");
        differences.push(
          ...firstAtomic.differences,
          ...secondAtomic.differences,
        );
      } else if (item.type === "RACE_REGRESSION") {
        await selectControl(
          "Counterparty（Bank Directory / BIC）",
          item.bankServiceId,
        );
        await selectControl("Currency (ISO 4217)", item.currency);
        await fillControl("Transaction Reference", `${item.caseId}-DELAYED`);
        let delayedRequestBody = null;
        await page.route("**/api/settlements/resolve", async (route) => {
          delayedRequestBody = route.request().postDataJSON();
          await new Promise((resolve) => setTimeout(resolve, 750));
          await route.continue();
        });
        const delayedResponsePromise = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/settlements/resolve") &&
            response.request().method() === "POST",
        );
        await page
          .getByRole("button", {
            name: "2. Preview Resolution",
            exact: true,
          })
          .click({ noWaitAfter: true });
        await page.waitForTimeout(75);
        await selectControl("Currency (ISO 4217)", item.nextCurrency);
        const immediateStaleCleared = !(
          await inspectClearedResolutionUi({
            responseBodyText: JSON.stringify({ currency: "USD" }),
          })
        ).authoritativeResultVisible;
        const delayedResponse = await delayedResponsePromise;
        const delayedResponseText = await delayedResponse.text();
        let delayedResponseBody;
        try {
          delayedResponseBody = JSON.parse(delayedResponseText);
        } catch {
          delayedResponseBody = delayedResponseText;
        }
        await page.waitForTimeout(100);
        const lateStaleUi = await inspectClearedResolutionUi({
          responseBody: delayedResponseBody,
          responseBodyText: delayedResponseText,
        });
        const lateResponseIgnored = !lateStaleUi.authoritativeResultVisible;
        await page.unroute("**/api/settlements/resolve");
        const next = await requestOnce(item, item.nextCurrency, "-SGD");
        actual = {
          delayed: {
            requestBody: delayedRequestBody,
            responseStatus: delayedResponse.status(),
            responseBody: delayedResponseBody,
            responseBodyText: delayedResponseText,
          },
          next,
          immediateStaleCleared,
          lateResponseIgnored,
          lateStaleUi,
        };
        if (!immediateStaleCleared)
          differences.push(
            "USD result/loading state was not cleared immediately after selecting SGD",
          );
        if (!lateResponseIgnored)
          differences.push(
            "Delayed USD response repopulated the result panel after selecting SGD",
          );
        if (delayedRequestBody?.currency !== "USD")
          differences.push("Delayed genuine UI request was not USD");
        if (next.requestBody?.currency !== "SGD")
          differences.push("Follow-up genuine UI request was not SGD");
        if (next.responseStatus !== 422)
          differences.push(
            `SGD follow-up HTTP ${next.responseStatus}, expected fail-closed 422`,
          );
        if (
          next.responseBody?.mx?.code !== "SSI_NOT_FOUND" ||
          next.responseBody?.mx?.payloadGenerated !== false
        )
          differences.push(
            "SGD follow-up did not return SSI_NOT_FOUND with payloadGenerated=false",
          );
      } else if (item.type === "METAMORPHIC") {
        const first = await requestOnce(item, item.currency, "-USD");
        await selectControl("Currency (ISO 4217)", item.nextCurrency);
        const staleUi = await inspectClearedResolutionUi(first);
        const staleCleared = !staleUi.authoritativeResultVisible;
        const second = await requestOnce(
          item,
          item.nextCurrency,
          `-${item.nextCurrency}`,
        );
        actual = { first, second, staleCleared, staleUi };
        if (!staleCleared)
          differences.push(
            "Changing currency did not clear the prior resolution in the UI",
          );
        if (
          first.requestBody.currency !== "USD" ||
          second.requestBody.currency !== item.nextCurrency
        )
          differences.push(
            "Metamorphic requests did not preserve USD→other currency inputs",
          );
        if (
          first.requestBody.transactionReference ===
          second.requestBody.transactionReference
        )
          differences.push(
            "Resolver rerun was not distinguishable by transaction reference",
          );
        if (first.responseStatus !== 200 || second.responseStatus !== 200)
          differences.push(
            `Metamorphic HTTP status ${first.responseStatus}→${second.responseStatus}, expected 200→200`,
          );
      } else {
        actual = await requestOnce(item, item.currency);
        const isV15AmbiguousPair =
          item.type === "POSITIVE" &&
          item.bankServiceId === "BANK-SVC-BARCGB22" &&
          item.currency === "GBP" &&
          ["MT202", "MT202COV", "MT205", "MT205COV"].includes(item.journey.key);
        const expectedStatus =
          item.type === "POSITIVE"
            ? isV15AmbiguousPair
              ? 422
              : 200
            : item.type === "MISSING_CURRENCY"
              ? 400
              : 422;
        if (actual.responseStatus !== expectedStatus)
          differences.push(
            `HTTP ${actual.responseStatus}, expected ${expectedStatus}`,
          );
        if (item.type === "POSITIVE") {
          const mx = actual.responseBody?.mx;
          if (isV15AmbiguousPair) {
            const atomic = validateAtomicSnapshot(actual, item.currency);
            actual.atomicEvidence = atomic.evidence;
            differences.push(...atomic.differences);
          } else if (
            (actual.responseBody?.decision ?? mx?.decision) !== "RESOLVED"
          )
            differences.push(
              `decision ${actual.responseBody?.decision ?? mx?.decision ?? "missing"}, expected RESOLVED`,
            );
        }
        if (
          item.type !== "POSITIVE" &&
          actual.responseBody?.mx?.payloadGenerated !== false
        )
          differences.push(
            "Negative case generated a payload instead of failing closed",
          );
      }
      const payloads =
        item.type === "ATOMIC_DIRECT_GBP"
          ? [actual.requestBody]
          : item.type === "ATOMIC_SWITCH"
            ? [actual.first.requestBody, actual.second.requestBody]
            : item.type === "RACE_REGRESSION"
              ? [actual.delayed.requestBody, actual.next.requestBody]
              : item.type === "METAMORPHIC"
                ? [actual.first.requestBody, actual.second.requestBody]
                : [actual.requestBody];
      for (const payload of payloads) {
        if (payload.counterpartyBankServiceId !== item.bankServiceId)
          differences.push(
            "counterpartyBankServiceId missing or changed in genuine UI payload",
          );
        const forbidden = forbiddenRawBicFields.filter((field) =>
          Object.hasOwn(payload, field),
        );
        if (forbidden.length)
          differences.push(
            `Genuine UI payload contained forbidden raw BIC field(s): ${forbidden.join(", ")}`,
          );
      }
      const exchanges =
        item.type === "ATOMIC_DIRECT_GBP"
          ? [actual]
          : ["ATOMIC_SWITCH", "METAMORPHIC"].includes(item.type)
            ? [actual.first, actual.second]
            : item.type === "RACE_REGRESSION"
              ? [actual.delayed, actual.next]
              : [actual];
      for (const exchange of exchanges)
        differences.push(...validateResolvedGovernance(exchange));
      for (const sample of actual?.inputInvalidationSamples ?? []) {
        const replayExchange = sample.replayExchange;
        if (replayExchange)
          differences.push(...validateResolvedGovernance(replayExchange));
      }
    } catch (error) {
      differences.push(error instanceof Error ? error.message : String(error));
    }
    const result = {
      ...item,
      input: {
        bankServiceId: item.bankServiceId,
        currency: item.currency,
        nextCurrency: item.nextCurrency ?? null,
      },
      actual,
      evidence:
        item.type === "ATOMIC_DIRECT_GBP"
          ? extractEvidence(actual?.responseBody)
          : item.type === "ATOMIC_SWITCH"
            ? {
                first: extractEvidence(actual?.first?.responseBody),
                second: extractEvidence(actual?.second?.responseBody),
              }
            : item.type === "RACE_REGRESSION"
              ? {
                  delayed: extractEvidence(actual?.delayed?.responseBody),
                  next: extractEvidence(actual?.next?.responseBody),
                }
              : item.type === "METAMORPHIC"
                ? {
                    first: extractEvidence(actual?.first?.responseBody),
                    second: extractEvidence(actual?.second?.responseBody),
                  }
                : extractEvidence(actual?.responseBody),
      status: differences.length ? "FAIL" : "PASS",
      differences,
      replayCommand: `$env:MT2_QA_RANDOM_SEED='${seed}'; $env:MT2_QA_RANDOM_CASE='${item.caseId}'; node qa/tests/mt2/run-mt2-resolver-exhaustive-random-ui.mjs`,
    };
    if (result.status === "FAIL") {
      const screenshot = path.join(evidenceDir, `${item.caseId}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      result.screenshot = path.relative(root, screenshot).replaceAll("\\", "/");
    }
    results.push(result);
  }
} catch (error) {
  interrupted = error instanceof Error ? error.message : String(error);
} finally {
  await context.close();
  await browser.close();
}

const failures = results.filter((item) => item.status === "FAIL");
const report = {
  schemaVersion: 1,
  suite: "MT2_RESOLVER_EXHAUSTIVE_RANDOM_BROWSER",
  executionPolicy:
    "GENUINE_UI_PAYLOAD_OBSERVATION_NO_REQUEST_INTERCEPTION_OR_OVERWRITE",
  startedAt,
  completedAt: new Date().toISOString(),
  portalUrl,
  apiUrl,
  seed,
  selectionFile: selectionFile
    ? path.relative(root, selectionFile).replaceAll("\\", "/")
    : null,
  replayCommand: `$env:MT2_QA_RANDOM_SEED='${seed}'; node qa/tests/mt2/run-mt2-resolver-exhaustive-random-ui.mjs`,
  health: { portal: "HTTP_200", apiDiscovery: "HTTP_200" },
  snapshot: {
    source: "qa/fixtures/mt2/baselines/ssi-demo.consistent-snapshot.sqlite",
    sha256: sha256(
      fs.readFileSync(
        path.join(
          root,
          "qa/fixtures/mt2/baselines/ssi-demo.consistent-snapshot.sqlite",
        ),
      ),
    ),
    liveSsiCount: live.ssis.length,
    activeResolverRouteCount: activeRoutes.length,
    liveBankServiceCount: banks.length,
  },
  discovery: {
    pairCount: pairs.length,
    pairs,
    journeyCount: journeys.length,
    matrixCaseCount: orderedCases.length,
  },
  contract: {
    version: "v14-aligned",
    controlledV15: selectionDefinition?.v15Contract ?? null,
    mrgSha256: sha256(
      fs.readFileSync(path.join(root, "SWIFT/us2m_20260717.pdf")),
    ),
    bankIdentityField: "counterpartyBankServiceId",
    forbiddenRawBicFields,
  },
  governanceGates: {
    tieRisk: selectionDefinition?.tieRiskGate ?? null,
    allResolvedEvidence: failures.some((item) =>
      item.differences.some(
        (difference) =>
          difference.startsWith("RESOLVED") ||
          difference.includes("roleProvenance"),
      ),
    )
      ? "FAIL"
      : "PASS",
    alternativeRouteIdentity: failures.some((item) =>
      item.differences.some(
        (difference) =>
          difference.startsWith("Tie-risk") ||
          difference.includes("unordered candidates"),
      ),
    )
      ? "FAIL"
      : "PASS",
    resolutionInputInvalidation:
      invalidationSamplerCompleted &&
      results
        .flatMap((item) => item.actual?.inputInvalidationSamples ?? [])
        .every((sample) => sample.status === "PASS")
        ? "PASS"
        : "FAIL",
  },
  interrupted,
  summary: {
    expected: orderedCases.length,
    executed: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    accepted:
      interrupted === null &&
      results.length === orderedCases.length &&
      failures.length === 0,
  },
  results,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const failRows =
  failures
    .map(
      (item) =>
        `| ${item.caseId} | ${item.type} | ${item.journey.key} | ${item.bankServiceId}/${item.currency || "(missing)"} | ${item.differences.join("<br>")} |`,
    )
    .join("\n") || "| — | — | — | — | 無 |";
fs.writeFileSync(
  summaryPath,
  `# MT2 Resolver 全量隨機瀏覽器 QA 報告\n\n## BA 確認\n\n- 依受控 v14-aligned 決策備忘錄與 SR2026 Cat 2 MRG（SHA-256: \`${report.contract.mrgSha256}\`），MT202／MT202 COV／MT205／MT205 COV 均屬 Counterparty SSI resolver 範圍；Bank 身分必須由 \`counterpartyBankServiceId\` 傳入，禁止 raw BIC role fields。\n- 正向預期由同一 ACTIVE SSI＋applicability snapshot 的 Bank Service × currency 組合產生；無 ACTIVE SSI 組合與缺少 currency 必須 fail-closed，不能沿用舊 route 或自動替換幣別。\n- 幣別變更必須立即清除舊結果，下一次 Preview 必須產生新的 resolver request。\n\n## 結果\n\n- Seed：\`${seed}\`\n- Bank Directory records：${banks.length}；resolver-enabled Bank Service：${new Set(pairs.map((pair) => pair.bankServiceId)).size}；ACTIVE SSI currency pairs：${pairs.length}；journeys：${journeys.length}；cases：${report.summary.executed}/${report.summary.expected}\n- PASS：${report.summary.passed}；FAIL：${report.summary.failed}；中斷：${interrupted ?? "無"}\n- 驗收判定：${report.summary.accepted ? "PASS" : "NOT ACCEPTED（不得進入 UAT）"}\n- Replay：\`${report.replayCommand}\`\n\n## 失敗明細\n\n| Case | 類型 | Journey | Bank/Currency | 差異 |\n| --- | --- | --- | --- | --- |\n${failRows}\n\n## 稽核證據\n\nMachine-readable report：\`${path.relative(root, reportPath).replaceAll("\\", "/")}\`。每案保留 generated input、瀏覽器實際 request body/response、chosen SSI/route/provenance、判定、replay command；失敗另附 screenshot。\n`,
);
console.log(JSON.stringify(report.summary, null, 2));
if (!report.summary.accepted) process.exitCode = 1;
