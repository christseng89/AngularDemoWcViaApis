import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

type JsonObject = Record<string, unknown>;

const canonicalize = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonicalize)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as JsonObject)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalize(item)]),
        )
      : value;

const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

interface Baseline {
  readonly id: string;
  readonly target: string;
  readonly payload: JsonObject;
}

interface MutationOperation {
  readonly op: "add" | "replace" | "remove";
  readonly path: string;
  readonly value?: unknown;
}

interface ExpectedResult {
  readonly accepted: boolean;
  readonly layer?: "SCHEMA" | "FK" | "JOIN";
  readonly keyword?: string;
  readonly errorCode?: string;
  readonly instancePath?: string;
}

interface MetaVector {
  readonly id: string;
  readonly baselineId: string;
  readonly operations?: readonly MutationOperation[];
  readonly allowedDeltaFields?: readonly string[];
  readonly expected: ExpectedResult;
}

interface MetaPayloadArtifact {
  readonly baselines: readonly Baseline[];
  readonly positiveVectors: readonly MetaVector[];
  readonly negativeVectors: readonly MetaVector[];
}

interface MetaVectorArtifact {
  readonly positiveVectors: readonly { readonly id: string }[];
  readonly negativeVectors: readonly { readonly id: string }[];
  readonly coverageMap: Readonly<Record<string, string>>;
  readonly requiredClosure: Readonly<Record<string, number>>;
}

interface EntriesArtifact extends JsonObject {
  readonly entries: readonly JsonObject[];
}

interface RowsArtifact extends JsonObject {
  readonly rows: readonly JsonObject[];
}

interface PairsArtifact extends JsonObject {
  readonly pairs: JsonObject[];
}

interface TuplesArtifact extends JsonObject {
  readonly tuples: readonly JsonObject[];
}

export interface ContractArtifactSet {
  readonly schema: JsonObject;
  readonly payloads: MetaPayloadArtifact;
  readonly vectors: MetaVectorArtifact;
  readonly apiCatalogue: JsonObject;
  readonly derivationCatalogue: TuplesArtifact;
  readonly selectedIdentityManifest: PairsArtifact;
  readonly baEvidenceRegistry: JsonObject;
  readonly oosCatalogue: JsonObject;
  readonly controlledSourceRegistry: EntriesArtifact;
  readonly qaEvidenceRegistry: EntriesArtifact;
  readonly productPolicyRegistry: EntriesArtifact;
  readonly ruleTable: RowsArtifact;
  readonly oracle: RowsArtifact;
  readonly partitionManifest: JsonObject;
  readonly partitionRuling: JsonObject;
  readonly partitionRulingSha256: string;
  readonly executionContexts: JsonObject;
  readonly canonicalGroupManifest: JsonObject;
  readonly activeInventory: JsonObject;
}

export interface VectorValidationResult {
  readonly id: string;
  readonly accepted: boolean;
  readonly layer?: "SCHEMA" | "FK" | "JOIN";
  readonly keyword?: string;
  readonly errorCode?: string;
  readonly instancePath?: string;
}

const asObjects = (value: unknown): readonly JsonObject[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is JsonObject =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      )
    : [];

const property = (input: JsonObject, name: string): unknown => input[name];

const stringProperty = (input: JsonObject, name: string): string =>
  String(property(input, name) ?? "");

const decodePointer = (value: string) =>
  value.replaceAll("~1", "/").replaceAll("~0", "~");

const mutate = (
  baseline: JsonObject,
  operations: readonly MutationOperation[],
): JsonObject => {
  const result = structuredClone(baseline);
  for (const operation of operations) {
    const segments = operation.path.split("/").slice(1).map(decodePointer);
    let cursor: unknown = result;
    for (const segment of segments.slice(0, -1)) {
      if (typeof cursor !== "object" || cursor === null) {
        throw new Error(`INVALID_MUTATION_PATH:${operation.path}`);
      }
      cursor = (cursor as JsonObject)[segment];
    }
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`INVALID_MUTATION_PATH:${operation.path}`);
    }
    const key = segments.at(-1);
    if (key === undefined) throw new Error(`INVALID_MUTATION_PATH:${operation.path}`);
    if (operation.op === "remove") {
      if (Array.isArray(cursor)) cursor.splice(Number(key), 1);
      else delete (cursor as JsonObject)[key];
    } else if (Array.isArray(cursor)) {
      cursor[Number(key)] = operation.value;
    } else {
      (cursor as JsonObject)[key] = operation.value;
    }
  }
  return result;
};

const schemaError = (
  id: string,
  errors: readonly ErrorObject[],
  expected: ExpectedResult,
): VectorValidationResult => {
  const match = errors.find(
    (error) =>
      error.keyword === expected.keyword &&
      error.instancePath === expected.instancePath,
  );
  const selected = match ?? errors[0];
  return {
    id,
    accepted: false,
    layer: "SCHEMA",
    keyword: selected?.keyword,
    instancePath: selected?.instancePath,
  };
};

export class NoInferenceContractValidator {
  private readonly baselines: ReadonlyMap<string, Baseline>;
  private readonly vectors: ReadonlyMap<string, MetaVector>;
  private readonly ajv: Ajv2020;
  private readonly artifacts: ContractArtifactSet;

