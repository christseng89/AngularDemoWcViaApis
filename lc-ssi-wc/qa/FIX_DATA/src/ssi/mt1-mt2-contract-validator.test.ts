import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  DomainSelectiveRepairOrchestrator,
  type ParameterDrivenDomainPolicy,
} from "./domain-selective-repair-orchestrator.ts";
import {
  NoInferenceContractValidator,
  type ContractArtifactSet,
} from "./mt1-mt2-contract-validator.ts";

const root = process.cwd();
const artifactRoot = resolve(root, "qa/FIX_DATA/ssi/mt1-mt2");
const readJson = (name: string) =>
  JSON.parse(readFileSync(resolve(artifactRoot, name), "utf8"));

const artifacts: ContractArtifactSet = {
  schema: readJson("rule-oracle.schema.v1.json"),
  payloads: readJson("schema-meta-test-payloads.v1.json"),
  vectors: readJson("schema-meta-test-vectors.v1.json"),
  apiCatalogue: readJson("api-execution-contract-catalogue.v1.json"),
  derivationCatalogue: readJson("derivation-tuple-catalogue.v1.json"),
  selectedIdentityManifest: readJson(
    "expected-selected-identity-manifest.v1.json",
  ),
  baEvidenceRegistry: readJson("ba-ruling-evidence-registry.v1.json"),
  oosCatalogue: readJson("out-of-scope-message-catalogue.v1.json"),
  controlledSourceRegistry: readJson("controlled-source-evidence-registry.v1.json"),
  qaEvidenceRegistry: readJson("qa-invariant-evidence-registry.v1.json"),
  productPolicyRegistry: readJson("product-policy-evidence-registry.v1.json"),
  ruleTable: readJson("repair-rule-table.v1.json"),
  oracle: readJson("test-oracle.v1.json"),
  partitionManifest: readJson("expected-partition-manifest.v1.json"),
  partitionRuling: readJson("round4-partition-ruling.v1.json"),
  partitionRulingSha256:
    "8EE334403C8CC94CF34B0470C7F7D4F2032C0E33645D065F0BB1110DE5B6FCA6",
  executionContexts: readJson("execution-context-catalogues.v1.json"),
  canonicalGroupManifest: readJson("canonical-group-manifest.v1.json"),
  activeInventory: readJson("active-inventory.v1.json"),
};

test("validates every positive and controlled negative without inference", () => {
  const result = new NoInferenceContractValidator(artifacts).validateMetaPack();

  assert.equal(result.positiveFailures, 0);
  assert.equal(result.negativeUnexpectedAcceptances, 0);
  assert.equal(result.unexpectedReasonOrPointer, 0);
  assert.equal(result.unexpectedNegativeDeltaFields, 0);
  assert.equal(result.positiveCount, 5);
  assert.equal(result.negativeCount, 19);
  assert.equal(result.unmappedVectors, 0);
});

test("rejects the CBPR owner forward mismatch and keeps the exact typed error", () => {
  const result = new NoInferenceContractValidator(artifacts).validateVector(
    "NEG-CBPR-OWNER-FORWARD-BINDING",
  );

  assert.equal(result.accepted, false);
  assert.equal(result.layer, "SCHEMA");
  assert.equal(result.keyword, "const");
  assert.equal(result.instancePath, "/validationExecutionMode");
});

