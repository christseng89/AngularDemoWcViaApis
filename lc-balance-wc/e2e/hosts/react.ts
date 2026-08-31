import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactAdapterRuntime, createBalanceComponentReactAdapter } from '../../src/adapters/react/balance-component-react';
import { BalanceComponentElement } from '../../src/app/web-component/balance-component-element.contract';
import { exposeHost } from './host-api';

const Adapter = createBalanceComponentReactAdapter(React as unknown as ReactAdapterRuntime) as React.ComponentType<Record<string, unknown>>;
const root = createRoot(document.getElementById('host')!);
root.render(React.createElement(Adapter, { config: { version: '1', theme: 'dark' } }));
const exposeWhenMounted = (): void => {
  const element = document.querySelector('balance-component-app') as BalanceComponentElement | null;
  if (!element) {
    requestAnimationFrame(exposeWhenMounted);
    return;
  }
  exposeHost(element, { navigate: (view) => element.navigate(view), refresh: () => element.refresh() });
};
requestAnimationFrame(exposeWhenMounted);
