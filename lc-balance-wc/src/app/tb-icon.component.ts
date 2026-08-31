import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/**
 * P2 UI/UX pass — one shared inline-SVG icon set (16px, 1.75 stroke, `currentColor`, no fill/shadow;
 * user-confirmed via `AskUserQuestion` "細線條風格") used by the A1–A9/B1–B5 function chips
 * (action-type), the Maker/Checker/Look Up section-header role icons, the status badges, and the
 * theme toggle (`AppComponent`) — one component rather than duplicating raw SVG markup at each call
 * site. Deliberately at `src/app/` (not nested under `transaction-builder/`) since `AppComponent`
 * (theme toggle) is a consumer too, not just that one feature.
 */
export type TbIconName = 'issue' | 'amend' | 'utilize' | 'redeem' | 'checker' | 'lookup' | 'ok' | 'pending' | 'cross' | 'dash' | 'sun' | 'moon' | 'system';

@Component({
  selector: 'app-tb-icon',
  imports: [CommonModule],
  template: `
    <svg
      class="tb-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      [ngSwitch]="name"
    >
      <ng-container *ngSwitchCase="'issue'">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </ng-container>
      <ng-container *ngSwitchCase="'amend'">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </ng-container>
      <ng-container *ngSwitchCase="'utilize'">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
      </ng-container>
      <ng-container *ngSwitchCase="'redeem'">
        <polyline points="20 6 9 17 4 12" />
      </ng-container>
      <ng-container *ngSwitchCase="'checker'">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </ng-container>
      <ng-container *ngSwitchCase="'lookup'">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </ng-container>
      <ng-container *ngSwitchCase="'ok'">
        <polyline points="20 6 9 17 4 12" />
      </ng-container>
      <ng-container *ngSwitchCase="'pending'">
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      </ng-container>
      <ng-container *ngSwitchCase="'cross'">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </ng-container>
      <ng-container *ngSwitchCase="'dash'">
        <line x1="6" y1="12" x2="18" y2="12" />
      </ng-container>
      <ng-container *ngSwitchCase="'sun'">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </ng-container>
      <ng-container *ngSwitchCase="'moon'">
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
      </ng-container>
      <ng-container *ngSwitchCase="'system'">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </ng-container>
    </svg>
  `,
})
export class TbIconComponent {
  @Input({ required: true }) name!: TbIconName;
}
