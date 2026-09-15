import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  input,
  output,
} from "@angular/core";
import {
  FormControl,
  FormRecord,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from "@angular/forms";
import { Subscription } from "rxjs";
import type { ParameterValue } from "./page-parameter.contract";
import type {
  ParameterFieldViewModel,
  ResolutionWorkbenchViewModel,
} from "./parameter-model.mapper";
import { BankServiceLookupComponent } from "./bank-service-lookup.component";
import type { ParameterLookupContext } from "./parameter-lookup.facade";
import { dependentInvalidatedFieldIds } from "./parameter-dependencies";
import { userInputFields, userInputValues } from "./parameter-form-values";
import { lookupDependenciesSatisfied } from "./lookup-resolution-key";

export interface ParameterFormSubmission {
  readonly values: Readonly<Record<string, ParameterValue>>;
}

const validatorsFor = (field: ParameterFieldViewModel): ValidatorFn[] => {
  const validators: ValidatorFn[] = [];
  if (field.required) validators.push(Validators.required);
  for (const constraint of field.constraints) {
    if (
      constraint.kind === "MIN_LENGTH" &&
      typeof constraint.value === "number"
    )
      validators.push(Validators.minLength(constraint.value));
    if (
      constraint.kind === "MAX_LENGTH" &&
      typeof constraint.value === "number"
    )
      validators.push(Validators.maxLength(constraint.value));
    if (constraint.kind === "PATTERN" && typeof constraint.value === "string")
      validators.push(Validators.pattern(constraint.value));
  }
  return validators;
};

@Component({
  selector: "ssi-generic-parameter-form",
  standalone: true,
  imports: [ReactiveFormsModule, BankServiceLookupComponent],
  templateUrl: "./generic-parameter-form.component.html",
  styleUrl: "./resolution-workbench.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericParameterFormComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly model = input<ResolutionWorkbenchViewModel | null>(null);
  readonly submitting = input(false);
  readonly pageSize = input.required<number>();
  readonly submitted = output<ParameterFormSubmission>();
  readonly cancelled = output<void>();
  readonly form = new FormRecord<FormControl<ParameterValue>>({});
  readonly lookupContext = signal<ParameterLookupContext>({});
  private readonly formInvalid = signal(true);
  readonly resolveDisabled = computed(
    () => this.submitting() || this.formInvalid(),
  );
  private controlSubscriptions = new Subscription();

  constructor() {
    this.destroyRef.onDestroy(() => this.controlSubscriptions.unsubscribe());
    effect(() => {
      const model = this.model();
      if (!model) return;
      const inputFields = userInputFields(model);
      const controls = Object.fromEntries(
        inputFields.map((field) => [
          field.fieldId,
          new FormControl<ParameterValue>(
            {
              value: model.initialValues[field.fieldId] ?? "",
              disabled: field.readOnly === true,
            },
            { nonNullable: true, validators: validatorsFor(field) },
          ),
        ]),
      );
      Object.keys(this.form.controls).forEach((key) =>
        this.form.removeControl(key),
      );
      Object.entries(controls).forEach(([key, control]) =>
        this.form.addControl(key, control),
      );
      const initialValues = this.form.getRawValue();
      for (const field of inputFields) {
        if (
          field.lookup &&
          !lookupDependenciesSatisfied(field.lookup, {
            ...model.lookupContext,
            dependencyValues: initialValues,
          })
        )
          this.form.controls[field.fieldId]?.setValue("", {
            emitEvent: false,
          });
      }
      this.form.updateValueAndValidity({ emitEvent: false });
      this.formInvalid.set(this.form.invalid);
      this.controlSubscriptions.unsubscribe();
      this.controlSubscriptions = new Subscription();
      this.controlSubscriptions.add(
        this.form.statusChanges.subscribe(() =>
          this.formInvalid.set(this.form.invalid),
        ),
      );
      this.refreshLookupContext(model);
      for (const field of inputFields) {
        const control = this.form.controls[field.fieldId];
        if (!control) continue;
        this.controlSubscriptions.add(
          control.valueChanges.subscribe(() => {
            for (const fieldId of dependentInvalidatedFieldIds(
              model.fields,
              field.fieldId,
            ))
              this.form.controls[fieldId]?.setValue("", { emitEvent: false });
            this.refreshLookupContext(model);
          }),
        );
      }
    });
  }

  private refreshLookupContext(model: ResolutionWorkbenchViewModel): void {
    this.lookupContext.set({
      ...model.lookupContext,
      dependencyValues: this.form.getRawValue(),
    });
  }

  updateCheckbox(fieldId: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement)
      this.form.controls[fieldId]?.setValue(target.checked);
  }

  updateLookup(fieldId: string, bankServiceId: string): void {
    this.form.controls[fieldId]?.setValue(bankServiceId);
    this.form.controls[fieldId]?.markAsTouched();
  }

  lookupValue(value: ParameterValue): string {
    return typeof value === "string" ? value : "";
  }

  submit(): void {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const model = this.model();
    if (!model) return;
    this.submitted.emit({
      values: userInputValues(model, this.form.getRawValue()),
    });
  }

  cancel(): void {
    if (!this.submitting()) this.cancelled.emit();
  }
}
