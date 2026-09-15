import { chromium } from "@playwright/test";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitForColumnSort = (page, label, direction) => page.waitForFunction(
  ({ label, direction }) => [...document.querySelectorAll("th")].some((header) =>
    header.textContent?.includes(label) && header.getAttribute("aria-sort") === direction),
  { label, direction },
);
const artifactRoot = process.env.SSI_UI_ARTIFACT_ROOT ?? "C:/Users/samfi/OneDrive/Documents/ChatGPT/Baseline-SSI/artifacts";
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(process.env.PORTAL_URL ?? "http://localhost:4600/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "SWIFT Data Service", exact: true }).click();
  await page.locator(".resource-tabs").waitFor();
  const resources = (await page.locator(".resource-tabs button").allTextContents()).map((item) => item.trim());
  assert(JSON.stringify(resources) === JSON.stringify(["RMA Authorisation", "Entities", "Nostro Account"]), `SWIFT Data resources mismatch: ${JSON.stringify(resources)}`);
  const swiftDataCopy = await page.locator("ssi-swift-data-crud").innerText();
  assert(!swiftDataCopy.includes("RMA、SSI、Nostro"), "SWIFT Data Service retains stale SSI resource copy");
  await page.screenshot({ path: `${artifactRoot}/swift-data-without-ssi.png`, fullPage: true });

  await page.getByRole("button", { name: "SSI Maintenance", exact: true }).click();
  await page.getByRole("heading", { name: "SSI 維護總覽" }).waitFor();
  const ownTab = page.getByRole("button", { name: "Own SSI／本行 SSI" });
  const counterpartyTab = page.getByRole("button", { name: "Counterparty SSI／對手行 SSI" });
  await ownTab.click();
  const ssiRows = page.locator("tbody tr[data-ownership-type]");
  assert(await ssiRows.count() > 0 && await ssiRows.count() <= 10, "OWN flat list must be non-empty and page size 10");
  assert(await ssiRows.evaluateAll(items => items.every(item => item.dataset.ownershipType === "OWN")), "counterparty row leaked into OWN index");
  assert(await page.getByLabel("Sort SSI ownership index").count() === 0, "redundant Own SSI Sort-by dropdown remains");
  const ownershipSearch = page.getByLabel("Search SSI ownership index");
  await ownershipSearch.fill("USD");
  const versionHeader = page.getByRole("button", { name: /^Version/ });
  await versionHeader.click();
  await waitForColumnSort(page, "Version", "ascending");
  assert(await ownershipSearch.inputValue() === "USD", "Own header sort must preserve search query");
  const ownVersionsAscending = await ssiRows.locator("td:nth-child(8)").allTextContents();
  const parsedOwnVersionsAscending = ownVersionsAscending.map(value => Number(value.replace("v", "")));
  assert(parsedOwnVersionsAscending.every((value, index, values) => index === 0 || values[index - 1] <= value), "Own versions are not numerically ascending");
  await versionHeader.press("Enter");
  await waitForColumnSort(page, "Version", "descending");
  assert(await page.getByRole("columnheader", { name: /^Version/ }).getAttribute("aria-sort") === "descending", "Own keyboard header activation did not toggle descending");
  await ownershipSearch.fill("");
  await page.screenshot({ path: `${artifactRoot}/own-ssi-sortable-headers.png`, fullPage: true });

  await counterpartyTab.click();
  await page.getByRole("heading", { name: "Counterparty Inbox" }).waitFor();
  const inboxRows = page.locator("tr[data-counterparty-bic]");
  assert(await inboxRows.count() === 10, `Counterparty Inbox first page must render 10 rows, got ${await inboxRows.count()}`);
  const firstPageBics = await inboxRows.evaluateAll(items => items.map(item => item.dataset.counterpartyBic));
  assert(new Set(firstPageBics).size === firstPageBics.length, "Counterparty Inbox contains duplicate counterparties");
  await page.screenshot({ path: `${artifactRoot}/counterparty-ssi-inbox.png`, fullPage: true });
  await page.getByRole("button", { name: "下一頁", exact: true }).click();
  await page.getByText(/Page 2 \/ 2 · 12 counterparties/).waitFor();
  assert(await inboxRows.count() === 2, "Counterparty Inbox second page count mismatch");
  assert(await page.getByLabel("Sort Counterparty Inbox").count() === 0, "redundant Counterparty Sort-by dropdown remains");
  const countryHeader = page.getByRole("button", { name: /^Country/ });
  await countryHeader.press("Enter");
  await page.getByText(/Page 1 \/ 2 · 12 counterparties/).waitFor();
  await waitForColumnSort(page, "Country", "ascending");
  assert(await page.getByRole("columnheader", { name: /^Country/ }).getAttribute("aria-sort") === "ascending", "header sort did not reset page or expose ascending semantics");
  await countryHeader.click();
  await waitForColumnSort(page, "Country", "descending");
  assert(await page.getByRole("columnheader", { name: /^Country/ }).getAttribute("aria-sort") === "descending", "second header click did not toggle descending");
  const ssiCountHeader = page.getByRole("button", { name: /^SSI Count/ });
  await ssiCountHeader.click();
  await waitForColumnSort(page, "SSI Count", "ascending");
  const countsAscending = (await inboxRows.locator("td:nth-child(3)").allTextContents()).map(Number);
  assert(countsAscending.every((value, index, values) => index === 0 || values[index - 1] <= value), "SSI counts are not numerically ascending");
  await ssiCountHeader.click();
  await waitForColumnSort(page, "SSI Count", "descending");
  const countsDescending = (await inboxRows.locator("td:nth-child(3)").allTextContents()).map(Number);
  assert(countsDescending.every((value, index, values) => index === 0 || values[index - 1] >= value), "SSI counts are not numerically descending");

  const search = page.getByLabel("Search Counterparty Inbox");
  await search.fill("BARC");
  assert((await page.getByText(/Page 1 \/ 1 · 1 counterparties/).count()) === 1, "Inbox search must reset to page 1");
  await page.getByRole("button", { name: /^Last Verified/ }).click();
  await page.getByRole("button", { name: "Open BARCGB22 SSI" }).click();
  await page.getByText(/BARCGB22 · Barclays Bank PLC/).waitFor();
  assert(await ssiRows.count() > 0 && await ssiRows.count() <= 10, "selected counterparty detail must page SSI rows by 10");
  assert(await ssiRows.evaluateAll(items => items.every(item => item.dataset.ownershipType === "COUNTERPARTY")), "OWN row leaked into counterparty detail");
  assert((await ssiRows.allTextContents()).every(text => !text.includes("DEUTDEFF")), "another counterparty SSI leaked into selected detail");
  assert(await page.getByRole("button", { name: "檢視" }).count() >= 1, "detail lifecycle actions missing");

  const backToCounterpartyIndex = page.getByRole("button", { name: "← Back to Counterparty Index / 返回對手行索引", exact: true });
  await backToCounterpartyIndex.waitFor();
  await page.screenshot({ path: `${artifactRoot}/counterparty-ssi-detail-back-button.png`, fullPage: true });
  await backToCounterpartyIndex.click();
  assert(await search.inputValue() === "BARC", "return to Inbox did not preserve query");
  assert(await page.getByRole("columnheader", { name: /^Last Verified/ }).getAttribute("aria-sort") === "ascending", "return to Inbox did not preserve sort");

  await search.fill("No SSI");
  assert(await inboxRows.count() === 2, "both no-SSI Bank Directory counterparties must remain visible");
  for (const bic of ["NSSIUSN1", "NSSIGB2X"]) {
    const row = inboxRows.filter({ has: page.getByText(bic, { exact: true }) });
    assert((await row.innerText()).includes("NO SSI COVERAGE"), `${bic} missing zero-coverage summary`);
  }
  await page.getByRole("button", { name: "Open NSSIUSN1 SSI" }).click();
  await page.getByText(/NSSIUSN1 · Northstar Demo Bank/).waitFor();
  assert(await ssiRows.count() === 0, "no-SSI counterparty must not retain previous detail rows");
  assert((await page.locator(".empty").innerText()).includes("尚無目前有效資料"), "no-SSI detail missing clear empty state");
  assert(!(await page.locator("body").innerText()).includes("BARCGB22 · Barclays Bank PLC"), "stale previous party header survived switch");

  await page.getByRole("button", { name: "← Back to Counterparty Index / 返回對手行索引", exact: true }).click();
  assert(await search.inputValue() === "No SSI", "no-SSI detail return did not preserve Inbox query");
  await inboxRows.first().press("Enter");
  await page.getByRole("button", { name: "← Back to Counterparty Index / 返回對手行索引", exact: true }).waitFor();

  const activeCounts = await page.evaluate(async () => {
    const data = await (await fetch("http://localhost:3100/api/ssis")).json();
    const active = data.filter(item => item.status === "ACTIVE");
    const ownership = item => item.ownershipType ?? (item.route?.counterpartyBic === "ANY" ? "OWN" : "COUNTERPARTY");
    return { all: active.length, own: active.filter(item => ownership(item) === "OWN").length, counterparty: active.filter(item => ownership(item) === "COUNTERPARTY").length };
  });
  assert(activeCounts.own + activeCounts.counterparty === activeCounts.all, "Own + Counterparty must equal All active records");
  console.log(JSON.stringify({ suite: "ssi-ownership-indexes", swiftDataResources: resources, counterpartyInbox: { total: 12, pageSize: 10, unique: true, zeroCoverageBanks: 2, keyboardOpen: true }, isolation: true, preservedInboxState: true, activeCountInvariant: activeCounts }));
} finally { await browser.close(); }
