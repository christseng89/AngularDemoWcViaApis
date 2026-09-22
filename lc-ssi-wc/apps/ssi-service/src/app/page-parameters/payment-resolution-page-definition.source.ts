import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable, Optional } from "@nestjs/common";
import type {
  PageParameterField,
  PageParameterEvidenceReference,
  PaymentCoverScenarioFixedValues,
  PageParameterPolarity,
  PageParameterScenarioFieldPolicy,
  PageParameterValidationRule,
  ResolutionPageDefinition,
  ResolutionPageDefinitionQuery,
  ResolutionPageScenario,
} from "@ssi/contracts";
import { validateResolutionPageDefinition } from "./resolution-page-definition.validator";
import type { ResolutionPageDefinitionSource } from "./resolution-page-definition.source";
import { PaymentGovernedApplicabilityService } from "./payment-governed-applicability.service";
import { PageParameterBusinessDatePolicy } from "./page-parameter-business-date.policy";
import { ResolutionDefinitionOptionsService } from "./resolution-definition-options.service";

const DEFAULT_CATALOGUE = join(
  process.cwd(),
  "parameters",
  "resolution-page-scenarios.mt2-pacs009.sr2026.json",
);
const SOURCE_ARTIFACT =
  "parameters/resolution-page-scenarios.mt2-pacs009.sr2026.json";
const MRG_SHA =
  "64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323";
const ADDITIONAL_NVR_SHA =
  "BDE3874D324C218C88F11F9116E089684106093144E3E143890BAD7368D5DBCB";
const PLAIN_PACS009_SHA =
  "4B9436D21B141C5CEF75ACFFAE961B5130FEAD9B95C1B9CD144197DAA7EA6585";
const COVER_PACS009_SHA =
  "745B302A700C785CAE1E5F630CC906F41DF31C1E5727BF03EF591F0AD1CFA0A1";
const FIXTURE_ARTIFACT =
  "parameters/resolution-page-fixtures.mt2-pacs009.sr2026.json";
const FIXTURE_SHA =
  "1A3E75ED1C2CF49C9297DA7DA8195F432A5C6F8DF3700C3EACDAA152AB2588AF";
const POLARITY_ORDER: Readonly<Record<PageParameterPolarity, number>> = {
  POSITIVE: 0,
  NEGATIVE: 1,
  BOUNDARY: 2,
};
const ALLOWED_MESSAGES = new Set(["MT202", "MT202COV", "MT205", "MT205COV"]);
const NETWORK_NVR_CODES: Readonly<Record<string, readonly string[]>> = {
  MT202: ["C81"],
  MT202COV: ["C81", "C68"],
  MT205: ["C81"],
  MT205COV: ["C81", "C68"],
};
const MRG_PAGES: Readonly<Record<string, readonly number[]>> = {
  MT202: [39, 40, 46, 52, 54],
  MT202COV: [59, 60, 61, 75],
  MT205: [134, 135, 136, 139, 148],
  MT205COV: [153, 154, 155, 168],
};
const ADDITIONAL_NVR_PAGES: Readonly<Record<string, readonly number[]>> = {
  MT202: [4, 5, 14, 15],
  MT202COV: [4, 5, 16, 17, 18, 19],
  MT205: [4, 5, 19, 20],
  MT205COV: [4, 5, 20, 21, 22, 23],
};

interface CatalogueScenario {
  readonly scenarioId: string;
  readonly label: string;
  readonly polarity: PageParameterPolarity;
  readonly audience: ResolutionPageScenario["audience"];
  readonly servicerRelationship: NonNullable<
    ResolutionPageScenario["servicerRelationship"]
  >;
  readonly resolverInputValues?: Readonly<Record<string, string | boolean>>;
}
interface CatalogueDefinition {
  readonly messageType: string;
  readonly businessFunction: string;
  readonly businessService: string;
  readonly governedInputValues?: PaymentCoverScenarioFixedValues;
  readonly scenarios: readonly CatalogueScenario[];
}
interface Catalogue {
  readonly schemaVersion: "1.0";
  readonly catalogueVersion: string;
  readonly standardsRelease: "SR2026";
  readonly messageFamily: "MT2_PACS009";
  readonly definitions: readonly CatalogueDefinition[];
}
export interface PaymentResolutionPageDefinitionSourceOptions {
  readonly cataloguePath?: string;
}

export interface PaymentScenarioPolicy {
  readonly messageType: string;
  readonly scenarioId: string;
  readonly sequenceIds: readonly string[];
  readonly polarity: PageParameterPolarity;
  readonly expectedHttp: readonly number[];
}

