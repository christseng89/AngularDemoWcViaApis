import { Mt347DemoImportValidationProfile } from "../../../app/imports/mt347-demo-import-validation.profile";

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

  it("requires a non-empty Oracle reason for a controlled negative", () => {
    const record = candidate("QA_NEGATIVE");
    record.route.oracleReasonCode = "";
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_REASON_CODE_REQUIRED");
  });

  it("requires the Oracle reason property for a controlled negative", () => {
    const record = candidate("QA_NEGATIVE");
    delete (record.route as Partial<typeof record.route>).oracleReasonCode;
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_REASON_CODE_REQUIRED");
  });

  it("rejects a non-string Oracle reason without object stringification", () => {
    const record = candidate("QA_NEGATIVE");
    (record.route as Record<string, unknown>)["oracleReasonCode"] = {};
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_REASON_CODE_REQUIRED");
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

  it.each([
    ["fixtureVariantVersion", "OTHER"],
    ["operationalVisible", true],
    ["paymentExecutable", true],
    ["usageScope", "OTHER"],
  ])("fails closed when envelope field %s is invalid", (field, value) => {
    const record = candidate("QA_POSITIVE") as Record<string, unknown>;
    record[field] = value;
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_PROFILE_CONTRACT_MISMATCH");
  });

  it.each([
    ["profileKind", "OTHER"],
    ["settlementModel", "OTHER"],
    ["paymentExecutable", "true"],
    ["oracleBusinessStatus", "OTHER"],
    ["oracleContextKey", ""],
  ])("fails closed when route envelope field %s is invalid", (field, value) => {
    const record = candidate("QA_POSITIVE");
    (record.route as Record<string, unknown>)[field] = value;
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_PROFILE_CONTRACT_MISMATCH");
  });

  it("requires the Oracle context-key property", () => {
    const record = candidate("QA_POSITIVE");
    delete (record.route as Partial<typeof record.route>).oracleContextKey;
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_PROFILE_CONTRACT_MISMATCH");
  });

  it("rejects a non-string Oracle context key", () => {
    const record = candidate("QA_POSITIVE");
    (record.route as Record<string, unknown>)["oracleContextKey"] = {};
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_PROFILE_CONTRACT_MISMATCH");
  });

  it.each([
    ["currency", "US"],
    ["counterpartyBic", "INVALID"],
    ["bookingEntity", ""],
  ])("fails closed when reference identity field %s is invalid", (field, value) => {
    const record = candidate("QA_POSITIVE");
    (record.route as Record<string, unknown>)[field] = value;
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_REFERENCE_IDENTITY_REQUIRED");
  });

  it("requires the currency property", () => {
    const record = candidate("QA_POSITIVE");
    delete (record.route as Partial<typeof record.route>).currency;
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_REFERENCE_IDENTITY_REQUIRED");
  });

  it("rejects a non-string booking entity", () => {
    const record = candidate("QA_POSITIVE");
    (record.route as Record<string, unknown>)["bookingEntity"] = {};
    expect(() =>
      new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
    ).toThrow("MT347_DEMO_REFERENCE_IDENTITY_REQUIRED");
  });

  it.each([null, [], "not-an-object"])(
    "ignores non-object payload %p",
    (record) => {
      expect(
        new Mt347DemoImportValidationProfile().validateDryRunIfApplicable(record),
      ).toBe(false);
    },
  );
});
