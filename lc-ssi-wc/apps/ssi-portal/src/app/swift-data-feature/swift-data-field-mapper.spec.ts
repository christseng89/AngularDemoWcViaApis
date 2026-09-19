import { SwiftDataFieldMapper } from "./swift-data-field-mapper";
import type { RmaMessageTypePolicy, UiResource } from "./swift-data.models";

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
  });
});