const requiredConstraint = (fieldId: string) => ({
  constraintId: `${fieldId}.required`,
  kind: "REQUIRED" as const,
  message: "Required by the governed payment scenario.",
});

const transactionFields = (
  options?: {
    readonly currencies: readonly string[];
    readonly bookingEntities: readonly (
      string | { readonly value: string; readonly label: string }
    )[];
    readonly defaultCurrency?: string;
    readonly defaultBookingEntity?: string;
  },
  defaultValueDate?: string,
  businessDate?: PageParameterField["businessDate"],
  controlledCurrency = false,
): PageParameterField[] => [
  {
    fieldId: "context.transactionReference",
    path: "transactionReference",
    label: "Transaction Reference",
    control: "HIDDEN",
    dataType: "STRING",
    required: true,
    readOnly: true,
    displayOrder: 10,
    section: "VALIDATION_CONTEXT",
    visibility: "HIDDEN_EVIDENCE",
    defaultValue: "MT2-DEMO-REFERENCE",
    columnSpan: 2,
    constraints: [requiredConstraint("transactionReference")],
  },
  {
    fieldId: "context.currency",
    path: "currency",
    label: "Currency",
    control: "SELECT",
    dataType: "ISO_CURRENCY",
    required: true,
    displayOrder: 20,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    ...(options?.defaultCurrency
      ? { defaultValue: options.defaultCurrency }
      : {}),
    ...(options?.currencies.length
      ? {
          options: options.currencies.map((value) => ({ value, label: value })),
        }
      : {}),
    optionSource: {
      source: controlledCurrency
        ? "RESOLUTION_CURRENCY_COVERAGE"
        : "GOVERNED_APPLICABILITY",
      dependsOnFieldIds: [],
      invalidatesFieldIds: ["context.counterpartyBankServiceId"],
      selectionPolicy: "SELECTABLE",
    },
    constraints: [requiredConstraint("currency")],
  },
  {
    fieldId: "context.bookingEntity",
    path: "bookingEntity",
    label: "Booking Entity",
    control: "SELECT",
    dataType: "STRING",
    required: true,
    displayOrder: 30,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    ...(options?.defaultBookingEntity
      ? { defaultValue: options.defaultBookingEntity }
      : {}),
    ...(options?.bookingEntities.length
      ? {
          options: options.bookingEntities.map((entry) =>
            typeof entry === "string" ? { value: entry, label: entry } : entry,
          ),
        }
      : {}),
    optionSource: {
      source: controlledCurrency
        ? "CONTROLLED_ENTITY_REFERENCE"
        : "GOVERNED_APPLICABILITY",
      dependsOnFieldIds: [],
      invalidatesFieldIds: ["context.counterpartyBankServiceId"],
      selectionPolicy: "SELECTABLE",
    },
    constraints: [requiredConstraint("bookingEntity")],
  },
  {
    fieldId: "context.valueDate",
    path: "valueDate",
    label: "Value Date",
    control: "DATE",
    dataType: "DATE",
    required: true,
    displayOrder: 40,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    ...(defaultValueDate ? { defaultValue: defaultValueDate } : {}),
    ...(businessDate ? { businessDate } : {}),
    constraints: [requiredConstraint("valueDate")],
  },
  {
    fieldId: "context.amount",
    path: "amount",
    label: "Amount",
    control: "TEXT",
    dataType: "STRING",
    required: true,
    displayOrder: 50,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    defaultValue: "1000.00",
    columnSpan: 2,
    constraints: [requiredConstraint("amount")],
  },
  {
    fieldId: "context.counterpartyBankServiceId",
    path: "counterpartyBankServiceId",
    label: "Counterparty Bank",
    control: "SELECT",
    dataType: "STRING",
    required: true,
    displayOrder: 45,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    columnSpan: 1,
    lookup: {
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      endpoint:
        "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
      valueField: "bankServiceId",
      displayField: "bic",
      validationField: "bic",
      buttonLabel: "Select Counterparty",
      selectedButtonLabel: "Change",
      dependency: {
        dependsOnFieldIds: [
          "context.currency",
          "context.bookingEntity",
          "context.valueDate",
        ],
        invalidatesFieldIds: [],
        selectionPolicy: "SELECTABLE",
      },
    },
    constraints: [requiredConstraint("counterpartyBankServiceId")],
  },
  {
    fieldId: "context.receiverBankServiceId",
    path: "receiverBankServiceId",
    label: "Counterparty Bank (Receiver Bank)",
    control: "SELECT",
    dataType: "STRING",
    required: true,
    displayOrder: 60,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    lookup: {
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      endpoint:
        "/api/v1/resolution-page-definitions/lookups/own-account-receivers",
      valueField: "bankServiceId",
      displayField: "bic",
      validationField: "bic",
      buttonLabel: "Select Counterparty Bank",
      selectedButtonLabel: "Change",
      dependency: {
        dependsOnFieldIds: [
          "context.currency",
          "context.bookingEntity",
          "context.valueDate",
        ],
        invalidatesFieldIds: [
          "context.ownDebitAccountId",
          "context.ownDebitAccountVersion",
          "context.ownCreditAccountId",
          "context.ownCreditAccountVersion",
        ],
        selectionPolicy: "SELECTABLE",
      },
    },
    constraints: [requiredConstraint("receiverBankServiceId")],
  },
  ...(["Debit", "Credit"] as const).flatMap((side, index) => {
    const idFieldId = `context.own${side}AccountId`;
    const versionFieldId = `context.own${side}AccountVersion`;
    return [
      {
        fieldId: idFieldId,
        path: `own${side}AccountId`,
        label: `Own ${side} Account`,
        control: "SELECT" as const,
        dataType: "ACCOUNT_REFERENCE" as const,
        required: true,
        displayOrder: 70 + index * 20,
        section: "TRANSACTION" as const,
        visibility: "USER_INPUT" as const,
        lookup: {
          provider: "NOSTRO_ACCOUNT" as const,
          action: "NOSTRO_ACCOUNT" as const,
          endpoint:
            "/api/v1/resolution-page-definitions/lookups/nostro-accounts",
          valueField: "nostroId" as const,
          displayField: "displayValue" as const,
          validationField: "nostroId" as const,
          buttonLabel: `Select Own ${side} Account`,
          selectedButtonLabel: "Change",
          targetRole: `OWN_${side.toUpperCase()}_ACCOUNT`,
          companionValueFields: { version: versionFieldId },
          dependency: {
            dependsOnFieldIds: [
              "context.currency",
              "context.bookingEntity",
              "context.valueDate",
              "context.receiverBankServiceId",
              ...(side === "Credit" ? ["context.ownDebitAccountId"] : []),
            ],
            invalidatesFieldIds: [
              versionFieldId,
              ...(side === "Debit"
                ? [
                    "context.ownCreditAccountId",
                    "context.ownCreditAccountVersion",
                  ]
                : []),
            ],
            selectionPolicy: "SELECTABLE" as const,
          },
        },
        constraints: [requiredConstraint(idFieldId)],
      },
      {
        fieldId: versionFieldId,
        path: `own${side}AccountVersion`,
        label: `Own ${side} Account Version`,
        control: "HIDDEN" as const,
        dataType: "STRING" as const,
        required: true,
        readOnly: true,
        displayOrder: 110 + index * 20,
        section: "VALIDATION_CONTEXT" as const,
        visibility: "HIDDEN_EVIDENCE" as const,
        constraints: [requiredConstraint(versionFieldId)],
      },
    ];
  }),
];

