import { createHash } from "node:crypto";
import type {
  GeneratedMt347DemoContext,
  GeneratedMt347DemoDataset,
} from "./mt347-demo.generator.ts";

export interface CanonicalSeedTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}

export interface CanonicalSeed {
  readonly schemaVersion?: string;
  readonly fixtureId?: string;
  readonly classification?: string;
  readonly [key: string]: unknown;
  readonly tables: Readonly<Record<string, CanonicalSeedTable>>;
}

export interface Mt347SeedMappingReport {
  readonly mode: "OFFLINE_MAPPING_ZERO_WRITES";
  readonly oracleContexts: number;
  readonly mappedSsiContexts: number;
  readonly mappedPositiveSsiRows: number;
  readonly outOfScopeOracleOnlyContexts: number;
  readonly historicalMt347SsiRows: number;
  readonly versionedMt347SsiRows: number;
  readonly physicalMt347SsiRows: number;
  readonly historicalIdCollisions: 0;
  readonly applicabilityIdCollisions: 0;
  readonly unmatchedSsiOwnedContexts: number;
  readonly resultingMt347SsiRows: number;
  readonly databaseWrites: 0;
}

export interface Mt347SeedMappingResult {
  readonly seed: CanonicalSeed;
  readonly report: Mt347SeedMappingReport;
}

type JsonObject = Record<string, unknown>;

interface ApplicabilityMapping {
  readonly businessStatus: "BA_CONFIRMED";
  readonly contextKey: string;
  readonly reasonCode: string;
  readonly resolverOutcome: string;
  readonly usageScope: "QA_POSITIVE" | "QA_NEGATIVE";
  readonly validationOwner: string;
}

interface VersionedSsiMapping {
  readonly newSsiId: string;
  readonly mapping: ApplicabilityMapping;
}

const parseObject = (value: unknown): JsonObject =>
  JSON.parse(String(value)) as JsonObject;

const routeOf = (payload: JsonObject): JsonObject =>
  (payload["route"] ?? {}) as JsonObject;

const groupIdOf = (payload: JsonObject): string =>
  String(
    routeOf(payload)["fixtureGroupId"] ??
      String(payload["fixtureBindingId"] ?? "").split("::")[0],
  )
    .replace(/^FIX-/, "")
    .replace(/@v\d+$/, "");

const contextKeyOf = (payload: JsonObject): string => {
  const route = routeOf(payload);
  return [
    groupIdOf(payload),
    route["currency"],
    route["counterpartyBic"],
    route["bookingEntity"],
    "OUTBOUND",
  ].join("::");
};

