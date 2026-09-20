import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { FormlyForm, type FormlyFieldConfig } from "@ngx-formly/core";
import { readonlyFormFields } from "./readonly-form-fields";

@Component({
  selector: "ssi-governed-record-view",
  standalone: true,
  imports: [ReactiveFormsModule, FormlyForm],
  templateUrl: "./governed-record-view.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GovernedRecordViewComponent {
  readonly label = input.required<string>();
  readonly recordId = input.required<string>();
  readonly version = input.required<number>();
  readonly status = input.required<string>();
  readonly hideActiveStatus = input(false);
  readonly fields = input.required<readonly FormlyFieldConfig[]>();
  readonly model = input.required<Record<string, unknown>>();
  readonly kicker = input("OAS → PARAMETERS → SCREEN · READ ONLY");
  readonly closed = output<void>();
  readonly form = new FormGroup({});
  readonly readonlyFields = computed(() => readonlyFormFields(this.fields()));

  displayStatus(): string {
    return this.status() === "PENDING_APPROVAL" ? "SUBMITTED" : this.status();
  }
}
