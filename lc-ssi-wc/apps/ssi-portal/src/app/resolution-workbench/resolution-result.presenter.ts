import type {
  ResolutionPageExecutionOutcome,
  ResolutionPageFieldResult,
  ResolutionPageGeneratedOutput,
  ResolutionPageSettlementRoute,
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
  readonly rmaId: string;
  readonly counterpartyBic: string;
  readonly counterpartyName: string;
  readonly roles: readonly string[];
  readonly legs: readonly string[];
  readonly projections: readonly string[];
}

const projectionIdentifier = (
  projection: ResolutionPageSettlementRoute["projections"][number],
): string => {
  if (projection.kind === "SWIFT_MT_FIELD")
    return `SWIFT ${projection.identifier}${projection.option ?? ""}`;
  if (projection.kind === "ISO_20022_ELEMENT")
    return `ISO 20022 ${projection.identifier}`;
  return projection.identifier;
};

export const resolutionRouteSummary = (
  outputs: readonly ResolutionPageGeneratedOutput[],
  settlementRoute?: ResolutionPageSettlementRoute,
): ResolutionRouteSummary | undefined => {
  if (settlementRoute) {
    return {
      ssiId: `${settlementRoute.ssi.id} v${settlementRoute.ssi.version}`,
      ssiCode: "",
      settlementRouteId: settlementRoute.routeBindingId,
      nostroId: `${settlementRoute.nostro.id} v${settlementRoute.nostro.version}`,
      accountId: settlementRoute.legs[0]?.accountReference ?? "",
      applicabilityId: `${settlementRoute.applicability.id} v${settlementRoute.applicability.version}`,
      rmaId: `${settlementRoute.rma.id} v${settlementRoute.rma.version}`,
      counterpartyBic: settlementRoute.counterparty.bic,
      counterpartyName: settlementRoute.counterparty.name ?? "",
      roles: settlementRoute.roles.map(
        ({ role, owner, recordId, version }) =>
          `${role} · ${owner} · ${recordId} v${version}`,
      ),
      legs: settlementRoute.legs.map(
        (leg) =>
          `${leg.order} · ${leg.relationship} · ${leg.accountOwner.bic} → ${leg.accountServicer.bic} · ${leg.accountReference} · ${leg.currency}`,
      ),
      projections: settlementRoute.projections.map(
        (projection) =>
          `${projectionIdentifier(projection)} · ${projection.label} · ${projection.value} · ${projection.accountReference}`,
      ),
    };
  }
  const document = outputs.find(
    (output) => output.format === "ISO_20022",
  )?.document;
  const route = document?.["chosenRoute"];
  if (!route || typeof route !== "object" || Array.isArray(route))
    return undefined;
  const selected = route as Record<string, unknown>;
  const value = (key: string): string =>
    typeof selected[key] === "string" ? (selected[key] as string) : "";
  const ssiId = value("ssiId");
  if (!ssiId) return undefined;
  return {
    ssiId,
    ssiCode: value("ssiCode"),
    settlementRouteId: value("settlementRouteId"),
    nostroId: value("nostroId"),
    accountId: value("accountId"),
    applicabilityId: value("matchedApplicabilityId"),
    rmaId: "",
    counterpartyBic: "",
    counterpartyName: "",
    roles: [],
    legs: [],
    projections: [],
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

export const resolutionRouteProjectionRows = (
  settlementRoute?: ResolutionPageSettlementRoute,
): readonly ResolutionResultRow[] => {
  if (!settlementRoute) return [];
  const institutions = settlementRoute.legs.flatMap((leg) => [
    leg.accountOwner,
    leg.accountServicer,
  ]);
  return settlementRoute.projections.map((projection, index) => {
    const leg = settlementRoute.legs.find(
      (candidate) =>
        candidate.role === projection.role &&
        candidate.accountReference === projection.accountReference,
    );
    const institution = institutions.find(
      ({ bic }) => bic === projection.value,
    );
    const tagAndOption =
      projection.kind === "SWIFT_MT_FIELD"
        ? `${projection.identifier}${projection.option ?? ""}`
        : projection.identifier;
    return {
      key: `${projection.kind}:${tagAndOption}:${projection.role}:${index}`,
      sequenceId: "",
      settlementLeg: leg?.relationship ?? "",
      swiftTag: projection.identifier,
      swiftOption: projection.option ?? "",
      tagAndOption,
      role: projection.role,
      fieldName: projection.label,
      displayFieldName: projection.label,
      renderedValue: projection.value,
      bic: institution?.bic ?? "",
      institutionName: institution?.name ?? "",
      accountReference: projection.accountReference,
      partyIdentifier: "",
      status: "RESOLVED",
      statusLabel: "RESOLVED",
      reasonCode: "",
      statusDetail: `Source: ${projection.sourceRecordId} v${projection.version}`,
      provenance: `${projection.sourceRecordId} · ${projection.version}`,
    };
  });
};

export const emptyResolutionMessage = (
  outcome: ResolutionPageExecutionOutcome,
): string =>
  outcome === "NOT_REQUIRED"
    ? "Field-level SSI is not required for this scenario."
    : "No field-level SSI resolution results were returned.";
