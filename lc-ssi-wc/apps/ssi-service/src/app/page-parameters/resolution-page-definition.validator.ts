import type {
  PageParameterEvidenceReference,
  PageParameterField,
  PageParameterProfile,
  PageParameterSequence,
  PageParameterValidationRule,
  ResolutionPageDefinition,
  ResolutionPageDefinitionQuery,
  ResolutionPageScenario,
} from "@ssi/contracts";
import { registeredPageAction } from "./resolution-page-action.registry";
import {
  scenarioNvrOutcome,
  scenarioValidationOwner,
  scenarioValidationTaxonomy,
} from "./page-parameter-validation-disposition";

const SHA256 = /^[a-f\d]{64}$/i;
const SCHEMA_VERSION = "1.0" as const;

const requireText = (value: string, code: string): void => {
  if (!value.trim()) throw new Error(code);
};

const requireUnique = (
  values: readonly string[],
  code: string,
): ReadonlySet<string> => {
  const unique = new Set(values);
  if (unique.size !== values.length) throw new Error(code);
  return unique;
};

const requireNonEmpty = (values: readonly unknown[], code: string): void => {
  if (!values.length) throw new Error(code);
};

const requireReferences = (
  values: readonly string[],
  available: ReadonlySet<string>,
  code: string,
): void => {
  if (values.some((value) => !available.has(value))) throw new Error(code);
};

const validateProfile = (
  profile: PageParameterProfile,
  query: ResolutionPageDefinitionQuery,
): void => {
  requireText(profile.profileId, "PAGE_PROFILE_ID_REQUIRED");
  requireText(
    profile.selectionBasis.businessScenarioId,
    "PAGE_PROFILE_SCENARIO_REQUIRED",
  );
  if (
    query.businessScenarioId &&
    profile.selectionBasis.businessScenarioId !== query.businessScenarioId
  )
    throw new Error("PAGE_PROFILE_SCENARIO_MISMATCH");

  if (profile.profileKind === "MT_TO_MX") {
    requireText(profile.businessService ?? "", "PAGE_PROFILE_BIZSVC_REQUIRED");
    requireText(
      profile.messageDefinitionId ?? "",
      "PAGE_PROFILE_MESSAGE_DEFINITION_REQUIRED",
    );
    if (
      !query.businessScenarioId ||
      !query.businessService ||
      profile.selectionBasis.businessService !== profile.businessService ||
      (query.businessService &&
        query.businessService !== profile.businessService)
    )
      throw new Error("PAGE_PROFILE_BIZSVC_MISMATCH");
    return;
  }

  if (
    profile.paymentExecutable ||
    profile.businessService !== undefined ||
    profile.messageDefinitionId !== undefined
  )
    throw new Error("FIN_REFERENCE_PROFILE_MUST_NOT_DECLARE_MX_METADATA");
};

const validateConstraint = (
  constraint: PageParameterField["constraints"][number],
): void => {
  if (constraint.kind === "PATTERN") {
    if (typeof constraint.value !== "string")
      throw new Error("PAGE_FIELD_PATTERN_REQUIRED");
    try {
      new RegExp(constraint.value);
    } catch {
      throw new Error("PAGE_FIELD_PATTERN_INVALID");
    }
  }
  if (
    ["MIN_LENGTH", "MAX_LENGTH"].includes(constraint.kind) &&
    (typeof constraint.value !== "number" ||
      !Number.isInteger(constraint.value) ||
      constraint.value < 0)
  )
    throw new Error("PAGE_FIELD_LENGTH_INVALID");
  if (
    constraint.kind === "ONE_OF" &&
    (!Array.isArray(constraint.value) ||
      !constraint.value.length ||
      constraint.value.some((value) => typeof value !== "string"))
  )
    throw new Error("PAGE_FIELD_ONE_OF_INVALID");
  if (constraint.kind === "DEPENDENCY" && typeof constraint.value !== "string")
    throw new Error("PAGE_FIELD_DEPENDENCY_INVALID");
};

