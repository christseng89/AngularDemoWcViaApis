import { chromium } from "@playwright/test";

const api = process.env.BFF_URL ?? "http://localhost:3100/api";
const portal = process.env.PORTAL_URL ?? "http://localhost:4600/";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const post = async (path, body) => {
  const response = await fetch(`${api}/${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return { data: text ? JSON.parse(text) : {}, response };
};

const fieldRequest = {
  service: "FIN", resolutionMode: "TRADE_FINANCE", standardsRelease: "SR2026",
  messageType: "MT742", direction: "OUTGOING", businessFunction: "REIMBURSEMENT_CLAIM",
  sequence: "MESSAGE", settlementLeg: "Message", transactionReference: "SPLIT-FIN-001",
  currency: "USD", receiverBic: "CHASUS33", bookingEntity: "HK01", valueDate: "2026-09-08",
  roles: { ACCOUNT_WITH_INSTITUTION: "CHASUS33" },
  roleSources: { ACCOUNT_WITH_INSTITUTION: "SYNTHETIC_DEMO" },
  roleEvidence: { ACCOUNT_WITH_INSTITUTION: {
    ownerSide: "RECEIVER_SIDE", sourceType: "SYNTHETIC_DEMO", sourceRecordId: "SYN-MT742-SPLIT-001",
    version: "1", status: "ACTIVE", approvalStatus: "APPROVED", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31",
  } },
};
const { data: primary } = await post("reference/fin-tag-resolutions", fieldRequest);
assert(primary.usage === "REFERENCE_ONLY" && primary.paymentExecutable === false && primary.confirmationSupported === false, "FIN field Resolution gained payment authority");
assert(!primary.resolutionToken && !primary.snapshotHash && !primary.attemptId, "FIN field Resolution returned settlement authority");
const { data: legacy, response: legacyResponse } = await post("reference/fin-tag-suggestions", fieldRequest);
assert(legacyResponse.headers.get("deprecation") === "true", "Legacy adapter deprecation header missing");
assert(legacy.watermark === "NOT FOR PAYMENT RELEASE" && legacy.paymentExecutable === false, "Legacy adapter reference-only boundary broken");
assert(legacy.suggestions.some((field) => field.tag === "57" && field.value === "CHASUS33"), "Legacy adapter result drifted from primary endpoint");

const settlementRequest = {
  consumer: "TRADE_FINANCE", product: "IMPORT_LC", businessFunction: "IMPORT_LC_BANK_REIMBURSEMENT",
  paymentLeg: "BANK_REIMBURSEMENT", direction: "OUTBOUND", counterpartyBic: "CHASUS33",
  counterpartyCountry: "US", currency: "USD", bookingEntity: "GB01", valueDate: "2026-09-07",
  amount: "1000000", messageType: "pacs.009.001.12", transactionReference: "SPLIT-PAYMENT-001",
};
const { data: preview } = await post("settlements/resolve", settlementRequest);
assert(preview.useCase === "PAYMENT_SSI" && preview.paymentExecutable === false && preview.recommendedRoute, "Existing MT2/MX settlement preview regressed");
const { data: confirmation } = await post(`settlements/${preview.attemptId}/confirm`, {
  selectedSsiId: preview.recommendedRoute.ssiId, actor: "e2e.split",
});
assert(confirmation.paymentExecutable === true && confirmation.resolutionToken && confirmation.snapshotHash, "Existing MT2/MX confirm semantics regressed");

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(portal, { waitUntil: "networkidle" });
  assert(await page.getByRole("button", { name: "SSI Suggestion", exact: true }).count() === 0, "Deprecated Suggestion remains active in UI");
  await page.getByRole("button", { name: "Payment SSI Resolution · MT2 / MX", exact: true }).click();
  await page.getByRole("radio", { name: "MT" }).waitFor();
  assert(await page.getByRole("radio", { name: "MX" }).count() === 1, "Existing MX output selector missing");
  await page.getByRole("button", { name: "Treasury SSI Resolution", exact: true }).click();
  assert(await page.getByText("14 SWIFT messages", { exact: false }).count() === 1, "Treasury MT3 index missing");
  await page.getByRole("button", { name: "Trade Finance SSI Resolution", exact: true }).click();
  assert(await page.getByText("11 SWIFT messages", { exact: false }).count() === 1, "Trade Finance MT4/MT7 index missing");
} finally {
  await browser.close();
}

console.log(JSON.stringify({ finFieldResolution: "REFERENCE_ONLY", legacySuggestion: "DEPRECATED_ADAPTER", settlementPreview: "UNCHANGED", settlementConfirm: "UNCHANGED", uiSplit: "PASS" }, null, 2));
