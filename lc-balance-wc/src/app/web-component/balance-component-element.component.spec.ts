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

  it('emits a typed error for an unsupported configuration version', () => {
    const failed = jest.fn();
    fixture.componentInstance.balanceError.subscribe(failed);
    fixture.componentRef.setInput('config', { version: '2' });
    fixture.detectChanges();

    expect(failed).toHaveBeenCalledWith({
      code: 'INVALID_CONFIG_VERSION',
      message: 'Unsupported Balance Component contract version: 2',
    });
  });
});
