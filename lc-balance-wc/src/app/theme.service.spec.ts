import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'lc-balance-wc-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** A minimal, controllable stand-in for `MediaQueryList` — jsdom doesn't implement `matchMedia` at all, so every test that touches "system" resolution must install one of these first. */
function installMatchMedia(initialMatches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches: initialMatches,
    media: DARK_QUERY,
    addEventListener: jest.fn((event: string, cb: (e: { matches: boolean }) => void) => {
      if (event === 'change') listeners.push(cb);
    }),
    removeEventListener: jest.fn((event: string, cb: (e: { matches: boolean }) => void) => {
      if (event !== 'change') return;
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    }),
  };
  (window as unknown as { matchMedia: jest.Mock }).matchMedia = jest.fn().mockReturnValue(mql);
  return {
    fire(matches: boolean): void {
      mql.matches = matches;
      listeners.slice().forEach((l) => l({ matches }));
    },
    listenerCount: () => listeners.length,
  };
}

function freshTheme(): ThemeService {
  TestBed.resetTestingModule();
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-bs-theme');
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  it('defaults to system mode when localStorage is empty', () => {
    installMatchMedia(false);
    const svc = freshTheme();
    expect(svc.mode).toBe('system');
  });

  it('reads a persisted mode back on construction', () => {
    installMatchMedia(false);
    localStorage.setItem(STORAGE_KEY, 'dark');
    const svc = freshTheme();
    expect(svc.mode).toBe('dark');
  });

  it('falls back to system for an unrecognized persisted value', () => {
    installMatchMedia(false);
    localStorage.setItem(STORAGE_KEY, 'not-a-real-mode');
    const svc = freshTheme();
    expect(svc.mode).toBe('system');
  });

  it('applies the resolved theme to <html> immediately at construction (no page reload needed for first paint)', () => {
    installMatchMedia(true);
    freshTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  describe('setMode()', () => {
    it('persists the choice and updates mode', () => {
      installMatchMedia(false);
      const svc = freshTheme();
      svc.setMode('dark');
      expect(svc.mode).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('applies an explicit light choice to the DOM, both attributes', () => {
      installMatchMedia(true); // OS prefers dark
      const svc = freshTheme();
      svc.setMode('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    });

    it('applies an explicit dark choice even when the OS prefers light (explicit selection overrides system)', () => {
      installMatchMedia(false);
      const svc = freshTheme();
      svc.setMode('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('cycleMode() (P2 UI/UX pass — backs the icon toggle button)', () => {
    it('steps system -> light -> dark -> system, persisting each step', () => {
      installMatchMedia(false);
      const svc = freshTheme();
      expect(svc.mode).toBe('system');
      svc.cycleMode();
      expect(svc.mode).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
      svc.cycleMode();
      expect(svc.mode).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
      svc.cycleMode();
      expect(svc.mode).toBe('system');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
    });
  });

  describe('system mode resolution', () => {
    it('resolves to dark when the OS prefers dark', () => {
      installMatchMedia(true);
      const svc = freshTheme();
      expect(svc.effectiveTheme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('resolves to light when the OS prefers light', () => {
      installMatchMedia(false);
      const svc = freshTheme();
      expect(svc.effectiveTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('updates live when the OS preference changes while still in system mode', () => {
      const media = installMatchMedia(false);
      freshTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      media.fire(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      media.fire(false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('stops reacting to OS preference changes once the user picks an explicit mode', () => {
      const media = installMatchMedia(false);
      const svc = freshTheme();
      expect(media.listenerCount()).toBe(1);

      svc.setMode('light');
      expect(media.listenerCount()).toBe(0);

      // A later OS flip to dark must NOT override the explicit Light choice (Requirement #3).
      media.fire(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('re-attaches the system listener when switching back to system mode', () => {
      const media = installMatchMedia(false);
      const svc = freshTheme();
      svc.setMode('dark');
      expect(media.listenerCount()).toBe(0);

      svc.setMode('system');
      expect(media.listenerCount()).toBe(1);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  describe('matchMedia unsupported (e.g. an older browser)', () => {
    it('does not throw and resolves system mode to light when window.matchMedia is unavailable', () => {
      delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
      expect(() => freshTheme()).not.toThrow();
      const svc = freshTheme();
      expect(svc.effectiveTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  describe('localStorage unavailable', () => {
    it('falls back to the system default without throwing when reading fails', () => {
      installMatchMedia(false);
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('access denied');
      });
      expect(() => freshTheme()).not.toThrow();
      const svc = freshTheme();
      expect(svc.mode).toBe('system');
    });

    it('still applies the theme for this session without throwing when persisting fails', () => {
      installMatchMedia(false);
      const svc = freshTheme();
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(() => svc.setMode('dark')).not.toThrow();
      expect(svc.mode).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});