  constructor(artifacts: ContractArtifactSet) {
    this.artifacts = artifacts;
    this.baselines = new Map(
      artifacts.payloads.baselines.map((baseline) => [baseline.id, baseline]),
    );
    this.vectors = new Map(
      [
        ...artifacts.payloads.positiveVectors,
        ...artifacts.payloads.negativeVectors,
      ].map((vector) => [vector.id, vector]),
    );
    this.ajv = new Ajv2020({ strict: true, allErrors: true });
    this.ajv.addSchema(artifacts.schema);
  }

  validateMetaPack(): {
    readonly positiveFailures: number;
    readonly negativeUnexpectedAcceptances: number;
    readonly unexpectedReasonOrPointer: number;
    readonly unexpectedNegativeDeltaFields: number;
    readonly positiveCount: number;
    readonly negativeCount: number;
    readonly unmappedVectors: number;
  } {
    const positives = this.artifacts.payloads.positiveVectors.map((vector) =>
      this.validateVector(vector.id),
    );
    const negatives = this.artifacts.payloads.negativeVectors.map((vector) =>
      this.validateVector(vector.id),
    );
    return {
      positiveFailures: positives.filter((result) => !result.accepted).length,
      negativeUnexpectedAcceptances: negatives.filter((result) => result.accepted)
        .length,
      unexpectedReasonOrPointer: negatives.filter((result, index) => {
        const expected = this.artifacts.payloads.negativeVectors[index].expected;
        return (
          result.layer !== expected.layer ||
          result.keyword !== expected.keyword ||
          result.errorCode !== expected.errorCode ||
          result.instancePath !== expected.instancePath
        );
      }).length,
      unexpectedNegativeDeltaFields: this.artifacts.payloads.negativeVectors.filter(
        (vector) =>
          canonicalJson(vector.operations?.map((operation) => operation.path) ?? []) !==
          canonicalJson(vector.allowedDeltaFields ?? []),
      ).length,
      positiveCount: positives.length,
      negativeCount: negatives.length,
      unmappedVectors: this.unmappedVectorCount(),
    };
  }

  validateReferencePayload(payload: JsonObject): Omit<VectorValidationResult, "id"> {
    if (
      "canonicalGroupKey" in payload &&
      "inputCondition" in payload &&
      "expectedSelections" in payload
    ) {
      const schemaId = String(this.artifacts.schema.$id);
      const target = "effects" in payload ? "oracleRow" : "ruleRow";
      const validate = this.ajv.compile({ $ref: `${schemaId}#/$defs/${target}` });
      const schemaAccepted = validate(payload);
      if (!schemaAccepted) {
        return schemaError("REFERENCE_PAYLOAD", validate.errors ?? [], {
          accepted: false,
        });
      }
    }
    return this.validatePinnedReference(payload);
  }

