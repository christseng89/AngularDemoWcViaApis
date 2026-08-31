import { BalanceComponentConfig, BalanceComponentElement } from '../../app/web-component/balance-component-element.contract';
import { BalanceComponentAdapterHandle, BalanceComponentEventHandlers, bindBalanceEvents, configureBalanceElement, createBalanceHandle } from '../adapter-core';

export interface BalanceComponentReactProps extends BalanceComponentEventHandlers {
  config?: Partial<BalanceComponentConfig> | null;
  className?: string;
}

export interface ReactAdapterRuntime {
  createElement(type: string, props: Record<string, unknown>): unknown;
  forwardRef<P, H>(render: (props: P, ref: unknown) => unknown): unknown;
  useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]): void;
  useImperativeHandle(ref: unknown, create: () => BalanceComponentAdapterHandle, dependencies: readonly unknown[]): void;
  useRef<T>(initial: T): { current: T };
}

export function createBalanceComponentReactAdapter(react: ReactAdapterRuntime): unknown {
  return react.forwardRef<BalanceComponentReactProps, BalanceComponentAdapterHandle>((props, ref) => {
    const elementRef = react.useRef<BalanceComponentElement | null>(null);
    react.useImperativeHandle(ref, () => createBalanceHandle(() => elementRef.current), []);
    react.useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      configureBalanceElement(element, props.config);
      return bindBalanceEvents(element, props);
    }, [props]);
    return react.createElement('balance-component-app', { ref: elementRef, className: props.className });
  });
}
