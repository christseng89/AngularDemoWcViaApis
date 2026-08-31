import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BALANCE_COMPONENT_STYLESHEET_URL, BALANCE_COMPONENT_TAG_NAME, registerBalanceComponent, resolveBalanceComponentStylesheetUrl } from './web-component';

describe('registerBalanceComponent', () => {
  it('resolves styles.css beside the stable main.js entry asset', () => {
    const targetDocument = document.implementation.createHTMLDocument();
    const script = targetDocument.createElement('script');
    script.src = 'https://cdn.example.test/balance/main.js?v=3';
    targetDocument.head.appendChild(script);

    expect(resolveBalanceComponentStylesheetUrl(targetDocument)).toBe('https://cdn.example.test/balance/styles.css');
  });

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
    expect(BALANCE_COMPONENT_STYLESHEET_URL).toMatch(/styles\.css$/);
    const constructor = definitions.get(BALANCE_COMPONENT_TAG_NAME);
    expect(constructor?.prototype.navigate).toEqual(expect.any(Function));
    expect(constructor?.prototype.refresh).toEqual(expect.any(Function));
  });
});
