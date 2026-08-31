import { EnvironmentInjector } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { sharedAppProviders } from './app/shared-app.providers';
import { BalanceComponentElementComponent } from './app/web-component/balance-component-element.component';
import { BalanceComponentElement, BalanceComponentView, BalanceErrorDetail } from './app/web-component/balance-component-element.contract';
import { BALANCE_COMPONENT_COMMAND_EVENT, BalanceComponentCommand, BalanceComponentCommandDetail } from './app/web-component/balance-component-element.command';

export const BALANCE_COMPONENT_TAG_NAME = 'balance-component-app';

export function resolveBalanceComponentStylesheetUrl(targetDocument: Document = document): string {
  const entryScript = Array.from(targetDocument.scripts)
    .reverse()
    .find((script) => /(?:^|\/)main\.js(?:[?#].*)?$/.test(script.src));
  return new URL('styles.css', entryScript?.src || targetDocument.baseURI).href;
}

export const BALANCE_COMPONENT_STYLESHEET_URL = resolveBalanceComponentStylesheetUrl();

function createBalanceComponentElement(injector: EnvironmentInjector): CustomElementConstructor {
  const AngularElement = createCustomElement(BalanceComponentElementComponent, { injector });
  const AngularElementBase = AngularElement as unknown as new () => HTMLElement & {
    config: BalanceComponentElement['config'];
    stylesheetUrl: string;
  };

  return class extends AngularElementBase implements BalanceComponentElement {
    declare config: BalanceComponentElement['config'];

    private readonly initialized: Promise<void>;

    constructor() {
      super();
      this.stylesheetUrl = BALANCE_COMPONENT_STYLESHEET_URL;
      this.initialized = new Promise<void>((resolve, reject) => {
        const onReady = (): void => {
          cleanup();
          resolve();
        };
        const onError = (event: Event): void => {
          const detail = (event as CustomEvent<BalanceErrorDetail>).detail;
          if (detail.operation !== 'initialize' && detail.operation !== 'configure') return;
          cleanup();
          reject(new Error(detail.message));
        };
        const cleanup = (): void => {
          this.removeEventListener('balance-ready', onReady);
          this.removeEventListener('balance-error', onError);
        };
        this.addEventListener('balance-ready', onReady, { once: true });
        this.addEventListener('balance-error', onError, { once: true });
      });
    }

    async navigate(view: BalanceComponentView): Promise<void> {
      await this.assertReady('navigate');
      return this.dispatchCommand({ type: 'navigate', view });
    }

    async refresh(): Promise<void> {
      await this.assertReady('refresh');
      return this.dispatchCommand({ type: 'refresh' });
    }

    private async assertReady(operation: 'navigate' | 'refresh'): Promise<void> {
      if (!this.isConnected) {
        const detail: BalanceErrorDetail = {
          code: 'ELEMENT_NOT_CONNECTED',
          operation,
          message: 'Balance Component element must be connected before calling public methods.',
        };
        this.dispatchEvent(new CustomEvent<BalanceErrorDetail>('balance-error', { detail }));
        throw new Error(detail.message);
      }
      await this.initialized;
    }

    private dispatchCommand(command: BalanceComponentCommand): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const detail: BalanceComponentCommandDetail = { command, resolve, reject };
        this.dispatchEvent(new CustomEvent<BalanceComponentCommandDetail>(BALANCE_COMPONENT_COMMAND_EVENT, { detail }));
      });
    }
  };
}

export function registerBalanceComponent(injector: EnvironmentInjector, registry: CustomElementRegistry = customElements): void {
  if (registry.get(BALANCE_COMPONENT_TAG_NAME)) return;

  const element = createBalanceComponentElement(injector);
  registry.define(BALANCE_COMPONENT_TAG_NAME, element);
}

export async function bootstrapBalanceComponent(registry: CustomElementRegistry = customElements): Promise<void> {
  const application = await createApplication({ providers: sharedAppProviders });
  registerBalanceComponent(application.injector, registry);
}

void bootstrapBalanceComponent().catch((error: unknown) => console.error('Balance Component registration failed', error));
