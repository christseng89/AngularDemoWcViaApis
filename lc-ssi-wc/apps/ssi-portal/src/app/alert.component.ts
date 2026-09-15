import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";
import { alertIcon, alertRole, type AlertModel, type AlertVariant } from "./alert.model";

@Component({
  selector: "ssi-alert",
  standalone: true,
  template: `
    <section
      class="app-alert"
      [class]="'app-alert ' + model().severity + ' ' + variant()"
      [attr.role]="liveRole()"
      [attr.aria-live]="model().severity === 'error' ? 'assertive' : 'polite'"
    >
      <div class="alert-icon" aria-hidden="true">{{ icon() }}</div>
      <div class="alert-copy">
        <strong>{{ model().title }}</strong>
        <p>{{ model().message }}</p>
        @if (model().impact) { <small><b>影響：</b>{{ model().impact }}</small> }
        @if (model().code) { <code>{{ model().code }}</code> }
      </div>
      @if (actionLabel()) {
        <button type="button" class="alert-action" [disabled]="busy()" (click)="action.emit()">
          {{ busy() ? busyLabel() : actionLabel() }}
        </button>
      }
      @if (dismissible()) {
        <button type="button" class="alert-dismiss" aria-label="關閉訊息" (click)="dismiss.emit()">×</button>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertComponent {
  readonly model = input.required<AlertModel>();
  readonly variant = input<AlertVariant>("banner");
  readonly actionLabel = input("");
  readonly busyLabel = input("處理中…");
  readonly busy = input(false);
  readonly dismissible = input(false);
  readonly action = output<void>();
  readonly dismiss = output<void>();
  readonly liveRole = computed(() => alertRole(this.model().severity));
  readonly icon = computed(() => alertIcon(this.model().severity));
}
