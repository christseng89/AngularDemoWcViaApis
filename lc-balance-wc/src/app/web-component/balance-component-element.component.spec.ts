import { ComponentFixture, TestBed } from '@angular/core/testing';
import { sharedAppProviders } from '../shared-app.providers';
import { BalanceComponentElementComponent } from './balance-component-element.component';

describe('BalanceComponentElementComponent', () => {
  let fixture: ComponentFixture<BalanceComponentElementComponent>;

  const shadowRoot = (target = fixture): ShadowRoot => {
    const root = target.nativeElement.shadowRoot as ShadowRoot | null;
    if (!root) throw new Error('Expected Balance Component ShadowRoot');
    return root;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BalanceComponentElementComponent],
      providers: sharedAppProviders,
    }).compileComponents();
    fixture = TestBed.createComponent(BalanceComponentElementComponent);
  });

  it('loads the default view and emits ready', async () => {
    const ready = jest.fn();
    const readyPromise = new Promise<void>((resolve) => fixture.componentInstance.balanceReady.subscribe(() => resolve()));
    fixture.componentInstance.balanceReady.subscribe(ready);
    fixture.detectChanges();
    await readyPromise;
    fixture.detectChanges();

    expect(shadowRoot().querySelector('app-transaction-builder')).not.toBeNull();
    expect(ready).toHaveBeenCalledWith({ version: '1', view: 'transaction-builder' });
  });

  it('applies initial configuration without using a router', async () => {
    const readyPromise = new Promise<void>((resolve) => fixture.componentInstance.balanceReady.subscribe(() => resolve()));
    fixture.componentRef.setInput('config', { version: '1', initialView: 'business-cases' });
    fixture.detectChanges();
    await readyPromise;
    fixture.detectChanges();

    expect(shadowRoot().querySelector('app-business-case-runner')).not.toBeNull();
  });

  it('navigates internally and emits a framework-neutral navigation event', async () => {
    const navigated = jest.fn();
    fixture.componentInstance.balanceNavigation.subscribe(navigated);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = shadowRoot().querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(shadowRoot().querySelector('app-business-case-runner')).not.toBeNull();
    expect(navigated).toHaveBeenCalledWith({ from: 'transaction-builder', to: 'business-cases' });
  });

  it('refreshes by recreating only the current view and emits completion', async () => {
    const refreshed = jest.fn();
    fixture.componentInstance.balanceRefresh.subscribe(refreshed);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const firstView = shadowRoot().querySelector('app-transaction-builder');

    await fixture.componentInstance.refresh();
    fixture.detectChanges();
    const refreshedView = shadowRoot().querySelector('app-transaction-builder');

    expect(refreshedView).not.toBe(firstView);
    expect(refreshed).toHaveBeenCalledWith({ view: 'transaction-builder' });
  });

  it('keeps separate mutable view state across element instances', async () => {
    const secondFixture = TestBed.createComponent(BalanceComponentElementComponent);
    fixture.detectChanges();
    secondFixture.detectChanges();
    await Promise.all([fixture.whenStable(), secondFixture.whenStable()]);

    await fixture.componentInstance.navigate('business-cases');
    fixture.detectChanges();
    secondFixture.detectChanges();

    expect(shadowRoot().querySelector('app-business-case-runner')).not.toBeNull();
    expect(shadowRoot(secondFixture).querySelector('app-transaction-builder')).not.toBeNull();
    expect(shadowRoot(secondFixture).querySelector('app-business-case-runner')).toBeNull();
    secondFixture.destroy();
  });

  it('rejects an invalid JavaScript view and preserves the last usable view', async () => {
    const failed = jest.fn();
    fixture.componentInstance.balanceError.subscribe(failed);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await expect(fixture.componentInstance.navigate('invalid' as 'transaction-builder')).rejects.toThrow('Unsupported Balance Component view: invalid');
    fixture.detectChanges();

    expect(shadowRoot().querySelector('app-transaction-builder')).not.toBeNull();
    expect(failed).toHaveBeenCalledWith({
      code: 'INVALID_VIEW',
      operation: 'navigate',
      message: 'Unsupported Balance Component view: invalid',
    });
  });

  it('emits a typed error for an unsupported configuration version', () => {
    const failed = jest.fn();
    fixture.componentInstance.balanceError.subscribe(failed);
    fixture.componentRef.setInput('config', { version: '2' });
    fixture.detectChanges();

    expect(failed).toHaveBeenCalledWith({
      code: 'INVALID_CONFIG_VERSION',
      operation: 'configure',
      message: 'Unsupported Balance Component contract version: 2',
    });
  });

  it('keeps host selectors outside the native shadow boundary', async () => {
    const hostileStyle = document.createElement('style');
    hostileStyle.textContent = '.balance-element { display: none !important; }';
    document.head.appendChild(hostileStyle);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.balance-element')).toBeNull();
    expect(shadowRoot().querySelector('.balance-element')).not.toBeNull();
    hostileStyle.remove();
  });

  it('renders the trusted WC stylesheet inside the shadow root', () => {
    fixture.componentRef.setInput('stylesheetUrl', 'https://assets.example.test/balance/styles.css');
    fixture.detectChanges();

    expect(shadowRoot().querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('https://assets.example.test/balance/styles.css');
  });

  it('applies light and dark themes per instance without mutating the document root', () => {
    const secondFixture = TestBed.createComponent(BalanceComponentElementComponent);
    const documentThemeBefore = document.documentElement.getAttribute('data-theme');
    fixture.componentRef.setInput('config', { version: '1', theme: 'dark' });
    secondFixture.componentRef.setInput('config', { version: '1', theme: 'light' });
    fixture.detectChanges();
    secondFixture.detectChanges();

    expect(fixture.nativeElement.getAttribute('data-theme')).toBe('dark');
    expect(secondFixture.nativeElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe(documentThemeBefore);
    secondFixture.destroy();
  });
});