const settlementField = (
  tag: string,
  option: string,
  role: string,
  order: number,
  sequenceId = "A",
): PageParameterField => ({
  fieldId: `sequence.${sequenceId}.tag${tag}${option}.${role.toLowerCase()}`,
  path: `sequences.${sequenceId}.tag${tag}${option}`,
  label: `SWIFT ${tag}${option} • ${role.replaceAll("_", " ")}`,
  control: "HIDDEN",
  dataType: option === "A" ? "SWIFT_BIC" : "STRING",
  required: false,
  readOnly: true,
  displayOrder: order,
  section: "SETTLEMENT_INSTRUCTIONS",
  visibility: "HIDDEN_EVIDENCE",
  ...(option === "A"
    ? {
        lookup: {
          provider: "BANK_SERVICE" as const,
          action: "BANK_SERVICE" as const,
          endpoint: "/api/v1/resolution-page-definitions/lookups/bank-services",
          valueField: "bankServiceId" as const,
          displayField: "bic" as const,
          validationField: "bic" as const,
          targetRole: role,
        },
      }
    : {}),
  constraints: [],
  sequenceId,
  settlementLeg: sequenceId === "B" ? "UNDERLYING_CUSTOMER" : "INSTITUTIONAL",
  swiftTag: tag,
  swiftOption: option,
  officialRole: role,
});

const governedContextField = (
  tag: string,
  option: string,
  label: string,
  order: number,
  defaultValue?: string,
): PageParameterField => ({
  fieldId: `context.swift${tag}${option}`,
  path: `messageContext.tag${tag}${option}`,
  label,
  control: "HIDDEN",
  dataType: "STRING",
  required: true,
  readOnly: true,
  ...(defaultValue ? { defaultValue } : {}),
  displayOrder: order,
  section: "VALIDATION_CONTEXT",
  visibility: "HIDDEN_EVIDENCE",
  constraints: [requiredConstraint(`swift${tag}${option}`)],
  swiftTag: tag,
  swiftOption: option,
  officialRole: label,
});