  validateClosureArtifacts(): {
    readonly schemaErrors: number;
    readonly canonicalGroups: number;
    readonly partitionGroups: number;
    readonly heldGroups: number;
    readonly executableGroups: number;
    readonly unknownGroups: number;
    readonly multipleGroups: number;
    readonly contextCount: number;
    readonly closureErrors: number;
    readonly aliasMultiplicityErrors: number;
    readonly aliasInventoryErrors: number;
    readonly ruleOracleJoinErrors: number;
    readonly nestedReferenceErrors: number;
  } {
    const rootValidate = this.ajv.compile(this.artifacts.schema);
    const schemaErrors = [this.artifacts.ruleTable, this.artifacts.oracle].filter(
      (document) => !rootValidate(document),
    ).length;
    const keys = Array.isArray(this.artifacts.canonicalGroupManifest.canonicalGroupKeys)
      ? this.artifacts.canonicalGroupManifest.canonicalGroupKeys
      : [];
    const completion = this.artifacts.partitionManifest.completion as JsonObject;
    const contexts = Array.isArray(this.artifacts.executionContexts.contexts)
      ? this.artifacts.executionContexts.contexts
      : [];
    const uniqueKeys = new Set(keys.map(String));
    const rules = this.artifacts.ruleTable.rows;
    const oracleRows = this.artifacts.oracle.rows;
    const partitions = this.artifacts.partitionManifest.partitions as JsonObject;
    const assignmentCount = new Map<string, number>(
      [...uniqueKeys].map((key) => [key, 0]),
    );
    let partitionContractErrors = 0;
    const heldPartition = "HOLD_DEPENDENCY";
    let recomputedHeld = 0;
    let recomputedExecutable = 0;
    for (const [partitionName, entries] of Object.entries(partitions ?? {})) {
      for (const entry of asObjects(entries)) {
        const key = stringProperty(entry, "canonicalGroupKey");
        if (key) {
          assignmentCount.set(key, (assignmentCount.get(key) ?? 0) + 1);
          if (partitionName === heldPartition) recomputedHeld += 1;
          else if (partitionName !== "OUT_OF_SCOPE") recomputedExecutable += 1;
        }
        const isManifestSentinel = "canonicalGroupManifestId" in entry;
        if (isManifestSentinel) {
          const validSentinel =
            partitionName === heldPartition &&
            stringProperty(entry, "canonicalGroupManifestId") ===
              stringProperty(this.artifacts.canonicalGroupManifest, "artifactId") &&
            Number(entry.groupCount) === uniqueKeys.size;
          if (!validSentinel) {
            partitionContractErrors += 1;
            continue;
          }
          for (const manifestKey of uniqueKeys) {
            assignmentCount.set(
              manifestKey,
              (assignmentCount.get(manifestKey) ?? 0) + 1,
            );
          }
          recomputedHeld += uniqueKeys.size;
        }
      }
    }
    const membershipErrors = [...assignmentCount.values()].filter(
      (count) => count !== 1,
    ).length;
    const aliasMultiplicityErrors = rules.filter((row) => {
      const input = property(row, "inputCondition") as JsonObject;
      const aliases = property(input, "sourceAliasesPresent");
      return Array.isArray(aliases) && new Set(aliases.map(String)).size !== aliases.length;
    }).length;
    let ruleOracleJoinErrors = rules.filter((rule) => {
      const groupKey = stringProperty(rule, "canonicalGroupKey");
      const matches = oracleRows.filter(
        (oracle) => stringProperty(oracle, "canonicalGroupKey") === groupKey,
      );
      const requirement = stringProperty(rule, "accountRequirement");
      if (requirement === "OPTIONAL") {
        const requiredCases = new Set([
          "OPTIONAL_ABSENT",
          "OPTIONAL_PRESENT_VALID",
          "OPTIONAL_PRESENT_INVALID",
          "OPTIONAL_MULTIPLE",
        ]);
        for (const match of matches) requiredCases.delete(stringProperty(match, "accountCase"));
        return requiredCases.size !== 0 || matches.length !== 4;
      }
      if (matches.length !== 1) return true;
      const expectedCase: Readonly<Record<string, string>> = {
        REQUIRED: "REQUIRED_PRESENT",
        NOT_REQUIRED: "NOT_APPLICABLE",
      };
      return (
        stringProperty(matches[0], "accountCase") !== expectedCase[requirement] ||
        !this.ruleOraclePairMatches(rule, matches[0])
      );
    }).length;
    const executableKeys = [...assignmentCount.entries()]
      .filter(([key, count]) => count === 1 && !this.isHeldKey(key, partitions))
      .map(([key]) => key);
    for (const key of executableKeys) {
      if (rules.filter((row) => stringProperty(row, "canonicalGroupKey") === key).length !== 1)
        ruleOracleJoinErrors += 1;
    }
    const unknownRows = [...rules, ...oracleRows].filter(
      (row) => !uniqueKeys.has(stringProperty(row, "canonicalGroupKey")),
    ).length;
    const reconciliation = this.artifacts.canonicalGroupManifest
      .reconciliation as JsonObject;
    const activeMemberships = this.artifacts.activeInventory
      .activeMemberships as JsonObject;
    const activeSsi = activeMemberships.ssi as JsonObject;
    const dualExpected = Number(reconciliation.pacs009DualTokenGroups ?? -2);
    const sourceOnlyExpected = Number(reconciliation.pacs009SourceOnlyGroups ?? -2);
    const dualActual = Number(this.artifacts.activeInventory.pacs009DualTokenActiveSsi ?? -1);
    const sourceOnlyActual = Number(
      this.artifacts.activeInventory.pacs009SourceOnlyActiveSsi ?? -1,
    );
    const aliasInventoryErrors =
      Number(activeSsi["pacs.008.001.12"] ?? -1) ===
        Number(reconciliation.pacs008Groups ?? -2) &&
      Number(activeSsi["pacs.009.001.12"] ?? -1) ===
        Number(reconciliation.pacs009Groups ?? -2) &&
      dualActual === dualExpected &&
      sourceOnlyActual === sourceOnlyExpected &&
      dualActual + sourceOnlyActual === Number(reconciliation.pacs009Groups ?? -2) &&
      dualActual <= Number(activeSsi["pacs.009.001.08"] ?? -1)
        ? 0
        : 1;
    const completionErrors =
      (Number(this.artifacts.canonicalGroupManifest.groupCount ?? -1) ===
      uniqueKeys.size
        ? 0
        : 1) +
      (Number(reconciliation.total ?? -1) === uniqueKeys.size ? 0 : 1) +
      (Number(completion.totalGroups ?? -1) === uniqueKeys.size ? 0 : 1) +
      (Number(completion.heldGroups ?? -1) === recomputedHeld ? 0 : 1) +
      (Number(completion.executableGroups ?? -1) === recomputedExecutable ? 0 : 1) +
      (Number(completion.unknown ?? -1) === 0 ? 0 : 1) +
      (Number(completion.multiple ?? -1) === 0 ? 0 : 1);
    const nestedReferenceErrors =
      rules.filter((row) => !this.validateRuleRow(row).accepted).length +
      oracleRows.filter((row) => !this.validateOracleRow(row).accepted).length;
    return {
      schemaErrors,
      canonicalGroups: keys.length,
      partitionGroups: Number(completion.totalGroups ?? -1),
      heldGroups: Number(completion.heldGroups ?? -1),
      executableGroups: Number(completion.executableGroups ?? -1),
      unknownGroups: Number(completion.unknown ?? -1),
      multipleGroups: Number(completion.multiple ?? -1),
      contextCount: contexts.length,
      closureErrors:
        membershipErrors +
        partitionContractErrors +
        completionErrors +
        unknownRows +
        (uniqueKeys.size === keys.length ? 0 : keys.length - uniqueKeys.size),
      aliasMultiplicityErrors,
      aliasInventoryErrors,
      ruleOracleJoinErrors,
      nestedReferenceErrors,
    };
  }

