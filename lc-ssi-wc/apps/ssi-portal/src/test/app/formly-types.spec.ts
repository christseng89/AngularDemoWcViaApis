type TestSignal<T> = (() => T) & { set(value: T): void };

function testSignal<T>(initial: T): TestSignal<T> {
  let current = initial;
  const read = (() => current) as TestSignal<T>;
  read.set = (value) => {
    current = value;
  };
  return read;
}

jest.mock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component: () => (target: unknown) => target,
  signal: testSignal,
}));
jest.mock("@angular/forms", () => ({ ReactiveFormsModule: class {} }));
jest.mock("@ngx-formly/core", () => ({
  FieldType: class {
    props: Record<string, unknown> = {};
    field: { props?: Record<string, unknown>; model?: unknown } = {};
  },
  FormlyAttributes: class {},
}));

import { BicInputType, MessageTypeTagsType, NativeSelectType } from "../../app/formly-types";

function configureTags({
  direction = "OUTBOUND",
  disabled = false,
  operation,
  value = "MT103",
}: {
  direction?: "INBOUND" | "OUTBOUND";
  disabled?: boolean;
  operation?: "ADD" | "EDIT" | "INQUIRE" | (() => "ADD" | "EDIT" | "INQUIRE");
  value?: string | null;
} = {}) {
  let controlValue = value;
  const control = {
    get value() {
      return controlValue;
    },
    setValue: jest.fn((next: string) => {
      controlValue = next;
    }),
    markAsDirty: jest.fn(),
    markAsTouched: jest.fn(),
  };
  const tags = new MessageTypeTagsType();
  Object.defineProperty(tags, "formControl", { value: control });
  Object.defineProperty(tags, "field", {
    value: { model: { direction } },
  });
  Object.defineProperty(tags, "props", {
    value: {
      disabled,
      messageTypeOperation: operation,
      options: [
        { label: 103, value: "MT103" },
        { label: "MT202", value: "MT202" },
        { label: "MT300", value: "MT300" },
        { label: "MT400", value: "MT400" },
        { label: "MT700", value: "MT700" },
        { label: "pacs.008", value: "pacs.008.001.08" },
      ],
      messageTypeCategories: [
        { categoryId: "PAYMENT", displayName: "Payment", displayOrder: 20, emptyStateText: "None" },
        { categoryId: "SECURITY", displayName: "Security", displayOrder: 10, emptyStateText: "None" },
      ],
      messageTypeItems: [
        {
          messageType: "MT300",
          description: "Foreign exchange",
          categoryId: "SECURITY",
          directionApplicability: {
            inbound: { applicable: true },
            outbound: { applicable: false },
          },
        },
        {
          messageType: "pacs.008.001.08",
          description: "Customer credit transfer",
          categoryId: "PAYMENT",
          directionApplicability: {
            inbound: { applicable: false },
            outbound: { applicable: true },
          },
        },
      ],
      messageTypeSelectionForDirection: (
        _model: Record<string, unknown>,
        selectedDirection: "INBOUND" | "OUTBOUND",
      ) => selectedDirection === "INBOUND" ? ["MT300"] : ["pacs.008.001.08"],
    },
  });
  return { tags, control, value: () => controlValue };
}

