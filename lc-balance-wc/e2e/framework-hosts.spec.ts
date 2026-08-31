import { expect, test } from '@playwright/test';

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