test("binds counterparty type to governed bank, ANY bank, or Customer handling", () => {
  const baseline = artifacts.payloads.baselines.find(
    (entry) => entry.id === "BASE-GENERATE-CANONICAL-RULE-ROW",
  );
  if (!baseline) throw new Error("MISSING_GENERATE_CANONICAL_BASELINE");
  const validator = new NoInferenceContractValidator(artifacts);

  const anyBankWithSpecificBic = structuredClone(baseline.payload);
  anyBankWithSpecificBic.counterpartyType = "ANY_BANK";
  assert.equal(
    validator.validateReferencePayload(anyBankWithSpecificBic).accepted,
    false,
  );

  const bankWithAnyBic = structuredClone(baseline.payload);
  bankWithAnyBic.counterpartyType = "BANK";
  bankWithAnyBic.counterpartyBic = "ANY";
  assert.equal(
    validator.validateReferencePayload(bankWithAnyBic).accepted,
    false,
  );

  const customerTreatedAsBankSsi = structuredClone(baseline.payload);
  customerTreatedAsBankSsi.counterpartyType = "CUSTOMER";
  assert.equal(
    validator.validateReferencePayload(customerTreatedAsBankSsi).accepted,
    false,
  );

  const notApplicableExecutable = structuredClone(baseline.payload);
  notApplicableExecutable.counterpartyType = "NOT_APPLICABLE";
  notApplicableExecutable.counterpartyBic = "ANY";
  assert.equal(
    validator.validateReferencePayload(notApplicableExecutable).accepted,
    false,
  );

  const approvedAnySource = String(
    (artifacts.partitionRuling.anyBankAllowlist as Record<string, unknown>)
      .sourceIds instanceof Array
      ? (
          (artifacts.partitionRuling.anyBankAllowlist as Record<string, unknown>)
            .sourceIds as unknown[]
        )[0]
      : "",
  );
  const approvedCustomerSource = String(
    (artifacts.partitionRuling.customerOutOfScope as Record<string, unknown>)
      .sourceIds instanceof Array
      ? (
          (artifacts.partitionRuling.customerOutOfScope as Record<string, unknown>)
            .sourceIds as unknown[]
        )[0]
      : "",
  );
  const partitionBinding = (
    counterpartyType: "ANY_BANK" | "CUSTOMER",
    sourceRecordId: string,
    partitionRulingSha256 = artifacts.partitionRulingSha256,
  ) =>
    validator.validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256,
      counterpartyType,
      sourceRecordId,
    });

  assert.equal(partitionBinding("ANY_BANK", approvedAnySource).accepted, true);
  assert.equal(
    partitionBinding("CUSTOMER", approvedCustomerSource).accepted,
    true,
  );
  assert.equal(
    partitionBinding("ANY_BANK", "NOT-APPROVED").errorCode,
    "COUNTERPARTY_SOURCE_NOT_IN_APPROVED_PARTITION",
  );
  assert.equal(
    partitionBinding("CUSTOMER", "NOT-APPROVED").errorCode,
    "COUNTERPARTY_SOURCE_NOT_IN_APPROVED_PARTITION",
  );
  assert.equal(
    validator.validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256: artifacts.partitionRulingSha256,
      counterpartyType: "BANK",
      sourceRecordId: approvedAnySource,
    }).errorCode,
    "COUNTERPARTY_SOURCE_TYPE_MISMATCH",
  );
  assert.equal(
    validator.validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256: artifacts.partitionRulingSha256,
      counterpartyType: "BANK",
      sourceRecordId: approvedCustomerSource,
    }).errorCode,
    "COUNTERPARTY_SOURCE_TYPE_MISMATCH",
  );
  assert.equal(
    partitionBinding("ANY_BANK", approvedAnySource, "A".repeat(64)).errorCode,
    "PARTITION_RULING_SHA_MISMATCH",
  );

  const duplicateAnyPartition = structuredClone(artifacts);
  (
    (duplicateAnyPartition.partitionRuling.anyBankAllowlist as Record<string, unknown>)
      .sourceIds as unknown[]
  )[10] = approvedAnySource;
  assert.equal(
    new NoInferenceContractValidator(duplicateAnyPartition).validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256: artifacts.partitionRulingSha256,
      counterpartyType: "ANY_BANK",
      sourceRecordId: approvedAnySource,
    }).errorCode,
    "COUNTERPARTY_PARTITION_INVALID",
  );

  const duplicateCustomerPartition = structuredClone(artifacts);
  (
    (duplicateCustomerPartition.partitionRuling.customerOutOfScope as Record<
      string,
      unknown
    >).sourceIds as unknown[]
  )[4] = approvedCustomerSource;
  assert.equal(
    new NoInferenceContractValidator(
      duplicateCustomerPartition,
    ).validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256: artifacts.partitionRulingSha256,
      counterpartyType: "CUSTOMER",
      sourceRecordId: approvedCustomerSource,
    }).errorCode,
    "COUNTERPARTY_PARTITION_INVALID",
  );

  const appendedAnyDuplicate = structuredClone(artifacts);
  (
    (appendedAnyDuplicate.partitionRuling.anyBankAllowlist as Record<
      string,
      unknown
    >).sourceIds as unknown[]
  ).push(approvedAnySource);
  assert.equal(
    new NoInferenceContractValidator(appendedAnyDuplicate).validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256: artifacts.partitionRulingSha256,
      counterpartyType: "ANY_BANK",
      sourceRecordId: approvedAnySource,
    }).errorCode,
    "COUNTERPARTY_PARTITION_INVALID",
  );

  const appendedCustomerDuplicate = structuredClone(artifacts);
  (
    (appendedCustomerDuplicate.partitionRuling.customerOutOfScope as Record<
      string,
      unknown
    >).sourceIds as unknown[]
  ).push(approvedCustomerSource);
  assert.equal(
    new NoInferenceContractValidator(
      appendedCustomerDuplicate,
    ).validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256: artifacts.partitionRulingSha256,
      counterpartyType: "CUSTOMER",
      sourceRecordId: approvedCustomerSource,
    }).errorCode,
    "COUNTERPARTY_PARTITION_INVALID",
  );

  const overlappingPartition = structuredClone(artifacts);
  (
    (overlappingPartition.partitionRuling.customerOutOfScope as Record<
      string,
      unknown
    >).sourceIds as unknown[]
  )[4] = approvedAnySource;
  assert.equal(
    new NoInferenceContractValidator(overlappingPartition).validateReferencePayload({
      partitionRulingArtifactId:
        "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
      partitionRulingSha256: artifacts.partitionRulingSha256,
      counterpartyType: "ANY_BANK",
      sourceRecordId: approvedAnySource,
    }).errorCode,
    "COUNTERPARTY_PARTITION_INVALID",
  );
});

