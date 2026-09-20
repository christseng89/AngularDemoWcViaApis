import {
  MappingCatalogueService,
  type LoadedCatalogue,
} from "../mapping-catalogue.service";
import { MappingResolutionPageDefinitionSource } from "./mapping-resolution-page-definition.source";
import { PageParameterEnvironmentPolicy } from "./page-parameter-environment.policy";
import { ResolutionPageAggregationService } from "./resolution-page-aggregation.service";
import { ResolutionPageScenarioCatalogueService } from "./resolution-page-scenario-catalogue.service";
import { ResolutionPageFixtureManifestService } from "./resolution-page-fixture-manifest.service";
import { IndexPaginationPolicy } from "../index-pagination.policy";
import { PaymentMessageIndexService } from "../payment-message-index.service";
import { ResolutionPageOasFieldPolicyService } from "./resolution-page-oas-field-policy.service";

const SHA = "a".repeat(64);

const catalogue: LoadedCatalogue = {
  standardsRelease: "SR2026",
  catalogueVersion: "CAT-SYNTHETIC-v1",
  sourceArtifactId: "parameters/synthetic-mappings.json",
  sourceArtifactHash: SHA,
  mappings: [
    {
      standardsRelease: "SR2026",
      messageType: "MT399",
      direction: "OUTGOING",
      businessFunction: "FUTURE_GOVERNED_FUNCTION",
      path: "Q9.79Z",
      sequence: "Q9",
      settlementLeg: "Future settlement leg",
      tag: "79",
      option: "Z",
      canonicalRole: "FUTURE_ROLE",
      officialRole: "Future role",
      officialFieldName: "Future governed field",
      presence: "MANDATORY",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT399",
      direction: "OUTGOING",
      businessFunction: "FUTURE_GOVERNED_FUNCTION",
      path: "Q9.57A",
      sequence: "Q9",
      settlementLeg: "Future settlement leg",
      tag: "57",
      option: "A",
      canonicalRole: "ACCOUNT_WITH_INSTITUTION",
      officialRole: "Account With Institution",
      officialFieldName: "Account With Institution",
      presence: "MANDATORY",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
    },
  ],
};

const catalogues = {
  get: (release: string) => {
    expect(release).toBe("SR2026");
    return catalogue;
  },
} as unknown as MappingCatalogueService;

