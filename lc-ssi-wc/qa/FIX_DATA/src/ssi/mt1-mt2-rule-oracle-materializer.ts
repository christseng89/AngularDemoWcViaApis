import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type JsonObject = Record<string, unknown>;

const readJson = (path: string): JsonObject =>
  JSON.parse(readFileSync(resolve(path), "utf8")) as JsonObject;
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as JsonObject)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
        )
      : value;
const serialize = (value: unknown): string =>
  `${JSON.stringify(stable(value), null, 2)}\n`;
const array = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? (value as JsonObject[]) : [];
const messages = (payload: JsonObject): string[] =>
  String((payload.route as JsonObject)?.messageTypes ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const replaceByKey = (
  existing: JsonObject[],
  generated: JsonObject[],
  key: string,
): JsonObject[] => {
  const generatedKeys = new Set(generated.map((entry) => String(entry[key])));
  return [
    ...existing.filter((entry) => !generatedKeys.has(String(entry[key]))),
    ...generated,
  ];
};

export interface MaterializedContract {
  ruleTable: JsonObject;
  oracle: JsonObject;
  partitionManifest: JsonObject;
  canonicalGroupManifest: JsonObject;
  executionContexts: JsonObject;
  derivationCatalogue: JsonObject;
  selectedIdentityManifest: JsonObject;
}

export class SsiRuleOracleMaterializer {
  private readonly databasePath: string;
  private readonly artifactRoot: string;

  constructor(
    databasePath: string,
    artifactRoot: string,
  ) {
    this.databasePath = databasePath;
    this.artifactRoot = artifactRoot;
  }

  build(): MaterializedContract {
    const ruling = readJson(`${this.artifactRoot}/round4-partition-ruling.v1.json`);
    const canonical = readJson(
      `${this.artifactRoot}/canonical-group-manifest.v1.json`,
    );
    const contexts = readJson(
      `${this.artifactRoot}/execution-context-catalogues.v1.json`,
    );
    const derivations = readJson(
      `${this.artifactRoot}/derivation-tuple-catalogue.v1.json`,
    );
    const identities = readJson(
      `${this.artifactRoot}/expected-selected-identity-manifest.v1.json`,
    );
    const payloads = readJson(`${this.artifactRoot}/schema-meta-test-payloads.v1.json`);
    const evidence = (
      array(payloads.baselines).find(
        (entry) => entry.id === "BASE-GENERATE-CANONICAL-RULE-ROW",
      )?.payload as JsonObject
    ).sourceEvidence;
    const anyIds = new Set(
      ((ruling.anyBankAllowlist as JsonObject).sourceIds as string[]).map(String),
    );
    const customerIds = new Set(
      ((ruling.customerOutOfScope as JsonObject).sourceIds as string[]).map(
        String,
      ),
    );
    const qaIds = new Set(
      ((ruling.qaPositiveAllowlist as JsonObject).sourceIds as string[]).map(String),
    );
    const db = new DatabaseSync(resolve(this.databasePath), { readOnly: true });
    db.exec("PRAGMA query_only = ON");
    try {
      const groupKeys = (canonical.canonicalGroupKeys as string[]).map(String);
      const grouped = new Map<string, string[]>();
      for (const key of groupKeys) {
        const [, sourceId] = key.split(":");
        const normalizedSourceId = sourceId.toLowerCase();
        grouped.set(normalizedSourceId, [
          ...(grouped.get(normalizedSourceId) ?? []),
          key,
        ]);
      }
      const newContexts: JsonObject[] = [];
      const newDerivations: JsonObject[] = [];
      const newPairs: JsonObject[] = [];
      const rows = groupKeys.map((groupKey) => {
        const [, sourceIdUpper, familyUpper] = groupKey.split(":");
        const sourceId = sourceIdUpper.toLowerCase();
        const family = familyUpper === "PACS008" ? "pacs.008" : "pacs.009";
        const source = db.prepare("SELECT payload FROM ssi WHERE id = ?").get(
          sourceId,
        ) as { payload: string } | undefined;
        if (!source) throw new Error(`SOURCE_NOT_FOUND:${sourceId}`);
        const payload = JSON.parse(source.payload) as JsonObject;
        const route = payload.route as JsonObject;
        const applications = (
          db
            .prepare(
              "SELECT payload FROM ssi_applicability WHERE ssi_id = ? ORDER BY id",
            )
            .all(sourceId) as unknown as { payload: string }[]
        ).map((entry) => JSON.parse(entry.payload) as JsonObject);
        const activeApplications = applications.filter(
          (entry) => String(entry.status) === "ACTIVE",
        );
        const direction = String(
          route.direction ?? activeApplications[0]?.direction ?? "OUTBOUND",
        );
        const currency = String(route.currency ?? route.accountCurrency ?? "HKD");
        const contextKey = `CTX-${sourceIdUpper}-${familyUpper}`;
        const executionContext = {
          contextId: contextKey,
          currency: {
            requirement: "FROM_TRANSACTION",
            source: "TRANSACTION",
            currency,
          },
          bookingEntity: {
            requirement: "FROM_CONTEXT",
            source: "CONTEXT",
            bookingEntityId: String(route.bookingEntity ?? "HK01"),
          },
          valueDate: {
            source: "CONTEXT",
            valueDate: String(route.validFrom ?? "2026-01-01"),
            effectiveFrom: String(route.validFrom ?? "2026-01-01"),
            effectiveTo: String(route.validTo ?? "2027-12-31"),
          },
          account: {
            requirement: "NOT_REQUIRED",
            ownerRole: "NOT_APPLICABLE",
            servicerRole: "NOT_APPLICABLE",
            relationship: "NOT_APPLICABLE",
            purpose: "NOT_APPLICABLE",
            suppliedAccounts: { case: "ABSENT" },
          },
          amount: {
            requirement: "FROM_TRANSACTION",
            decimalValue: "100.00",
            currency,
          },
          productId: String(activeApplications[0]?.product ?? "ANY"),
          businessFunctionId: String(
            activeApplications[0]?.businessFunction ?? "ANY",
          ),
          paymentLegId: String(activeApplications[0]?.paymentLeg ?? "ANY"),
          transactionReference: `DEMO-${sourceIdUpper.slice(0, 8)}-${familyUpper}`,
        };
        newContexts.push(executionContext);
        const customer = customerIds.has(sourceId);
        const anyBank = anyIds.has(sourceId);
        const sourceMessages = messages(payload);
        const sourceToken = `${family}.001.12`;
        const targetToken = `${family}.001.08`;
        const dual = sourceMessages.includes(targetToken);
        const disposition = customer
          ? "OUT_OF_SCOPE"
          : dual
            ? "REMOVE_SOURCE_TOKEN"
            : "CONVERT";
        const physicalOwner = (grouped.get(sourceId) ?? [groupKey])[0] === groupKey;
        const successorId = `SSI-MT12-V1-${sourceIdUpper}`;
        const derivationRuleId = `DERIVE-${sourceIdUpper}-${familyUpper}`;
        const catalogueReferences = {
          routePreferenceId: "NOT_APPLICABLE",
          officialRoleId: "NOT_APPLICABLE",
          lookupContractId: "LOOKUP-NOT-APPLICABLE",
          profileVariantId: "PLAIN",
          sequenceId: "NOT_APPLICABLE",
          settlementLegId: "NOT_APPLICABLE",
          derivationRuleId,
        };
        if (!customer) {
          newDerivations.push({
            derivationRuleId,
            family,
            messageIdentity: sourceToken,
            direction,
            profile: "PLAIN",
            businessService: "swift.cbprplus.04",
            routePreferenceId: "NOT_APPLICABLE",
            officialRoleId: "NOT_APPLICABLE",
            lookupContractId: "LOOKUP-NOT-APPLICABLE",
            profileVariantId: "PLAIN",
            sequenceId: "NOT_APPLICABLE",
            settlementLegId: "NOT_APPLICABLE",
            executionContextId: contextKey,
            apiContractId: "NOT_APPLICABLE",
            disposition: "VERSION_CANONICALIZATION_ONLY",
          });
        }
        const selections = {
          route: { selection: "NOT_APPLICABLE" },
          account: { selection: "NOT_APPLICABLE" },
          ssi: { selection: "NOT_APPLICABLE" },
          applicability: { selection: "NOT_APPLICABLE" },
        };
        for (const [kind, selection] of Object.entries(selections))
          newPairs.push({ scope: `${groupKey}:${kind}`, ...selection });
        const oos = customer;
        const validation = oos
          ? {
              owner: "CBPR_USAGE_GUIDELINE_VALIDATOR",
              mode: "OUT_OF_SCOPE_CLOSED",
              finValidationStatus: "FIN_VALIDATION_NOT_EVALUATED",
              ssiLookup: "NOT_PERFORMED",
            }
          : {
              owner: "CBPR_USAGE_GUIDELINE_VALIDATOR",
              mode: "EXECUTE_NAMED_VALIDATOR",
              validatorId: "CBPR-SR2026-VERSION-CANONICALIZATION",
              ssiLookup: "NOT_PERFORMED",
            };
        const targetLifecycle = oos ? "NOT_APPLICABLE" : "DRAFT";
        const activationPath = oos ? "NOT_APPLICABLE" : "MAKER_CHECKER";
        const ssiDelta = !oos && physicalOwner ? 1 : 0;
        const applicabilityDelta =
          !oos && physicalOwner ? activeApplications.length : 0;
        return {
          governanceSnapshotId: "SSI-MT1-MT2-ROUND4-PARTITION-RULING-V1",
          sourceShaSet: [
            "8EE334403C8CC94CF34B0470C7F7D4F2032C0E33645D065F0BB1110DE5B6FCA6",
          ],
          policyNamespace: "SSI_DEMO_CBPRPLUS_SR2026",
          canonicalizationVersion: "MT1-MT2-V1",
          sharedCatalogueSha256:
            "15335E5AC3C9D977ECC1CC35710DE7B5A7B658955338754E25ACBC624459D6DB",
          partitionRulingSha256:
            "8EE334403C8CC94CF34B0470C7F7D4F2032C0E33645D065F0BB1110DE5B6FCA6",
          canonicalGroupKey: groupKey,
          groupId: groupKey,
          scopeStatus: oos ? "OUT_OF_SCOPE_CLOSED" : "IN_SCOPE",
          ownBic: "DEMOHKHH",
          counterpartyType: oos ? "CUSTOMER" : anyBank ? "ANY_BANK" : "BANK",
          counterpartyBic: oos
            ? String(route.bic ?? "CUST0001")
            : anyBank
              ? "ANY"
              : String(route.counterpartyBic ?? payload.counterpartyId).replace(
                  /^CP-/,
                  "",
                ),
          rmaService: "FINPLUS",
          sourceToken,
          normalizedAlias: sourceToken,
          conversionRuleId: `CONVERT-${familyUpper}-12-TO-08`,
          inputCondition: {
            sourceKind: "VERSION_CONVERSION_SOURCE",
            sourceRecordId: sourceId,
            sourceVersion: Number(payload.version ?? 0),
            sourceLifecycle: "ACTIVE",
            sourceDatasetClass: qaIds.has(sourceId)
              ? "QA_POSITIVE"
              : "OPERATIONAL_POSITIVE",
            canonicalTargetPresent: dual,
            covTokenPresent: false,
            family,
            sourceAliasesPresent: [sourceToken],
            targetToken,
            direction,
            profile: "PLAIN",
            businessService: "swift.cbprplus.04",
            contextKey,
            dependencyStatus: "CLOSED",
            executionContext,
          },
          catalogueReferences,
          reviewStatus: oos ? "OUT_OF_SCOPE_CLOSED" : "BA_CONFIRMED",
          mutationDisposition: disposition,
          validation,
          activation: { targetLifecycle, activationPath },
          datasetClass: qaIds.has(sourceId)
            ? "QA_POSITIVE"
            : "OPERATIONAL_POSITIVE",
          targetLifecycle,
          activationPath,
          dependencyId: "NOT_APPLICABLE",
          priority: Number(route.priority ?? 999),
          tiePolicy: "AMBIGUOUS",
          accountRequirement: "NOT_REQUIRED",
          accountRuleKey: "NOT_APPLICABLE",
          apiExecution: { submission: "PROHIBITED", apiContractId: "NOT_APPLICABLE" },
          expectedHttp: "NOT_APPLICABLE",
          expectedOutcomeCode: oos ? "OUT_OF_SCOPE_CLOSED" : "CANONICAL_VERSION_READY",
          expectedReasonCode: oos
            ? "CUSTOMER_DATA_NOT_BANK_SSI"
            : dual
              ? "SOURCE_TOKEN_REMOVED_TARGET_ALREADY_PRESENT"
              : "SOURCE_VERSION_CONVERTED",
          expectedCandidateCount: 0,
          expectedSelections: selections,
          ssiLookup: "NOT_PERFORMED",
          payloadGenerated: false,
          confirmed: false,
          expectedPostingCount: 0,
          expectedRepairCount: 0,
          expectedAuditCount: 0,
          expectedDbWriteCount: 0,
          expectedStubCallCount: 0,
          expectedStubRequestIdentity: "NOT_APPLICABLE",
          operationalVisibility: false,
          qaVisibility: true,
          ssiOwnedDenominator: !oos,
          oosDenominator: oos,
          optionalAccountAbsentOutcome: "NOT_APPLICABLE",
          optionalAccountPresentValidOutcome: "NOT_APPLICABLE",
          optionalAccountPresentInvalidOutcome: "NOT_APPLICABLE",
          optionalAccountMultipleOutcome: "NOT_APPLICABLE",
          eligibilityDecision: oos ? "OUT_OF_SCOPE" : "ELIGIBLE",
          successorRecordId: oos ? "NOT_APPLICABLE" : successorId,
          successorVersion: oos ? "NOT_APPLICABLE" : Number(payload.version ?? 0) + 1,
          amendmentOfId: oos ? "NOT_APPLICABLE" : sourceId,
          validationOwner: "CBPR_USAGE_GUIDELINE_VALIDATOR",
          validationExecutionMode: oos
            ? "OUT_OF_SCOPE_CLOSED"
            : "EXECUTE_NAMED_VALIDATOR",
          finValidationStatus: oos
            ? "FIN_VALIDATION_NOT_EVALUATED"
            : "NOT_APPLICABLE",
          sourceEvidence: evidence,
          expectedTargetAdded: oos || dual ? 0 : 1,
          expectedSourceRemoved: oos ? 0 : 1,
          expectedRecordsChanged: oos ? 0 : 1,
          expectedRecordsUnchanged: oos ? 1 : 0,
          expectedSsiRowDelta: ssiDelta,
          expectedApplicabilityRowDelta: applicabilityDelta,
          runtimeDriftDisposition: oos
            ? "NOT_APPLICABLE"
            : "TARGET_EXPLICIT_RULE",
        } as JsonObject;
      });
      const oracleRows = rows.map((rule) => ({
        canonicalGroupKey: rule.canonicalGroupKey,
        scopeStatus: rule.scopeStatus,
        reviewStatus: rule.reviewStatus,
        inputCondition: rule.inputCondition,
        disposition: rule.mutationDisposition,
        validation: rule.validation,
        activation: rule.activation,
        accountRuleKey: rule.accountRuleKey,
        accountCase: "NOT_APPLICABLE",
        expectedOutcomeCode: rule.expectedOutcomeCode,
        expectedReasonCode: rule.expectedReasonCode,
        apiExecution: rule.apiExecution,
        expectedHttp: rule.expectedHttp,
        expectedCandidateCount: rule.expectedCandidateCount,
        expectedSelections: rule.expectedSelections,
        effects: {
          payloadGenerated: false,
          confirmed: false,
          postingCount: 0,
          repairQueueCount: 0,
          auditMutationCount: 0,
          databaseWriteCount: 0,
          stubCallCount: 0,
          stubRequestIdentity: "NOT_APPLICABLE",
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
        sourceEvidence: rule.sourceEvidence,
      }));
      const partitions: Record<string, JsonObject[]> = Object.fromEntries(
        ["GENERATE_CANONICAL","CONVERT","REMOVE_SOURCE_TOKEN","UNCHANGED","SKIP_NEGATIVE","SKIP_HISTORY","SKIP_COV","HOLD_DEPENDENCY","OUT_OF_SCOPE"].map((name) => [name, []]),
      );
      for (const row of rows)
        partitions[String(row.mutationDisposition)].push({
          canonicalGroupKey: row.canonicalGroupKey,
          reasonCode: row.expectedReasonCode,
          executable: row.mutationDisposition !== "OUT_OF_SCOPE",
        });
      return {
        ruleTable: { artifactId: "SSI-MT1-MT2-REPAIR-RULE-TABLE-V1", status: "FROZEN", executable: false, rows },
        oracle: { artifactId: "SSI-MT1-MT2-TEST-ORACLE-V1", status: "FROZEN", executable: false, rows: oracleRows },
        partitionManifest: { artifactId: "SSI-MT1-MT2-EXPECTED-PARTITION-MANIFEST-V1", status: "FROZEN", executable: false, partitions, completion: { complete: true, scope: "ROUND4_APPROVED_PARTITION", totalGroups: 67, executableGroups: 62, heldGroups: 0, unknown: 0, multiple: 0 }, approval: { ba: "PENDING", qa: "PENDING" } },
        canonicalGroupManifest: { ...canonical, status: "FROZEN", classification: { status: "PARTITIONED", reasonCode: "ROUND4_APPROVED_PARTITION", executable: false }, approval: { ba: "PENDING", qa: "PENDING" } },
        executionContexts: {
          ...contexts,
          contexts: replaceByKey(
            array(contexts.contexts),
            newContexts,
            "contextId",
          ),
        },
        derivationCatalogue: {
          ...derivations,
          tuples: replaceByKey(
            array(derivations.tuples),
            newDerivations,
            "derivationRuleId",
          ),
        },
        selectedIdentityManifest: {
          ...identities,
          pairs: replaceByKey(array(identities.pairs), newPairs, "scope"),
        },
      };
    } finally {
      db.close();
    }
  }
}

const main = (): void => {
  const root = "qa/FIX_DATA/ssi/mt1-mt2";
  const result = new SsiRuleOracleMaterializer("data/ssi-demo.sqlite", root).build();
  const files: Record<string, unknown> = {
    "repair-rule-table.v1.json": result.ruleTable,
    "test-oracle.v1.json": result.oracle,
    "expected-partition-manifest.v1.json": result.partitionManifest,
    "canonical-group-manifest.v1.json": result.canonicalGroupManifest,
    "execution-context-catalogues.v1.json": result.executionContexts,
    "derivation-tuple-catalogue.v1.json": result.derivationCatalogue,
    "expected-selected-identity-manifest.v1.json": result.selectedIdentityManifest,
  };
  for (const [name, value] of Object.entries(files))
    writeFileSync(resolve(root, name), serialize(value), "utf8");
};

if (process.argv[1]?.endsWith("mt1-mt2-rule-oracle-materializer.ts")) main();
