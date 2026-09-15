"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityRepository = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const sqlite_governed_repository_1 = require("../shared/sqlite-governed.repository");
let EntityRepository = class EntityRepository extends sqlite_governed_repository_1.SqliteGovernedRepository {
    constructor() { super('booking_branch_entity', 'booking_branch_entity_audit'); }
};
exports.EntityRepository = EntityRepository;
exports.EntityRepository = EntityRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], EntityRepository);
//# sourceMappingURL=entity.repository.js.map