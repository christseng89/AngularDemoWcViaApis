import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  RmaRepository,
  type RmaRecord,
  type RmaDirection,
} from "./rma.repository";

export interface RmaCommand {
  ownBic: string;
  counterpartyBic: string;
  service: "FIN" | "FINPLUS";
  direction: RmaDirection;
  messageTypes: string[];
  validFrom: string;
  validTo: string;
  maker: string;
  source?: "SYNTHETIC_DEMO" | "LICENSED_IMPORT";
}
export interface RmaDecision {
  decisionId: string;
  decision:
    "AUTHORISED" | "NOT_AUTHORISED" | "AMBIGUOUS" | "NOT_FOUND" | "STALE";
  authorised: boolean;
  checkedAt: string;
  effectiveAt: string;
  rmaId?: string;
  rmaVersion?: number;
  source?: RmaRecord["source"];
}
const BIC = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const MESSAGE = /^(?:MT\d{3}(?:COV)?|pacs\.[A-Za-z0-9.]+|\*)$/;
const normalizeBic = (value: string): string => {
  const bic = value.trim().toUpperCase();
  return bic.length === 8 ? `${bic}XXX` : bic;
};
const validIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

@Injectable()
export class RmaApplicationService {
  constructor(private readonly repository: RmaRepository) {}
  list(): RmaRecord[] {
    return this.repository.list();
  }
  validateCommand(command: RmaCommand): void {
    this.validate(command);
  }
  create(command: RmaCommand): RmaRecord {
    this.validate(command);
    const now = new Date().toISOString();
    const record: RmaRecord = {
      id: randomUUID(),
      ...command,
      source: command.source ?? "SYNTHETIC_DEMO",
      status: "DRAFT",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.repository.save(record, "CREATED", command.maker, "RMA");
    return record;
  }
  update(id: string, command: RmaCommand): RmaRecord {
    const current = this.require(id);
    if (current.status !== "DRAFT") {
      throw new ConflictException("Only DRAFT RMA can be updated");
    }
    if (current.maker !== command.maker) {
      throw new ConflictException("Only original maker can update");
    }
    this.validate(command);
    const next = {
      ...current,
      ...command,
      source: command.source ?? current.source,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.repository.save(next, "UPDATED", command.maker, "RMA");
    return next;
  }
  revise(id: string, maker: string): RmaRecord {
    const current = this.require(id);
    if (!maker) {
      throw new BadRequestException("MAKER_REQUIRED");
    }
    if (["REVOKED", "SUPERSEDED"].includes(current.status)) {
      throw new ConflictException("RMA cannot be revised");
    }
    const now = new Date().toISOString();
    const next: RmaRecord = {
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
    this.repository.save(next, "REVISION_CREATED", maker, "RMA");
    return next;
  }
  transition(
    id: string,
    action: "SUBMIT" | "APPROVE" | "ACTIVATE",
    actor: string,
  ): RmaRecord {
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
    const status = {
      SUBMIT: "PENDING_APPROVAL",
      APPROVE: "APPROVED",
      ACTIVATE: "ACTIVE",
    }[action];
    if (action === "ACTIVATE") {
      this.supersede(current, actor);
    }
    const next: RmaRecord = {
      ...current,
      status,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    if (action === "APPROVE") {
      next.checker = actor;
    }
    this.repository.save(next, action, actor, "RMA");
    return next;
  }
  revoke(id: string, actor: string, reason: string): RmaRecord {
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
    this.repository.save(next, "REVOKED", actor, "RMA");
    return next;
  }
  check(request: {
    ownBic: string;
    counterpartyBic: string;
    service: string;
    direction: RmaDirection;
    messageType: string;
    at?: string;
    fixtureFamily?: string;
    usageGroup?: string;
    fixtureBindingId?: string;
  }): RmaDecision {
    const ownBic = normalizeBic(request.ownBic),
      counterpartyBic = normalizeBic(request.counterpartyBic);
    if (!BIC.test(ownBic) || !BIC.test(counterpartyBic)) {
      throw new BadRequestException("INVALID_BIC");
    }
    const effectiveAt = request.at ?? new Date().toISOString().slice(0, 10);
    if (!validIsoDate(effectiveAt)) {
      throw new BadRequestException("INVALID_RMA_CHECK_DATE");
    }
    const checkedAt = new Date().toISOString(),
      decisionId = randomUUID();
    const candidates = this.repository.findAuthorised({
      ownBic,
      counterpartyBic,
      service: request.service,
      direction: request.direction,
      messageType: request.messageType,
      ...(request.fixtureFamily === undefined
        ? {}
        : { fixtureFamily: request.fixtureFamily }),
      ...(request.usageGroup === undefined
        ? {}
        : { usageGroup: request.usageGroup }),
      ...(request.fixtureBindingId === undefined
        ? {}
        : { fixtureBindingId: request.fixtureBindingId }),
    });
    const effectiveTime = Date.parse(effectiveAt);
    const effective = candidates.filter(
      (record) =>
        record.status === "ACTIVE" &&
        Date.parse(record.validFrom) <= effectiveTime &&
        effectiveTime <= Date.parse(record.validTo),
    );
    const base = { decisionId, authorised: false, checkedAt, effectiveAt };
    if (effective.length !== 1) {
      let decision: RmaDecision["decision"] = "NOT_FOUND";
      if (effective.length > 1) {
        decision = "AMBIGUOUS";
      } else if (candidates.length) {
        decision = "NOT_AUTHORISED";
      }
      return {
        ...base,
        decision,
      };
    }
    const selected = effective[0]!;
    return {
      ...base,
      decision: "AUTHORISED",
      authorised: true,
      rmaId: selected.id,
      rmaVersion: selected.version,
      source: selected.source,
    };
  }
  audit(): unknown[] {
    return this.repository.audit();
  }
  private require(id: string): RmaRecord {
    const record = this.repository.find(id);
    if (!record) {
      throw new NotFoundException("RMA not found");
    }
    return record;
  }
  private validate(c: RmaCommand): void {
    if (!BIC.test(c.ownBic) || !BIC.test(c.counterpartyBic)) {
      throw new BadRequestException("INVALID_BIC");
    }
    if (
      !["FIN", "FINPLUS"].includes(c.service) ||
      !["INBOUND", "OUTBOUND"].includes(c.direction)
    ) {
      throw new BadRequestException("INVALID_RMA_SCOPE");
    }
    if (
      !c.messageTypes?.length ||
      c.messageTypes.some((m) => !MESSAGE.test(m))
    ) {
      throw new BadRequestException("INVALID_MESSAGE_TYPES");
    }
    if (
      !c.maker ||
      Number.isNaN(Date.parse(c.validFrom)) ||
      Number.isNaN(Date.parse(c.validTo)) ||
      new Date(c.validFrom) >= new Date(c.validTo)
    ) {
      throw new BadRequestException("INVALID_RMA_DATES");
    }
  }
  private supersede(current: RmaRecord, actor: string): void {
    for (const previous of this.repository
      .list()
      .filter(
        (r) =>
          r.id !== current.id &&
          r.status === "ACTIVE" &&
          r.ownBic === current.ownBic &&
          r.counterpartyBic === current.counterpartyBic &&
          r.service === current.service &&
          r.direction === current.direction &&
          r.messageTypes.some((m) => current.messageTypes.includes(m)),
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
        "RMA",
      );
    }
  }
}
