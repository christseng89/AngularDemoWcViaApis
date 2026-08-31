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

export interface BalanceErrorDetail {
  readonly code: 'INVALID_CONFIG_VERSION' | 'VIEW_LOAD_FAILED';
  readonly message: string;
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