describe("MappingResolutionPageDefinitionSource", () => {
  it("creates an extensible definition from governed mapping data without a message switch", () => {
    const source = new MappingResolutionPageDefinitionSource(catalogues);

    const definitions = source.all("SR2026");

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      messageType: "MT399",
      businessFunction: "FUTURE_GOVERNED_FUNCTION",
      businessDomain: "TREASURY",
      display: {
        familyCode: "MT3",
        familyLabel: "MT3",
        categoryCode: "TREASURY",
        categoryLabel: "Treasury",
      },
    });
    expect(definitions[0]!.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "Q9.79",
          swiftTag: "79",
          dataType: "STRING",
          options: [{ value: "Z", label: "Option Z" }],
        }),
        expect.objectContaining({
          fieldId: "Q9.57.bankServiceId",
          path: "roleBankServiceIds.ACCOUNT_WITH_INSTITUTION",
          dataType: "SWIFT_BIC",
          lookup: expect.objectContaining({
            provider: "BANK_SERVICE",
            action: "BANK_SERVICE",
            valueField: "bankServiceId",
            displayField: "bic",
          }),
        }),
      ]),
    );
  });

  it("selects only by the API-provided typed query identity", () => {
    const source = new MappingResolutionPageDefinitionSource(catalogues);
    const definition = source.all()[0]!;

    expect(
      source.find({
        standardsRelease: "SR2026",
        messageFamily: "MT347",
        messageType: "MT399",
        direction: "OUTGOING",
        businessScenarioId:
          definition.profile.selectionBasis.businessScenarioId,
      }),
    ).toEqual([definition]);
    expect(
      source.find({
        standardsRelease: "SR2026",
        messageFamily: "MT347",
        messageType: "MT300",
        direction: "OUTGOING",
      }),
    ).toEqual([]);
  });

  it("publishes selectable governed multi-currency options and downstream invalidation", () => {
    const scenarioCatalogue = {
      get: () => ({
        catalogueVersion: "SCN-v1",
        standardsRelease: "SR2026",
        messageFamily: "MT347",
        sourceArtifactId: "parameters/scenarios.json",
        sourceArtifactSha256: SHA,
        definitions: [
          {
            profileId: "P-MT399-Q9",
            messageType: "MT399",
            businessFunction: "FUTURE_GOVERNED_FUNCTION",
            sequence: "Q9",
            settlementLeg: "Future settlement leg",
          },
        ],
        scenarios: [
          {
            scenarioId: "SCN-USD",
            testCaseId: "T-USD",
            profileId: "P-MT399-Q9",
            label: "USD route",
            polarity: "POSITIVE",
            fixtureBindingId: "FIX-USD",
            expectedHttp: [200],
            inputValues: { "context.currency": "USD" },
          },
          {
            scenarioId: "SCN-EUR",
            testCaseId: "T-EUR",
            profileId: "P-MT399-Q9",
            label: "EUR route",
            polarity: "POSITIVE",
            fixtureBindingId: "FIX-EUR",
            expectedHttp: [200],
            inputValues: { "context.currency": "EUR" },
          },
        ],
        inputs: [],
        crossTagConstraints: [],
      }),
    };
    const fixture = (bindingId: string) => ({
      bindingId,
      fixtureSet: "MT347-SR2026-SSI",
      fixtureVersion: "v1",
      sourceArtifactSha256: SHA,
      isolation: "CANONICAL",
    });
    const source = new MappingResolutionPageDefinitionSource(
      catalogues,
      {
        catalogue: () => [
          {
            messageType: "MT399",
            sequence: "Q9",
            settlementLeg: "Future settlement leg",
            currency: "USD",
          },
          {
            messageType: "MT399",
            sequence: "Q9",
            settlementLeg: "Future settlement leg",
            currency: "EUR",
          },
        ],
      } as never,
      scenarioCatalogue as never,
      { require: (bindingId: string) => fixture(bindingId) } as never,
    );

    const currency = source
      .all()[0]!
      .fields.find(({ fieldId }) => fieldId === "context.currency")!;
    expect(currency).toMatchObject({
      options: [
        { value: "EUR", label: "EUR" },
        { value: "USD", label: "USD" },
      ],
      optionSource: {
        source: "GOVERNED_APPLICABILITY",
        selectionPolicy: "SELECTABLE",
        invalidatesFieldIds: expect.arrayContaining([
          "context.counterpartyBankServiceId",
        ]),
      },
    });
    expect(currency.optionSource?.dependsOnFieldIds).toEqual([]);
  });

  it("characterizes why an OAS-only index cannot preserve fixture-derived currency options", () => {
    const scenarioCatalogue = {
      get: () => ({
        catalogueVersion: "SCN-v1",
        standardsRelease: "SR2026",
        messageFamily: "MT347",
        sourceArtifactId: "parameters/scenarios.json",
        sourceArtifactSha256: SHA,
        definitions: [
          {
            profileId: "P-MT399-Q9",
            messageType: "MT399",
            businessFunction: "FUTURE_GOVERNED_FUNCTION",
            sequence: "Q9",
            settlementLeg: "Future settlement leg",
          },
        ],
        scenarios: [
          {
            scenarioId: "SCN-USD",
            testCaseId: "T-USD",
            profileId: "P-MT399-Q9",
            label: "USD route",
            polarity: "POSITIVE",
            fixtureBindingId: "FIX-USD",
            expectedHttp: [200],
            inputValues: { "context.currency": "USD" },
          },
        ],
        inputs: [],
        crossTagConstraints: [],
      }),
    } as never;
    const manifest = {
      require: (bindingId: string) => ({
        bindingId,
        fixtureSet: "MT347-SR2026-SSI",
        fixtureVersion: "v1",
        sourceArtifactSha256: SHA,
        isolation: "CANONICAL",
      }),
    } as never;
    const fixtureCandidates = {
      catalogue: () => [
        {
          messageType: "MT399",
          sequence: "Q9",
          settlementLeg: "Future settlement leg",
          currency: "EUR",
        },
      ],
    } as never;
    const withFixture = new MappingResolutionPageDefinitionSource(
      catalogues,
      fixtureCandidates,
      scenarioCatalogue,
      manifest,
    ).all()[0]!;
    const oasOnly = new MappingResolutionPageDefinitionSource(
      catalogues,
      undefined,
      scenarioCatalogue,
      manifest,
    ).all()[0]!;
    const currencyOptions = (definition: typeof withFixture) =>
      definition.fields
        .find(({ fieldId }) => fieldId === "context.currency")
        ?.options?.map(({ value }) => value);

    expect(currencyOptions(withFixture)).toEqual(["EUR", "USD"]);
    expect(currencyOptions(oasOnly)).toEqual(["USD"]);
    expect(oasOnly).not.toEqual(withFixture);
  });

  it("does not accept legacy inline page definitions from mapping rows", () => {
    const mt2Catalogue = {
      ...catalogue,
      mappings: [
        {
          ...catalogue.mappings[1]!,
          messageType: "MT202",
          businessFunction: "FINANCIAL_INSTITUTION_TRANSFER",
          pageDefinition: {
            messageFamily: "MT2_PACS009",
            businessScenarioId: "GENERIC_PLAIN",
            profileId: "PACS009-PLAIN",
            profileKind: "MT_TO_MX",
            businessService: "swift.cbprplus.04",
            messageDefinitionId: "pacs.009.001.08",
            paymentExecutable: true,
            fixtureBindingId: "FIX-MT202-GENERIC-001@v1",
            fixtureSet: "MT2-CANONICAL-POSITIVE",
            fixtureVersion: "v1",
            fixtureSourceSha256: SHA,
          },
          pageInputs: [
            {
              fieldId: "context.field86Present",
              path: "validationContext.field86Present",
              label: "Field 86 Present",
              control: "CHECKBOX",
              dataType: "BOOLEAN",
              required: true,
              constraints: [],
            },
          ],
        },
      ],
    } as LoadedCatalogue;
    const source = new MappingResolutionPageDefinitionSource({
      get: () => mt2Catalogue,
    } as never);

    expect(
      source.find({
        standardsRelease: "SR2026",
        messageFamily: "MT2_PACS009",
        messageType: "MT202",
        direction: "OUTGOING",
        businessScenarioId: "GENERIC_PLAIN",
        businessService: "swift.cbprplus.04",
      }),
    ).toEqual([]);
  });

  it("round-trips every governed SR2026 index identity to the same contract hash", () => {
    const source = new MappingResolutionPageDefinitionSource(
      new MappingCatalogueService(),
    );
    const service = new ResolutionPageAggregationService(
      source,
      new PageParameterEnvironmentPolicy("DEMO"),
    );

    const index = service.index("SR2026");

    expect(index.items).toHaveLength(53);
    for (const item of index.items) {
      const result = service.get(item.query);
      expect(result.contract.definitionId).toBe(item.definitionId);
      expect(result.contract.definitionVersion).toBe(item.definitionVersion);
      expect(result.contractSha256).toBe(item.contractSha256);
    }
  });

  it.each([
    ["MT300", "MT3", "Treasury"],
    ["MT400", "MT4", "Trade Finance"],
    ["MT769", "MT7", "Trade Finance"],
  ])(
    "publishes governed display identity for %s without exposing MT347",
    (messageType, familyCode, categoryLabel) => {
      const source = new MappingResolutionPageDefinitionSource(
        new MappingCatalogueService(),
      );
      const contract = source
        .all("SR2026")
        .find((candidate) => candidate.messageType === messageType)!;

      expect(contract.messageFamily).toBe("MT347");
      expect(contract.display).toMatchObject({ familyCode, categoryLabel });
      expect(contract.display.familyLabel).not.toBe("MT347");
    },
  );

  it("orders every lookup after all of its declared dependency fields", () => {
    const source = new MappingResolutionPageDefinitionSource(
      new MappingCatalogueService(),
    );

    for (const definition of source.all("SR2026")) {
      const fieldsById = new Map(
        definition.fields.map((field) => [field.fieldId, field]),
      );
      for (const field of definition.fields) {
        for (const dependencyId of field.lookup?.dependency
          ?.dependsOnFieldIds ?? []) {
          expect(fieldsById.get(dependencyId)?.displayOrder).toBeLessThan(
            field.displayOrder!,
          );
        }
      }
    }

    const mt300 = source
      .all("SR2026")
      .find((definition) => definition.messageType === "MT300")!;
    expect(
      mt300.fields
        .filter(({ fieldId }) => fieldId.startsWith("context."))
        .sort((left, right) => left.displayOrder! - right.displayOrder!)
        .map(({ fieldId }) => fieldId),
    ).toEqual([
      "context.transactionReference",
      "context.currency",
      "context.bookingEntity",
      "context.valueDate",
      "context.counterpartyBankServiceId",
    ]);
  });

  it("publishes exact server-governed fixture identities without role-subset inference", () => {
    const source = new MappingResolutionPageDefinitionSource(catalogues, {
      catalogue: () => [
        {
          bindingId: "FIX-MT399-Q9-001@v1",
          messageType: "MT399",
          businessFunction: "FUTURE_GOVERNED_FUNCTION",
          sequence: "Q9",
          settlementLeg: "Future settlement leg",
        },
      ],
    } as never);

    expect(source.all()[0]!.scenarios[0]!.fixture.bindingId).toBe(
      "FIX-MT399-Q9-001@v1",
    );
  });

  it("falls back to fixture candidates when a governed profile has no scenario", () => {
    const candidate = {
      bindingId: "FIX-MT399-Q9-001@v1",
      messageType: "MT399",
      businessFunction: "FUTURE_GOVERNED_FUNCTION",
      sequence: "Q9",
      settlementLeg: "Future settlement leg",
    };
    const indexCatalogue = jest.fn(() => [candidate]);
    const indexCurrencyProjection = jest.fn(() => []);
    const source = new MappingResolutionPageDefinitionSource(
      catalogues,
      { indexCatalogue, indexCurrencyProjection } as never,
      {
        get: () => ({
          definitions: [{
            profileId: "P-MT399-Q9",
            messageType: "MT399",
            sequence: "Q9",
            settlementLeg: "Future settlement leg",
          }],
          scenarios: [],
          inputs: [],
          crossTagConstraints: [],
        }),
      } as never,
      new ResolutionPageFixtureManifestService(),
    );

    expect(source.all()[0]!.scenarios[0]!.fixture.bindingId).toBe(
      candidate.bindingId,
    );
    expect(indexCatalogue).toHaveBeenCalledTimes(1);
    expect(indexCurrencyProjection).not.toHaveBeenCalled();
  });

  it("builds governed Treasury and Trade Finance indexes without reading operational fixtures", () => {
    const policy = new PageParameterEnvironmentPolicy("QA");
    const catalogue = jest.fn(() => {
      throw new Error("INDEX_MUST_NOT_READ_DB_FIXTURE");
    });
    const indexCatalogue = jest.fn(() => {
      throw new Error("INDEX_MUST_NOT_READ_FULL_FIXTURE_CANDIDATES");
    });
    const indexCurrencyProjection = jest.fn(() => []);
    const source = new MappingResolutionPageDefinitionSource(
      new MappingCatalogueService(),
      { catalogue, indexCatalogue, indexCurrencyProjection } as never,
      new ResolutionPageScenarioCatalogueService(policy),
      new ResolutionPageFixtureManifestService(),
    );
    const service = new ResolutionPageAggregationService(source, policy);

    const treasury = service.index("SR2026", "TREASURY");
    const tradeFinance = service.index("SR2026", "TRADE_FINANCE");

    expect(treasury.items.length).toBeGreaterThan(0);
    expect(tradeFinance.items.length).toBeGreaterThan(0);
    expect(catalogue).not.toHaveBeenCalled();
    expect(indexCatalogue).not.toHaveBeenCalled();
    expect(indexCurrencyProjection).toHaveBeenCalledTimes(1);
    for (const item of [...treasury.items, ...tradeFinance.items])
      expect(service.get(item.query).contractSha256).toBe(item.contractSha256);
  });

  it("loads the governed 362-case catalogue without embedding scenarios in mapping rows", () => {
    const policy = new PageParameterEnvironmentPolicy("QA");
    const source = new MappingResolutionPageDefinitionSource(
      new MappingCatalogueService(),
      undefined,
      new ResolutionPageScenarioCatalogueService(policy),
      new ResolutionPageFixtureManifestService(),
      {
        firstAvailableDate: () => "2026-09-14",
        metadata: () => ({
          timeZone: "Asia/Hong_Kong",
          calendarMode: "WEEKDAY_FALLBACK",
          calendarCode: "WEEKDAY_ONLY",
          holidayIntegrationStatus: "NOT_EVALUATED",
          sourceContract: {
            method: "POST",
            path: "/business-days/add",
            endpointEnvironmentVariable: "BUSINESS_DAYS_SERVICE_ENDPOINT",
          },
        }),
      } as never,
    );
    const service = new ResolutionPageAggregationService(source, policy);
    const index = service.index("SR2026");
    const definitions = source.all("SR2026");

    const mt752 = definitions.find(
      ({ messageType }) => messageType === "MT752",
    )!;
    const mt752Clearing = mt752.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT752-005",
    )!;
    const senderPartyIdentifier = mt752.fields.find(
      ({ fieldId }) =>
        fieldId === "context.senders_correspondentPartyIdentifier" &&
        mt752Clearing.fieldIds.includes(fieldId),
    );
    expect(senderPartyIdentifier).toMatchObject({
      path: "rolePartyIdentifiers.SENDERS_CORRESPONDENT",
      officialRole: "SENDERS_CORRESPONDENT",
    });

    expect(index.items).toHaveLength(55);
    expect(index.pagination).toEqual({
      mode: "PAGE_BY_PAGE",
      defaultPageSize: 10,
      maxPageSize: 100,
    });
    expect(definitions.flatMap(({ scenarios }) => scenarios)).toHaveLength(361);
    expect(
      new Set(
        definitions.flatMap(({ scenarios }) =>
          scenarios.map(({ fixture }) => fixture.bindingId),
        ),
      ).size,
    ).toBe(361);
    for (const item of index.items)
      expect(service.get(item.query).contractSha256).toBe(item.contractSha256);
    const treasury = service.index("SR2026", "TREASURY");
    const tradeFinance = service.index("SR2026", "TRADE_FINANCE");
    expect(treasury.items.length + tradeFinance.items.length).toBe(55);
    expect(
      treasury.items.every(
        ({ businessDomain }) => businessDomain === "TREASURY",
      ),
    ).toBe(true);
    expect(
      tradeFinance.items.every(
        ({ businessDomain }) => businessDomain === "TRADE_FINANCE",
      ),
    ).toBe(true);
    expect(
      treasury.items.every(({ query }) => query.businessDomain === "TREASURY"),
    ).toBe(true);
    const mt742 = definitions.find(
      ({ messageType }) => messageType === "MT742",
    )!;
    const mt742Scenario = mt742.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT742-006",
    )!;
    expect(
      mt742.fields.find(
        ({ fieldId, lookup }) =>
          mt742Scenario.fieldIds.includes(fieldId) &&
          lookup?.targetRole === "BENEFICIARY_BANK",
      ),
    ).toBeDefined();
    const mt400 = definitions.find(
      ({ messageType }) => messageType === "MT400",
    )!;
    const mt400Scenario = mt400.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT400-001",
    )!;
    const mt400UserFields = mt400.fields.filter((field) =>
      mt400Scenario.fieldPolicies?.some(
        (policy) =>
          policy.fieldId === field.fieldId &&
          policy.visibility === "USER_INPUT",
      ),
    );
    expect(mt400UserFields.filter(({ lookup }) => lookup?.targetRole)).toEqual([
      expect.objectContaining({
        swiftTag: "58",
        officialRole: "Beneficiary Bank",
        lookup: expect.objectContaining({ targetRole: "BENEFICIARY_BANK" }),
      }),
    ]);
    expect(
      mt400Scenario.fieldPolicies?.find(
        ({ fieldId }) => fieldId === "MESSAGE.58.bankServiceId",
      ),
    ).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "TRANSACTION_USER",
      visibility: "USER_INPUT",
      required: true,
      readOnly: false,
    });
    expect(
      mt400Scenario.inputValues?.["MESSAGE.53.bankServiceId"],
    ).toBeUndefined();
    expect(
      mt400Scenario.inputValues?.["MESSAGE.54.bankServiceId"],
    ).toBeUndefined();
    for (const [messageType, expectedRoles] of [
      ["MT400", ["BENEFICIARY_BANK"]],
      ["MT742", ["BENEFICIARY_BANK"]],
      ["MT754", ["REIMBURSING_BANK", "BENEFICIARY_BANK"]],
    ] as const) {
      const contract = definitions.find(
        (definition) => definition.messageType === messageType,
      )!;
      const governedInputs = contract.fields.filter(({ lookup }) =>
        expectedRoles.some((role) => role === lookup?.targetRole),
      );
      expect(
        governedInputs.map(({ lookup }) => lookup!.targetRole).sort(),
      ).toEqual([...expectedRoles].sort());
    }
    for (const [messageType, scenarioId, targetRole] of [
      ["MT400", "MT400-001", "BENEFICIARY_BANK"],
      ["MT742", "MT742-006", "BENEFICIARY_BANK"],
      ["MT742", "MT742-013", "BENEFICIARY_BANK"],
      ["MT754", "MT754-005", "REIMBURSING_BANK"],
      ["MT754", "MT754-011", "BENEFICIARY_BANK"],
      ["MT754", "MT754-013", "BENEFICIARY_BANK"],
    ] as const) {
      const contract = definitions.find(
        (definition) => definition.messageType === messageType,
      )!;
      const field = contract.fields.find(
        ({ lookup }) => lookup?.targetRole === targetRole,
      )!;
      const scenario = contract.scenarios.find(
        (candidate) => candidate.scenarioId === scenarioId,
      )!;
      expect(
        scenario.fieldPolicies?.find(
          ({ fieldId }) => fieldId === field.fieldId,
        ),
      ).toMatchObject({
        applicability: "APPLICABLE",
        inputOwnership: "TRANSACTION_USER",
        visibility: "USER_INPUT",
        required: true,
        readOnly: false,
      });
    }
    const mt754Collision = definitions
      .find(({ messageType }) => messageType === "MT754")!
      .scenarios.find(({ scenarioId }) => scenarioId === "MT754-007")!;
    expect(
      mt754Collision.fieldPolicies?.filter(
        ({ fieldId, visibility }) =>
          visibility === "USER_INPUT" &&
          [
            "context.reimbursingBankServiceId",
            "context.beneficiaryBankServiceId",
          ].includes(fieldId),
      ),
    ).toEqual([]);
    for (const contract of definitions) {
      const roleFieldIds = contract.fields
        .filter(({ lookup }) => lookup?.targetRole)
        .map(({ fieldId }) => fieldId);
      const counterparty = contract.fields.find(
        ({ fieldId }) => fieldId === "context.counterpartyBankServiceId",
      );
      const currency = contract.fields.find(
        ({ fieldId }) => fieldId === "context.currency",
      );
      expect(counterparty?.lookup?.dependency?.invalidatesFieldIds).toEqual(
        roleFieldIds,
      );
      expect(currency?.optionSource?.invalidatesFieldIds).toEqual([
        "context.counterpartyBankServiceId",
        ...roleFieldIds,
      ]);
      expect(
        currency?.optionSource?.invalidatesFieldIds.every((fieldId) =>
          contract.fields.some((field) => field.fieldId === fieldId),
        ),
      ).toBe(true);
      for (const configuredScenario of contract.scenarios) {
        for (const [fieldId, value] of Object.entries(
          configuredScenario.inputValues ?? {},
        )) {
          const field = contract.fields.find(
            (item) => item.fieldId === fieldId,
          )!;
          if (field.dataType === "SWIFT_BIC")
            expect(String(value)).toMatch(/^BANK-SVC-[A-Z0-9-]+$/);
        }
      }
    }
    const clearing = definitions
      .flatMap(({ scenarios }) => scenarios)
      .find(({ scenarioId }) => scenarioId === "MT300-016")!;
    const clearingPolicy = clearing.fieldPolicies?.find(({ fieldId }) =>
      fieldId.includes("PartyIdentifier"),
    );
    expect(clearingPolicy).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "SSI_DERIVED",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "APPLY",
      readOnly: true,
    });
    expect(clearing.inputValues).not.toHaveProperty(clearingPolicy!.fieldId);
    const account = definitions
      .flatMap(({ scenarios }) => scenarios)
      .find(({ scenarioId }) => scenarioId === "MT742-013")!;
    const accountPolicy = account.fieldPolicies?.find(({ fieldId }) =>
      fieldId.includes("AccountReference"),
    );
    expect(accountPolicy).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "SCENARIO_FIXED",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "APPLY",
      readOnly: true,
    });
    expect(account.inputValues?.[accountPolicy!.fieldId]).toBe(
      "MT347-MT742-013-USD-CREDITED",
    );
    expect(
      treasury.items.every(
        ({ ssiScope, executable, status }) =>
          ssiScope === "IN_SCOPE" && executable && status === "AVAILABLE",
      ),
    ).toBe(true);
    const boundary = tradeFinance.items.find(
      ({ query }) => query.messageType === "MT416",
    )!;
    expect(boundary).toMatchObject({
      transactionDescription: "Advice of Non-Payment / Non-Acceptance",
      scenarioSequence: "MESSAGE",
      ssiScope: "OUT_OF_SCOPE",
      validationOwner: "SSI_FIELD_RESOLUTION_API",
      status: "READ_ONLY_SCOPE_DECISION",
      executable: false,
      actionLabel: "View scope decision",
    });
    const mt785Boundary = tradeFinance.items.find(
      ({ query }) => query.messageType === "MT785",
    )!;
    expect(mt785Boundary).toMatchObject({
      ssiScope: "OUT_OF_SCOPE",
      status: "READ_ONLY_SCOPE_DECISION",
      executable: false,
    });
    const upstreamNvr = definitions
      .flatMap(({ scenarios }) => scenarios)
      .find(({ scenarioId }) => scenarioId === "MT306-006")!;
    expect(upstreamNvr).toMatchObject({
      validation: {
        owner: "UPSTREAM_FIN_VALIDATOR",
        taxonomy: "NETWORK_VALIDATED_RULE",
        nvrOutcome: "NOT_EVALUATED",
      },
      execution: {
        action: "VALIDATE_FIN",
        owner: "UPSTREAM_FIN_VALIDATOR",
      },
    });
    const upstreamScopeRows = definitions
      .flatMap(({ scenarios }) => scenarios)
      .filter(
        ({ validation }) => validation.owner === "UPSTREAM_FIN_VALIDATOR",
      );
    expect(upstreamScopeRows).toHaveLength(41);
    expect(
      upstreamScopeRows.every(
        ({ execution }) =>
          execution.action === "VALIDATE_FIN" &&
          execution.owner === "UPSTREAM_FIN_VALIDATOR" &&
          execution.expectedHttp.join(",") === "200",
      ),
    ).toBe(true);
    const mt742CrossField = definitions
      .flatMap(({ scenarios }) => scenarios)
      .find(({ scenarioId }) => scenarioId === "MT742-007")!;
    expect(mt742CrossField.inputValues).toMatchObject({
      "context.receiverDirectlyServicesBeneficiaryBranchAccount": true,
      "context.MESSAGE.tag.57A.present": true,
      "context.MESSAGE.tag.58A.present": true,
    });
    const mt300 = definitions.find(
      ({ messageType, sequences }) =>
        messageType === "MT300" && sequences[0]?.sequenceId === "B1",
    )!;
    const firstScenario = mt300.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT300-001",
    )!;
    expect(firstScenario.label).toBe(
      "B1 - Amount Bought / direct canonical route",
    );
    expect(firstScenario.inputValues).toMatchObject({
      "context.currency": "USD",
      "context.bookingEntity": "HK01",
      "context.counterpartyBankServiceId": "BANK-SVC-DEUTDEFF",
    });
    expect(
      mt300.fields.filter(
        ({ lookup }) => lookup?.targetRole === "DELIVERY_AGENT",
      ),
    ).toHaveLength(1);
    expect(
      mt300.fields.find(({ lookup }) => lookup?.targetRole === "DELIVERY_AGENT")
        ?.label,
    ).toBe("Delivery Agent");
    expect(
      mt300.fields.some(
        ({ fieldId }) => fieldId === "context.senderCorrespondentBankServiceId",
      ),
    ).toBe(false);
    const directPolicies = new Map(
      firstScenario.fieldPolicies?.map((policy) => [policy.fieldId, policy]),
    );
    const delivery = mt300.fields.find(
      ({ lookup }) => lookup?.targetRole === "DELIVERY_AGENT",
    )!;
    const intermediary = mt300.fields.find(
      ({ lookup }) => lookup?.targetRole === "INTERMEDIARY_INSTITUTION",
    )!;
    const receiving = mt300.fields.find(
      ({ lookup }) => lookup?.targetRole === "RECEIVING_AGENT",
    )!;
    const roleBankServiceFieldIds = [
      delivery.fieldId,
      intermediary.fieldId,
      receiving.fieldId,
    ];
    expect(
      directPolicies.get("context.counterpartyBankServiceId"),
    ).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "TRANSACTION_USER",
      visibility: "USER_INPUT",
      processingPolicy: "APPLY",
      required: true,
      readOnly: false,
    });
    expect(
      mt300.fields.find(
        ({ fieldId }) => fieldId === "context.counterpartyBankServiceId",
      ),
    ).toMatchObject({
      lookup: {
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        buttonLabel: "Select from SSI",
        selectedButtonLabel: "Change",
        emptyResultCode: "NO_VALID_SSI_COUNTERPARTY",
        dependency: {
          invalidatesFieldIds: expect.arrayContaining(roleBankServiceFieldIds),
        },
      },
    });
    expect(
      mt300.fields.find(
        ({ fieldId }) => fieldId === "context.counterpartyBankServiceId",
      )?.lookup?.dependency?.invalidatesFieldIds,
    ).not.toContain("context.receivingBankServiceId");
    expect(
      mt300.fields.find(({ fieldId }) => fieldId === "context.currency"),
    ).toMatchObject({
      control: "SELECT",
      options: [{ value: "USD", label: "USD" }],
      optionSource: {
        source: "GOVERNED_APPLICABILITY",
        selectionPolicy: "SINGLE_VALUE_RESTRICTED",
        invalidatesFieldIds: expect.arrayContaining([
          "context.counterpartyBankServiceId",
          ...roleBankServiceFieldIds,
        ]),
      },
    });
    const valueDate = mt300.fields.find(
      ({ fieldId }) => fieldId === "context.valueDate",
    )!;
    expect(valueDate).toMatchObject({ control: "DATE", required: true });
    expect(valueDate.defaultValue).toBe("2026-09-14");
    expect(valueDate.businessDate).toEqual({
      timeZone: "Asia/Hong_Kong",
      calendarMode: "WEEKDAY_FALLBACK",
      calendarCode: "WEEKDAY_ONLY",
      holidayIntegrationStatus: "NOT_EVALUATED",
      sourceContract: {
        method: "POST",
        path: "/business-days/add",
        endpointEnvironmentVariable: "BUSINESS_DAYS_SERVICE_ENDPOINT",
      },
    });
    expect(
      new Set(
        definitions.map(
          ({ fields }) =>
            fields.find(({ fieldId }) => fieldId === "context.valueDate")
              ?.defaultValue,
        ),
      ),
    ).toEqual(new Set(["2026-09-14"]));
    expect(directPolicies.get(delivery.fieldId)).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "SSI_DERIVED",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "APPLY",
      required: false,
      readOnly: true,
    });
    expect(directPolicies.get(intermediary.fieldId)).toMatchObject({
      applicability: "NOT_APPLICABLE",
      inputOwnership: "SSI_DERIVED",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "IGNORE_AUDIT",
      required: false,
      readOnly: true,
    });
    expect(directPolicies.get(receiving.fieldId)).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "SSI_DERIVED",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "APPLY",
      required: false,
      readOnly: true,
    });
    expect(firstScenario.inputValues?.[delivery.fieldId]).toBeUndefined();
    expect(firstScenario.inputValues?.[receiving.fieldId]).toBeUndefined();

    const intermediaryScenario = mt300.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT300-002",
    )!;
    const intermediaryPolicies = new Map(
      intermediaryScenario.fieldPolicies?.map((policy) => [
        policy.fieldId,
        policy,
      ]),
    );
    expect(intermediaryPolicies.get(intermediary.fieldId)).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "SSI_DERIVED",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "APPLY",
      readOnly: true,
    });
    expect(
      intermediaryScenario.inputValues?.[intermediary.fieldId],
    ).toBeUndefined();
    const sold = definitions.find(
      ({ messageType, sequences }) =>
        messageType === "MT300" && sequences[0]?.sequenceId === "B2",
    )!;
    const soldDirect = sold.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT300-006",
    )!;
    const beneficiary = sold.fields.find(
      ({ lookup }) => lookup?.targetRole === "BENEFICIARY_INSTITUTION",
    )!;
    expect(beneficiary).toMatchObject({
      label: "Beneficiary Institution",
      officialRole: "BENEFICIARY_INSTITUTION",
      swiftTag: "58",
    });
    expect(
      soldDirect.fieldPolicies?.find(
        ({ fieldId }) => fieldId === beneficiary.fieldId,
      ),
    ).toMatchObject({
      applicability: "APPLICABLE",
      inputOwnership: "TRANSACTION_USER",
      visibility: "USER_INPUT",
      processingPolicy: "APPLY",
      required: true,
      readOnly: false,
    });
    const oasPolicies = new ResolutionPageOasFieldPolicyService();
    for (const contract of definitions) {
      for (const configuredScenario of contract.scenarios) {
        expect(
          configuredScenario.fieldPolicies?.map(({ fieldId }) => fieldId),
        ).toEqual(configuredScenario.fieldIds);
        for (const policy of configuredScenario.fieldPolicies ?? []) {
          const field = contract.fields.find(
            ({ fieldId }) => fieldId === policy.fieldId,
          )!;
          if (
            policy.visibility === "USER_INPUT" &&
            field.section === "SETTLEMENT_INSTRUCTIONS"
          ) {
            if (!field.swiftTag) {
              throw new Error(
                `Visible settlement input is missing SWIFT metadata: ${contract.messageType}/${configuredScenario.scenarioId}/${field.fieldId}`,
              );
            }
            expect(field.swiftTag).toMatch(/^\d{2}$/);
            if (field.swiftOption) expect(field.swiftOption).toMatch(/^[A-Z]$/);
          }
          const governedPolicy = oasPolicies.resolve(
            contract.messageType,
            field,
          );
          if (governedPolicy && policy.applicability === "APPLICABLE") {
            expect(policy.inputOwnership).toBe(governedPolicy.inputOwnership);
            expect(policy.visibility).toBe(governedPolicy.visibility);
            expect(policy.processingPolicy).toBe(
              governedPolicy.processingPolicy,
            );
            expect(policy.readOnly).toBe(
              governedPolicy.inputOwnership !== "TRANSACTION_USER",
            );
          }
        }
      }
    }
  });

  it("publishes one resolved page size for both message and scenario indexes", () => {
    const pagination = new IndexPaginationPolicy("17");
    const scenarioIndex = new ResolutionPageAggregationService(
      new MappingResolutionPageDefinitionSource(new MappingCatalogueService()),
      new PageParameterEnvironmentPolicy("DEMO"),
      pagination,
    ).index("SR2026");
    const messageIndex = new PaymentMessageIndexService(pagination).getIndex();

    expect(scenarioIndex.pagination.defaultPageSize).toBe(17);
    expect(messageIndex.pagination?.defaultPageSize).toBe(17);
    expect(messageIndex.pagination).toEqual(scenarioIndex.pagination);
  });
});
