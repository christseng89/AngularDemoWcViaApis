import type { DemoFinSuggestionCandidate } from "./demo-suggestion-candidates";
import {
  assertFin5xSupportContract,
  type Fin5xReasonCode,
  type Fin5xResolutionStatus,
  type Fin5xScopeStatus,
} from "@ssi/fin-5x-support";
export type {
  Fin5xReasonCode,
  Fin5xResolutionStatus,
  Fin5xScopeStatus,
} from "@ssi/fin-5x-support";

export interface Fin5xProfileField {
  tag: string;
  semanticRole: string;
  expectedSource: string;
}

export interface Fin5xSupportRow {
  messageType: string;
  sequence: string;
  tag: string;
  option: "A";
  standardsRelease: "SR2026";
  semanticRole: string;
  officialFieldName: string;
  scopeStatus: Fin5xScopeStatus;
  resolutionStatus: Fin5xResolutionStatus;
  suggestedValue?: string;
  source?: string;
  ownerSide?: string;
  evidence?: string;
  reasonCode: Fin5xReasonCode;
}

const OFFICIAL_NAMES: Readonly<Record<string, string>> = {
  "MT400|53A": "Sender's Correspondent",
  "MT400|54A": "Receiver's Correspondent",
  "MT400|57A": "Account With Bank",
  "MT400|58A": "Beneficiary Bank",
  "MT700|53A": "Reimbursing Bank",
  "MT700|57A": "'Advise Through' Bank",
  "MT700|58A": "Requested Confirmation Party",
  "MT705|57A": "'Advise Through' Bank",
  "MT707|53A": "Reimbursing Bank",
  "MT707|57A": "'Advise Through' Bank",
  "MT707|58A": "Requested Confirmation Party",
  "MT710|53A": "Reimbursing Bank",
  "MT710|57A": "'Advise Through' Bank",
  "MT710|58A": "Requested Confirmation Party",
  "MT720|57A": "'Advise Through' Bank",
  "MT720|58A": "Requested Confirmation Party",
  "MT730|57A": "Account With Bank",
  "MT734|57A": "Account With Bank",
  "MT740|58A": "Negotiating Bank",
  "MT742|57A": "Account With Bank",
  "MT742|58A": "Beneficiary Bank",
  "MT750|57A": "Account With Bank",
  "MT752|53A": "Sender's Correspondent",
  "MT752|54A": "Receiver's Correspondent",
  "MT754|53A": "Reimbursing Bank",
  "MT754|57A": "Account With Bank",
  "MT754|58A": "Beneficiary Bank",
  "MT756|53A": "Sender's Correspondent",
  "MT756|54A": "Receiver's Correspondent",
  "MT760|56A": "Advising Bank",
  "MT760|57A": "'Advise Through' Bank",
  "MT760|58A": "Requested Confirmation Party",
  "MT765|56A": "Intermediary",
  "MT765|57A": "Account With Institution",
  "MT768|57A": "Account With Bank",
  "MT769|57A": "Account With Bank",
};

export function canonicalRole(role: string): string {
  if (role === "ACCOUNT_WITH_BANK") return "ACCOUNT_WITH_INSTITUTION";
  if (role === "INTERMEDIARY") return "INTERMEDIARY_INSTITUTION";
  return role;
}

export function isSsiResolvableField(field: Fin5xProfileField): boolean {
  return field.expectedSource
    .split("/")
    .some((source) => source.trim() === "SSI_ROUTE");
}

export function isVisibleSsiResolutionRow(row: {
  scopeStatus: string;
  resolutionStatus?: string;
  reasonCode?: string;
}): boolean {
  return (
    row.scopeStatus !== "OUT_OF_SSI_SCOPE" ||
    (row.resolutionStatus === "RESOLVED" &&
      row.reasonCode === "PRESERVED_FROM_TRANSACTION_CONTEXT")
  );
}

function outOfScopeReason(field: Fin5xProfileField): Fin5xReasonCode {
  if (field.semanticRole === "REQUESTED_CONFIRMATION_PARTY")
    return "CONFIRMATION_PARTY";
  if (field.expectedSource.includes("CHARGE_ACCOUNT_INSTRUCTION"))
    return "MESSAGE_PROFILE_EXCLUDED";
  if (field.expectedSource.includes("TRANSACTION_CONTEXT"))
    return "TRANSACTION_CONTEXT_PROVIDED";
  return "TRADE_ROUTING_ROLE";
}

