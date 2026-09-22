import { BadRequestException, ConflictException } from "@nestjs/common";

export type GovernedTransitionAction =
  "SUBMIT" | "APPROVE" | "REJECT" | "ACTIVATE";

interface GovernedTransitionRecord {
  id: string;
  status: string;
  maker: string;
  version: number;
  updatedAt: string;
  changeType?: string;
  suppressionReason?: string;
  checker?: string;
  rejectionReason?: string;
}

const TRANSITIONS: Record<
  GovernedTransitionAction,
  { expectedStatus: string; nextStatus: string }
> = {
  SUBMIT: { expectedStatus: "DRAFT", nextStatus: "PENDING_APPROVAL" },
  APPROVE: { expectedStatus: "PENDING_APPROVAL", nextStatus: "ACTIVE" },
  REJECT: { expectedStatus: "PENDING_APPROVAL", nextStatus: "DRAFT" },
  ACTIVATE: { expectedStatus: "APPROVED", nextStatus: "ACTIVE" },
};

export const validateGovernedTransition = (
  current: GovernedTransitionRecord,
  action: GovernedTransitionAction,
  actor: string,
  reason: string,
): void => {
  const expected = TRANSITIONS[action].expectedStatus;
  if (current.status !== expected)
    throw new ConflictException(`Expected ${expected}`);
  if (action === "SUBMIT" && actor !== current.maker)
    throw new ConflictException("Only maker can submit");
  if ((action === "APPROVE" || action === "REJECT") && actor === current.maker)
    throw new ConflictException("Maker cannot approve");
  if (
    action === "SUBMIT" &&
    current.changeType === "SUPPRESSION" &&
    (current.suppressionReason?.trim().length ?? 0) < 5
  )
    throw new BadRequestException("SUPPRESSION_REASON_REQUIRED");
  if (action === "REJECT" && reason.trim().length < 5)
    throw new BadRequestException("REJECTION_REASON_REQUIRED");
};

export const approveGovernedSuppression = <T extends GovernedTransitionRecord>(
  current: T,
  action: GovernedTransitionAction,
  actor: string,
  resource: string,
  approve:
    | ((id: string, actor: string, resource: string) => T | null | undefined)
    | undefined,
): T | undefined => {
  if (action !== "APPROVE" || current.changeType !== "SUPPRESSION")
    return undefined;
  const suppressed = approve?.(current.id, actor, resource);
  if (!suppressed) throw new ConflictException("SUPPRESSION_STATE_CHANGED");
  return suppressed;
};

export const buildGovernedTransitionRecord = <
  T extends GovernedTransitionRecord,
>(
  current: T,
  action: GovernedTransitionAction,
  actor: string,
  reason: string,
): T => {
  const next = {
    ...current,
    status: TRANSITIONS[action].nextStatus,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
  if (action === "APPROVE") next.checker = actor;
  if (action === "REJECT") {
    next.checker = actor;
    next.rejectionReason = reason.trim();
  }
  return next;
};

export const buildGovernedRevocation = <T extends GovernedTransitionRecord>(
  current: T,
  actor: string,
  reason: string,
): T => {
  if (!actor || reason?.trim().length < 5)
    throw new BadRequestException("ACTOR_AND_REASON_REQUIRED");
  if (current.status === "ACTIVE")
    throw new ConflictException("ACTIVE_REQUIRES_SUPPRESSION");
  if (current.status !== "DRAFT" && current.status !== "WIP")
    throw new ConflictException("REVOCATION_REQUIRES_DRAFT");
  return {
    ...current,
    status: "REVOKED",
    revokeReason: reason.trim(),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  } as T;
};
