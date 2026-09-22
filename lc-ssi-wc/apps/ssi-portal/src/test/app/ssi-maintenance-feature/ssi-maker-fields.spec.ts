import { buildSsiMakerFields } from "../../../app/ssi-maintenance-feature/ssi-maker-fields";
import type { FormlyFieldConfig } from "@ngx-formly/core";

const fieldByKey = (
  fields: FormlyFieldConfig[],
  key: string,
): FormlyFieldConfig => {
  const field = fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Missing field: ${key}`);
  return field;
};

const resolvedProp = (
  field: FormlyFieldConfig,
  name: string,
  model: Record<string, unknown>,
): unknown => {
  const expression = field.expressions?.[`props.${name}`];
  if (typeof expression === "function") {
    return expression({ model } as FormlyFieldConfig);
  }
  return field.props?.[name];
};

const matchesPattern = (pattern: unknown, value: string): boolean =>
  (pattern instanceof RegExp ? pattern : new RegExp(String(pattern))).test(
    value,
  );

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

  it.each([
    [
      "CUSTOMER",
      "CUSTOMER-001",
      3,
      35,
      "請輸入 3–35 字元的 Customer ID，或從 Customer Service 選擇",
      true,
      false,
      "從 Customer Service 選擇",
    ],
    [
      "ANY_BANK",
      "ANY",
      3,
      3,
      "通用 fallback 固定使用 ANY；實際受款銀行由交易資料提供",
      false,
      true,
      "從 Bank Service 選擇",
    ],
    [
      "BANK",
      "CP-CITIUS33",
      3,
      35,
      "請輸入 3–35 字元的內部 Counterparty ID，或從 Bank Service 選擇",
      true,
      false,
      "從 Bank Service 選擇",
    ],
    [
      undefined,
      "CP-CITIUS33",
      3,
      35,
      "請輸入 3–35 字元的內部 Counterparty ID，或從 Bank Service 選擇",
      true,
      false,
      "從 Bank Service 選擇",
    ],
  ] as const)(
    "preserves counterparty behavior for %s",
    (
      counterpartyType,
      validId,
      minLength,
      maxLength,
      validationMessage,
      showPicker,
      readonly,
      pickerLabel,
    ) => {
      const field = fieldByKey(
        buildSsiMakerFields([], jest.fn()),
        "counterpartyId",
      );
      const model = { route: { counterpartyType } };
      const pattern = resolvedProp(field, "pattern", model);

      expect(matchesPattern(pattern, validId)).toBe(true);
      expect(resolvedProp(field, "minLength", model)).toBe(minLength);
      expect(resolvedProp(field, "maxLength", model)).toBe(maxLength);
      expect(resolvedProp(field, "validationMessage", model)).toBe(
        validationMessage,
      );
      expect(resolvedProp(field, "showPicker", model)).toBe(showPicker);
      expect(resolvedProp(field, "readonly", model)).toBe(readonly);
      expect(resolvedProp(field, "pickerLabel", model)).toBe(pickerLabel);
    },
  );

  it.each([
    ["TRANSACTION", false, true, "不儲存在 SSI；由交易資料提供。"],
    [
      "SSI",
      true,
      false,
      "可手動輸入 BIC8/BIC11，或從 Bank Service 選擇銀行身分並回填唯讀 BIC。",
    ],
  ] as const)(
    "preserves beneficiary behavior for %s source",
    (beneficiarySource, required, disabled, description) => {
      const field = fieldByKey(
        buildSsiMakerFields([], jest.fn()),
        "route.beneficiaryBic",
      );
      const model = { route: { beneficiarySource } };

      expect(resolvedProp(field, "required", model)).toBe(required);
      expect(resolvedProp(field, "disabled", model)).toBe(disabled);
      expect(resolvedProp(field, "description", model)).toBe(description);
    },
  );

  it("keeps account-reference copy and all picker targets wired", () => {
    const openPicker = jest.fn();
    const fields = buildSsiMakerFields([], openPicker);
    const accountId = fieldByKey(fields, "route.accountId");
    const ownBank = {
      ownershipType: "OWN",
      route: { counterpartyType: "BANK" },
    };

    expect(resolvedProp(accountId, "label", ownBank)).toContain("Own");
    expect(resolvedProp(accountId, "description", ownBank)).toEqual(
      expect.any(String),
    );
    expect(resolvedProp(accountId, "placeholder", ownBank)).toEqual(
      expect.any(String),
    );

    for (const [key, target] of [
      ["counterpartyId", "counterpartyId"],
      ["route.beneficiaryBic", "beneficiaryBic"],
      ["route.accountWithBic", "accountWithBic"],
      ["route.intermediaryBic", "intermediaryBic"],
    ] as const) {
      const pickerAction = fieldByKey(fields, key).props?.pickerAction;
      if (typeof pickerAction !== "function") {
        throw new Error(`Missing picker action: ${key}`);
      }
      pickerAction();
      expect(openPicker).toHaveBeenLastCalledWith(target, expect.any(String));
    }
  });
});
