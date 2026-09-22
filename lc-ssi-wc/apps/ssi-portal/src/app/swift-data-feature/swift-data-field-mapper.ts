import { Injectable } from "@angular/core";
import type { AbstractControl } from "@angular/forms";
import type { FormlyFieldConfig } from "@ngx-formly/core";
import { scalarText } from "../scalar-text";
import type {
  CurrencyReference,
  RmaMessageTypePolicy,
  UiField,
  UiResource,
} from "./swift-data.models";

export interface SwiftDataFieldActions {
  editingId: () => string | null;
  selectMessageTypes: (
    model: Record<string, unknown>,
    direction: "INBOUND" | "OUTBOUND",
  ) => unknown;
  openBankPicker: (field: UiField) => void;
}

@Injectable()
export class SwiftDataFieldMapper {
  fields(
    resource: UiResource,
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
    actions: SwiftDataFieldActions,
  ): FormlyFieldConfig[] {
    return resource.fields.map((field) =>
      this.formlyField(field, currencies, messageTypePolicy, actions),
    );
  }

  private formlyField(
    field: UiField,
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
    actions: SwiftDataFieldActions,
  ): FormlyFieldConfig {
    const config: FormlyFieldConfig = {
      key: field.key,
      type: field.type,
      props: this.fieldProps(field, currencies, messageTypePolicy, actions),
    };
    if (field.defaultValue !== undefined)
      config.defaultValue = field.defaultValue;
    if (field.type === "multicheckbox")
      config.validators = {
        messageTypes: { expression: this.validMessageTypes },
      };
    const requiredWhen = field["x-required-when"];
    const disabledWhen = field["x-disabled-when"];
    if (requiredWhen || disabledWhen) {
      const expressions: NonNullable<FormlyFieldConfig["expressions"]> = {};
      if (requiredWhen)
        expressions["props.required"] = (formlyField: FormlyFieldConfig) =>
          this.getPath(
            (formlyField.model as Record<string, unknown>) ?? {},
            requiredWhen.path,
          ) === requiredWhen.equals;
      if (disabledWhen)
        expressions["props.disabled"] = (formlyField: FormlyFieldConfig) =>
          this.getPath(
            (formlyField.model as Record<string, unknown>) ?? {},
            disabledWhen.path,
          ) === disabledWhen.equals;
      config.expressions = expressions;
    }
    return config;
  }

  private fieldProps(
    field: UiField,
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
    actions: SwiftDataFieldActions,
  ): NonNullable<FormlyFieldConfig["props"]> {
    const props: NonNullable<FormlyFieldConfig["props"]> = {
      label: field.label,
      required: Boolean(field.required),
      options: this.fieldOptions(field, currencies, messageTypePolicy),
    };
    const optionalProps: Array<
      [keyof NonNullable<FormlyFieldConfig["props"]>, unknown]
    > = [
      ["type", field.inputType],
      ["pattern", field.pattern],
      ["minLength", field.minLength],
      ["maxLength", field.maxLength],
      ["min", field.minimum],
      ["max", field.maximum],
      ["description", field.description],
    ];
    for (const [key, value] of optionalProps)
      if (value !== undefined) props[key] = value as never;
    if (field.type === "multicheckbox") {
      props.description =
        "從受控清單選擇；Popup 以相同參數並排顯示 INBOUND／OUTBOUND。";
      props["messageTypeCategories"] = messageTypePolicy.categories;
      props["messageTypeItems"] = messageTypePolicy.items;
      props["messageTypeOperation"] = () => (actions.editingId() ? "EDIT" : "ADD");
      props["messageTypeSelectionForDirection"] = (
        model: Record<string, unknown>,
        direction: "INBOUND" | "OUTBOUND",
      ) => actions.selectMessageTypes(model, direction);
    }
    if (field.referenceSource === "reference/banks") {
      props.readonly = true;
      props.showPicker = true;
      props.pickerLabel = "Bank Service";
      props.pickerAction = () => actions.openBankPicker(field);
      props.description =
        field.description ?? "由 Bank Service 選擇並回填受控 SWIFT BIC。";
    }
    return props;
  }

  private fieldOptions(
    field: UiField,
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
  ) {
    if (field.optionsSource === "reference/currencies")
      return currencies.map(({ code, decimals }) => ({
        label: `${code} · ${decimals} decimals`,
        value: code,
      }));
    if (field.optionsSource === "rma-authorisations/message-types")
      return messageTypePolicy.supportedMessageTypes.map((value) => ({
        label: value,
        value,
      }));
    return (field.options ?? []).map((value) => ({ label: value, value }));
  }

  private readonly validMessageTypes = (control: AbstractControl): boolean =>
    scalarText(control.value)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .every((value) =>
        /^(MT\d{3}(?:COV)?|pacs\.[A-Za-z0-9.]+|\*)$/.test(value),
      );

  toFormValue(value: unknown, field: UiField): unknown {
    return field.type === "multicheckbox" && Array.isArray(value)
      ? value.join(", ")
      : value;
  }

  toApiPayload(resource: UiResource, model: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const field of resource.fields) {
      const raw = this.getPath(model, field.key);
      const value = this.apiFieldValue(raw, field);
      this.setPath(payload, field.key, value);
    }
    return payload;
  }

  private apiFieldValue(raw: unknown, field: UiField): unknown {
    if (field.type === "multicheckbox") {
      return scalarText(raw)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (field.inputType === "number") return Number(raw);
    return raw;
  }

  getPath(source: Record<string, unknown>, path: string): unknown {
    return path
      .split(".")
      .reduce<unknown>(
        (value, key) =>
          value && typeof value === "object"
            ? (value as Record<string, unknown>)[key]
            : undefined,
        source,
      );
  }

  setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split(".");
    let cursor = target;
    for (const key of keys.slice(0, -1)) {
      const child = cursor[key];
      if (!child || typeof child !== "object" || Array.isArray(child))
        cursor[key] = {};
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[keys.at(-1)!] = value;
  }
}
