import { Mt347DemoImportValidationProfile } from "./mt347-demo-import-validation.profile";

const candidate = (usageScope: "QA_POSITIVE" | "QA_NEGATIVE") => ({
  counterpartyId: "MT347-CHASUS33",
  fixtureFamily: "MT347-SR2026-SSI",
  fixtureVariantVersion: "MT347-DEMO-ORACLE-V1.1",
  maker: "maker.mt347",
  operationalVisible: false,
  paymentExecutable: false,
  scope: "STANDING",
  usageScope,
  route: {
    bookingEntity: "HK01",
    counterpartyBic: "CHASUS33",
    currency: "USD",
    importValidationProfile: "MT347_DEMO_FIN_REFERENCE_ONLY_V1",
    oracleBusinessStatus: "BA_CONFIRMED",
    oracleContextKey: "MT300-003::USD::CHASUS33::HK01::OUTBOUND",
    oracleReasonCode: "PROFILE_INCOMPLETE",
    paymentExecutable: "false",
    profileKind: "FIN_REFERENCE_ONLY",
    settlementModel: "FIN_REFERENCE_ONLY",
  },
});

describe("Mt347DemoImportValidationProfile", () => {
  const previous = process.env["SSI_RUNTIME_ENV"];

  beforeEach(() => {
    process.env["SSI_RUNTIME_ENV"] = "demo";
  });

  afterAll(() => {
    if (previous === undefined) delete process.env["SSI_RUNTIME_ENV"];
    else process.env["SSI_RUNTIME_ENV"] = previous;
  });

  it("accepts an exact controlled positive without payment semantics", () => {
    expect(
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(
        candidate("QA_POSITIVE"),
      ),
    ).toBe(true);
  });

  it("returns the exact Oracle reason for a controlled negative", () => {
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(
        candidate("QA_NEGATIVE"),
      ),
    ).toThrow("PROFILE_INCOMPLETE");
  });

  it("is not applicable outside demo/development", () => {
    process.env["SSI_RUNTIME_ENV"] = "production";
    expect(
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(
        candidate("QA_POSITIVE"),
      ),
    ).toBe(false);
  });

  it.each(["clearingSystem", "settlementMarket", "routeType"])(
    "fails closed when prohibited payment field %s is present",
    (field) => {
      const record = candidate("QA_POSITIVE");
      record.route[field as keyof typeof record.route] = "FORBIDDEN";
      expect(() =>
        new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
      ).toThrow("MT347_DEMO_PAYMENT_SEMANTICS_PROHIBITED");
    },
  );
});
