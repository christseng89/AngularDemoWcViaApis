"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityApplicationService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const entity_repository_1 = require("./entity.repository");
let EntityApplicationService = class EntityApplicationService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    list() {
        return this.repository.list();
    }
    create(c) {
        this.validate(c);
        const now = new Date().toISOString();
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
            ...c,
            status: "DRAFT",
            version: 1,
            createdAt: now,
            updatedAt: now,
        };
        this.repository.save(record, "CREATED", c.maker, "ENTITY");
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
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
        };
        this.repository.save(next, "UPDATED", c.maker, "ENTITY");
        return next;
    }
    revise(id, maker) {
        const current = this.require(id);
        if (!maker || ["REVOKED", "SUPERSEDED"].includes(current.status)) {
            throw new common_1.ConflictException("Entity cannot be revised");
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
        this.repository.save(next, "REVISION_CREATED", maker, "ENTITY");
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
        if (action === "ACTIVATE") {
            for (const previous of this.repository
                .list()
                .filter((item) => item.id !== id &&
                item.status === "ACTIVE" &&
                item.branchCode === current.branchCode)) {
                this.repository.save({
                    ...previous,
                    status: "SUPERSEDED",
                    version: previous.version + 1,
                    updatedAt: new Date().toISOString(),
                }, "SUPERSEDED", actor, "ENTITY");
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
        this.repository.save(next, "REVOKED", actor, "ENTITY");
        return next;
    }
    audit() {
        return this.repository.audit();
    }
    require(id) {
        const value = this.repository.find(id);
        if (!value) {
            throw new common_1.NotFoundException("Entity not found");
        }
        return value;
    }
    validate(c) {
        if (!/^[A-Z]{2}[0-9]{2}$/.test(c.branchCode) ||
            !c.branchName ||
            !c.legalEntityCode ||
            !c.legalEntityName ||
            !/^[A-Z]{2}$/.test(c.countryCode) ||
            !c.maker) {
            throw new common_1.BadRequestException("ENTITY_FIELDS_INVALID");
        }
        if (Date.parse(c.validFrom) >= Date.parse(c.validTo)) {
            throw new common_1.BadRequestException("INVALID_DATES");
        }
    }
};
exports.EntityApplicationService = EntityApplicationService;
exports.EntityApplicationService = EntityApplicationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [entity_repository_1.EntityRepository])
], EntityApplicationService);
//# sourceMappingURL=entity-application.service.js.map