test("accepts complete governed ANY and Customer Rule baselines", () => {
  const generated = artifacts.payloads.baselines.find(
    (entry) => entry.id === "BASE-GENERATE-CANONICAL-RULE-ROW",
  );
  if (!generated) throw new Error("MISSING_GENERATE_CANONICAL_BASELINE");
  const governedArtifacts = structuredClone(artifacts);
  const anySourceId = String(
    (
      (governedArtifacts.partitionRuling.anyBankAllowlist as Record<
        string,
        unknown
      >).sourceIds as unknown[]
    )[0],
  );
  const customerSourceId = String(
    (
      (governedArtifacts.partitionRuling.customerOutOfScope as Record<
        string,
        unknown
      >).sourceIds as unknown[]
    )[0],
  );
  const anyRule = structuredClone(generated.payload);
  Object.assign(anyRule, {
    canonicalGroupKey: "PACS008-ANY-BASELINE",
    groupId: "PACS008-ANY-BASELINE",
    counterpartyType: "ANY_BANK",
    counterpartyBic: "ANY",
    sourceToken: "pacs.008.001.12",
    normalizedAlias: "pacs.008.001.12",
    conversionRuleId: "CONVERT-PACS008-12-TO-08",
    mutationDisposition: "CONVERT",
    targetLifecycle: "DRAFT",
    activationPath: "MAKER_CHECKER",
    activation: { targetLifecycle: "DRAFT", activationPath: "MAKER_CHECKER" },
    expectedReasonCode: "SOURCE_VERSION_CONVERTED",
    successorRecordId: "SSI-PACS008-ANY-V1",
    successorVersion: 1,
    amendmentOfId: anySourceId,
    expectedTargetAdded: 1,
    expectedSourceRemoved: 1,
  });
  anyRule.inputCondition = {
    sourceKind: "VERSION_CONVERSION_SOURCE",
    sourceRecordId: anySourceId,
    sourceVersion: 9,
    sourceLifecycle: "ACTIVE",
    sourceDatasetClass: "OPERATIONAL_POSITIVE",
    canonicalTargetPresent: false,
    covTokenPresent: false,
    family: "pacs.008",
    sourceAliasesPresent: ["pacs.008.001.12"],
    targetToken: "pacs.008.001.08",
    direction: "OUTBOUND",
    profile: "PLAIN",
    businessService: "swift.cbprplus.04",
    contextKey: "CTX-MT103-PLAIN-OUT",
    dependencyStatus: "CLOSED",
    executionContext: (
      governedArtifacts.executionContexts.contexts as Record<string, unknown>[]
    )[0],
  };
  anyRule.catalogueReferences = {
    routePreferenceId: "DIRECT",
    officialRoleId: "TAG-57A",
    lookupContractId: "NO-ACCOUNT-LOOKUP",
    profileVariantId: "PACS008-PLAIN",
    sequenceId: "SEQ-1",
    settlementLegId: "PRIMARY",
    derivationRuleId: "DERIVE-PACS008-ANY-OUT",
  };
  (governedArtifacts.derivationCatalogue.tuples as Record<string, unknown>[]).push({
    derivationRuleId: "DERIVE-PACS008-ANY-OUT",
    family: "pacs.008",
    messageIdentity: "pacs.008.001.12",
    direction: "OUTBOUND",
    profile: "PLAIN",
    businessService: "swift.cbprplus.04",
    routePreferenceId: "DIRECT",
    officialRoleId: "TAG-57A",
    lookupContractId: "NO-ACCOUNT-LOOKUP",
    profileVariantId: "PACS008-PLAIN",
    sequenceId: "SEQ-1",
    settlementLegId: "PRIMARY",
    executionContextId: "CTX-MT103-PLAIN-OUT",
    apiContractId: "API-SSI-RESOLVE-V1",
  });

  const addSelections = (row: Record<string, unknown>) => {
    const group = String(row.canonicalGroupKey);
    const selections = row.expectedSelections as Record<string, unknown>;
    for (const [kind, selection] of Object.entries(selections)) {
      (
        governedArtifacts.selectedIdentityManifest.pairs as Record<
          string,
          unknown
        >[]
      ).push({ scope: `${group}:${kind}`, ...(selection as object) });
    }
  };
  addSelections(anyRule);
  const validator = new NoInferenceContractValidator(governedArtifacts);
  assert.equal(validator.validateReferencePayload(anyRule).accepted, true);

  const customerRule = structuredClone(anyRule);
  Object.assign(customerRule, {
    canonicalGroupKey: "PACS008-CUSTOMER-OOS-BASELINE",
    groupId: "PACS008-CUSTOMER-OOS-BASELINE",
    counterpartyType: "CUSTOMER",
    counterpartyBic: "CUST0001",
    scopeStatus: "OUT_OF_SCOPE_CLOSED",
    reviewStatus: "OUT_OF_SCOPE_CLOSED",
    mutationDisposition: "OUT_OF_SCOPE",
    validation: {
      owner: "CBPR_USAGE_GUIDELINE_VALIDATOR",
      mode: "OUT_OF_SCOPE_CLOSED",
      finValidationStatus: "FIN_VALIDATION_NOT_EVALUATED",
      ssiLookup: "NOT_PERFORMED",
    },
    validationOwner: "CBPR_USAGE_GUIDELINE_VALIDATOR",
    validationExecutionMode: "OUT_OF_SCOPE_CLOSED",
    finValidationStatus: "FIN_VALIDATION_NOT_EVALUATED",
    activation: {
      targetLifecycle: "NOT_APPLICABLE",
      activationPath: "NOT_APPLICABLE",
    },
    targetLifecycle: "NOT_APPLICABLE",
    activationPath: "NOT_APPLICABLE",
    apiExecution: { submission: "PROHIBITED", apiContractId: "NOT_APPLICABLE" },
    expectedHttp: "NOT_APPLICABLE",
    expectedOutcomeCode: "OUT_OF_SCOPE_CLOSED",
    expectedReasonCode: "CUSTOMER_DATA_NOT_BANK_SSI",
    expectedCandidateCount: 0,
    expectedSelections: {
      route: { selection: "NOT_APPLICABLE" },
      account: { selection: "NOT_APPLICABLE" },
      ssi: { selection: "NOT_APPLICABLE" },
      applicability: { selection: "NOT_APPLICABLE" },
    },
    ssiLookup: "NOT_PERFORMED",
    ssiOwnedDenominator: false,
    oosDenominator: true,
    eligibilityDecision: "OUT_OF_SCOPE",
    successorRecordId: "NOT_APPLICABLE",
    successorVersion: "NOT_APPLICABLE",
    amendmentOfId: "NOT_APPLICABLE",
    expectedTargetAdded: 0,
    expectedSourceRemoved: 0,
    expectedRecordsChanged: 0,
    expectedRecordsUnchanged: 1,
    expectedSsiRowDelta: 0,
    expectedApplicabilityRowDelta: 0,
  });
  (customerRule.inputCondition as Record<string, unknown>).sourceRecordId =
    customerSourceId;
  addSelections(customerRule);
  assert.deepEqual(validator.validateReferencePayload(customerRule), {
    accepted: true,
  });
});

