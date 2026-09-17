import { Injectable } from "@nestjs/common";
import { resolveRuntimeEnvironment } from "../runtime-environment.policy";

type JsonObject = Record<string, unknown>;

const PROFILE_ID = "MT347_DEMO_FIN_REFERENCE_ONLY_V1";
const BIC_PATTERN = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const PROHIBITED_PAYMENT_FIELDS = [
  "clearingSystem",
  "settlementMarket",
  "schemeType",
  "routeType",
  "paymentPostingAccount",
] as const;

@Injectable()
export class Mt347DemoImportValidationProfile {
  validateDryRunIfApplicable(record: unknown): boolean {
    const payload = this.object(record);
    const route = this.object(payload["route"]);
    if (!this.isApplicable(payload, route)) return false;
    this.assertControlledEnvelope(payload, route);
    this.assertNoPaymentSemantics(route);
    this.assertReferenceIdentity(route);
    if (payload["usageScope"] === "QA_POSITIVE") return true;
    const reasonCode = String(route["oracleReasonCode"] ?? "").trim();
    if (!reasonCode) throw new Error("MT347_DEMO_REASON_CODE_REQUIRED");
    throw new Error(reasonCode);
  }

  private isApplicable(payload: JsonObject, route: JsonObject): boolean {
    return (
      resolveRuntimeEnvironment().developmentEnabled &&
      payload["fixtureFamily"] === "MT347-SR2026-SSI" &&
      route["importValidationProfile"] === PROFILE_ID
    );
  }

  private assertControlledEnvelope(
    payload: JsonObject,
    route: JsonObject,
  ): void {
    if (
      payload["fixtureVariantVersion"] !== "MT347-DEMO-ORACLE-V1.1" ||
      payload["operationalVisible"] !== false ||
      payload["paymentExecutable"] !== false ||
      !["QA_POSITIVE", "QA_NEGATIVE"].includes(
        String(payload["usageScope"]),
      ) ||
      route["profileKind"] !== "FIN_REFERENCE_ONLY" ||
      route["settlementModel"] !== "FIN_REFERENCE_ONLY" ||
      route["paymentExecutable"] !== "false" ||
      route["oracleBusinessStatus"] !== "BA_CONFIRMED" ||
      !String(route["oracleContextKey"] ?? "").trim()
    ) {
      throw new Error("MT347_DEMO_PROFILE_CONTRACT_MISMATCH");
    }
  }

  private assertNoPaymentSemantics(route: JsonObject): void {
    if (
      PROHIBITED_PAYMENT_FIELDS.some((field) =>
        String(route[field] ?? "").trim(),
      )
    ) {
      throw new Error("MT347_DEMO_PAYMENT_SEMANTICS_PROHIBITED");
    }
  }

  private assertReferenceIdentity(route: JsonObject): void {
    if (
      !CURRENCY_PATTERN.test(String(route["currency"] ?? "")) ||
      !BIC_PATTERN.test(String(route["counterpartyBic"] ?? "")) ||
      !String(route["bookingEntity"] ?? "").trim()
    ) {
      throw new Error("MT347_DEMO_REFERENCE_IDENTITY_REQUIRED");
    }
  }

  private object(value: unknown): JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonObject)
      : {};
  }
}
