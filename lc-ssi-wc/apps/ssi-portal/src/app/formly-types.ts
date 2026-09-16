import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import {
  FieldType,
  FormlyAttributes,
  type FieldTypeConfig,
} from "@ngx-formly/core";

@Component({
  selector: "ssi-native-input",
  standalone: true,
  imports: [ReactiveFormsModule, FormlyAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field"
    ><span
      >{{ props.label }}
      @if (props.required) {
        <b>*</b>
      }</span
    ><input
      [type]="props.type ?? 'text'"
      [formControl]="formControl"
      [formlyAttributes]="field"
      [placeholder]="props.placeholder ?? ''"
    />
    @if (props.description) {
      <p>{{ props.description }}</p>
    }
    @if (showError) {
      <small>欄位內容不符合規則</small>
    }
  </label>`,
})
export class NativeInputType extends FieldType<FieldTypeConfig> {}

@Component({
  selector: "ssi-native-select",
  standalone: true,
  imports: [ReactiveFormsModule, FormlyAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field"
    ><span
      >{{ props.label }}
      @if (props.required) {
        <b>*</b>
      }</span
    ><select [formControl]="formControl" [formlyAttributes]="field">
      @for (option of selectOptions; track option.value) {
        <option [value]="option.value">{{ option.label }}</option>
      }
    </select>
    @if (props.description) {
      <p>{{ props.description }}</p>
    }
  </label>`,
})
export class NativeSelectType extends FieldType<FieldTypeConfig> {
  get selectOptions(): Array<{ label: string; value: unknown }> {
    return Array.isArray(this.props.options)
      ? (this.props.options as Array<{ label: string; value: unknown }>)
      : [];
  }
}

@Component({
  selector: "ssi-bic-input",
  standalone: true,
  imports: [ReactiveFormsModule, FormlyAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field"
    ><span
      >{{ props.label }}
      @if (props.required) {
        <b>*</b>
      }
    </span>
    <div class="field-input-row">
      <input
        [formControl]="formControl"
        [formlyAttributes]="field"
        [placeholder]="props.placeholder ?? 'BIC8／BIC11'"
      />
      @if (showPicker) {
        <button type="button" class="picker-button" (click)="openPicker()">
          {{ pickerLabel }}
        </button>
      }
    </div>
    @if (props.description) {
      <p>{{ props.description }}</p>
    }
    @if (showError) {
      <small>{{ validationMessage }}</small>
    }
  </label>`,
})
export class BicInputType extends FieldType<FieldTypeConfig> {
  get pickerLabel(): string {
    return (
      (this.field.props as { pickerLabel?: string } | undefined)?.pickerLabel ??
      "從 Bank Service 選擇"
    );
  }
  get showPicker(): boolean {
    return (
      (this.field.props as { showPicker?: boolean } | undefined)?.showPicker ??
      true
    );
  }
  get validationMessage(): string {
    return (
      (this.field.props as { validationMessage?: string } | undefined)
        ?.validationMessage ?? "請輸入符合 ISO 9362 結構的 BIC8 或 BIC11"
    );
  }
  openPicker(): void {
    (
      this.field.props as { pickerAction?: () => void } | undefined
    )?.pickerAction?.();
  }
}

@Component({
  selector: "ssi-message-type-tags",
  standalone: true,
  imports: [ReactiveFormsModule],
  host: { "(document:keydown.escape)": "cancelPicker()" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="message-type-field">
      <legend>
        {{ props.label }}
        @if (props.required) {
          <b>*</b>
        }
      </legend>
      <div class="message-type-selected" aria-live="polite">
        @for (value of selectedValues; track value) {
          <span class="message-type-chip selected">{{ value }}</span>
        } @empty {
          <span class="empty-selection">No Message Types selected</span>
        }
      </div>
      <button type="button" class="open-picker" (click)="openPicker()">
        {{ props.disabled ? "View Message Types" : "Select Message Types" }}
      </button>
      @if (pickerOpen()) {
        <div
          class="message-type-backdrop"
          role="presentation"
          (click)="cancelPicker()"
        >
          <dialog
            open
            aria-modal="true"
            aria-labelledby="message-type-picker-title"
            (click)="$event.stopPropagation()"
          >
            <header>
              <div>
                <small>RMA AUTHORISATION</small>
                <h3 id="message-type-picker-title">
                  {{
                    props.disabled
                      ? "View Message Types"
                      : "Select Message Types"
                  }}
                </h3>
              </div>
              <button
                type="button"
                class="close"
                aria-label="Cancel"
                (click)="cancelPicker()"
              >
                ×
              </button>
            </header>
            @if (!props.disabled) {
              <div
                class="message-type-quick"
                aria-label="Quick select message type categories"
              >
                <span>Quick Select</span>
                <button type="button" (click)="selectGroup('ALL')">All</button>
                <button type="button" (click)="selectGroup('MT1')">
                  MT1xx
                </button>
                <button type="button" (click)="selectGroup('MT2')">
                  MT2xx
                </button>
                <button type="button" (click)="selectGroup('MT3')">
                  MT3xx
                </button>
                <button type="button" (click)="selectGroup('MT4')">
                  MT4xx
                </button>
                <button type="button" (click)="selectGroup('MT7')">
                  MT7xx
                </button>
                <button type="button" (click)="selectGroup('CBPR')">
                  CBPR+ Payments
                </button>
                <button type="button" class="clear" (click)="clear()">
                  Clear
                </button>
              </div>
            }
            <div class="popup-selected">
              <span>{{ selectedValues.length }} selected</span>
            </div>
            <input
              type="search"
              class="message-type-search"
              aria-label="Search message types"
              placeholder="Search MT or ISO 20022 message type"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            <div
              class="message-type-groups"
              role="group"
              [attr.aria-label]="props.label"
            >
              @if (finOptions.length) {
                <section>
                  <h4>SWIFT FIN</h4>
                  @for (option of finOptions; track option.value) {
                    <button
                      type="button"
                      class="message-type-option"
                      [class.selected]="isSelected(option.value)"
                      [attr.aria-pressed]="isSelected(option.value)"
                      [disabled]="props.disabled === true"
                      (click)="toggle(option.value)"
                    >
                      <span
                        >{{ isSelected(option.value) ? "☑" : "☐" }}
                        {{ option.label }}</span
                      ><small>{{ description(option.value) }}</small>
                    </button>
                  }
                </section>
              }
              @if (isoOptions.length) {
                <section>
                  <h4>ISO 20022</h4>
                  @for (option of isoOptions; track option.value) {
                    <button
                      type="button"
                      class="message-type-option"
                      [class.selected]="isSelected(option.value)"
                      [attr.aria-pressed]="isSelected(option.value)"
                      [disabled]="props.disabled === true"
                      (click)="toggle(option.value)"
                    >
                      <span
                        >{{ isSelected(option.value) ? "☑" : "☐" }}
                        {{ option.label }}</span
                      ><small>{{ description(option.value) }}</small>
                    </button>
                  }
                </section>
              }
            </div>
            <footer>
              @if (props.disabled) {
                <button type="button" class="done" (click)="finishPicker()">
                  Close
                </button>
              } @else {
                <button type="button" class="cancel" (click)="cancelPicker()">
                  Cancel</button
                ><button type="button" class="done" (click)="finishPicker()">
                  Done
                </button>
              }
            </footer>
          </dialog>
        </div>
      }
      @if (props.description) {
        <p>{{ props.description }}</p>
      }
      @if (showError) {
        <small>至少選擇一個有效 Message Type</small>
      }
    </fieldset>
  `,
  styles: [
    `
      .message-type-field {
        border: 0;
        margin: 0;
        padding: 0;
        min-width: 0;
      }
      legend {
        font-weight: 700;
        margin-bottom: 0.45rem;
      }
      legend b {
        color: #ff6859;
      }
      .message-type-search {
        width: 100%;
        margin: 0.65rem 0;
      }
      .message-type-quick,
      .message-type-selected,
      .message-type-options {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
      }
      .message-type-quick span,
      .section-label {
        color: #9fc1c2;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .message-type-quick button {
        border: 1px solid #607d82;
        border-radius: 999px;
        background: transparent;
        color: #e9f6f4;
        padding: 0.32rem 0.6rem;
      }
      .message-type-quick .clear {
        color: #ffb2a9;
        border-color: #aa5e57;
      }
      .message-type-selected {
        min-height: 2rem;
      }
      .selected-chip {
        border: 1px solid #b6ff13;
        border-radius: 999px;
        background: #29423d;
        color: #b6ff13;
        padding: 0.35rem 0.62rem;
      }
      .empty-selection {
        color: #78999b;
      }
      .open-picker {
        width: 100%;
        margin-top: 0.5rem;
        border: 1px solid #607d82;
        border-radius: 0.4rem;
        background: #193338;
        color: #e9f6f4;
        padding: 0.65rem;
        text-align: left;
      }
      .message-type-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: grid;
        place-items: center;
        background: rgba(2, 13, 15, 0.78);
        padding: 1rem;
      }
      dialog {
        width: min(920px, 94vw);
        max-height: 88vh;
        overflow: auto;
        border: 1px solid #527176;
        border-radius: 0.7rem;
        background: #102527;
        color: #e9f6f4;
        padding: 1rem;
      }
      header,
      footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      header h3 {
        margin: 0.15rem 0 0.75rem;
      }
      header small {
        color: #78999b;
        letter-spacing: 0.12em;
      }
      .close {
        border: 0;
        background: transparent;
        color: #fff;
        font-size: 1.5rem;
      }
      .popup-selected {
        color: #b6ff13;
        margin-top: 0.65rem;
      }
      footer {
        justify-content: flex-end;
        margin-top: 0.8rem;
      }
      footer button {
        border-radius: 0.4rem;
        padding: 0.55rem 0.9rem;
      }
      footer .cancel {
        background: #294247;
        color: #fff;
        border: 0;
      }
      footer .done {
        background: #b6ff13;
        color: #102000;
        border: 0;
      }
      .message-type-groups {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
      }
      .message-type-groups section {
        border: 1px solid #36575b;
        border-radius: 0.5rem;
        padding: 0.65rem;
      }
      h4 {
        color: #9fc1c2;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        margin: 0 0 0.45rem;
        text-transform: uppercase;
      }
      .message-type-option {
        width: 100%;
        border: 0;
        border-radius: 0.35rem;
        background: transparent;
        color: #e9f6f4;
        display: grid;
        gap: 0.12rem;
        padding: 0.45rem 0.5rem;
        text-align: left;
      }
      .message-type-option:hover,
      .message-type-option.selected {
        background: #29423d;
      }
      .message-type-option.selected > span {
        color: #b6ff13;
      }
      .message-type-option small {
        color: #78999b;
        margin: 0;
      }
      .message-type-option:disabled {
        cursor: default;
        opacity: 1;
      }
      .message-type-chip {
        border: 1px solid #607d82;
        border-radius: 999px;
        background: #193338;
        color: #e9f6f4;
        padding: 0.42rem 0.72rem;
      }
      .message-type-chip.selected {
        border-color: #b6ff13;
        background: #29423d;
        color: #b6ff13;
      }
      .message-type-chip:disabled {
        opacity: 1;
        cursor: default;
      }
      p {
        color: #9fc1c2;
        margin: 0.55rem 0 0;
      }
      fieldset > small {
        color: #ff6859;
        display: block;
        margin-top: 0.4rem;
      }
      @media (max-width: 700px) {
        .message-type-groups {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class MessageTypeTagsType extends FieldType<FieldTypeConfig> {
  readonly query = signal("");
  readonly pickerOpen = signal(false);
  private initialValue = "";

  get messageOptions(): Array<{ label: string; value: string }> {
    if (!Array.isArray(this.props.options)) return [];
    return (
      this.props.options as Array<{ label: unknown; value: unknown }>
    ).map(({ label, value }) => ({
      label: String(label),
      value: String(value),
    }));
  }

  get selectedValues(): string[] {
    return String(this.formControl.value ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  get visibleOptions(): Array<{ label: string; value: string }> {
    const query = this.query().trim().toLocaleUpperCase();
    return query
      ? this.messageOptions.filter(({ label, value }) =>
          `${label} ${value}`.toLocaleUpperCase().includes(query),
        )
      : this.messageOptions;
  }

  get selectedOptions(): Array<{ label: string; value: string }> {
    const selected = new Set(this.selectedValues);
    return this.messageOptions.filter(({ value }) => selected.has(value));
  }

  get finOptions(): Array<{ label: string; value: string }> {
    return this.visibleOptions.filter(({ value }) => value.startsWith("MT"));
  }

  get isoOptions(): Array<{ label: string; value: string }> {
    return this.visibleOptions.filter(({ value }) => !value.startsWith("MT"));
  }

  isSelected(value: string): boolean {
    return this.selectedValues.includes(value);
  }

  toggle(value: string): void {
    const selected = new Set(this.selectedValues);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    this.formControl.setValue([...selected].join(", "));
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  openPicker(): void {
    this.initialValue = String(this.formControl.value ?? "");
    this.query.set("");
    this.pickerOpen.set(true);
  }

  cancelPicker(): void {
    if (!this.pickerOpen()) return;
    this.formControl.setValue(this.initialValue);
    this.pickerOpen.set(false);
  }

  finishPicker(): void {
    this.pickerOpen.set(false);
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  selectGroup(
    group: "ALL" | "MT1" | "MT2" | "MT3" | "MT4" | "MT7" | "CBPR",
  ): void {
    const selected = new Set(this.selectedValues);
    const matches = this.messageOptions.filter(({ value }) =>
      group === "ALL"
        ? true
        : group === "CBPR"
          ? value.startsWith("pacs.")
          : value.startsWith(group),
    );
    for (const { value } of matches) selected.add(value);
    this.setSelected(selected);
  }

  clear(): void {
    this.setSelected(new Set());
  }

  description(value: string): string {
    const descriptions: Record<string, string> = {
      MT101: "Request for Transfer",
      MT103: "Single Customer Credit Transfer",
      MT200: "FI Transfer for Own Account",
      MT202: "General Financial Institution Transfer",
      MT202COV: "General FI Transfer — Cover",
      MT203: "Multiple General FI Transfer",
      MT205: "Financial Institution Transfer Execution",
      MT205COV: "FI Transfer Execution — Cover",
      MT300: "Foreign Exchange Confirmation",
      MT320: "Fixed Loan / Deposit Confirmation",
      MT400: "Advice of Payment",
      MT700: "Documentary Credit Issuance",
      MT740: "Authorisation to Reimburse",
      MT742: "Reimbursement Claim",
      MT760: "Guarantee / Standby Issuance",
      MT765: "Guarantee / Standby Demand",
      "pacs.008.001.12": "FI to FI Customer Credit Transfer",
      "pacs.009.001.08": "Financial Institution Credit Transfer",
      "pacs.009.001.12": "Financial Institution Credit Transfer",
      "pacs.009.001.12.COV": "Financial Institution Transfer — Cover",
    };
    return descriptions[value] ?? "Governed message type";
  }

  private setSelected(selected: Set<string>): void {
    this.formControl.setValue([...selected].join(", "));
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }
}