const settlementFields = (messageType: string): PageParameterField[] => {
  const fields: PageParameterField[] = [];
  const add = (
    tag: string,
    options: readonly string[],
    role: string,
    sequence = "A",
  ) =>
    options.forEach((option) =>
      fields.push(
        settlementField(tag, option, role, 200 + fields.length, sequence),
      ),
    );
  add("52", ["A", "D"], "ORDERING_INSTITUTION");
  add("53", ["A", "B", "D"], "SENDERS_CORRESPONDENT");
  if (!messageType.startsWith("MT205"))
    add("54", ["A", "D"], "RECEIVERS_CORRESPONDENT");
  add("56", ["A", "D"], "INTERMEDIARY_INSTITUTION");
  add("57", ["A", "D"], "ACCOUNT_WITH_INSTITUTION");
  add("58", ["A", "D"], "BENEFICIARY_INSTITUTION");
  if (messageType.endsWith("COV")) {
    add("50", ["A", "F", "K"], "UNDERLYING_ORDERING_CUSTOMER", "B");
    add("52", ["A", "D"], "UNDERLYING_ORDERING_INSTITUTION", "B");
    add("56", ["A", "D"], "UNDERLYING_INTERMEDIARY_INSTITUTION", "B");
    add("57", ["A", "D"], "UNDERLYING_ACCOUNT_WITH_INSTITUTION", "B");
    add("59", ["NONE", "A", "F"], "UNDERLYING_BENEFICIARY_CUSTOMER", "B");
  }
  return fields;
};

const validationContextFields = (
  messageType: string,
): PageParameterField[] => {
  if (messageType === "MT205") {
    return [
        {
          fieldId: "context.previousMessageType",
          path: "previousMessage.type",
          label: "Actual previous FI message type",
          control: "TEXT",
          dataType: "STRING",
          required: false,
          displayOrder: 70,
          section: "VALIDATION_CONTEXT",
          visibility: "HIDDEN_EVIDENCE",
          readOnly: true,
          options: ["MT202", "MT203", "MT205"].map((type) => ({
            value: type,
            label: type,
          })),
          constraints: [],
        },
    ];
  }
  if (!messageType.endsWith("COV")) return [];
  return [
          governedContextField(
            "21",
            "NONE",
            "SWIFT 21 • Related Reference",
            60,
          ),
          governedContextField(
            "119",
            "NONE",
            "SWIFT Header 119 • COV",
            61,
            "COV",
          ),
          governedContextField("121", "NONE", "SWIFT Header 121 • UETR", 62),
          {
            fieldId: "context.sequenceB50A",
            path: "cover.sequenceB.tag50A",
            label: "SWIFT B50A • Underlying Ordering Customer",
            control: "TEXT",
            dataType: "STRING",
            required: true,
            displayOrder: 64,
            section: "VALIDATION_CONTEXT",
            visibility: "USER_INPUT",
            constraints: [requiredConstraint("sequenceB50A")],
          },
          {
            fieldId: "context.sequenceB59",
            path: "cover.sequenceB.tag59",
            label: "SWIFT B59 • Underlying Beneficiary Customer",
            control: "TEXT",
            dataType: "STRING",
            required: true,
            displayOrder: 65,
            section: "VALIDATION_CONTEXT",
            visibility: "USER_INPUT",
            constraints: [requiredConstraint("sequenceB59")],
          },
          ...(messageType === "MT205COV"
            ? [
                userContextField(
                  "previousMessageType",
                  "previousMessage.type",
                  "Previous cover message type",
                  70,
                ),
                userContextField(
                  "previousMessage20",
                  "previousMessage.tag20",
                  "Previous SWIFT 20",
                  71,
                ),
                userContextField(
                  "previousMessage21",
                  "previousMessage.tag21",
                  "Previous SWIFT 21",
                  72,
                ),
                userContextField(
                  "previousMessage121",
                  "previousMessage.header121",
                  "Previous SWIFT Header 121",
                  73,
                ),
                userContextField(
                  "previousMessageA52",
                  "previousMessage.sequenceA.tag52",
                  "Previous SWIFT A52",
                  74,
                ),
                userContextField(
                  "previousMessageA58",
                  "previousMessage.sequenceA.tag58",
                  "Previous SWIFT A58",
                  75,
                ),
                userContextField(
                  "previousMessageSequenceB50A",
                  "previousMessage.sequenceB.tag50A",
                  "Previous SWIFT B50A",
                  76,
                ),
                userContextField(
                  "previousMessageSequenceB59",
                  "previousMessage.sequenceB.tag59",
                  "Previous SWIFT B59",
                  77,
                ),
                userContextField(
                  "previousMessageArtifactSha256",
                  "previousMessage.provenance.sha256",
                  "Previous message artifact SHA-256",
                  78,
                ),
                userContextField(
                  "previousMessageArtifactVersion",
                  "previousMessage.provenance.version",
                  "Previous message artifact version",
                  79,
                ),
              ]
            : []),
  ];
};

