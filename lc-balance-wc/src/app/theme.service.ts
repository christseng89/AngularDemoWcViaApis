import { Injectable } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'lc-balance-wc-theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * User-requested 2026-08-19 ("Balance Component — Theme Support... I would make this a Balance
 * Component common framework feature, rather than implementing theme handling separately in each
 * A1–A9 / B1–B5 function") — a single `providedIn: 'root'` service owning System/Light/Dark theme
 * selection for the WHOLE app, deliberately independent of `TransactionBuilderComponent`/any
 * function-specific code, same "framework concern, not a per-screen concern" posture as this file's
 * own module scope implies. Every screen picks up the result purely through CSS custom properties
 * (`src/styles.scss`'s own `[data-theme]`-gated token overrides) — this service's only job is
 * resolving System/Light/Dark to a real `data-theme`/`data-bs-theme` attribute on `<html>`, nothing
 * screen-specific.
 *
 * Plain class fields/getters, not an RxJS `BehaviorSubject` — matches this codebase's own established
 * "plain class, template reads properties/getters directly" convention (`InquireEventsService`/
 * `LookUpPanelService`/etc.) rather than reaching for Observable ceremony a value this simple doesn't
 * need: every theme change here is triggered by a user-initiated DOM event (a `<select>` change),
 * which Angular's own default change detection already picks up on its next cycle.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  mode: ThemeMode = 'system';

  /** null while `mode !== 'system'` — only ever populated so its own `change` listener can be torn down when leaving system mode. */
  private systemQuery: MediaQueryList | null = null;
  private readonly onSystemChange = () => this.applyEffectiveTheme();

  /**
   * Bootstrap 5.3+ ships native `data-bs-theme` dark-mode support, giving every default-styled
   * Bootstrap element (Business Case Runner's own plain `.card`/`.btn`, this app's navbar) real
   * dark-mode support for free with zero custom CSS. `package.json` currently pins
   * `"bootstrap": "^5.3.0"` (confirmed by reading it directly) — hardcoded `true` rather than
   * resolved at runtime, since a dynamic `require('package.json')`/version-string parse would add
   * bundler risk (Angular's esbuild-based builder doesn't reliably support a runtime `require` of an
   * arbitrary JSON file) for no real benefit in a single-app codebase. Revisit if `bootstrap` is ever
   * downgraded below 5.3.
   */
  private readonly supportsBootstrapTheme = true;

  constructor() {
    this.mode = this.readPersistedMode();
    // Applied here, in the constructor, rather than deferred to some component's own ngOnInit — this
    // service is `providedIn: 'root'`, so Angular constructs it the moment anything first injects it
    // (AppComponent's own constructor does, immediately at bootstrap) — this is as early as this
    // service can realistically apply the theme without APP_INITIALIZER machinery, which would be
    // disproportionate engineering for a demo app's brief pre-paint window.
    this.applyEffectiveTheme();
  }

  private readPersistedMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
    } catch {
      // localStorage unavailable (e.g. a locked-down browser context) — fall back to the default below.
    }
    return 'system';
  }

  private persist(mode: ThemeMode): void {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Non-fatal — the theme still applies for this session, it just won't survive a reload.
    }
  }

  setMode(mode: ThemeMode): void {
    this.mode = mode;
    this.persist(mode);
    this.applyEffectiveTheme();
  }

  get effectiveTheme(): EffectiveTheme {
    if (this.mode !== 'system') return this.mode;
    return this.systemPrefersDark() ? 'dark' : 'light';
  }

  private systemPrefersDark(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(DARK_MEDIA_QUERY).matches;
  }

  /**
   * Applies `effectiveTheme` to `<html>` and (re)wires the live OS-preference listener. The listener
   * is only ever attached while `mode === 'system'` — an explicit Light/Dark choice must never keep
   * reacting to a later OS preference change (Requirement #3: "explicit selection should override the
   * system preference").
   */
  private applyEffectiveTheme(): void {
    this.syncSystemListener();
    const theme = this.effectiveTheme;
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    if (this.supportsBootstrapTheme) {
      document.documentElement.setAttribute('data-bs-theme', theme);
    }
  }

  private syncSystemListener(): void {
    if (this.mode === 'system') {
      if (this.systemQuery || typeof window === 'undefined' || !window.matchMedia) return;
      this.systemQuery = window.matchMedia(DARK_MEDIA_QUERY);
      this.systemQuery.addEventListener('change', this.onSystemChange);
    } else if (this.systemQuery) {
      this.systemQuery.removeEventListener('change', this.onSystemChange);
      this.systemQuery = null;
    }
  }
}
