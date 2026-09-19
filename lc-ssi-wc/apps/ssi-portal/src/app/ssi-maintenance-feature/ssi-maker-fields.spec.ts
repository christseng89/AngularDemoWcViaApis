import { buildSsiMakerFields } from "./ssi-maker-fields";

describe("SSI Maker Formly field extraction", () => {
  it("keeps the existing field order, governed copy, currency options and picker callbacks", () => {
    const openPicker = jest.fn();
    const fields = buildSsiMakerFields(
      [{ code: "SGD", decimals: 2 }],
      openPicker,
    );
    expect(fields.map((field) => field.key)).toEqual([
      "maker",
      "ownershipType",
      "ownerParty",
      "publisherParty",
      "route.counterpartyType",
      "counterpartyId",
      "scope",
      "route.currency",
      "route.beneficiarySource",
      "route.beneficiaryBic",
      "route.accountWithBic",
      "route.intermediaryBic",
      "route.accountId",
    ]);
    expect(
      fields.find((field) => field.key === "route.currency")?.props?.options,
    ).toEqual([{ label: "SGD · 2 decimals", value: "SGD" }]);
    const accountWith = fields.find(
      (field) => field.key === "route.accountWithBic",
    );
    (accountWith?.props?.pickerAction as () => void)();
    expect(openPicker).toHaveBeenCalledWith(
      "accountWithBic",
      "選擇 Account With Institution",
    );
    const accountId = fields.find((field) => field.key === "route.accountId");
    expect(accountId?.expressions?.["props.label"]).toEqual(
      expect.any(Function),
    );
  });
});