function userContextField(
  suffix: string,
  path: string,
  label: string,
  displayOrder: number,
): PageParameterField {
  return {
    fieldId: `context.${suffix}`,
    path,
    label,
    control: "TEXT",
    dataType: "STRING",
    required: true,
    displayOrder,
    section: "VALIDATION_CONTEXT",
    visibility: "USER_INPUT",
    constraints: [requiredConstraint(suffix)],
  };
}

const hiddenEvidencePolicy = (
  fieldId: string,
  values: Pick<
    PageParameterScenarioFieldPolicy,
    "applicability" | "inputOwnership" | "processingPolicy" | "required"
  >,
): PageParameterScenarioFieldPolicy => ({
  fieldId,
  ...values,
  visibility: "HIDDEN_EVIDENCE",
  readOnly: true,
});

const previousMessageTypePolicy = (
  fieldId: string,
  scenarioId: string,
): PageParameterScenarioFieldPolicy | undefined => {
  if (
    fieldId !== "context.previousMessageType" ||
    !scenarioId.startsWith("MT205-")
  )
    return undefined;
  return scenarioId === "MT205-OP-STANDARD-DOMESTIC-ONWARD"
    ? hiddenEvidencePolicy(fieldId, {
        applicability: "APPLICABLE",
        inputOwnership: "TRANSACTION_CONTEXT",
        processingPolicy: "APPLY",
        required: false,
      })
    : hiddenEvidencePolicy(fieldId, {
        applicability: "NOT_APPLICABLE",
        inputOwnership: "SSI_DERIVED",
        processingPolicy: "IGNORE_AUDIT",
        required: false,
      });
};

const ownAccountPolicy = (
  fieldId: string,
  scenarioId: string,
): PageParameterScenarioFieldPolicy | undefined => {
  const ownAccountScenario =
    scenarioId.endsWith("-OP-BOOK") || scenarioId.endsWith("-OP-CREDIT-57A");
  const ownAccountField =
    fieldId === "context.receiverBankServiceId" ||
    fieldId.includes("ownDebitAccount") ||
    fieldId.includes("ownCreditAccount");
  if (
    (ownAccountField && !ownAccountScenario) ||
    (fieldId === "context.counterpartyBankServiceId" && ownAccountScenario)
  )
    return hiddenEvidencePolicy(fieldId, {
      applicability: "NOT_APPLICABLE",
      inputOwnership: "SSI_DERIVED",
      processingPolicy: "IGNORE_AUDIT",
      required: false,
    });
  const governedOwnAccountOutput =
    ownAccountScenario &&
    (fieldId.includes("ownDebitAccount") ||
      fieldId.includes("ownCreditAccount"));
  if (governedOwnAccountOutput)
    return hiddenEvidencePolicy(fieldId, {
      applicability: "APPLICABLE",
      inputOwnership: "SSI_DERIVED",
      processingPolicy: "APPLY",
      required: false,
    });
  return undefined;
};

const inputOwnershipFor = (
  transaction: boolean,
  derivedContext: boolean,
  fixedContext: boolean,
  scenarioFixed: boolean,
): PageParameterScenarioFieldPolicy["inputOwnership"] => {
  if (transaction) return "TRANSACTION_USER";
  if (fixedContext || (!derivedContext && scenarioFixed))
    return "SCENARIO_FIXED";
  return derivedContext ? "TRANSACTION_USER" : "SSI_DERIVED";
};