test("executes only the selected SSI policy and never invokes RMA", () => {
  const calls: string[] = [];
  const ssiPolicy: ParameterDrivenDomainPolicy<
    { readonly id: string },
    { readonly outcome: string }
  > = {
    domain: "SSI",
    evaluate(input, parameters) {
      calls.push(`SSI:${input.id}:${parameters.policyNamespace}`);
      return { outcome: "VALIDATED" };
    },
  };

  const orchestrator = new DomainSelectiveRepairOrchestrator(
    "SSI",
    ssiPolicy,
  );
  const result = orchestrator.execute(
    { id: "ROW-1" },
    { policyNamespace: "SSI_DEMO_CBPRPLUS_SR2026" },
  );

  assert.deepEqual(result.output, { outcome: "VALIDATED" });
  assert.deepEqual(calls, ["SSI:ROW-1:SSI_DEMO_CBPRPLUS_SR2026"]);
  assert.equal(result.evidence.selectedDomain, "SSI");
  assert.equal(result.evidence.ssiPolicyInvocations, 1);
  assert.equal(result.evidence.rmaPolicyInvocations, 0);
  assert.equal(result.evidence.otherDomainMutations, 0);
});

test("fails closed when a non-SSI policy is supplied", () => {
  assert.throws(
    () =>
      new DomainSelectiveRepairOrchestrator("SSI", {
        domain: "RMA",
        evaluate: () => ({ outcome: "INVALID" }),
      }),
    /DOMAIN_POLICY_MISMATCH:SSI:RMA/,
  );
});

test("fails closed when a non-SSI policy namespace is supplied", () => {
  const orchestrator = new DomainSelectiveRepairOrchestrator("SSI", {
    domain: "SSI",
    evaluate: () => ({ outcome: "INVALID" }),
  });
  assert.throws(
    () =>
      orchestrator.execute(
        { id: "ROW-1" },
        { policyNamespace: "RMA_REPAIR_POLICY" } as never,
      ),
    /POLICY_NAMESPACE_MISMATCH:SSI_DEMO_CBPRPLUS_SR2026:RMA_REPAIR_POLICY/,
  );
});

