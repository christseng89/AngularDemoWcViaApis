import { chromium } from "@playwright/test";

const api = process.env.BFF_URL ?? "http://localhost:3100/api";
const portal = process.env.PORTAL_URL ?? "http://localhost:4600/";
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const post = async (path, body, expectedStatus = 201) => {
  const response = await fetch(`${api}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  assert(
    response.status === expectedStatus,
    `${path}: expected ${expectedStatus}, got ${response.status}: ${text}`,
  );
  return { data, response };
};
const evidence = (ownerSide, sourceRecordId, canonicalRouteNodeId) => ({
  ownerSide,
  sourceType: "SYNTHETIC_DEMO",
  sourceRecordId,
  version: "1",
  status: "ACTIVE",
  approvalStatus: "APPROVED",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2027-12-31",
  ...(canonicalRouteNodeId ? { canonicalRouteNodeId } : {}),
});
const base = {
  service: "FIN",
  standardsRelease: "SR2026",
  direction: "OUTGOING",
  transactionReference: "FIN-RESOLUTION-E2E-001",
  currency: "USD",
  receiverBic: "CHASUS33",
  bookingEntity: "HK01",
  valueDate: "2026-09-08",
  sourceSsiId: "SYN-FIN-E2E-001",
};

const treasuryRequest = {
  ...base,
  resolutionMode: "TREASURY",
  messageType: "MT300",
  businessFunction: "FX_CONFIRMATION",
  sequence: "B1",
  settlementLeg: "Amount Bought",
  roles: {
    DELIVERY_AGENT: "BARCGB22",
    INTERMEDIARY_INSTITUTION: "BARCGB22",
    RECEIVING_AGENT: "SCBLGB2L",
  },
  roleSources: {
    DELIVERY_AGENT: "SYNTHETIC_DEMO",
    INTERMEDIARY_INSTITUTION: "SYNTHETIC_DEMO",
    RECEIVING_AGENT: "SYNTHETIC_DEMO",
  },
  roleEvidence: {
    DELIVERY_AGENT: evidence(
      "SENDER_SIDE",
      "SYN-MT300-GBP-001",
      "NODE-BARC-GBP",
    ),
    INTERMEDIARY_INSTITUTION: evidence(
      "SENDER_SIDE",
      "SYN-MT300-GBP-001",
      "NODE-BARC-GBP",
    ),
    RECEIVING_AGENT: evidence(
      "RECEIVER_SIDE",
      "SYN-MT300-GBP-001",
      "NODE-SCBL-GBP",
    ),
  },
};
const { data: treasury } = await post(
  "reference/fin-tag-resolutions",
  treasuryRequest,
);
assert(
  treasury.useCase === "TREASURY_SSI_RESOLUTION",
  "Treasury use case mismatch",
);
assert(
  treasury.paymentExecutable === false &&
    treasury.confirmationSupported === false,
  "Treasury reference-only boundary broken",
);
assert(
  treasury.resolvedFields.length === 4,
  "MT300 audit field count mismatch",
);
assert(
  treasury.resolvedFields.some(
    (field) =>
      field.tag === "53" &&
      field.resolutionStatus === "RESOLVED" &&
      field.resolvedValue === "BARCGB22",
  ),
  "MT300 delivery agent missing",
);
assert(
  treasury.resolvedFields.some(
    (field) =>
      field.tag === "56" &&
      field.resolutionStatus === "NOT_REQUIRED" &&
      field.reasonCode === "ROUTE_COMPLETE" &&
      field.resolvedValue === null &&
      field.provenance.source === "ROUTE_RESOLVER" &&
      field.provenance.ownerSide === "CANONICAL_ROUTE",
  ),
  "MT300 duplicate intermediary was not normalized",
);
assert(
  treasury.resolvedFields.some(
    (field) =>
      field.tag === "57" &&
      field.resolutionStatus === "RESOLVED" &&
      field.resolvedValue === "SCBLGB2L",
  ),
  "MT300 receiving agent missing",
);
assert(
  treasury.resolvedFields.some(
    (field) =>
      field.tag === "58" &&
      field.scopeStatus === "OUT_OF_SSI_SCOPE" &&
      field.resolutionStatus === "N_A" &&
      field.reasonCode === "MESSAGE_PROFILE_EXCLUDED" &&
      field.resolvedValue === null,
  ),
  "MT300 profile-excluded 58A audit disposition missing",
);
assert(
  treasury.resolvedFields.every(
    (field) => field.officialFieldName && field.provenance.sourceArtifactHash,
  ),
  "MT300 evidence/provenance missing",
);

const tradeRequest = {
  ...base,
  resolutionMode: "TRADE_FINANCE",
  messageType: "MT742",
  businessFunction: "REIMBURSEMENT_CLAIM",
  sequence: "MESSAGE",
  settlementLeg: "Message",
  roles: { ACCOUNT_WITH_INSTITUTION: "CHASUS33" },
  roleSources: { ACCOUNT_WITH_INSTITUTION: "SYNTHETIC_DEMO" },
  roleEvidence: {
    ACCOUNT_WITH_INSTITUTION: evidence("RECEIVER_SIDE", "SYN-MT742-57-001"),
  },
};
const { data: trade } = await post(
  "reference/fin-tag-resolutions",
  tradeRequest,
);
assert(
  trade.useCase === "TRADE_FINANCE_SSI_RESOLUTION",
  "Trade Finance use case mismatch",
);
assert(
  trade.resolvedFields.some(
    (field) => field.tag === "57" && field.resolvedValue === "CHASUS33",
  ),
  "MT742 57a resolution missing",
);
assert(
  trade.resolvedFields.some(
    (field) =>
      field.tag === "58" &&
      field.scopeStatus === "OUT_OF_SSI_SCOPE" &&
      field.resolutionStatus === "N_A",
  ),
  "MT742 transaction field scope missing",
);

const mt760Request = {
  ...base,
  resolutionMode: "TRADE_FINANCE",
  messageType: "MT760",
  businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
  sequence: "B",
  settlementLeg: "B",
  roles: {},
  roleEvidence: {},
};
const { data: mt760 } = await post(
  "reference/fin-tag-resolutions",
  mt760Request,
  400,
);
assert(
  mt760.code === "NOT_SUPPORTED" && mt760.messageType === "MT760",
  "MT760 must return NOT_SUPPORTED",
);

const { data: legacy, response: legacyResponse } = await post(
  "reference/fin-tag-suggestions",
  tradeRequest,
);
assert(
  legacyResponse.headers.get("deprecation") === "true",
  "Deprecated adapter header missing",
);
assert(
  legacy.suggestions.some(
    (item) => item.tag === "57" && item.value === "CHASUS33",
  ),
  "Deprecated adapter drifted from primary result",
);
await post(
  "reference/fin-tag-resolutions",
  { ...treasuryRequest, messageType: "MT202" },
  400,
);
await post(
  "reference/fin-tag-resolutions",
  { ...treasuryRequest, messageType: "pacs.009.001.12" },
  400,
);

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(portal, { waitUntil: "networkidle" });
  assert(
    (await page
      .getByRole("button", { name: "Treasury SSI Resolution", exact: true })
      .count()) === 1,
    "Treasury navigation missing",
  );
  assert(
    (await page
      .getByRole("button", {
        name: "Trade Finance SSI Resolution",
        exact: true,
      })
      .count()) === 1,
    "Trade Finance navigation missing",
  );
  assert(
    (await page
      .getByRole("button", { name: "SSI Suggestion", exact: true })
      .count()) === 0,
    "Active Suggestion UI still present",
  );

  await page
    .getByRole("button", { name: "Treasury SSI Resolution", exact: true })
    .click();
  await page.getByRole("heading", { name: "選擇 MT Message" }).waitFor();
  assert(
    (await page.getByText("14 SWIFT messages", { exact: false }).count()) === 1,
    "Treasury MT3 index count mismatch",
  );
  const treasuryMessages = [
    "MT300",
    "MT304",
    "MT305",
    "MT306",
    "MT320",
    "MT330",
    "MT340",
    "MT341",
    "MT350",
    "MT360",
    "MT361",
    "MT362",
    "MT364",
    "MT365",
  ];
  for (const messageType of treasuryMessages) {
    await page.getByLabel("Search SSI Resolution index").fill(messageType);
    const link = page.getByRole("link", { name: `Open ${messageType}` });
    assert(
      (await link.count()) === 1,
      `${messageType} missing or duplicated in Treasury index`,
    );
    await link.dblclick();
    assert(
      (await page.locator(".tag-ssi-choice").innerText()).includes(
        `Message / Direction: ${messageType} · OUTGOING`,
      ),
      `${messageType} direction/context mismatch`,
    );
    await page
      .getByRole("button", {
        name: "Resolve SSI Settlement Fields",
        exact: true,
      })
      .click();
    await page
      .getByText("SSI Resolution completed", { exact: false })
      .waitFor();
    const rows = page.locator(
      "table[aria-label='5x SSI support list'] tbody tr",
    );
    assert(
      (await rows.count()) >= 3,
      `${messageType} resolved fields not rendered`,
    );
    assert(
      (await rows
        .filter({ hasText: "Official field name pending verification" })
        .count()) === 0,
      `${messageType} officialFieldName evidence missing`,
    );
    const resolvedRows = page.locator(
      'table[aria-label="5x SSI support list"] tbody tr[data-resolution-status="RESOLVED"]',
    );
    const notRequiredRows = page.locator(
      'table[aria-label="5x SSI support list"] tbody tr[data-resolution-status="NOT_REQUIRED"]',
    );
    const notApplicableRows = page.locator(
      'table[aria-label="5x SSI support list"] tbody tr[data-resolution-status="N_A"]',
    );
    assert(
      (await resolvedRows.count()) > 0,
      `${messageType} has no resolved route endpoint`,
    );
    assert(
      (await resolvedRows.count()) +
        (await notRequiredRows.count()) +
        (await notApplicableRows.count()) ===
        (await rows.count()),
      `${messageType} has an unexpected resolution state`,
    );
    const resolvedValues = (
      await resolvedRows.locator("td:nth-child(5)").allTextContents()
    )
      .map((value) => value.trim())
      .filter(Boolean);
    assert(
      new Set(resolvedValues).size === resolvedValues.length,
      `${messageType} retained duplicate canonical route nodes`,
    );
    if (messageType === "MT300") {
      await page.getByLabel("Currency").selectOption("GBP");
      await page
        .getByText("完成左側 Input Information", { exact: true })
        .waitFor();
      assert(
        (await page
          .getByText("SSI Resolution completed", { exact: false })
          .count()) === 0 &&
          (await page
            .locator("table[aria-label='5x SSI support list'] tbody tr")
            .count()) === 0,
        "MT300 currency change retained a stale resolution",
      );
    }
    await page
      .getByRole("button", { name: "取消 / Cancel", exact: true })
      .click();
  }

  await page
    .getByRole("button", { name: "Trade Finance SSI Resolution", exact: true })
    .click();
  await page.getByText("11 SWIFT messages", { exact: false }).waitFor();
  assert(
    (await page.getByText("11 SWIFT messages", { exact: false }).count()) === 1,
    "Trade Finance index count mismatch",
  );
  assert(
    (await page.getByText(/SSI Suggestion|Suggested 5x Tags/).count()) === 0,
    "Suggestion wording remains in active UI",
  );
  await page.getByLabel("Search SSI Resolution index").fill("MT710");
  assert(
    (await page.getByRole("link", { name: "Open MT710" }).count()) === 0,
    "Unsupported MT710 must not appear in the catalogue",
  );
  await page.getByLabel("Search SSI Resolution index").fill("MT742");
  const mt742CatalogRow = page.getByRole("link", { name: "Open MT742" });
  assert(
    (await mt742CatalogRow.count()) === 1 &&
      !(await mt742CatalogRow.innerText()).includes("SSI SUPPORTED"),
    "MT742 catalogue row or redundant SSI scope column is incorrect",
  );
  for (const messageType of ["MT400", "MT742"]) {
    await page.getByLabel("Search SSI Resolution index").fill(messageType);
    await page.getByRole("link", { name: `Open ${messageType}` }).dblclick();
    await page
      .getByRole("button", {
        name: "Resolve SSI Settlement Fields",
        exact: true,
      })
      .click();
    await page
      .getByText("SSI Resolution completed", { exact: false })
      .waitFor();
    const currentCounterparty = await page
      .getByLabel("Counterparty / Receiver BIC")
      .inputValue();
    const replacement =
      currentCounterparty === "BARCGB22" ? "CHASUS33" : "BARCGB22";
    await page
      .getByLabel("Counterparty / Receiver BIC")
      .selectOption(replacement);
    await page
      .getByText("完成左側 Input Information", { exact: true })
      .waitFor();
    assert(
      (await page
        .getByText("SSI Resolution completed", { exact: false })
        .count()) === 0 &&
        (await page
          .locator("table[aria-label='5x SSI support list'] tbody tr")
          .count()) === 0,
      `${messageType} counterparty change retained a stale resolution`,
    );
    await page
      .getByRole("button", { name: "取消 / Cancel", exact: true })
      .click();
  }
  await page.screenshot({
    path: "artifacts/fin-field-resolution.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      primaryEndpoint: "PASS",
      deprecatedAdapter: "PASS",
      treasuryUi: "14/14 PASS",
      tradeFinanceUi: "11/11 PASS",
    },
    null,
    2,
  ),
);
