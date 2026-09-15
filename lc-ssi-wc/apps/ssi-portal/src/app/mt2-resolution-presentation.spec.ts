import {
  contractAlternatives,
  contractCandidates,
  contractChosenRoute,
  contractDecision,
  contractEvidence,
  contractOutput,
  isMt2ResolutionContract,
  mt2ResolutionContractFromError,
  presentResolutionError,
} from "./mt2-resolution-presentation";

describe("MT2 resolution presentation", () => {
  const contract = {
    mx: {
      httpStatus: 200,
      decision: "RESOLVED",
      canonicalScenario: "FI_TO_FI_TRANSFER",
    },
    mt: { tags: { "58A": "BARCGB22" }, omitted: ["53a", "54a"] },
  };

  it("recognises and presents the governed dual-format response", () => {
    expect(isMt2ResolutionContract(contract)).toBe(true);
    expect(contractDecision(contract)).toBe("RESOLVED");
    expect(contractOutput(contract, "MT")).toEqual(contract.mt);
    expect(contractOutput(contract, "MX")).toEqual(contract.mx);
  });

  it("prefers the canonical multi-candidate decision over the MX renderer decision", () => {
    expect(
      contractDecision({
        ...contract,
        resolutionDecision: "MULTIPLE_CANDIDATES",
      }),
    ).toBe("MULTIPLE_CANDIDATES");
  });

  it("presents governed route, evidence, alternatives, and error candidates", () => {
    const resolved = {
      ...contract,
      chosenRoute: { ssiId: "SSI-1", ssiCode: "SSI-DEMO-001" },
      alternatives: [{ ssiId: "SSI-2", ssiCode: "SSI-DEMO-002" }],
      resolutionToken: "ATTEMPT-1",
      snapshotHash: "HASH-1",
    };
    expect(contractChosenRoute(resolved)).toMatchObject({ ssiId: "SSI-1" });
    expect(contractAlternatives(resolved)).toHaveLength(1);
    expect(contractEvidence(resolved)).toEqual({
      resolutionToken: "ATTEMPT-1",
      snapshotHash: "HASH-1",
    });

    const ambiguous = {
      status: 422,
      error: {
        ...contract,
        resolutionDecision: "SSI_AMBIGUOUS",
        candidates: [{ ssiId: "SSI-1" }, { ssiId: "SSI-2" }],
      },
    };
    const errorContract = mt2ResolutionContractFromError(ambiguous)!;
    expect(contractChosenRoute(errorContract)).toBeNull();
    expect(contractCandidates(errorContract)).toHaveLength(2);
  });

  it("does not mistake the legacy route-resolution response for an MT2 contract", () => {
    expect(
      isMt2ResolutionContract({ decision: "RESOLVED", alternatives: [] }),
    ).toBe(false);
  });

  it("preserves the API contract code and useful details from an HTTP error", () => {
    expect(
      presentResolutionError({
        status: 422,
        error: {
          mx: {
            code: "OPTION_CONSTRAINT_VIOLATION",
            detail: "56a requires 57a",
          },
          mt: { validation: "FAIL", error: "C81" },
        },
      }),
    ).toBe(
      "OPTION_CONSTRAINT_VIOLATION · HTTP 422 · 56a requires 57a · MT C81",
    );
  });

  it("preserves the own-account reasonCode for auditable negative UAT", () => {
    expect(
      presentResolutionError({
        status: 422,
        error: {
          mx: {
            code: "OPTION_CONSTRAINT_VIOLATION",
            reasonCode: "OWN_ACCOUNT_CURRENCY_MISMATCH",
          },
        },
      }),
    ).toContain("OWN_ACCOUNT_CURRENCY_MISMATCH");
  });

  it("retains a fail-closed fallback without inventing a contract code", () => {
    expect(presentResolutionError(new Error("network down"))).toBe(
      "Resolution fail-closed：交易條件不完整或參考服務不可用。",
    );
  });
});