test("supports future selected identity pairs by exact id and version", () => {
  const selectedArtifacts = structuredClone(artifacts);
  selectedArtifacts.selectedIdentityManifest.pairs.push({
    scope: "TEST",
    selection: "SELECTED",
    id: "SSI-V2",
    version: 2,
  });
  const validator = new NoInferenceContractValidator(selectedArtifacts);

  assert.equal(
    validator.validateReferencePayload({
      selection: { selection: "SELECTED", id: "SSI-V2", version: 2 },
      manifestArtifactId:
        "SSI-MT1-MT2-EXPECTED-SELECTED-IDENTITY-MANIFEST-V1",
      scope: "TEST",
    }).accepted,
    true,
  );
  assert.equal(
    validator.validateReferencePayload({
      selection: { selection: "SELECTED", id: "SSI-V2", version: 3 },
      manifestArtifactId:
        "SSI-MT1-MT2-EXPECTED-SELECTED-IDENTITY-MANIFEST-V1",
      scope: "TEST",
    }).errorCode,
    "SELECTED_IDENTITY_VERSION_NOT_FOUND",
  );
  assert.equal(
    validator.validateReferencePayload({
      selection: { selection: "SELECTED", id: "SSI-V2", version: 2 },
      manifestArtifactId:
        "SSI-MT1-MT2-EXPECTED-SELECTED-IDENTITY-MANIFEST-V1",
      scope: "WRONG-SCOPE",
    }).errorCode,
    "SELECTED_IDENTITY_VERSION_NOT_FOUND",
  );
  assert.equal(
    validator.validateReferencePayload({
      selection: { selection: "SELECTED", id: "SSI-V2", version: 2 },
      manifestArtifactId: "WRONG-MANIFEST",
      scope: "TEST",
    }).errorCode,
    "SELECTED_MANIFEST_ID_MISMATCH",
  );
});

test("validates all evidence registries and full derivation tuples", () => {
  const validator = new NoInferenceContractValidator(artifacts);
  const normative = artifacts.controlledSourceRegistry.entries[0];
  assert.equal(
    validator.validateReferencePayload({
      ...normative,
      ruleCategory: "NORMATIVE",
      registryId: "CONTROLLED_SOURCE_REGISTER",
    }).accepted,
    true,
  );
  const tuple = artifacts.derivationCatalogue.tuples[0];
  assert.equal(
    validator.validateReferencePayload({
      ...tuple,
      contextKey: tuple.executionContextId,
    }).accepted,
    true,
  );
  assert.equal(
    validator.validateReferencePayload({
      ...tuple,
      contextKey: tuple.executionContextId,
      officialRoleId: "TAG-53A",
    }).errorCode,
    "DERIVATION_TUPLE_FIELD_MISMATCH",
  );
});

test("checks account requirement and current closure artifact reconciliation", () => {
  const validator = new NoInferenceContractValidator(artifacts);
  assert.equal(
    validator.validateReferencePayload({
      accountRequirement: "REQUIRED",
      oracleAccountCase: "OPTIONAL_PRESENT_VALID",
      inputAccountSelection: {
        case: "SINGLE_VALID",
        account: { id: "ACCOUNT-1", version: 1, reference: "REF-1" },
      },
    }).errorCode,
    "ACCOUNT_REQUIREMENT_CASE_MISMATCH",
  );
  for (const payload of [
    {
      accountRequirement: "REQUIRED",
      oracleAccountCase: "REQUIRED_PRESENT",
      inputAccountSelection: { case: "SINGLE_VALID" },
    },
    {
      accountRequirement: "REQUIRED",
      oracleAccountCase: "REQUIRED_MISSING",
      inputAccountSelection: { case: "ABSENT" },
    },
    {
      accountRequirement: "NOT_REQUIRED",
      oracleAccountCase: "NOT_APPLICABLE",
      inputAccountSelection: { case: "ABSENT" },
    },
  ]) {
    assert.equal(validator.validateReferencePayload(payload).accepted, true);
  }
  assert.deepEqual(validator.validateClosureArtifacts(), {
    schemaErrors: 0,
    canonicalGroups: 67,
    partitionGroups: 67,
    heldGroups: 0,
    executableGroups: 62,
    unknownGroups: 0,
    multipleGroups: 0,
    contextCount: 71,
    closureErrors: 0,
    aliasMultiplicityErrors: 0,
    aliasInventoryErrors: 0,
    ruleOracleJoinErrors: 0,
    nestedReferenceErrors: 0,
  });
});

test("detects bidirectional positive and negative meta-vector drift", () => {
  const missingPositive = structuredClone(artifacts);
  (
    missingPositive.vectors.positiveVectors as { id: string }[]
  ).splice(0, 1);
  assert.ok(
    new NoInferenceContractValidator(missingPositive).validateMetaPack()
      .unmappedVectors > 0,
  );

  const undeclaredPositive = structuredClone(artifacts);
  (undeclaredPositive.payloads.positiveVectors as unknown as Record<string, unknown>[]).push({
    id: "POS-UNDECLARED",
    baselineId: "BASE-SELECTED-IDENTITY",
    expected: { accepted: true },
  });
  assert.ok(
    new NoInferenceContractValidator(undeclaredPositive).validateMetaPack()
      .unmappedVectors > 0,
  );

  const missingNegativeDeclaration = structuredClone(artifacts);
  (
    missingNegativeDeclaration.vectors.negativeVectors as { id: string }[]
  ).splice(0, 1);
  assert.ok(
    new NoInferenceContractValidator(
      missingNegativeDeclaration,
    ).validateMetaPack().unmappedVectors > 0,
  );
});

