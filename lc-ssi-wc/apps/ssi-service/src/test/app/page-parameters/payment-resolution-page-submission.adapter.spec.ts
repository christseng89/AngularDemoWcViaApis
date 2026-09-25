import { BadRequestException, HttpException } from "@nestjs/common";
import type {
  ResolutionPageDefinition,
  ResolutionPageScenario,
  ResolutionPageSubmission,
} from "@ssi/contracts";
import { PaymentResolutionPageDefinitionSource } from "../../../app/page-parameters/payment-resolution-page-definition.source";
import {
  PaymentResolutionPageSubmissionAdapter,
  type PaymentSettlementResolutionPort,
} from "../../../app/page-parameters/payment-resolution-page-submission.adapter";

const SHA = "a".repeat(64);

const definitionFor = (messageType: string): ResolutionPageDefinition =>
  new PaymentResolutionPageDefinitionSource()
    .all("SR2026")
    .find((definition) => definition.messageType === messageType)!;

const scenarioFor = (
  definition: ResolutionPageDefinition,
  scenarioId: string,
): ResolutionPageScenario =>
  definition.scenarios.find((scenario) => scenario.scenarioId === scenarioId)!;

const submissionFor = (
  definition: ResolutionPageDefinition,
  scenario: ResolutionPageScenario,
  values: ResolutionPageSubmission["values"] = {},
): ResolutionPageSubmission => ({
  definitionId: definition.definitionId,
  definitionVersion: definition.definitionVersion,
  scenarioId: scenario.scenarioId,
  fixtureBindingId: scenario.fixture.bindingId,
  contractSha256: SHA,
  values: {
    "context.transactionReference": "PAYMENT-TX-001",
    "context.currency": "USD",
    "context.bookingEntity": "HK01",
    "context.valueDate": "2026-09-14",
    "context.amount": "1000.00",
    "context.counterpartyBankServiceId": "BANK-SVC-DEUTDEFF",
    ...(definition.messageType.endsWith("COV")
      ? {
          "context.swift21NONE": "RELATED-REF-001",
          "context.swift32A": "260914USD1000,00",
          "context.swift119NONE": "COV",
          "context.swift121NONE": "123e4567-e89b-42d3-a456-426614174000",
          "context.sequenceB50A": "ORDERING-CUSTOMER",
          "context.sequenceB59": "BENEFICIARY-CUSTOMER",
          ...(definition.messageType === "MT205COV"
            ? {
                "context.previousMessageType": "MT202COV",
                "context.previousMessage20": "PREVIOUS-TX-001",
                "context.previousMessage21": "PREVIOUS-RELATED-001",
                "context.previousMessage121":
                  "8ec66d20-3450-4f31-9f68-d16e911c515c",
                "context.previousMessageA52": "CITIUS33",
                "context.previousMessageA58": "DEUTDEFF",
                "context.previousMessageSequenceB50A":
                  "PREVIOUS-ORDERING-CUSTOMER",
                "context.previousMessageSequenceB59":
                  "PREVIOUS-BENEFICIARY-CUSTOMER",
                "context.previousMessageArtifactSha256": "b".repeat(64),
                "context.previousMessageArtifactVersion": "SR2026-MT202COV-V1",
              }
            : {}),
        }
      : {}),
    ...values,
  },
});

const successfulEnvelope = (tags: Readonly<Record<string, string>>) => ({
  mx: {
    httpStatus: 200,
    decision: "RESOLVED",
    code: "SSI_RESOLVED",
    payloadGenerated: false,
    messageDefinitionId: "pacs.009.001.08",
    businessService: "swift.cbprplus.04",
    canonicalRoles: { debtorAgent: "CITIUS33", creditorAgent: "DEUTDEFF" },
  },
  mt: { tags, omitted: [] },
  chosenRoute: {
    ssiId: "SSI-PAYMENT-001",
    ssiVersion: 3,
    applicabilityId: "APP-PAYMENT-001",
    applicabilityVersion: 2,
  },
  fieldProvenance: {
    "53A": { source: "OWN_NOSTRO", evidenceId: "NOSTRO-001" },
    "58A": { source: "TRANSACTION_CONTEXT", evidenceId: "DEUTDEFF" },
  },
});

describe("PaymentResolutionPageSubmissionAdapter", () => {
  const banks = {
    resolve: jest.fn((bankServiceId: string) => ({
      bankServiceId,
      bic: bankServiceId.replace("BANK-SVC-", ""),
      name: "Governed bank",
      country: bankServiceId.includes("DEUT") ? "DE" : "US",
    })),
    search: jest.fn((bic: string) => [
      {
        bankServiceId: `BANK-SVC-${bic}`,
        bic,
        name: "Governed bank",
        country: bic.slice(4, 6),
      },
    ]),
  };

  const defaultResponse = successfulEnvelope({
    "53A": "CITIUS33",
    "58A": "DEUTDEFF",
  });

  const harness = (...responses: unknown[]) => {
    const response = responses.length > 0 ? responses[0] : defaultResponse;
    const resolver: PaymentSettlementResolutionPort = {
      resolve: jest.fn(() => response),
    };
    return {
      resolver,
      adapter: new PaymentResolutionPageSubmissionAdapter(
        resolver,
        banks as never,
        {
          list: jest.fn(() => [
            {
              id: "NOSTRO-MT347-CONTAMINATION",
              version: 1,
              status: "ACTIVE",
              purpose: "SETTLEMENT",
              currency: "USD",
              ownLegalEntityId: "HK01",
              allowedBookingEntities: ["HK01"],
              validFrom: "2026-01-01",
              validTo: "2026-12-31",
              priority: 0,
              accountServicerBic: "CITIUS33",
              accountReference: "MT347-SHOULD-NOT-BE-USED-BY-MT2",
              fixtureFamily: "MT347-SR2026-SSI",
            },
            {
              id: "NOSTRO-DEBIT",
              version: 4,
              status: "ACTIVE",
              purpose: "SETTLEMENT",
              currency: "USD",
              ownLegalEntityId: "HK01",
              allowedBookingEntities: ["HK01"],
              validFrom: "2026-01-01",
              validTo: "2026-12-31",
              priority: 1,
              accountServicerBic: "CITIUS33",
              accountReference: "OWN-DEBIT",
            },
            {
              id: "NOSTRO-CREDIT-SAME-RECEIVER",
              version: 7,
              status: "ACTIVE",
              purpose: "SETTLEMENT",
              currency: "USD",
              ownLegalEntityId: "HK01",
              allowedBookingEntities: ["ANY"],
              validFrom: "2026-01-01",
              validTo: "2026-12-31",
              priority: 2,
              accountServicerBic: "CITIUS33",
              accountReference: "OWN-CREDIT-SAME",
            },
            {
              id: "NOSTRO-CREDIT-OTHER-RECEIVER",
              version: 8,
              status: "ACTIVE",
              purpose: "SETTLEMENT",
              currency: "USD",
              ownLegalEntityId: "HK01",
              allowedBookingEntities: ["HK01"],
              validFrom: "2026-01-01",
              validTo: "2026-12-31",
              priority: 3,
              accountServicerBic: "DEUTDEFF",
              accountReference: "OWN-CREDIT-OTHER",
            },
          ]),
        } as never,
        {
          list: jest.fn(() => [
            {
              id: "ENTITY-HK01",
              version: 1,
              status: "ACTIVE",
              branchCode: "HK01",
              countryCode: "DE",
              validFrom: "2026-01-01",
              validTo: "2026-12-31",
            },
          ]),
        } as never,
      ),
    };
  };

  it("translates a plain MT202 submission into the existing settlement resolver contract", () => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    const context = harness();

    const result = context.adapter.execute({
      definition,
      scenario,
      submission: submissionFor(definition, scenario),
    });

    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessageType: "MT202",
        profileId: "MT2-MT202-PLAIN-SR2026",
        pairedEvidenceProfileId: "PACS009-PLAIN-SR2026",
        paymentDirection: "OUTWARD",
        localBankRole: "INSTRUCTING_AGENT",
        messageType: "pacs.009.001.08",
        businessService: "swift.cbprplus.04",
        businessFunction: "INTERBANK_TRANSFER",
        counterpartyBankServiceId: "BANK-SVC-DEUTDEFF",
        transactionReference: "PAYMENT-TX-001",
        currency: "USD",
        bookingEntity: "HK01",
        valueDate: "2026-09-14",
      }),
    );
    expect(result).toMatchObject({
      outcome: "RESOLVED",
      payloadGenerated: false,
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      nvrOutcome: "PASS",
      outputs: [
        {
          outputId: "swift-mt",
          format: "SWIFT_MT",
          label: "MT202",
          messageIdentity: "MT202",
          mediaType: "application/json",
          document: {
            tags: { "53A": "CITIUS33", "58A": "DEUTDEFF" },
          },
        },
        {
          outputId: "iso-20022",
          format: "ISO_20022",
          label: "pacs.009.001.08",
          messageIdentity: "pacs.009.001.08",
          mediaType: "application/json",
          document: expect.objectContaining({
            messageDefinitionId: "pacs.009.001.08",
            businessService: "swift.cbprplus.04",
            payloadGenerated: false,
            canonicalRoles: {
              debtorAgent: "CITIUS33",
              creditorAgent: "DEUTDEFF",
            },
          }),
        },
      ],
      fields: expect.arrayContaining([
        expect.objectContaining({
          sequenceId: "A",
          swiftTag: "53",
          swiftOption: "A",
          value: "CITIUS33",
          resolutionStatus: "RESOLVED",
        }),
        expect.objectContaining({
          sequenceId: "A",
          swiftTag: "58",
          swiftOption: "A",
          value: "DEUTDEFF",
          resolutionStatus: "RESOLVED",
        }),
      ]),
      evidence: {
        selectedSsi: { id: "SSI-PAYMENT-001", version: 3 },
        selectedApplicability: { id: "APP-PAYMENT-001", version: 2 },
      },
    });
  });

  it.each([
    ["MT202", "MT202-OP-DIRECT"],
    ["MT202COV", "MT202COV-OP-STANDARD"],
    ["MT205", "MT205-OP-STANDARD-DOMESTIC-ONWARD"],
    ["MT205COV", "MT205COV-OP-CONTINUATION"],
  ])(
    "returns MT and pacs.009 representations for %s from one resolver result",
    (messageType, scenarioId) => {
      const definition = definitionFor(messageType);
      const scenario = scenarioFor(definition, scenarioId);
      const context = harness();

      const result = context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      });

      expect(result.outputs.map(({ format }) => format)).toEqual([
        "SWIFT_MT",
        "ISO_20022",
      ]);
      expect(result.outputs[0]).toMatchObject({
        label: messageType,
        messageIdentity: messageType,
      });
      expect(result.outputs[1]).toMatchObject({
        label: "pacs.009.001.08",
        messageIdentity: "pacs.009.001.08",
      });
      expect(context.resolver.resolve).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps COV Sequence B customer data out of SSI evidence", () => {
    const definition = definitionFor("MT202COV");
    const scenario = scenarioFor(definition, "MT202COV-OP-STANDARD");
    const context = harness(
      successfulEnvelope({
        "A.53A": "CITIUS33",
        "A.58A": "DEUTDEFF",
        "B.50K": "ORDERING CUSTOMER",
        "B.59": "BENEFICIARY CUSTOMER",
      }),
    );

    const result = context.adapter.execute({
      definition,
      scenario,
      submission: submissionFor(definition, scenario),
    });

    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessageType: "MT202COV",
        businessService: "swift.cbprplus.cov.04",
        field32A: "260914USD1000,00",
      }),
    );
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequenceId: "A", swiftTag: "58" }),
      ]),
    );
    expect(result.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sequenceId: "B" })]),
    );
    expect(JSON.stringify(result.outputs)).not.toContain("ORDERING CUSTOMER");
    expect(JSON.stringify(result.outputs)).not.toContain(
      "BENEFICIARY CUSTOMER",
    );
  });

  it("passes the selected COV SSI identity to the resolver", () => {
    const definition = definitionFor("MT202COV");
    const scenario = scenarioFor(definition, "MT202COV-OP-STANDARD");
    const context = harness({
      ...defaultResponse,
      chosenRoute: {
        ...defaultResponse.chosenRoute,
        nostroId: "NOSTRO-PAYMENT-001",
        nostroVersion: 1,
        accountId: "DEMO-NOSTRO-USD-001",
        rmaId: "RMA-PAYMENT-001",
        rmaVersion: 1,
        rmaDecisionId: "RMA-DECISION-001",
        actualReceiverBic: "CITIUS33",
        executionTransport: "FINPLUS",
        settlementMethod: "INDA",
        topologyRulingId: "BA-TOPOLOGY-INDA-INGA-001",
        topologyRulingVersion: "1.0.0",
        routeBindingId: SHA,
        contextSnapshotId: SHA,
      },
    });
    const submission = {
      ...submissionFor(definition, scenario),
      eligibilitySnapshot: {
        snapshotId: "database-snapshot-1",
        snapshotIdentityMethod: "SQLITE_LOGICAL_V1",
        contextSha256: "b".repeat(64),
      },
      selectedRouteIdentity: {
        routeId: SHA,
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        fixtureBindingId: scenario.fixture.bindingId,
        contextSha256: SHA,
        ssi: { id: "SSI-PAYMENT-001", version: 3 },
        applicability: { id: "APP-PAYMENT-001", version: 2 },
        nostro: { id: "NOSTRO-PAYMENT-001", version: 1 },
        rma: {
          id: "RMA-PAYMENT-001",
          version: 1,
          decisionId: "RMA-DISCOVERY-001",
        },
      },
    };

    const result = context.adapter.execute({
      definition,
      scenario,
      submission,
    });

    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedSsiId: "SSI-PAYMENT-001",
        selectedSsiVersion: 3,
      }),
    );
    expect(result).toMatchObject({
      profileKind: "SSI_RESOLUTION_ONLY",
      paymentExecutable: false,
      payloadGenerated: false,
      routeBindingId: SHA,
      contextSnapshotId: SHA,
      rmaAuthorizationDecisionId: "RMA-DECISION-001",
      settlementRoute: expect.objectContaining({
        routeBindingId: SHA,
        settlementMethod: "INDA",
      }),
      evidenceCards: [
        expect.objectContaining({
          format: "SWIFT_MT",
          evidenceProjections: expect.arrayContaining([
            expect.objectContaining({
              classification: "OMITTED_BY_RULE",
              decisionRuleId: "POL-MT2-PROFILE-OPTION-001",
            }),
          ]),
        }),
        expect.objectContaining({
          format: "ISO_20022",
          evidenceProjections: expect.arrayContaining([
            expect.objectContaining({
              mappingRuleId: "MAP-MT2-STTLMMTD-002",
            }),
          ]),
        }),
      ],
    });
  });

  it("rejects a resolver route that differs from the selected complete route", () => {
    const definition = definitionFor("MT202COV");
    const scenario = scenarioFor(definition, "MT202COV-OP-STANDARD");
    const context = harness();
    const selectedRouteIdentity = {
      routeId: SHA,
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      fixtureBindingId: scenario.fixture.bindingId,
      contextSha256: SHA,
      ssi: { id: "OTHER-SSI", version: 3 },
      applicability: { id: "APP-PAYMENT-001", version: 2 },
      nostro: { id: "NOSTRO-PAYMENT-001", version: 1 },
      rma: { id: "RMA-PAYMENT-001", version: 1 },
    };

    expect(() =>
      context.adapter.execute({
        definition,
        scenario,
        submission: {
          ...submissionFor(definition, scenario),
          selectedRouteIdentity,
        },
      }),
    ).toThrow();
  });

  it.each([
    ["MT202-OP-BOOK", "BOOK_TRANSFER_SAME_RECEIVER"],
    ["MT202-OP-CREDIT-57A", "CREDIT_ONE_OF_SEVERAL_AT_57A"],
  ])(
    "routes %s through the governed own-account scenario",
    (scenarioId, code) => {
      const definition = definitionFor("MT202");
      const scenario = scenarioFor(definition, scenarioId);
      const context = harness({
        mx: {
          httpStatus: 200,
          decision: "RESOLVED",
          code: "RESOLVED",
          payloadGenerated: false,
          resolutionDomain: "OWN_SSI_NOSTRO",
          canonicalScenario: code,
        },
        mt: { tags: { "53B": "/OWN-DEBIT", "57A": "CITIUS33" }, omitted: [] },
        chosenRoute: null,
      });

      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario, {
          "context.receiverBankServiceId": "BANK-SVC-CITIUS33",
        }),
      });

      expect(context.resolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          scenarioCode: code,
          receiverBankServiceId: "BANK-SVC-CITIUS33",
          ownDebitAccountId: "NOSTRO-DEBIT",
          ownDebitAccountVersion: 4,
          ownCreditAccountId:
            code === "BOOK_TRANSFER_SAME_RECEIVER"
              ? "NOSTRO-CREDIT-SAME-RECEIVER"
              : "NOSTRO-CREDIT-OTHER-RECEIVER",
          ownCreditAccountVersion:
            code === "BOOK_TRANSFER_SAME_RECEIVER" ? 7 : 8,
        }),
      );
    },
  );

  it("supplies governed upstream provenance for the combined MT205 equivalence scenario", () => {
    const definition = definitionFor("MT205");
    const scenario = scenarioFor(
      definition,
      "MT205-OP-INITIAL-MT200-201-EQUIVALENCE",
    );
    const context = harness();

    context.adapter.execute({
      definition,
      scenario,
      submission: submissionFor(definition, scenario, {
        "context.previousMessageType": "MT200",
        "context.previousTransactionReference": "PREVIOUS-REF-001",
      }),
    });

    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        previousMessage: expect.objectContaining({
          type: "MT200",
          "20": "PREVIOUS-REF-001",
        }),
      }),
    );
  });

  it("fails before resolver execution when the OAS profile is not pacs.009.001.08", () => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    const context = harness();

    expect(() =>
      context.adapter.execute({
        definition: {
          ...definition,
          profile: {
            ...definition.profile,
            messageDefinitionId: "pacs.010.001.03",
          },
        },
        scenario,
        submission: submissionFor(definition, scenario),
      }),
    ).toThrow(BadRequestException);
    expect(context.resolver.resolve).not.toHaveBeenCalled();
  });

  it("propagates fail-closed resolver rejection without manufacturing a result", () => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    const resolver: PaymentSettlementResolutionPort = {
      resolve: jest.fn(() => {
        throw new HttpException(
          {
            mx: {
              httpStatus: 422,
              code: "SSI_NOT_FOUND",
              payloadGenerated: false,
            },
          },
          422,
        );
      }),
    };
    const adapter = new PaymentResolutionPageSubmissionAdapter(
      resolver,
      banks as never,
    );

    expect(() =>
      adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      }),
    ).toThrow(HttpException);
  });

  it("hashes the JSON wire representation when a resolver response contains undefined properties", () => {
    const definition = definitionFor("MT202COV");
    const scenario = scenarioFor(definition, "MT202COV-OP-STANDARD");
    const response = {
      ...successfulEnvelope({ "A.58A": "CHASUS33" }),
      mx: {
        ...successfulEnvelope({})["mx"],
        optionalEvidence: undefined,
      },
    };
    const context = harness(response);

    expect(() =>
      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      }),
    ).not.toThrow();
  });

  it.each([undefined, null, "invalid", {}])(
    "fails closed for a malformed resolver response: %p",
    (response) => {
      const definition = definitionFor("MT202");
      const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
      const context = harness(response);

      expect(() =>
        context.adapter.execute({
          definition,
          scenario,
          submission: submissionFor(definition, scenario),
        }),
      ).toThrow(HttpException);
    },
  );

  it("propagates a non-throwing resolver failure envelope as an HTTP rejection", () => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    const context = harness({
      mx: {
        httpStatus: 422,
        code: "SSI_NOT_FOUND",
        payloadGenerated: false,
      },
      mt: { validation: "FAIL", payloadGenerated: false },
    });

    try {
      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(422);
    }
  });

  it.each([["MT205COV-OP-STANDARD", "MT202COV"]])(
    "derives previous-message context for %s",
    (scenarioId, expectedType) => {
      const definition = definitionFor(
        scenarioId.startsWith("MT205COV") ? "MT205COV" : "MT205",
      );
      const baseScenario = definition.scenarios[0]!;
      const scenario = { ...baseScenario, scenarioId };
      const context = harness();

      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      });

      expect(context.resolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          previousMessage: expect.objectContaining({ type: expectedType }),
        }),
      );
    },
  );

  it("adds the governed non-cover predecessor attestation for MT205 standard onward", () => {
    const definition = definitionFor("MT205");
    const scenario = scenarioFor(
      definition,
      "MT205-OP-STANDARD-DOMESTIC-ONWARD",
    );
    const context = harness();

    context.adapter.execute({
      definition,
      scenario,
      submission: submissionFor(definition, scenario),
    });

    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        previousMessage: expect.objectContaining({
          type: "MT202",
          nonCoverAttested: true,
          attestationVersion: "1.0.0",
        }),
      }),
    );
  });

  it("lets the resolver return the Proposal 422 envelope for an incomplete MT205 predecessor", () => {
    const definition = definitionFor("MT205");
    const governedScenario = scenarioFor(
      definition,
      "MT205-OP-STANDARD-DOMESTIC-ONWARD",
    );
    const scenario = { ...governedScenario, inputValues: {} };
    const rejection = {
      httpStatus: 422,
      ssiApplicability: "NOT_EVALUATED",
      resolutionOutcome: "INVALID_UPSTREAM_CONTEXT",
      payloadGenerated: false,
      paymentExecutable: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
    };
    const context = harness(rejection);

    expect(() =>
      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      }),
    ).toThrow(HttpException);
    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        previousMessage: expect.objectContaining({
          type: "MT202",
          artifactSha256: "",
        }),
      }),
    );
    try {
      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      });
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(422);
      expect((error as HttpException).getResponse()).toMatchObject(rejection);
    }
  });

  it("preserves governed-equivalent cover rule provenance for MT205COV", () => {
    const definition = definitionFor("MT205COV");
    const baseScenario = scenarioFor(definition, "MT205COV-OP-CONTINUATION");
    const scenario = {
      ...baseScenario,
      inputValues: {
        ...baseScenario.inputValues,
        "context.previousMessageType": "GOVERNED_EQUIVALENT_COVER",
        "context.equivalentCoverRuleRecordId": "COVER-EQUIVALENCE-001",
        "context.equivalentCoverRuleRecordVersion": "1.0.0",
      },
    };
    const context = harness();
    context.adapter.execute({
      definition,
      scenario,
      submission: submissionFor(definition, scenario),
    });
    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        previousMessage: expect.objectContaining({
          type: "GOVERNED_EQUIVALENT_COVER",
          equivalentCoverRuleRecordId: "COVER-EQUIVALENCE-001",
          equivalentCoverRuleRecordVersion: "1.0.0",
        }),
      }),
    );
  });

  it.each(["MT203", "MT205"])(
    "ignores client-supplied %s predecessor and retains governed provenance",
    (previousType) => {
      const definition = definitionFor("MT205");
      const scenario = scenarioFor(
        definition,
        "MT205-OP-STANDARD-DOMESTIC-ONWARD",
      );
      const context = harness();
      const result = context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario, {
          "context.previousMessageType": previousType,
        }),
      });

      expect(context.resolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          previousMessage: expect.objectContaining({ type: "MT202" }),
        }),
      );
      expect(result.evidence.selectedSsi).toEqual({
        id: "SSI-PAYMENT-001",
        version: 3,
      });
      expect(result.evidence.selectedApplicability).toEqual({
        id: "APP-PAYMENT-001",
        version: 2,
      });
    },
  );

  it("keeps client predecessor changes out of the request audit identity", () => {
    const definition = definitionFor("MT205");
    const scenario = scenarioFor(
      definition,
      "MT205-OP-STANDARD-DOMESTIC-ONWARD",
    );
    const requestHashes = ["MT202", "MT203", "MT205"].map(
      (previousType) =>
        harness().adapter.execute({
          definition,
          scenario,
          submission: submissionFor(definition, scenario, {
            "context.previousMessageType": previousType,
          }),
        }).evidence.requestSha256,
    );

    expect(new Set(requestHashes).size).toBe(1);
  });

  it.each([
    [
      "MT202-QA-C81",
      {
        intermediaryBankServiceId: "BANK-SVC-CITIUS33",
        accountWithBankServiceId: null,
      },
    ],
    ["MT202COV-QA-INCOMPLETE", { coverSequenceB: null }],
    [
      "MT202-QA-CROSS-BORDER-01",
      { senderCountry: "HK", receiverCountry: "US" },
    ],
  ])("adds the governed validation fixture for %s", (scenarioId, expected) => {
    const definition = definitionFor(
      scenarioId.startsWith("MT202COV") ? "MT202COV" : "MT202",
    );
    const fixtureValues = scenarioId.includes("C81")
      ? {
          "fixture.intermediaryBankServiceId": "BANK-SVC-CITIUS33",
          "fixture.accountWithBankMissing": true,
        }
      : scenarioId.includes("INCOMPLETE")
        ? { "fixture.coverSequenceBMissing": true }
        : {
            "fixture.senderCountry": "HK",
            "fixture.receiverCountry": "US",
          };
    const scenario = {
      ...definition.scenarios[0]!,
      scenarioId,
      inputValues: fixtureValues,
    };
    const context = harness();

    context.adapter.execute({
      definition,
      scenario,
      submission: submissionFor(definition, scenario),
    });

    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining(expected),
    );
  });

  it("fails closed when the selected bank has no governed country", () => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    banks.resolve.mockReturnValueOnce({
      bankServiceId: "BANK-SVC-UNKNOWN",
      bic: "UNKNOWNX",
      name: "Unknown",
      country: " ",
    });
    const context = harness();

    expect(() =>
      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario),
      }),
    ).toThrow(BadRequestException);
    expect(context.resolver.resolve).not.toHaveBeenCalled();
  });

  it("fails closed when a required submitted value is blank", () => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    const context = harness();

    expect(() =>
      context.adapter.execute({
        definition,
        scenario,
        submission: submissionFor(definition, scenario, {
          "context.currency": " ",
        }),
      }),
    ).toThrow(BadRequestException);
  });

  it.each([
    { businessDomain: "TREASURY" },
    { messageType: "MT300" },
    {
      profile: {
        messageDefinitionId: "pacs.009.001.08",
        businessService: "wrong",
      },
    },
  ])("rejects an inconsistent payment profile: %p", (override) => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    const context = harness();
    expect(() =>
      context.adapter.execute({
        definition: { ...definition, ...override } as never,
        scenario,
        submission: submissionFor(definition, scenario),
      }),
    ).toThrow(BadRequestException);
  });

  it("uses top-level success evidence and ignores non-FIN tag values", () => {
    const definition = definitionFor("MT202");
    const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
    banks.search.mockReturnValueOnce([
      {
        bankServiceId: "BANK-SVC-CITIUS33",
        bic: "CITIUS33",
        name: "Citibank",
      },
    ]);
    const context = harness({
      httpStatus: 200,
      decision: "RESOLVED",
      code: "SSI_RESOLVED",
      payloadGenerated: false,
      mt: {
        tags: {
          "53A": "/ACCOUNT\nCITIUS33",
          "99A": "NOT-A-SETTLEMENT-TAG",
          "57A": 7,
        },
      },
      chosenRoute: {
        ssiId: "SSI-ALT",
        ssiVersion: 2,
        matchedApplicabilityId: "APP-ALT",
        applicabilityVersion: 4,
      },
      fieldProvenance: { "53A": { evidenceId: "NOSTRO-1" } },
    });

    const result = context.adapter.execute({
      definition,
      scenario,
      submission: submissionFor(definition, scenario),
    });

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({
      institution: {
        bankServiceId: "BANK-SVC-CITIUS33",
        bic: "CITIUS33",
      },
      provenance: { sourceRecordId: "NOSTRO-1" },
    });
    expect(result.evidence.selectedSsi).toEqual({ id: "SSI-ALT", version: 2 });
    expect(result.evidence.selectedApplicability).toEqual({
      id: "APP-ALT",
      version: 4,
    });
  });

  describe("four-eyes fail-closed contract", () => {
    it.each(["MT202COV", "MT205COV"])(
      "rejects %s when COV mandatory context is absent",
      (messageType) => {
        const definition = definitionFor(messageType);
        const scenario = definition.scenarios[0]!;
        const context = harness();
        const submission = submissionFor(definition, scenario);

        expect(() =>
          context.adapter.execute({
            definition,
            scenario,
            submission: { ...submission, values: {} },
          }),
        ).toThrow(BadRequestException);
        expect(context.resolver.resolve).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "resolved status with a rejection code",
        {
          mx: {
            httpStatus: 200,
            decision: "RESOLVED",
            code: "SSI_NOT_FOUND",
            payloadGenerated: false,
          },
          chosenRoute: {
            ssiId: "SSI-1",
            ssiVersion: 1,
            applicabilityId: "APP-1",
            applicabilityVersion: 1,
          },
          mt: { tags: { "58A": "DEUTDEFF" } },
        },
      ],
      [
        "SSI-only success incorrectly claims a generated payment payload",
        {
          mx: {
            httpStatus: 200,
            decision: "RESOLVED",
            code: "SSI_RESOLVED",
            payloadGenerated: true,
          },
          chosenRoute: {
            ssiId: "SSI-1",
            ssiVersion: 1,
            applicabilityId: "APP-1",
            applicabilityVersion: 1,
          },
          mt: { tags: { "58A": "DEUTDEFF" } },
        },
      ],
      [
        "success envelope without a governed selected route",
        {
          mx: {
            httpStatus: 200,
            decision: "RESOLVED",
            code: "SSI_RESOLVED",
            payloadGenerated: false,
          },
          mt: { tags: { "58A": "DEUTDEFF" } },
        },
      ],
    ])("returns 502 for %s", (_description, response) => {
      const definition = definitionFor("MT202");
      const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
      const context = harness(response);

      try {
        context.adapter.execute({
          definition,
          scenario,
          submission: submissionFor(definition, scenario),
        });
        throw new Error("expected fail-closed rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(502);
      }
    });

    it.each(["56Z", "59A"])(
      "returns 502 when resolver emits unmanaged FIN tag or option %s",
      (unmanagedTag) => {
        const definition = definitionFor("MT202");
        const scenario = scenarioFor(definition, "MT202-OP-DIRECT");
        const context = harness(
          successfulEnvelope({
            "58A": "DEUTDEFF",
            [unmanagedTag]: "UNMANAGED OPTION",
          }),
        );

        try {
          context.adapter.execute({
            definition,
            scenario,
            submission: submissionFor(definition, scenario),
          });
          throw new Error("expected fail-closed rejection");
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);
          expect((error as HttpException).getStatus()).toBe(502);
        }
      },
    );
  });
});
