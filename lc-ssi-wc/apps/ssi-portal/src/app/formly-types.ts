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

type MessageDirection = "INBOUND" | "OUTBOUND";
type MessageCategoryId = "SECURITY" | "TRADE_FINANCE" | "PAYMENT";
type MessageTypeOperation = "ADD" | "EDIT" | "INQUIRE";
interface MessageTypeCategory {
  readonly categoryId: MessageCategoryId;
  readonly displayName: string;
  readonly displayOrder: number;
  readonly emptyStateText: string;
}
interface MessageTypePolicyItem {
  readonly messageType: string;
  readonly description: string;
  readonly categoryId: MessageCategoryId;
  readonly directionApplicability: {
    readonly inbound: { readonly applicable: boolean };
    readonly outbound: { readonly applicable: boolean };
  };
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
      <button
        type="button"
        class="open-picker"
        [attr.aria-label]="operationButtonLabel"
        (click)="openPicker()"
      >
        <span class="button-icon" aria-hidden="true">{{ operationIcon }}</span>
        <span>{{ operationButtonLabel }}</span>
        <span aria-hidden="true">→</span>
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
                  {{ operationTitle }}
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
            <nav
              class="message-type-tabs"
              role="tablist"
              aria-label="Message categories"
            >
              @for (category of categories; track category.categoryId) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="
                    activeCategory() === category.categoryId
                  "
                  [class.active]="activeCategory() === category.categoryId"
                  (click)="activeCategory.set(category.categoryId)"
                >
                  {{ category.displayName }}
                </button>
              }
            </nav>
            <div class="popup-selected" aria-live="polite">
              <span>INBOUND · {{ directionCount("INBOUND") }} selected</span>
              <span>OUTBOUND · {{ directionCount("OUTBOUND") }} selected</span>
            </div>
            <input
              type="search"
              class="message-type-search"
              aria-label="Search message types"
              placeholder="Search MT or ISO 20022 message type"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            <div class="direction-matrix" [attr.aria-label]="props.label">
              @for (direction of directions; track direction) {
                <section
                  [class.inbound]="direction === 'INBOUND'"
                  [class.outbound]="direction === 'OUTBOUND'"
                  [class.direction-locked]="!directionEditable(direction)"
                  [attr.aria-disabled]="!directionEditable(direction)"
                >
                  <div class="direction-heading">
                    <strong>{{ direction }}</strong>
                    <span>{{
                      direction === "INBOUND"
                        ? "Messages received"
                        : "Messages sent"
                    }}</span>
                    <small class="direction-access">
                      {{ directionAccessLabel(direction) }}
                    </small>
                  </div>
                  <div
                    class="message-table"
                    role="group"
                    [attr.aria-label]="direction"
                  >
                    @for (item of categoryItems; track item.messageType) {
                      <label
                        class="message-row"
                        [class.selected]="
                          isDirectionSelected(direction, item.messageType)
                        "
                      >
                        <span>
                          <b>{{ item.messageType }}</b>
                          <small>{{ item.description }}</small>
                        </span>
                        <input
                          type="checkbox"
                          [checked]="
                            isDirectionSelected(direction, item.messageType)
                          "
                          [disabled]="
                            !directionEditable(direction) ||
                            !directionApplicable(direction, item)
                          "
                          (change)="
                            toggleDirection(direction, item.messageType)
                          "
                        />
                      </label>
                    } @empty {
                      <p class="empty-category">
                        {{ activeCategoryDefinition?.emptyStateText }}
                      </p>
                    }
                  </div>
                </section>
              }
            </div>
            <footer>
              @if (!props.disabled) {
                <button type="button" class="reset" (click)="resetPicker()">
                  Reset
                </button>
                <button type="button" class="done" (click)="finishPicker()">
                  Save Changes
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
        width: auto;
        min-width: 13rem;
        min-height: 46px;
        margin-top: 0.75rem;
        border: 1px solid #b6ff13;
        border-radius: 0.45rem;
        background: #b6ff13;
        color: #102000;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.65rem;
        padding: 0.72rem 1rem;
        font-weight: 800;
        text-align: center;
        cursor: pointer;
        box-shadow: 0 3px 0 #648e0b;
      }
      .open-picker:hover {
        background: #c8ff4d;
      }
      .open-picker:focus-visible {
        outline: 3px solid #fff;
        outline-offset: 2px;
      }
      .open-picker:active {
        box-shadow: 0 1px 0 #648e0b;
        transform: translateY(2px);
      }
      .button-icon {
        display: grid;
        place-items: center;
        width: 1.5rem;
        height: 1.5rem;
        border: 1px solid currentColor;
        border-radius: 50%;
        font-size: 1rem;
        line-height: 1;
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
        width: 48px;
        height: 48px;
        border: 1px solid #b6ff13;
        border-radius: 0.55rem;
        background: #193338;
        color: #fff;
        font-size: 2rem;
        font-weight: 800;
        line-height: 1;
      }
      .close:focus-visible {
        outline: 3px solid #fff;
        outline-offset: 2px;
      }
      .popup-selected {
        color: #b6ff13;
        margin-top: 0.65rem;
        display: flex;
        gap: 1rem;
      }
      .message-type-tabs {
        display: flex;
        gap: 0.45rem;
        border-bottom: 1px solid #36575b;
        margin-top: 0.5rem;
      }
      .message-type-tabs button {
        border: 0;
        border-bottom: 3px solid transparent;
        background: transparent;
        color: #9fc1c2;
        font-weight: 700;
        padding: 0.65rem 0.85rem;
      }
      .message-type-tabs button.active {
        border-bottom-color: #b6ff13;
        color: #fff;
      }
      footer {
        justify-content: flex-end;
        margin-top: 0.8rem;
      }
      footer button {
        border-radius: 0.4rem;
        padding: 0.55rem 0.9rem;
      }
      footer .reset {
        background: transparent;
        color: #e9f6f4;
        border: 1px solid #607d82;
      }
      footer .done {
        background: #b6ff13;
        color: #102000;
        border: 0;
      }
      .direction-matrix {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
      }
      .direction-matrix section {
        border: 1px solid #36575b;
        border-radius: 0.5rem;
        overflow: hidden;
      }
      .direction-heading {
        display: grid;
        gap: 0.15rem;
        padding: 0.75rem;
        background: #173a46;
      }
      .outbound .direction-heading {
        background: #292852;
      }
      .direction-locked {
        opacity: 0.58;
      }
      .direction-access {
        width: fit-content;
        margin-top: 0.25rem;
        border: 1px solid currentColor;
        border-radius: 999px;
        padding: 0.16rem 0.45rem;
        color: #dfffa5;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .direction-locked .direction-access {
        color: #d4dcda;
      }
      .direction-heading span,
      .message-row small {
        color: #9fc1c2;
      }
      .message-table {
        display: grid;
      }
      .message-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.75rem;
        border-bottom: 1px solid #29474b;
        padding: 0.65rem 0.75rem;
      }
      .message-row > span {
        display: grid;
        gap: 0.18rem;
      }
      .message-row.selected {
        background: #29423d;
      }
      .message-row input {
        width: 1.25rem;
        height: 1.25rem;
        accent-color: #b6ff13;
      }
      .empty-category {
        padding: 1rem;
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
        .direction-matrix {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class MessageTypeTagsType extends FieldType<FieldTypeConfig> {
  readonly query = signal("");
  readonly pickerOpen = signal(false);
  readonly activeCategory = signal<MessageCategoryId>("SECURITY");
  readonly directions: readonly MessageDirection[] = ["INBOUND", "OUTBOUND"];
  readonly inboundSelection = signal<readonly string[]>([]);
  readonly outboundSelection = signal<readonly string[]>([]);
  private initialValue = "";
  private initialInbound: readonly string[] = [];
  private initialOutbound: readonly string[] = [];

  get operation(): MessageTypeOperation {
    if (this.props.disabled === true) return "INQUIRE";
    const configured = (
      this.props as
        | {
            messageTypeOperation?:
              MessageTypeOperation | (() => MessageTypeOperation);
          }
        | undefined
    )?.messageTypeOperation;
    const resolved =
      typeof configured === "function" ? configured() : configured;
    return resolved === "EDIT"
      ? "EDIT"
      : resolved === "INQUIRE"
        ? "INQUIRE"
        : "ADD";
  }

  get operationButtonLabel(): string {
    return this.operation === "INQUIRE" ? "View" : "Edit";
  }

  get operationIcon(): string {
    return this.operation === "INQUIRE" ? "⌕" : "✎";
  }

  get operationTitle(): string {
    return `${this.operationLabel} RMA Message Types`;
  }

  private get operationLabel(): "Add" | "Edit" | "Inquire" {
    return this.operation === "EDIT"
      ? "Edit"
      : this.operation === "INQUIRE"
        ? "Inquire"
        : "Add";
  }

  get categories(): MessageTypeCategory[] {
    const categories = (
      this.props as
        { messageTypeCategories?: readonly MessageTypeCategory[] } | undefined
    )?.messageTypeCategories;
    return [...(categories ?? [])].sort(
      (left, right) => left.displayOrder - right.displayOrder,
    );
  }

  get policyItems(): MessageTypePolicyItem[] {
    return [
      ...((
        this.props as
          { messageTypeItems?: readonly MessageTypePolicyItem[] } | undefined
      )?.messageTypeItems ?? []),
    ];
  }

  get activeCategoryDefinition(): MessageTypeCategory | undefined {
    return this.categories.find(
      ({ categoryId }) => categoryId === this.activeCategory(),
    );
  }

  get categoryItems(): MessageTypePolicyItem[] {
    const query = this.query().trim().toLocaleUpperCase();
    return this.policyItems.filter(
      (item) =>
        item.categoryId === this.activeCategory() &&
        (!query ||
          `${item.messageType} ${item.description}`
            .toLocaleUpperCase()
            .includes(query)),
    );
  }

  get currentDirection(): MessageDirection {
    return (this.field.model as { direction?: MessageDirection } | undefined)
      ?.direction === "INBOUND"
      ? "INBOUND"
      : "OUTBOUND";
  }

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
    const selected = this.selectedValues;
    const selectionForDirection = (
      this.props as
        | {
            messageTypeSelectionForDirection?: (
              model: Record<string, unknown>,
              direction: MessageDirection,
            ) => readonly string[];
          }
        | undefined
    )?.messageTypeSelectionForDirection;
    const model =
      (this.field.model as Record<string, unknown> | undefined) ?? {};
    const directionSelection = (
      direction: MessageDirection,
    ): readonly string[] =>
      direction === this.currentDirection
        ? selected
        : (selectionForDirection?.(model, direction) ?? []);
    this.initialInbound = directionSelection("INBOUND");
    this.initialOutbound = directionSelection("OUTBOUND");
    this.inboundSelection.set([...this.initialInbound]);
    this.outboundSelection.set([...this.initialOutbound]);
    this.activeCategory.set(this.categories[0]?.categoryId ?? "SECURITY");
    this.query.set("");
    this.pickerOpen.set(true);
  }

  cancelPicker(): void {
    if (!this.pickerOpen()) return;
    this.formControl.setValue(this.initialValue);
    this.pickerOpen.set(false);
  }

  finishPicker(): void {
    const selected =
      this.currentDirection === "INBOUND"
        ? this.inboundSelection()
        : this.outboundSelection();
    this.formControl.setValue(selected.join(", "));
    this.pickerOpen.set(false);
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  isDirectionSelected(
    direction: MessageDirection,
    messageType: string,
  ): boolean {
    return this.directionSelection(direction).includes(messageType);
  }

  toggleDirection(direction: MessageDirection, messageType: string): void {
    if (!this.directionEditable(direction)) return;
    const selected = new Set(this.directionSelection(direction));
    if (selected.has(messageType)) selected.delete(messageType);
    else selected.add(messageType);
    this.setDirectionSelection(direction, [...selected]);
  }

  directionApplicable(
    direction: MessageDirection,
    item: MessageTypePolicyItem,
  ): boolean {
    return direction === "INBOUND"
      ? item.directionApplicability.inbound.applicable
      : item.directionApplicability.outbound.applicable;
  }

  directionCount(direction: MessageDirection): number {
    return this.directionSelection(direction).length;
  }

  directionEditable(direction: MessageDirection): boolean {
    return this.props.disabled !== true && direction === this.currentDirection;
  }

  directionAccessLabel(direction: MessageDirection): string {
    if (this.props.disabled === true) return "Inquire only";
    return this.directionEditable(direction)
      ? `${direction} editable`
      : `Locked for ${this.currentDirection} record`;
  }

  resetPicker(): void {
    this.inboundSelection.set([...this.initialInbound]);
    this.outboundSelection.set([...this.initialOutbound]);
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

  private setSelected(selected: Set<string>): void {
    this.formControl.setValue([...selected].join(", "));
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  private directionSelection(direction: MessageDirection): readonly string[] {
    return direction === "INBOUND"
      ? this.inboundSelection()
      : this.outboundSelection();
  }

  private setDirectionSelection(
    direction: MessageDirection,
    selected: readonly string[],
  ): void {
    const ordered = this.policyItems
      .map(({ messageType }) => messageType)
      .filter((messageType) => selected.includes(messageType));
    if (direction === "INBOUND") this.inboundSelection.set(ordered);
    else this.outboundSelection.set(ordered);
  }
}
