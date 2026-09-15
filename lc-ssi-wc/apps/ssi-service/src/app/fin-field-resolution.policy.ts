import { Injectable } from "@nestjs/common";
import type { Mapping } from "./mapping-catalogue.service";
import type {
  FinFieldResolutionRequest,
  ResolvedFinField,
} from "./fin-field-resolution.service";

export interface ResolutionCatalogueMetadata {
  catalogueVersion: string;
  sourceArtifactId: string;
  sourceArtifactHash: string;
}
type RouteEntry = {
  field: ResolvedFinField;
  mapping: Readonly<Mapping>;
  index: number;
};

const routeRuns = (entries: readonly RouteEntry[]): readonly RouteEntry[][] =>
  entries.reduce<RouteEntry[][]>((runs, entry) => {
    const run = runs.at(-1);
    const sameNode =
      run &&
      run[0]!.field.provenance["canonicalRouteNodeId"] ===
        entry.field.provenance["canonicalRouteNodeId"] &&
      run[0]!.field.provenance["ownerSide"] ===
        entry.field.provenance["ownerSide"];
    if (sameNode) run.push(entry);
    else runs.push([entry]);
    return runs;
  }, []);

@Injectable()
export class FinFieldResolutionPolicy {
  normalizeCanonicalRoute(
    request: FinFieldResolutionRequest,
    mappings: readonly Readonly<Mapping>[],
    fields: readonly ResolvedFinField[],
  ): ResolvedFinField[] {
    const routeEntries = fields
      .map((field, index) => ({ field, mapping: mappings[index]!, index }))
      .filter(
        ({ field }) =>
          field.scopeStatus === "SSI_SUPPORTED" &&
          field.resolutionStatus === "RESOLVED",
      )
      .sort((left, right) => Number(left.field.tag) - Number(right.field.tag));
    const normalized = [...fields];

    for (const run of routeRuns(routeEntries)) {
      const first = run[0]!;
      const nodeId = first.field.provenance["canonicalRouteNodeId"];
      if (typeof nodeId === "string" && nodeId.trim() && run.length > 1) {
        const keep = this.routeNodeKeeper(request.messageType, run);
        for (const entry of run) {
          if (entry === keep || entry.mapping.presence === "MANDATORY")
            continue;
          normalized[entry.index] = {
            ...entry.field,
            resolutionStatus: "NOT_REQUIRED",
            reasonCode: "ROUTE_COMPLETE",
            resolvedValue: null,
            provenance: {
              ...entry.field.provenance,
              candidateSource: entry.field.provenance["source"],
              candidateOwnerSide: entry.field.provenance["ownerSide"],
              source: "ROUTE_RESOLVER",
              ownerSide: "CANONICAL_ROUTE",
              normalizedCanonicalRoute: true,
              retainedRole: keep.mapping.canonicalRole,
              retainedTag: keep.field.tag,
            },
          };
        }
      }
    }
    return normalized;
  }

  profileExcludedFields(
    request: FinFieldResolutionRequest,
    messageProfile: readonly Readonly<Mapping>[],
    selected: readonly Readonly<Mapping>[],
    catalogue: ResolutionCatalogueMetadata,
  ): ResolvedFinField[] {
    const selectedTags = new Set(
      selected.map((mapping) => this.tagOf(mapping)),
    );
    const excludedByTag = new Map<string, Readonly<Mapping>>();
    for (const mapping of messageProfile) {
      const tag = this.tagOf(mapping);
      const requestedOption = request.fieldOptions?.[tag] ?? "A";
      if (
        selectedTags.has(tag) ||
        mapping.option !== requestedOption ||
        mapping.scopeStatus !== "SSI_SUPPORTED" ||
        excludedByTag.has(tag)
      )
        continue;
      excludedByTag.set(tag, mapping);
    }
    return [...excludedByTag.values()].map((mapping) => ({
      standardsRelease: request.standardsRelease,
      messageType: request.messageType,
      sequence: request.sequence ?? selected[0]?.sequence ?? "MESSAGE",
      settlementLeg:
        request.settlementLeg ?? selected[0]?.settlementLeg ?? "MESSAGE",
      tag: this.tagOf(mapping),
      option: mapping.option!,
      officialFieldName:
        mapping.officialFieldName ?? "Official field name pending verification",
      officialRole: mapping.officialRole ?? mapping.canonicalRole,
      businessFunction: mapping.businessFunction,
      scopeStatus: "OUT_OF_SSI_SCOPE",
      resolutionStatus: "N_A",
      reasonCode: "MESSAGE_PROFILE_EXCLUDED",
      resolvedValue: null,
      nvrRefs: [],
      provenance: {
        catalogueVersion: catalogue.catalogueVersion,
        sourceArtifactId: catalogue.sourceArtifactId,
        sourceArtifactHash: catalogue.sourceArtifactHash,
        source: "MESSAGE_PROFILE",
        ownerSide: "CANONICAL_ROUTE",
        sourceRecordId: mapping.evidenceArtifactId,
        candidateProfileSequence: mapping.sequence,
        candidateProfileSettlementLeg: mapping.settlementLeg,
      },
    }));
  }

  private routeNodeKeeper(
    messageType: string,
    run: readonly {
      field: ResolvedFinField;
      mapping: Readonly<Mapping>;
      index: number;
    }[],
  ): { field: ResolvedFinField; mapping: Readonly<Mapping>; index: number } {
    const mandatory = run.filter(
      ({ mapping }) => mapping.presence === "MANDATORY",
    );
    if (mandatory.length === 1) return mandatory[0]!;
    if (messageType === "MT400") {
      const receiverCorrespondent = run.find(
        ({ mapping }) => mapping.canonicalRole === "RECEIVERS_CORRESPONDENT",
      );
      if (receiverCorrespondent) return receiverCorrespondent;
    }
    const endpoint = run.find(({ mapping }) =>
      ["RECEIVING_AGENT", "ACCOUNT_WITH_INSTITUTION"].includes(
        mapping.canonicalRole,
      ),
    );
    if (endpoint) return endpoint;
    const source = run.find(({ mapping }) =>
      [
        "DELIVERY_AGENT",
        "SENDERS_CORRESPONDENT",
        "RECEIVERS_CORRESPONDENT",
      ].includes(mapping.canonicalRole),
    );
    return source ?? run[0]!;
  }

  private tagOf(mapping: Readonly<Mapping>): string {
    return /(5[3-8])[A-Z]?$/.exec(mapping.path)![1]!;
  }
}
