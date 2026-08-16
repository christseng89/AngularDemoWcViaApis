import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar navbar-expand navbar-light bg-white border-bottom mb-3">
      <div class="container">
        <span class="navbar-brand">Balance Component</span>
        <div class="navbar-nav">
          <a class="nav-link" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Transaction Builder</a>
          <a class="nav-link" routerLink="/business-cases" routerLinkActive="active">Business Case Runner</a>
        </div>
      </div>
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {}
