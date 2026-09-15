import { buildDemoSuggestionCandidates } from "./demo-suggestion-candidates";
import {
  analyzeFin5xSupport,
  assertLegalFin5xSupportRow,
  isVisibleSsiResolutionRow,
  type Fin5xProfileField,
  type Fin5xReasonCode,
  type Fin5xResolutionStatus,
  type Fin5xScopeStatus,
} from "./fin-5x-route-analysis";

const mt400Fields: readonly Fin5xProfileField[] = [
  {
    tag: "53A",
    semanticRole: "SENDERS_CORRESPONDENT",
    expectedSource: "SSI_ROUTE",
  },
  {
    tag: "54A",
    semanticRole: "RECEIVERS_CORRESPONDENT",
    expectedSource: "SSI_ROUTE",
  },
  {
    tag: "57A",
    semanticRole: "ACCOUNT_WITH_BANK",
    expectedSource: "SSI_ROUTE",
  },
  {
    tag: "58A",
    semanticRole: "BENEFICIARY_BANK",
    expectedSource: "TRANSACTION_CONTEXT / PARTY_MASTER",
  },
];
const candidates = buildDemoSuggestionCandidates({
  messageType: "MT400",
  counterpartyBic: "BARCGB22",
  currency: "GBP",
  bookingEntity: "HK01",
  valueDate: "2026-09-08",
  partyRouting: false,
});
const suggestion = (tag: string, value: string) => ({
  tag,
  value,
  provenance: {
    source: "SYNTHETIC_DEMO",
    sourceRecordId: "EVIDENCE",
    ownerSide: "SENDER_SIDE",
  },
});

