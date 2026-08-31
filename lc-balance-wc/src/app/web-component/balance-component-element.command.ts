import { BalanceComponentView } from './balance-component-element.contract';

export const BALANCE_COMPONENT_COMMAND_EVENT = 'balance-component-internal-command';

export type BalanceComponentCommand = { readonly type: 'navigate'; readonly view: BalanceComponentView } | { readonly type: 'refresh' };

export interface BalanceComponentCommandDetail {
  readonly command: BalanceComponentCommand;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}
