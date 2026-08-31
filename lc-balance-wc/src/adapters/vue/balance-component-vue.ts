import { BalanceComponentConfig, BalanceComponentElement } from '../../app/web-component/balance-component-element.contract';
import { BalanceComponentEventHandlers, bindBalanceEvents, configureBalanceElement, createBalanceHandle } from '../adapter-core';

export interface BalanceComponentVueBinding {
  mount(element: BalanceComponentElement, config?: Partial<BalanceComponentConfig> | null, handlers?: BalanceComponentEventHandlers): void;
  update(config?: Partial<BalanceComponentConfig> | null, handlers?: BalanceComponentEventHandlers): void;
  unmount(): void;
  readonly navigate: ReturnType<typeof createBalanceHandle>['navigate'];
  readonly refresh: ReturnType<typeof createBalanceHandle>['refresh'];
}

export function createBalanceComponentVueBinding(): BalanceComponentVueBinding {
  let element: BalanceComponentElement | null = null;
  let cleanup: () => void = () => undefined;
  const handle = createBalanceHandle(() => element);
  return {
    mount(nextElement, config, handlers = {}) {
      cleanup();
      element = nextElement;
      configureBalanceElement(nextElement, config);
      cleanup = bindBalanceEvents(nextElement, handlers);
    },
    update(config, handlers = {}) {
      if (!element) throw new Error('Balance Component adapter is not mounted.');
      cleanup();
      configureBalanceElement(element, config);
      cleanup = bindBalanceEvents(element, handlers);
    },
    unmount() {
      cleanup();
      cleanup = () => undefined;
      element = null;
    },
    navigate: handle.navigate,
    refresh: handle.refresh,
  };
}

export const balanceComponentVueCompilerOptions = {
  isCustomElement: (tag: string): boolean => tag === 'balance-component-app',
};
