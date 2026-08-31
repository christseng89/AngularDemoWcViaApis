import { BalanceComponentAdapterHandle, BalanceComponentEventHandlers, bindBalanceEvents } from '../../src/adapters/adapter-core';
import { BalanceComponentElement } from '../../src/app/web-component/balance-component-element.contract';

export interface HostApi {
  element: BalanceComponentElement;
  events: string[];
  handle: BalanceComponentAdapterHandle;
  cleanup(): void;
}

declare global {
  interface Window {
    hostApi?: HostApi;
  }
}

export function exposeHost(element: BalanceComponentElement, handle: BalanceComponentAdapterHandle): () => void {
  const events: string[] = [];
  const handlers: BalanceComponentEventHandlers = {
    'balance-ready': () => events.push('ready'),
    'balance-navigation': () => events.push('navigation'),
    'balance-refresh': () => events.push('refresh'),
    'balance-error': () => events.push('error'),
  };
  const cleanup = bindBalanceEvents(element, handlers);
  window.hostApi = { element, events, handle, cleanup };
  return cleanup;
}
