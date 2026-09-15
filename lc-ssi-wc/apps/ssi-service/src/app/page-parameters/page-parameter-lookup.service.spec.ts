import { BadRequestException } from "@nestjs/common";
import { BankServiceDirectory } from "../bank-service-directory";
import { FinControlledFixtureService } from "../fin-controlled-fixture.service";
import { SqliteSsiRepository } from "../sqlite-ssi.repository";
import { PageParameterEnvironmentPolicy } from "./page-parameter-environment.policy";
import { PageParameterLookupService } from "./page-parameter-lookup.service";
import { PageParameterLookupDefaultsService } from "./page-parameter-lookup-defaults.service";
import { ResolutionPageScenarioCatalogueService } from "./resolution-page-scenario-catalogue.service";

describe("PageParameterLookupService", () => {
  const fixtures = { catalogue: jest.fn(() => []) };
  const scenarios = {
    get: () => ({
      scenarios: [
        {
          scenarioId: "MT300-001",
          profileId: "P-MT300-B1",
          fixtureBindingId: "FIX-MT300-001@v1",
        },
      ],
      definitions: [
        {
          profileId: "P-MT300-B1",
          messageType: "MT300",
          sequence: "B1",
          settlementLeg: "BOUGHT",
          businessFunction: "FX",
        },
      ],
    }),
  };
  it("uses Payment applicability rather than the MT347 fixture catalogue for MT202 counterparties", () => {
    const directory = {
      search: jest.fn(() => [
        {
          bankServiceId: "BANK-SVC-DEUTDEFF",
          bic: "DEUTDEFF",
          name: "Deutsche Bank AG",
        },
      ]),
    };
    const payment = {
      scenarioPolicy: jest.fn(() => ({
        messageType: "MT202",
        scenarioId: "MT202-OP-STANDARD",
        sequenceIds: ["A"],
        polarity: "POSITIVE",
        expectedHttp: [200],
      })),
    };
    const applicability = {
      candidates: jest.fn(() => [{ route: { counterpartyBic: "DEUTDEFF" } }]),
    };
    const service = new PageParameterLookupService(
      directory as never,
      fixtures as never,
      scenarios as never,
      {
        find: jest.fn(() => ({
          defaultBankServiceId: "BANK-SVC-DEUTDEFF",
        })),
      } as never,
      payment as never,
      applicability as never,
    );

    const result = service.ssiCounterparties({
      scenarioId: "MT202-OP-STANDARD",
      messageType: "MT202",
      sequence: "A",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        provider: "SSI_COUNTERPARTY",
        bankServiceId: "BANK-SVC-DEUTDEFF",
        bic: "DEUTDEFF",
      }),
    ]);
    expect(result.defaultSelection).toEqual({
      valueField: "bankServiceId",
      value: "BANK-SVC-DEUTDEFF",
      reasonCode: "GOVERNED_CURRENCY_DEFAULT",
      dependency: { fieldId: "context.currency", value: "EUR" },
    });
    expect(applicability.candidates).toHaveBeenCalledWith({
      messageType: "MT202",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    });
  });

  it("does not collapse distinct Payment SSI routes that share one counterparty bank", () => {
    const directory = {
      search: jest.fn(() => [
        {
          bankServiceId: "BANK-SVC-DEUTDEFF",
          bic: "DEUTDEFF",
          name: "Deutsche Bank AG",
        },
      ]),
    };
    const service = new PageParameterLookupService(
      directory as never,
      fixtures as never,
      scenarios as never,
      {
        find: jest.fn(() => ({
          defaultBankServiceId: "BANK-SVC-DEUTDEFF",
        })),
      } as never,
      {
        scenarioPolicy: jest.fn(() => ({
          messageType: "MT202",
          scenarioId: "MT202-OP-STANDARD",
          sequenceIds: ["A"],
          polarity: "POSITIVE",
          expectedHttp: [200],
        })),
      } as never,
      {
        candidates: jest.fn(() => [
          { id: "SSI-ROUTE-1", route: { counterpartyBic: "DEUTDEFF" } },
          { id: "SSI-ROUTE-2", route: { counterpartyBic: "DEUTDEFF" } },
        ]),
      } as never,
    );

    const result = service.ssiCounterparties({
      scenarioId: "MT202-OP-STANDARD",
      messageType: "MT202",
      sequence: "A",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    });

    expect(result.items).toHaveLength(2);
    expect(result.defaultSelection).toBeUndefined();
  });
  it("returns the stable Bank Service identity and BIC display value", () => {
    const service = new PageParameterLookupService(
      {
        resolve: jest.fn(() => ({
          bankServiceId: "BANK-SVC-CITIUS33",
          bic: "CITIUS33",
        })),
        search: jest.fn(() => []),
      } as never,
      fixtures as never,
      scenarios as never,
    );

    expect(service.bankService("BANK-SVC-CITIUS33")).toEqual({
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      bankServiceId: "BANK-SVC-CITIUS33",
      bic: "CITIUS33",
      displayValue: "CITIUS33",
    });
  });

  it("preserves unknown lookup rejection", () => {
    const service = new PageParameterLookupService(
      {
        resolve: jest.fn(() => {
          throw new BadRequestException("BANK_SERVICE_NOT_FOUND");
        }),
        search: jest.fn(() => []),
      } as never,
      fixtures as never,
      scenarios as never,
    );

    expect(() => service.bankService("BANK-SVC-UNKNOWN")).toThrow(
      BadRequestException,
    );
  });

  it("offers a searchable selection contract", () => {
    const service = new PageParameterLookupService(
      {
        resolve: jest.fn(),
        search: jest.fn(() => [
          { bankServiceId: "BANK-SVC-CITIUS33", bic: "CITIUS33" },
        ]),
      } as never,
      fixtures as never,
      scenarios as never,
    );

    expect(service.bankServices("CITI")).toEqual({
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      items: [
        expect.objectContaining({
          bankServiceId: "BANK-SVC-CITIUS33",
          bic: "CITIUS33",
          displayValue: "CITIUS33",
        }),
      ],
    });
  });

  it("lists only active SSI-applicable counterparties for the governed context", () => {
    const directory = {
      resolve: jest.fn(),
      search: jest.fn((bic: string) => [
        {
          bankServiceId: `BANK-SVC-${bic}`,
          bic,
          name: bic === "CITIUS33" ? "Citibank New York" : "Other Bank",
        },
      ]),
    };
    const service = new PageParameterLookupService(
      directory as never,
      {
        catalogue: () => [
          {
            messageType: "MT300",
            sequence: "B1",
            currency: "USD",
            bookingEntity: "HK01",
            fixtureGroupId: "FIX-MT300-001@v1",
            settlementLeg: "BOUGHT",
            businessFunction: "FX",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-12-31",
            counterpartyBic: "CITIUS33",
          },
          {
            messageType: "MT300",
            sequence: "B1",
            currency: "EUR",
            bookingEntity: "HK01",
            fixtureGroupId: "FIX-MT300-001@v1",
            settlementLeg: "BOUGHT",
            businessFunction: "FX",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-12-31",
            counterpartyBic: "DEUTDEFF",
          },
        ],
      } as never,
      scenarios as never,
    );

    expect(
      service.ssiCounterparties({
        scenarioId: "MT300-001",
        messageType: "MT300",
        sequence: "B1",
        currency: "USD",
        bookingEntity: "HK01",
        valueDate: "2026-09-13",
      }),
    ).toEqual({
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      items: [
        expect.objectContaining({
          bankServiceId: "BANK-SVC-CITIUS33",
          bic: "CITIUS33",
          bankName: "Citibank New York",
          displayValue: "CITIUS33 — Citibank New York",
        }),
      ],
    });
  });

  it.each([
    ["USD", ["BOFAUS3N", "CHASUS33", "DEUTDEFF"]],
    ["EUR", ["BOFAUS3N", "CHASUS33", "DEUTDEFF"]],
  ])(
    "returns live MT300-001 %s options with the explicit governed default",
    (currency, expectedBics) => {
      const repository = new SqliteSsiRepository();
      try {
        const service = new PageParameterLookupService(
          new BankServiceDirectory(),
          new FinControlledFixtureService(repository),
          new ResolutionPageScenarioCatalogueService(
            new PageParameterEnvironmentPolicy("DEMO"),
          ),
          new PageParameterLookupDefaultsService(),
        );

        const result = service.ssiCounterparties({
          scenarioId: "MT300-001",
          messageType: "MT300",
          sequence: "B1",
          currency,
          bookingEntity: "HK01",
          valueDate: "2026-09-13",
        });
        expect(result.items.map(({ bic }) => bic)).toEqual(expectedBics);
        expect(result.defaultSelection).toEqual({
          valueField: "bankServiceId",
          value: "BANK-SVC-DEUTDEFF",
          reasonCode: "GOVERNED_CURRENCY_DEFAULT",
          dependency: { fieldId: "context.currency", value: currency },
        });
        const filtered = service.ssiCounterparties({
          scenarioId: "MT300-001",
          messageType: "MT300",
          sequence: "B1",
          currency,
          bookingEntity: "HK01",
          valueDate: "2026-09-13",
          query: "BOFA",
        });
        expect(filtered.items.map(({ bic }) => bic)).toEqual(["BOFAUS3N"]);
        expect(filtered.defaultSelection).toBeUndefined();
      } finally {
        repository.onModuleDestroy();
      }
    },
  );

  it("provides one eligible governed default across the complete executable SSI matrix", () => {
    const repository = new SqliteSsiRepository();
    try {
      const catalogue = new ResolutionPageScenarioCatalogueService(
        new PageParameterEnvironmentPolicy("DEMO"),
      );
      const fixtureCatalogue = new FinControlledFixtureService(
        repository,
      ).catalogue();
      const service = new PageParameterLookupService(
        new BankServiceDirectory(),
        { catalogue: () => fixtureCatalogue } as never,
        catalogue,
        new PageParameterLookupDefaultsService(),
      );
      const governed = catalogue.get();
      const executable = governed.scenarios.filter(
        ({ polarity }) => polarity !== "BOUNDARY",
      );
      const currencies = ["EUR", "GBP", "HKD", "JPY", "USD"];
      expect(executable).toHaveLength(359);
      for (const scenario of executable) {
        const profile = governed.definitions.find(
          ({ profileId }) => profileId === scenario.profileId,
        );
        expect(profile).toBeDefined();
        for (const currency of currencies) {
          const result = service.ssiCounterparties({
            scenarioId: scenario.scenarioId,
            messageType: profile!.messageType,
            sequence: profile!.sequence,
            currency,
            bookingEntity: "HK01",
            valueDate: "2026-09-14",
          });
          expect(result.items).toHaveLength(3);
          expect(result.defaultSelection).toMatchObject({
            valueField: "bankServiceId",
            reasonCode: "GOVERNED_CURRENCY_DEFAULT",
            dependency: { fieldId: "context.currency", value: currency },
          });
          expect(
            result.items.some(
              ({ bankServiceId }) =>
                bankServiceId === result.defaultSelection?.value,
            ),
          ).toBe(true);
        }
      }
    } finally {
      repository.onModuleDestroy();
    }
  });

  it("leaves Counterparty unselected when no governed default policy matches", () => {
    const repository = new SqliteSsiRepository();
    try {
      const service = new PageParameterLookupService(
        new BankServiceDirectory(),
        new FinControlledFixtureService(repository),
        new ResolutionPageScenarioCatalogueService(
          new PageParameterEnvironmentPolicy("DEMO"),
        ),
        { find: () => undefined } as never,
      );
      const result = service.ssiCounterparties({
        scenarioId: "MT300-001",
        messageType: "MT300",
        sequence: "B1",
        currency: "GBP",
        bookingEntity: "HK01",
        valueDate: "2026-09-13",
      });
      expect(result.items.length).toBeGreaterThan(1);
      expect(result.defaultSelection).toBeUndefined();
    } finally {
      repository.onModuleDestroy();
    }
  });

  it("fails closed when a configured default is not eligible", () => {
    const service = new PageParameterLookupService(
      {
        search: jest.fn((bic: string) => [
          { bankServiceId: `BANK-SVC-${bic}`, bic, name: bic },
        ]),
      } as never,
      {
        catalogue: () => [
          {
            messageType: "MT300",
            sequence: "B1",
            currency: "USD",
            bookingEntity: "HK01",
            fixtureGroupId: "FIX-MT300-001@v1",
            settlementLeg: "BOUGHT",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-12-31",
            counterpartyBic: "CITIUS33",
          },
        ],
      } as never,
      scenarios as never,
      {
        find: () => ({ defaultBankServiceId: "BANK-SVC-DEUTDEFF" }),
      } as never,
    );

    expect(() =>
      service.ssiCounterparties({
        scenarioId: "MT300-001",
        messageType: "MT300",
        sequence: "B1",
        currency: "USD",
        bookingEntity: "HK01",
        valueDate: "2026-09-13",
      }),
    ).toThrow(BadRequestException);
  });

  it("applies the governed default to an executable negative scenario", () => {
    const negativeScenarios = {
      get: () => ({
        scenarios: [
          {
            scenarioId: "MT300-NEG",
            profileId: "P-MT300-B1",
            fixtureBindingId: "FIX-MT300-001@v1",
            polarity: "NEGATIVE",
            expectedHttp: [422],
          },
        ],
        definitions: [
          {
            profileId: "P-MT300-B1",
            messageType: "MT300",
            sequence: "B1",
            settlementLeg: "BOUGHT",
          },
        ],
      }),
    };
    const service = new PageParameterLookupService(
      {
        search: jest.fn((bic: string) => [
          { bankServiceId: `BANK-SVC-${bic}`, bic, name: bic },
        ]),
      } as never,
      {
        catalogue: () => [
          {
            messageType: "MT300",
            sequence: "B1",
            currency: "USD",
            bookingEntity: "HK01",
            fixtureGroupId: "FIX-MT300-001@v1",
            settlementLeg: "BOUGHT",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-12-31",
            counterpartyBic: "DEUTDEFF",
          },
        ],
      } as never,
      negativeScenarios as never,
      new PageParameterLookupDefaultsService(),
    );
    const result = service.ssiCounterparties({
      scenarioId: "MT300-NEG",
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-13",
    });
    expect(result.items).toHaveLength(1);
    expect(result.defaultSelection?.value).toBe("BANK-SVC-DEUTDEFF");
  });

  it("fails closed when SSI counterparty dependency context is incomplete", () => {
    const service = new PageParameterLookupService(
      { search: jest.fn() } as never,
      fixtures as never,
      scenarios as never,
    );
    expect(() =>
      service.ssiCounterparties({
        scenarioId: "",
        messageType: "MT300",
        sequence: "B1",
        currency: "USD",
        bookingEntity: "HK01",
        valueDate: "2026-09-13",
      }),
    ).toThrow(BadRequestException);
  });

  it("derives own-account receiver and account defaults from governed Nostro records", () => {
    const banks = [
      { bankServiceId: "BANK-SVC-CITIUS33", bic: "CITIUS33", name: "Citibank" },
      {
        bankServiceId: "BANK-SVC-DEUTDEFF",
        bic: "DEUTDEFF",
        name: "Deutsche Bank",
      },
    ];
    const directory = {
      search: jest.fn((query = "") =>
        banks.filter(({ bic }) => !query || bic === query),
      ),
      resolve: jest.fn((id: string) =>
        banks.find(({ bankServiceId }) => bankServiceId === id),
      ),
    };
    const records = [
      {
        id: "NOSTRO-DEBIT",
        version: 4,
        status: "ACTIVE",
        purpose: "SETTLEMENT",
        currency: "USD",
        ownLegalEntityId: "HK01",
        allowedBookingEntities: ["HK01"],
        accountServicerBic: "CITIUS33",
        accountReference: "DEBIT-REF",
        maskedAccountRef: "DEMO-DEBIT",
        priority: 1,
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      },
      {
        id: "NOSTRO-CREDIT",
        version: 7,
        status: "ACTIVE",
        purpose: "SETTLEMENT",
        currency: "USD",
        ownLegalEntityId: "HK01",
        allowedBookingEntities: ["HK01"],
        accountServicerBic: "DEUTDEFF",
        accountReference: "CREDIT-REF",
        maskedAccountRef: "DEMO-CREDIT",
        priority: 2,
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      },
    ];
    const payment = {
      scenarioPolicy: jest.fn(() => ({
        messageType: "MT202",
        scenarioId: "MT202-OP-CREDIT-57A",
        sequenceIds: ["A"],
        polarity: "POSITIVE",
        expectedHttp: [200],
      })),
    };
    const service = new PageParameterLookupService(
      directory as never,
      fixtures as never,
      scenarios as never,
      undefined,
      payment as never,
      undefined,
      { list: jest.fn(() => records) } as never,
    );
    const context = {
      scenarioId: "MT202-OP-CREDIT-57A",
      messageType: "MT202",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    };

    expect(service.ownAccountReceivers(context).defaultSelection).toMatchObject(
      {
        value: "BANK-SVC-CITIUS33",
        reasonCode: "GOVERNED_PRIORITY_DEFAULT",
      },
    );
    expect(
      service.nostroAccounts({
        ...context,
        receiverBankServiceId: "BANK-SVC-CITIUS33",
        targetRole: "OWN_DEBIT_ACCOUNT",
      }).defaultSelection,
    ).toMatchObject({
      value: "NOSTRO-DEBIT",
      companionValues: { version: 4 },
    });
    expect(
      service.nostroAccounts({
        ...context,
        receiverBankServiceId: "BANK-SVC-CITIUS33",
        ownDebitAccountId: "NOSTRO-DEBIT",
        targetRole: "OWN_CREDIT_ACCOUNT",
      }).items,
    ).toEqual([
      expect.objectContaining({ nostroId: "NOSTRO-CREDIT", version: 7 }),
    ]);
  });

  it("never offers an MT347-only receiver that the MT2 resolver will reject", () => {
    const banks = [
      { bankServiceId: "BANK-SVC-CITIUS33", bic: "CITIUS33", name: "Citibank" },
    ];
    const directory = {
      search: jest.fn((query = "") =>
        banks.filter(({ bic }) => !query || bic === query),
      ),
    };
    const mt347OnlyPair = ["DEBIT", "CREDIT"].map((side, index) => ({
      id: `MT347-${side}`,
      version: 1,
      status: "ACTIVE",
      purpose: "SETTLEMENT",
      currency: "EUR",
      ownLegalEntityId: "HK01",
      allowedBookingEntities: ["HK01"],
      accountServicerBic: "CITIUS33",
      accountReference: `MT347-${side}-REF`,
      maskedAccountRef: `MT347-${side}`,
      priority: index + 1,
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      fixtureFamily: "MT347-SR2026-SSI",
    }));
    const payment = {
      scenarioPolicy: jest.fn(() => ({
        messageType: "MT202COV",
        scenarioId: "MT202COV-OP-BOOK",
        sequenceIds: ["A", "B"],
        polarity: "POSITIVE",
        expectedHttp: [200],
      })),
    };
    const service = new PageParameterLookupService(
      directory as never,
      fixtures as never,
      scenarios as never,
      undefined,
      payment as never,
      undefined,
      { list: jest.fn(() => mt347OnlyPair) } as never,
    );

    const result = service.ownAccountReceivers({
      scenarioId: "MT202COV-OP-BOOK",
      messageType: "MT202COV",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    });

    expect(result.items).toEqual([]);
    expect(result.defaultSelection).toBeUndefined();
  });

  it("fails closed when governed own-account context or role is invalid", () => {
    const directory = {
      resolve: jest.fn(() => ({
        bankServiceId: "BANK-SVC-CITIUS33",
        bic: "CITIUS33",
      })),
      search: jest.fn(() => []),
    };
    const withoutNostros = new PageParameterLookupService(
      directory as never,
      fixtures as never,
      scenarios as never,
      undefined,
      { scenarioPolicy: jest.fn(() => undefined) } as never,
    );
    const context = {
      scenarioId: "MT202-OP-BOOK",
      messageType: "MT202",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    };

    expect(() => withoutNostros.ownAccountReceivers(context)).toThrow(
      BadRequestException,
    );

    const withNostros = new PageParameterLookupService(
      directory as never,
      fixtures as never,
      scenarios as never,
      undefined,
      {
        scenarioPolicy: jest.fn(() => ({
          messageType: "MT202",
          scenarioId: "MT202-OP-BOOK",
          sequenceIds: ["A"],
          polarity: "POSITIVE",
          expectedHttp: [200],
        })),
      } as never,
      undefined,
      { list: jest.fn(() => []) } as never,
    );
    expect(() =>
      withNostros.nostroAccounts({
        ...context,
        receiverBankServiceId: "BANK-SVC-CITIUS33",
        targetRole: "UNSUPPORTED_ROLE",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      withNostros.ownAccountReceivers({
        ...context,
        scenarioId: "MT202-UNKNOWN-SCENARIO",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      withNostros.ownAccountReceivers({
        ...context,
        messageType: "MT300",
      }),
    ).toThrow(BadRequestException);
  });

  it("filters governed own-account receivers and suppresses defaults while searching", () => {
    const banks = [
      { bankServiceId: "BANK-SVC-CITIUS33", bic: "CITIUS33", name: "Citibank" },
      {
        bankServiceId: "BANK-SVC-DEUTDEFF",
        bic: "DEUTDEFF",
        name: "Deutsche Bank",
      },
    ];
    const accounts = banks.flatMap(({ bic }, bankIndex) =>
      ["DEBIT", "CREDIT"].map((side, sideIndex) => ({
        id: `${bic}-${side}`,
        version: 1,
        status: "ACTIVE",
        purpose: "SETTLEMENT",
        currency: "USD",
        ownLegalEntityId: "HK01",
        allowedBookingEntities: ["HK01"],
        accountServicerBic: bic,
        accountReference: `${bic}-${side}-REF`,
        maskedAccountRef: `${bic}-${side}`,
        priority: bankIndex * 2 + sideIndex + 1,
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      })),
    );
    const service = new PageParameterLookupService(
      {
        resolve: jest.fn((id: string) =>
          banks.find(({ bankServiceId }) => bankServiceId === id),
        ),
        search: jest.fn((query = "") =>
          banks.filter(({ bic }) => !query || bic === query),
        ),
      } as never,
      fixtures as never,
      scenarios as never,
      undefined,
      {
        scenarioPolicy: jest.fn(() => ({
          messageType: "MT202",
          scenarioId: "MT202-OP-BOOK",
          sequenceIds: ["A"],
          polarity: "POSITIVE",
          expectedHttp: [200],
        })),
      } as never,
      undefined,
      { list: jest.fn(() => accounts) } as never,
    );
    const context = {
      scenarioId: "MT202-OP-BOOK",
      messageType: "MT202",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    };

    const receivers = service.ownAccountReceivers({
      ...context,
      query: "CITI",
    });
    expect(receivers.items.map(({ bic }) => bic)).toEqual(["CITIUS33"]);
    expect(receivers.defaultSelection).toBeUndefined();

    const accountsResult = service.nostroAccounts({
      ...context,
      receiverBankServiceId: "BANK-SVC-CITIUS33",
      targetRole: "OWN_DEBIT_ACCOUNT",
      query: "NO-MATCH",
    });
    expect(accountsResult.items).toEqual([]);
    expect(accountsResult.defaultSelection).toBeUndefined();
  });

  it("filters payment counterparties and ignores incomplete directory records", () => {
    const payment = {
      scenarioPolicy: jest.fn(() => ({
        messageType: "MT202",
        scenarioId: "MT202-OP-STANDARD",
        sequenceIds: ["A"],
        polarity: "POSITIVE",
        expectedHttp: [200],
      })),
    };
    const service = new PageParameterLookupService(
      {
        search: jest.fn(
          (bic: string) =>
            ({
              DEUTDEFF: [
                {
                  bankServiceId: "BANK-SVC-DEUTDEFF",
                  bic,
                  name: "Deutsche Bank",
                },
              ],
              CITIUS33: [
                {
                  bankServiceId: "BANK-SVC-CITIUS33",
                  bic,
                  name: "Citibank",
                },
              ],
            })[bic] ?? [],
        ),
      } as never,
      fixtures as never,
      scenarios as never,
      undefined,
      payment as never,
      {
        candidates: jest.fn(() => [
          { route: { counterpartyBic: "DEUTDEFF" } },
          { route: { counterpartyBic: "CITIUS33" } },
          { route: {} },
          { route: { counterpartyBic: "MISSING" } },
        ]),
      } as never,
    );
    const context = {
      scenarioId: "MT202-OP-STANDARD",
      messageType: "MT202",
      sequence: "A",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
    };

    const result = service.ssiCounterparties({ ...context, query: "DEUT" });
    expect(result.items).toEqual([
      expect.objectContaining({ bic: "DEUTDEFF" }),
    ]);
    expect(result.defaultSelection).toBeUndefined();
    expect(
      service.ssiCounterparties(context).items.map(({ bic }) => bic),
    ).toEqual(["CITIUS33", "DEUTDEFF"]);
    expect(() =>
      service.ssiCounterparties({ ...context, sequence: "B" }),
    ).toThrow(BadRequestException);
  });
});