  private unmappedVectorCount(): number {
    const declared = [
      ...this.artifacts.vectors.positiveVectors.map((entry) => entry.id),
      ...this.artifacts.vectors.negativeVectors.map((entry) => entry.id),
    ];
    const payload = [
      ...this.artifacts.payloads.positiveVectors.map((entry) => entry.id),
      ...this.artifacts.payloads.negativeVectors.map((entry) => entry.id),
    ];
    const coverageKeys = Object.keys(this.artifacts.vectors.coverageMap);
    const coverageValues = Object.values(this.artifacts.vectors.coverageMap);
    const universe = new Set([...declared, ...payload, ...coverageKeys, ...coverageValues]);
    return [...universe].filter(
      (id) =>
        declared.filter((value) => value === id).length !== 1 ||
        payload.filter((value) => value === id).length !== 1 ||
        coverageKeys.filter((value) => value === id).length !== 1 ||
        this.artifacts.vectors.coverageMap[id] !== id,
    ).length;
  }

  validateVector(id: string): VectorValidationResult {
    const vector = this.vectors.get(id);
    if (!vector) throw new Error(`UNKNOWN_META_VECTOR:${id}`);
    const baseline = this.baselines.get(vector.baselineId);
    if (!baseline) throw new Error(`UNKNOWN_META_BASELINE:${vector.baselineId}`);

    const baselineResult = this.validatePayload(
      `BASELINE:${baseline.id}`,
      baseline,
      baseline.payload,
      { accepted: true },
    );
    if (!baselineResult.accepted) {
      throw new Error(`INVALID_META_BASELINE:${baseline.id}`);
    }

    const payload = mutate(baseline.payload, vector.operations ?? []);
    return this.validatePayload(vector.id, baseline, payload, vector.expected);
  }

  private validatePayload(
    id: string,
    baseline: Baseline,
    payload: JsonObject,
    expected: ExpectedResult,
  ): VectorValidationResult {
    if (baseline.target.startsWith("#/")) {
      const schemaId = String(this.artifacts.schema.$id);
      const validate = this.ajv.compile({ $ref: `${schemaId}${baseline.target}` });
      const schemaAccepted = validate(payload);
      if (!schemaAccepted) {
        return schemaError(id, validate.errors ?? [], expected);
      }
    }

    const custom = this.validatePinnedReference(payload);
    if (!custom.accepted) return { id, ...custom };
    return { id, accepted: true };
  }

