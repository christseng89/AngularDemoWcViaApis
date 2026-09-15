import { assertFin5xSupportContract, FIN_5X_LEGAL_REASON_MATRIX, type Fin5xReasonCode, type Fin5xResolutionStatus, type Fin5xScopeStatus } from "./fin-5x-support";

describe("FIN 5x support contract", () => {
  it.each(Object.entries(FIN_5X_LEGAL_REASON_MATRIX).flatMap(([pair, reasons]) => {
    const [scopeStatus, resolutionStatus] = pair.split("|") as [Fin5xScopeStatus, Fin5xResolutionStatus];
    return reasons.map((reasonCode) => [scopeStatus, resolutionStatus, reasonCode] as const);
  }))("accepts %s/%s/%s", (scopeStatus, resolutionStatus, reasonCode) => {
    expect(() => assertFin5xSupportContract({ scopeStatus, resolutionStatus, reasonCode, ...(resolutionStatus === "RESOLVED" ? { suggestedValue: "CHASUS33" } : {}) })).not.toThrow();
  });

  it.each([
    ["OUT_OF_SSI_SCOPE", "RESOLVED", "TRADE_ROUTING_ROLE", "CHASUS33"],
    ["SSI_SUPPORTED", "NOT_REQUIRED", "MISSING_SSI", undefined],
    ["SSI_SUPPORTED", "RESOLVED", "EXACT_ELIGIBLE_SSI", undefined],
    ["SSI_SUPPORTED", "NO_ELIGIBLE_SSI", "MISSING_SSI", "CHASUS33"],
  ] as readonly (readonly [Fin5xScopeStatus, Fin5xResolutionStatus, Fin5xReasonCode, string | undefined])[])("rejects illegal %s/%s/%s", (scopeStatus, resolutionStatus, reasonCode, suggestedValue) => {
    expect(() => assertFin5xSupportContract({ scopeStatus, resolutionStatus, reasonCode, ...(suggestedValue ? { suggestedValue } : {}) })).toThrow("INVALID_FIN_5X_SUPPORT_STATE");
  });
});
