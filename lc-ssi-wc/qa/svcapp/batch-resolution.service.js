"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchResolutionService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const ssi_application_service_1 = require("./ssi-application.service");
const payment_message_index_service_1 = require("./payment-message-index.service");
const mt2_settlement_request_policy_1 = require("./mt2-settlement-request.policy");
function errorCode(error) {
    if (error instanceof common_1.HttpException) {
        const response = error.getResponse();
        if (typeof response === "string")
            return response;
        const payload = response;
        const message = payload["message"];
        if (Array.isArray(message))
            return String(message[0] ?? "RESOLUTION_FAILED");
        if (message)
            return String(message);
        if (payload["code"])
            return String(payload["code"]);
        return "RESOLUTION_FAILED";
    }
    return error instanceof Error && error.message
        ? error.message
        : "RESOLUTION_FAILED";
}
function batchStatus(successCount, failureCount) {
    if (failureCount === 0)
        return "SUCCESS";
    if (successCount === 0)
        return "FAILED";
    return "PARTIAL_SUCCESS";
}
let BatchResolutionService = class BatchResolutionService {
    singleResolution;
    messageIndex;
    constructor(singleResolution, messageIndex) {
        this.singleResolution = singleResolution;
        this.messageIndex = messageIndex;
    }
    resolve(request) {
        this.validate(request);
        const outcomes = request.items.map((item, position) => this.resolveItem(item, position, request.sourceMessageType));
        return this.summary(request, outcomes);
    }
    validate(request) {
        if (!request.batchReference?.trim())
            throw new common_1.BadRequestException("BATCH_REFERENCE_REQUIRED");
        const index = this.messageIndex.getIndex();
        const profile = index.items.find((item) => item.messageType === request.sourceMessageType);
        if (!profile?.selectable)
            throw new common_1.BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED");
        if (profile?.processingMode !== "SPLIT")
            throw new common_1.BadRequestException("SPLIT_PROCESSING_MESSAGE_TYPE_REQUIRED");
        if (!Array.isArray(request.items) || request.items.length === 0)
            throw new common_1.BadRequestException("BATCH_ITEMS_REQUIRED");
        if (request.items.length > index.maxBatchItems)
            throw new common_1.BadRequestException("BATCH_SIZE_LIMIT_EXCEEDED");
        const ids = request.items.map((item) => item.itemId);
        if (ids.some((id) => !id?.trim()))
            throw new common_1.BadRequestException("BATCH_ITEM_ID_REQUIRED");
        if (new Set(ids).size !== ids.length)
            throw new common_1.BadRequestException("DUPLICATE_BATCH_ITEM_ID");
        return index;
    }
    resolveItem(item, position, sourceMessageType) {
        const { itemId, ...itemRequest } = item;
        try {
            const result = this.singleResolution.resolve((0, mt2_settlement_request_policy_1.toMt2BankResolutionRequest)(itemRequest, this.messageIndex, sourceMessageType));
            return result.recommendedRoute
                ? { position: position + 1, itemId, transactionReference: item.transactionReference, status: "SUCCESS", result }
                : { position: position + 1, itemId, transactionReference: item.transactionReference, status: "ERROR", errorCode: result.decision ?? "NO_ELIGIBLE_ROUTE", message: result.explanation ?? "No eligible SSI route" };
        }
        catch (error) {
            const code = errorCode(error);
            return { position: position + 1, itemId, transactionReference: item.transactionReference, status: "ERROR", errorCode: code, message: code };
        }
    }
    summary(request, outcomes) {
        const successfulItems = outcomes.filter((item) => item.status === "SUCCESS");
        const failedItems = outcomes.filter((item) => item.status === "ERROR");
        const status = batchStatus(successfulItems.length, failedItems.length);
        return {
            batchReference: request.batchReference,
            sourceMessageType: request.sourceMessageType,
            status,
            totalItems: outcomes.length,
            successCount: successfulItems.length,
            errorCount: failedItems.length,
            outcomes,
            successfulItems,
            failedItems,
        };
    }
};
exports.BatchResolutionService = BatchResolutionService;
exports.BatchResolutionService = BatchResolutionService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [ssi_application_service_1.SsiApplicationService,
        payment_message_index_service_1.PaymentMessageIndexService])
], BatchResolutionService);
//# sourceMappingURL=batch-resolution.service.js.map