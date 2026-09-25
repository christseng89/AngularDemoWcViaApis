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
    raw: {},
  },
  {
    caseId: "MT2-SSI-PROFILE-002",
    outcome: "UNSUPPORTED_PROFILE",
    request: { profileId: "UNREGISTERED-PROFILE" },
    source: "MT202",
    raw: {},
  },
  ...[
    ["MISSING", { state: "MISSING" }, "RMA_NOT_AUTHORIZED"],
    ["EXPIRED", { state: "EXPIRED" }, "RMA_NOT_AUTHORIZED"],
    ["WRONG-RECEIVER", { receiverMatches: false }, "RMA_NOT_AUTHORIZED"],
    ["WRONG-BIZSVC", { businessServiceMatches: false }, "RMA_NOT_AUTHORIZED"],
    ["INACTIVE", { active: false }, "RMA_NOT_AUTHORIZED"],
    ["DENIED", { authorized: false }, "RMA_NOT_AUTHORIZED"],
    ["VALID-MX", {}, "ELIGIBLE_COMPLETE_ROUTE"],
    [
      "VALID-FIN-CONTINGENCY",
      { channel: "FIN", contingencyAuthorized: true },
      "ELIGIBLE_COMPLETE_ROUTE",
    ],
  ].map(([suffix, decision, outcome]) => ({
    caseId: `MT2-SSI-RMA-${suffix}`,
    outcome,
    source: "MT202",
    raw: { rmaDecision: rmaDecision(decision) },
  })),
  ...[
    ["MISSING", undefined],
    ["INVALID", { ...governedAttestation("MT205"), validity: "INVALID" }],
    ["STALE", { ...governedAttestation("MT205"), stale: true }],
    ["HASH-MISMATCH", { ...governedAttestation("MT205"), hashMatches: false }],
    ["SCOPE-MISMATCH", governedAttestation("MT202COV")],
    ["VALID", governedAttestation("MT205")],
  ].map(([suffix, attestation]) => ({
    caseId: `MT2-SSI-ATTESTATION-${suffix}`,
    outcome:
      suffix === "VALID"
        ? "ELIGIBLE_COMPLETE_ROUTE"
        : "INVALID_UPSTREAM_CONTEXT",
    source: "MT205",
    raw: {
      ...(attestation ? { upstreamAttestation: attestation } : {}),
      senderCountry: "HK",
      receiverCountry: "HK",
    },
  })),
  {
    caseId: "MT2-SSI-COMPLETENESS-005",
    outcome: "PROFILE_INCOMPLETE",
    source: "MT202",
    raw: {
      intermediaryBankServiceId: "BANK-SVC-INT",
      accountWithBankServiceId: null,
    },
  },
  {
    caseId: "MT2-SSI-TOPOLOGY-006",
    outcome: "INVALID_CONTEXT_TOPOLOGY",
    source: "MT202",
    raw: { topologyInvalid: true },
  },
  {
    caseId: "MT2-SSI-STALE-007",
    outcome: "STALE",
    source: "MT202",
    raw: { selectedRouteVersionChanged: true },
  },
  {
    caseId: "MT2-SSI-NO-ROUTE-008",
    outcome: "NO_ELIGIBLE_SSI",
    source: "MT202",
    raw: { eligibleCandidateCount: 0 },
  },
  ...[
    [
      "56-57",
      [routeCandidate("ROUTE-56-57", true, true)],
      "ELIGIBLE_COMPLETE_ROUTE",
    ],
    ["56-ONLY", [routeCandidate("ROUTE-56", true, false)], "NO_ELIGIBLE_SSI"],
    [
      "57-ONLY",
      [routeCandidate("ROUTE-57", false, true)],
      "ELIGIBLE_COMPLETE_ROUTE",
    ],
    [
      "NEITHER",
      [routeCandidate("ROUTE-DIRECT", false, false)],
      "ELIGIBLE_COMPLETE_ROUTE",
    ],
    [
      "MIXED",
      [
        routeCandidate("ROUTE-INVALID", true, false),
        routeCandidate("ROUTE-VALID", false, true),
      ],
      "ELIGIBLE_COMPLETE_ROUTE",
    ],
    [
      "ALL-INVALID",
      [
        routeCandidate("ROUTE-INVALID-1", true, false),
        routeCandidate("ROUTE-INVALID-2", true, false),
      ],
      "NO_ELIGIBLE_SSI",
    ],
  ].map(([suffix, routeCandidates, outcome]) => ({
    caseId: `MT2-SSI-C81-${suffix}`,
    outcome,
    source: "MT202",
    raw: { routeCandidates },
  })),
  {
    caseId: "MT2-SSI-AMBIGUOUS-009",
    outcome: "AMBIGUOUS_ROUTE",
    source: "MT202",
    raw: { eligibleCandidateCount: 2 },
  },
  {
    caseId: "MT2-SSI-ROUTE-010",
    outcome: "ELIGIBLE_COMPLETE_ROUTE",
    source: "MT202",
    raw: {},
  },
  {
    caseId: "MT2-SSI-BILATERAL-011",
    outcome: "BILATERAL_RELATIONSHIP_CONFIRMED",
    source: "MT202",
    raw: { bilateralRelationshipConfirmed: true },
  },
  {
    caseId: "MT2-SSI-JURISDICTION-012",
    outcome: "JURISDICTION_NOT_PERMITTED",
    source: "MT205COV",
    raw: { ...validMt205Cov, receiverCountry: "US" },
  },
  {
    caseId: "MT2-SSI-JURISDICTION-EVIDENCE-013",
    outcome: "JURISDICTION_EVIDENCE_CONFLICT",
    source: "MT205",
    raw: { ...validMt205, bicCountryConsistency: "CONFLICT" },
  },
];

