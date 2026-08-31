import {
  BalanceComponentConfig,
  BalanceComponentElement,
  BalanceComponentEventMap,
  BalanceComponentView,
} from '../app/web-component/balance-component-element.contract';

export type BalanceComponentEventHandlers = {
  [K in keyof BalanceComponentEventMap]?: (event: BalanceComponentEventMap[K]) => void;
};

export interface BalanceComponentAdapterHandle {
  navigate(view: BalanceComponentView): Promise<void>;
  refresh(): Promise<void>;
}

export function configureBalanceElement(element: BalanceComponentElement, config: Partial<BalanceComponentConfig> | null | undefined): void {
  element.config = config;
}

export function bindBalanceEvents(element: BalanceComponentElement, handlers: BalanceComponentEventHandlers): () => void {
  const entries = Object.entries(handlers) as Array<[keyof BalanceComponentEventMap, ((event: CustomEvent<unknown>) => void) | undefined]>;
  for (const [name, handler] of entries) {
    if (handler) element.addEventListener(name, handler as EventListener);
  }
  return () => {
    for (const [name, handler] of entries) {
      if (handler) element.removeEventListener(name, handler as EventListener);
    }
  };
}

export function createBalanceHandle(getElement: () => BalanceComponentElement | null): BalanceComponentAdapterHandle {
  return {
    navigate: (view) => requireElement(getElement()).navigate(view),
    refresh: () => requireElement(getElement()).refresh(),
  };
}

function requireElement(element: BalanceComponentElement | null): BalanceComponentElement {
  if (!element) throw new Error('Balance Component adapter is not mounted.');
  return element;
}