const validateFieldOptions = (field: PageParameterField): void => {
  if (field.control !== "SELECT" && field.control !== "RADIO") return;
  if (!field.options?.length && !field.lookup && !field.optionSource)
    throw new Error("PAGE_FIELD_OPTIONS_REQUIRED");
  if (field.options)
    requireUnique(
      field.options.map(({ value }) => value),
      "DUPLICATE_PAGE_FIELD_OPTION",
    );
};

const validateField = (field: PageParameterField): void => {
  requireText(field.fieldId, "PAGE_FIELD_ID_REQUIRED");
  requireText(field.path, "PAGE_FIELD_PATH_REQUIRED");
  requireText(field.label, "PAGE_FIELD_LABEL_REQUIRED");
  if (!field.dataType) throw new Error("PAGE_FIELD_DATA_TYPE_REQUIRED");
  if (
    field.dataType === "SWIFT_BIC" &&
    !["BANK_SERVICE", "SSI_COUNTERPARTY"].includes(field.lookup?.provider ?? "")
  )
    throw new Error("SWIFT_BIC_LOOKUP_REQUIRED");
  if (field.lookup && !field.lookup.endpoint.startsWith("/api/"))
    throw new Error("PAGE_FIELD_LOOKUP_ENDPOINT_INVALID");
  validateFieldOptions(field);
  const constraintIds = field.constraints.map(
    ({ constraintId }) => constraintId,
  );
  requireUnique(constraintIds, "DUPLICATE_PAGE_FIELD_CONSTRAINT");
  field.constraints.forEach(validateConstraint);
};

const validateLookupDependencyOrder = (
  fields: readonly PageParameterField[],
): void => {
  const fieldsById = new Map(fields.map((field) => [field.fieldId, field]));
  for (const field of fields) {
    for (const dependencyId of field.lookup?.dependency?.dependsOnFieldIds ??
      []) {
      const dependency = fieldsById.get(dependencyId);
      if (!dependency)
        throw new Error("PAGE_LOOKUP_DEPENDENCY_FIELD_NOT_FOUND");
      if (
        dependency.displayOrder === undefined ||
        field.displayOrder === undefined
      )
        throw new Error("PAGE_LOOKUP_DISPLAY_ORDER_REQUIRED");
      if (dependency.displayOrder >= field.displayOrder)
        throw new Error("PAGE_LOOKUP_DEPENDENCY_ORDER_INVALID");
    }
  }
};

const validateSequence = (
  sequence: PageParameterSequence,
  fieldIds: ReadonlySet<string>,
): void => {
  requireText(sequence.sequenceId, "PAGE_SEQUENCE_ID_REQUIRED");
  requireText(sequence.label, "PAGE_SEQUENCE_LABEL_REQUIRED");
  requireReferences(
    sequence.fieldIds,
    fieldIds,
    "PAGE_SEQUENCE_FIELD_NOT_FOUND",
  );
};

const validateEvidence = (evidence: PageParameterEvidenceReference): void => {
  requireText(evidence.evidenceId, "PAGE_EVIDENCE_ID_REQUIRED");
  requireText(evidence.artifactId, "PAGE_EVIDENCE_ARTIFACT_REQUIRED");
  if (!SHA256.test(evidence.artifactSha256))
    throw new Error("PAGE_EVIDENCE_SHA256_INVALID");
};

const validateRule = (
  rule: PageParameterValidationRule,
  fieldIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
): void => {
  requireText(rule.ruleId, "PAGE_RULE_ID_REQUIRED");
  requireText(rule.reasonCode, "PAGE_RULE_REASON_CODE_REQUIRED");
  requireReferences(
    rule.appliesToFieldIds,
    fieldIds,
    "PAGE_RULE_FIELD_NOT_FOUND",
  );
  requireReferences(
    rule.evidenceIds,
    evidenceIds,
    "PAGE_RULE_EVIDENCE_NOT_FOUND",
  );
};

