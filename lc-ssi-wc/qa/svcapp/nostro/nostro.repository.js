"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostroRepository = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const sqlite_governed_repository_1 = require("../shared/sqlite-governed.repository");
let NostroRepository = class NostroRepository extends sqlite_governed_repository_1.SqliteGovernedRepository {
    constructor() { super('nostro_account', 'nostro_audit_event'); }
};
exports.NostroRepository = NostroRepository;
exports.NostroRepository = NostroRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], NostroRepository);
//# sourceMappingURL=nostro.repository.js.map