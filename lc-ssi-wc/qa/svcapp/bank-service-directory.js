"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankServiceDirectory = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const src_1 = require("../../../../libs/parameter-engine/src");
const BANK_SERVICES = (0, src_1.activeBankServices)((0, src_1.loadBankServiceCatalogue)());
let BankServiceDirectory = class BankServiceDirectory {
    resolve(bankServiceId) {
        if (!bankServiceId?.trim())
            throw new common_1.BadRequestException("BANK_SERVICE_ID_REQUIRED");
        const record = BANK_SERVICES.find((candidate) => candidate.bankServiceId === bankServiceId.trim());
        if (!record)
            throw new common_1.BadRequestException("BANK_SERVICE_NOT_FOUND");
        return record;
    }
};
exports.BankServiceDirectory = BankServiceDirectory;
exports.BankServiceDirectory = BankServiceDirectory = tslib_1.__decorate([
    (0, common_1.Injectable)()
], BankServiceDirectory);
//# sourceMappingURL=bank-service-directory.js.map