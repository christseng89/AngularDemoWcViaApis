import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    <nav class="navbar navbar-expand border-bottom mb-3">
      <div class="container">
        <span class="navbar-brand">Balance Component</span>
        <div class="navbar-nav">
          <a class="nav-link" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Transaction Builder</a>
          <a class="nav-link" routerLink="/business-cases" routerLinkActive="active">Business Case Runner</a>
        </div>
        <div class="theme-switcher">
          <label for="theme-mode">Theme:</label>
          <select id="theme-mode" [ngModel]="theme.mode" (ngModelChange)="theme.setMode($event)">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
}
