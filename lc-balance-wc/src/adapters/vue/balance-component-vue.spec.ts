import { BalanceComponentElement } from '../../app/web-component/balance-component-element.contract';
import { balanceComponentVueCompilerOptions, createBalanceComponentVueBinding } from './balance-component-vue';

describe('Vue adapter', () => {
  it('binds properties, events and methods and cleans up on unmount', async () => {
    const element = document.createElement('balance-component-app') as BalanceComponentElement;
    element.navigate = jest.fn().mockResolvedValue(undefined);
    element.refresh = jest.fn().mockResolvedValue(undefined);
    const ready = jest.fn();
    const binding = createBalanceComponentVueBinding();
    binding.mount(element, { version: '1', theme: 'dark' }, { 'balance-ready': ready });
    element.dispatchEvent(new CustomEvent('balance-ready'));
    await binding.navigate('business-cases');
    await binding.refresh();
    binding.unmount();
    element.dispatchEvent(new CustomEvent('balance-ready'));
    expect(element.config).toEqual({ version: '1', theme: 'dark' });
    expect(ready).toHaveBeenCalledTimes(1);
    expect(element.navigate).toHaveBeenCalledWith('business-cases');
    expect(balanceComponentVueCompilerOptions.isCustomElement('balance-component-app')).toBe(true);
  });
});