  private validatePinnedReference(
    payload: JsonObject,
  ): Omit<VectorValidationResult, "id"> {
    if ("partitionRulingArtifactId" in payload && "sourceRecordId" in payload) {
      if (
        stringProperty(payload, "partitionRulingArtifactId") !==
        stringProperty(this.artifacts.partitionRuling, "artifactId")
      ) {
        return this.fkError(
          "PARTITION_RULING_ID_MISMATCH",
          "/partitionRulingArtifactId",
        );
      }
      if (
        stringProperty(payload, "partitionRulingSha256") !==
        this.artifacts.partitionRulingSha256
      ) {
        return this.fkError(
          "PARTITION_RULING_SHA_MISMATCH",
          "/partitionRulingSha256",
        );
      }
      const counterpartyType = stringProperty(payload, "counterpartyType");
      const sourceRecordId = stringProperty(payload, "sourceRecordId");
      const partition = this.artifacts.partitionRuling;
      const anyBank = property(partition, "anyBankAllowlist") as JsonObject;
      const customer = property(partition, "customerOutOfScope") as JsonObject;
      const anySourceIds = Array.isArray(anyBank.sourceIds)
        ? anyBank.sourceIds.map(String)
        : [];
      const customerSourceIds = Array.isArray(customer.sourceIds)
        ? customer.sourceIds.map(String)
        : [];
      if (
        anySourceIds.length !== 11 ||
        new Set(anySourceIds).size !== 11 ||
        customerSourceIds.length !== 5 ||
        new Set(customerSourceIds).size !== 5 ||
        anySourceIds.some((id) => customerSourceIds.includes(id))
      ) {
        return this.fkError(
          "COUNTERPARTY_PARTITION_INVALID",
          "/partitionRulingArtifactId",
        );
      }
      const expectedType = anySourceIds.includes(sourceRecordId)
        ? "ANY_BANK"
        : customerSourceIds.includes(sourceRecordId)
          ? "CUSTOMER"
          : undefined;
      if (expectedType && counterpartyType !== expectedType) {
        return this.fkError(
          "COUNTERPARTY_SOURCE_TYPE_MISMATCH",
          "/counterpartyType",
        );
      }
      const allowlist =
        counterpartyType === "ANY_BANK"
          ? anyBank
          : counterpartyType === "CUSTOMER"
            ? customer
            : undefined;
      if (!allowlist) return { accepted: true };
      const sourceIds = Array.isArray(allowlist.sourceIds)
        ? allowlist.sourceIds.map(String)
        : [];
      return sourceIds.includes(sourceRecordId)
        ? { accepted: true }
        : this.fkError(
            "COUNTERPARTY_SOURCE_NOT_IN_APPROVED_PARTITION",
            "/inputCondition/sourceRecordId",
          );
    }
    if (
      "canonicalGroupKey" in payload &&
      "inputCondition" in payload &&
      "expectedSelections" in payload
    ) {
      return "effects" in payload
        ? this.validateOracleRow(payload)
        : this.validateRuleRow(payload);
    }
    if ("method" in payload && "apiContractId" in payload) {
      return this.exactTuple(
        asObjects(this.artifacts.apiCatalogue.contracts),
        payload,
        [
          "apiContractId",
          "method",
          "endpoint",
          "requestSchemaId",
          "requestTemplateId",
          "fieldBindingId",
        ],
        "API_ATOMIC_CONTRACT_TUPLE_NOT_FOUND",
        "/requestTemplateId",
      );
    }
    if ("derivationRuleId" in payload && "contextKey" in payload) {
      const tuples = asObjects(this.artifacts.derivationCatalogue.tuples);
      const derivation = stringProperty(payload, "derivationRuleId");
      const tuple = tuples.find(
        (entry) => stringProperty(entry, "derivationRuleId") === derivation,
      );
      if (!tuple)
        return this.fkError("DERIVATION_TUPLE_NOT_FOUND", "/derivationRuleId");
      if (stringProperty(tuple, "executionContextId") !== stringProperty(payload, "contextKey"))
        return this.fkError("DERIVATION_TUPLE_CONTEXT_MISMATCH", "/contextKey");
      if (stringProperty(tuple, "apiContractId") !== stringProperty(payload, "apiContractId"))
        return this.fkError("DERIVATION_TUPLE_API_MISMATCH", "/apiContractId");
      const fieldPairs: readonly (readonly [string, string])[] = [
        ["family", "family"],
        ["messageIdentity", "messageIdentity"],
        ["direction", "direction"],
        ["profile", "profile"],
        ["businessService", "businessService"],
        ["routePreferenceId", "routePreferenceId"],
        ["officialRoleId", "officialRoleId"],
        ["lookupContractId", "lookupContractId"],
        ["profileVariantId", "profileVariantId"],
        ["sequenceId", "sequenceId"],
        ["settlementLegId", "settlementLegId"],
      ];
      const mismatch = fieldPairs.find(
        ([payloadField, tupleField]) =>
          stringProperty(payload, payloadField) !== stringProperty(tuple, tupleField),
      );
      if (mismatch)
        return this.fkError(
          "DERIVATION_TUPLE_FIELD_MISMATCH",
          `/${mismatch[0]}`,
        );
      return { accepted: true };
    }
    if ("manifestArtifactId" in payload) {
      if (
        stringProperty(payload, "manifestArtifactId") !==
        stringProperty(this.artifacts.selectedIdentityManifest, "artifactId")
      ) {
        return this.fkError("SELECTED_MANIFEST_ID_MISMATCH", "/manifestArtifactId");
      }
      const selection = property(payload, "selection") as JsonObject;
      const selectionType = stringProperty(selection, "selection");
      if (selectionType !== "SELECTED") {
        const scope = stringProperty(payload, "scope");
        const found = asObjects(this.artifacts.selectedIdentityManifest.pairs).some(
          (entry) =>
            stringProperty(entry, "scope") === scope &&
            stringProperty(entry, "selection") === selectionType,
        );
        return found
          ? { accepted: true }
          : this.fkError("SELECTED_PARTITION_NOT_FOUND", "/selection");
      }
      const found = asObjects(this.artifacts.selectedIdentityManifest.pairs).some(
        (entry) =>
          stringProperty(entry, "selection") === "SELECTED" &&
          stringProperty(entry, "scope") === stringProperty(payload, "scope") &&
          stringProperty(entry, "id") === stringProperty(selection, "id") &&
          Number(entry.version) === Number(selection.version),
      );
      return found
        ? { accepted: true }
        : this.fkError("SELECTED_IDENTITY_VERSION_NOT_FOUND", "/selection");
    }
    if ("oracleAccountCase" in payload) {
      const requirement = stringProperty(payload, "accountRequirement");
      const accountCase = stringProperty(payload, "oracleAccountCase");
      const selection = property(payload, "inputAccountSelection") as JsonObject;
      const expectedSelection: Readonly<Record<string, string>> = {
        REQUIRED_PRESENT: "SINGLE_VALID",
        REQUIRED_MISSING: "ABSENT",
        OPTIONAL_ABSENT: "ABSENT",
        OPTIONAL_PRESENT_VALID: "SINGLE_VALID",
        OPTIONAL_PRESENT_INVALID: "SINGLE_INVALID",
        OPTIONAL_MULTIPLE: "MULTIPLE",
        NOT_APPLICABLE: "ABSENT",
      };
      const allowedCases: Readonly<Record<string, readonly string[]>> = {
        REQUIRED: ["REQUIRED_PRESENT", "REQUIRED_MISSING"],
        OPTIONAL: [
          "OPTIONAL_ABSENT",
          "OPTIONAL_PRESENT_VALID",
          "OPTIONAL_PRESENT_INVALID",
          "OPTIONAL_MULTIPLE",
        ],
        NOT_REQUIRED: ["NOT_APPLICABLE"],
      };
      if (!allowedCases[requirement]?.includes(accountCase)) {
        return {
          accepted: false,
          layer: "JOIN",
          errorCode: "ACCOUNT_REQUIREMENT_CASE_MISMATCH",
          instancePath: "/oracleAccountCase",
        };
      }
      return expectedSelection[accountCase] === stringProperty(selection, "case")
        ? { accepted: true }
        : {
            accepted: false,
            layer: "JOIN",
            errorCode: "ACCOUNT_CASE_INPUT_SELECTION_MISMATCH",
            instancePath: "/oracleAccountCase",
          };
    }
    if ("catalogueArtifactId" in payload) {
      const found = asObjects(this.artifacts.oosCatalogue.entries).some(
        (entry) =>
          stringProperty(entry, "identity") ===
          stringProperty(payload, "messageTypeOrToken"),
      );
      return found
        ? { accepted: true }
        : this.fkError("OOS_IDENTITY_NOT_FOUND", "/messageTypeOrToken");
    }
    if ("sourceArtifactId" in payload && "registryId" in payload) {
      const fields = [
        "sourceArtifactId",
        "sourceRelease",
        "sourceVersion",
        "sourceFilename",
        "sourceSha256",
        "ruleId",
        "sectionOrPage",
      ];
      const registryId = stringProperty(payload, "registryId");
      const registryEntries: Readonly<Record<string, readonly JsonObject[]>> = {
        CONTROLLED_SOURCE_REGISTER: this.artifacts.controlledSourceRegistry.entries,
        BA_RULING_REGISTRY: asObjects(this.artifacts.baEvidenceRegistry.entries),
        QA_INVARIANT_REGISTRY: this.artifacts.qaEvidenceRegistry.entries,
        PRODUCT_POLICY_REGISTRY: this.artifacts.productPolicyRegistry.entries,
      };
      const entries = registryEntries[registryId] ?? [];
      const exact = entries.some((entry) =>
        fields.every(
          (field) => stringProperty(entry, field) === stringProperty(payload, field),
        ),
      );
      return exact
        ? { accepted: true }
        : this.fkError("EVIDENCE_SHA_MISMATCH", "/sourceSha256");
    }
    return { accepted: true };
  }

