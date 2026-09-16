import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { AlertComponent } from "../alert.component";
import type { WorkbenchFailure } from "./page-parameter.contract";

@Component({
  selector: "ssi-resolution-failure",
  standalone: true,
  imports: [AlertComponent],
  template: `
    <ssi-alert
      [model]="model()"
      variant="blocking"
      [actionLabel]="failure().retryable ? 'Retry' : ''"
      (action)="retry.emit()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionFailureComponent {
  readonly failure = input.required<WorkbenchFailure>();
  readonly retry = output<void>();
  readonly model = computed(() => ({
    severity: "error" as const,
    title: this.failure().title,
    message: this.failure().message,
    code: this.failure().code,
  }));
}