describe("route-first FIN 5x applicability", () => {
  it("hides out-of-scope fields from the user-facing resolution table", () => {
    const rows = analyzeFin5xSupport({
      messageType: "MT400",
      fields: mt400Fields,
      candidate: null,
      suggestions: [],
    });
    expect(
      rows.filter(isVisibleSsiResolutionRow).map((row) => row.tag),
    ).toEqual(["53A", "54A", "57A"]);
  });

  it("shows a hybrid field preserved from immutable transaction context", () => {
    expect(
      isVisibleSsiResolutionRow({
        scopeStatus: "OUT_OF_SSI_SCOPE",
        resolutionStatus: "RESOLVED",
        reasonCode: "PRESERVED_FROM_TRANSACTION_CONTEXT",
      }),
    ).toBe(true);
    expect(
      isVisibleSsiResolutionRow({
        scopeStatus: "OUT_OF_SSI_SCOPE",
        resolutionStatus: "N_A",
        reasonCode: "TRANSACTION_CONTEXT_PROVIDED",
      }),
    ).toBe(false);
  });

  it("marks 57 not required when unequal 53/54 already complete the route", () => {
    const candidate = candidates[0]!;
    expect(candidate.routeGraph.senderCorrespondent).not.toBe(
      candidate.routeGraph.receiverCorrespondent,
    );
    const rows = analyzeFin5xSupport({
      messageType: "MT400",
      fields: mt400Fields,
      candidate,
      suggestions: [
        suggestion("53A", candidate.roleValues["SENDERS_CORRESPONDENT"]!),
        suggestion("54A", candidate.roleValues["RECEIVERS_CORRESPONDENT"]!),
      ],
    });
    expect(rows.find((row) => row.tag === "57A")).toMatchObject({
      scopeStatus: "SSI_SUPPORTED",
      resolutionStatus: "NOT_REQUIRED",
      reasonCode: "ROUTE_COMPLETE",
    });
    expect(rows.find((row) => row.tag === "58A")).toMatchObject({
      scopeStatus: "OUT_OF_SSI_SCOPE",
      resolutionStatus: "N_A",
    });
  });

  it("does not use 53==54 as a shortcut for 57 or 58", () => {
    const candidate = {
      ...candidates[1]!,
      routeGraph: {
        ...candidates[1]!.routeGraph,
        senderCorrespondent: "BARCGB22",
        receiverCorrespondent: "BARCGB22",
        additionalAccountWithRequired: true,
      },
    };
    const rows = analyzeFin5xSupport({
      messageType: "MT400",
      fields: mt400Fields,
      candidate,
      suggestions: [
        suggestion("53A", "BARCGB22"),
        suggestion("54A", "BARCGB22"),
        suggestion("57A", "CITIUS33"),
      ],
    });
    expect(rows.find((row) => row.tag === "57A")?.resolutionStatus).toBe(
      "RESOLVED",
    );
    expect(rows.find((row) => row.tag === "58A")?.scopeStatus).toBe(
      "OUT_OF_SSI_SCOPE",
    );
  });

  it("resolves an evidenced additional hop and reports missing hop evidence separately", () => {
    const candidate = candidates[1]!;
    const resolved = analyzeFin5xSupport({
      messageType: "MT400",
      fields: mt400Fields,
      candidate,
      suggestions: [
        suggestion("57A", candidate.routeGraph.accountWithInstitution!),
      ],
    });
    expect(resolved.find((row) => row.tag === "57A")?.resolutionStatus).toBe(
      "RESOLVED",
    );
    const missing = analyzeFin5xSupport({
      messageType: "MT400",
      fields: mt400Fields,
      candidate,
      suggestions: [],
    });
    expect(missing.find((row) => row.tag === "57A")?.resolutionStatus).toBe(
      "NO_ELIGIBLE_SSI",
    );
  });

  it("uses explicit direct-account omission status", () => {
    const rows = analyzeFin5xSupport({
      messageType: "MT400",
      fields: mt400Fields,
      candidate: candidates[2]!,
      suggestions: [],
    });
    expect(
      rows
        .filter((row) => ["53A", "54A", "57A"].includes(row.tag))
        .every(
          (row) =>
            row.scopeStatus === "SSI_SUPPORTED" &&
            row.resolutionStatus === "NOT_REQUIRED" &&
            row.reasonCode === "DIRECT_ACCOUNT_RELATIONSHIP",
        ),
    ).toBe(true);
  });

  it.each([
    "MT400",
    "MT700",
    "MT705",
    "MT707",
    "MT710",
    "MT720",
    "MT730",
    "MT734",
    "MT740",
    "MT742",
    "MT750",
    "MT752",
    "MT754",
    "MT756",
    "MT760",
    "MT765",
    "MT768",
    "MT769",
  ])("supports an exact message policy for %s", (messageType) => {
    const fields =
      messageType === "MT400"
        ? mt400Fields
        : [
            {
              tag: "57A",
              semanticRole: "ACCOUNT_WITH_BANK",
              expectedSource: "SSI_ROUTE",
            },
          ];
    const rows = analyzeFin5xSupport({
      messageType,
      fields,
      candidate: null,
      suggestions: [],
    });
    expect(
      rows.every(
        (row) =>
          row.messageType === messageType &&
          row.option === "A" &&
          row.standardsRelease === "SR2026",
      ),
    ).toBe(true);
  });

  it.each([
    ["OUT_OF_SSI_SCOPE", "N_A", "TRADE_ROUTING_ROLE", false],
    ["SSI_SUPPORTED", "NOT_REQUIRED", "ROUTE_COMPLETE", false],
    ["SSI_SUPPORTED", "NO_ELIGIBLE_SSI", "MISSING_SSI", false],
    ["SSI_SUPPORTED", "RESOLVED", "EXACT_ELIGIBLE_SSI", true],
  ] as const)(
    "accepts legal %s/%s/%s",
    (scopeStatus, resolutionStatus, reasonCode, withValue) => {
      expect(() =>
        assertLegalFin5xSupportRow({
          messageType: "MT400",
          sequence: "MESSAGE",
          tag: "53A",
          option: "A",
          standardsRelease: "SR2026",
          semanticRole: "SENDERS_CORRESPONDENT",
          officialFieldName: "Sender's Correspondent",
          scopeStatus,
          resolutionStatus,
          reasonCode,
          ...(withValue ? { suggestedValue: "CHASUS33" } : {}),
        }),
      ).not.toThrow();
    },
  );

  it.each([
    ["OUT_OF_SSI_SCOPE", "RESOLVED", "TRADE_ROUTING_ROLE", "CHASUS33"],
    ["SSI_SUPPORTED", "RESOLVED", "MISSING_SSI", "CHASUS33"],
    ["SSI_SUPPORTED", "NOT_REQUIRED", "ROUTE_COMPLETE", "CHASUS33"],
    ["SSI_SUPPORTED", "RESOLVED", "EXACT_ELIGIBLE_SSI", undefined],
  ] as readonly (readonly [
    Fin5xScopeStatus,
    Fin5xResolutionStatus,
    Fin5xReasonCode,
    string | undefined,
  ])[])(
    "rejects illegal %s/%s/%s",
    (scopeStatus, resolutionStatus, reasonCode, suggestedValue) => {
      expect(() =>
        assertLegalFin5xSupportRow({
          messageType: "MT400",
          sequence: "MESSAGE",
          tag: "53A",
          option: "A",
          standardsRelease: "SR2026",
          semanticRole: "SENDERS_CORRESPONDENT",
          officialFieldName: "Sender's Correspondent",
          scopeStatus,
          resolutionStatus,
          reasonCode,
          ...(suggestedValue ? { suggestedValue } : {}),
        }),
      ).toThrow("INVALID_FIN_5X_SUPPORT_STATE");
    },
  );
});
