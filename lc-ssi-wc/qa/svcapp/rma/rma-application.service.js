"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmaApplicationService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const rma_repository_1 = require("./rma.repository");
const BIC = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const MESSAGE = /^(?:MT\d{3}(?:COV)?|pacs\.[A-Za-z0-9.]+|\*)$/;
const normalizeBic = (value) => {
    const bic = value.trim().toUpperCase();
    return bic.length === 8 ? `${bic}XXX` : bic;
};
const validIsoDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        return false;
    }
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day);
};
let RmaApplicationService = class RmaApplicationService {
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
    create(command) {
        this.validate(command);
        const now = new Date().toISOString();
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
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
    update(id, command) {
        const current = this.require(id);
        if (current.status !== "DRAFT") {
            throw new common_1.ConflictException("Only DRAFT RMA can be updated");
        }
        if (current.maker !== command.maker) {
            throw new common_1.ConflictException("Only original maker can update");
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
    revise(id, maker) {
        const current = this.require(id);
        if (!maker) {
            throw new common_1.BadRequestException("MAKER_REQUIRED");
        }
        if (["REVOKED", "SUPERSEDED"].includes(current.status)) {
            throw new common_1.ConflictException("RMA cannot be revised");
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
        this.repository.save(next, "REVISION_CREATED", maker, "RMA");
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
        this.repository.save(next, action, actor, "RMA");
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
        this.repository.save(next, "REVOKED", actor, "RMA");
        return next;
    }
    check(request) {
        const ownBic = normalizeBic(request.ownBic), counterpartyBic = normalizeBic(request.counterpartyBic);
        if (!BIC.test(ownBic) || !BIC.test(counterpartyBic)) {
            throw new common_1.BadRequestException("INVALID_BIC");
        }
        const effectiveAt = request.at ?? new Date().toISOString().slice(0, 10);
        if (!validIsoDate(effectiveAt)) {
            throw new common_1.BadRequestException("INVALID_RMA_CHECK_DATE");
        }
        const checkedAt = new Date().toISOString(), decisionId = (0, node_crypto_1.randomUUID)();
        const scoped = this.repository
            .list()
            .filter((record) => normalizeBic(record.ownBic) === ownBic &&
            normalizeBic(record.counterpartyBic) === counterpartyBic &&
            record.service === request.service &&
            record.direction === request.direction);
        const exact = scoped.filter((record) => record.messageTypes.includes(request.messageType));
        const candidates = exact.length
            ? exact
            : scoped.filter((record) => record.messageTypes.includes("*"));
        const effectiveTime = Date.parse(effectiveAt);
        const effective = candidates.filter((record) => record.status === "ACTIVE" &&
            Date.parse(record.validFrom) <= effectiveTime &&
            effectiveTime <= Date.parse(record.validTo));
        const base = { decisionId, authorised: false, checkedAt, effectiveAt };
        if (effective.length !== 1) {
            let decision = "NOT_FOUND";
            if (effective.length > 1) {
                decision = "AMBIGUOUS";
            }
            else if (candidates.length) {
                decision = "NOT_AUTHORISED";
            }
            return {
                ...base,
                decision,
            };
        }
        const selected = effective[0];
        return {
            ...base,
            decision: "AUTHORISED",
            authorised: true,
            rmaId: selected.id,
            rmaVersion: selected.version,
            source: selected.source,
        };
    }
    audit() {
        return this.repository.audit();
    }
    require(id) {
        const record = this.repository.find(id);
        if (!record) {
            throw new common_1.NotFoundException("RMA not found");
        }
        return record;
    }
    validate(c) {
        if (!BIC.test(c.ownBic) || !BIC.test(c.counterpartyBic)) {
            throw new common_1.BadRequestException("INVALID_BIC");
        }
        if (!["FIN", "FINPLUS"].includes(c.service) ||
            !["INBOUND", "OUTBOUND"].includes(c.direction)) {
            throw new common_1.BadRequestException("INVALID_RMA_SCOPE");
        }
        if (!c.messageTypes?.length ||
            c.messageTypes.some((m) => !MESSAGE.test(m))) {
            throw new common_1.BadRequestException("INVALID_MESSAGE_TYPES");
        }
        if (!c.maker ||
            Number.isNaN(Date.parse(c.validFrom)) ||
            Number.isNaN(Date.parse(c.validTo)) ||
            new Date(c.validFrom) >= new Date(c.validTo)) {
            throw new common_1.BadRequestException("INVALID_RMA_DATES");
        }
    }
    supersede(current, actor) {
        for (const previous of this.repository
            .list()
            .filter((r) => r.id !== current.id &&
            r.status === "ACTIVE" &&
            r.ownBic === current.ownBic &&
            r.counterpartyBic === current.counterpartyBic &&
            r.service === current.service &&
            r.direction === current.direction &&
            r.messageTypes.some((m) => current.messageTypes.includes(m)))) {
            this.repository.save({
                ...previous,
                status: "SUPERSEDED",
                version: previous.version + 1,
                updatedAt: new Date().toISOString(),
            }, "SUPERSEDED", actor, "RMA");
        }
    }
};
exports.RmaApplicationService = RmaApplicationService;
exports.RmaApplicationService = RmaApplicationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [rma_repository_1.RmaRepository])
], RmaApplicationService);
//# sourceMappingURL=rma-application.service.js.map