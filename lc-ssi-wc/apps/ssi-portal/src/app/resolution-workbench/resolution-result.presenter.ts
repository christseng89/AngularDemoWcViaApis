import type {
  ResolutionPageExecutionOutcome,
  ResolutionPageFieldResult,
  ResolutionPageGeneratedOutput,
} from "@ssi/contracts";

export interface ResolutionResultRow {
  readonly key: string;
  readonly sequenceId: string;
  readonly settlementLeg: string;
  readonly swiftTag: string;
  readonly swiftOption: string;
  readonly tagAndOption: string;
  readonly role: string;
  readonly fieldName: string;
  readonly displayFieldName: string;
  readonly renderedValue: string;
  readonly bic: string;
  readonly institutionName: string;
  readonly accountReference: string;
  readonly partyIdentifier: string;
  readonly status: ResolutionPageFieldResult["resolutionStatus"];
  readonly statusLabel: string;
  readonly reasonCode: string;
  readonly statusDetail: string;
  readonly provenance: string;
}

const statusLabel = (
  status: ResolutionPageFieldResult["resolutionStatus"],
): string => status.replaceAll("_", " ");

const displayFieldName = (name: string, tagAndOption: string): string => {
  const repeatedPrefix = `SWIFT ${tagAndOption} • `;
  return name.startsWith(repeatedPrefix)
    ? name.slice(repeatedPrefix.length).trim()
    : name;
};

const provenanceSummary = (
  provenance: ResolutionPageFieldResult["provenance"],
): string =>
  [
    provenance.source,
    provenance.sourceRecordId,
    provenance.ownerSide,
    provenance.version,
    provenance.catalogueVersion,
    provenance.sourceArtifactId,
    provenance.sourceArtifactHash,
    provenance.fieldProfileArtifactId,
    provenance.fieldProfileEvidencePages?.length
      ? `pages ${provenance.fieldProfileEvidencePages.join(", ")}`
      : undefined,
    provenance.canonicalRouteNodeId,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

export const resolutionDomainFromOutputs = (
  outputs: readonly ResolutionPageGeneratedOutput[],
): string => {
  const domain = outputs.find((output) => output.format === "ISO_20022")
    ?.document["resolutionDomain"];
  return typeof domain === "string" ? domain.trim() : "";
};

export interface ResolutionRouteSummary {
  readonly ssiId: string;
  readonly ssiCode: string;
  readonly settlementRouteId: string;
  readonly nostroId: string;
  readonly accountId: string;
  readonly applicabilityId: string;
}

export const resolutionRouteSummary = (
  outputs: readonly ResolutionPageGeneratedOutput[],
): ResolutionRouteSummary | undefined => {
  const document = outputs.find((output) => output.format === "ISO_20022")?.document;
  const route = document?.["chosenRoute"];
  if (!route || typeof route !== "object" || Array.isArray(route)) return undefined;
  const selected = route as Record<string, unknown>;
  const value = (key: string): string =>
    typeof selected[key] === "string" ? selected[key] as string : "";
  const ssiId = value("ssiId");
  if (!ssiId) return undefined;
  return {
    ssiId,
    ssiCode: value("ssiCode"),
    settlementRouteId: value("settlementRouteId"),
    nostroId: value("nostroId"),
    accountId: value("accountId"),
    applicabilityId: value("matchedApplicabilityId"),
  };
};

export const resolutionResultRows = (
  fields: readonly ResolutionPageFieldResult[],
): readonly ResolutionResultRow[] =>
  fields.map((field) => ({
    key: `${field.fieldId}:${field.sequenceId}:${field.swiftTag}:${field.swiftOption}`,
    sequenceId: field.sequenceId,
    settlementLeg: field.settlementLeg,
    swiftTag: field.swiftTag,
    swiftOption: field.swiftOption,
    tagAndOption: `${field.swiftTag}${field.swiftOption}`,
    role: field.role,
    fieldName: field.fieldName,
    displayFieldName: displayFieldName(
      field.fieldName,
      `${field.swiftTag}${field.swiftOption}`,
    ),
    renderedValue: field.value ?? "",
    bic: field.institution?.bic ?? "",
    institutionName: field.institution?.name ?? "",
    accountReference: field.accountReference ?? "",
    partyIdentifier: field.partyIdentifier ?? "",
    status: field.resolutionStatus,
    statusLabel: statusLabel(field.resolutionStatus),
    reasonCode: field.reasonCode ?? "",
    statusDetail:
      field.reasonCode ||
      (field.provenance.source ? `Source: ${field.provenance.source}` : ""),
    provenance: provenanceSummary(field.provenance),
  }));

export const emptyResolutionMessage = (
  outcome: ResolutionPageExecutionOutcome,
): string =>
  outcome === "NOT_REQUIRED"
    ? "Field-level SSI is not required for this scenario."
    : "No field-level SSI resolution results were returned.";