const validateScenarioFieldPolicy = (
  policy: NonNullable<ResolutionPageScenario["fieldPolicies"]>[number],
): void => {
  if (
    policy.applicability === "NOT_APPLICABLE" &&
    (policy.processingPolicy !== "IGNORE_AUDIT" ||
      policy.visibility !== "HIDDEN_EVIDENCE" ||
      policy.required ||
      !policy.readOnly)
  )
    throw new Error("PAGE_NOT_APPLICABLE_POLICY_INVALID");
  if (
    policy.inputOwnership === "SSI_DERIVED" &&
    (policy.visibility !== "HIDDEN_EVIDENCE" || !policy.readOnly)
  )
    throw new Error("PAGE_SSI_DERIVED_POLICY_INVALID");
  if (
    policy.inputOwnership === "TRANSACTION_USER" &&
    policy.applicability === "APPLICABLE" &&
    (policy.visibility !== "USER_INPUT" || policy.readOnly)
  )
    throw new Error("PAGE_TRANSACTION_USER_POLICY_INVALID");
  if (
    policy.inputOwnership === "TRANSACTION_CONTEXT" &&
    (policy.applicability !== "APPLICABLE" ||
      policy.visibility !== "HIDDEN_EVIDENCE" ||
      !policy.readOnly ||
      policy.processingPolicy !== "APPLY")
  )
    throw new Error("PAGE_TRANSACTION_CONTEXT_POLICY_INVALID");
};

const validateScenarioFieldPolicies = (
  scenario: ResolutionPageScenario,
  fieldIds: ReadonlySet<string>,
): void => {
  if (!scenario.fieldPolicies) return;
  const policyFieldIds = requireUnique(
    scenario.fieldPolicies.map(({ fieldId }) => fieldId),
    "DUPLICATE_PAGE_SCENARIO_FIELD_POLICY",
  );
  requireReferences(
    [...policyFieldIds],
    fieldIds,
    "PAGE_SCENARIO_FIELD_POLICY_NOT_FOUND",
  );
  if (
    scenario.fieldIds.length !== policyFieldIds.size ||
    scenario.fieldIds.some((fieldId) => !policyFieldIds.has(fieldId))
  )
    throw new Error("PAGE_SCENARIO_FIELD_POLICY_INCOMPLETE");
  scenario.fieldPolicies.forEach(validateScenarioFieldPolicy);
};

const validateScenarioExecution = (scenario: ResolutionPageScenario): void => {
  const registered = registeredPageAction(scenario.execution.action);
  if (!registered) throw new Error("PAGE_EXECUTION_REGISTRY_MISMATCH");
  if (
    scenario.execution.endpoint !== registered.endpoint ||
    scenario.execution.owner !== registered.owner
  )
    throw new Error("PAGE_EXECUTION_REGISTRY_MISMATCH");
  if (!scenario.execution.expectedHttp.length)
    throw new Error("PAGE_EXECUTION_HTTP_REQUIRED");
  if (
    scenario.execution.expectedHttp.some(
      (status) => !Number.isInteger(status) || status < 100 || status > 599,
    )
  )
    throw new Error("PAGE_EXECUTION_HTTP_INVALID");
};