const fieldPolicy = (
  field: PageParameterField,
  scenarioInputValues: Readonly<Record<string, string | boolean>>,
  scenarioId: string,
): PageParameterScenarioFieldPolicy => {
  const previousMessagePolicy = previousMessageTypePolicy(
    field.fieldId,
    scenarioId,
  );
  if (previousMessagePolicy) return previousMessagePolicy;
  if (field.fieldId === "context.transactionReference")
    return hiddenEvidencePolicy(field.fieldId, {
      applicability: "APPLICABLE",
      inputOwnership: "SCENARIO_FIXED",
      processingPolicy: "APPLY",
      required: true,
    });
  const governedOwnAccountPolicy = ownAccountPolicy(field.fieldId, scenarioId);
  if (governedOwnAccountPolicy) return governedOwnAccountPolicy;
  const transaction = field.section === "TRANSACTION";
  const derivedContext = field.section === "VALIDATION_CONTEXT";
  const fixedContext =
    derivedContext &&
    (field.defaultValue !== undefined ||
      Object.hasOwn(scenarioInputValues, field.fieldId));
  const scenarioFixed =
    field.sequenceId === "B" ||
    (field.section !== "SETTLEMENT_INSTRUCTIONS" && field.readOnly === true);
  const inputOwnership = inputOwnershipFor(
    transaction,
    derivedContext,
    fixedContext,
    scenarioFixed,
  );
  const userInput = transaction || (derivedContext && !fixedContext);
  return {
    fieldId: field.fieldId,
    applicability: "APPLICABLE",
    inputOwnership,
    visibility: userInput ? "USER_INPUT" : "HIDDEN_EVIDENCE",
    processingPolicy: "APPLY",
    required: field.required,
    readOnly: !userInput || fixedContext,
  };
};

const scenarioFlowKind = (
  polarity: PageParameterPolarity,
): ResolutionPageScenario["flowKind"] =>
  polarity === "POSITIVE" ? "CORE_SSI" : "NEGATIVE_BOUNDARY";

const scenarioIsolation = (
  polarity: PageParameterPolarity,
): ResolutionPageScenario["fixture"]["isolation"] => {
  if (polarity === "POSITIVE") return "CANONICAL";
  if (polarity === "NEGATIVE") return "TRANSACTIONAL_NEGATIVE";
  return "BOUNDARY";
};

const scenarioExecution = (
  polarity: PageParameterPolarity,
): ResolutionPageScenario["execution"] => ({
  action: "RESOLVE_SSI",
  owner: "SSI_FIELD_RESOLUTION_API",
  endpoint: "/api/v1/resolution-page-definitions/execute",
  method: "POST",
  expectedHttp: polarity === "POSITIVE" ? [200] : [200, 409, 422],
});

const sequenceLabel = (sequenceId: string): string =>
  sequenceId === "A"
    ? "Financial Institution Transfer"
    : "Underlying Customer Transfer";

const settlementLeg = (sequenceId: string): string =>
  sequenceId === "A" ? "INSTITUTIONAL" : "UNDERLYING_CUSTOMER";

const baseNvrRuleId = (messageType: string, code: string): string =>
  `${messageType}-MRG-${code}`;
const validationRules = (
  messageType: string,
  fields: readonly PageParameterField[],
): readonly PageParameterValidationRule[] => {
  const mrgRules = NETWORK_NVR_CODES[messageType]!.map(
    (code): PageParameterValidationRule => ({
      ruleId: baseNvrRuleId(messageType, code),
      taxonomy: "NETWORK_VALIDATED_RULE",
      owner: "SSI_FIELD_RESOLUTION_API",
      validationScope: "IN_SCOPE_SSI_TAG_NVR",
      appliesToFieldIds: fields
        .filter(
          ({ sequenceId, swiftTag }) =>
            sequenceId === (code === "C68" ? "B" : "A") &&
            ["56", "57"].includes(swiftTag ?? ""),
        )
        .map(({ fieldId }) => fieldId),
      reasonCode: code,
      evidenceIds: [`MRG-${messageType}`],
    }),
  );
  return mrgRules;
};

const normativeEvidence = (
  messageType: string,
): readonly PageParameterEvidenceReference[] => {
  const cover = messageType.endsWith("COV");
  const usageGuideline = cover
    ? "SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260521_0643.pdf"
    : "SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_FinancialInstitutionCreditTransfer_20260521_0643.pdf";
  return [
    {
      evidenceId: `MRG-${messageType}`,
      classification: "NORMATIVE_RULE",
      artifactId: "SWIFT/us2m_20260717.pdf",
      artifactSha256: MRG_SHA,
      pages: MRG_PAGES[messageType]!,
    },
    {
      evidenceId: `PACS009-USAGE-${messageType}`,
      classification: "NORMATIVE_RULE",
      artifactId: usageGuideline,
      artifactSha256: cover ? COVER_PACS009_SHA : PLAIN_PACS009_SHA,
    },
    {
      evidenceId: `CONTINGENCY-NVR-${messageType}`,
      classification: "NORMATIVE_RULE",
      artifactId:
        "SWIFT/SR2026_Contingency_Processing_Network_Validated_Rules_20260717_v1_0.pdf",
      artifactSha256: ADDITIONAL_NVR_SHA,
      pages: ADDITIONAL_NVR_PAGES[messageType]!,
    },
  ];
};

