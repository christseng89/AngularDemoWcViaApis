import {
  buildTagSupportRows,
  isSsiResolvable,
  type TagSupportProfileSlot,
} from "./tag-support-state";

const slot = (
  expectedSource: string,
  overrides: Partial<TagSupportProfileSlot> = {},
): TagSupportProfileSlot => ({
  messageType: "MT400",
  sequence: "MESSAGE",
  tag: "53A",
  option: "A",
  semanticRole: "SENDERS_CORRESPONDENT",
  standardsRelease: "SR2026",
  expectedSource,
  ...overrides,
});

describe("tag support state", () => {
  it("recognises SSI_ROUTE only as an explicit expected source", () => {
    expect(isSsiResolvable(slot("TRANSACTION_CONTEXT / SSI_ROUTE"))).toBe(true);
    expect(isSsiResolvable(slot("TRANSACTION_CONTEXT"))).toBe(false);
  });

  it.each([
    ["CHARGE_ACCOUNT_INSTRUCTION", "MESSAGE_SPECIFIC_ACCOUNT_INSTRUCTION"],
    ["TRANSACTION_CONTEXT", "UPSTREAM_TRANSACTION_OR_TRADE_PARTY_ROUTING"],
    ["PARTY_MASTER", "UPSTREAM_TRANSACTION_OR_TRADE_PARTY_ROUTING"],
    ["OTHER_SOURCE", "FIELD_NOT_SSI_DERIVABLE"],
  ])("classifies unsupported source %s", (expectedSource, reason) => {
    expect(
      buildTagSupportRows({
        slots: [slot(expectedSource)],
        suggestions: [],
        hasEligibleSsi: false,
      })[0],
    ).toMatchObject({ state: "NOT_SUPPORTED_BY_SSI", reason });
  });

  it("reports direct-account omissions before source resolution", () => {
    expect(
      buildTagSupportRows({
        slots: [slot("SSI_ROUTE")],
        suggestions: [],
        hasEligibleSsi: true,
        directOmittedTags: ["53A"],
      })[0],
    ).toMatchObject({
      state: "NOT_SUPPORTED_BY_SSI",
      reason: "OMITTED_BY_ACCOUNT_RELATIONSHIP",
    });
  });

  it.each([
    [false, "NO_ACTIVE_SSI"],
    [true, "OWNER_MISMATCH_OR_CONFLICT"],
  ])("explains a missing suggestion when eligibility is %s", (hasEligibleSsi, reason) => {
    expect(
      buildTagSupportRows({
        slots: [slot("SSI_ROUTE")],
        suggestions: [],
        hasEligibleSsi,
      })[0],
    ).toMatchObject({ state: "SUPPORTED_NO_ELIGIBLE_SSI", reason });
  });

  it("matches defaulted sequence and option and preserves provenance", () => {
    expect(
      buildTagSupportRows({
        slots: [slot("SSI_ROUTE")],
        suggestions: [
          {
            tag: "53A",
            value: "CHASUS33",
            provenance: {
              source: "SSI",
              sourceRecordId: "SSI-1",
              ownerSide: "SENDER_SIDE",
            },
          },
        ],
        hasEligibleSsi: true,
      })[0],
    ).toMatchObject({
      officialFieldName: "Sender's Correspondent",
      state: "SUPPORTED_RESOLVED",
      suggestedValue: "CHASUS33",
      source: "SSI",
      evidence: "SSI-1",
      ownerSide: "SENDER_SIDE",
    });
  });

  it("uses the pending label and rejects a mismatched explicit sequence", () => {
    expect(
      buildTagSupportRows({
        slots: [
          slot("SSI_ROUTE", {
            messageType: "MT999",
            sequence: "Z",
            tag: "99A",
          }),
        ],
        suggestions: [
          {
            tag: "99A",
            sequence: "OTHER",
            option: "A",
            value: "VALUE",
            provenance: { source: "SSI" },
          },
        ],
        hasEligibleSsi: true,
      })[0],
    ).toMatchObject({
      officialFieldName: "Official field name pending verification",
      state: "SUPPORTED_NO_ELIGIBLE_SSI",
    });
  });
});
