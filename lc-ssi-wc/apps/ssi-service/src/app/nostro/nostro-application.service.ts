import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { NostroRepository, type NostroRecord } from "./nostro.repository";
import {
  approveGovernedSuppression,
  buildGovernedRevocation,
  buildGovernedTransitionRecord,
  type GovernedTransitionAction,
  validateGovernedTransition,
} from "../shared/governed-transition";
import { revisionWipExpiresAt } from "../shared/sqlite-governed.repository";
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
const MASKED_ACCOUNT_REF = /^(?:DEMO|MT\d{1,3})-[A-Z0-9-]{4,60}$/;
@Injectable()
export class NostroApplicationService {
  constructor(private readonly repository: NostroRepository) {}
  list(status?: string): NostroRecord[] {
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
      source: c.source ?? current.source,
      status: "DRAFT",
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    delete next.revisionWipExpiresAt;
    this.repository.save(next, "UPDATED", c.maker, "NOSTRO");
    return next;
  }
  revise(id: string, maker: string): NostroRecord {
    const current = this.require(id);
    if (!maker || ["REVOKED", "SUPERSEDED"].includes(current.status)) {
      throw new ConflictException("Nostro cannot be revised");
    }
    if (!["ACTIVE", "APPROVED"].includes(current.status)) {
      throw new ConflictException("INVALID_REVISION_STATUS");
    }
    if (this.repository.hasOpenRevision?.(current.id)) {
      throw new ConflictException("OPEN_REVISION_EXISTS");
    }
    const now = new Date().toISOString();
    const next: NostroRecord = {
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
      this.repository.saveRevisionWorkInProgress?.(next, maker, "NOSTRO") ??
      (this.repository.save(next, "WIP_RESERVED", maker, "NOSTRO"), true);
    if (!reserved) throw new ConflictException("REVISION_NOT_AVAILABLE");
    return next;
  }
  suppress(id: string, maker: string, reason: string): NostroRecord {
    const current = this.require(id);
    if (!maker) throw new BadRequestException("MAKER_REQUIRED");
    if ((reason?.trim().length ?? 0) < 5)
      throw new BadRequestException("SUPPRESSION_REASON_REQUIRED");
    if (current.status !== "ACTIVE")
      throw new ConflictException("ONLY_ACTIVE_CAN_BE_SUPPRESSED");
    if (this.repository.hasOpenRevision?.(current.id))
      throw new ConflictException("OPEN_REVISION_EXISTS");
    const now = new Date().toISOString();
    const next: NostroRecord = {
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
        "NOSTRO",
        "SUPPRESSION_DRAFT_CREATED",
      ) ??
      (this.repository.save(next, "SUPPRESSION_DRAFT_CREATED", maker, "NOSTRO"),
      true);
    if (!reserved) throw new ConflictException("SUPPRESSION_NOT_AVAILABLE");
    return next;
  }
  transition(
    id: string,
    action: GovernedTransitionAction,
    actor: string,
    reason = "",
  ): NostroRecord {
    const current = this.require(id);
    validateGovernedTransition(current, action, actor, reason);
    const suppressed = approveGovernedSuppression(
      current,
      action,
      actor,
      "NOSTRO",
      this.repository.approveSuppression?.bind(this.repository),
    );
    if (suppressed) return suppressed;
    if (action === "APPROVE" || action === "ACTIVATE")
      this.supersede(current, actor);
    const next = buildGovernedTransitionRecord(current, action, actor, reason);
    this.repository.save(next, action, actor, "NOSTRO");
    return next;
  }
  revoke(id: string, actor: string, reason: string): NostroRecord {
    const current = this.require(id);
    const next = buildGovernedRevocation(current, actor, reason);
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
      priority: selected.priority,
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
    if (!MASKED_ACCOUNT_REF.test(c.maskedAccountRef)) {
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
