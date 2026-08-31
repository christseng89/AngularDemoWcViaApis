import { EnvironmentInjector } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { sharedAppProviders } from './app/shared-app.providers';
import { BalanceComponentElementComponent } from './app/web-component/balance-component-element.component';

export const BALANCE_COMPONENT_TAG_NAME = 'balance-component-app';

export function registerBalanceComponent(injector: EnvironmentInjector, registry: CustomElementRegistry = customElements): void {
  if (registry.get(BALANCE_COMPONENT_TAG_NAME)) return;

  const element = createCustomElement(BalanceComponentElementComponent, { injector });
  registry.define(BALANCE_COMPONENT_TAG_NAME, element);
}

export async function bootstrapBalanceComponent(registry: CustomElementRegistry = customElements): Promise<void> {
  const application = await createApplication({ providers: sharedAppProviders });
  registerBalanceComponent(application.injector, registry);
}

void bootstrapBalanceComponent().catch((error: unknown) => console.error('Balance Component registration failed', error));
