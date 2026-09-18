import {
  BIC_PATTERN,
  BUSINESS_FUNCTION_DEFINITIONS,
  COUNTERPARTY_ID_PATTERN,
  FULL_TAG_SCENARIOS,
  MT_MESSAGE_NAMES,
  TAG_CATALOG_COLUMNS,
  TAG_FIELD_EXPECTATIONS,
} from "./fin-5x-catalog";

const checksum = (value: unknown): string => {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

describe("FIN 5x catalogue", () => {
  it("preserves the existing index column order", () => {
    expect(TAG_CATALOG_COLUMNS.map(({ key }) => key)).toEqual([
      "messageType",
      "description",
      "applicableTags",
      "verified",
    ]);
  });

  it("keeps scenario identities unique and separates executable mappings", () => {
    const ids = FULL_TAG_SCENARIOS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      FULL_TAG_SCENARIOS.some(
        ({ descriptor, executable }) =>
          descriptor.messageType === "MT400" && executable,
      ),
    ).toBe(true);
    expect(FULL_TAG_SCENARIOS.every(({ executable }) => executable)).toBe(true);
  });

  it("locks catalogue order, complete exported content, and construction defaults", () => {
    expect(
      FULL_TAG_SCENARIOS.slice(0, 10).map(
        ({ descriptor }) => descriptor.messageType,
      ),
    ).toEqual([
      "MT700",
      "MT701",
      "MT705",
      "MT707",
      "MT708",
      "MT730",
      "MT732",
      "MT734",
      "MT740",
      "MT742",
    ]);

    expect(
      FULL_TAG_SCENARIOS.find(
        ({ descriptor }) => descriptor.messageType === "MT300",
      )?.descriptor,
    ).toMatchObject({
      businessFunction: "FX_CONFIRMATION",
      sequence: "B1",
      settlementLeg: "Amount Bought",
    });
    expect(
      FULL_TAG_SCENARIOS.find(
        ({ descriptor }) => descriptor.messageType === "MT701",
      )?.descriptor.businessFunction,
    ).toBe("REFERENCE_ONLY");

    expect({
      columns: checksum(TAG_CATALOG_COLUMNS),
      messageNames: checksum(MT_MESSAGE_NAMES),
      expectations: checksum(TAG_FIELD_EXPECTATIONS),
      businessFunctions: checksum(BUSINESS_FUNCTION_DEFINITIONS),
      scenarios: checksum(FULL_TAG_SCENARIOS),
    }).toEqual({
      columns: "10a33d72",
      messageNames: "dc06f415",
      expectations: "860f15d4",
      businessFunctions: "2311569d",
      scenarios: "42a0ad9e",
    });
  });

  it("retains governed field expectations and identity validation patterns", () => {
    expect(TAG_FIELD_EXPECTATIONS["MT400"]?.map(({ tag }) => tag)).toEqual([
      "53A",
      "54A",
      "57A",
      "58A",
    ]);
    expect(new RegExp(BIC_PATTERN).test("CITIUS33")).toBe(true);
    expect(new RegExp(BIC_PATTERN).test("NOT-A-BIC")).toBe(false);
    expect(new RegExp(COUNTERPARTY_ID_PATTERN).test("CUST-00001")).toBe(true);
  });

  it("retains the business-function catalogue used by the selector", () => {
    expect(BUSINESS_FUNCTION_DEFINITIONS.length).toBeGreaterThan(10);
    expect(
      BUSINESS_FUNCTION_DEFINITIONS.some(
        ({ code, consumer }) =>
          consumer === "CENTRAL_PAYMENT" && code === "INTERBANK_TRANSFER",
      ),
    ).toBe(true);
  });
});
