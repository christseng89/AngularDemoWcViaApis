export interface DemoFinSuggestionCandidate {
  id: string;
  version: number;
  counterpartyBic: string;
  currency: string;
  settlementMarket: string;
  bookingEntity: string;
  effectiveFrom: string;
  effectiveTo: string;
  priority: number;
  routeClass: "PRIMARY" | "SECONDARY" | "CONTINGENCY";
  demoData: true;
  sourceType: "SYNTHETIC_DEMO";
  accountRelationship: "DIRECT_ACCOUNT" | "AUTHENTICATED_RECEIVING_ROUTE";
  directRelationshipEvidenceId?: string;
  routeGraph: {
    accountRelationship: "DIRECT_ACCOUNT" | "AUTHENTICATED_RECEIVING_ROUTE";
    senderCorrespondent?: string;
    receiverCorrespondent?: string;
    additionalAccountWithRequired: boolean;
    accountWithInstitution?: string;
    routeComplete: boolean;
    evidenceValid: boolean;
    evidenceIds: readonly string[];
  };
  roleValues: Readonly<Record<string, string>>;
  bindingId?: string;
  messageType?: string;
  businessFunction?: string;
  sequence?: string;
  settlementLeg?: string;
  ssiRoleValues?: Readonly<Record<string, string>>;
  transactionRoleValues?: Readonly<Record<string, string>>;
  roleSources?: Readonly<Record<string, "SYNTHETIC_DEMO">>;
  roleEvidence?: Readonly<Record<string, Record<string, string>>>;
  identity?: {
    ssi: { id: string; version: number };
    applicability: { id: string; version: number };
  };
}

export const DEMO_SUGGESTION_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "HKD",
  "JPY",
  "SGD",
  "CNY",
] as const;
export const DEMO_SETTLEMENT_MARKETS: Readonly<Record<string, string>> = {
  USD: "US_DOLLAR",
  EUR: "EURO_AREA",
  GBP: "UK_STERLING",
  HKD: "HONG_KONG_DOLLAR",
  JPY: "JAPAN_YEN",
  SGD: "SINGAPORE_DOLLAR",
  CNY: "CNH_HONG_KONG",
};
export const DEMO_CURRENCY_AGENTS: Readonly<Record<string, readonly string[]>> =
  {
    USD: ["CHASUS33", "BOFAUS3N", "CITIUS33"],
    EUR: ["DEUTDEFF", "BNPAFRPP", "BARCGB22"],
    GBP: ["BARCGB22", "SCBLGB2L", "CITIUS33"],
    HKD: ["HSBCHKHH", "DBSSSGSG", "SCBLGB2L"],
    JPY: ["BOTKJPJT", "CITIUS33", "CHASUS33"],
    SGD: ["DBSSSGSG", "HSBCHKHH", "SCBLGB2L"],
    CNY: ["HSBCHKHH", "DBSSSGSG", "SCBLGB2L"],
  };
export const DEMO_PARTY_ROUTING_AGENTS: Readonly<
  Record<string, readonly string[]>
> = {
  CITIUS33: ["CITIUS33", "CHASUS33", "BOFAUS3N"],
  CHASUS33: ["CHASUS33", "CITIUS33", "BOFAUS3N"],
  BOFAUS3N: ["BOFAUS3N", "CHASUS33", "CITIUS33"],
  DEUTDEFF: ["DEUTDEFF", "BNPAFRPP", "BARCGB22"],
  BARCGB22: ["BARCGB22", "SCBLGB2L", "DEUTDEFF"],
  HSBCHKHH: ["HSBCHKHH", "DBSSSGSG", "SCBLGB2L"],
  SCBLGB2L: ["SCBLGB2L", "BARCGB22", "DEUTDEFF"],
  BNPAFRPP: ["BNPAFRPP", "DEUTDEFF", "BARCGB22"],
  BOTKJPJT: ["BOTKJPJT", "CITIUS33", "CHASUS33"],
  DBSSSGSG: ["DBSSSGSG", "HSBCHKHH", "SCBLGB2L"],
  NSSIUSN1: ["CITIUS33", "CHASUS33", "BOFAUS3N"],
};
const DEMO_LIMITED_CURRENCY_COVERAGE: Readonly<
  Record<string, readonly string[]>
> = {
  NSSIUSN1: ["USD", "GBP"],
};

interface DemoSuggestionInput {
  messageType: string;
  counterpartyBic: string;
  currency: string;
  bookingEntity: string;
  valueDate: string;
  partyRouting: boolean;
}

interface DemoSuggestionContext {
  counterparties: readonly string[];
  agents: readonly string[];
  market: string;
}

const ROUTE_CLASSES = ["PRIMARY", "SECONDARY", "CONTINGENCY"] as const;

function suggestionContext(
  input: DemoSuggestionInput,
): DemoSuggestionContext | null {
  const counterparties = DEMO_PARTY_ROUTING_AGENTS[input.counterpartyBic];
  const limitedCurrencies =
    DEMO_LIMITED_CURRENCY_COVERAGE[input.counterpartyBic];
  const agents = input.partyRouting
    ? counterparties
    : DEMO_CURRENCY_AGENTS[input.currency];
  const market = input.partyRouting
    ? "TRADE_PARTY_ROUTING"
    : DEMO_SETTLEMENT_MARKETS[input.currency];
  const currencyUnsupported =
    limitedCurrencies?.includes(input.currency) === false;
  const valueDateUnsupported =
    input.valueDate < "2026-01-01" || input.valueDate > "2027-12-31";
  if (
    !counterparties ||
    currencyUnsupported ||
    !agents ||
    !market ||
    input.bookingEntity !== "HK01" ||
    valueDateUnsupported
  )
    return null;
  return { counterparties, agents, market };
}

