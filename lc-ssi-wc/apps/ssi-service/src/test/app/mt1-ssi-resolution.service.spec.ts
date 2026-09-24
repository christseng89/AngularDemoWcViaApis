import {
  Mt1SsiResolutionService,
  type Mt1SsiCandidateRepository,
  type Mt1SsiResolutionRequest,
} from "../../app/mt1-ssi-resolution.service";
import { Mt1SsiProfileRegistry } from "../../app/mt1-ssi-profile.registry";

const request: Mt1SsiResolutionRequest = {
  profileId: "PACS008-PLAIN-SR2026",
  businessService: "swift.cbprplus.04",
  messageDefinitionId: "pacs.008.001.08",
  scenarioId: "MT1-INDA-SSI",
  fixtureBindingId: "FIXTURE-MT1-INDA-SSI",
  paymentDirection: "OUTWARD",
  localBankRole: "INSTRUCTING_AGENT",
  transferMethod: "SERIAL",
  settlementContext: "INDA",
  upstreamValidatedDestination: { id: "BANK-CITI", version: 1 },
  currentHop: {
    id: "HOP-1",
    version: 1,
    instructingAgentId: "BANK-LOCAL",
    instructedAgentId: "BANK-CITI",
  },
  routeTopology: { id: "TOPOLOGY-INDA", version: 1 },
  currency: "USD",
  bookingEntity: "HK01",
  valueDate: "2026-09-24",
  contextSnapshotId: "SNAPSHOT-1",
};

const completeCandidate = {
  routeBindingId: "ROUTE-1",
  snapshotToken: "SNAPSHOT-1",
  rank: [10, 0] as const,
  optionCompatible: true,
  complete: true,
  roles: [
    {
      role: "INSTRUCTED_REIMBURSEMENT_AGENT" as const,
      owner: "COUNTERPARTY_SSI" as const,
      recordId: "SSI-1",
      version: 1,
    },
  ],
};

const repository = () => {
  const discover = jest.fn(() => [completeCandidate]);
  return {
    port: { discover } satisfies Mt1SsiCandidateRepository,
    discover,
  };
};

describe("Mt1SsiResolutionService", () => {
  it("rejects inward before SSI discovery", () => {
    const candidates = repository();
    const result = new Mt1SsiResolutionService(
      new Mt1SsiProfileRegistry(),
      candidates.port,
    ).resolve({ ...request, paymentDirection: "INWARD" });

    expect(result).toMatchObject({
      ssiApplicability: "NOT_EVALUATED",
      resolutionOutcome: "UNSUPPORTED_DIRECTION",
      payloadGenerated: false,
    });
    expect(candidates.discover).not.toHaveBeenCalled();
  });

  it("requires the exact pacs.008 BizSvc before SSI discovery", () => {
    const candidates = repository();
    const result = new Mt1SsiResolutionService(
      new Mt1SsiProfileRegistry(),
      candidates.port,
    ).resolve({ ...request, businessService: "swift.cbprplus.stp.04" });

    expect(result).toMatchObject({
      ssiApplicability: "NOT_EVALUATED",
      resolutionOutcome: "UNSUPPORTED_PROFILE",
    });
    expect(candidates.discover).not.toHaveBeenCalled();
  });

  it.each([
    [
      "non-instructing local role",
      { localBankRole: "INSTRUCTED_AGENT" },
      "INVALID_CONTEXT_TOPOLOGY",
    ],
    [
      "missing route topology identity",
      { routeTopology: { id: "", version: 1 } },
      "INVALID_CONTEXT_TOPOLOGY",
    ],
    [
      "unvalidated destination version",
      { upstreamValidatedDestination: { id: "BANK-CITI", version: 0 } },
      "INVALID_UPSTREAM_CONTEXT",
    ],
  ])("fails closed for %s before SSI discovery", (_label, override, outcome) => {
    const candidates = repository();
    const result = new Mt1SsiResolutionService(
      new Mt1SsiProfileRegistry(),
      candidates.port,
    ).resolve({ ...request, ...override });

    expect(result).toMatchObject({
      ssiApplicability: "NOT_EVALUATED",
      resolutionOutcome: outcome,
      payloadGenerated: false,
    });
    expect(candidates.discover).not.toHaveBeenCalled();
  });

  it("returns one atomic SSI route without composing a payment message", () => {
    const candidates = repository();
    const result = new Mt1SsiResolutionService(
      new Mt1SsiProfileRegistry(),
      candidates.port,
    ).resolve(request);

    expect(result).toMatchObject({
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      route: completeCandidate,
      payloadGenerated: false,
    });
    expect(result).not.toHaveProperty("mt");
    expect(result).not.toHaveProperty("mx");
  });

  it("fails closed for incompatible options and tied top-ranked routes", () => {
    const incompatible = repository();
    incompatible.discover.mockReturnValue([
      { ...completeCandidate, optionCompatible: false },
    ]);
    expect(
      new Mt1SsiResolutionService(
        new Mt1SsiProfileRegistry(),
        incompatible.port,
      ).resolve(request),
    ).toMatchObject({
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "PROFILE_INCOMPLETE",
    });

    const tied = repository();
    tied.discover.mockReturnValue([
      completeCandidate,
      { ...completeCandidate, routeBindingId: "ROUTE-2" },
    ]);
    expect(
      new Mt1SsiResolutionService(
        new Mt1SsiProfileRegistry(),
        tied.port,
      ).resolve(request),
    ).toMatchObject({
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "AMBIGUOUS_ROUTE",
    });
  });
});
