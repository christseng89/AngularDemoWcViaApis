import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
  selector: "ssi-loading-state",
  standalone: true,
  template: `<div class="catalog-loading" role="status" aria-live="polite">
    <span aria-hidden="true"></span><div><b>{{ label() }}</b></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingStateComponent {
  readonly label = input.required<string>();
}
