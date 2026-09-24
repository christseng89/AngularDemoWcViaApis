import {
  selectedLookupBinding,
  userInputFields,
  userInputValues,
} from "../../../app/resolution-workbench/parameter-form-values";

const userField = { fieldId: "context.currency" };
const model = {
  fieldSections: [
    { id: "TRANSACTION", label: "Transaction", fields: [userField] },
  ],
};

describe("parameter form value allow-list", () => {
  it("builds controls only for API-authorized user-input fields", () => {
    expect(userInputFields(model as never)).toEqual([userField]);
  });

  it("does not submit hidden SSI-derived or scenario-fixed values", () => {
    expect(
      userInputValues(model as never, {
        "context.currency": "USD",
        "B1.53.bankServiceId": "BANK-SVC-DERIVED",
        "context.route": "DIRECT",
      }),
    ).toEqual({ "context.currency": "USD" });
  });

  it("omits an authorized field when the user supplied no value", () => {
    expect(userInputValues(model as never, {})).toEqual({});
  });

  it("retains the selected route and eligibility snapshot as one atomic binding", () => {
    const selectedRouteIdentity = {
      routeId: "ROUTE-1",
      definitionId: "PAGE-MT202",
      definitionVersion: "v1",
      fixtureBindingId: "FIX-MT202@v1",
      contextSha256: "a".repeat(64),
      ssi: { id: "SSI-1", version: 2 },
      applicability: { id: "APP-1", version: 3 },
      nostro: { id: "NOSTRO-1", version: 4 },
      rma: { id: "RMA-1", version: 5 },
    };
    const eligibilitySnapshot = {
      snapshotId: "SNAPSHOT-1",
      contextSha256: "b".repeat(64),
    };

    expect(
      selectedLookupBinding(
        { selectedRouteIdentity } as never,
        { eligibilitySnapshot } as never,
      ),
    ).toEqual({ selectedRouteIdentity, eligibilitySnapshot });
  });

  it("requires both route identity and a valid candidate-specific route hash", () => {
    expect(() => selectedLookupBinding({} as never, {} as never)).toThrow(
      "PAGE_PARAMETER_ROUTE_BINDING_REQUIRED",
    );
    expect(() =>
      selectedLookupBinding(
        {
          selectedRouteIdentity: { contextSha256: "not-a-sha" },
        } as never,
        {
          eligibilitySnapshot: { contextSha256: "b".repeat(64) },
        } as never,
      ),
    ).toThrow("PAGE_PARAMETER_ROUTE_CONTEXT_INVALID");
  });
});
