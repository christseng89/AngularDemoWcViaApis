import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { LcPaymentComponent } from './lc-payment.component';

describe('LcPaymentComponent', () => {
  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    });
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [LcPaymentComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows Payment Component Simulator first and selects it by default', () => {
    const fixture = TestBed.createComponent(LcPaymentComponent);
    fixture.detectChanges();

    const mainTabs = Array.from(
      fixture.nativeElement.querySelectorAll('.main-tabs button'),
      (button: Element) => button.getAttribute('aria-selected'),
    );
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.main-tabs button'),
      (button: Element) => button.textContent?.trim().replace(/^\S+\s/, ''),
    );

    expect(fixture.componentInstance.activeTab).toBe('payment-component');
    expect(labels).toEqual([
      'Payment Component Simulator',
      'Import LC',
      'Export LC',
    ]);
    expect(mainTabs).toEqual(['true', 'false', 'false']);
    expect(fixture.nativeElement.querySelector('app-business-case-runner')).not.toBeNull();
  });

  it('offers System, Light and Dark theme preferences with System selected initially', () => {
    const fixture = TestBed.createComponent(LcPaymentComponent);
    fixture.detectChanges();

    const choices = Array.from(
      fixture.nativeElement.querySelectorAll('.theme-input'),
      (input: Element) => input.getAttribute('aria-label'),
    );
    const selected = fixture.nativeElement.querySelector('.theme-input:checked');

    expect(choices).toEqual(['System theme', 'Light theme', 'Dark theme']);
    expect(selected?.getAttribute('aria-label')).toBe('System theme');
  });

  it('switches top-level and LC sub-tabs without changing their defaults', () => {
    const fixture = TestBed.createComponent(LcPaymentComponent);
    const component = fixture.componentInstance;

    component.setMainTab('import');
    component.setImportTab('settlement');
    component.setExportTab('collection');

    expect(component.activeTab).toBe('import');
    expect(component.importTab).toBe('settlement');
    expect(component.exportTab).toBe('collection');
  });

  it('applies a theme selected through the native radio control', () => {
    const fixture = TestBed.createComponent(LcPaymentComponent);
    fixture.detectChanges();

    const dark = fixture.nativeElement.querySelector('input[value="dark"]') as HTMLInputElement;
    dark.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.theme.preference()).toBe('dark');
    expect(dark.checked).toBe(true);
  });
});
