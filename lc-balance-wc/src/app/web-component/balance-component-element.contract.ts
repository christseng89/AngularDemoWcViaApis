export const BALANCE_COMPONENT_CONTRACT_VERSION = '1' as const;

export type BalanceComponentView = 'transaction-builder' | 'business-cases';

export interface BalanceComponentConfig {
  readonly version: typeof BALANCE_COMPONENT_CONTRACT_VERSION;
  readonly initialView?: BalanceComponentView;
}

export interface NormalizedBalanceComponentConfig {
  readonly version: typeof BALANCE_COMPONENT_CONTRACT_VERSION;
  readonly initialView: BalanceComponentView;
}

export interface BalanceReadyDetail {
  readonly version: typeof BALANCE_COMPONENT_CONTRACT_VERSION;
  readonly view: BalanceComponentView;
}

export interface BalanceNavigationDetail {
  readonly from: BalanceComponentView;
  readonly to: BalanceComponentView;
}

export interface BalanceRefreshDetail {
  readonly view: BalanceComponentView;
}

export interface BalanceErrorDetail {
  readonly code: 'INVALID_CONFIG_VERSION' | 'INVALID_VIEW' | 'VIEW_LOAD_FAILED' | 'ELEMENT_NOT_CONNECTED';
  readonly message: string;
  readonly operation: 'initialize' | 'configure' | 'navigate' | 'refresh';
  readonly view?: BalanceComponentView;
}

export interface BalanceComponentElement extends HTMLElement {
  config: Partial<BalanceComponentConfig> | null | undefined;
  navigate(view: BalanceComponentView): Promise<void>;
  refresh(): Promise<void>;
}

export interface BalanceComponentEventMap {
  'balance-ready': CustomEvent<BalanceReadyDetail>;
  'balance-navigation': CustomEvent<BalanceNavigationDetail>;
  'balance-refresh': CustomEvent<BalanceRefreshDetail>;
  'balance-error': CustomEvent<BalanceErrorDetail>;
}

const DEFAULT_CONFIG: NormalizedBalanceComponentConfig = {
  version: BALANCE_COMPONENT_CONTRACT_VERSION,
  initialView: 'transaction-builder',
};

export function normalizeBalanceComponentConfig(config: Partial<BalanceComponentConfig> | null | undefined): NormalizedBalanceComponentConfig {
  if (config?.version && config.version !== BALANCE_COMPONENT_CONTRACT_VERSION) {
    throw new Error(`Unsupported Balance Component contract version: ${config.version}`);
  }

  return {
    version: BALANCE_COMPONENT_CONTRACT_VERSION,
    initialView: config?.initialView ?? DEFAULT_CONFIG.initialView,
  };
}

export function isBalanceComponentView(value: unknown): value is BalanceComponentView {
  return value === 'transaction-builder' || value === 'business-cases';
}

declare global {
  interface HTMLElementTagNameMap {
    'balance-component-app': BalanceComponentElement;
  }
}
