"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertFin5xSupportContract = assertFin5xSupportContract;
const LEGAL_REASONS = {
    "OUT_OF_SSI_SCOPE|N_A": [
        "TRADE_ROUTING_ROLE",
        "TRANSACTION_CONTEXT_PROVIDED",
        "CONFIRMATION_PARTY",
        "MESSAGE_PROFILE_EXCLUDED",
    ],
    "SSI_SUPPORTED|NOT_REQUIRED": [
        "ROUTE_COMPLETE",
        "DIRECT_ACCOUNT_RELATIONSHIP",
    ],
    "SSI_SUPPORTED|NO_ELIGIBLE_SSI": [
        "MISSING_SSI",
        "EXPIRED_SSI",
        "CONFLICTING_SSI",
        "INACTIVE_SSI",
        "NO_MATCHING_BOOKING_ENTITY",
    ],
    "SSI_SUPPORTED|RESOLVED": [
        "EXACT_ELIGIBLE_SSI",
        "RESOLVED_FROM_OWN_SSI",
        "RESOLVED_FROM_COUNTERPARTY_SSI",
    ],
};
function assertFin5xSupportContract(value) {
    const legalReasons = LEGAL_REASONS[`${value.scopeStatus}|${value.resolutionStatus}`];
    const hasValue = !!value.suggestedValue?.trim();
    if (!legalReasons?.includes(value.reasonCode) ||
        (value.resolutionStatus === "RESOLVED") !== hasValue)
        throw new Error("INVALID_FIN_5X_SUPPORT_STATE");
    return value;
}
//# sourceMappingURL=fin-5x-support-contract.js.map