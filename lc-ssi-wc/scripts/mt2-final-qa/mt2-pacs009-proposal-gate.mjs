const ALLOWED_PROFILES = new Set([
  "MT2-MT202-PLAIN-SR2026",
  "MT2-MT202COV-COV-SR2026",
  "MT2-MT205-PLAIN-SR2026",
  "MT2-MT205COV-COV-SR2026",
]);
const REQUIRED_OUTCOMES = new Set([
  "BILATERAL_RELATIONSHIP_CONFIRMED",
  "ELIGIBLE_COMPLETE_ROUTE",
  "NO_ELIGIBLE_SSI",
  "AMBIGUOUS_ROUTE",
  "STALE",
  "INVALID_CONTEXT_TOPOLOGY",
  "INVALID_UPSTREAM_CONTEXT",
  "PROFILE_INCOMPLETE",
  "UNSUPPORTED_DIRECTION",
  "UNSUPPORTED_PROFILE",
  "RMA_NOT_AUTHORIZED",
  "JURISDICTION_EVIDENCE_CONFLICT",
  "JURISDICTION_NOT_PERMITTED",
]);
const ALLOWED_GOVERNED_CONTEXT_KEYS = new Set([
  "accountWithBankServiceId",
  "bicCountryConsistency",
  "bilateralRelationshipConfirmed",
  "eligibleCandidateCount",
  "governedConfigurationComplete",
  "intermediaryBankServiceId",
  "receiverCountry",
  "requiredMappingRegistered",
  "rmaDecision",
  "routeCandidates",
  "selectedRouteVersionChanged",
  "senderCountry",
  "topologyInvalid",
  "upstreamAttestation",
]);

const unexpectedContextKeys = (value) =>
  Object.keys(value ?? {}).filter(
    (key) => !ALLOWED_GOVERNED_CONTEXT_KEYS.has(key),
  );

const variantCount = ({ variants, profileMatrix }) => {
  if (variants === "SINGLE") return 1;
  if (/^[A-Z]$/.test(variants)) return profileMatrix ? 4 : 1;
  const match = /^([A-Z])\.\.([A-Z])$/.exec(variants);
  if (!match) throw new Error(`Unsupported variant expression: ${variants}`);
  const count =
    (match[2].codePointAt(0) ?? 0) - (match[1].codePointAt(0) ?? 0) + 1;
  return profileMatrix ? count * 4 : count;
};

const validateCatalogueHeader = (catalogue, proposalHash) => {
  const errors = [];
  if (catalogue.proposalSha256 !== proposalHash)
    errors.push("Proposal SHA-256 binding does not match the controlled file.");
  if (
    catalogue.direction !== "OUTWARD" ||
    catalogue.localRole !== "INSTRUCTING_AGENT"
  )
    errors.push("Gate scope must remain OUTWARD / INSTRUCTING_AGENT only.");
  if (
    catalogue.profiles.length !== ALLOWED_PROFILES.size ||
    catalogue.profiles.some((profile) => !ALLOWED_PROFILES.has(profile))
  )
    errors.push("Gate contains a missing or out-of-scope profile.");
  return errors;
};

const validateFixtureBinding = (proposalCase, fixture) => {
  const errors = [];
  if (!fixture)
    return [
      `Explicit case ${proposalCase.caseId} has no controlled fixture binding.`,
    ];
  const unexpected = unexpectedContextKeys(fixture.execution?.governedContext);
  if (unexpected.length)
    errors.push(
      `Explicit case ${proposalCase.caseId} contains non-governed context keys: ${unexpected.join(", ")}.`,
    );
  if (fixture.stimulus?.caseId !== proposalCase.caseId)
    errors.push(
      `Explicit case ${proposalCase.caseId} stimulus trace does not match its case ID.`,
    );
  if (
    fixture.execution?.resolverRequest?.sourceMessageType !==
    proposalCase.request?.sourceMessageType
  )
    errors.push(
      `Explicit case ${proposalCase.caseId} request and fixture profile do not match.`,
    );
  return errors;
};

const validateExactOracle = (catalogue, proposalCase) => {
  const errors = [];
  if (
    !proposalCase.expected?.resolutionOutcome ||
    Array.isArray(proposalCase.expected?.resolutionOutcome) ||
    proposalCase.expected?.allowedResolutionOutcomes
  )
    errors.push(
      `Explicit case ${proposalCase.caseId} must have one exact outcome oracle.`,
    );
  for (const sideEffect of Object.keys(catalogue.sideEffects))
    if (proposalCase.expected?.[sideEffect] !== false)
      errors.push(
        `Explicit case ${proposalCase.caseId} does not assert ${sideEffect}=false.`,
      );
  return errors;
};