export const assertLegalFin5xSupportRow = assertFin5xSupportContract;

interface Fin5xAnalysisInput {
  messageType: string;
  fields: readonly Fin5xProfileField[];
  candidate: DemoFinSuggestionCandidate | null;
  suggestions: readonly {
    tag: string;
    value: string;
    provenance: { source: string; sourceRecordId?: string; ownerSide?: string };
  }[];
}

type Fin5xBase = Omit<
  Fin5xSupportRow,
  "scopeStatus" | "resolutionStatus" | "reasonCode"
>;

const supportedOutcome = (
  base: Fin5xBase,
  resolutionStatus: Fin5xResolutionStatus,
  reasonCode: Fin5xReasonCode,
): Fin5xSupportRow =>
  assertLegalFin5xSupportRow({
    ...base,
    scopeStatus: "SSI_SUPPORTED",
    resolutionStatus,
    reasonCode,
  });

function resolvedReason(ownerSide?: string): Fin5xReasonCode {
  if (ownerSide === "RECEIVER_SIDE") return "RESOLVED_FROM_COUNTERPARTY_SSI";
  if (ownerSide === "SENDER_SIDE") return "RESOLVED_FROM_OWN_SSI";
  return "EXACT_ELIGIBLE_SSI";
}

function analyzeField(
  input: Fin5xAnalysisInput,
  field: Fin5xProfileField,
  sequence: string,
): Fin5xSupportRow {
  const base: Fin5xBase = {
    messageType: input.messageType,
    sequence,
    tag: field.tag,
    option: "A",
    standardsRelease: "SR2026",
    semanticRole: canonicalRole(field.semanticRole),
    officialFieldName:
      OFFICIAL_NAMES[`${input.messageType}|${field.tag}`] ??
      "Official field name pending verification",
  };
  if (!isSsiResolvableField(field))
    return assertLegalFin5xSupportRow({
      ...base,
      scopeStatus: "OUT_OF_SSI_SCOPE",
      resolutionStatus: "N_A",
      reasonCode: outOfScopeReason(field),
    });

  const graph = input.candidate?.routeGraph;
  if (
    input.messageType === "MT400" &&
    graph?.accountRelationship === "DIRECT_ACCOUNT"
  )
    return supportedOutcome(
      base,
      "NOT_REQUIRED",
      "DIRECT_ACCOUNT_RELATIONSHIP",
    );
  if (graph && (!graph.evidenceValid || !graph.routeComplete))
    return supportedOutcome(base, "NO_ELIGIBLE_SSI", "CONFLICTING_SSI");
  if (
    input.messageType === "MT400" &&
    field.tag === "57A" &&
    graph &&
    !graph.additionalAccountWithRequired
  )
    return supportedOutcome(base, "NOT_REQUIRED", "ROUTE_COMPLETE");

  const suggestion = input.suggestions.find((item) => item.tag === field.tag);
  if (!suggestion)
    return supportedOutcome(
      base,
      "NO_ELIGIBLE_SSI",
      input.candidate ? "CONFLICTING_SSI" : "MISSING_SSI",
    );
  return assertLegalFin5xSupportRow({
    ...base,
    scopeStatus: "SSI_SUPPORTED",
    resolutionStatus: "RESOLVED",
    suggestedValue: suggestion.value,
    source: suggestion.provenance.source,
    ...(suggestion.provenance.ownerSide
      ? { ownerSide: suggestion.provenance.ownerSide }
      : {}),
    ...(suggestion.provenance.sourceRecordId
      ? { evidence: suggestion.provenance.sourceRecordId }
      : {}),
    reasonCode: resolvedReason(suggestion.provenance.ownerSide),
  });
}

export function analyzeFin5xSupport(
  input: Fin5xAnalysisInput,
): readonly Fin5xSupportRow[] {
  const sequence = input.messageType === "MT760" ? "B" : "MESSAGE";
  return input.fields.map((field) => analyzeField(input, field, sequence));
}
