export type TagSupportState =
  | "SUPPORTED_RESOLVED"
  | "SUPPORTED_NO_ELIGIBLE_SSI"
  | "NOT_SUPPORTED_BY_SSI";

export interface TagSupportProfileSlot {
  messageType: string;
  sequence: string;
  tag: string;
  option: string;
  semanticRole: string;
  standardsRelease: "SR2026";
  expectedSource: string;
}

export interface TagSupportRow extends TagSupportProfileSlot {
  officialFieldName: string;
  state: TagSupportState;
  suggestedValue?: string;
  source?: string;
  ownerSide?: string;
  evidence?: string;
  reason?: string;
}

const OFFICIAL_FIELD_NAMES: Readonly<Record<string, string>> = {
  "MT400|MESSAGE|53A|A": "Sender's Correspondent",
  "MT400|MESSAGE|54A|A": "Receiver's Correspondent",
  "MT400|MESSAGE|57A|A": "Account With Bank",
  "MT400|MESSAGE|58A|A": "Beneficiary Bank",
  "MT700|MESSAGE|53A|A": "Reimbursing Bank",
  "MT700|MESSAGE|57A|A": "'Advise Through' Bank",
  "MT700|MESSAGE|58A|A": "Requested Confirmation Party",
  "MT705|MESSAGE|57A|A": "'Advise Through' Bank",
  "MT707|MESSAGE|53A|A": "Reimbursing Bank",
  "MT707|MESSAGE|57A|A": "'Advise Through' Bank",
  "MT707|MESSAGE|58A|A": "Requested Confirmation Party",
  "MT710|MESSAGE|53A|A": "Reimbursing Bank",
  "MT710|MESSAGE|57A|A": "'Advise Through' Bank",
  "MT710|MESSAGE|58A|A": "Requested Confirmation Party",
  "MT720|MESSAGE|57A|A": "'Advise Through' Bank",
  "MT720|MESSAGE|58A|A": "Requested Confirmation Party",
  "MT730|MESSAGE|57A|A": "Account With Bank",
  "MT734|MESSAGE|57A|A": "Account With Bank",
  "MT740|MESSAGE|58A|A": "Negotiating Bank",
  "MT742|MESSAGE|57A|A": "Account With Bank",
  "MT742|MESSAGE|58A|A": "Beneficiary Bank",
  "MT750|MESSAGE|57A|A": "Account With Bank",
  "MT752|MESSAGE|53A|A": "Sender's Correspondent",
  "MT752|MESSAGE|54A|A": "Receiver's Correspondent",
  "MT754|MESSAGE|53A|A": "Reimbursing Bank",
  "MT754|MESSAGE|57A|A": "Account With Bank",
  "MT754|MESSAGE|58A|A": "Beneficiary Bank",
  "MT756|MESSAGE|53A|A": "Sender's Correspondent",
  "MT756|MESSAGE|54A|A": "Receiver's Correspondent",
  "MT760|B|56A|A": "Advising Bank",
  "MT760|B|57A|A": "'Advise Through' Bank",
  "MT760|B|58A|A": "Requested Confirmation Party",
  "MT765|MESSAGE|56A|A": "Intermediary",
  "MT765|MESSAGE|57A|A": "Account With Institution",
  "MT768|MESSAGE|57A|A": "Account With Bank",
  "MT769|MESSAGE|57A|A": "Account With Bank",
};

export function isSsiResolvable(slot: TagSupportProfileSlot): boolean {
  return slot.expectedSource.split("/").some((source) => source.trim() === "SSI_ROUTE");
}

function unsupportedReason(expectedSource: string): string {
  if (expectedSource.includes("CHARGE_ACCOUNT_INSTRUCTION"))
    return "MESSAGE_SPECIFIC_ACCOUNT_INSTRUCTION";
  if (expectedSource.includes("TRANSACTION_CONTEXT") || expectedSource.includes("PARTY_MASTER"))
    return "UPSTREAM_TRANSACTION_OR_TRADE_PARTY_ROUTING";
  return "FIELD_NOT_SSI_DERIVABLE";
}

export function buildTagSupportRows(input: {
  slots: readonly TagSupportProfileSlot[];
  suggestions: readonly {
    tag: string; sequence?: string; option?: string; value: string;
    provenance: { source: string; sourceRecordId?: string; ownerSide?: string };
  }[];
  hasEligibleSsi: boolean;
  directOmittedTags?: readonly string[];
}): readonly TagSupportRow[] {
  return input.slots.map((slot) => {
    const key = `${slot.messageType}|${slot.sequence}|${slot.tag}|${slot.option}`;
    const officialFieldName = OFFICIAL_FIELD_NAMES[key] ?? "Official field name pending verification";
    if (input.directOmittedTags?.includes(slot.tag))
      return { ...slot, officialFieldName, state: "NOT_SUPPORTED_BY_SSI", reason: "OMITTED_BY_ACCOUNT_RELATIONSHIP" };
    if (!isSsiResolvable(slot))
      return { ...slot, officialFieldName, state: "NOT_SUPPORTED_BY_SSI", reason: unsupportedReason(slot.expectedSource) };
    const suggestion = input.suggestions.find((item) =>
      item.tag === slot.tag && (item.sequence ?? slot.sequence) === slot.sequence &&
      (item.option ?? slot.option) === slot.option,
    );
    if (!suggestion)
      return {
        ...slot, officialFieldName, state: "SUPPORTED_NO_ELIGIBLE_SSI",
        reason: input.hasEligibleSsi ? "OWNER_MISMATCH_OR_CONFLICT" : "NO_ACTIVE_SSI",
      };
    return {
      ...slot, officialFieldName, state: "SUPPORTED_RESOLVED",
      suggestedValue: suggestion.value, source: suggestion.provenance.source,
      ownerSide: suggestion.provenance.ownerSide,
      evidence: suggestion.provenance.sourceRecordId,
    };
  });
}
