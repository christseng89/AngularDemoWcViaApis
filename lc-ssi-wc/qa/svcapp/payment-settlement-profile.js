"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentFinMessageType = paymentFinMessageType;
exports.paymentSettlementProfile = paymentSettlementProfile;
const BANK_FIN_MESSAGES = new Set([
    "MT200",
    "MT201",
    "MT202",
    "MT202COV",
    "MT203",
    "MT205",
    "MT205COV",
]);
function paymentFinMessageType(counterpartyType, sourceMessageType) {
    if (counterpartyType === "CUSTOMER")
        return "MT103";
    if (sourceMessageType &&
        BANK_FIN_MESSAGES.has(sourceMessageType))
        return sourceMessageType;
    return "MT202";
}
const PROFILES = {
    BANK: {
        consumer: "CENTRAL_PAYMENT",
        product: "CENTRAL_PAYMENT",
        businessFunction: "INTERBANK_TRANSFER",
        paymentLeg: "INTERBANK_SETTLEMENT",
        mxMessageType: "pacs.009.001.08",
        mtMessageType: "MT202",
    },
    CUSTOMER: {
        consumer: "CENTRAL_PAYMENT",
        product: "CENTRAL_PAYMENT",
        businessFunction: "CUSTOMER_CREDIT_TRANSFER",
        paymentLeg: "CUSTOMER_TRANSFER",
        mxMessageType: "pacs.008.001.12",
        mtMessageType: "MT103",
    },
};
function paymentSettlementProfile(counterpartyType) {
    return PROFILES[counterpartyType];
}
//# sourceMappingURL=payment-settlement-profile.js.map