@Injectable()
export class PaymentResolutionPageDefinitionSource implements ResolutionPageDefinitionSource {
  private readonly cataloguePath: string;

  constructor(
    @Optional() options?: PaymentResolutionPageDefinitionSourceOptions,
    @Optional()
    private readonly governedOptions?: PaymentGovernedApplicabilityService,
    @Optional()
    private readonly businessDates?: PageParameterBusinessDatePolicy,
    @Optional()
    private readonly definitionOptions?: ResolutionDefinitionOptionsService,
  ) {
    this.cataloguePath = options?.cataloguePath ?? DEFAULT_CATALOGUE;
  }

  coverageProfiles(): readonly {
    readonly messageType: string;
    readonly businessService: string;
  }[] {
    return this.load().catalogue.definitions.map(
      ({ messageType, businessService }) => ({
        messageType,
        businessService,
      }),
    );
  }

  scenarioPolicy(
    messageType: string,
    scenarioId: string,
  ): PaymentScenarioPolicy | undefined {
    const configured = this.load().catalogue.definitions.find(
      (definition) => definition.messageType === messageType,
    );
    const scenario = configured?.scenarios.find(
      (candidate) => candidate.scenarioId === scenarioId,
    );
    if (!configured || !scenario) return undefined;
    return {
      messageType,
      scenarioId,
      sequenceIds: messageType.endsWith("COV") ? ["A", "B"] : ["A"],
      polarity: scenario.polarity,
      expectedHttp: scenarioExecution(scenario.polarity).expectedHttp,
    };
  }

  all(standardsRelease?: string): readonly ResolutionPageDefinition[] {
    if (standardsRelease && standardsRelease !== "SR2026") return [];
    const { catalogue, sourceSha256 } = this.load();
    return catalogue.definitions.map((configured) =>
      this.definition(catalogue, configured, sourceSha256),
    );
  }

  find(
    query: ResolutionPageDefinitionQuery,
  ): readonly ResolutionPageDefinition[] {
    return this.all(query.standardsRelease).filter(
      (definition) =>
        definition.messageFamily === query.messageFamily &&
        definition.messageType === query.messageType &&
        definition.direction === query.direction &&
        (!query.businessDomain ||
          definition.businessDomain === query.businessDomain) &&
        (!query.businessService ||
          definition.profile.businessService === query.businessService) &&
        (!query.businessScenarioId ||
          definition.profile.selectionBasis.businessScenarioId ===
            query.businessScenarioId),
    );
  }

  private load(): { catalogue: Catalogue; sourceSha256: string } {
    let raw: Buffer;
    try {
      raw = readFileSync(this.cataloguePath);
    } catch {
      throw new Error("PAYMENT_PAGE_DEFINITION_SOURCE_INVALID");
    }
    let catalogue: Catalogue;
    try {
      catalogue = JSON.parse(raw.toString("utf8")) as Catalogue;
    } catch {
      throw new Error("PAYMENT_PAGE_DEFINITION_CATALOGUE_INVALID");
    }
    if (
      catalogue.schemaVersion !== "1.0" ||
      catalogue.standardsRelease !== "SR2026" ||
      catalogue.messageFamily !== "MT2_PACS009" ||
      !catalogue.catalogueVersion?.trim() ||
      !Array.isArray(catalogue.definitions) ||
      catalogue.definitions.length !== 4 ||
      catalogue.definitions.some(
        (definition) =>
          !ALLOWED_MESSAGES.has(definition.messageType) ||
          !definition.businessFunction?.trim() ||
          !definition.businessService?.trim() ||
          !Array.isArray(definition.scenarios) ||
          !definition.scenarios.length,
      ) ||
      new Set(catalogue.definitions.map(({ messageType }) => messageType))
        .size !== 4
    )
      throw new Error("PAYMENT_PAGE_DEFINITION_CATALOGUE_INVALID");
    return {
      catalogue,
      sourceSha256: createHash("sha256")
        .update(raw)
        .digest("hex")
        .toUpperCase(),
    };
  }