  private validateRuleRow(
    row: JsonObject,
  ): Omit<VectorValidationResult, "id"> {
    for (const evidence of asObjects(row.sourceEvidence)) {
      const result = this.validatePinnedReference(evidence);
      if (!result.accepted) return result;
    }

    const groupKey = stringProperty(row, "canonicalGroupKey");
    const selections = property(row, "expectedSelections") as JsonObject;
    for (const [kind, selection] of Object.entries(selections ?? {})) {
      if (typeof selection !== "object" || selection === null || Array.isArray(selection))
        return this.fkError("SELECTED_IDENTITY_INVALID", `/expectedSelections/${kind}`);
      const result = this.validatePinnedReference({
        manifestArtifactId: stringProperty(
          this.artifacts.selectedIdentityManifest,
          "artifactId",
        ),
        scope: `${groupKey}:${kind}`,
        selection,
      });
      if (!result.accepted) return result;
    }

    const input = property(row, "inputCondition") as JsonObject;
    const mutationDisposition = stringProperty(row, "mutationDisposition");
    if (
      ["CONVERT", "REMOVE_SOURCE_TOKEN"].includes(mutationDisposition) &&
      stringProperty(row, "amendmentOfId") !==
        stringProperty(input, "sourceRecordId")
    ) {
      return {
        accepted: false,
        layer: "JOIN",
        errorCode: "SUCCESSOR_SOURCE_LINEAGE_MISMATCH",
        instancePath: "/amendmentOfId",
      };
    }
    if (
      mutationDisposition === "OUT_OF_SCOPE" &&
      stringProperty(row, "amendmentOfId") !== "NOT_APPLICABLE"
    ) {
      return {
        accepted: false,
        layer: "JOIN",
        errorCode: "OOS_LINEAGE_MUST_BE_NOT_APPLICABLE",
        instancePath: "/amendmentOfId",
      };
    }
    const partitionBinding = this.validatePinnedReference({
      partitionRulingArtifactId: stringProperty(
        this.artifacts.partitionRuling,
        "artifactId",
      ),
      partitionRulingSha256: stringProperty(row, "partitionRulingSha256"),
      counterpartyType: stringProperty(row, "counterpartyType"),
      sourceRecordId: stringProperty(input, "sourceRecordId"),
    });
    if (!partitionBinding.accepted) return partitionBinding;
    const executionContext = property(input, "executionContext") as JsonObject;
    const contextKey = stringProperty(input, "contextKey");
    const contextFound = asObjects(this.artifacts.executionContexts.contexts).some(
      (context) =>
        stringProperty(context, "contextId") === contextKey &&
        canonicalJson(context) === canonicalJson(executionContext),
    );
    if (!contextFound)
      return this.fkError("EXECUTION_CONTEXT_NOT_FOUND", "/inputCondition/contextKey");

    const apiExecution = property(row, "apiExecution") as JsonObject;
    const submission = stringProperty(apiExecution, "submission");
    const apiContractId = stringProperty(apiExecution, "apiContractId");
    if (submission === "REQUIRED") {
      const apiFound = asObjects(this.artifacts.apiCatalogue.contracts).some(
        (contract) => stringProperty(contract, "apiContractId") === apiContractId,
      );
      if (!apiFound)
        return this.fkError("API_CONTRACT_NOT_FOUND", "/apiExecution/apiContractId");
    } else if (submission !== "PROHIBITED" || apiContractId !== "NOT_APPLICABLE") {
      return this.fkError("API_SUBMISSION_CONTRACT_MISMATCH", "/apiExecution");
    }

    const scopeStatus = stringProperty(row, "scopeStatus");
    if (scopeStatus === "OUT_OF_SCOPE_CLOSED") {
      if (stringProperty(row, "counterpartyType") !== "CUSTOMER") {
        const oos = this.validatePinnedReference({
          catalogueArtifactId: stringProperty(
            this.artifacts.oosCatalogue,
            "artifactId",
          ),
          messageTypeOrToken: stringProperty(input, "messageTypeOrToken"),
        });
        if (!oos.accepted) return oos;
      }
    } else {
      const refs = property(row, "catalogueReferences") as JsonObject;
      const derivation = this.validatePinnedReference({
        derivationRuleId: stringProperty(refs, "derivationRuleId"),
        family: stringProperty(input, "family"),
        messageIdentity:
          stringProperty(input, "messageType") ||
          stringProperty(input, "messageTypeOrToken") ||
          stringProperty(row, "sourceToken"),
        direction: stringProperty(input, "direction"),
        profile: stringProperty(input, "profile"),
        businessService: stringProperty(input, "businessService"),
        routePreferenceId: stringProperty(refs, "routePreferenceId"),
        officialRoleId: stringProperty(refs, "officialRoleId"),
        lookupContractId: stringProperty(refs, "lookupContractId"),
        profileVariantId: stringProperty(refs, "profileVariantId"),
        sequenceId: stringProperty(refs, "sequenceId"),
        settlementLegId: stringProperty(refs, "settlementLegId"),
        contextKey,
        apiContractId,
      });
      if (!derivation.accepted) return derivation;
    }

    const account = property(executionContext, "account") as JsonObject;
    const contextRequirement = stringProperty(account, "requirement");
    const rowRequirement = stringProperty(row, "accountRequirement");
    const normalizedContextRequirement =
      contextRequirement === "OPTIONAL_VALIDATE_IF_PRESENT"
        ? "OPTIONAL"
        : contextRequirement;
    if (normalizedContextRequirement !== rowRequirement)
      return {
        accepted: false,
        layer: "JOIN",
        errorCode: "ACCOUNT_REQUIREMENT_CONTEXT_MISMATCH",
        instancePath: "/accountRequirement",
      };
    if ("accountCase" in row) {
      const accountJoin = this.validatePinnedReference({
        accountRequirement: rowRequirement,
        oracleAccountCase: row.accountCase,
        inputAccountSelection: property(account, "suppliedAccounts"),
      });
      if (!accountJoin.accepted) return accountJoin;
    }
    return { accepted: true };
  }

