import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let mediaChange: ((event: MediaQueryListEvent) => void) | undefined;
  let matchesDark = true;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        get matches() { return matchesDark; },
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          mediaChange = listener;
        },
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    TestBed.configureTestingModule({});
  });

  afterEach(() => TestBed.resetTestingModule());

  it('defaults invalid or missing preferences to System and applies the OS theme', () => {
    localStorage.setItem('lc-payment-theme', 'sepia');

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.effectiveTheme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('persists an explicit theme and ignores OS changes until System is selected', () => {
    const service = TestBed.inject(ThemeService);

    service.setPreference('light');
    expect(localStorage.getItem('lc-payment-theme')).toBe('light');
    expect(service.effectiveTheme()).toBe('light');

    matchesDark = false;
    mediaChange?.({ matches: false } as MediaQueryListEvent);
    expect(service.effectiveTheme()).toBe('light');

    service.setPreference('system');
    expect(service.effectiveTheme()).toBe('light');

    matchesDark = true;
    mediaChange?.({ matches: true } as MediaQueryListEvent);
    expect(service.effectiveTheme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('continues switching themes when browser storage is unavailable', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');

    expect(service.preference()).toBe('dark');
    expect(service.effectiveTheme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('restores a valid explicit preference', () => {
    localStorage.setItem('lc-payment-theme', 'dark');

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('dark');
    expect(service.effectiveTheme()).toBe('dark');
  });

  it('is safe during server-side rendering where browser APIs are unavailable', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.effectiveTheme()).toBe('light');
    service.setPreference('dark');
    expect(service.effectiveTheme()).toBe('dark');
  });
});
