"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentMessageIndexService = void 0;
exports.validatePaymentMessageIndex = validatePaymentMessageIndex;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const MODES = new Set([
    "SINGLE",
    "SPLIT",
    "NOTIFICATION",
]);
const COMPATIBILITY_STATUSES = new Set([
    "SUPPORTED_SINGLE",
    "SUPPORTED_SPLIT",
    "NOT_SUPPORTED",
]);
function stringArray(value, code) {
    if (!Array.isArray(value) ||
        value.some((entry) => typeof entry !== "string" || !entry.trim()))
        throw new Error(code);
    return value;
}
function positiveIntegerArray(value) {
    if (!Array.isArray(value) ||
        value.length === 0 ||
        value.some((entry) => !Number.isInteger(entry) || Number(entry) < 1))
        throw new Error("PAYMENT_INDEX_MRG_PAGES_REQUIRED");
    return value.map(Number);
}
function paymentIndexRow(raw) {
    if (!raw || typeof raw !== "object")
        throw new Error("INVALID_PAYMENT_INDEX_ITEM");
    return raw;
}
function uniqueMessageType(row, seen) {
    const messageType = String(row["messageType"] ?? "");
    if (!/^MT2\d{2}(?:COV)?$/.test(messageType))
        throw new Error("PAYMENT_INDEX_MT2XX_ONLY");
    if (seen.has(messageType))
        throw new Error("DUPLICATE_PAYMENT_MESSAGE_TYPE");
    seen.add(messageType);
    return messageType;
}
function requiredItemText(row, field) {
    const value = String(row[field] ?? "");
    if (!value.trim())
        throw new Error(`PAYMENT_INDEX_${field.toUpperCase()}_REQUIRED`);
    return value;
}
function paymentMtCompatibility(row) {
    const rawCompatibility = row["mtCompatibility"];
    if (!rawCompatibility || typeof rawCompatibility !== "object")
        throw new Error("PAYMENT_INDEX_MT_COMPATIBILITY_REQUIRED");
    const compatibility = rawCompatibility;
    const status = compatibility["status"];
    if (!COMPATIBILITY_STATUSES.has(status))
        throw new Error("INVALID_PAYMENT_MT_COMPATIBILITY_STATUS");
    return {
        status,
        ssiFields: stringArray(compatibility["ssiFields"], "INVALID_PAYMENT_SSI_FIELDS"),
        mandatorySsiFields: stringArray(compatibility["mandatorySsiFields"], "INVALID_PAYMENT_MANDATORY_SSI_FIELDS"),
        requiredUpstreamFields: stringArray(compatibility["requiredUpstreamFields"], "INVALID_PAYMENT_REQUIRED_UPSTREAM_FIELDS"),
        mrgPages: positiveIntegerArray(compatibility["mrgPages"]),
    };
}
function paymentIndexItem(raw, seen) {
    const row = paymentIndexRow(raw);
    const messageType = uniqueMessageType(row, seen);
    const processingMode = row["processingMode"];
    if (!MODES.has(processingMode))
        throw new Error("INVALID_PAYMENT_PROCESSING_MODE");
    const order = Number(row["order"]);
    if (!Number.isInteger(order) || order < 1)
        throw new Error("INVALID_PAYMENT_INDEX_ORDER");
    return {
        order,
        messageType,
        description: requiredItemText(row, "description"),
        processingMode,
        profileStatus: requiredItemText(row, "profileStatus"),
        targetMessage: requiredItemText(row, "targetMessage"),
        businessService: requiredItemText(row, "businessService"),
        selectable: row["selectable"] === true,
        mtCompatibility: paymentMtCompatibility(row),
    };
}
function validatePaymentMessageIndex(value) {
    if (!value || typeof value !== "object")
        throw new Error("INVALID_PAYMENT_MESSAGE_INDEX");
    const candidate = value;
    if (candidate["standardsRelease"] !== "SR2026")
        throw new Error("UNSUPPORTED_PAYMENT_INDEX_RELEASE");
    const maxBatchItems = candidate["maxBatchItems"];
    if (!Number.isInteger(maxBatchItems) || Number(maxBatchItems) < 1)
        throw new Error("INVALID_MAX_BATCH_ITEMS");
    if (!Array.isArray(candidate["items"]))
        throw new Error("PAYMENT_INDEX_ITEMS_REQUIRED");
    const seen = new Set();
    const items = candidate["items"]
        .map((raw) => paymentIndexItem(raw, seen))
        .sort((left, right) => left.order - right.order);
    return {
        standardsRelease: "SR2026",
        maxBatchItems: Number(maxBatchItems),
        items,
    };
}
let PaymentMessageIndexService = class PaymentMessageIndexService {
    index;
    constructor() {
        try {
            const path = (0, node_path_1.resolve)(process.cwd(), "parameters", "payment-message-index.json");
            this.index = validatePaymentMessageIndex(JSON.parse((0, node_fs_1.readFileSync)(path, "utf8")));
        }
        catch (error) {
            throw new common_1.InternalServerErrorException({
                code: "PAYMENT_MESSAGE_INDEX_INVALID",
                cause: error instanceof Error ? error.message : "UNKNOWN",
            });
        }
    }
    getIndex() {
        return this.index;
    }
    findSelectable(messageType) {
        return this.index.items.find((item) => item.messageType === messageType && item.selectable);
    }
};
exports.PaymentMessageIndexService = PaymentMessageIndexService;
exports.PaymentMessageIndexService = PaymentMessageIndexService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], PaymentMessageIndexService);
//# sourceMappingURL=payment-message-index.service.js.map