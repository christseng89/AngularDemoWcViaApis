export type OpenRevisionStatus =
  "WIP" | "DRAFT" | "PENDING_APPROVAL" | "APPROVED";
export type OpenRevisionChangeType = "REVISION" | "SUPPRESSION";
export type CurrentStatus = "EMPTY" | "IN_PROGRESS" | "DRAFTED" | "SUPPRESSED";

export interface OpenRevisionProjection {
  readonly id?: string;
  readonly status: OpenRevisionStatus;
  readonly changeType?: OpenRevisionChangeType;
}

export interface CurrentStatusProjection {
  readonly currentStatus: CurrentStatus;
  readonly hasOpenRevision: boolean;
  readonly openRevisionId?: string;
  readonly openRevisionStatus?: OpenRevisionStatus;
  readonly openRevisionChangeType?: OpenRevisionChangeType;
}

export function currentStatusFromOpenRevision(
  revision: OpenRevisionProjection | undefined,
): CurrentStatus {
  if (!revision) return "EMPTY";
  if (revision.status === "WIP") return "IN_PROGRESS";
  return revision.changeType === "SUPPRESSION" ? "SUPPRESSED" : "DRAFTED";
}

export function currentStatusProjection(
  revision: OpenRevisionProjection | undefined,
): CurrentStatusProjection {
  if (!revision) return { currentStatus: "EMPTY", hasOpenRevision: false };
  return {
    currentStatus: currentStatusFromOpenRevision(revision),
    hasOpenRevision: true,
    ...(revision.id ? { openRevisionId: revision.id } : {}),
    openRevisionStatus: revision.status,
    ...(revision.changeType
      ? { openRevisionChangeType: revision.changeType }
      : {}),
  };
}
