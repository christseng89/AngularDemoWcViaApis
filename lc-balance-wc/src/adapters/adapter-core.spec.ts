import { BalanceComponentElement } from '../app/web-component/balance-component-element.contract';
import { bindBalanceEvents, configureBalanceElement, createBalanceHandle } from './adapter-core';

describe('adapter core', () => {
  it('assigns config as a DOM property and forwards methods', async () => {
    const element = document.createElement('balance-component-app') as BalanceComponentElement;
    element.navigate = jest.fn().mockResolvedValue(undefined);
    element.refresh = jest.fn().mockResolvedValue(undefined);
    const config = { version: '1' as const, initialView: 'business-cases' as const };
    configureBalanceElement(element, config);
    const handle = createBalanceHandle(() => element);
    await handle.navigate('transaction-builder');
    await handle.refresh();
    expect(element.config).toBe(config);
    expect(element.navigate).toHaveBeenCalledWith('transaction-builder');
    expect(element.refresh).toHaveBeenCalled();
  });

  it('maps typed events and removes only this instance listeners', () => {
    const first = document.createElement('balance-component-app') as BalanceComponentElement;
    const second = document.createElement('balance-component-app') as BalanceComponentElement;
    const ready = jest.fn();
    const cleanup = bindBalanceEvents(first, { 'balance-ready': ready });
    second.dispatchEvent(new CustomEvent('balance-ready', { detail: { version: '1', view: 'transaction-builder' } }));
    first.dispatchEvent(new CustomEvent('balance-ready', { detail: { version: '1', view: 'transaction-builder' } }));
    cleanup();
    first.dispatchEvent(new CustomEvent('balance-ready', { detail: { version: '1', view: 'transaction-builder' } }));
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