test("recomputes the approved partition and alias reconciliation from pinned content", () => {
  const wrongPartition = structuredClone(artifacts);
  (
    wrongPartition.partitionManifest.completion as Record<string, unknown>
  ).executableGroups = 61;
  assert.ok(
    new NoInferenceContractValidator(wrongPartition).validateClosureArtifacts()
      .closureErrors > 0,
  );

  const wrongCanonicalCount = structuredClone(artifacts);
  wrongCanonicalCount.canonicalGroupManifest.groupCount = 0;
  assert.ok(
    new NoInferenceContractValidator(
      wrongCanonicalCount,
    ).validateClosureArtifacts().closureErrors > 0,
  );

  const wrongAlias = structuredClone(artifacts);
  wrongAlias.activeInventory.pacs009DualTokenActiveSsi = 31;
  assert.equal(
    new NoInferenceContractValidator(wrongAlias).validateClosureArtifacts()
      .aliasInventoryErrors,
    1,
  );
});

test("recursively rejects stale nested references in complete rule rows", () => {
  const baseline = artifacts.payloads.baselines.find(
    (entry) => entry.id === "BASE-GENERATE-CANONICAL-RULE-ROW",
  );
  if (!baseline) throw new Error("MISSING_GENERATE_CANONICAL_BASELINE");
  const validator = new NoInferenceContractValidator(artifacts);
  assert.equal(validator.validateReferencePayload(baseline.payload).accepted, true);

  const badSelection = structuredClone(baseline.payload);
  (
    (badSelection.expectedSelections as Record<string, unknown>).ssi as Record<
      string,
      unknown
    >
  ).id = "SSI-NOT-IN-MANIFEST";
  assert.equal(
    validator.validateReferencePayload(badSelection).errorCode,
    "SELECTED_IDENTITY_VERSION_NOT_FOUND",
  );

  const badEvidence = structuredClone(baseline.payload);
  (badEvidence.sourceEvidence as Record<string, unknown>[])[0].sourceSha256 =
    "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  assert.equal(
    validator.validateReferencePayload(badEvidence).errorCode,
    "EVIDENCE_SHA_MISMATCH",
  );

  const badDerivation = structuredClone(baseline.payload);
  (
    badDerivation.catalogueReferences as Record<string, unknown>
  ).officialRoleId = "TAG-53A";
  assert.equal(
    validator.validateReferencePayload(badDerivation).errorCode,
    "DERIVATION_TUPLE_FIELD_MISMATCH",
  );

  const closureArtifacts = structuredClone(artifacts);
  (closureArtifacts.ruleTable.rows as Record<string, unknown>[]).push(
    badEvidence,
  );
  assert.equal(
    new NoInferenceContractValidator(
      closureArtifacts,
    ).validateClosureArtifacts().nestedReferenceErrors,
    1,
  );
});

test("validates schema-shaped Oracle rows through their exact Rule join", () => {
  const baseline = artifacts.payloads.baselines.find(
    (entry) => entry.id === "BASE-GENERATE-CANONICAL-RULE-ROW",
  );
  if (!baseline) throw new Error("MISSING_GENERATE_CANONICAL_BASELINE");
  const rule = structuredClone(baseline.payload);
  const oracle: Record<string, unknown> = {
    canonicalGroupKey: rule.canonicalGroupKey,
    scopeStatus: rule.scopeStatus,
    reviewStatus: rule.reviewStatus,
    inputCondition: structuredClone(rule.inputCondition),
    disposition: rule.mutationDisposition,
    validation: structuredClone(rule.validation),
    activation: structuredClone(rule.activation),
    accountRuleKey: "NOT_APPLICABLE",
    accountCase: "NOT_APPLICABLE",
    expectedOutcomeCode: rule.expectedOutcomeCode,
    expectedReasonCode: rule.expectedReasonCode,
    apiExecution: structuredClone(rule.apiExecution),
    expectedHttp: rule.expectedHttp,
    expectedCandidateCount: rule.expectedCandidateCount,
    expectedSelections: structuredClone(rule.expectedSelections),
    effects: {
      payloadGenerated: rule.payloadGenerated,
      confirmed: rule.confirmed,
      postingCount: rule.expectedPostingCount,
      repairQueueCount: rule.expectedRepairCount,
      auditMutationCount: rule.expectedAuditCount,
      databaseWriteCount: rule.expectedDbWriteCount,
      stubCallCount: rule.expectedStubCallCount,
      stubRequestIdentity: rule.expectedStubRequestIdentity,
    },
    operationalVisibility: rule.operationalVisibility,
    qaVisibility: rule.qaVisibility,
    ssiOwnedDenominator: rule.ssiOwnedDenominator,
    oosDenominator: rule.oosDenominator,
    expectedTargetAdded: rule.expectedTargetAdded,
    expectedSourceRemoved: rule.expectedSourceRemoved,
    expectedRecordsChanged: rule.expectedRecordsChanged,
    expectedRecordsUnchanged: rule.expectedRecordsUnchanged,
    expectedSsiRowDelta: rule.expectedSsiRowDelta,
    expectedApplicabilityRowDelta: rule.expectedApplicabilityRowDelta,
    sourceEvidence: structuredClone(rule.sourceEvidence),
  };
  const joinedArtifacts = structuredClone(artifacts);
  (joinedArtifacts.ruleTable.rows as Record<string, unknown>[]).push(rule);
  (joinedArtifacts.oracle.rows as Record<string, unknown>[]).push(oracle);
  const validator = new NoInferenceContractValidator(joinedArtifacts);
  assert.equal(validator.validateReferencePayload(oracle).accepted, true);
  assert.equal(validator.validateClosureArtifacts().nestedReferenceErrors, 0);

  const staleEvidence = structuredClone(oracle);
  (staleEvidence.sourceEvidence as Record<string, unknown>[])[0].sourceSha256 =
    "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  assert.equal(
    validator.validateReferencePayload(staleEvidence).errorCode,
    "EVIDENCE_SHA_MISMATCH",
  );

  const mismatchedVisibility = structuredClone(oracle);
  mismatchedVisibility.operationalVisibility = true;
  assert.equal(
    validator.validateReferencePayload(mismatchedVisibility).errorCode,
    "RULE_ORACLE_FIELD_MISMATCH",
  );
});

