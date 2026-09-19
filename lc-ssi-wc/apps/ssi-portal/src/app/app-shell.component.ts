import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import type { AppView } from "./app-view.models";

@Component({
  selector: "ssi-app-shell",
  standalone: true,
  templateUrl: "./app-shell.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly view = input.required<AppView>();
  readonly checkerCount = input.required<number>();
  readonly detailOpen = input.required<boolean>();
  readonly auditDetailOpen = input.required<boolean>();
  readonly navigationRequested = output<AppView>();
  readonly refreshRequested = output<void>();

  requestNavigation(view: AppView): void {
    this.navigationRequested.emit(view);
  }

  requestRefresh(): void {
    this.refreshRequested.emit();
  }
}
