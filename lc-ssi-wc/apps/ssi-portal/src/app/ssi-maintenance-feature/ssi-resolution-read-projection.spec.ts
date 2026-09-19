import {
  projectResolutionCounterparties,
  projectSettlementSsis,
} from "./ssi-resolution-read-projection";

describe("SSI Resolution read projection", () => {
  it("exposes only the counterparty fields consumed by Payment/FIN", () => {
    expect(
      projectResolutionCounterparties([
        {
          counterpartyId: "CUST-1",
          name: "Customer One",
          country: "HK",
          partyType: "CUSTOMER",
          beneficiaryAccountReference: "ACC-1",
          address: "Hong Kong",
          bic: "UNUSED",
        },
      ]),
    ).toEqual([
      {
        counterpartyId: "CUST-1",
        name: "Customer One",
        country: "HK",
        partyType: "CUSTOMER",
        beneficiaryAccountReference: "ACC-1",
        address: "Hong Kong",
      },
    ]);
  });

  it("projects only SSI eligibility fields without leaking maintenance metadata", () => {
    expect(
      projectSettlementSsis([
        {
          id: "SSI-1",
          status: "ACTIVE",
          counterpartyId: "BANK-1",
          scope: "STANDING",
          maker: "maker.demo",
          version: 3,
          route: {
            counterpartyBic: "BANKHKHH",
            counterpartyType: "BANK",
            currency: "USD",
            messageTypes: "MT103, MT202",
            accountWithBic: "UNUSED",
          },
          applicability: [
            {
              id: "APP-1",
              ssiId: "SSI-1",
              status: "ACTIVE",
              consumer: "TRADE_FINANCE",
              product: "LC",
              businessFunction: "IMPORT_LC_BANK_REIMBURSEMENT",
              paymentLeg: "BANK_TO_BANK",
              direction: "OUTBOUND",
              validFrom: "2026-01-01",
              validTo: "2026-12-31",
              version: 2,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        status: "ACTIVE",
        counterpartyId: "BANK-1",
        counterpartyBic: "BANKHKHH",
        counterpartyType: "BANK",
        currency: "USD",
        messageTypes: "MT103, MT202",
        applicability: [
          {
            status: "ACTIVE",
            consumer: "TRADE_FINANCE",
            product: "LC",
            businessFunction: "IMPORT_LC_BANK_REIMBURSEMENT",
            paymentLeg: "BANK_TO_BANK",
            direction: "OUTBOUND",
          },
        ],
      },
    ]);
  });

  it("preserves the legacy defaults when optional SSI and customer fields are absent", () => {
    expect(
      projectSettlementSsis([
        {
          id: "SSI-2",
          status: "DRAFT",
          counterpartyId: "BANK-2",
          scope: "STANDING",
          maker: "maker.demo",
          version: 1,
          route: {},
        },
      ]),
    ).toEqual([
      {
        status: "DRAFT",
        counterpartyId: "BANK-2",
        counterpartyBic: "",
        counterpartyType: "BANK",
        currency: "",
        messageTypes: "",
        applicability: [],
      },
    ]);
    expect(
      projectResolutionCounterparties([
        {
          counterpartyId: "CUST-2",
          name: "Customer Two",
          country: "SG",
          partyType: "CUSTOMER",
        },
      ]),
    ).toEqual([
      {
        counterpartyId: "CUST-2",
        name: "Customer Two",
        country: "SG",
        partyType: "CUSTOMER",
      },
    ]);
  });
});
