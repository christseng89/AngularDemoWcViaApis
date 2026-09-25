import fs from "node:fs";

const caseFile = "data/qa/mt2/mt2-pacs009-proposal-case-groups.json";
const fixtureFile = "data/qa/mt2/mt2-pacs009-proposal-fixtures.json";
const catalogue = JSON.parse(fs.readFileSync(caseFile, "utf8"));

const baseRequest = (caseId, sourceMessageType = "MT202") => ({
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
  transactionReference: caseId,
  paymentDirection: "OUTWARD",
  localBankRole: "INSTRUCTING_AGENT",
});

const governedAttestation = (scope) => ({
  attestationId: `ATTESTATION-${scope}`,
  attestationVersion: "1.0.0",
  evidenceSha256: "a".repeat(64),
  validity: "VALID",
  scope,
  stale: false,
  hashMatches: true,
});

const validMt205 = {
  upstreamAttestation: governedAttestation("MT205"),
  senderCountry: "HK",
  receiverCountry: "HK",
};

const validMt205Cov = {
  upstreamAttestation: governedAttestation("MT205COV"),
  senderCountry: "HK",
  receiverCountry: "HK",
};

const rmaDecision = (overrides = {}) => ({
  state: "AUTHORIZED",
  active: true,
  authorized: true,
  receiverMatches: true,
  businessServiceMatches: true,
  channel: "DUAL",
  selectedTransport: "FINPLUS",
  contingencyAuthorized: false,
  pairedEvidenceProfileMatches: true,
  profileBizSvcBindingMatches: true,
  finMessageTypeMatches: true,
  ...overrides,
});

const routeCandidate = (id, has56, has57) => ({ id, has56, has57 });

const previousDefinitions = [
  {
    caseId: "MT2-SSI-DIRECTION-001",
    outcome: "UNSUPPORTED_DIRECTION",
    request: { paymentDirection: "INWARD" },
    source: "MT202",
    governedContext: {},
  },
  {
    caseId: "MT2-SSI-PROFILE-002",
    outcome: "UNSUPPORTED_PROFILE",
    request: { profileId: "UNREGISTERED-PROFILE" },
    source: "MT202",
    governedContext: {},
  },
  ...[
    { suffix: "MISSING", attestation: undefined },
    {
      suffix: "INVALID",
      attestation: { ...governedAttestation("MT205"), validity: "INVALID" },
    },
    {
      suffix: "STALE",
      attestation: { ...governedAttestation("MT205"), stale: true },
    },
    {
      suffix: "HASH-MISMATCH",
      attestation: { ...governedAttestation("MT205"), hashMatches: false },
    },
    { suffix: "SCOPE-MISMATCH", attestation: governedAttestation("MT202COV") },
    { suffix: "VALID", attestation: governedAttestation("MT205") },
  ].map(({ suffix, attestation }) => ({
    caseId: `MT2-SSI-ATTESTATION-${suffix}`,
    outcome:
      suffix === "VALID"
        ? "ELIGIBLE_COMPLETE_ROUTE"
        : "INVALID_UPSTREAM_CONTEXT",
    source: "MT205",
    governedContext: {
      ...(attestation ? { upstreamAttestation: attestation } : {}),
      senderCountry: "HK",
      receiverCountry: "HK",
    },
  })),
  {
    caseId: "MT2-SSI-COMPLETENESS-005",
    outcome: "PROFILE_INCOMPLETE",
    source: "MT202",
    governedContext: {
      intermediaryBankServiceId: "BANK-SVC-INT",
      accountWithBankServiceId: null,
    },
  },
  {
    caseId: "MT2-SSI-TOPOLOGY-006",
    outcome: "INVALID_CONTEXT_TOPOLOGY",
    source: "MT202",
    governedContext: { topologyInvalid: true },
  },
  {
    caseId: "MT2-SSI-STALE-007",
    outcome: "STALE",
    source: "MT202",
    governedContext: { selectedRouteVersionChanged: true },
  },
  {
    caseId: "MT2-SSI-NO-ROUTE-008",
    outcome: "NO_ELIGIBLE_SSI",
    source: "MT202",
    governedContext: { eligibleCandidateCount: 0 },
  },
  {
    caseId: "MT2-SSI-AMBIGUOUS-009",
    outcome: "AMBIGUOUS_ROUTE",
    source: "MT202",
    governedContext: { eligibleCandidateCount: 2 },
  },
  {
    caseId: "MT2-SSI-ROUTE-010",
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
    source: "MT202",
    governedContext: {},
  },
  {
    caseId: "MT2-SSI-BILATERAL-011",
    outcome: "BILATERAL_RELATIONSHIP_CONFIRMED",
    source: "MT202",
    governedContext: { bilateralRelationshipConfirmed: true },
  },
  {
    caseId: "MT2-SSI-JURISDICTION-012",
    outcome: "JURISDICTION_NOT_PERMITTED",
    source: "MT205COV",
    governedContext: { ...validMt205Cov, receiverCountry: "US" },
  },
  {
    caseId: "MT2-SSI-JURISDICTION-EVIDENCE-013",
    outcome: "JURISDICTION_EVIDENCE_CONFLICT",
    source: "MT205",
    governedContext: { ...validMt205, bicCountryConsistency: "CONFLICT" },
  },
];