  private validateOracleRow(
    oracle: JsonObject,
  ): Omit<VectorValidationResult, "id"> {
    for (const evidence of asObjects(oracle.sourceEvidence)) {
      const result = this.validatePinnedReference(evidence);
      if (!result.accepted) return result;
    }
    const groupKey = stringProperty(oracle, "canonicalGroupKey");
    const matchingRules = this.artifacts.ruleTable.rows.filter(
      (rule) => stringProperty(rule, "canonicalGroupKey") === groupKey,
    );
    if (matchingRules.length !== 1)
      return this.fkError("ORACLE_RULE_JOIN_NOT_FOUND", "/canonicalGroupKey");
    const rule = matchingRules[0];
    const ruleResult = this.validateRuleRow(rule);
    if (!ruleResult.accepted) return ruleResult;

    const ruleRequirement = stringProperty(rule, "accountRequirement");
    const expectedAccountRuleKey = stringProperty(rule, "accountRuleKey");
    if (stringProperty(oracle, "accountRuleKey") !== expectedAccountRuleKey)
      return this.fkError("ACCOUNT_RULE_KEY_NOT_APPROVED", "/accountRuleKey");

    const oracleSelections = property(oracle, "expectedSelections") as JsonObject;
    for (const [kind, selection] of Object.entries(oracleSelections ?? {})) {
      if (typeof selection !== "object" || selection === null || Array.isArray(selection))
        return this.fkError("SELECTED_IDENTITY_INVALID", `/expectedSelections/${kind}`);
      const selected = this.validatePinnedReference({
        manifestArtifactId: stringProperty(
          this.artifacts.selectedIdentityManifest,
          "artifactId",
        ),
        scope: `${groupKey}:${kind}`,
        selection,
      });
      if (!selected.accepted) return selected;
    }

    if (!this.ruleOraclePairMatches(rule, oracle))
      return {
        accepted: false,
        layer: "JOIN",
        errorCode: "RULE_ORACLE_FIELD_MISMATCH",
        instancePath: "/canonicalGroupKey",
      };

    const input = property(oracle, "inputCondition") as JsonObject;
    const executionContext = property(input, "executionContext") as JsonObject;
    const account = property(executionContext, "account") as JsonObject;
    return this.validatePinnedReference({
      accountRequirement: ruleRequirement,
      oracleAccountCase: oracle.accountCase,
      inputAccountSelection: property(account, "suppliedAccounts"),
    });
  }

