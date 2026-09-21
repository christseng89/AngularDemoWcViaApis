import {
  activeBankServices,
  loadBankServiceCatalogue,
  validateBankServiceCatalogue,
  type BankServiceCatalogueDocument,
} from "../../lib/bank-service-catalogue";

describe("Bank Service catalogue", () => {
  it("loads unique valid identities and filters disabled entries", () => {
    const records = loadBankServiceCatalogue();
    const active = activeBankServices(
      records,
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(records).toHaveLength(29);
    expect(active).toHaveLength(28);
    expect(new Set(active.map(({ bankServiceId }) => bankServiceId)).size).toBe(
      28,
    );
    expect(
      active.every(({ bic }) =>
        /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic),
      ),
    ).toBe(true);
    expect(active.some(({ bic }) => bic === "DMOZUSN1")).toBe(false);
    expect(active).toContainEqual(
      expect.objectContaining({
        bic: "QATIGB2L",
        usageGroup: "SSI_REFERENCED",
      }),
    );
  });

  it.each([
    ["invalid BIC", { bic: "INVALID" }, "INVALID_BANK_SERVICE_RECORD"],
    ["ambiguous identity", {}, "AMBIGUOUS_BANK_SERVICE_IDENTITY"],
  ])("rejects %s", (_name, override, expected) => {
    const item = {
      bankServiceId: "BANK-SVC-CITI-PRIMARY",
      bic: "CITIUS33",
      name: "Demo",
      country: "US",
      city: "New York",
      addressRef: "ADDR",
      dataClass: "SYNTHETIC_DEMO",
      usageGroup: "SSI_REFERENCED",
    };
    const document = {
      schemaVersion: 1,
      defaults: {
        standard: "ISO 9362",
        source: "SYNTHETIC_DEMO",
        status: "ACTIVE",
        validFrom: "2026-01-01",
        validTo: "2099-12-31",
      },
      items: [
        { ...item, ...override },
        ...(expected.startsWith("AMBIGUOUS") ? [item] : []),
      ],
    } as unknown as BankServiceCatalogueDocument;
    expect(() => validateBankServiceCatalogue(document)).toThrow(expected);
  });

  it("rejects an unsupported catalogue schema", () => {
    expect(() =>
      validateBankServiceCatalogue({
        schemaVersion: 2,
        defaults: {},
        items: [],
      }),
    ).toThrow("INVALID_BANK_SERVICE_CATALOGUE");
  });

  it("requires an explicit stable Bank Service ID", () => {
    expect(() => validateBankServiceCatalogue({
      schemaVersion: 1,
      defaults: {
        standard: "ISO 9362",
        source: "SYNTHETIC_DEMO",
        status: "ACTIVE",
        validFrom: "2026-01-01",
        validTo: "2099-12-31",
        dataClass: "SYNTHETIC_DEMO",
        usageGroup: "SSI_REFERENCED",
      },
      items: [
        {
          bic: "CITIUS33",
          name: "Citibank N.A.",
          country: "US",
          city: "New York",
          addressRef: "ADDR-CITIUS33",
        },
      ],
    })).toThrow("INVALID_BANK_SERVICE_RECORD");
  });

  it("does not bind the stable ID to the current BIC", () => {
    const [record] = validateBankServiceCatalogue({
      schemaVersion: 1,
      defaults: {
        standard: "ISO 9362",
        source: "SYNTHETIC_DEMO",
        status: "ACTIVE",
        validFrom: "2026-01-01",
        validTo: "2099-12-31",
        dataClass: "SYNTHETIC_DEMO",
        usageGroup: "SSI_REFERENCED",
      },
      items: [{
        bankServiceId: "BANK-SVC-CITI-PRIMARY",
        bic: "CITIUS3X",
        name: "Citibank N.A.",
        country: "US",
        city: "New York",
        addressRef: "ADDR-CITI",
      }],
    });

    expect(record).toMatchObject({
      bankServiceId: "BANK-SVC-CITI-PRIMARY",
      bic: "CITIUS3X",
    });
  });

  it.each(["", "CITIUS33", "BANK SVC CITI", "BANK-SVC-*"])(
    "rejects invalid explicit Bank Service ID %p",
    (bankServiceId) => {
      expect(() => validateBankServiceCatalogue({
        schemaVersion: 1,
        defaults: {
          standard: "ISO 9362",
          source: "SYNTHETIC_DEMO",
          status: "ACTIVE",
          validFrom: "2026-01-01",
          validTo: "2099-12-31",
          dataClass: "SYNTHETIC_DEMO",
          usageGroup: "SSI_REFERENCED",
        },
        items: [{
          bankServiceId,
          bic: "CITIUS33",
          name: "Citibank N.A.",
          country: "US",
          city: "New York",
          addressRef: "ADDR-CITI",
        }],
      })).toThrow("INVALID_BANK_SERVICE_RECORD");
    },
  );
});
