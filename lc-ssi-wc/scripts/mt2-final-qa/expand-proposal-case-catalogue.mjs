import fs from "node:fs";

const caseFile = "data/qa/mt2/mt2-pacs009-proposal-case-groups.json";
const fixtureFile = "data/qa/mt2/mt2-pacs009-proposal-fixtures.json";
const catalogue = JSON.parse(fs.readFileSync(caseFile, "utf8"));
const profiles = catalogue.profiles;

const letters = (expression) => {
  if (expression === "SINGLE") return [""];
  if (/^[A-Z]$/.test(expression)) return [expression];
  const [, first, last] = /^([A-Z])\.\.([A-Z])$/.exec(expression);
  return Array.from(
    { length: last.charCodeAt(0) - first.charCodeAt(0) + 1 },
    (_, index) => String.fromCharCode(first.charCodeAt(0) + index),
  );
};

const outcomeMatrix = {
  "DIR-001": ["UNSUPPORTED_DIRECTION", "UNSUPPORTED_DIRECTION"],
  "PROFILE-002": [
    "ELIGIBLE_COMPLETE_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
    "UNSUPPORTED_PROFILE",
    "UNSUPPORTED_PROFILE",
    "UNSUPPORTED_PROFILE",
  ],
  "RMA-003": [
    ...Array(6).fill("RMA_NOT_AUTHORIZED"),
    "ELIGIBLE_COMPLETE_ROUTE",
    "RMA_NOT_AUTHORIZED",
    "ELIGIBLE_COMPLETE_ROUTE",
    ...Array(3).fill("RMA_NOT_AUTHORIZED"),
  ],
  "202COV-004": Array(4).fill("INVALID_UPSTREAM_CONTEXT"),
  "205-005": [
    ...Array(7).fill("ELIGIBLE_COMPLETE_ROUTE"),
    "INVALID_UPSTREAM_CONTEXT",
  ],
  "205COV-006": [
    ...Array(3).fill("ELIGIBLE_COMPLETE_ROUTE"),
    ...Array(4).fill("INVALID_UPSTREAM_CONTEXT"),
  ],
  "CUSTOMER-007": ["ELIGIBLE_COMPLETE_ROUTE"],
  "PRESENCE-007": ["PROFILE_INCOMPLETE"],
  "STTLM-008": [
    "ELIGIBLE_COMPLETE_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
    "INVALID_CONTEXT_TOPOLOGY",
    "ELIGIBLE_COMPLETE_ROUTE",
  ],
  "ACCOUNT-009": ["PROFILE_INCOMPLETE"],
  "PICKER-010": ["STALE"],
  "ROUTE-011": [
    "NO_ELIGIBLE_SSI",
    "AMBIGUOUS_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
  ],
  "MAP-012": ["PROFILE_INCOMPLETE"],
  "NOTREQ-013": [
    "BILATERAL_RELATIONSHIP_CONFIRMED",
    ...Array(3).fill("INVALID_UPSTREAM_CONTEXT"),
  ],
  "CONFIG-014": ["PROFILE_INCOMPLETE"],
  "PRECEDENCE-015": ["PROFILE_INCOMPLETE", "JURISDICTION_NOT_PERMITTED"],
  "OPTIONS-016": ["PROFILE_INCOMPLETE"],
  "SNAPSHOT-017": ["STALE"],
  "JURIS-018": [
    "ELIGIBLE_COMPLETE_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
    "JURISDICTION_NOT_PERMITTED",
    "JURISDICTION_EVIDENCE_CONFLICT",
    "JURISDICTION_NOT_PERMITTED",
    "ELIGIBLE_COMPLETE_ROUTE",
    "JURISDICTION_EVIDENCE_CONFLICT",
  ],
  "NONCOVER-019": [
    "ELIGIBLE_COMPLETE_ROUTE",
    "INVALID_UPSTREAM_CONTEXT",
    "INVALID_UPSTREAM_CONTEXT",
  ],
  "OWNACCT-020": [
    ...Array(4).fill("ELIGIBLE_COMPLETE_ROUTE"),
    "PROFILE_INCOMPLETE",
    "PROFILE_INCOMPLETE",
  ],
  "C81-021": [
    "ELIGIBLE_COMPLETE_ROUTE",
    "NO_ELIGIBLE_SSI",
    "ELIGIBLE_COMPLETE_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
    "ELIGIBLE_COMPLETE_ROUTE",
    "NO_ELIGIBLE_SSI",
  ],
};

const exactOutcome = (groupId, variant) => {
  const outcomes = outcomeMatrix[groupId.replace("MT2-V1-", "")];
  const index = variant ? variant.charCodeAt(0) - 65 : 0;
  if (!outcomes?.[index])
    throw new Error(`No exact oracle for ${groupId}${variant}`);
  return outcomes[index];
};

const httpStatus = (outcome) =>
  ["ELIGIBLE_COMPLETE_ROUTE", "BILATERAL_RELATIONSHIP_CONFIRMED"].includes(
    outcome,
  )
    ? 200
    : outcome === "STALE"
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
    ].includes(outcome)
  )
    return "NOT_EVALUATED";
  return "REQUIRED";
};

const sourceFor = (profileId, outcome) => {
  if (outcome === "INVALID_UPSTREAM_CONTEXT") return "MT202COV";
  if (outcome === "JURISDICTION_EVIDENCE_CONFLICT") return "MT205";
  if (outcome === "JURISDICTION_NOT_PERMITTED") return "MT205COV";
  return (
    {
      "MT2-MT202-PLAIN-SR2026": "MT202",
      "MT2-MT202COV-COV-SR2026": "MT202COV",
      "MT2-MT205-PLAIN-SR2026": "MT205",
      "MT2-MT205COV-COV-SR2026": "MT205COV",
    }[profileId] ?? "MT202"
  );
};

