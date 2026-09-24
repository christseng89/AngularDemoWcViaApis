import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = Exclude<ThemePreference, 'system'>;

const STORAGE_KEY = 'lc-payment-theme';
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly mediaQuery = this.isBrowser ? window.matchMedia(DARK_MODE_QUERY) : null;
  private readonly preferenceState = signal<ThemePreference>(this.readPreference());
  private readonly systemDark = signal(this.mediaQuery?.matches ?? false);
  private readonly handleSystemThemeChange = (event: MediaQueryListEvent): void => {
    this.systemDark.set(event.matches);
    if (this.preferenceState() === 'system') {
      this.applyTheme();
    }
  };

  readonly preference = this.preferenceState.asReadonly();
  readonly effectiveTheme = computed<EffectiveTheme>(() => {
    const preference = this.preferenceState();
    if (preference !== 'system') return preference;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    this.mediaQuery?.addEventListener('change', this.handleSystemThemeChange);
    this.applyTheme();
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    this.persistPreference(preference);
    this.applyTheme();
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.handleSystemThemeChange);
  }

  private readPreference(): ThemePreference {
    if (!this.isBrowser) return 'system';

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private persistPreference(preference: ThemePreference): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // A disabled or full storage area must not prevent theme switching.
    }
  }

  private applyTheme(): void {
    const theme = this.effectiveTheme();
    this.document.documentElement.dataset['theme'] = theme;
    this.document.documentElement.style.colorScheme = theme;
  }
}
