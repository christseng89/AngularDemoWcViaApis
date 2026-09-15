"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostroApplicationService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const nostro_repository_1 = require("./nostro.repository");
const BIC = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const CCY = /^[A-Z]{3}$/;
let NostroApplicationService = class NostroApplicationService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    list() {
        return this.repository.list();
    }
    validateCommand(command) {
        this.validate(command);
    }
    create(c) {
        this.validate(c);
        const now = new Date().toISOString();
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
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
    update(id, c) {
        const current = this.require(id);
        if (current.status !== "DRAFT" || current.maker !== c.maker) {
            throw new common_1.ConflictException("Only original maker can update DRAFT");
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
    revise(id, maker) {
        const current = this.require(id);
        if (!maker || ["REVOKED", "SUPERSEDED"].includes(current.status)) {
            throw new common_1.ConflictException("Nostro cannot be revised");
        }
        const now = new Date().toISOString();
        const next = {
            ...current,
            id: (0, node_crypto_1.randomUUID)(),
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
    transition(id, action, actor) {
        const current = this.require(id);
        const expected = {
            SUBMIT: "DRAFT",
            APPROVE: "PENDING_APPROVAL",
            ACTIVATE: "APPROVED",
        }[action];
        if (current.status !== expected) {
            throw new common_1.ConflictException(`Expected ${expected}`);
        }
        if (action === "SUBMIT" && actor !== current.maker) {
            throw new common_1.ConflictException("Only maker can submit");
        }
        if (action === "APPROVE" && actor === current.maker) {
            throw new common_1.ConflictException("Maker cannot approve");
        }
        const status = {
            SUBMIT: "PENDING_APPROVAL",
            APPROVE: "APPROVED",
            ACTIVATE: "ACTIVE",
        }[action];
        if (action === "ACTIVATE") {
            this.supersede(current, actor);
        }
        const next = {
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
    revoke(id, actor, reason) {
        const current = this.require(id);
        if (!actor || reason?.trim().length < 5) {
            throw new common_1.BadRequestException("ACTOR_AND_REASON_REQUIRED");
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
    resolve(q) {
        const at = new Date(q.at ?? Date.now());
        const base = this.repository
            .list()
            .filter((n) => n.status === "ACTIVE" &&
            (!q.accountReference || n.accountReference === q.accountReference) &&
            n.accountServicerBic === q.accountServicerBic &&
            n.currency === q.currency &&
            n.purpose === q.purpose &&
            new Date(n.validFrom) <= at &&
            at <= new Date(n.validTo));
        const candidates = base
            .filter((n) => !q.ownLegalEntityId ||
            !n.allowedBookingEntities?.length ||
            n.allowedBookingEntities.includes("ANY") ||
            n.allowedBookingEntities.includes(q.ownLegalEntityId))
            .sort((a, b) => a.priority - b.priority);
        if (!candidates.length) {
            return {
                decision: base.length ? "ENTITY_NOT_AUTHORIZED" : "NOT_FOUND",
                reasonCode: base.length ? "ENTITY_NOT_AUTHORIZED" : "NOSTRO_NOT_FOUND",
            };
        }
        if (candidates.length > 1 &&
            candidates[0].priority === candidates[1].priority) {
            return { decision: "AMBIGUOUS" };
        }
        const selected = candidates[0];
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
    resolvePinned(q) {
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
        if (Number.isNaN(at.valueOf()) ||
            at < new Date(record.validFrom) ||
            at > new Date(record.validTo))
            return {
                decision: "REJECTED",
                reasonCode: "OWN_ACCOUNT_NOT_EFFECTIVE",
            };
        const allowed = record.allowedBookingEntities ?? [];
        if (record.ownLegalEntityId !== q.bookingEntity ||
            (allowed.length > 0 &&
                !allowed.includes("ANY") &&
                !allowed.includes(q.bookingEntity)))
            return {
                decision: "REJECTED",
                reasonCode: "OWN_ACCOUNT_BOOKING_ENTITY_MISMATCH",
            };
        return { decision: "RESOLVED", record };
    }
    audit() {
        return this.repository.audit();
    }
    require(id) {
        const record = this.repository.find(id);
        if (!record) {
            throw new common_1.NotFoundException("Nostro not found");
        }
        return record;
    }
    validate(c) {
        if (!c.ownLegalEntityId || !c.maker || !c.purpose) {
            throw new common_1.BadRequestException("NOSTRO_REQUIRED_FIELDS");
        }
        if (!BIC.test(c.accountServicerBic) || !CCY.test(c.currency)) {
            throw new common_1.BadRequestException("INVALID_BANK_OR_CURRENCY");
        }
        if (!c.maskedAccountRef.startsWith("DEMO-")) {
            throw new common_1.BadRequestException("DEMO_MASKED_ACCOUNT_REQUIRED");
        }
        if (!Number.isInteger(c.priority) || c.priority < 1 || c.priority > 999) {
            throw new common_1.BadRequestException("INVALID_PRIORITY");
        }
        if (Number.isNaN(Date.parse(c.validFrom)) ||
            Number.isNaN(Date.parse(c.validTo)) ||
            new Date(c.validFrom) >= new Date(c.validTo)) {
            throw new common_1.BadRequestException("INVALID_DATES");
        }
    }
    supersede(current, actor) {
        for (const previous of this.repository
            .list()
            .filter((n) => n.id !== current.id &&
            n.status === "ACTIVE" &&
            n.ownLegalEntityId === current.ownLegalEntityId &&
            n.accountServicerBic === current.accountServicerBic &&
            n.currency === current.currency &&
            n.purpose === current.purpose &&
            n.maskedAccountRef === current.maskedAccountRef)) {
            this.repository.save({
                ...previous,
                status: "SUPERSEDED",
                version: previous.version + 1,
                updatedAt: new Date().toISOString(),
            }, "SUPERSEDED", actor, "NOSTRO");
        }
    }
};
exports.NostroApplicationService = NostroApplicationService;
exports.NostroApplicationService = NostroApplicationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [nostro_repository_1.NostroRepository])
], NostroApplicationService);
//# sourceMappingURL=nostro-application.service.js.map