test("closes one OPTIONAL Rule against all four case-specific Oracle rows", () => {
  const baseline = artifacts.payloads.baselines.find(
    (entry) => entry.id === "BASE-GENERATE-CANONICAL-RULE-ROW",
  );
  if (!baseline) throw new Error("MISSING_GENERATE_CANONICAL_BASELINE");
  const rule = structuredClone(baseline.payload);
  rule.accountRequirement = "OPTIONAL";
  const ruleAccount = (
    (rule.inputCondition as Record<string, unknown>)
      .executionContext as Record<string, unknown>
  ).account as Record<string, unknown>;
  Object.assign(ruleAccount, {
    requirement: "OPTIONAL_VALIDATE_IF_PRESENT",
    ownerRole: "OWN_ENTITY",
    servicerRole: "COUNTERPARTY",
    relationship: "DEMO-RELATIONSHIP",
    purpose: "DEMO-PURPOSE",
    suppliedAccounts: { case: "ABSENT" },
  });
  const ruleInput = rule.inputCondition as Record<string, unknown>;
  ruleInput.contextKey = "CTX-MT103-OPTIONAL-OUT";
  (
    ruleInput.executionContext as Record<string, unknown>
  ).contextId = "CTX-MT103-OPTIONAL-OUT";
  (
    rule.catalogueReferences as Record<string, unknown>
  ).derivationRuleId = "DERIVE-MT103-OPTIONAL-OUT";
  Object.assign(rule, {
    accountRuleKey: "ACCOUNT-RULE-MT103-OPTIONAL",
    optionalAccountAbsentOutcome: "NO_ELIGIBLE_SSI",
    optionalAccountPresentValidOutcome: "ELIGIBLE_SSI_SELECTED",
    optionalAccountPresentInvalidOutcome: "VALIDATION_REJECTED",
    optionalAccountMultipleOutcome: "AMBIGUOUS_SSI",
  });

  const accountCases = [
    ["OPTIONAL_ABSENT", { case: "ABSENT" }, "NO_ELIGIBLE_SSI"],
    [
      "OPTIONAL_PRESENT_VALID",
      { case: "SINGLE_VALID", account: { id: "A1", version: 1, reference: "R1" } },
      "ELIGIBLE_SSI_SELECTED",
    ],
    [
      "OPTIONAL_PRESENT_INVALID",
      {
        case: "SINGLE_INVALID",
        account: { id: "A1", version: 1, reference: "R1" },
        invalidReasonCode: "ACCOUNT_INVALID",
      },
      "VALIDATION_REJECTED",
    ],
    [
      "OPTIONAL_MULTIPLE",
      {
        case: "MULTIPLE",
        accounts: [
          { id: "A1", version: 1, reference: "R1" },
          { id: "A2", version: 1, reference: "R2" },
        ],
      },
      "AMBIGUOUS_SSI",
    ],
  ] as const;
  const oracles = accountCases.map(([accountCase, suppliedAccounts, outcome]) => {
    const inputCondition = structuredClone(rule.inputCondition) as Record<
      string,
      unknown
    >;
    const account = (
      inputCondition.executionContext as Record<string, unknown>
    ).account as Record<string, unknown>;
    account.suppliedAccounts = suppliedAccounts;
    const expectedSelections = structuredClone(rule.expectedSelections) as Record<
      string,
      unknown
    >;
    expectedSelections.account =
      accountCase === "OPTIONAL_PRESENT_VALID"
        ? { selection: "SELECTED", id: "ACC-A1", version: 1 }
        : accountCase === "OPTIONAL_ABSENT"
          ? { selection: "NOT_APPLICABLE" }
          : { selection: "NOT_SELECTED" };
    return {
      canonicalGroupKey: rule.canonicalGroupKey,
      scopeStatus: rule.scopeStatus,
      reviewStatus: rule.reviewStatus,
      inputCondition,
      disposition: rule.mutationDisposition,
      validation: structuredClone(rule.validation),
      activation: structuredClone(rule.activation),
      accountRuleKey: rule.accountRuleKey,
      accountCase,
      expectedOutcomeCode: outcome,
      expectedReasonCode: rule.expectedReasonCode,
      apiExecution: structuredClone(rule.apiExecution),
      expectedHttp: rule.expectedHttp,
      expectedCandidateCount: rule.expectedCandidateCount,
      expectedSelections,
      effects: {
        payloadGenerated: rule.payloadGenerated,
        confirmed: rule.confirmed,
        postingCount: rule.expectedPostingCount,
        repairQueueCount: rule.expectedRepairCount,
        auditMutationCount: rule.expectedAuditCount,
        databaseWriteCount: rule.expectedDbWriteCount,
        stubCallCount: rule.expectedStubCallCount,
        stubRequestIdentity: rule.expectedStubRequestIdentity,
      },
      operationalVisibility: rule.operationalVisibility,
      qaVisibility: rule.qaVisibility,
      ssiOwnedDenominator: rule.ssiOwnedDenominator,
      oosDenominator: rule.oosDenominator,
      expectedTargetAdded: rule.expectedTargetAdded,
      expectedSourceRemoved: rule.expectedSourceRemoved,
      expectedRecordsChanged: rule.expectedRecordsChanged,
      expectedRecordsUnchanged: rule.expectedRecordsUnchanged,
      expectedSsiRowDelta: rule.expectedSsiRowDelta,
      expectedApplicabilityRowDelta: rule.expectedApplicabilityRowDelta,
      sourceEvidence: structuredClone(rule.sourceEvidence),
    };
  });
  const optionalArtifacts = structuredClone(artifacts);
  optionalArtifacts.selectedIdentityManifest.pairs.push(
    {
      scope: `${String(rule.canonicalGroupKey)}:account`,
      selection: "SELECTED",
      id: "ACC-A1",
      version: 1,
    },
    {
      scope: `${String(rule.canonicalGroupKey)}:account`,
      selection: "NOT_SELECTED",
    },
  );
  (
    optionalArtifacts.executionContexts.contexts as Record<string, unknown>[]
  ).push(structuredClone(ruleInput.executionContext as Record<string, unknown>));
  const optionalTuple = structuredClone(
    optionalArtifacts.derivationCatalogue.tuples.find(
      (entry) => entry.derivationRuleId === "DERIVE-MT103-PLAIN-OUT",
    ),
  );
  if (!optionalTuple) throw new Error("MISSING_MT103_DERIVATION_TUPLE");
  optionalTuple.derivationRuleId = "DERIVE-MT103-OPTIONAL-OUT";
  optionalTuple.executionContextId = "CTX-MT103-OPTIONAL-OUT";
  (optionalArtifacts.derivationCatalogue.tuples as Record<string, unknown>[]).push(
    optionalTuple,
  );
  (optionalArtifacts.ruleTable.rows as Record<string, unknown>[]).push(rule);
  (optionalArtifacts.oracle.rows as Record<string, unknown>[]).push(...oracles);
  const validator = new NoInferenceContractValidator(optionalArtifacts);
  const closure = validator.validateClosureArtifacts();
  assert.equal(closure.schemaErrors, 0);
  assert.equal(closure.ruleOracleJoinErrors, 0);
  assert.equal(closure.nestedReferenceErrors, 0);

  const wrongOutcome = structuredClone(oracles[0]);
  wrongOutcome.expectedOutcomeCode = "ELIGIBLE_SSI_SELECTED";
  assert.equal(
    validator.validateReferencePayload(wrongOutcome).errorCode,
    "RULE_ORACLE_FIELD_MISMATCH",
  );
  const wrongRuleKey = structuredClone(oracles[0]);
  wrongRuleKey.accountRuleKey = "UNAPPROVED-ACCOUNT-RULE";
  assert.equal(
    validator.validateReferencePayload(wrongRuleKey).errorCode,
    "ACCOUNT_RULE_KEY_NOT_APPROVED",
  );
  const wrongAccountSelection = structuredClone(oracles[1]);
  (wrongAccountSelection.expectedSelections as Record<string, unknown>).account = {
    selection: "SELECTED",
    id: "ACCOUNT-NOT-IN-MANIFEST",
    version: 999,
  };
  assert.equal(
    validator.validateReferencePayload(wrongAccountSelection).errorCode,
    "SELECTED_IDENTITY_VERSION_NOT_FOUND",
  );
});
