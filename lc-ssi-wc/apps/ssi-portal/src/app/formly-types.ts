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