const validateExplicitCases = (catalogue, fixtures) => {
  const errors = [];
  const caseIds = new Set();
  const referencedBindings = new Set();
  for (const proposalCase of catalogue.cases ?? []) {
    if (!proposalCase.caseId || caseIds.has(proposalCase.caseId))
      errors.push(
        `Missing or duplicate explicit caseId: ${proposalCase.caseId}.`,
      );
    caseIds.add(proposalCase.caseId);
    referencedBindings.add(proposalCase.fixtureBindingId);
    if (
      !proposalCase.fixtureBindingId ||
      !proposalCase.executableTest ||
      !proposalCase.request ||
      !proposalCase.expected
    )
      errors.push(
        `Explicit case ${proposalCase.caseId} lacks fixture/request/expected/test binding.`,
      );
    errors.push(
      ...validateFixtureBinding(
        proposalCase,
        fixtures?.bindings?.[proposalCase.fixtureBindingId],
      ),
      ...validateExactOracle(catalogue, proposalCase),
    );
  }
  for (const fixtureBindingId of Object.keys(fixtures?.bindings ?? {}))
    if (!referencedBindings.has(fixtureBindingId))
      errors.push(`Controlled fixture ${fixtureBindingId} is orphaned.`);
  return { errors, caseIds };
};

const validateFrozenMatrices = (caseIds) => {
  const errors = [];
  const matrixCount = (prefix) =>
    [...caseIds].filter((caseId) => caseId.startsWith(prefix)).length;
  if (matrixCount("MT2-V1-RMA-") !== 12)
    errors.push("Frozen RMA matrix must contain exactly 12 independent cases.");
  if (matrixCount("MT2-V1-C81-") !== 24)
    errors.push(
      "Frozen C81 matrix must contain exactly 24 cases across four profiles.",
    );
  for (const profile of ["MT202", "MT202COV", "MT205", "MT205COV"])
    if (matrixCount(`MT2-V1-C81-${profile}-`) !== 6)
      errors.push(`Frozen C81 ${profile} matrix must contain exactly 6 cases.`);
  if (matrixCount("MT2-SSI-ATTESTATION-") !== 6)
    errors.push(
      "Frozen attestation matrix must contain exactly 6 independent cases.",
    );
  return errors;
};

const validateOutcomes = (catalogue) => {
  const errors = [];
  const outcomes = new Set(
    catalogue.groups.flatMap(({ outcomes: values }) => values),
  );
  for (const outcome of REQUIRED_OUTCOMES)
    if (!outcomes.has(outcome))
      errors.push(`Missing outcome coverage: ${outcome}`);
  for (const outcome of outcomes)
    if (!REQUIRED_OUTCOMES.has(outcome))
      errors.push(`Legacy or unsupported outcome: ${outcome}`);
  for (const [name, value] of Object.entries(catalogue.sideEffects))
    if (value !== false) errors.push(`${name} must be false.`);
  return { errors, outcomes };
};

export const validateProposalCases = (catalogue, proposalHash, fixtures) => {
  const errors = validateCatalogueHeader(catalogue, proposalHash);
  const expandedCaseCount = catalogue.groups.reduce(
    (sum, group) => sum + variantCount(group),
    0,
  );
  if (expandedCaseCount !== catalogue.expectedExpandedCaseCount)
    errors.push(
      `Expanded case count ${expandedCaseCount} does not match ${catalogue.expectedExpandedCaseCount}.`,
    );
  if (catalogue.cases?.length !== catalogue.expectedExpandedCaseCount)
    errors.push(
      `Explicit executable case count ${catalogue.cases?.length ?? 0} does not match ${catalogue.expectedExpandedCaseCount}.`,
    );
  const explicitCases = validateExplicitCases(catalogue, fixtures);
  const outcomeValidation = validateOutcomes(catalogue);
  errors.push(
    ...explicitCases.errors,
    ...validateFrozenMatrices(explicitCases.caseIds),
    ...outcomeValidation.errors,
  );
  return {
    errors,
    expandedCaseCount,
    outcomes: [...outcomeValidation.outcomes].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
};

export const proposalCaseReport = (catalogue, validation, caseResults) => ({
  status: catalogue.cases.every(
    ({ caseId }) => caseResults.get(caseId) === "PASS",
  )
    ? "PASS"
    : "FAIL",
  proposalSha256: catalogue.proposalSha256,
  scope: { direction: catalogue.direction, profiles: catalogue.profiles },
  expandedCaseCount: validation.expandedCaseCount,
  outcomes: validation.outcomes,
  sideEffects: catalogue.sideEffects,
  cases: catalogue.cases.map((proposalCase) => ({
    ...proposalCase,
    actual: caseResults.get(proposalCase.caseId) ?? "NOT_EXECUTED",
  })),
  legacyWorkbook: "INFORMATIONAL_ONLY",
});
