import { ChangeDetectionStrategy, Component } from "@angular/core";

/**
 * A standalone boundary for feature workspaces whose screens still share the
 * root orchestration state. Keeping the boundary standalone lets Angular emit
 * a real deferred chunk without duplicating that state or its business rules.
 */
@Component({
  selector: "ssi-deferred-feature-shell",
  standalone: true,
  template: "<ng-content />",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeferredFeatureShellComponent {}
