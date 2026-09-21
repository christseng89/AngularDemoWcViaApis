import { BadRequestException } from "@nestjs/common";
import type {
  ResolutionPageScenario,
  ResolutionPageSubmission,
} from "@ssi/contracts";
import { PaymentResolutionPageDefinitionSource } from "../../../app/page-parameters/payment-resolution-page-definition.source";
import {
  PaymentResolutionPageSubmissionAdapter,
  type PaymentSettlementResolutionPort,
} from "../../../app/page-parameters/payment-resolution-page-submission.adapter";

const definition = new PaymentResolutionPageDefinitionSource()
  .all("SR2026")
  .find((candidate) => candidate.messageType === "MT205COV")!;

const scenario: ResolutionPageScenario = definition.scenarios.find(
  (candidate) => candidate.scenarioId === "MT205COV-OP-CONTINUATION",
)!;

const completeValues: ResolutionPageSubmission["values"] = {
  "context.transactionReference": "MT205COV-CURRENT-001",
  "context.currency": "USD",
  "context.bookingEntity": "HK01",
  "context.valueDate": "2026-09-14",
  "context.amount": "1000.00",
  "context.counterpartyBankServiceId": "BANK-SVC-DEUTDEFF",
  "context.swift21NONE": "CURRENT-RELATED-001",
  "context.swift32A": "260914USD1000,00",
  "context.swift119NONE": "COV",
  "context.swift121NONE": "123e4567-e89b-42d3-a456-426614174000",
  "context.sequenceB50A": "CURRENT ORDERING CUSTOMER",
  "context.sequenceB59": "CURRENT BENEFICIARY CUSTOMER",
  "context.previousMessageType": "MT202COV",
  "context.previousMessage20": "PREVIOUS-TX-001",
  "context.previousMessage21": "PREVIOUS-RELATED-001",
  "context.previousMessage121": "8ec66d20-3450-4f31-9f68-d16e911c515c",
  "context.previousMessageA52": "CITIUS33",
  "context.previousMessageA58": "DEUTDEFF",
  "context.previousMessageSequenceB50A": "PREVIOUS ORDERING CUSTOMER",
  "context.previousMessageSequenceB59": "PREVIOUS BENEFICIARY CUSTOMER",
  "context.previousMessageArtifactSha256": "b".repeat(64),
  "context.previousMessageArtifactVersion": "SR2026-MT202COV-V1",
};

const submission = (
  values: ResolutionPageSubmission["values"],
): ResolutionPageSubmission => ({
  definitionId: definition.definitionId,
  definitionVersion: definition.definitionVersion,
  scenarioId: scenario.scenarioId,
  fixtureBindingId: scenario.fixture.bindingId,
  contractSha256: "a".repeat(64),
  values,
});

const success = {
  mx: {
    httpStatus: 200,
    decision: "RESOLVED",
    code: "SSI_RESOLVED",
    payloadGenerated: true,
  },
  mt: {
    tags: {
      "A.52A": "CITIUS33",
      "A.58A": "DEUTDEFF",
      "B.50A": "CURRENT ORDERING CUSTOMER",
      "B.59": "CURRENT BENEFICIARY CUSTOMER",
    },
  },
  chosenRoute: {
    ssiId: "SSI-MT205COV-001",
    ssiVersion: 1,
    applicabilityId: "APP-MT205COV-001",
    applicabilityVersion: 1,
  },
};

const harness = () => {
  const resolver: PaymentSettlementResolutionPort = {
    resolve: jest.fn(() => success),
  };
  const banks = {
    resolve: jest.fn(() => ({
      bankServiceId: "BANK-SVC-DEUTDEFF",
      bic: "DEUTDEFF",
      name: "Deutsche Bank AG",
      country: "DE",
    })),
    search: jest.fn(() => []),
  };
  return {
    resolver,
    adapter: new PaymentResolutionPageSubmissionAdapter(
      resolver,
      banks as never,
    ),
  };
};

describe("MT205COV previous-message provenance contract", () => {
  it("maps the complete governed previous MT202COV identity and content", () => {
    const context = harness();

    context.adapter.execute({
      definition,
      scenario,
      submission: submission(completeValues),
    });

    expect(context.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        previousMessage: {
          type: "MT202COV",
          "20": "PREVIOUS-TX-001",
          "21": "PREVIOUS-RELATED-001",
          "121": "8ec66d20-3450-4f31-9f68-d16e911c515c",
          "A.52A": "CITIUS33",
          "A.58A": "DEUTDEFF",
          sequenceB: {
            "50A": "PREVIOUS ORDERING CUSTOMER",
            "59": "PREVIOUS BENEFICIARY CUSTOMER",
          },
          artifactSha256: "b".repeat(64),
          artifactVersion: "SR2026-MT202COV-V1",
        },
      }),
    );
  });

  it.each([
    "context.previousMessageType",
    "context.previousMessage20",
    "context.previousMessage21",
    "context.previousMessage121",
    "context.previousMessageA52",
    "context.previousMessageA58",
    "context.previousMessageSequenceB50A",
    "context.previousMessageSequenceB59",
    "context.previousMessageArtifactSha256",
    "context.previousMessageArtifactVersion",
  ])("fails closed before resolution when %s is absent", (fieldId) => {
    const context = harness();
    const values = { ...completeValues };
    delete values[fieldId];

    expect(() =>
      context.adapter.execute({
        definition,
        scenario,
        submission: submission(values),
      }),
    ).toThrow(BadRequestException);
    expect(context.resolver.resolve).not.toHaveBeenCalled();
  });

  it.each(["MT202", "MT205", " "])(
    "rejects non-cover previousMessageType %p",
    (previousMessageType) => {
      const context = harness();

      expect(() =>
        context.adapter.execute({
          definition,
          scenario,
          submission: submission({
            ...completeValues,
            "context.previousMessageType": previousMessageType,
          }),
        }),
      ).toThrow(BadRequestException);
      expect(context.resolver.resolve).not.toHaveBeenCalled();
    },
  );

  it.each(["not-a-hash", "a".repeat(63), "g".repeat(64)])(
    "rejects malformed previous-message artifact SHA-256 %p",
    (artifactSha256) => {
      const context = harness();

      expect(() =>
        context.adapter.execute({
          definition,
          scenario,
          submission: submission({
            ...completeValues,
            "context.previousMessageArtifactSha256": artifactSha256,
          }),
        }),
      ).toThrow(BadRequestException);
      expect(context.resolver.resolve).not.toHaveBeenCalled();
    },
  );

  it("rejects blank previous-message artifact version", () => {
    const context = harness();

    expect(() =>
      context.adapter.execute({
        definition,
        scenario,
        submission: submission({
          ...completeValues,
          "context.previousMessageArtifactVersion": " ",
        }),
      }),
    ).toThrow(BadRequestException);
    expect(context.resolver.resolve).not.toHaveBeenCalled();
  });
});
