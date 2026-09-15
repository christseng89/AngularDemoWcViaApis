"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMt2BankResolutionRequest = toMt2BankResolutionRequest;
const common_1 = require("@nestjs/common");
const bank_service_directory_1 = require("./bank-service-directory");
function rejectsClientCounterpartyType(request) {
    if (Object.prototype.hasOwnProperty.call(request, "counterpartyType"))
        throw new common_1.BadRequestException("MT2_COUNTERPARTY_TYPE_NOT_ACCEPTED");
}
function rejectsClientCounterpartyBic(request) {
    if (Object.prototype.hasOwnProperty.call(request, "counterpartyBic"))
        throw new common_1.BadRequestException("MT2_COUNTERPARTY_BIC_NOT_ACCEPTED");
}
function rejectsManualBankIdentity(request) {
    const manualBicFields = [
        "accountWithBic",
        "intermediaryBic",
        "receiverCorrespondentBic",
        "senderCorrespondentBic",
        "beneficiaryInstitutionBic",
    ];
    if (manualBicFields.some((field) => Object.prototype.hasOwnProperty.call(request, field)))
        throw new common_1.BadRequestException("MT2_MANUAL_BIC_NOT_ACCEPTED");
}
function toMt2BankResolutionRequest(request, messageIndex, sourceMessageTypeOverride, bankServices = new bank_service_directory_1.BankServiceDirectory()) {
    rejectsClientCounterpartyType(request);
    rejectsClientCounterpartyBic(request);
    rejectsManualBankIdentity(request);
    if (!request.currency?.trim())
        throw new common_1.BadRequestException("INVALID_ISO_4217_CURRENCY");
    const sourceMessageType = sourceMessageTypeOverride ?? request.sourceMessageType?.trim();
    if (!sourceMessageType)
        throw new common_1.BadRequestException("PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED");
    const profile = messageIndex.findSelectable(sourceMessageType);
    if (!profile)
        throw new common_1.BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED");
    if (request.messageType !== profile.targetMessage)
        throw new common_1.BadRequestException("PAYMENT_SOURCE_TARGET_MISMATCH");
    const bank = bankServices.resolve(request.counterpartyBankServiceId ??
        request.beneficiaryBankServiceId ??
        request.bankServiceId);
    return {
        ...request,
        sourceMessageType,
        businessService: profile.businessService,
        counterpartyBic: bank.bic,
        counterpartyCountry: request.counterpartyCountry || bank.country,
        counterpartyType: "BANK",
    };
}
//# sourceMappingURL=mt2-settlement-request.policy.js.map