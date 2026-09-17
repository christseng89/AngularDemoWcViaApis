import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EntityRepository, type EntityRecord } from "./entity.repository";
import { revisionWipExpiresAt } from "../shared/sqlite-governed.repository";
export type EntityCommand = Pick<
  EntityRecord,
  | "branchCode"
  | "branchName"
  | "legalEntityCode"
  | "legalEntityName"
  | "countryCode"
  | "validFrom"
  | "validTo"
  | "maker"
>;
@Injectable()
export class EntityApplicationService {
  constructor(private readonly repository: EntityRepository) {}
  validateCommand(command: EntityCommand): void {
    this.validate(command);
  }
  list(status?: string) {
    return this.repository.list(status);
  }
  listPage(request: {
    status?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }) {
    return this.repository.listPage(request);
  }
  create(c: EntityCommand) {
    this.validate(c);
    const now = new Date().toISOString();
    const record: EntityRecord = {
      id: randomUUID(),
      ...c,
      status: "DRAFT",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.repository.save(record, "CREATED", c.maker, "ENTITY");
    return record;
  }
  update(id: string, c: EntityCommand) {
    const current = this.require(id);
    if (current.changeType === "SUPPRESSION") {
      throw new ConflictException("SUPPRESSION_DRAFT_CANNOT_BE_EDITED");
    }
    if (
      !["DRAFT", "WIP"].includes(current.status) ||
      current.maker !== c.maker
    ) {
      throw new ConflictException("Only original maker can update DRAFT");
    }
    this.validate(c);
    const next = {
      ...current,
      ...c,
      status: "DRAFT",
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    delete next.revisionWipExpiresAt;
    this.repository.save(next, "UPDATED", c.maker, "ENTITY");
    return next;
  }
  revise(id: string, maker: string) {
    const current = this.require(id);
    if (!maker || ["REVOKED", "SUPERSEDED"].includes(current.status)) {
      throw new ConflictException("Entity cannot be revised");
    }
    if (!["ACTIVE", "APPROVED"].includes(current.status)) {
      throw new ConflictException("INVALID_REVISION_STATUS");
    }
    if (this.repository.hasOpenRevision?.(current.id)) {
      throw new ConflictException("OPEN_REVISION_EXISTS");
    }
    const now = new Date().toISOString();
    const next: EntityRecord = {
      ...current,
      id: randomUUID(),
      maker,
      status: "WIP",
      revisionWipExpiresAt: revisionWipExpiresAt(),
      version: current.version + 1,
      amendmentOfId: current.id,
      createdAt: now,
      updatedAt: now,
    };
    delete next.checker;
    const reserved =
      this.repository.saveRevisionWorkInProgress?.(next, maker, "ENTITY") ??
      (this.repository.save(next, "WIP_RESERVED", maker, "ENTITY"), true);
    if (!reserved) throw new ConflictException("REVISION_NOT_AVAILABLE");
    return next;
  }
  suppress(id: string, maker: string, reason: string) {
    const current = this.require(id);
    if (!maker) throw new BadRequestException("MAKER_REQUIRED");
    if ((reason?.trim().length ?? 0) < 5)
      throw new BadRequestException("SUPPRESSION_REASON_REQUIRED");
    if (current.status !== "ACTIVE")
      throw new ConflictException("ONLY_ACTIVE_CAN_BE_SUPPRESSED");
    if (this.repository.hasOpenRevision?.(current.id))
      throw new ConflictException("OPEN_REVISION_EXISTS");
    const now = new Date().toISOString();
    const next: EntityRecord = {
      ...current,
      id: randomUUID(),
      maker,
      status: "DRAFT",
      changeType: "SUPPRESSION",
      suppressionReason: reason.trim(),
      version: current.version + 1,
      amendmentOfId: current.id,
      createdAt: now,
      updatedAt: now,
    };
    delete next.checker;
    const reserved =
      this.repository.saveRevisionWorkInProgress?.(
        next,
        maker,
        "ENTITY",
        "SUPPRESSION_DRAFT_CREATED",
      ) ??
      (this.repository.save(next, "SUPPRESSION_DRAFT_CREATED", maker, "ENTITY"),
      true);
    if (!reserved) throw new ConflictException("SUPPRESSION_NOT_AVAILABLE");
    return next;
  }
  transition(
    id: string,
    action: "SUBMIT" | "APPROVE" | "REJECT" | "ACTIVATE",
    actor: string,
    reason = "",
  ) {
    const current = this.require(id);
    const expected = {
      SUBMIT: "DRAFT",
      APPROVE: "PENDING_APPROVAL",
      REJECT: "PENDING_APPROVAL",
      ACTIVATE: "APPROVED",
    }[action];
    if (current.status !== expected) {
      throw new ConflictException(`Expected ${expected}`);
    }
    if (action === "SUBMIT" && actor !== current.maker) {
      throw new ConflictException("Only maker can submit");
    }
    if (["APPROVE", "REJECT"].includes(action) && actor === current.maker) {
      throw new ConflictException("Maker cannot approve");
    }
    if (
      action === "SUBMIT" &&
      current.changeType === "SUPPRESSION" &&
      (current.suppressionReason?.trim().length ?? 0) < 5
    )
      throw new BadRequestException("SUPPRESSION_REASON_REQUIRED");
    if (action === "REJECT" && reason.trim().length < 5)
      throw new BadRequestException("REJECTION_REASON_REQUIRED");
    if (action === "APPROVE" && current.changeType === "SUPPRESSION") {
      const suppressed = this.repository.approveSuppression?.(
        current.id,
        actor,
        "ENTITY",
      );
      if (!suppressed) throw new ConflictException("SUPPRESSION_STATE_CHANGED");
      return suppressed;
    }
    if (action === "APPROVE" || action === "ACTIVATE") {
      for (const previous of this.repository
        .list()
        .filter(
          (item) =>
            item.id !== id &&
            item.status === "ACTIVE" &&
            item.branchCode === current.branchCode,
        )) {
        this.repository.save(
          {
            ...previous,
            status: "SUPERSEDED",
            version: previous.version + 1,
            updatedAt: new Date().toISOString(),
          },
          "SUPERSEDED",
          actor,
          "ENTITY",
        );
      }
    }
    const next = {
      ...current,
      status: {
        SUBMIT: "PENDING_APPROVAL",
        APPROVE: "ACTIVE",
        REJECT: "DRAFT",
        ACTIVATE: "ACTIVE",
      }[action],
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      ...(action === "APPROVE" ? { checker: actor } : {}),
      ...(action === "REJECT"
        ? { checker: actor, rejectionReason: reason.trim() }
        : {}),
    };
    this.repository.save(next, action, actor, "ENTITY");
    return next;
  }
  revoke(id: string, actor: string, reason: string) {
    const current = this.require(id);
    if (!actor || reason?.trim().length < 5) {
      throw new BadRequestException("ACTOR_AND_REASON_REQUIRED");
    }
    if (current.status === "ACTIVE")
      throw new ConflictException("ACTIVE_REQUIRES_SUPPRESSION");
    if (!["DRAFT", "WIP"].includes(current.status))
      throw new ConflictException("REVOCATION_REQUIRES_DRAFT");
    const next = {
      ...current,
      status: "REVOKED",
      revokeReason: reason.trim(),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.repository.save(next, "REVOKED", actor, "ENTITY");
    return next;
  }
  audit() {
    return this.repository.audit();
  }
  private require(id: string) {
    const value = this.repository.find(id);
    if (!value) {
      throw new NotFoundException("Entity not found");
    }
    return value;
  }
  private validate(c: EntityCommand) {
    if (
      !/^[A-Z]{2}\d{2}$/.test(c.branchCode) ||
      !c.branchName ||
      !c.legalEntityCode ||
      !c.legalEntityName ||
      !/^[A-Z]{2}$/.test(c.countryCode) ||
      !c.maker
    ) {
      throw new BadRequestException("ENTITY_FIELDS_INVALID");
    }
    if (Date.parse(c.validFrom) >= Date.parse(c.validTo)) {
      throw new BadRequestException("INVALID_DATES");
    }
  }
}
