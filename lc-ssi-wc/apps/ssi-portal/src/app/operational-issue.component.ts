import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import type { OperationalIssue } from "./operational-issue";
import { AlertComponent } from "./alert.component";

@Component({
  selector: "ssi-operational-issue",
  standalone: true,
  imports: [AlertComponent],
  template: `
    <ssi-alert
      [model]="model()"
      variant="blocking"
      [actionLabel]="issue().retryLabel"
      busyLabel="重試中…"
      [busy]="busy()"
      (action)="retry.emit()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationalIssueComponent {
  readonly issue = input.required<OperationalIssue>();
  readonly busy = input(false);
  readonly retry = output<void>();
  readonly model = computed(() => ({
    severity: "error" as const,
    title: this.issue().title,
    message: `${this.issue().eyebrow} · ${this.issue().reason}`,
    impact: this.issue().impact,
    code: this.issue().code,
  }));
}
