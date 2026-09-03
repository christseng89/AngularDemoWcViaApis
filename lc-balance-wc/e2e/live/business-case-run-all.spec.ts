import { expect, test } from '@playwright/test';

const IMPORT_FUNCTION_CODES = ['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11'] as const;
const EXPORT_FUNCTION_CODES = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const;

async function routeToIsolatedServices(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const source = new URL(route.request().url());
    const target = `http://localhost:4300${source.pathname}${source.search}`;
    await route.continue({ url: target });
  });
  await page.route('**/balance-component/**', async (route) => {
    const source = new URL(route.request().url());
    const target = `http://localhost:4100${source.pathname.replace('/balance-component', '')}${source.search}`;
    await route.continue({ url: target });
  });
}

test('Business Case Runner executes every registered case in the real browser', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await routeToIsolatedServices(page);

  await page.goto('/business-cases');
  await expect(page.getByRole('heading', { name: 'Balance Component — Business Case Runner' })).toBeVisible();

  const runAll = page.getByRole('button', { name: 'Run All Cases' });
  await expect(runAll).toBeEnabled({ timeout: 60_000 });
  const registeredCaseCount = await page.locator('select option').count();
  expect(registeredCaseCount).toBeGreaterThan(1);

  await runAll.click();
  await expect(page.getByRole('button', { name: 'Running all…' })).toBeVisible();
  await expect(runAll).toBeEnabled({ timeout: 15 * 60_000 });

  await expect(page.locator('.alert-danger')).toHaveCount(0);
  await expect(page.locator('.card h2')).toHaveCount(registeredCaseCount - 1);
  expect(browserErrors).toEqual([]);
  console.log(`Run All complete: ${registeredCaseCount - 1} cases rendered.`);

  await page.getByRole('link', { name: 'Transaction Builder' }).click();
  await page.getByRole('button', { name: /A4.*Sight Settlement/ }).click();
  console.log('A4 function opened.');

  const makerPanel = page.locator('app-maker-panel');
  const transactionIndex = makerPanel.locator('app-index-picker').filter({ hasText: 'Transaction Index — Select LC Number + IB Number' });
  await transactionIndex.locator('input').fill('IMP-A4');
  await transactionIndex.getByRole('button', { name: 'Search' }).click();
  const transactionRow = transactionIndex.locator('.index-picker__row').filter({ hasText: 'IMP-A4' }).first();
  await expect(transactionRow).toBeVisible({ timeout: 30_000 });
  await transactionRow.click();
  console.log('A4 LC + Document Arrival selected.');
  const submitA4 = makerPanel.getByRole('button', { name: 'Submit A4' });
  await expect(submitA4).toBeEnabled();
  await submitA4.click();
  await expect(makerPanel.getByText('Status: PENDING')).toBeVisible({ timeout: 30_000 });
  console.log('A4 Maker Submit complete.');

  await page.getByRole('button', { name: 'Maker Queue' }).click();
  const queue = page.locator('app-maker-queue');
  const lcSearch = queue.locator('app-transaction-search-field').filter({ hasText: 'LC Number' });
  await lcSearch.locator('input').fill('IMP-A4');
  await lcSearch.getByRole('button', { name: 'Search' }).click();
  const a4Row = queue.locator('tbody tr').filter({ hasText: 'A4 · Sight Settlement' }).filter({ hasText: 'IMP-A4' }).first();
  await expect(a4Row).toBeVisible({ timeout: 30_000 });
  await a4Row.getByRole('button', { name: 'Fix Pending' }).click();
  console.log('A4 Fix Pending screen opened.');

  const fixPendingBanner = makerPanel.locator('app-maker-workflow-notices strong').filter({ hasText: 'FIX PENDING' });
  await expect(fixPendingBanner).toBeVisible();
  // A prior retained manual prerequisite may already contain an earlier test run's note. The product
  // correctly enables Save only when Remarks actually changes, so each acceptance run needs a unique edit.
  await makerPanel.locator('textarea').fill(`Browser-verified A4 correction ${Date.now()}`);
  const save = makerPanel.getByRole('button', { name: 'Save Fix Pending' });
  await expect(save).toBeEnabled();
  await expect(makerPanel.getByRole('button', { name: 'Submit A4' })).toHaveCount(0);
  await save.click();
  await expect(fixPendingBanner).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('app-feedback-message .alert-danger')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
  console.log('A4 Fix Pending Save complete.');
});

test('every registered A-series and B-series transaction opens its browser workspace', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await routeToIsolatedServices(page);

  await page.goto('/transaction-builder');
  await expect(page.getByRole('heading', { name: 'Balance Component — Transaction Builder' })).toBeVisible();

  const verifySide = async (sideName: 'Import LC' | 'Export Confirmed', codes: readonly string[]) => {
    await page.getByRole('button', { name: sideName, exact: true }).click();

    for (const code of codes) {
      const chip = page.locator('.tb-function-chip').filter({ has: page.locator('.tb-function-chip__code', { hasText: new RegExp(`^${code}$`) }) });
      await expect(chip, `${code} must exist in the registered function picker`).toHaveCount(1);
      await chip.click();
      await expect(chip).toHaveClass(/tb-function-chip--active/);

      const makerPanel = page.locator('app-maker-panel');
      await expect(makerPanel, `${code} must render its Maker workspace`).toBeVisible();
      await expect(makerPanel.locator('.tb-section__title').filter({ hasText: new RegExp(`^${code}\\s+—`) })).toBeVisible();
      await expect(page.locator('app-checker-panel'), `${code} must render the common Checker workspace`).toBeVisible();
      await expect(page.locator('app-feedback-message .alert-danger')).toHaveCount(0);
    }
  };

  await verifySide('Import LC', IMPORT_FUNCTION_CODES);
  await verifySide('Export Confirmed', EXPORT_FUNCTION_CODES);

  expect(browserErrors).toEqual([]);
  console.log(`Browser workspace matrix complete: ${IMPORT_FUNCTION_CODES.length + EXPORT_FUNCTION_CODES.length} registered transactions opened.`);
});
