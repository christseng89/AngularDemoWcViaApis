import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import type { RouteResolutionRequest } from "./route-resolution.policy";
import { SsiApplicationService } from "./ssi-application.service";
import { PaymentMessageIndexService } from "./payment-message-index.service";
import { toMt2BankResolutionRequest } from "./mt2-settlement-request.policy";
import { scalarText } from "./scalar-text";

export interface BatchResolutionItem extends Omit<
  RouteResolutionRequest,
  "counterpartyType" | "sourceMessageType"
> {
  readonly itemId: string;
}

export interface BatchResolutionRequest {
  readonly batchReference: string;
  readonly sourceMessageType: "MT201" | "MT203";
  readonly items: readonly BatchResolutionItem[];
}

interface SuccessfulBatchOutcome {
  readonly position: number;
  readonly itemId: string;
  readonly transactionReference: string;
  readonly status: "SUCCESS";
  readonly result: unknown;
}

interface FailedBatchOutcome {
  readonly position: number;
  readonly itemId: string;
  readonly transactionReference: string;
  readonly status: "ERROR";
  readonly errorCode: string;
  readonly message: string;
}

type BatchOutcome = SuccessfulBatchOutcome | FailedBatchOutcome;

function errorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "string") return response;
    const payload = response as Record<string, unknown>;
    const message = payload["message"];
    if (Array.isArray(message))
      return scalarText(message[0], "RESOLUTION_FAILED");
    if (message) return scalarText(message, "RESOLUTION_FAILED");
    if (payload["code"])
      return scalarText(payload["code"], "RESOLUTION_FAILED");
    return "RESOLUTION_FAILED";
  }
  return error instanceof Error && error.message
    ? error.message
    : "RESOLUTION_FAILED";
}

function batchStatus(successCount: number, failureCount: number) {
  if (failureCount === 0) return "SUCCESS" as const;
  if (successCount === 0) return "FAILED" as const;
  return "PARTIAL_SUCCESS" as const;
}

@Injectable()
export class BatchResolutionService {
  constructor(
    private readonly singleResolution: SsiApplicationService,
    private readonly messageIndex: PaymentMessageIndexService,
  ) {}

  resolve(request: BatchResolutionRequest) {
    this.validate(request);
    const outcomes = request.items.map((item, position) =>
      this.resolveItem(item, position, request.sourceMessageType),
    );
    return this.summary(request, outcomes);
  }

  private validate(request: BatchResolutionRequest) {
    if (!request.batchReference?.trim())
      throw new BadRequestException("BATCH_REFERENCE_REQUIRED");
    const index = this.messageIndex.getIndex();
    const profile = index.items.find(
      (item) => item.messageType === request.sourceMessageType,
    );
    if (!profile?.selectable)
      throw new BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED");
    if (profile?.processingMode !== "SPLIT")
      throw new BadRequestException("SPLIT_PROCESSING_MESSAGE_TYPE_REQUIRED");
    if (!Array.isArray(request.items) || request.items.length === 0)
      throw new BadRequestException("BATCH_ITEMS_REQUIRED");
    if (request.items.length > index.maxBatchItems)
      throw new BadRequestException("BATCH_SIZE_LIMIT_EXCEEDED");
    const ids = request.items.map((item) => item.itemId);
    if (ids.some((id) => !id?.trim()))
      throw new BadRequestException("BATCH_ITEM_ID_REQUIRED");
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException("DUPLICATE_BATCH_ITEM_ID");
    return index;
  }

  private resolveItem(
    item: BatchResolutionItem,
    position: number,
    sourceMessageType: string,
  ): BatchOutcome {
    const { itemId, ...itemRequest } = item;
    try {
      const result = this.singleResolution.resolve(
        toMt2BankResolutionRequest(
          itemRequest,
          this.messageIndex,
          sourceMessageType,
        ),
      ) as {
        decision?: string;
        recommendedRoute?: unknown;
        explanation?: string;
      };
      return result.recommendedRoute
        ? {
            position: position + 1,
            itemId,
            transactionReference: item.transactionReference,
            status: "SUCCESS",
            result,
          }
        : {
            position: position + 1,
            itemId,
            transactionReference: item.transactionReference,
            status: "ERROR",
            errorCode: result.decision ?? "NO_ELIGIBLE_ROUTE",
            message: result.explanation ?? "No eligible SSI route",
          };
    } catch (error) {
      const code = errorCode(error);
      return {
        position: position + 1,
        itemId,
        transactionReference: item.transactionReference,
        status: "ERROR",
        errorCode: code,
        message: code,
      };
    }
  }

  private summary(request: BatchResolutionRequest, outcomes: BatchOutcome[]) {
    const successfulItems = outcomes.filter(
      (item): item is SuccessfulBatchOutcome => item.status === "SUCCESS",
    );
    const failedItems = outcomes.filter(
      (item): item is FailedBatchOutcome => item.status === "ERROR",
    );
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
    } as const;
  }
}
