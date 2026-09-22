import { assertFin5xSupportContract } from "../../app/fin-5x-support-contract";

describe("FIN 5x support contract", () => {
  it("accepts resolved and not-required legal states", () => {
    const resolved = {
      scopeStatus: "SSI_SUPPORTED" as const,
      resolutionStatus: "RESOLVED" as const,
      reasonCode: "EXACT_ELIGIBLE_SSI" as const,
      suggestedValue: "DEUTDEFF",
    };
    expect(assertFin5xSupportContract(resolved)).toBe(resolved);
    expect(
      assertFin5xSupportContract({
        scopeStatus: "SSI_SUPPORTED",
        resolutionStatus: "NOT_REQUIRED",
        reasonCode: "ROUTE_COMPLETE",
      }),
    ).toMatchObject({ resolutionStatus: "NOT_REQUIRED" });
  });

  it.each([
    {
      scopeStatus: "SSI_SUPPORTED" as const,
      resolutionStatus: "RESOLVED" as const,
      reasonCode: "EXACT_ELIGIBLE_SSI" as const,
    },
    {
      scopeStatus: "SSI_SUPPORTED" as const,
      resolutionStatus: "NOT_REQUIRED" as const,
      reasonCode: "ROUTE_COMPLETE" as const,
      suggestedValue: "UNEXPECTED",
    },
    {
      scopeStatus: "OUT_OF_SSI_SCOPE" as const,
      resolutionStatus: "N_A" as const,
      reasonCode: "MISSING_SSI" as const,
    },
  ])("rejects an inconsistent governed state", (value) => {
    expect(() => assertFin5xSupportContract(value)).toThrow(
      "INVALID_FIN_5X_SUPPORT_STATE",
    );
  });
});
