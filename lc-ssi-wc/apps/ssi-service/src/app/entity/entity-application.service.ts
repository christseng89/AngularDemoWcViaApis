import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EntityRepository, type EntityRecord } from "./entity.repository";
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
  list() {
    return this.repository.list();
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
    if (current.status !== "DRAFT" || current.maker !== c.maker) {
      throw new ConflictException("Only original maker can update DRAFT");
    }
    this.validate(c);
    const next = {
      ...current,
      ...c,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.repository.save(next, "UPDATED", c.maker, "ENTITY");
    return next;
  }
  revise(id: string, maker: string) {
    const current = this.require(id);
    if (!maker || ["REVOKED", "SUPERSEDED"].includes(current.status)) {
      throw new ConflictException("Entity cannot be revised");
    }
    const now = new Date().toISOString();
    const next: EntityRecord = {
      ...current,
      id: randomUUID(),
      maker,
      status: "DRAFT",
      version: current.version + 1,
      amendmentOfId: current.id,
      createdAt: now,
      updatedAt: now,
    };
    delete next.checker;
    this.repository.save(next, "REVISION_CREATED", maker, "ENTITY");
    return next;
  }
  transition(
    id: string,
    action: "SUBMIT" | "APPROVE" | "ACTIVATE",
    actor: string,
  ) {
    const current = this.require(id);
    const expected = {
      SUBMIT: "DRAFT",
      APPROVE: "PENDING_APPROVAL",
      ACTIVATE: "APPROVED",
    }[action];
    if (current.status !== expected) {
      throw new ConflictException(`Expected ${expected}`);
    }
    if (action === "SUBMIT" && actor !== current.maker) {
      throw new ConflictException("Only maker can submit");
    }
    if (action === "APPROVE" && actor === current.maker) {
      throw new ConflictException("Maker cannot approve");
    }
    if (action === "ACTIVATE") {
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
        APPROVE: "APPROVED",
        ACTIVATE: "ACTIVE",
      }[action],
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      ...(action === "APPROVE" ? { checker: actor } : {}),
    };
    this.repository.save(next, action, actor, "ENTITY");
    return next;
  }
  revoke(id: string, actor: string, reason: string) {
    const current = this.require(id);
    if (!actor || reason?.trim().length < 5) {
      throw new BadRequestException("ACTOR_AND_REASON_REQUIRED");
    }
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