  private definition(
    catalogue: Catalogue,
    configured: CatalogueDefinition,
    sourceSha256: string,
  ): ResolutionPageDefinition {
    const businessDatePolicy =
      this.businessDates ?? new PageParameterBusinessDatePolicy();
    const defaultValueDate = businessDatePolicy.firstAvailableDate();
    const fields = [
      ...transactionFields(
        this.definitionOptions
          ? this.definitionOptions.payment(
              configured.messageType,
              defaultValueDate,
            )
          : this.governedOptions?.options(
              configured.messageType,
              defaultValueDate,
            ),
        defaultValueDate,
        businessDatePolicy.metadata(),
        Boolean(this.definitionOptions),
      ),
      ...validationContextFields(configured.messageType),
      ...settlementFields(configured.messageType),
    ];
    const sequenceIds = configured.messageType.endsWith("COV")
      ? ["A", "B"]
      : ["A"];
    const scenarios = configured.scenarios
      .map((scenario): ResolutionPageScenario => {
        const inputValues = {
          ...configured.governedInputValues,
          ...scenario.resolverInputValues,
          "context.transactionReference": `PAYMENT-${scenario.scenarioId}`,
          ...(configured.messageType.endsWith("COV")
            ? { "context.swift119NONE": "COV" }
            : {}),
        };
        return {
          ...scenario,
          flowKind: scenarioFlowKind(scenario.polarity),
          sequenceIds,
          fieldIds: fields.map(({ fieldId }) => fieldId),
          fieldPolicies: fields.map((field) =>
            fieldPolicy(field, inputValues, scenario.scenarioId),
          ),
          validationRuleIds: validationRules(
            configured.messageType,
            fields,
          ).map(({ ruleId }) => ruleId),
          validation: {
            owner: "SSI_FIELD_RESOLUTION_API",
            taxonomy: "NETWORK_VALIDATED_RULE",
            nvrOutcome: scenario.polarity === "NEGATIVE" ? "FAIL" : "PASS",
            dispositions: [
              {
                validationScope: "IN_SCOPE_SSI_TAG_NVR",
                owner: "SSI_FIELD_RESOLUTION_API",
                taxonomy: "NETWORK_VALIDATED_RULE",
                expectedOutcome:
                  scenario.polarity === "NEGATIVE" ? "FAIL" : "PASS",
                ruleIds: validationRules(configured.messageType, fields).map(
                  ({ ruleId }) => ruleId,
                ),
              },
            ],
          },
          fixture: {
            bindingId: `FIXTURE-${scenario.scenarioId}`,
            fixtureSet: FIXTURE_ARTIFACT,
            fixtureVersion: "2026.09.15-task4-ssi-scope",
            sourceSha256: FIXTURE_SHA,
            isolation: scenarioIsolation(scenario.polarity),
          },
          execution: scenarioExecution(scenario.polarity),
          inputValues,
        };
      })
      .sort(
        (left, right) =>
          POLARITY_ORDER[left.polarity] - POLARITY_ORDER[right.polarity] ||
          left.label.localeCompare(right.label),
      );
    const primaryScenario = scenarios.at(0);
    if (!primaryScenario)
      throw new Error("PAYMENT_PAGE_DEFINITION_CATALOGUE_INVALID");
    const definition: ResolutionPageDefinition = {
      schemaVersion: "1.0",
      definitionId: `PAYMENT-${configured.messageType}-SR2026`,
      definitionVersion: catalogue.catalogueVersion,
      source: {
        catalogueVersion: catalogue.catalogueVersion,
        sourceArtifactId: SOURCE_ARTIFACT,
        sourceSha256,
      },
      standardsRelease: catalogue.standardsRelease,
      messageFamily: catalogue.messageFamily,
      messageType: configured.messageType,
      businessDomain: "PAYMENT",
      direction: "OUTGOING",
      businessFunction: configured.businessFunction,
      title: `${configured.messageType} Message`,
      description: `Governed ${configured.messageType} to pacs.009 reference parameters.`,
      display: {
        familyCode: "MT2",
        familyLabel: "MT2 / pacs.009",
        categoryCode: "PAYMENT",
        categoryLabel: "Payment",
      },
      profile: {
        profileId: `PACS009-${configured.messageType}-SR2026`,
        profileKind: "MT_TO_MX",
        businessService: configured.businessService,
        messageDefinitionId: "pacs.009.001.08",
        paymentExecutable: true,
        selectionBasis: {
          businessScenarioId: primaryScenario.scenarioId,
          businessService: configured.businessService,
        },
      },
      sequences: sequenceIds.map((sequenceId) => ({
        sequenceId,
        label: sequenceLabel(sequenceId),
        settlementLeg: settlementLeg(sequenceId),
        fieldIds: fields
          .filter((field) => field.sequenceId === sequenceId)
          .map(({ fieldId }) => fieldId),
      })),
      fields,
      scenarios,
      validationRules: validationRules(configured.messageType, fields),
      evidence: normativeEvidence(configured.messageType),
    };
    validateResolutionPageDefinition(definition, {
      standardsRelease: definition.standardsRelease,
      messageFamily: definition.messageFamily,
      messageType: definition.messageType,
      direction: definition.direction,
      businessDomain: definition.businessDomain,
      businessScenarioId: definition.profile.selectionBasis.businessScenarioId,
      businessService: configured.businessService,
    });
    return definition;
  }
}
