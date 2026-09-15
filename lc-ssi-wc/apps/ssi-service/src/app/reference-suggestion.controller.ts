import { Body, Controller, Header, Post } from "@nestjs/common";
import { FinFieldResolutionService, type FinFieldResolutionRequest } from "./fin-field-resolution.service";

@Controller("reference")
export class ReferenceSuggestionController {
  constructor(private readonly service: FinFieldResolutionService) {}

  @Post("fin-tag-suggestions")
  @Header("Deprecation", "true")
  @Header("Link", "</reference/fin-tag-resolutions>; rel=successor-version")
  suggest(@Body() body: Omit<FinFieldResolutionRequest, "resolutionMode"> & { resolutionMode?: FinFieldResolutionRequest["resolutionMode"] }): unknown {
    const resolution = this.service.resolve({
      ...body,
      resolutionMode: body.resolutionMode ?? (body.messageType.startsWith("MT3") ? "TREASURY" : "TRADE_FINANCE"),
    }) as Record<string, unknown> & { resolvedFields: Array<Record<string, unknown>> };
    const suggestions = resolution.resolvedFields
      .filter((field) => field["resolutionStatus"] === "RESOLVED")
      .map((field) => ({
        tag: field["tag"], sequence: field["sequence"], option: field["option"],
        canonicalRole: field["officialRole"], officialFieldName: field["officialFieldName"],
        value: field["resolvedValue"], suggestedValue: field["resolvedValue"],
        provenance: {
          ...(field["provenance"] as Record<string, unknown>),
          standardsRelease: body.standardsRelease,
          messageType: body.messageType,
          businessFunction: body.businessFunction,
          transactionReference: body.transactionReference,
          sourceSsiId: body.sourceSsiId,
        },
      }));
    return {
      ...resolution,
      deprecated: true,
      successor: "/reference/fin-tag-resolutions",
      preSettlement: true,
      reconciliationSupported: false,
      watermark: "NOT FOR PAYMENT RELEASE",
      suggestions,
      supportAnalysis: resolution.resolvedFields.map((field) => ({ ...field, suggestedValue: field["resolvedValue"] })),
      fields: Object.fromEntries(suggestions.map((field) => [String(field.tag), field.value])),
    };
  }
}