const validateScenario = (
  scenario: ResolutionPageScenario,
  sequenceIds: ReadonlySet<string>,
  fieldIds: ReadonlySet<string>,
  rulesById: ReadonlyMap<string, PageParameterValidationRule>,
): void => {
  requireText(scenario.scenarioId, "PAGE_SCENARIO_ID_REQUIRED");
  requireText(scenario.label, "PAGE_SCENARIO_LABEL_REQUIRED");
  requireText(scenario.fixture.bindingId, "PAGE_FIXTURE_BINDING_REQUIRED");
  requireText(scenario.fixture.fixtureSet, "PAGE_FIXTURE_SET_REQUIRED");
  requireText(scenario.fixture.fixtureVersion, "PAGE_FIXTURE_VERSION_REQUIRED");
  if (!SHA256.test(scenario.fixture.sourceSha256))
    throw new Error("PAGE_FIXTURE_SHA256_INVALID");
  validateScenarioExecution(scenario);
  requireReferences(
    scenario.sequenceIds,
    sequenceIds,
    "PAGE_SCENARIO_SEQUENCE_NOT_FOUND",
  );
  requireReferences(
    scenario.fieldIds,
    fieldIds,
    "PAGE_SCENARIO_FIELD_NOT_FOUND",
  );
  validateScenarioFieldPolicies(scenario, fieldIds);
  requireReferences(
    scenario.validationRuleIds,
    new Set(rulesById.keys()),
    "PAGE_SCENARIO_RULE_NOT_FOUND",
  );
  const validationOwner = scenarioValidationOwner(scenario);
  const validationTaxonomy = scenarioValidationTaxonomy(scenario);
  if (
    scenarioNvrOutcome(scenario) === "NOT_EVALUATED" &&
    validationOwner !== "UPSTREAM_FIN_VALIDATOR"
  )
    throw new Error("PAGE_SCENARIO_NVR_DISPOSITION_INVALID");
  if (
    scenario.validationRuleIds.some(
      (ruleId) => rulesById.get(ruleId)?.owner !== validationOwner,
    )
  )
    throw new Error("PAGE_SCENARIO_RULE_OWNER_MISMATCH");
  if (
    scenario.validation.dispositions?.some(
      ({ owner, taxonomy, ruleIds }) =>
        owner !== validationOwner ||
        taxonomy !== validationTaxonomy ||
        ruleIds.some((ruleId) => !scenario.validationRuleIds.includes(ruleId)),
    )
  )
    throw new Error("PAGE_SCENARIO_VALIDATION_DISPOSITION_MISMATCH");
  const expectedIsolation = {
    POSITIVE: "CANONICAL",
    NEGATIVE: "TRANSACTIONAL_NEGATIVE",
    BOUNDARY: "BOUNDARY",
  } as const;
  if (scenario.fixture.isolation !== expectedIsolation[scenario.polarity])
    throw new Error("PAGE_SCENARIO_FIXTURE_ISOLATION_MISMATCH");
  const actionOwner = `${scenario.execution.action}:${scenario.execution.owner}`;
  if (
    ![
      "RESOLVE_SSI:SSI_FIELD_RESOLUTION_API",
      "VALIDATE_FIN:UPSTREAM_FIN_VALIDATOR",
      "PREVIEW_REFERENCE:SSI_FIELD_RESOLUTION_API",
    ].includes(actionOwner)
  )
    throw new Error("PAGE_EXECUTION_OWNER_MISMATCH");
};

const validateIdentity = (definition: ResolutionPageDefinition): void => {
  requireText(definition.definitionId, "PAGE_DEFINITION_ID_REQUIRED");
  requireText(definition.definitionVersion, "PAGE_DEFINITION_VERSION_REQUIRED");
  requireText(
    definition.source.catalogueVersion,
    "PAGE_CATALOGUE_VERSION_REQUIRED",
  );
  requireText(
    definition.source.sourceArtifactId,
    "PAGE_SOURCE_ARTIFACT_REQUIRED",
  );
  if (!SHA256.test(definition.source.sourceSha256))
    throw new Error("PAGE_SOURCE_SHA256_INVALID");
  if (
    Boolean(definition.source.snapshotId) !==
    Boolean(definition.source.snapshotIdentityMethod)
  )
    throw new Error("PAGE_SNAPSHOT_IDENTITY_INCOMPLETE");
};