  private ruleOraclePairMatches(rule: JsonObject, oracle: JsonObject): boolean {
    const directPairs: readonly (readonly [string, string])[] = [
      ["scopeStatus", "scopeStatus"],
      ["reviewStatus", "reviewStatus"],
      ["mutationDisposition", "disposition"],
      ["expectedHttp", "expectedHttp"],
      ["expectedReasonCode", "expectedReasonCode"],
      ["expectedCandidateCount", "expectedCandidateCount"],
      ["operationalVisibility", "operationalVisibility"],
      ["qaVisibility", "qaVisibility"],
      ["ssiOwnedDenominator", "ssiOwnedDenominator"],
      ["oosDenominator", "oosDenominator"],
      ["expectedTargetAdded", "expectedTargetAdded"],
      ["expectedSourceRemoved", "expectedSourceRemoved"],
      ["expectedRecordsChanged", "expectedRecordsChanged"],
      ["expectedRecordsUnchanged", "expectedRecordsUnchanged"],
      ["expectedSsiRowDelta", "expectedSsiRowDelta"],
      ["expectedApplicabilityRowDelta", "expectedApplicabilityRowDelta"],
    ];
    if (
      directPairs.some(
        ([ruleField, oracleField]) =>
          canonicalJson(rule[ruleField]) !== canonicalJson(oracle[oracleField]),
      )
    )
      return false;
    if (
      canonicalJson(this.caseNeutralInputCondition(rule.inputCondition)) !==
      canonicalJson(this.caseNeutralInputCondition(oracle.inputCondition))
    )
      return false;
    const requirement = stringProperty(rule, "accountRequirement");
    if (requirement === "OPTIONAL") {
      const outcomeField: Readonly<Record<string, string>> = {
        OPTIONAL_ABSENT: "optionalAccountAbsentOutcome",
        OPTIONAL_PRESENT_VALID: "optionalAccountPresentValidOutcome",
        OPTIONAL_PRESENT_INVALID: "optionalAccountPresentInvalidOutcome",
        OPTIONAL_MULTIPLE: "optionalAccountMultipleOutcome",
      };
      const field = outcomeField[stringProperty(oracle, "accountCase")];
      if (
        !field ||
        stringProperty(rule, field) !== stringProperty(oracle, "expectedOutcomeCode")
      )
        return false;
    } else if (
      stringProperty(rule, "expectedOutcomeCode") !==
        stringProperty(oracle, "expectedOutcomeCode")
    ) {
      return false;
    }
    for (const field of [
      "validation",
      "activation",
      "apiExecution",
    ]) {
      if (canonicalJson(rule[field]) !== canonicalJson(oracle[field])) return false;
    }
    if (
      canonicalJson(
        this.caseNeutralExpectedSelections(rule.expectedSelections, requirement),
      ) !==
      canonicalJson(
        this.caseNeutralExpectedSelections(oracle.expectedSelections, requirement),
      )
    )
      return false;
    const effects = property(oracle, "effects") as JsonObject;
    const effectPairs: readonly (readonly [string, string])[] = [
      ["payloadGenerated", "payloadGenerated"],
      ["confirmed", "confirmed"],
      ["expectedPostingCount", "postingCount"],
      ["expectedRepairCount", "repairQueueCount"],
      ["expectedAuditCount", "auditMutationCount"],
      ["expectedDbWriteCount", "databaseWriteCount"],
      ["expectedStubCallCount", "stubCallCount"],
      ["expectedStubRequestIdentity", "stubRequestIdentity"],
    ];
    return effectPairs.every(
      ([ruleField, effectField]) =>
        canonicalJson(rule[ruleField]) === canonicalJson(effects[effectField]),
    );
  }

  private caseNeutralInputCondition(value: unknown): unknown {
    const result = structuredClone(value);
    if (typeof result !== "object" || result === null || Array.isArray(result))
      return result;
    const execution = (result as JsonObject).executionContext;
    if (typeof execution !== "object" || execution === null || Array.isArray(execution))
      return result;
    const account = (execution as JsonObject).account;
    if (typeof account !== "object" || account === null || Array.isArray(account))
      return result;
    (account as JsonObject).suppliedAccounts = "CASE_SPECIFIC_ORACLE_INPUT";
    return result;
  }

  private caseNeutralExpectedSelections(
    value: unknown,
    requirement: string,
  ): unknown {
    const result = structuredClone(value);
    if (
      requirement !== "OPTIONAL" ||
      typeof result !== "object" ||
      result === null ||
      Array.isArray(result)
    )
      return result;
    (result as JsonObject).account = "CASE_SPECIFIC_ORACLE_SELECTION";
    return result;
  }

  private isHeldKey(key: string, partitions: JsonObject): boolean {
    return asObjects(partitions.HOLD_DEPENDENCY).some((entry) => {
      if (stringProperty(entry, "canonicalGroupKey") === key) return true;
      return (
        stringProperty(entry, "canonicalGroupManifestId") ===
          stringProperty(this.artifacts.canonicalGroupManifest, "artifactId") &&
        Number(entry.groupCount) ===
          new Set(
            (this.artifacts.canonicalGroupManifest.canonicalGroupKeys as unknown[]).map(
              String,
            ),
          ).size
      );
    });
  }

  private exactTuple(
    rows: readonly JsonObject[],
    payload: JsonObject,
    fields: readonly string[],
    errorCode: string,
    instancePath: string,
  ): Omit<VectorValidationResult, "id"> {
    const found = rows.some((row) =>
      fields.every(
        (field) => stringProperty(row, field) === stringProperty(payload, field),
      ),
    );
    return found ? { accepted: true } : this.fkError(errorCode, instancePath);
  }

  private fkError(
    errorCode: string,
    instancePath: string,
  ): Omit<VectorValidationResult, "id"> {
    return { accepted: false, layer: "FK", errorCode, instancePath };
  }
}