describe("Formly field behaviors", () => {
  it("normalises select and BIC presentation defaults", () => {
    const select = new NativeSelectType();
    Object.defineProperty(select, "props", { value: { options: null } });
    expect(select.selectOptions).toEqual([]);
    Object.defineProperty(select, "props", {
      value: { options: [{ label: "USD", value: "USD" }] },
    });
    expect(select.selectOptions).toEqual([{ label: "USD", value: "USD" }]);

    const bic = new BicInputType();
    expect(bic.pickerLabel).toBe("從 Bank Service 選擇");
    expect(bic.showPicker).toBe(true);
    expect(bic.validationMessage).toContain("ISO 9362");
    expect(() => bic.openPicker()).not.toThrow();
    const pickerAction = jest.fn();
    Object.defineProperty(bic, "field", {
      value: {
        props: {
          pickerLabel: "Choose",
          showPicker: false,
          validationMessage: "Invalid",
          pickerAction,
        },
      },
    });
    expect(bic.pickerLabel).toBe("Choose");
    expect(bic.showPicker).toBe(false);
    expect(bic.validationMessage).toBe("Invalid");
    bic.openPicker();
    expect(pickerAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ disabled: true }, "INQUIRE", "View", "⌕", "Inquire RMA Message Types"],
    [{ operation: "EDIT" as const }, "EDIT", "Edit", "✎", "Edit RMA Message Types"],
    [{ operation: "INQUIRE" as const }, "INQUIRE", "View", "⌕", "Inquire RMA Message Types"],
    [{ operation: (() => "ADD") as () => "ADD" }, "ADD", "Edit", "✎", "Add RMA Message Types"],
  ])("derives operation presentation from governed mode", (configuration, expected, button, icon, title) => {
    const { tags } = configureTags(configuration);
    expect(tags.operation).toBe(expected);
    expect(tags.operationButtonLabel).toBe(button);
    expect(tags.operationIcon).toBe(icon);
    expect(tags.operationTitle).toBe(title);
  });

  it("sorts governed categories and filters policy items", () => {
    const { tags } = configureTags();
    expect(tags.categories.map(({ categoryId }) => categoryId)).toEqual(["SECURITY", "PAYMENT"]);
    expect(tags.policyItems).toHaveLength(2);
    expect(tags.activeCategoryDefinition?.categoryId).toBe("SECURITY");
    expect(tags.categoryItems.map(({ messageType }) => messageType)).toEqual(["MT300"]);
    tags.query.set("foreign");
    expect(tags.categoryItems.map(({ messageType }) => messageType)).toEqual(["MT300"]);
    tags.query.set("missing");
    expect(tags.categoryItems).toEqual([]);
    tags.activeCategory.set("PAYMENT");
    tags.query.set("");
    expect(tags.categoryItems.map(({ messageType }) => messageType)).toEqual(["pacs.008.001.08"]);

    Object.defineProperty(tags, "props", { value: {} });
    expect(tags.categories).toEqual([]);
    expect(tags.policyItems).toEqual([]);
    expect(tags.activeCategoryDefinition).toBeUndefined();
    expect(tags.messageOptions).toEqual([]);
  });

  it("normalises options, search, selection, and FIN/ISO grouping", () => {
    const { tags, value, control } = configureTags({ value: " MT103, , pacs.008.001.08 " });
    expect(tags.currentDirection).toBe("OUTBOUND");
    expect(tags.messageOptions[0]).toEqual({ label: "103", value: "MT103" });
    expect(tags.selectedValues).toEqual(["MT103", "pacs.008.001.08"]);
    expect(tags.selectedOptions.map(({ value: item }) => item)).toEqual(["MT103", "pacs.008.001.08"]);
    expect(tags.finOptions).toHaveLength(5);
    expect(tags.isoOptions).toHaveLength(1);
    expect(tags.isSelected("MT103")).toBe(true);
    tags.query.set("202");
    expect(tags.visibleOptions.map(({ value: item }) => item)).toEqual(["MT202"]);
    tags.toggle("MT103");
    expect(value()).toBe("pacs.008.001.08");
    tags.toggle("MT202");
    expect(value()).toBe("pacs.008.001.08, MT202");
    expect(control.markAsDirty).toHaveBeenCalledTimes(2);
    expect(control.markAsTouched).toHaveBeenCalledTimes(2);
  });

  it("opens, cancels, resets, and finishes directional selection", () => {
    const outbound = configureTags({ direction: "OUTBOUND", value: "MT103" });
    outbound.tags.cancelPicker();
    expect(outbound.control.setValue).not.toHaveBeenCalled();
    outbound.tags.openPicker();
    expect(outbound.tags.pickerOpen()).toBe(true);
    expect(outbound.tags.activeCategory()).toBe("SECURITY");
    expect(outbound.tags.directionCount("INBOUND")).toBe(1);
    expect(outbound.tags.directionCount("OUTBOUND")).toBe(1);
    outbound.tags.toggleDirection("INBOUND", "MT300");
    expect(outbound.tags.isDirectionSelected("INBOUND", "MT300")).toBe(true);
    outbound.tags.toggleDirection("OUTBOUND", "MT103");
    expect(outbound.tags.isDirectionSelected("OUTBOUND", "MT103")).toBe(false);
    outbound.tags.toggleDirection("OUTBOUND", "pacs.008.001.08");
    expect(outbound.tags.isDirectionSelected("OUTBOUND", "pacs.008.001.08")).toBe(true);
    outbound.tags.toggleDirection("OUTBOUND", "pacs.008.001.08");
    expect(outbound.tags.isDirectionSelected("OUTBOUND", "pacs.008.001.08")).toBe(false);
    outbound.tags.resetPicker();
    expect(outbound.tags.isDirectionSelected("OUTBOUND", "MT103")).toBe(true);
    outbound.tags.cancelPicker();
    expect(outbound.value()).toBe("MT103");

    const inbound = configureTags({ direction: "INBOUND", value: "MT300" });
    inbound.tags.openPicker();
    inbound.tags.toggleDirection("INBOUND", "MT300");
    inbound.tags.finishPicker();
    expect(inbound.value()).toBe("");
    expect(inbound.tags.pickerOpen()).toBe(false);
    expect(inbound.control.markAsDirty).toHaveBeenCalled();
  });

  it("applies direction access and applicability rules", () => {
    const editable = configureTags({ direction: "INBOUND" }).tags;
    const [mt300] = editable.policyItems;
    expect(editable.directionApplicable("INBOUND", mt300!)).toBe(true);
    expect(editable.directionApplicable("OUTBOUND", mt300!)).toBe(false);
    expect(editable.directionEditable("INBOUND")).toBe(true);
    expect(editable.directionEditable("OUTBOUND")).toBe(false);
    expect(editable.directionAccessLabel("INBOUND")).toBe("INBOUND editable");
    expect(editable.directionAccessLabel("OUTBOUND")).toContain("Locked for INBOUND");

    const readonly = configureTags({ disabled: true }).tags;
    expect(readonly.directionEditable("OUTBOUND")).toBe(false);
    expect(readonly.directionAccessLabel("OUTBOUND")).toBe("Inquire only");
  });

  it.each([
    ["ALL", ["MT103", "MT202", "MT300", "MT400", "MT700", "pacs.008.001.08"]],
    ["MT1", ["MT103"]],
    ["MT2", ["MT202"]],
    ["MT3", ["MT300"]],
    ["MT4", ["MT400"]],
    ["MT7", ["MT700"]],
    ["CBPR", ["pacs.008.001.08"]],
  ] as const)("selects the %s governed message group", (group, expected) => {
    const { tags, value } = configureTags({ value: null });
    tags.selectGroup(group);
    expect(value()?.split(", ")).toEqual(expected);
    tags.clear();
    expect(value()).toBe("");
  });
});
