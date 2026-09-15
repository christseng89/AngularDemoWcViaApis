import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { NostroRepository, type NostroRecord } from "./nostro.repository";
export interface NostroCommand {
  ownLegalEntityId: string;
  allowedBookingEntities?: string[];
  accountServicerBic: string;
  currency: string;
  maskedAccountRef: string;
  accountReference?: string;
  purpose: string;
  priority: number;
  validFrom: string;
  validTo: string;
  maker: string;
  source?: "SYNTHETIC_DEMO" | "LICENSED_IMPORT";
}
export interface PinnedNostroRequest {
  readonly nostroId: string;
  readonly version: number;
  readonly bookingEntity: string;
  readonly at?: string;
}
export type PinnedNostroResult =
  | { readonly decision: "RESOLVED"; readonly record: NostroRecord }
  | { readonly decision: "REJECTED"; readonly reasonCode: string };
const BIC = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const CCY = /^[A-Z]{3}$/;
@Injectable()
export class NostroApplicationService {
  constructor(private readonly repository: NostroRepository) {}
  list(): NostroRecord[] {
    return this.repository.list();
  }
  validateCommand(command: NostroCommand): void {
    this.validate(command);
  }
  create(c: NostroCommand): NostroRecord {
    this.validate(c);
    const now = new Date().toISOString();
    const record: NostroRecord = {
      id: randomUUID(),
      ...c,
      source: c.source ?? "SYNTHETIC_DEMO",
      status: "DRAFT",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.repository.save(record, "CREATED", c.maker, "NOSTRO");
    return record;
  }
  update(id: string, c: NostroCommand): NostroRecord {
    const current = this.require(id);
    if (current.status !== "DRAFT" || current.maker !== c.maker) {
      throw new ConflictException("Only original maker can update DRAFT");
    }
    this.validate(c);
    const next = {
      ...current,
      ...c,
      source: c.source ?? current.source,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.repository.save(next, "UPDATED", c.maker, "NOSTRO");
    return next;
  }
  revise(id: string, maker: string): NostroRecord {
    const current = this.require(id);
    if (!maker || ["REVOKED", "SUPERSEDED"].includes(current.status)) {
      throw new ConflictException("Nostro cannot be revised");
    }
    const now = new Date().toISOString();
    const next: NostroRecord = {
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
    this.repository.save(next, "REVISION_CREATED", maker, "NOSTRO");
    return next;
  }
  transition(
    id: string,
    action: "SUBMIT" | "APPROVE" | "ACTIVATE",
    actor: string,
  ): NostroRecord {
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
    const next: NostroRecord = {
      ...current,
      status,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    if (action === "APPROVE") {
      next.checker = actor;
    }
    this.repository.save(next, action, actor, "NOSTRO");
    return next;
  }
  revoke(id: string, actor: string, reason: string): NostroRecord {
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
    this.repository.save(next, "REVOKED", actor, "NOSTRO");
    return next;
  }
  resolve(q: {
    ownLegalEntityId?: string;
    accountReference?: string;
    accountServicerBic: string;
    currency: string;
    purpose: string;
    at?: string;
    fixtureFamily?: string;
    usageGroup?: string;
    fixtureBindingId?: string;
  }): unknown {
    const at = new Date(q.at ?? Date.now()).toISOString().slice(0, 10);
    const candidates = this.repository.findEligible({ ...q, at });
    if (!candidates.length) {
      const baseQuery = { ...q, at };
      delete baseQuery.ownLegalEntityId;
      const base = q.ownLegalEntityId
        ? this.repository.findEligible(baseQuery)
        : [];
      return {
        decision: base.length ? "ENTITY_NOT_AUTHORIZED" : "NOT_FOUND",
        reasonCode: base.length ? "ENTITY_NOT_AUTHORIZED" : "NOSTRO_NOT_FOUND",
      };
    }
    if (
      candidates.length > 1 &&
      candidates[0]!.priority === candidates[1]!.priority
    ) {
      return { decision: "AMBIGUOUS" };
    }
    const selected = candidates[0]!;
    return {
      decision: "RESOLVED",
      nostroId: selected.id,
      nostroVersion: selected.version,
      accountReference: selected.accountReference,
      ownLegalEntityId: selected.ownLegalEntityId,
      allowedBookingEntities: selected.allowedBookingEntities ?? [],
      maskedAccountRef: selected.maskedAccountRef,
      accountServicerBic: selected.accountServicerBic,
      currency: selected.currency,
      purpose: selected.purpose,
      validFrom: selected.validFrom,
      validTo: selected.validTo,
    };
  }
  resolvePinned(q: PinnedNostroRequest): PinnedNostroResult {
    const record = this.repository.find(q.nostroId);
    if (!record)
      return { decision: "REJECTED", reasonCode: "OWN_ACCOUNT_NOT_FOUND" };
    if (record.version !== q.version)
      return {
        decision: "REJECTED",
        reasonCode: "OWN_ACCOUNT_VERSION_MISMATCH",
      };
    if (record.status !== "ACTIVE")
      return { decision: "REJECTED", reasonCode: "OWN_ACCOUNT_NOT_ACTIVE" };
    const at = new Date(q.at ?? Date.now());
    if (
      Number.isNaN(at.valueOf()) ||
      at < new Date(record.validFrom) ||
      at > new Date(record.validTo)
    )
      return {
        decision: "REJECTED",
        reasonCode: "OWN_ACCOUNT_NOT_EFFECTIVE",
      };
    const allowed = record.allowedBookingEntities ?? [];
    if (
      record.ownLegalEntityId !== q.bookingEntity ||
      (allowed.length > 0 &&
        !allowed.includes("ANY") &&
        !allowed.includes(q.bookingEntity))
    )
      return {
        decision: "REJECTED",
        reasonCode: "OWN_ACCOUNT_BOOKING_ENTITY_MISMATCH",
      };
    return { decision: "RESOLVED", record };
  }
  audit(): unknown[] {
    return this.repository.audit();
  }
  private require(id: string): NostroRecord {
    const record = this.repository.find(id);
    if (!record) {
      throw new NotFoundException("Nostro not found");
    }
    return record;
  }
  private validate(c: NostroCommand): void {
    if (!c.ownLegalEntityId || !c.maker || !c.purpose) {
      throw new BadRequestException("NOSTRO_REQUIRED_FIELDS");
    }
    if (!BIC.test(c.accountServicerBic) || !CCY.test(c.currency)) {
      throw new BadRequestException("INVALID_BANK_OR_CURRENCY");
    }
    if (!c.maskedAccountRef.startsWith("DEMO-")) {
      throw new BadRequestException("DEMO_MASKED_ACCOUNT_REQUIRED");
    }
    if (!Number.isInteger(c.priority) || c.priority < 1 || c.priority > 999) {
      throw new BadRequestException("INVALID_PRIORITY");
    }
    if (
      Number.isNaN(Date.parse(c.validFrom)) ||
      Number.isNaN(Date.parse(c.validTo)) ||
      new Date(c.validFrom) >= new Date(c.validTo)
    ) {
      throw new BadRequestException("INVALID_DATES");
    }
  }
  private supersede(current: NostroRecord, actor: string): void {
    for (const previous of this.repository
      .list()
      .filter(
        (n) =>
          n.id !== current.id &&
          n.status === "ACTIVE" &&
          n.ownLegalEntityId === current.ownLegalEntityId &&
          n.accountServicerBic === current.accountServicerBic &&
          n.currency === current.currency &&
          n.purpose === current.purpose &&
          n.maskedAccountRef === current.maskedAccountRef,
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
        "NOSTRO",
      );
    }
  }
}
