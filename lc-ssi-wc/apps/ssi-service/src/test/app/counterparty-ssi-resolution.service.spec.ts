import { CounterpartySsiResolutionService } from "../../app/counterparty-ssi-resolution.service";
import type { RouteResolutionRequest } from "../../app/route-resolution.policy";

const request = (sourceMessageType = "MT202"): RouteResolutionRequest =>
  ({
    consumer: "CENTRAL_PAYMENT",
    counterpartyId: "CP-CITIUS33",
    counterpartyBic: "CITIUS33",
    counterpartyCountry: "US",
    currency: "USD",
    product: "CENTRAL_PAYMENT",
    businessFunction: "INTERBANK_TRANSFER",
    paymentLeg: "INTERBANK_SETTLEMENT",
    direction: "OUTBOUND",
    bookingEntity: "HK01",
    valueDate: "2026-09-25",
    amount: "1",
    messageType: "pacs.009.001.08",
    sourceMessageType,
    transactionReference: "NEW-RULE",
    paymentDirection: "OUTWARD",
    localBankRole: "INSTRUCTING_AGENT",
  }) as RouteResolutionRequest;

const attestation = (scope: string) => ({
  attestationId: `ATTESTATION-${scope}`,
  attestationVersion: "1.0.0",
  evidenceSha256: "a".repeat(64),
  validity: "VALID",
  scope,
  stale: false,
  hashMatches: true,
});

describe("CounterpartySsiResolutionService new-rule boundary", () => {
  const resolver = new CounterpartySsiResolutionService();

  it("accepts a scope-bound opaque attestation without raw cover fields", () => {
    expect(
      resolver.resolve(request("MT202COV"), {
        upstreamAttestation: attestation("MT202COV"),
      }),
    ).toMatchObject({
      mx: { httpStatus: 200 },
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      paymentExecutable: false,
      payloadGenerated: false,
    });
  });

  it("renders governed MT205COV sequence A evidence without using it for SSI routing", () => {
    expect(
      resolver.resolve(request("MT205COV"), {
        upstreamAttestation: attestation("MT205COV"),
        previousMessage: {
          type: "MT202COV",
          "A.52A": "HSBCHKHH",
          "A.58A": "HSBCHKHH",
          sequenceB: {
            "50A": "UPSTREAM ORDERING CUSTOMER",
            "59": "UPSTREAM BENEFICIARY CUSTOMER",
          },
        },
      }),
    ).toMatchObject({
      mx: {
        httpStatus: 200,
        canonicalRoles: {
          creditor: "HSBCHKHH",
          creditorSource: "UPSTREAM_MESSAGE_CONTEXT",
        },
      },
      mt: {
        tags: {
          "A.52A": "HSBCHKHH",
          "A.58A": "HSBCHKHH",
        },
      },
    });
  });

  it("fails closed when a required attestation is missing", () => {
    expect(resolver.resolve(request("MT205"), {})).toMatchObject({
      mx: { httpStatus: 422, code: "INVALID_UPSTREAM_CONTEXT" },
      ssiApplicability: "NOT_EVALUATED",
      paymentExecutable: false,
      payloadGenerated: false,
    });
  });

  it("filters C81 per candidate before ranking", () => {
    const result = resolver.resolve(request(), {
      routeCandidates: [
        { id: "INVALID", has56: true, has57: false },
        { id: "VALID", has56: false, has57: true },
      ],
    });
    expect(result).toMatchObject({
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      routeSelectionEvidence: {
        evaluatedCandidateIds: ["INVALID", "VALID"],
        eligibleCandidateIds: ["VALID"],
      },
    });
  });

  it("withholds the route when exact RMA is not authorized", () => {
    expect(
      resolver.resolve(request(), {
        rmaDecision: {
          state: "AUTHORIZED",
          active: true,
          authorized: false,
          receiverMatches: true,
          businessServiceMatches: true,
          channel: "DUAL",
        },
      }),
    ).toMatchObject({
      mx: { httpStatus: 422, code: "RMA_NOT_AUTHORIZED" },
      resolutionOutcome: "RMA_NOT_AUTHORIZED",
      paymentExecutable: false,
      payloadGenerated: false,
    });
  });
});
