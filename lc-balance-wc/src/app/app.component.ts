import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ThemeService, ThemeMode } from './theme.service';
import { TbIconComponent, TbIconName } from './tb-icon.component';

const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const THEME_ICON: Record<ThemeMode, TbIconName> = { system: 'system', light: 'sun', dark: 'moon' };
const NEXT_THEME_MODE: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, TbIconComponent],
  template: `
    <nav class="navbar navbar-expand border-bottom mb-3">
      <div class="container">
        <span class="navbar-brand">Balance Component</span>
        <div class="navbar-nav">
          <a class="nav-link" routerLink="/balance-accounts" routerLinkActive="active">Balance Account Number</a>
          <a class="nav-link" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Transaction Builder</a>
          <a class="nav-link" routerLink="/business-cases" routerLinkActive="active">Business Case Runner</a>
        </div>
        <!-- P2 UI/UX pass — replaces the former plain-text <select> (low discoverability, small touch
             target for a commonly-used toggle) with an icon button; one click steps System -> Light ->
             Dark -> System (ThemeService.cycleMode()). The icon alone can't distinguish "System
             resolved to dark" from "explicit Dark", so it reflects theme.mode itself (a dedicated
             monitor icon for System), not theme.effectiveTheme — the visible text label next to it
             carries the same distinction for anyone who can't rely on the icon alone. -->
        <button
          type="button"
          class="theme-toggle"
          (click)="theme.cycleMode()"
          [attr.aria-label]="'Theme: ' + themeLabel() + '. Click to switch to ' + nextThemeLabel() + '.'"
          [title]="themeLabel() + ' theme — click to switch'"
        >
          <app-tb-icon [name]="themeIcon()"></app-tb-icon>
          <span class="theme-toggle__label">{{ themeLabel() }}</span>
        </button>
      </div>
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);

  protected themeLabel(): string {
    return THEME_LABEL[this.theme.mode];
  }

  protected nextThemeLabel(): string {
    return THEME_LABEL[NEXT_THEME_MODE[this.theme.mode]];
  }

  protected themeIcon(): TbIconName {
    return THEME_ICON[this.theme.mode];
  }
}
