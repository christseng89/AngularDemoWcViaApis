import { chromium } from "@playwright/test";

const portal = process.env.PORTAL_URL ?? "http://localhost:4400/";
const screenshotPath =
  process.env.SUGGESTION_SCREENSHOT_PATH ??
  "C:/Users/samfi/OneDrive/Documents/ChatGPT/Baseline-SSI/artifacts/outward-mt400-gbp-result-side.png";
const profiles = {
  MT400: [
    ["53", "Sender's Correspondent"],
    ["54", "Receiver's Correspondent"],
    ["57", "Account With Bank"],
    ["58", "Beneficiary Bank"],
  ],
  MT730: [["57", "Account With Bank"]],
  MT734: [["57", "Account With Bank"]],
  MT742: [
    ["57", "Account With Bank"],
    ["58", "Beneficiary Bank"],
  ],
  MT750: [["57", "Account With Bank"]],
  MT752: [
    ["53", "Sender's Correspondent"],
    ["54", "Receiver's Correspondent"],
  ],
  MT754: [
    ["53", "Reimbursing Bank"],
    ["57", "Account With Bank"],
    ["58", "Beneficiary Bank"],
  ],
  MT756: [
    ["53", "Sender's Correspondent"],
    ["54", "Receiver's Correspondent"],
  ],
  MT765: [
    ["56", "Intermediary"],
    ["57", "Account With Institution"],
  ],
  MT768: [["57", "Account With Bank"]],
  MT769: [["57", "Account With Bank"]],
};
const allMessages = Object.keys(profiles);
const supportedTags = {
  MT400: ["53", "54", "57"],
  MT730: ["57"],
  MT734: ["57"],
  MT742: ["57"],
  MT750: ["57"],
  MT752: ["53", "54"],
  MT754: ["57"],
  MT756: ["53", "54"],
  MT765: ["56", "57"],
  MT768: ["57"],
  MT769: ["57"],
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(portal, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Trade Finance SSI Resolution", exact: true })
    .click();
  await page.getByRole("heading", { name: "選擇 MT Message" }).waitFor();
  const pageOne = (
    await page
      .locator(".suggestion-grid tbody tr td:first-child")
      .allTextContents()
  ).map((v) => v.trim());
  assert(
    JSON.stringify(pageOne) === JSON.stringify(allMessages.slice(0, 10)),
    "page 1 is not ten-row MT sort",
  );
  await page.getByRole("button", { name: "下一頁" }).click();
  await page.getByText("Page 2 / 2", { exact: true }).waitFor();
  const pageTwo = (
    await page
      .locator(".suggestion-grid tbody tr td:first-child")
      .allTextContents()
  ).map((v) => v.trim());
  assert(
    JSON.stringify(pageTwo) === JSON.stringify(allMessages.slice(10)),
    "page 2 MT sort mismatch",
  );
  await page.getByRole("button", { name: "上一頁" }).click();

  const open = async (messageType) => {
    const search = page.getByLabel("Search SSI Resolution index");
    await search.fill(messageType);
    const link = page.getByRole("link", { name: `Open ${messageType}` });
    assert((await link.count()) === 1, `${messageType} not unique`);
    assert(
      (await link.getByText("VERIFIED REFERENCE", { exact: true }).count()) ===
        1,
      `${messageType} profile not verified`,
    );
    await link.dblclick();
    await page.getByRole("button", { name: "取消 / Cancel" }).waitFor();
    const body = await page.locator("body").innerText();
    for (const forbidden of [
      "INCOMING",
      "REFERENCE_ONLY_IMPORT_LC",
      "REFERENCE_ONLY_EXPORT_LC",
      "選擇 exact MT scenario",
      "從左側選擇情境",
    ])
      assert(
        !body.includes(forbidden),
        `${messageType} obsolete copy ${forbidden}`,
      );
    assert(
      body.includes(`Message / Direction: ${messageType} · OUTGOING`),
      `${messageType} is not OUTGOING`,
    );
  };
  const cancel = async () => {
    await page.getByRole("button", { name: "取消 / Cancel" }).click();
    await page.locator(".suggestion-grid").waitFor();
  };

  for (const [messageType, expected] of Object.entries(profiles)) {
    console.log(`Testing ${messageType}`);
    await open(messageType);
    await page.getByLabel("Currency").selectOption("USD");
    await page
      .getByLabel("Counterparty / Receiver BIC")
      .selectOption("BARCGB22");
    await page.getByLabel("Booking Branch / Entity").selectOption("HK01");
    await page.getByLabel("Value Date").fill("2026-09-07");
    const inputText = await page.locator(".tag-ssi-choice").innerText();
    for (const forbidden of [
      "Account Relationship / Receiving Route",
      "Direct Account Relationship Evidence",
      "Receiver SSI Evidence Reference",
      "Correspondent BIC (54a)",
      "Bank BIC (57a",
      "Bank BIC (58a",
      "Bank BIC (56a",
    ])
      assert(
        !inputText.includes(forbidden),
        `${messageType} exposes route/manual 5x input: ${forbidden}`,
      );
    const selector = page
      .locator(".result-panel")
      .getByLabel("Eligible SSI Routes");
    assert(
      (await page
        .locator(".tag-ssi-choice")
        .getByLabel("Eligible SSI Routes")
        .count()) === 0,
      `${messageType} SSI route selector must not be in Input`,
    );
    const usesSsi = (supportedTags[messageType] ?? []).length > 0;
    assert(
      (await selector.count()) === (usesSsi ? 1 : 0),
      `${messageType} result-side selector applicability mismatch`,
    );
    let firstId = "N_A";
    if (usesSsi) {
      assert(
        (await selector.locator("option").count()) === 3,
        `${messageType} needs 3 eligible candidates`,
      );
      assert(
        (await selector.locator("option").first().textContent())?.includes(
          "Recommended",
        ),
        `${messageType} top candidate not recommended`,
      );
      firstId = await selector.inputValue();
    }
    const button = page.getByRole("button", {
      name: "Resolve SSI Settlement Fields",
    });
    assert(!(await button.isDisabled()), `${messageType} generate disabled`);
    await button.click();
    if (usesSsi)
      await page
        .getByText("SSI Resolution completed", { exact: false })
        .waitFor();
    else
      await page
        .getByText("No SSI-resolvable fields for this message profile", {
          exact: true,
        })
        .waitFor();
    let rows = page.locator(".tag-support-list tbody tr");
    const visibleExpected = expected.filter(([tag]) =>
      (supportedTags[messageType] ?? []).includes(tag),
    );
    assert(
      (await rows.count()) === visibleExpected.length,
      `${messageType} expected ${visibleExpected.length} SSI rows, got ${await rows.count()}`,
    );
    for (const [tag, name] of visibleExpected) {
      const row = rows.filter({ has: page.getByText(tag, { exact: true }) });
      const cells = (await row.locator("td").allTextContents()).map((v) =>
        v.trim(),
      );
      const expectedResolution =
        (messageType === "MT400" && tag === "57") ||
        (messageType === "MT765" && tag === "56")
          ? "NOT_REQUIRED"
          : "RESOLVED";
      assert(
        cells[1] === "A" && cells[2] === name,
        `${messageType} ${tag} official profile mismatch ${JSON.stringify(cells)}`,
      );
      assert(
        (await row.getAttribute("data-scope-status")) === "SSI_SUPPORTED",
        `${messageType} ${tag} scope mismatch`,
      );
      assert(
        (await row.getAttribute("data-resolution-status")) ===
          expectedResolution,
        `${messageType} ${tag} resolution mismatch`,
      );
      if (expectedResolution === "RESOLVED")
        assert(
          cells[4] &&
            cells[5].includes("SYNTHETIC_DEMO") &&
            cells[5].includes(firstId),
          `${messageType} ${tag} missing value/evidence ${JSON.stringify(cells)}`,
        );
      else
        assert(
          !cells[4].match(/^[A-Z0-9]{8,11}$/),
          `${messageType} ${tag} must not contain a suggested BIC`,
        );
    }
    let switchedTo = "N_A";
    if (usesSsi) {
      const firstValues = await page
        .locator(
          '.tag-support-list tbody tr[data-resolution-status="RESOLVED"] td:nth-child(5)',
        )
        .allTextContents();
      const ids = await selector
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value));
      await selector.selectOption(ids[1]);
      await button.click();
      await page
        .getByText("SSI Resolution completed", { exact: false })
        .waitFor();
      rows = page.locator(".tag-support-list tbody tr");
      const secondValues = await page
        .locator(
          '.tag-support-list tbody tr[data-resolution-status="RESOLVED"] td:nth-child(5)',
        )
        .allTextContents();
      const evidence = await page
        .locator(
          '.tag-support-list tbody tr[data-resolution-status="RESOLVED"] td:nth-child(6)',
        )
        .allTextContents();
      assert(
        JSON.stringify(firstValues) !== JSON.stringify(secondValues),
        `${messageType} candidate change did not change values`,
      );
      assert(
        evidence.every((text) => text.includes(ids[1])),
        `${messageType} candidate change did not update provenance`,
      );
      switchedTo = ids[1];
    }
    results.push({
      messageType,
      candidates: usesSsi ? 3 : 0,
      recommended: firstId,
      rows: expected.length,
      switchedTo,
    });
    await cancel();
  }

  await open("MT742");
  const counterparties = [
    "CITIUS33",
    "CHASUS33",
    "BOFAUS3N",
    "DEUTDEFF",
    "BARCGB22",
    "HSBCHKHH",
    "SCBLGB2L",
    "BNPAFRPP",
    "BOTKJPJT",
    "DBSSSGSG",
  ];
  const limitedSsiCounterparties = ["NSSIUSN1"];
  const noSsiCounterparties = ["NSSIGB2X"];
  const markets = {
    USD: "US_DOLLAR",
    EUR: "EURO_AREA",
    GBP: "UK_STERLING",
    HKD: "HONG_KONG_DOLLAR",
    JPY: "JAPAN_YEN",
    SGD: "SINGAPORE_DOLLAR",
    CNY: "CNH_HONG_KONG",
  };
  let matrixContexts = 0;
  for (const [currency, market] of Object.entries(markets)) {
    await page.getByLabel("Currency").selectOption(currency);
    const available = await page
      .getByLabel("Counterparty / Receiver BIC")
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));
    assert(
      JSON.stringify([...available].sort()) ===
        JSON.stringify([...counterparties, ...limitedSsiCounterparties, ...noSsiCounterparties].sort()),
      `${currency} Bank Directory counterparty options mismatch ${JSON.stringify(available)}`,
    );
    for (const counterparty of counterparties) {
      await page
        .getByLabel("Counterparty / Receiver BIC")
        .selectOption(counterparty);
      const selector = page
        .locator(".result-panel")
        .getByLabel("Eligible SSI Routes");
      assert(
        (await selector.locator("option").count()) === 3,
        `${counterparty}/${currency} needs 3 candidates`,
      );
      assert(
        (await selector.inputValue()).startsWith(
          `SYN-MT742-${counterparty}-${currency}-1`,
        ),
        `${counterparty}/${currency} did not reset to recommended`,
      );
      assert(
        (await page.locator(".synthetic-demo-evidence").innerText()).includes(
          market,
        ),
        `${counterparty}/${currency} market mismatch`,
      );
      assert(
        !(await page.locator("body").innerText()).includes(
          "NO_ELIGIBLE_SYNTHETIC_DEMO_CANDIDATE",
        ),
        `${counterparty}/${currency} unexpectedly has no candidate`,
      );
      matrixContexts++;
    }
  }
  results.push({
    messageType: "MT742-CONTEXT-MATRIX",
    candidates: matrixContexts * 3,
    recommended: "priority 10",
    rows: 0,
    switchedTo: "70 contexts reset verified",
  });
  for (const counterparty of noSsiCounterparties) {
    await page
      .getByLabel("Counterparty / Receiver BIC")
      .selectOption(counterparty);
    const selector = page
      .locator(".result-panel")
      .getByLabel("Eligible SSI Routes");
    assert(
      (await selector.locator("option").count()) === 0,
      `${counterparty} must have zero candidate options`,
    );
    assert(
      (await page.locator(".result-panel").innerText()).includes(
        "NO_ELIGIBLE_SYNTHETIC_DEMO_CANDIDATE",
      ),
      `${counterparty} missing explicit no-coverage state`,
    );
    await page
      .getByRole("button", { name: "Resolve SSI Settlement Fields" })
      .click();
    await page
      .getByText("SSI Resolution completed", { exact: false })
      .waitFor();
    const rows = page.locator(".tag-support-list tbody tr");
    const required = rows.filter({
      has: page.getByText("57", { exact: true }),
    });
    assert(
      (await required.getAttribute("data-scope-status")) === "SSI_SUPPORTED",
      `${counterparty} 57a scope mismatch`,
    );
    assert(
      (await required.getAttribute("data-resolution-status")) ===
        "NO_ELIGIBLE_SSI",
      `${counterparty} 57a must fail closed without SSI`,
    );
    assert(
      (await required.innerText()).includes("MISSING_SSI"),
      `${counterparty} 57a reason must be MISSING_SSI`,
    );
    assert(
      !(await required.innerText()).match(/SYN-MT742-|CHASUS33|BARCGB22/),
      `${counterparty} retained stale candidate data`,
    );
  }
  results.push({
    messageType: "MT742-NO-SSI",
    candidates: 0,
    recommended: "N_A",
    rows: 4,
    switchedTo: "no stale selection",
  });
  await cancel();

  await open("MT400");
  await page.getByLabel("Currency").selectOption("GBP");
  await page.getByLabel("Counterparty / Receiver BIC").selectOption("BARCGB22");
  await page.getByLabel("Booking Branch / Entity").selectOption("HK01");
  await page.getByLabel("Value Date").fill("2026-09-08");
  const mt400Selector = page
    .locator(".result-panel")
    .getByLabel("Eligible SSI Routes");
  assert(
    (await mt400Selector.locator("option").count()) === 3,
    "BARCGB22/GBP MT400 requires three candidates",
  );
  const mt400Ids = await mt400Selector
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  await mt400Selector.selectOption(mt400Ids[2]);
  const direct = page.getByRole("button", {
    name: "Resolve Direct-account Field Disposition",
  });
  assert(
    !(await direct.isDisabled()),
    "MT400 direct candidate carries governed evidence",
  );
  await direct.click();
  await page
    .locator(
      '.tag-support-list tbody tr[data-resolution-status="NOT_REQUIRED"]',
    )
    .first()
    .waitFor();
  assert(
    (await page
      .locator(
        '.tag-support-list tbody tr[data-resolution-status="NOT_REQUIRED"]',
      )
      .count()) === 3,
    "MT400 direct-account NOT_REQUIRED count",
  );
  assert(
    (await page
      .locator(".tag-support-list tbody tr", {
        hasText: "DIRECT_ACCOUNT_RELATIONSHIP",
      })
      .count()) === 3,
    "MT400 direct-account governed reason count",
  );
  if (screenshotPath) {
    await page.getByLabel("Theme").selectOption("dark");
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  await page.getByLabel("Counterparty / Receiver BIC").selectOption("NSSIGB2X");
  assert(
    (await mt400Selector.locator("option").count()) === 0,
    "MT400 no-SSI bank must clear candidate selection",
  );
  await page
    .getByRole("button", { name: "Resolve SSI Settlement Fields" })
    .click();
  await page.getByText("SSI Resolution completed", { exact: false }).waitFor();
  for (const tag of ["53", "54", "57"]) {
    const row = page
      .locator(".tag-support-list tbody tr")
      .filter({ has: page.getByText(tag, { exact: true }) });
    assert(
      (await row.getAttribute("data-scope-status")) === "SSI_SUPPORTED",
      `MT400 ${tag} no-SSI scope mismatch`,
    );
    assert(
      (await row.getAttribute("data-resolution-status")) === "NO_ELIGIBLE_SSI",
      `MT400 ${tag} must report no eligible SSI`,
    );
    assert(
      (await row.innerText()).includes("MISSING_SSI"),
      `MT400 ${tag} missing reason`,
    );
  }
  assert(
    (await page
      .locator(
        '.tag-support-list tbody tr[data-scope-status="OUT_OF_SSI_SCOPE"]',
      )
      .count()) === 0,
    "MT400 out-of-scope 58A must be hidden from the user table",
  );
  await cancel();

  console.log(
    JSON.stringify(
      {
        suite: "outward-mt-ui",
        total: results.length,
        passed: results.length,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