const rmaDefinitions = [
  {
    suffix: "MISSING",
    decision: { state: "MISSING" },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "EXPIRED",
    decision: { state: "EXPIRED" },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "WRONG-RECEIVER",
    decision: { receiverMatches: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "WRONG-BIZSVC",
    decision: { businessServiceMatches: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "INACTIVE",
    decision: { active: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "DENIED",
    decision: { authorized: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "VALID-DUAL-CHANNEL",
    decision: {},
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
  },
  {
    suffix: "FIN-NO-CONTINGENCY",
    decision: { channel: "FIN", contingencyAuthorized: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "VALID-FIN-CONTINGENCY",
    decision: {
      channel: "FIN",
      contingencyAuthorized: true,
      selectedTransport: "FIN",
    },
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
  },
  {
    suffix: "WRONG-PAIRED-PROFILE",
    decision: { pairedEvidenceProfileMatches: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "WRONG-PROFILE-BIZSVC-BINDING",
    decision: { profileBizSvcBindingMatches: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
  {
    suffix: "WRONG-FIN-MESSAGE-TYPE",
    decision: { finMessageTypeMatches: false },
    outcome: "RMA_NOT_AUTHORIZED",
  },
].map(({ suffix, decision, outcome }) => ({
  caseId: `MT2-V1-RMA-${suffix}`,
  outcome,
  source: "MT202",
  governedContext: { rmaDecision: rmaDecision(decision) },
}));

const c81Scenarios = [
  {
    suffix: "56-57",
    routeCandidates: [routeCandidate("ROUTE-56-57", true, true)],
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
  },
  {
    suffix: "56-ONLY",
    routeCandidates: [routeCandidate("ROUTE-56", true, false)],
    outcome: "NO_ELIGIBLE_SSI",
  },
  {
    suffix: "57-ONLY",
    routeCandidates: [routeCandidate("ROUTE-57", false, true)],
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
  },
  {
    suffix: "NEITHER",
    routeCandidates: [routeCandidate("ROUTE-DIRECT", false, false)],
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
  },
  {
    suffix: "MIXED",
    routeCandidates: [
      routeCandidate("ROUTE-INVALID", true, false),
      routeCandidate("ROUTE-VALID", false, true),
    ],
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
  },
  {
    suffix: "ALL-INVALID",
    routeCandidates: [
      routeCandidate("ROUTE-INVALID-1", true, false),
      routeCandidate("ROUTE-INVALID-2", true, false),
    ],
    outcome: "NO_ELIGIBLE_SSI",
  },
];

const sourceContext = (source) => {
  if (source === "MT205") return validMt205;
  if (source === "MT205COV") return validMt205Cov;
  if (source === "MT202COV")
    return { upstreamAttestation: governedAttestation("MT202COV") };
  return {};
};

const c81Definitions = ["MT202", "MT202COV", "MT205", "MT205COV"].flatMap(
  (source) =>
    c81Scenarios.map(({ suffix, routeCandidates, outcome }) => ({
      caseId: `MT2-V1-C81-${source}-${suffix}`,
      outcome,
      source,
      governedContext: {
        ...sourceContext(source),
        routeCandidates,
      },
    })),
);

const definitions = [
  ...previousDefinitions,
  ...rmaDefinitions,
  ...c81Definitions,
  {
    caseId: "MT2-V1-CONFIG-014",
    outcome: "PROFILE_INCOMPLETE",
    applicability: "NOT_EVALUATED",
    source: "MT202",
    governedContext: { governedConfigurationComplete: false },
  },
  {
    caseId: "MT2-V1-MAP-012",
    outcome: "PROFILE_INCOMPLETE",
    source: "MT202",
    governedContext: { requiredMappingRegistered: false },
  },
  {
    caseId: "MT2-V1-JURIS-018G",
    outcome: "JURISDICTION_EVIDENCE_CONFLICT",
    source: "MT205",
    governedContext: {
      ...validMt205,
      bilateralRelationshipConfirmed: true,
      bicCountryConsistency: "CONFLICT",
    },
  },
  {
    caseId: "MT2-V1-JURIS-018F",
    outcome: "JURISDICTION_NOT_PERMITTED",
    source: "MT205COV",
    governedContext: {
      ...validMt205Cov,
      bilateralRelationshipConfirmed: true,
      receiverCountry: "US",
    },
  },
];

const httpStatus = (outcome) => {
  if (
    ["ELIGIBLE_COMPLETE_ROUTE", "BILATERAL_RELATIONSHIP_CONFIRMED"].includes(
      outcome,
    )
  )
    return 200;
  if (["STALE", "AMBIGUOUS_ROUTE"].includes(outcome)) return 409;
  return 422;
};

const applicability = (outcome) => {
  if (outcome === "BILATERAL_RELATIONSHIP_CONFIRMED") return "NOT_REQUIRED";
  if (
    [
      "UNSUPPORTED_DIRECTION",
      "UNSUPPORTED_PROFILE",
      "INVALID_UPSTREAM_CONTEXT",
      "INVALID_CONTEXT_TOPOLOGY",
      "STALE",
    ].includes(outcome)
  )
    return "NOT_EVALUATED";
  return "REQUIRED";
};

catalogue.expectedExpandedCaseCount = definitions.length;
catalogue.groups = definitions.map(({ caseId, outcome }) => ({
  id: caseId,
  variants: "SINGLE",
  outcomes: [outcome],
}));
const bindings = {};
catalogue.cases = definitions.map((definition) => {
  const fixtureBindingId = `FIXTURE-${definition.caseId}`;
  const resolverRequest = {
    ...baseRequest(definition.caseId, definition.source),
    ...definition.request,
  };
  const request = {
    caseId: definition.caseId,
    direction: resolverRequest.paymentDirection,
    localRole: resolverRequest.localBankRole,
    sourceMessageType: definition.source,
  };
  const expected = {
    httpStatus: httpStatus(definition.outcome),
    ssiApplicability:
      definition.applicability ?? applicability(definition.outcome),
    resolutionOutcome: definition.outcome,
    paymentExecutable: false,
    payloadGenerated: false,
    confirmedResolutionCreated: false,
    repairQueueCreated: false,
  };
  bindings[fixtureBindingId] = {
    fixtureBindingId,
    stimulus: {
      caseId: definition.caseId,
      sourceMessageType: definition.source,
    },
    routeDecision: definition.outcome,
    execution: { resolverRequest, governedContext: definition.governedContext },
  };
  return {
    caseId: definition.caseId,
    scenarioGroupId: definition.caseId,
    fixtureBindingId,
    request,
    expected,
    executableTest: "mt2-pacs009-proposal-cases.spec.ts",
  };
});

fs.writeFileSync(caseFile, `${JSON.stringify(catalogue, null, 2)}\n`);
fs.writeFileSync(
  fixtureFile,
  `${JSON.stringify({ schemaVersion: 1, bindings }, null, 2)}\n`,
);
