"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmaRepository = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const sqlite_governed_repository_1 = require("../shared/sqlite-governed.repository");
let RmaRepository = class RmaRepository extends sqlite_governed_repository_1.SqliteGovernedRepository {
    constructor() { super('rma_authorisation', 'rma_audit_event'); }
};
exports.RmaRepository = RmaRepository;
exports.RmaRepository = RmaRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], RmaRepository);
//# sourceMappingURL=rma.repository.js.map