function routeGraph(
  input: DemoSuggestionInput,
  agent: string,
  next: string,
  last: string,
  index: number,
  directAccount: boolean,
  additionalAccountWithRequired: boolean,
): DemoFinSuggestionCandidate["routeGraph"] {
  if (directAccount)
    return {
      accountRelationship: "DIRECT_ACCOUNT",
      additionalAccountWithRequired: false,
      routeComplete: true,
      evidenceValid: true,
      evidenceIds: [
        `SYN-DIRECT-${input.counterpartyBic}-${input.currency}-003`,
      ],
    };
  const evidenceContext = input.partyRouting ? "PARTY" : input.currency;
  return {
    accountRelationship: "AUTHENTICATED_RECEIVING_ROUTE",
    senderCorrespondent: agent,
    receiverCorrespondent: next,
    additionalAccountWithRequired,
    ...(additionalAccountWithRequired ? { accountWithInstitution: last } : {}),
    routeComplete: true,
    evidenceValid: true,
    evidenceIds: [
      `SYN-SENDER-${evidenceContext}-${index + 1}`,
      `SYN-RECEIVER-${input.counterpartyBic}-${evidenceContext}-${index + 1}`,
    ],
  };
}

function roleValues(
  input: DemoSuggestionInput,
  agent: string,
  next: string,
  last: string,
  directAccount: boolean,
  additionalAccountWithRequired: boolean,
): Readonly<Record<string, string>> {
  return {
    SENDERS_CORRESPONDENT: selectedValue(!directAccount, agent),
    RECEIVERS_CORRESPONDENT: selectedValue(!directAccount, next),
    ACCOUNT_WITH_INSTITUTION: selectedValue(
      additionalAccountWithRequired || input.messageType !== "MT400",
      additionalAccountWithRequired ? last : agent,
    ),
    BENEFICIARY_BANK: "",
    REIMBURSING_BANK: agent,
    ADVISING_BANK: input.counterpartyBic,
    ADVISE_THROUGH_BANK: next,
    REQUESTED_CONFIRMATION_PARTY: last,
    NEGOTIATING_BANK: agent,
    INTERMEDIARY_INSTITUTION: agent,
    DELIVERY_AGENT: agent,
    RECEIVING_AGENT: next,
    BENEFICIARY_INSTITUTION: additionalAccountWithRequired ? last : next,
  };
}

function selectedValue(selected: boolean, value: string): string {
  return selected ? value : "";
}

function directRelationshipEvidence(
  input: DemoSuggestionInput,
  directAccount: boolean,
): Pick<DemoFinSuggestionCandidate, "directRelationshipEvidenceId"> {
  if (!directAccount) return {};
  return {
    directRelationshipEvidenceId: `SYN-DIRECT-${input.counterpartyBic}-${input.currency}-003`,
  };
}

function buildDemoSuggestionCandidate(
  input: DemoSuggestionInput,
  context: DemoSuggestionContext,
  agent: string,
  index: number,
): DemoFinSuggestionCandidate {
  const { agents, market } = context;
  const next = agents[(index + 1) % agents.length]!;
  const last = agents[(index + 2) % agents.length]!;
  const directAccount = input.messageType === "MT400" && index === 2;
  const additionalAccountWithRequired =
    input.messageType === "MT400" && index === 1;
  const identityContext = input.partyRouting ? "PARTY" : input.currency;
  const accountRelationship = directAccount
    ? ("DIRECT_ACCOUNT" as const)
    : ("AUTHENTICATED_RECEIVING_ROUTE" as const);
  return {
    id: `SYN-${input.messageType}-${input.counterpartyBic}-${identityContext}-${index + 1}`,
    version: 1,
    counterpartyBic: input.counterpartyBic,
    currency: input.partyRouting ? "NOT_APPLICABLE" : input.currency,
    settlementMarket: market,
    bookingEntity: "HK01",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-12-31",
    priority: (index + 1) * 10,
    routeClass: ROUTE_CLASSES[index]!,
    demoData: true,
    sourceType: "SYNTHETIC_DEMO",
    accountRelationship,
    ...directRelationshipEvidence(input, directAccount),
    routeGraph: routeGraph(
      input,
      agent,
      next,
      last,
      index,
      directAccount,
      additionalAccountWithRequired,
    ),
    roleValues: roleValues(
      input,
      agent,
      next,
      last,
      directAccount,
      additionalAccountWithRequired,
    ),
  };
}

export function buildDemoSuggestionCandidates(
  input: DemoSuggestionInput,
): readonly DemoFinSuggestionCandidate[] {
  const context = suggestionContext(input);
  if (!context) return [];
  return context.agents
    .map((agent, index) =>
      buildDemoSuggestionCandidate(input, context, agent, index),
    )
    .sort(
      (left, right) =>
        left.priority - right.priority || left.id.localeCompare(right.id),
    );
}
