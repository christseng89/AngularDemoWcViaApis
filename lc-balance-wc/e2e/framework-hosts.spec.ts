import { expect, test, type Route } from '@playwright/test';

for (const framework of ['angular', 'react', 'vue']) {
  test(`${framework} host preserves the WC contract and isolation`, async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(`/${framework}.html`);
    await page.waitForFunction(() => Boolean(window.hostApi?.element?.shadowRoot));
    const state = await page.evaluate(async () => {
      const api = window.hostApi!;
      await api.handle.navigate('business-cases');
      await api.handle.refresh();
      const second = document.createElement('balance-component-app');
      second.config = { version: '1', initialView: 'transaction-builder', theme: 'dark' };
      document.body.append(second);
      await new Promise<void>((resolve) => second.addEventListener('balance-ready', () => resolve(), { once: true }));
      const result = {
        shadow: Boolean(api.element.shadowRoot),
        theme: api.element.config?.theme,
        events: [...api.events],
        separateRoots: api.element.shadowRoot !== second.shadowRoot,
      };
      second.remove();
      return result;
    });
    expect(state.shadow).toBe(true);
    expect(state.events).toContain('navigation');
    expect(state.events).toContain('refresh');
    expect(state.separateRoots).toBe(true);
  });
}

test('invalid config emits the typed error event', async ({ page }) => {
  await page.goto('/react.html');
  await page.waitForFunction(() => Boolean(window.hostApi));
  const code = await page.evaluate(async () => {
    const element = window.hostApi!.element;
    return new Promise<string>((resolve) => {
      element.addEventListener('balance-error', (event) => resolve((event as CustomEvent).detail.code), { once: true });
      element.config = { version: '1', theme: 'invalid' } as never;
    });
  });
  expect(code).toBe('INVALID_CONFIG');
});

test('Account Number Maintenance renders configured GL then Tenor SL fields', async ({ page }) => {
  const sight = {
    mappingKey: 'IPLC_LC:SIGHT', instrumentType: 'IPLC_LC', riskClass: 'SIGHT',
    categoryKey: 'IMPORT', categoryLabel: 'Import LC', familyKey: 'IMPORT_LC_BALANCE', familyLabel: 'Import LC Balance',
    tenorKey: 'SIGHT', tenorLabel: 'Sight',
    accountA: { accountNumber: 'Customer Liability — Sight', accountDescription: 'Customer Liability — Sight' },
    accountB: { accountNumber: 'LC Outstanding — Sight', accountDescription: 'LC Outstanding — Sight' },
    version: 1, updatedBy: 'seed', updatedAt: '2026-09-04T00:00:00.000Z',
  };
  const mappingResponse = {
    items: [sight],
    categories: [{
      categoryKey: 'IMPORT', label: 'Import LC',
      tenorTypes: [{ tenorKey: 'SIGHT', apiValue: 'SIGHT', label: 'Sight', behavior: 'SIGHT' }],
      families: [{ familyKey: 'IMPORT_LC_BALANCE', categoryKey: 'IMPORT', label: 'Import LC Balance', instrumentType: 'IPLC_LC', defaultTenorKey: 'SIGHT', tenorKeys: ['SIGHT'], mappings: [sight] }],
    }],
    validation: { pattern: '^.+$', minLength: 1, maxLength: 128 },
  };
  const fulfillMappings = (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(mappingResponse),
  });
  await page.route('**/balance-component/balance-account-mappings', fulfillMappings);
  await page.route('**/balance-component/balance-account-mappings/reload-configuration', fulfillMappings);
  await page.goto('/react.html');
  await page.waitForFunction(() => Boolean(window.hostApi?.element?.shadowRoot));
  await page.evaluate(() => window.hostApi!.handle.navigate('balance-accounts'));
  await page.waitForFunction(() => window.hostApi!.element.shadowRoot?.querySelector('.mapping-index__row'));
  const reloadRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/balance-component/balance-account-mappings/reload-configuration'));
  await page.evaluate(() => (window.hostApi!.element.shadowRoot!.querySelector('.account-maintenance__header button') as HTMLButtonElement).click());
  await reloadRequest;
  await expect.poll(() => page.evaluate(() => window.hostApi!.element.shadowRoot!.textContent)).toContain('Configuration defaults reloaded and saved to the database.');
  await page.evaluate(() => (window.hostApi!.element.shadowRoot!.querySelector('.mapping-index__row') as HTMLButtonElement).click());
  const layout = await page.evaluate(() => {
    const root = window.hostApi!.element.shadowRoot!;
    return {
      glTitles: [...root.querySelectorAll('.gl-card__title')].map((element) => element.textContent?.trim()),
      glInputs: root.querySelectorAll('.gl-card__fields input').length,
      slTitles: [...root.querySelectorAll('.subledger-label')].map((element) => element.textContent?.trim()),
      slInputs: root.querySelectorAll('.gl-card__subledgers input').length,
    };
  });
  expect(layout).toEqual({
    glTitles: ['GL — Contingent Liability', 'GL — Liability'],
    glInputs: 4,
    slTitles: ['SL — Sight', 'SL — Sight'],
    slInputs: 4,
  });
});