const validRaw = (source) => {
  const cover = source.endsWith("COV");
  const raw = cover
    ? {
        block3: { 119: "COV" },
        incoming121: "123e4567-e89b-42d3-a456-426614174000",
        sequenceB: { "50A": "ORDERING-CUSTOMER", 59: "BENEFICIARY-CUSTOMER" },
        underlyingCustomerCreditTransfer: true,
      }
    : {};
  if (source === "MT205")
    Object.assign(raw, {
      previousMessage: {
        type: "MT202",
        20: "PREVIOUS",
        21: "RELATED",
        nonCoverAttested: true,
        attestationId: "NON-COVER-001",
        attestationVersion: "1.0.0",
        artifactSha256: "a".repeat(64),
      },
      senderCountry: "HK",
      receiverCountry: "HK",
    });
  if (source === "MT205COV")
    Object.assign(raw, {
      previousMessage: {
        type: "MT202COV",
        20: "PREVIOUS",
        21: "RELATED",
        121: "123e4567-e89b-42d3-a456-426614174000",
        "A.52A": "DEMOHKHH",
        "A.58A": "CITIUS33",
        sequenceB: { "50A": "ORDERING-CUSTOMER", 59: "BENEFICIARY-CUSTOMER" },
        artifactSha256: "b".repeat(64),
        artifactVersion: "1.0.0",
      },
      senderCountry: "HK",
      receiverCountry: "HK",
    });
  return raw;
};

const executionFixture = (request, outcome) => {
  const sourceMessageType = sourceFor(request.profileId, outcome);
  const resolverRequest = {
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
    transactionReference: request.caseId,
    paymentDirection: request.direction,
    localBankRole: request.localRole,
    ...(request.profileId ? { profileId: request.profileId } : {}),
  };
  let raw = validRaw(sourceMessageType);
  if (outcome === "UNSUPPORTED_PROFILE")
    resolverRequest.profileId = "UNREGISTERED-PROFILE";
  if (outcome === "RMA_NOT_AUTHORIZED") raw = { ...raw, rmaFixture: true };
  if (outcome === "INVALID_UPSTREAM_CONTEXT") raw = {};
  if (outcome === "PROFILE_INCOMPLETE")
    raw = {
      ...raw,
      intermediaryBankServiceId: "BANK-SVC-INT",
      accountWithBankServiceId: null,
    };
  if (outcome === "INVALID_CONTEXT_TOPOLOGY")
    raw = { ...raw, topologyInvalid: true };
  if (outcome === "STALE") raw = { ...raw, selectedRouteVersionChanged: true };
  if (outcome === "NO_ELIGIBLE_SSI")
    raw = { ...raw, eligibleCandidateCount: 0 };
  if (outcome === "AMBIGUOUS_ROUTE")
    raw = { ...raw, eligibleCandidateCount: 2 };
  if (outcome === "BILATERAL_RELATIONSHIP_CONFIRMED")
    raw = { ...raw, bilateralRelationshipConfirmed: true };
  if (outcome === "JURISDICTION_EVIDENCE_CONFLICT")
    raw = { ...validRaw("MT205"), bicCountryConsistency: "CONFLICT" };
  if (outcome === "JURISDICTION_NOT_PERMITTED")
    raw = {
      ...validRaw("MT205COV"),
      senderCountry: "HK",
      receiverCountry: "US",
    };
  return { resolverRequest, raw };
};

const cases = [];
const bindings = {};
for (const group of catalogue.groups) {
  for (const variant of letters(group.variants)) {
    for (const profileId of group.profileMatrix ? profiles : [undefined]) {
      const profileSuffix = profileId ? `-${profileId.split("-")[1]}` : "";
      const caseId = `${group.id}${variant}${profileSuffix}`;
      const fixtureBindingId = `FIXTURE-${caseId}`;
      const outcome = exactOutcome(group.id, variant);
      const request = {
        caseId,
        direction:
          group.id === "MT2-V1-DIR-001" && variant === "A"
            ? "INWARD"
            : "OUTWARD",
        localRole:
          group.id === "MT2-V1-DIR-001" && variant === "B"
            ? "INSTRUCTED_AGENT"
            : "INSTRUCTING_AGENT",
        ...(profileId ? { profileId } : {}),
        scenarioGroupId: group.id,
        variant: variant || "SINGLE",
      };
      const expected = {
        httpStatus: httpStatus(outcome),
        ssiApplicability: applicability(outcome),
        resolutionOutcome: outcome,
        paymentExecutable: false,
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      };
      bindings[fixtureBindingId] = {
        fixtureBindingId,
        request,
        stimulus: {
          groupId: group.id,
          variant: variant || "SINGLE",
          ...(profileId ? { profileId } : {}),
        },
        execution: executionFixture(request, outcome),
      };
      cases.push({
        caseId,
        scenarioGroupId: group.id,
        fixtureBindingId,
        request,
        expected,
        executableTest: "mt2-pacs009-proposal-cases.spec.ts",
      });
    }
  }
}

catalogue.cases = cases;
fs.writeFileSync(caseFile, `${JSON.stringify(catalogue, null, 2)}\n`);
fs.writeFileSync(
  fixtureFile,
  `${JSON.stringify({ schemaVersion: 1, bindings }, null, 2)}\n`,
);
