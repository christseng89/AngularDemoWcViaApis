import type { PaymentMessageIndexItem } from "./payment-message-index";

export type PaymentScenarioControlKind =
  | "ACCOUNT_SELECTOR"
  | "BANK_SERVICE_SELECTOR"
  | "MANDATE_SELECTOR"
  | "MESSAGE_CONTEXT_SELECTOR"
  | "READ_ONLY_BANK_IDENTITY";

export interface PaymentScenarioControl {
  readonly field:
    | "ownDebitAccountId"
    | "ownCreditAccountId"
    | "receiverBankServiceId"
    | "messageContextId"
    | "mandateId"
    | "senderIdentity";
  readonly label: string;
  readonly kind: PaymentScenarioControlKind;
  readonly options?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export interface PaymentMessageScenario {
  readonly code:
    | "CREDIT_ONE_OF_SEVERAL_AT_57A"
    | "BOOK_TRANSFER_SAME_RECEIVER"
    | "INITIAL_MT200_201_EQUIVALENCE"
    | "NO_MT200_201_EQUIVALENCE";
  readonly title: string;
  readonly messageType: string;
  readonly targetMessage: string;
  readonly businessService: string;
  readonly description: string;
  readonly controls: readonly PaymentScenarioControl[];
}

function ownAccountControls(
  debitLabel: string,
  creditLabel: string,
): readonly PaymentScenarioControl[] {
  return [
    {
      field: "ownDebitAccountId",
      label: debitLabel,
      kind: "ACCOUNT_SELECTOR",
    },
    {
      field: "ownCreditAccountId",
      label: creditLabel,
      kind: "ACCOUNT_SELECTOR",
    },
    {
      field: "receiverBankServiceId",
      label: "Receiver Bank",
      kind: "BANK_SERVICE_SELECTOR",
    },
  ];
}

export const PAYMENT_MESSAGE_SCENARIOS: readonly PaymentMessageScenario[] = [
  {
    code: "BOOK_TRANSFER_SAME_RECEIVER",
    title: "Book transfer — same receiver",
    messageType: "MT202",
    targetMessage: "pacs.009.001.08",
    businessService: "swift.cbprplus.04",
    description:
      "Transfer between own accounts held with the same receiver bank.",
    controls: ownAccountControls("Own debit account", "Own credit account"),
  },
  {
    code: "CREDIT_ONE_OF_SEVERAL_AT_57A",
    title: "Credit one of several accounts at 57A",
    messageType: "MT202",
    targetMessage: "pacs.009.001.08",
    businessService: "swift.cbprplus.04",
    description:
      "Debit the own account held by the Receiver and credit the selected own account at 57A.",
    controls: ownAccountControls(
      "Own debit account at Receiver",
      "Own credit account at 57A",
    ),
  },
  {
    code: "INITIAL_MT200_201_EQUIVALENCE",
    title: "Initial MT200 / MT201 equivalence",
    messageType: "MT205",
    targetMessage: "pacs.009.001.08",
    businessService: "swift.cbprplus.04",
    description:
      "Apply the prior MT200/201 context without permitting bank identity edits.",
    controls: [
      {
        field: "messageContextId",
        label: "Previous MT200/201 context",
        kind: "MESSAGE_CONTEXT_SELECTOR",
        options: [
          { value: "MT200-2026-INITIAL-001", label: "MT200-2026-INITIAL-001" },
          { value: "MT201-2026-INITIAL-001", label: "MT201-2026-INITIAL-001" },
        ],
      },
      {
        field: "senderIdentity",
        label: "52a Ordering Institution",
        kind: "READ_ONLY_BANK_IDENTITY",
      },
      {
        field: "senderIdentity",
        label: "58a Beneficiary Institution",
        kind: "READ_ONLY_BANK_IDENTITY",
      },
    ],
  },
  {
    code: "NO_MT200_201_EQUIVALENCE",
    title: "MT205 COV — no MT200 / MT201 equivalence",
    messageType: "MT205COV",
    targetMessage: "pacs.009.001.08",
    businessService: "swift.cbprplus.cov.04",
    description:
      "Preserve the previous cover context; do not apply the MT205-only 58a equals 52a rule.",
    controls: [
      {
        field: "messageContextId",
        label: "Previous COV context",
        kind: "MESSAGE_CONTEXT_SELECTOR",
        options: [
          {
            value: "MT205COV-2026-INITIAL-001",
            label: "MT205COV-2026-INITIAL-001",
          },
        ],
      },
      {
        field: "senderIdentity",
        label: "A.52a Ordering Institution",
        kind: "READ_ONLY_BANK_IDENTITY",
      },
      {
        field: "senderIdentity",
        label: "A.58a Beneficiary Institution",
        kind: "READ_ONLY_BANK_IDENTITY",
      },
    ],
  },
] as const;

export function sortPaymentMessageScenarios(
  scenarios: readonly PaymentMessageScenario[],
  direction: "asc" | "desc",
): readonly PaymentMessageScenario[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...scenarios].sort(
    (left, right) =>
      left.title.localeCompare(right.title, undefined, {
        sensitivity: "base",
      }) * multiplier,
  );
}

export function counterpartySsiPaymentScenarios(
  scenarios: readonly PaymentMessageScenario[],
  messageIndex: readonly PaymentMessageIndexItem[],
): readonly PaymentMessageScenario[] {
  const supportedMessages = new Set(
    messageIndex.map((item) => item.messageType),
  );
  return scenarios.filter((scenario) =>
    supportedMessages.has(scenario.messageType),
  );
}

export function paymentMessageForScenario(
  scenario: PaymentMessageScenario,
): PaymentMessageIndexItem {
  return {
    order: 0,
    messageType: scenario.messageType,
    description: scenario.title,
    processingMode: "SINGLE",
    profileStatus: "SCENARIO_PARAMETER_DRIVEN",
    targetMessage: scenario.targetMessage,
    businessService: scenario.businessService,
    selectable: true,
  };
}

export function bankIdentityByServiceId<T extends { bankServiceId: string }>(
  banks: readonly T[],
  bankServiceId: string,
): T | undefined {
  return banks.find((bank) => bank.bankServiceId === bankServiceId);
}
