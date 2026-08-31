import { BalanceComponentElement } from '../../app/web-component/balance-component-element.contract';
import { createBalanceComponentReactAdapter, ReactAdapterRuntime } from './balance-component-react';

describe('React adapter', () => {
  it('uses property assignment, typed events, imperative methods and cleanup', async () => {
    const element = document.createElement('balance-component-app') as BalanceComponentElement;
    element.navigate = jest.fn().mockResolvedValue(undefined);
    element.refresh = jest.fn().mockResolvedValue(undefined);
    const effects: Array<() => void | (() => void)> = [];
    let handle: { navigate(view: 'transaction-builder' | 'business-cases'): Promise<void>; refresh(): Promise<void> } | undefined;
    const runtime: ReactAdapterRuntime = {
      createElement: (_type, props) => {
        (props['ref'] as { current: BalanceComponentElement | null }).current = element;
        return element;
      },
      forwardRef: (render) => render,
      useEffect: (effect) => effects.push(effect),
      useImperativeHandle: (_ref, create) => {
        handle = create();
      },
      useRef: (initial) => ({ current: initial }),
    };
    const component = createBalanceComponentReactAdapter(runtime) as (props: Record<string, unknown>, ref: unknown) => unknown;
    const ready = jest.fn();
    component({ config: { version: '1', theme: 'light' }, 'balance-ready': ready }, {});
    const cleanups = effects.map((effect) => effect()).filter((value): value is () => void => typeof value === 'function');
    element.dispatchEvent(new CustomEvent('balance-ready'));
    await handle!.navigate('business-cases');
    await handle!.refresh();
    cleanups.forEach((cleanup) => cleanup());
    element.dispatchEvent(new CustomEvent('balance-ready'));
    expect(ready).toHaveBeenCalledTimes(1);
    expect(element.config).toEqual({ version: '1', theme: 'light' });
  });
});