const tableWithRows = (
  source: CanonicalSeedTable,
  rows: readonly (readonly unknown[])[],
): CanonicalSeedTable => ({
  columns: [...source.columns],
  rows: [...rows].sort((left, right) => {
    for (let index = 0; index < left.length; index += 1) {
      const a = String(left[index] ?? "");
      const b = String(right[index] ?? "");
      if (a < b) return -1;
      if (a > b) return 1;
    }
    return 0;
  }),
});

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export class Mt347CanonicalSeedMapper {
  map(
    sourceValue: Record<string, unknown>,
    generated: GeneratedMt347DemoDataset,
  ): Mt347SeedMappingResult {
    const source = sourceValue as CanonicalSeed;
    const ssiTable = this.requireTable(source, "ssi");
    const applicabilityTable = this.requireTable(source, "ssi_applicability");
    const contexts = new Map(
      generated.contexts.map((context) => [context.key, context]),
    );
    const oosGroups = new Set(
      generated.contexts
        .filter((context) => context.businessStatus === "OUT_OF_SCOPE_CLOSED")
        .map((context) => context.groupId),
    );
    const matched = new Set<string>();
    const versionedSsiMappings = new Map<string, VersionedSsiMapping>();
    let mappedPositiveSsiRows = 0;

    const ssiIdIndex = this.columnIndex(ssiTable, "id");
    const ssiPayloadIndex = this.columnIndex(ssiTable, "payload");
    const versionedSsiRows = ssiTable.rows.flatMap((row) => {
      const payload = parseObject(row[ssiPayloadIndex]);
      if (payload["fixtureFamily"] !== "MT347-SR2026-SSI") return [];
      const route = routeOf(payload);
      const historicalSsiId = String(row[ssiIdIndex]);
      let mapped: JsonObject;
      let mapping: ApplicabilityMapping;
      if (route["fixtureSet"] === "MT347-CANONICAL-POSITIVE") {
        mapped = this.mapPositiveSsiPayload(payload);
        mapping = this.positiveMapping(mapped);
        mappedPositiveSsiRows += 1;
      } else {
        if (route["fixtureSet"] !== "MT347-NEGATIVE") return [];
        const groupId = groupIdOf(payload);
        if (oosGroups.has(groupId)) return [];
        const context = contexts.get(contextKeyOf(payload));
        if (!context || context.businessStatus !== "BA_CONFIRMED") return [];
        matched.add(context.key);
        mapped = this.mapNegativeSsiPayload(payload, context);
        mapping = this.negativeMapping(context);
      }
      const newSsiId = deterministicUuid(
        `MT347|V1.1|SSI|${mapping.usageScope}|${mapping.contextKey}`,
      );
      versionedSsiMappings.set(historicalSsiId, { newSsiId, mapping });
      const next = [...row];
      next[ssiIdIndex] = newSsiId;
      next[ssiPayloadIndex] = JSON.stringify({
        ...mapped,
        id: newSsiId,
        historicalSsiId,
        datasetVersion: "MT347-DEMO-V1.1",
      });
      return [next];
    });

    const applicabilitySsiIdIndex = this.columnIndex(
      applicabilityTable,
      "ssi_id",
    );
    const applicabilityPayloadIndex = this.columnIndex(
      applicabilityTable,
      "payload",
    );
    const applicabilityIdIndex = this.columnIndex(applicabilityTable, "id");
    const versionedApplicabilityRows = applicabilityTable.rows.flatMap((row) => {
      const historicalSsiId = String(row[applicabilitySsiIdIndex]);
      const versioned = versionedSsiMappings.get(historicalSsiId);
      if (!versioned) return [];
      const payload = parseObject(row[applicabilityPayloadIndex]);
      const newApplicabilityId = deterministicUuid(
        [
          "MT347",
          "V1.1",
          "APPLICABILITY",
          versioned.newSsiId,
          payload["messageType"],
          payload["sequence"],
          payload["settlementLeg"],
        ].join("|"),
      );
      const next = [...row];
      next[applicabilityIdIndex] = newApplicabilityId;
      next[applicabilitySsiIdIndex] = versioned.newSsiId;
      next[applicabilityPayloadIndex] = JSON.stringify(
        {
          ...this.mapApplicabilityPayload(payload, versioned.mapping),
          id: newApplicabilityId,
          ssiId: versioned.newSsiId,
          historicalApplicabilityId: String(row[applicabilityIdIndex]),
          historicalSsiId,
          datasetVersion: "MT347-DEMO-V1.1",
        },
      );
      return [next];
    });

    const historicalSsiIds = new Set(
      ssiTable.rows.map((row) => String(row[ssiIdIndex])),
    );
    const historicalApplicabilityIds = new Set(
      applicabilityTable.rows.map((row) => String(row[applicabilityIdIndex])),
    );
    const historicalIdCollisions = versionedSsiRows.filter((row) =>
      historicalSsiIds.has(String(row[ssiIdIndex])),
    ).length;
    const applicabilityIdCollisions = versionedApplicabilityRows.filter((row) =>
      historicalApplicabilityIds.has(String(row[applicabilityIdIndex])),
    ).length;
    if (historicalIdCollisions || applicabilityIdCollisions)
      throw new Error("MT347_VERSIONED_ID_COLLISION");

    const mappedSsiRows = [...ssiTable.rows, ...versionedSsiRows];
    const mappedApplicabilityRows = [
      ...applicabilityTable.rows,
      ...versionedApplicabilityRows,
    ];

    const tables: Record<string, CanonicalSeedTable> = {
      ...source.tables,
      ssi: tableWithRows(ssiTable, mappedSsiRows),
      ssi_applicability: tableWithRows(
        applicabilityTable,
        mappedApplicabilityRows,
      ),
    };
    const physicalMt347SsiRows = mappedSsiRows.filter((row) => {
      const payload = parseObject(row[ssiPayloadIndex]);
      return payload["fixtureFamily"] === "MT347-SR2026-SSI";
    }).length;
    const historicalMt347SsiRows = ssiTable.rows.filter((row) => {
      const payload = parseObject(row[ssiPayloadIndex]);
      return payload["fixtureFamily"] === "MT347-SR2026-SSI";
    }).length;
    const resultingMt347SsiRows = versionedSsiRows.length;
    const expectedSsiOwned = generated.contexts.filter(
      (context) => context.businessStatus === "BA_CONFIRMED",
    ).length;

    return Object.freeze({
      seed: Object.freeze({
        ...source,
        fixtureId: "SSI-DEMO-MT347-ORACLE-V1.1-MAPPING-CANDIDATE",
        classification: "SYNTHETIC_DEMO_QA_UAT_MAPPING_CANDIDATE",
        mappingStatus: "OFFLINE_DRY_RUN_NOT_AUTHORIZED_FOR_RELOAD",
        mappingSummary: {
          positiveContexts: mappedPositiveSsiRows,
          negativeContexts: expectedSsiOwned,
          outOfScopeOracleOnlyContexts:
            generated.contexts.length - expectedSsiOwned,
          historicalMt347SsiRows,
          versionedMt347SsiRows: resultingMt347SsiRows,
          physicalMt347SsiRows,
          databaseWrites: 0,
        },
        tables,
      }),
      report: Object.freeze({
        mode: "OFFLINE_MAPPING_ZERO_WRITES",
        oracleContexts: generated.contexts.length,
        mappedSsiContexts: matched.size,
        mappedPositiveSsiRows,
        outOfScopeOracleOnlyContexts:
          generated.contexts.length - expectedSsiOwned,
        historicalMt347SsiRows,
        versionedMt347SsiRows: resultingMt347SsiRows,
        physicalMt347SsiRows,
        historicalIdCollisions: 0,
        applicabilityIdCollisions: 0,
        unmatchedSsiOwnedContexts: expectedSsiOwned - matched.size,
        resultingMt347SsiRows,
        databaseWrites: 0,
      }),
    });
  }

  private mapNegativeSsiPayload(
    payload: JsonObject,
    context: GeneratedMt347DemoContext,
  ): JsonObject {
    return {
      ...payload,
      fixtureVariantVersion: "MT347-DEMO-ORACLE-V1.1",
      nvrOutcome: context.reasonCode,
      operationalVisible: false,
      paymentExecutable: false,
      usageScope: "QA_NEGATIVE",
      validationOwner: context.validationOwner,
      route: this.referenceOnlyRoute(payload, {
        controlledStubIdentity: context.controlledStubIdentity,
        oracleBusinessStatus: context.businessStatus,
        oracleContextKey: context.key,
        oracleReasonCode: context.reasonCode,
        oracleResolverOutcome: context.resolverOutcome,
        sourceType: context.sourceType,
        ssiLookup: context.ssiLookup,
      }),
    };
  }

  private mapPositiveSsiPayload(payload: JsonObject): JsonObject {
    const route = routeOf(payload);
    const contextKey = [
      "MT347-POSITIVE",
      groupIdOf(payload),
      route["currency"],
      route["counterpartyBic"],
      route["bookingEntity"],
      "OUTBOUND",
    ].join("::");
    return {
      ...payload,
      fixtureVariantVersion: "MT347-DEMO-ORACLE-V1.1",
      nvrOutcome: "REFERENCE_ROUTE_VALID",
      operationalVisible: false,
      paymentExecutable: false,
      usageScope: "QA_POSITIVE",
      validationOwner: "SSI_FIELD_RESOLUTION_API",
      route: this.referenceOnlyRoute(payload, {
        oracleBusinessStatus: "BA_CONFIRMED",
        oracleContextKey: contextKey,
        oracleReasonCode: "REFERENCE_ROUTE_VALID",
        oracleResolverOutcome: "REFERENCE_ROUTE_ACCEPTED",
        ssiLookup: "TEST_ORACLE_CONTROLLED",
      }),
    };
  }

  private referenceOnlyRoute(
    payload: JsonObject,
    fields: Readonly<Record<string, unknown>>,
  ): JsonObject {
    const route = { ...routeOf(payload) };
    for (const field of [
      "clearingSystem",
      "settlementMarket",
      "schemeType",
      "routeType",
    ]) {
      delete route[field];
    }
    return {
      ...route,
      ...fields,
      importValidationProfile: "MT347_DEMO_FIN_REFERENCE_ONLY_V1",
      paymentExecutable: "false",
      profileKind: "FIN_REFERENCE_ONLY",
      settlementModel: "FIN_REFERENCE_ONLY",
    };
  }

  private mapApplicabilityPayload(
    payload: JsonObject,
    mapping: ApplicabilityMapping,
  ): JsonObject {
    return {
      ...payload,
      fixtureVariantVersion: "MT347-DEMO-ORACLE-V1.1",
      nvrOutcome: mapping.reasonCode,
      oracleBusinessStatus: mapping.businessStatus,
      oracleContextKey: mapping.contextKey,
      oracleResolverOutcome: mapping.resolverOutcome,
      usageScope: mapping.usageScope,
      validationOwner: mapping.validationOwner,
    };
  }

  private positiveMapping(payload: JsonObject): ApplicabilityMapping {
    const route = routeOf(payload);
    return {
      businessStatus: "BA_CONFIRMED",
      contextKey: String(route["oracleContextKey"]),
      reasonCode: "REFERENCE_ROUTE_VALID",
      resolverOutcome: "REFERENCE_ROUTE_ACCEPTED",
      usageScope: "QA_POSITIVE",
      validationOwner: "SSI_FIELD_RESOLUTION_API",
    };
  }

  private negativeMapping(
    context: GeneratedMt347DemoContext,
  ): ApplicabilityMapping {
    return {
      businessStatus: "BA_CONFIRMED",
      contextKey: context.key,
      reasonCode: context.reasonCode,
      resolverOutcome: context.resolverOutcome,
      usageScope: "QA_NEGATIVE",
      validationOwner: context.validationOwner,
    };
  }

  private requireTable(seed: CanonicalSeed, name: string): CanonicalSeedTable {
    const table = seed.tables[name];
    if (!table) throw new Error(`SEED_TABLE_MISSING:${name}`);
    return table;
  }

  private columnIndex(table: CanonicalSeedTable, name: string): number {
    const index = table.columns.indexOf(name);
    if (index < 0) throw new Error(`SEED_TABLE_COLUMN_MISSING:${name}`);
    return index;
  }
}
