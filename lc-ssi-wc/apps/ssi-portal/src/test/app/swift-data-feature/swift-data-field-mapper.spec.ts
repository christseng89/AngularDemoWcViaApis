import { SwiftDataFieldMapper } from "../../../app/swift-data-feature/swift-data-field-mapper";
import type { RmaMessageTypePolicy, UiResource } from "../../../app/swift-data-feature/swift-data.models";

const resource: UiResource = {
  id: "rma",
  label: "RMA",
  endpoint: "/rma-authorisations",
  description: "",
  columns: [],
  "x-lifecycle": [],
  fields: [
    { key: "bank.bic", label: "BIC", type: "input", referenceSource: "reference/banks" },
    { key: "currency", label: "Currency", type: "select", optionsSource: "reference/currencies" },
    { key: "messageTypes", label: "Message Types", type: "multicheckbox", optionsSource: "rma-authorisations/message-types" },
    { key: "threshold", label: "Threshold", type: "input", inputType: "number" },
  ],
};

const policy = {
  supportedMessageTypes: ["MT300", "MT304"],
  categories: [],
  items: [],
} as unknown as RmaMessageTypePolicy;

describe("SwiftDataFieldMapper", () => {
  it("uses governed options and narrow callbacks for bank and directional message selection", () => {
    const mapper = new SwiftDataFieldMapper();
    const openBankPicker = jest.fn();
    const selectMessageTypes = jest.fn().mockReturnValue(["MT304"]);
    const fields = mapper.fields(resource, [{ code: "USD", decimals: 2 }], policy, {
      editingId: () => "revision-1",
      selectMessageTypes,
      openBankPicker,
    });

    expect(fields[1].props?.options).toEqual([{ label: "USD · 2 decimals", value: "USD" }]);
    expect(fields[2].props?.options).toEqual([
      { label: "MT300", value: "MT300" },
      { label: "MT304", value: "MT304" },
    ]);
    (fields[0].props?.["pickerAction"] as () => void)();
    expect(openBankPicker).toHaveBeenCalledWith(resource.fields[0]);
    expect((fields[2].props?.["messageTypeOperation"] as () => string)()).toBe("EDIT");
    const validMessageTypes = fields[2].validators?.["messageTypes"]
      ?.expression as (control: { value: string }) => boolean;
    expect(validMessageTypes({ value: "MT300, pacs.009.001.08, *" })).toBe(true);
    expect(validMessageTypes({ value: "MT30" })).toBe(false);
    const model = { direction: "OUTBOUND" };
    expect((fields[2].props?.["messageTypeSelectionForDirection"] as (model: object, direction: string) => unknown)(model, "INBOUND")).toEqual(["MT304"]);
    expect(selectMessageTypes).toHaveBeenCalledWith(model, "INBOUND");
  });

  it("preserves nested payload conversion and view-side message-type formatting", () => {
    const mapper = new SwiftDataFieldMapper();
    expect(mapper.toApiPayload(resource, {
      bank: { bic: "BANKUS33" },
      currency: "USD",
      messageTypes: "MT300, MT304",
      threshold: "12",
    })).toEqual({
      bank: { bic: "BANKUS33" },
      currency: "USD",
      messageTypes: ["MT300", "MT304"],
      threshold: 12,
    });
    expect(mapper.toFormValue(["MT300", "MT304"], resource.fields[2])).toBe("MT300, MT304");
    expect(mapper.toFormValue("USD", resource.fields[1])).toBe("USD");
  });

  it("applies conditional field state, static options, defaults, and add mode", () => {
    const mapper = new SwiftDataFieldMapper();
    const conditionalResource: UiResource = {
      ...resource,
      fields: [
        {
          key: "conditional.required",
          label: "Required field",
          type: "select",
          options: ["A"],
          defaultValue: "A",
          "x-required-when": { path: "mode", equals: "CREATE" },
        },
        {
          key: "conditional.disabled",
          label: "Disabled field",
          type: "input",
          "x-disabled-when": { path: "mode", equals: "VIEW" },
        },
        resource.fields[2],
      ],
    };
    const fields = mapper.fields(conditionalResource, [], policy, {
      editingId: () => null,
      selectMessageTypes: jest.fn(),
      openBankPicker: jest.fn(),
    });
    const required = fields[0].expressions?.["props.required"] as (
      field: { model?: unknown },
    ) => boolean;
    const disabled = fields[1].expressions?.["props.disabled"] as (
      field: { model?: unknown },
    ) => boolean;

    expect(fields[0].defaultValue).toBe("A");
    expect(fields[0].props?.options).toEqual([{ label: "A", value: "A" }]);
    expect(required({ model: { mode: "CREATE" } })).toBe(true);
    expect(required({ model: { mode: "EDIT" } })).toBe(false);
    expect(required({})).toBe(false);
    expect(disabled({ model: { mode: "VIEW" } })).toBe(true);
    expect(disabled({ model: { mode: "EDIT" } })).toBe(false);
    expect(disabled({})).toBe(false);
    expect((fields[2].props?.["messageTypeOperation"] as () => string)()).toBe(
      "ADD",
    );
    expect(mapper.getPath({ container: null }, "container.value")).toBeUndefined();
    expect(mapper.getPath({}, "missing.value")).toBeUndefined();
    expect(mapper.getPath({ container: 0 }, "container.value")).toBeUndefined();
    const existingObject = { bank: {} as Record<string, unknown> };
    mapper.setPath(existingObject, "bank.bic", "BANKUS33");
    expect(existingObject.bank).toEqual({ bic: "BANKUS33" });
    const existingArray: Record<string, unknown> = { bank: [] };
    mapper.setPath(existingArray, "bank.bic", "BANKUS33");
    expect(existingArray).toEqual({ bank: { bic: "BANKUS33" } });
    const existingPrimitive: Record<string, unknown> = { bank: "invalid" };
    mapper.setPath(existingPrimitive, "bank.bic", "BANKUS33");
    expect(existingPrimitive).toEqual({ bank: { bic: "BANKUS33" } });
  });
});
