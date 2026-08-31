import {
  BalanceComponentAdapterComponent,
  BalanceComponentAdapterHandle,
  BalanceComponentReactProps,
  BalanceComponentVueBinding,
  createBalanceComponentReactAdapter,
  createBalanceComponentVueBinding,
} from './index';

describe('framework adapter compile contract', () => {
  it('exports the three typed adapter entry points without framework runtime imports', () => {
    const angular: typeof BalanceComponentAdapterComponent = BalanceComponentAdapterComponent;
    const react: typeof createBalanceComponentReactAdapter = createBalanceComponentReactAdapter;
    const vue: () => BalanceComponentVueBinding = createBalanceComponentVueBinding;
    const props: BalanceComponentReactProps = { config: { version: '1' } };
    const handle: BalanceComponentAdapterHandle | undefined = undefined;
    expect([angular, react, vue, props, handle]).toHaveLength(5);
  });
});
