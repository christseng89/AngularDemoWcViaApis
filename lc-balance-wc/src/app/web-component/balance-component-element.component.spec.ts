import { ComponentFixture, TestBed } from '@angular/core/testing';
import { sharedAppProviders } from '../shared-app.providers';
import { BalanceComponentElementComponent } from './balance-component-element.component';

describe('BalanceComponentElementComponent', () => {
  let fixture: ComponentFixture<BalanceComponentElementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BalanceComponentElementComponent],
      providers: sharedAppProviders,
    }).compileComponents();
    fixture = TestBed.createComponent(BalanceComponentElementComponent);
  });

  it('loads the default view and emits ready', async () => {
    const ready = jest.fn();
    fixture.componentInstance.balanceReady.subscribe(ready);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-transaction-builder')).not.toBeNull();
    expect(ready).toHaveBeenCalledWith({ version: '1', view: 'transaction-builder' });
  });

  it('applies initial configuration without using a router', async () => {
    fixture.componentRef.setInput('config', { version: '1', initialView: 'business-cases' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-business-case-runner')).not.toBeNull();
  });

  it('navigates internally and emits a framework-neutral navigation event', async () => {
    const navigated = jest.fn();
    fixture.componentInstance.balanceNavigation.subscribe(navigated);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-business-case-runner')).not.toBeNull();
    expect(navigated).toHaveBeenCalledWith({ from: 'transaction-builder', to: 'business-cases' });
  });

  it('refreshes by recreating only the current view and emits completion', async () => {
    const refreshed = jest.fn();
    fixture.componentInstance.balanceRefresh.subscribe(refreshed);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const firstView = fixture.nativeElement.querySelector('app-transaction-builder');

    await fixture.componentInstance.refresh();
    fixture.detectChanges();
    const refreshedView = fixture.nativeElement.querySelector('app-transaction-builder');

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

    expect(fixture.nativeElement.querySelector('app-business-case-runner')).not.toBeNull();
    expect(secondFixture.nativeElement.querySelector('app-transaction-builder')).not.toBeNull();
    expect(secondFixture.nativeElement.querySelector('app-business-case-runner')).toBeNull();
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

    expect(fixture.nativeElement.querySelector('app-transaction-builder')).not.toBeNull();
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
});
