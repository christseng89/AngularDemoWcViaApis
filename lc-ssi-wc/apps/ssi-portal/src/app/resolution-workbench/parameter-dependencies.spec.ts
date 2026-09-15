import {
  dependentInvalidatedFieldIds,
  invalidatedFieldIds,
} from "./parameter-dependencies";

describe("parameter dependency invalidation", () => {
  it("combines API option and lookup invalidation metadata without duplicates", () => {
    expect(
      invalidatedFieldIds({
        optionSource: {
          source: "GOVERNED_APPLICABILITY",
          dependsOnFieldIds: [],
          invalidatesFieldIds: ["counterparty", "delivery"],
          selectionPolicy: "SELECTABLE",
        },
        lookup: {
          provider: "SSI_COUNTERPARTY",
          action: "SSI_COUNTERPARTY",
          endpoint:
            "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
          valueField: "bankServiceId",
          displayField: "bic",
          validationField: "bic",
          dependency: {
            dependsOnFieldIds: ["currency"],
            invalidatesFieldIds: ["delivery"],
            selectionPolicy: "SELECTABLE",
          },
        },
      }),
    ).toEqual(["counterparty", "delivery"]);
  });

  it("invalidates lookup fields and their downstream fields when a dependency changes", () => {
    expect(
      dependentInvalidatedFieldIds(
        [
          { fieldId: "context.currency" },
          { fieldId: "context.valueDate" },
          {
            fieldId: "context.counterpartyBankServiceId",
            lookup: {
              provider: "SSI_COUNTERPARTY",
              action: "SSI_COUNTERPARTY",
              endpoint:
                "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
              valueField: "bankServiceId",
              displayField: "bic",
              validationField: "bic",
              dependency: {
                dependsOnFieldIds: ["context.currency", "context.valueDate"],
                invalidatesFieldIds: ["context.deliveryBankServiceId"],
                selectionPolicy: "SELECTABLE",
              },
            },
          },
          {
            fieldId: "context.deliveryBankServiceId",
            lookup: {
              provider: "BANK_SERVICE",
              action: "BANK_SERVICE",
              endpoint:
                "/api/v1/resolution-page-definitions/lookups/bank-services",
              valueField: "bankServiceId",
              displayField: "bic",
              validationField: "bic",
              dependency: {
                dependsOnFieldIds: ["context.counterpartyBankServiceId"],
                invalidatesFieldIds: [],
                selectionPolicy: "SELECTABLE",
              },
            },
          },
        ],
        "context.valueDate",
      ),
    ).toEqual([
      "context.counterpartyBankServiceId",
      "context.deliveryBankServiceId",
    ]);
  });
});
