import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import type { WorkbenchFailure } from "./page-parameter.contract";

@Component({
  selector: "ssi-resolution-failure",
  standalone: true,
  template: `
    <section class="failure" role="alert" aria-live="assertive">
      <div aria-hidden="true" class="failure-mark">!</div>
      <div>
        <span class="eyebrow">REQUEST NOT COMPLETED</span>
        <h2>{{ failure().title }}</h2>
        <p>{{ failure().message }}</p>
        <code>{{ failure().code }}</code>
      </div>
      @if (failure().retryable) {
        <button type="button" (click)="retry.emit()">Retry</button>
      }
    </section>
  `,
  styleUrl: "./resolution-workbench.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionFailureComponent {
  readonly failure = input.required<WorkbenchFailure>();
  readonly retry = output<void>();
}