const rmaDefinitions = [
  ["MISSING", { state: "MISSING" }, "RMA_NOT_AUTHORIZED"],
  ["EXPIRED", { state: "EXPIRED" }, "RMA_NOT_AUTHORIZED"],
  ["WRONG-RECEIVER", { receiverMatches: false }, "RMA_NOT_AUTHORIZED"],
  ["WRONG-BIZSVC", { businessServiceMatches: false }, "RMA_NOT_AUTHORIZED"],
  ["INACTIVE", { active: false }, "RMA_NOT_AUTHORIZED"],
  ["DENIED", { authorized: false }, "RMA_NOT_AUTHORIZED"],
  ["VALID-DUAL-CHANNEL", {}, "ELIGIBLE_COMPLETE_ROUTE"],
  [
    "FIN-NO-CONTINGENCY",
    { channel: "FIN", contingencyAuthorized: false },
    "RMA_NOT_AUTHORIZED",
  ],
  [
    "VALID-FIN-CONTINGENCY",
    {
      channel: "FIN",
      contingencyAuthorized: true,
      selectedTransport: "FIN",
    },
    "ELIGIBLE_COMPLETE_ROUTE",
  ],
  [
    "WRONG-PAIRED-PROFILE",
    { pairedEvidenceProfileMatches: false },
    "RMA_NOT_AUTHORIZED",
  ],
  [
    "WRONG-PROFILE-BIZSVC-BINDING",
    { profileBizSvcBindingMatches: false },
    "RMA_NOT_AUTHORIZED",
  ],
  [
    "WRONG-FIN-MESSAGE-TYPE",
    { finMessageTypeMatches: false },
    "RMA_NOT_AUTHORIZED",
  ],
].map(([suffix, decision, outcome]) => ({
  caseId: `MT2-V1-RMA-${suffix}`,
  outcome,
  source: "MT202",
  raw: { rmaDecision: rmaDecision(decision) },
}));

const c81Definitions = ["MT202", "MT202COV", "MT205", "MT205COV"].flatMap(
  (source) =>
    [
      [
        "56-57",
        [routeCandidate("ROUTE-56-57", true, true)],
        "ELIGIBLE_COMPLETE_ROUTE",
      ],
      ["56-ONLY", [routeCandidate("ROUTE-56", true, false)], "NO_ELIGIBLE_SSI"],
      [
        "57-ONLY",
        [routeCandidate("ROUTE-57", false, true)],
        "ELIGIBLE_COMPLETE_ROUTE",
      ],
      [
        "NEITHER",
        [routeCandidate("ROUTE-DIRECT", false, false)],
        "ELIGIBLE_COMPLETE_ROUTE",
      ],
      [
        "MIXED",
        [
          routeCandidate("ROUTE-INVALID", true, false),
          routeCandidate("ROUTE-VALID", false, true),
        ],
        "ELIGIBLE_COMPLETE_ROUTE",
      ],
      [
        "ALL-INVALID",
        [
          routeCandidate("ROUTE-INVALID-1", true, false),
          routeCandidate("ROUTE-INVALID-2", true, false),
        ],
        "NO_ELIGIBLE_SSI",
      ],
    ].map(([suffix, routeCandidates, outcome]) => ({
      caseId: `MT2-V1-C81-${source}-${suffix}`,
      outcome,
      source,
      raw: {
        ...(source === "MT205"
          ? validMt205
          : source === "MT205COV"
            ? validMt205Cov
            : source === "MT202COV"
              ? { upstreamAttestation: governedAttestation("MT202COV") }
              : {}),
        routeCandidates,
      },
    })),
);

const definitions = [
  ...previousDefinitions.filter(
    ({ caseId }) =>
      !caseId.startsWith("MT2-SSI-RMA-") && !caseId.startsWith("MT2-SSI-C81-"),
  ),
  ...rmaDefinitions,
  ...c81Definitions,
  {
    caseId: "MT2-V1-CONFIG-014",
    outcome: "PROFILE_INCOMPLETE",
    applicability: "NOT_EVALUATED",
    source: "MT202",
    raw: { governedConfigurationComplete: false },
  },
  {
    caseId: "MT2-V1-MAP-012",
    outcome: "PROFILE_INCOMPLETE",
    source: "MT202",
    raw: { requiredMappingRegistered: false },
  },
  {
    caseId: "MT2-V1-JURIS-018G",
    outcome: "JURISDICTION_EVIDENCE_CONFLICT",
    source: "MT205",
    raw: {
      ...validMt205,
      bilateralRelationshipConfirmed: true,
      bicCountryConsistency: "CONFLICT",
    },
  },
  {
    caseId: "MT2-V1-JURIS-018F",
    outcome: "JURISDICTION_NOT_PERMITTED",
    source: "MT205COV",
    raw: {
      ...validMt205Cov,
      bilateralRelationshipConfirmed: true,
      receiverCountry: "US",
    },
  },
];

const httpStatus = (outcome) =>
  ["ELIGIBLE_COMPLETE_ROUTE", "BILATERAL_RELATIONSHIP_CONFIRMED"].includes(
    outcome,
  )
    ? 200
    : ["STALE", "AMBIGUOUS_ROUTE"].includes(outcome)
      ? 409
      : 422;

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
    execution: { resolverRequest, raw: definition.raw },
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
