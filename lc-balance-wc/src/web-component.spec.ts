import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BALANCE_COMPONENT_TAG_NAME, registerBalanceComponent } from './web-component';

describe('registerBalanceComponent', () => {
  it('registers the exact tag name once', () => {
    const definitions = new Map<string, CustomElementConstructor>();
    const registry = {
      define: jest.fn((name: string, constructor: CustomElementConstructor) => definitions.set(name, constructor)),
      get: jest.fn((name: string) => definitions.get(name)),
    } as unknown as CustomElementRegistry;

    registerBalanceComponent(TestBed.inject(EnvironmentInjector), registry);
    registerBalanceComponent(TestBed.inject(EnvironmentInjector), registry);

    expect(registry.define).toHaveBeenCalledTimes(1);
    expect(registry.define).toHaveBeenCalledWith(BALANCE_COMPONENT_TAG_NAME, expect.any(Function));
    expect(BALANCE_COMPONENT_TAG_NAME).toBe('balance-component-app');
    const constructor = definitions.get(BALANCE_COMPONENT_TAG_NAME);
    expect(constructor?.prototype.navigate).toEqual(expect.any(Function));
    expect(constructor?.prototype.refresh).toEqual(expect.any(Function));
  });
});
