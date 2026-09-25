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

const variantCount = ({ variants, profileMatrix }) => {
  if (variants === "SINGLE") return 1;
  if (/^[A-Z]$/.test(variants)) return profileMatrix ? 4 : 1;
  const match = /^([A-Z])\.\.([A-Z])$/.exec(variants);
  if (!match) throw new Error(`Unsupported variant expression: ${variants}`);
  const count = match[2].charCodeAt(0) - match[1].charCodeAt(0) + 1;
  return profileMatrix ? count * 4 : count;
};

export const validateProposalCases = (catalogue, proposalHash, fixtures) => {
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
  const caseIds = new Set();
  for (const proposalCase of catalogue.cases ?? []) {
    if (!proposalCase.caseId || caseIds.has(proposalCase.caseId))
      errors.push(
        `Missing or duplicate explicit caseId: ${proposalCase.caseId}.`,
      );
    caseIds.add(proposalCase.caseId);
    if (
      !proposalCase.fixtureBindingId ||
      !proposalCase.executableTest ||
      !proposalCase.request ||
      !proposalCase.expected
    )
      errors.push(
        `Explicit case ${proposalCase.caseId} lacks fixture/request/expected/test binding.`,
      );
    if (!fixtures?.bindings?.[proposalCase.fixtureBindingId])
      errors.push(
        `Explicit case ${proposalCase.caseId} has no controlled fixture binding.`,
      );
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
  }
  const outcomes = new Set(
    catalogue.groups.flatMap(({ outcomes }) => outcomes),
  );
  for (const outcome of REQUIRED_OUTCOMES)
    if (!outcomes.has(outcome))
      errors.push(`Missing outcome coverage: ${outcome}`);
  for (const outcome of outcomes)
    if (!REQUIRED_OUTCOMES.has(outcome))
      errors.push(`Legacy or unsupported outcome: ${outcome}`);
  for (const [name, value] of Object.entries(catalogue.sideEffects))
    if (value !== false) errors.push(`${name} must be false.`);
  return { errors, expandedCaseCount, outcomes: [...outcomes].sort() };
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