const validateDisplayIdentity = (
  definition: ResolutionPageDefinition,
): void => {
  requireText(
    definition.display.familyCode,
    "PAGE_DISPLAY_FAMILY_CODE_REQUIRED",
  );
  requireText(
    definition.display.familyLabel,
    "PAGE_DISPLAY_FAMILY_LABEL_REQUIRED",
  );
  requireText(
    definition.display.categoryCode,
    "PAGE_DISPLAY_CATEGORY_CODE_REQUIRED",
  );
  requireText(
    definition.display.categoryLabel,
    "PAGE_DISPLAY_CATEGORY_LABEL_REQUIRED",
  );
};

const validateQueryMatch = (
  definition: ResolutionPageDefinition,
  query: ResolutionPageDefinitionQuery,
): void => {
  const expected = [
    query.standardsRelease,
    query.messageFamily,
    query.messageType,
    query.direction,
  ];
  const actual = [
    definition.standardsRelease,
    definition.messageFamily,
    definition.messageType,
    definition.direction,
  ];
  if (expected.some((value, index) => value !== actual[index]))
    throw new Error("PAGE_DEFINITION_QUERY_MISMATCH");
  if (
    query.businessDomain &&
    definition.businessDomain !== query.businessDomain
  )
    throw new Error("PAGE_DEFINITION_BUSINESS_DOMAIN_MISMATCH");
};

export const validateResolutionPageDefinition = (
  definition: ResolutionPageDefinition,
  query: ResolutionPageDefinitionQuery,
): void => {
  if (definition.schemaVersion !== SCHEMA_VERSION)
    throw new Error("UNSUPPORTED_PAGE_SCHEMA_VERSION");
  validateIdentity(definition);
  validateDisplayIdentity(definition);
  validateQueryMatch(definition, query);
  validateProfile(definition.profile, query);

  requireNonEmpty(definition.fields, "PAGE_FIELDS_REQUIRED");
  requireNonEmpty(definition.sequences, "PAGE_SEQUENCES_REQUIRED");
  requireNonEmpty(definition.scenarios, "PAGE_SCENARIOS_REQUIRED");
  requireNonEmpty(definition.validationRules, "PAGE_VALIDATION_RULES_REQUIRED");
  requireNonEmpty(definition.evidence, "PAGE_EVIDENCE_REQUIRED");

  definition.fields.forEach(validateField);
  const fieldIds = requireUnique(
    definition.fields.map(({ fieldId }) => fieldId),
    "DUPLICATE_PAGE_FIELD",
  );
  validateLookupDependencyOrder(definition.fields);
  const sequenceIds = requireUnique(
    definition.sequences.map(({ sequenceId }) => sequenceId),
    "DUPLICATE_PAGE_SEQUENCE",
  );
  definition.sequences.forEach((sequence) =>
    validateSequence(sequence, fieldIds),
  );
  if (
    definition.fields.some(
      ({ sequenceId }) => sequenceId && !sequenceIds.has(sequenceId),
    )
  )
    throw new Error("PAGE_FIELD_SEQUENCE_NOT_FOUND");
  definition.evidence.forEach(validateEvidence);
  const evidenceIds = requireUnique(
    definition.evidence.map(({ evidenceId }) => evidenceId),
    "DUPLICATE_PAGE_EVIDENCE",
  );
  requireUnique(
    definition.validationRules.map(({ ruleId }) => ruleId),
    "DUPLICATE_PAGE_RULE",
  );
  definition.validationRules.forEach((rule) =>
    validateRule(rule, fieldIds, evidenceIds),
  );
  const scenarioIds = requireUnique(
    definition.scenarios.map(({ scenarioId }) => scenarioId),
    "DUPLICATE_PAGE_SCENARIO",
  );
  if (!scenarioIds.has(definition.profile.selectionBasis.businessScenarioId))
    throw new Error("PAGE_PROFILE_SCENARIO_NOT_FOUND");
  const rulesById = new Map(
    definition.validationRules.map((rule) => [rule.ruleId, rule]),
  );
  definition.scenarios.forEach((scenario) =>
    validateScenario(scenario, sequenceIds, fieldIds, rulesById),
  );
};
