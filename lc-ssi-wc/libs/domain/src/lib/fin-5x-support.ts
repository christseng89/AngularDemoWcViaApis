export type Fin5xScopeStatus = "SSI_SUPPORTED" | "OUT_OF_SSI_SCOPE";
export type Fin5xResolutionStatus = "RESOLVED" | "NOT_REQUIRED" | "NO_ELIGIBLE_SSI" | "N_A";
export type Fin5xReasonCode =
  | "ROUTE_COMPLETE" | "DIRECT_ACCOUNT_RELATIONSHIP" | "OPTIONAL_FIELD_OMITTED" | "MISSING_SSI"
  | "EXPIRED_SSI" | "CONFLICTING_SSI" | "INACTIVE_SSI"
  | "NO_MATCHING_BOOKING_ENTITY" | "TRADE_ROUTING_ROLE"
  | "TRANSACTION_CONTEXT_PROVIDED" | "CONFIRMATION_PARTY"
  | "MESSAGE_PROFILE_EXCLUDED" | "EXACT_ELIGIBLE_SSI"
  | "RESOLVED_FROM_OWN_SSI" | "RESOLVED_FROM_COUNTERPARTY_SSI";

export interface Fin5xSupportContract {
  scopeStatus: Fin5xScopeStatus;
  resolutionStatus: Fin5xResolutionStatus;
  reasonCode: Fin5xReasonCode;
  suggestedValue?: string;
}

export const FIN_5X_LEGAL_REASON_MATRIX: Readonly<Record<string, readonly Fin5xReasonCode[]>> = {
  "OUT_OF_SSI_SCOPE|N_A": ["TRADE_ROUTING_ROLE", "TRANSACTION_CONTEXT_PROVIDED", "CONFIRMATION_PARTY", "MESSAGE_PROFILE_EXCLUDED"],
  "SSI_SUPPORTED|NOT_REQUIRED": ["ROUTE_COMPLETE", "DIRECT_ACCOUNT_RELATIONSHIP", "OPTIONAL_FIELD_OMITTED"],
  "SSI_SUPPORTED|NO_ELIGIBLE_SSI": ["MISSING_SSI", "EXPIRED_SSI", "CONFLICTING_SSI", "INACTIVE_SSI", "NO_MATCHING_BOOKING_ENTITY"],
  "SSI_SUPPORTED|RESOLVED": ["EXACT_ELIGIBLE_SSI", "RESOLVED_FROM_OWN_SSI", "RESOLVED_FROM_COUNTERPARTY_SSI"],
};

export function assertFin5xSupportContract<T extends Fin5xSupportContract>(value: T & Record<string, unknown>): T {
  const legalReasons = FIN_5X_LEGAL_REASON_MATRIX[`${value.scopeStatus}|${value.resolutionStatus}`];
  const hasValue = !!value.suggestedValue?.trim();
  if (!legalReasons?.includes(value.reasonCode) || (value.resolutionStatus === "RESOLVED") !== hasValue)
    throw new Error("INVALID_FIN_5X_SUPPORT_STATE");
  return value;
}
