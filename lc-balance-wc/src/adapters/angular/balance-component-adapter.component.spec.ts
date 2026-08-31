import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BalanceComponentElement } from '../../app/web-component/balance-component-element.contract';
import { BalanceComponentAdapterComponent } from './balance-component-adapter.component';

describe('Angular adapter', () => {
  let fixture: ComponentFixture<BalanceComponentAdapterComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BalanceComponentAdapterComponent] }).compileComponents();
    fixture = TestBed.createComponent(BalanceComponentAdapterComponent);
  });

  it('assigns config, forwards methods and maps CustomEvents', async () => {
    fixture.componentRef.setInput('config', { version: '1', theme: 'dark' });
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('balance-component-app') as BalanceComponentElement;
    element.navigate = jest.fn().mockResolvedValue(undefined);
    element.refresh = jest.fn().mockResolvedValue(undefined);
    const ready = jest.fn();
    fixture.componentInstance.ready.subscribe(ready);
    element.dispatchEvent(new CustomEvent('balance-ready', { detail: { version: '1', view: 'transaction-builder' } }));
    await fixture.componentInstance.navigate('business-cases');
    await fixture.componentInstance.refresh();
    expect(element.config).toEqual({ version: '1', theme: 'dark' });
    expect(ready).toHaveBeenCalledTimes(1);
    expect(element.navigate).toHaveBeenCalledWith('business-cases');
  });
});
