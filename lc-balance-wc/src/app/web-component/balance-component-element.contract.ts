export const BALANCE_COMPONENT_CONTRACT_VERSION = '1' as const;

export type BalanceComponentView = 'balance-accounts' | 'transaction-builder' | 'business-cases';
export type BalanceComponentTheme = 'system' | 'light' | 'dark';

export const BALANCE_COMPONENT_THEME_TOKENS = [
  '--balance-color-accent',
  '--balance-color-accent-strong',
  '--balance-color-page',
  '--balance-color-surface',
  '--balance-color-text',
  '--balance-color-muted',
  '--balance-color-border',
  '--balance-color-overlay',
  '--balance-font-sans',
  '--balance-font-mono',
  '--balance-radius',
] as const;

export interface BalanceComponentConfig {
  readonly version: typeof BALANCE_COMPONENT_CONTRACT_VERSION;
  readonly initialView?: BalanceComponentView;
  readonly theme?: BalanceComponentTheme;
}

export interface NormalizedBalanceComponentConfig {
  readonly version: typeof BALANCE_COMPONENT_CONTRACT_VERSION;
  readonly initialView: BalanceComponentView;
  readonly theme: BalanceComponentTheme;
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
  readonly code: 'INVALID_CONFIG_VERSION' | 'INVALID_CONFIG' | 'INVALID_VIEW' | 'VIEW_LOAD_FAILED' | 'STYLESHEET_LOAD_FAILED' | 'ELEMENT_NOT_CONNECTED';
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
  theme: 'system',
};

export function normalizeBalanceComponentConfig(config: Partial<BalanceComponentConfig> | null | undefined): NormalizedBalanceComponentConfig {
  if (config?.version && config.version !== BALANCE_COMPONENT_CONTRACT_VERSION) {
    throw new Error(`Unsupported Balance Component contract version: ${config.version}`);
  }
  if (config?.theme && !isBalanceComponentTheme(config.theme)) {
    throw new Error(`Unsupported Balance Component theme: ${String(config.theme)}`);
  }

  return {
    version: BALANCE_COMPONENT_CONTRACT_VERSION,
    initialView: config?.initialView ?? DEFAULT_CONFIG.initialView,
    theme: config?.theme ?? DEFAULT_CONFIG.theme,
  };
}

export function isBalanceComponentView(value: unknown): value is BalanceComponentView {
  return value === 'balance-accounts' || value === 'transaction-builder' || value === 'business-cases';
}

export function isBalanceComponentTheme(value: unknown): value is BalanceComponentTheme {
  return value === 'system' || value === 'light' || value === 'dark';
}

declare global {
  interface HTMLElementTagNameMap {
    'balance-component-app': BalanceComponentElement;
  }
}
