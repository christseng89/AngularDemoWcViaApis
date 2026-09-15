import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  PageParameterField,
  PageParameterPolarity,
  ResolutionPageScenario,
} from "@ssi/contracts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PageParameterEnvironmentPolicy } from "./page-parameter-environment.policy";
import { BankServiceDirectory } from "../bank-service-directory";
import { scalarText } from "../scalar-text";

export type CrossTagOperator =
  "PRESENT" | "ABSENT" | "EQUALS" | "NOT_EQUALS" | "ONE_OF" | "REQUIRES";

export interface ResolutionPageCrossTagConstraint {
  readonly constraintId: string;
  readonly scenarioId: string;
  readonly operator: CrossTagOperator;
  readonly fieldId: string;
  readonly comparedFieldId?: string;
  readonly value?: string | boolean;
  readonly values?: readonly (string | boolean)[];
  readonly reasonCode: string;
  readonly sourceTaxonomy: "NETWORK_VALIDATED_RULE" | "FIELD_USAGE_RULE";
  readonly validationOwner:
    "SSI_FIELD_RESOLUTION_API" | "UPSTREAM_FIN_VALIDATOR";
  readonly expression?: ResolutionPageCrossTagExpression;
}

export interface ResolutionPageCrossTagExpression {
  readonly operator: CrossTagOperator;
  readonly field?: string;
  readonly value?: string | number | boolean;
  readonly values?: readonly (string | number | boolean)[];
  readonly when?: ResolutionPageCrossTagExpression;
  readonly then?: readonly ResolutionPageCrossTagExpression[];
  readonly alternatives?: readonly ResolutionPageCrossTagExpression[];
  readonly all?: readonly ResolutionPageCrossTagExpression[];
}

export interface ResolutionPageConfiguredScenario {
  readonly scenarioId: string;
  readonly testCaseId: string;
  readonly profileId: string;
  readonly label: string;
  readonly polarity: PageParameterPolarity;
  readonly audience: ResolutionPageScenario["audience"];
  readonly flowKind: ResolutionPageScenario["flowKind"];
  readonly fixtureBindingId: string;
  readonly expectedHttp: readonly number[];
  readonly inputValues?: Readonly<Record<string, string | boolean>>;
  readonly fieldOptions?: Readonly<Record<string, string>>;
  readonly reasonCode?: string;
}

export interface ResolutionPageScenarioDefinition {
  readonly profileId: string;
  readonly messageType: string;
  readonly businessFunction: string;
  readonly sequence: string;
  readonly settlementLeg: string;
}

export interface ResolutionPageScenarioCatalogue {
  readonly schemaVersion: "1.0";
  readonly catalogueVersion: string;
  readonly standardsRelease: "SR2026";
  readonly messageFamily: "MT347";
  readonly definitions: readonly ResolutionPageScenarioDefinition[];
  readonly scenarios: readonly ResolutionPageConfiguredScenario[];
  readonly inputs: readonly {
    readonly profileId: string;
    readonly field: PageParameterField;
  }[];
  readonly crossTagConstraints: readonly ResolutionPageCrossTagConstraint[];
  readonly sourceArtifactId: string;
  readonly sourceArtifactSha256: string;
}

export interface ResolutionPageScenarioCatalogueSource {
  readonly path: string;
  readonly sourceArtifactId: string;
}

export const RESOLUTION_PAGE_SCENARIO_CATALOGUE_SOURCE = Symbol(
  "RESOLUTION_PAGE_SCENARIO_CATALOGUE_SOURCE",
);

const OPERATORS = new Set<CrossTagOperator>([
  "PRESENT",
  "ABSENT",
  "EQUALS",
  "NOT_EQUALS",
  "ONE_OF",
  "REQUIRES",
]);
const hasText = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value.trim());
const humanInputLabel = (key: string): string =>
  key
    .replace(/BankServiceId$/, "")
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const unique = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const FIELD_LABELS: Readonly<Record<string, string>> = {
  currency: "Currency",
  bookingEntity: "Booking Entity",
  route: "Settlement Route",
  counterpartyBankServiceId: "Counterparty Bank",
  settlementMode: "Settlement Mode",
  paymentBlockCount: "Payment Block Count",
  conflictVariant: "Conflict Variant",
  receiverDirectlyServicesBeneficiaryBranchAccount:
    "Receiver directly services beneficiary branch account",
};

const fieldDataType = (
  value: string,
): NonNullable<PageParameterField["dataType"]> => {
  const supported = new Set([
    "BOOLEAN",
    "ISO_CURRENCY",
    "SWIFT_PARTY_IDENTIFIER",
    "ACCOUNT_REFERENCE",
  ]);
  return supported.has(value)
    ? (value as NonNullable<PageParameterField["dataType"]>)
    : "STRING";
};

const configuredControl = (
  bankService: boolean,
  dataType: NonNullable<PageParameterField["dataType"]>,
  allowed: readonly string[] | undefined,
): NonNullable<PageParameterField["control"]> => {
  if (bankService || allowed) return "SELECT";
  return dataType === "BOOLEAN" ? "CHECKBOX" : "TEXT";
};

const configuredPath = (
  key: string,
  dataType: string,
  supplementalRole: string | undefined,
): string => {
  if (supplementalRole) {
    const root =
      dataType === "ACCOUNT_REFERENCE"
        ? "roleAccountReferences"
        : "rolePartyIdentifiers";
    return `${root}.${supplementalRole}`;
  }
  return key === "counterpartyBankServiceId"
    ? "transactionContext.counterpartyBankServiceId"
    : `validationContext.${key}`;
};

const configuredLabel = (
  key: string,
  dataType: string,
  bankService: boolean,
  role: string | undefined,
  supplementalRole: string | undefined,
): string => {
  if (role)
    return `${key
      .replace(/BankServiceId$/, "")
      .replace(/([A-Z])/g, " $1")
      .trim()} bank`;
  if (supplementalRole) {
    const prefix = humanInputLabel(supplementalRole);
    const suffix =
      dataType === "ACCOUNT_REFERENCE"
        ? "Account Reference"
        : "Party Identifier";
    return `${prefix} ${suffix}`;
  }
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (key.startsWith("tag."))
    return `${key.replace("tag.", "Field ").replace(".present", "")} present (test context)`;
  return bankService ? `${humanInputLabel(key)} Bank` : humanInputLabel(key);
};

const configuredDisplayOrder = (
  key: string,
  testOnly: boolean,
  supplementalRole: string | undefined,
  inputCount: number,
): number => {
  if (testOnly) return 900 + inputCount;
  if (supplementalRole) {
    const offsets: Readonly<Record<string, number>> = {
      SENDERS_CORRESPONDENT: 3,
      INTERMEDIARY: 6,
      ACCOUNT_WITH_INSTITUTION: 7,
      BENEFICIARY_BANK: 8,
      BENEFICIARY_INSTITUTION: 8,
    };
    return 150 + (offsets[supplementalRole] ?? 9);
  }
  return key === "route" ? 50 : 60 + inputCount;
};

const configuredSection = (
  testOnly: boolean,
  role: string | undefined,
  supplementalRole: string | undefined,
): NonNullable<PageParameterField["section"]> => {
  if (testOnly) return "VALIDATION_CONTEXT";
  return role || supplementalRole ? "SETTLEMENT_INSTRUCTIONS" : "TRANSACTION";
};

const configuredHelp = (
  key: string,
  testOnly: boolean,
  bankService: boolean,
  supplementalRole: string | undefined,
): string => {
  if (testOnly)
    return "Controlled negative-test context supplied by the API; hidden in ordinary positive UAT.";
  if (supplementalRole)
    return "Enter the governed Party Identifier or account reference rendered with the selected institution.";
  if (key === "counterpartyBankServiceId")
    return "Select the governed message/deal counterparty used to resolve SSI. This is not FIN field 57a.";
  if (bankService)
    return "Choose a governed Bank Service; its stable ID is submitted and BIC is displayed.";
  return "Governed by the selected controlled scenario.";
};

const configuredDefault = (
  value: unknown,
): Pick<PageParameterField, "defaultValue"> | object => {
  if (typeof value === "boolean") return { defaultValue: value };
  return value === undefined ? {} : { defaultValue: scalarText(value) };
};

const governedScenarioReasonCode = (value: unknown): string => {
  const text = scalarText(value, "VALIDATION_REJECTED").trim();
  return (
    /\bexact API code\s+([A-Z][A-Z0-9_-]*)/i.exec(text)?.[1] ??
    /^[A-Z][A-Z0-9_-]*/.exec(text)?.[0] ??
    "VALIDATION_REJECTED"
  );
};

const scenarioPresentation = (
  scenario: Readonly<Record<string, unknown>>,
): Pick<ResolutionPageConfiguredScenario, "audience" | "flowKind"> => {
  const polarity = String(scenario["polarity"]);
  const outcome = scalarText(
    (scenario["expected"] as Record<string, unknown> | undefined)?.[
      "statusOrError"
    ] ?? "",
  );
  const label = scalarText(scenario["businessScenario"]).toUpperCase();
  if (polarity !== "POSITIVE")
    return { audience: "QA_TEST_ONLY", flowKind: "NEGATIVE_BOUNDARY" };
  if (outcome.includes("NOT_REQUIRED") || outcome.includes("NO_ELIGIBLE_SSI"))
    return { audience: "QA_TEST_ONLY", flowKind: "NO_ROUTE" };
  if (label.includes("FIDELITY") || label.includes("NO CROSS-MESSAGE"))
    return { audience: "QA_TEST_ONLY", flowKind: "HYBRID" };
  if (label.includes("REIMBURSING BANK ROUTE"))
    return { audience: "OPERATIONAL", flowKind: "TRANSACTION_CONTEXT" };
  if (
    label.includes("BRANCH/AFFILIATE") ||
    label.includes("MULTIPLE DIRECT-ACCOUNT") ||
    label.includes("ACCOUNT-WITH ROUTE")
  )
    return { audience: "OPERATIONAL", flowKind: "HYBRID" };
  return { audience: "OPERATIONAL", flowKind: "CORE_SSI" };
};

@Injectable()
export class ResolutionPageScenarioCatalogueService {
  private readonly catalogue: ResolutionPageScenarioCatalogue;

  constructor(
    private readonly environment: PageParameterEnvironmentPolicy,
    @Optional()
    @Inject(RESOLUTION_PAGE_SCENARIO_CATALOGUE_SOURCE)
    source?: ResolutionPageScenarioCatalogueSource,
  ) {
    const selected = source ?? {
      path: join(
        process.cwd(),
        "parameters",
        "resolution-page-scenarios.sr2026.json",
      ),
      sourceArtifactId: "parameters/resolution-page-scenarios.sr2026.json",
    };
    this.catalogue = this.load(selected);
  }

  get(): ResolutionPageScenarioCatalogue {
    if (this.environment.exposesControlledTestScenarios())
      return this.catalogue;
    return {
      ...this.catalogue,
      scenarios: this.catalogue.scenarios.filter(
        ({ polarity }) => polarity === "POSITIVE",
      ),
      crossTagConstraints: this.catalogue.crossTagConstraints.filter(
        ({ scenarioId }) =>
          this.catalogue.scenarios.some(
            (scenario) =>
              scenario.scenarioId === scenarioId &&
              scenario.polarity === "POSITIVE",
          ),
      ),
    };
  }

  constraintsFor(
    scenarioId: string,
  ): readonly ResolutionPageCrossTagConstraint[] {
    return this.get().crossTagConstraints.filter(
      (item) =>
        item.scenarioId === scenarioId &&
        item.validationOwner === "SSI_FIELD_RESOLUTION_API",
    );
  }

  fieldOptionsFor(scenarioId: string): Readonly<Record<string, string>> {
    return (
      this.get().scenarios.find(
        (scenario) => scenario.scenarioId === scenarioId,
      )?.fieldOptions ?? {}
    );
  }

  private load(
    source: ResolutionPageScenarioCatalogueSource,
  ): ResolutionPageScenarioCatalogue {
    let parsed: unknown;
    let bytes: Buffer;
    try {
      bytes = readFileSync(source.path);
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new BadRequestException({
        code: "PAGE_SCENARIO_CATALOGUE_LOAD_FAILED",
      });
    }
    const normalized = this.normalize(parsed);
    if (!normalized || !this.valid(normalized))
      throw new BadRequestException({
        code: "PAGE_SCENARIO_CATALOGUE_INVALID",
      });
    return Object.freeze({
      ...normalized,
      sourceArtifactId: source.sourceArtifactId,
      sourceArtifactSha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  private normalize(value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    const raw = value as Record<string, unknown>;
    if (raw["schemaVersion"] === "1.0") return this.normalizeCurrent(raw);
    if (raw["documentId"] !== "MT347-SR2026-RESOLUTION-PAGE-SCENARIOS")
      return value;
    return this.normalizeLegacy(raw);
  }

  private normalizeCurrent(raw: Record<string, unknown>): unknown {
    const scenarios = Array.isArray(raw["scenarios"])
      ? (raw["scenarios"] as Record<string, unknown>[]).map((scenario) => ({
          ...scenario,
          ...(hasText(scenario["audience"]) && hasText(scenario["flowKind"])
            ? {}
            : scenarioPresentation(scenario)),
        }))
      : raw["scenarios"];
    return { ...raw, scenarios };
  }

  private normalizeLegacy(raw: Record<string, unknown>): unknown {
    const rawScenarios = raw["scenarios"] as Record<string, unknown>[];
    const included = rawScenarios.filter(
      (scenario) =>
        !scalarText(scenario["closureDisposition"]).startsWith(
          "OUT_OF_SCOPE_CLOSED",
        ),
    );
    this.normalizeExecutableInputs(included);
    const definitions = this.configuredDefinitions(included);
    const rawRules = raw["crossTagRules"] as Record<string, unknown>[];
    const crossTagConstraints = this.crossTagConstraints(rawRules, included);
    const inputs = this.configuredInputs(
      included,
      (scenario) => this.profileFor(scenario),
      (key, sequence) => this.fieldId(key, sequence),
      (key, messageType) => this.governedBankServiceRole(key, messageType),
    );
    const scenarios = this.configuredScenarios(included);
    return {
      schemaVersion: "1.0",
      catalogueVersion: String(raw["documentId"]),
      standardsRelease: "SR2026",
      messageFamily: "MT347",
      definitions,
      scenarios,
      inputs: [...inputs.values()],
      crossTagConstraints,
    };
  }

  private configuredDefinitions(
    scenarios: readonly Record<string, unknown>[],
  ): ResolutionPageScenarioDefinition[] {
    return scenarios
      .filter(
        (scenario, index) =>
          scenarios.findIndex(
            (candidate) =>
              this.profileFor(candidate) === this.profileFor(scenario),
          ) === index,
      )
      .map((scenario) => ({
        profileId: this.profileFor(scenario),
        messageType: String(scenario["messageType"]),
        businessFunction: "CONFIGURED",
        sequence: String(scenario["sequence"]),
        settlementLeg: String(scenario["settlementLeg"]),
      }));
  }

  private crossTagConstraints(
    rules: readonly Record<string, unknown>[],
    scenarios: readonly Record<string, unknown>[],
  ): ResolutionPageCrossTagConstraint[] {
    return rules
      .filter((rule) =>
        scenarios.some(
          (scenario) =>
            scenario["scenarioId"] ===
            String(rule["ruleId"]).replace(/^XTR-/, ""),
        ),
      )
      .map((rule) => this.crossTagConstraint(rule, scenarios));
  }

  private crossTagConstraint(
    rule: Record<string, unknown>,
    scenarios: readonly Record<string, unknown>[],
  ): ResolutionPageCrossTagConstraint {
    const scenarioId = String(rule["ruleId"]).replace(/^XTR-/, "");
    const scenario = scenarios.find(
      (candidate) => candidate["scenarioId"] === scenarioId,
    )!;
    const expression = rule["expression"] as ResolutionPageCrossTagExpression;
    const sequence = String(scenario["sequence"]);
    const expected = scenario["expected"] as Record<string, unknown>;
    const governedReasonCode = /^[A-Z][A-Z0-9_-]*/.exec(
      scalarText(expected["statusOrError"]).trim(),
    )?.[0];
    const fields = this.expressionFields(expression).map((key) =>
      this.fieldId(key, sequence),
    );
    return {
      constraintId: String(rule["ruleId"]),
      scenarioId,
      operator: expression.operator,
      fieldId: fields[0] ?? "context.validationContext",
      ...(fields[1] ? { comparedFieldId: fields[1] } : {}),
      reasonCode: governedReasonCode ?? `${String(rule["ruleId"])}_VIOLATION`,
      sourceTaxonomy: scalarText(
        rule["sourceTaxonomy"],
        "NETWORK_VALIDATED_RULE",
      ) as "NETWORK_VALIDATED_RULE" | "FIELD_USAGE_RULE",
      validationOwner: String(rule["sourceOwnerInV6"]) as
        "SSI_FIELD_RESOLUTION_API" | "UPSTREAM_FIN_VALIDATOR",
      expression: this.mapExpressionFields(expression, (key) =>
        this.fieldId(key, sequence),
      ),
    };
  }

  private configuredScenarios(
    scenarios: readonly Record<string, unknown>[],
  ): ResolutionPageConfiguredScenario[] {
    return scenarios.map((scenario) => this.configuredScenario(scenario));
  }

  private configuredScenario(
    scenario: Record<string, unknown>,
  ): ResolutionPageConfiguredScenario {
    const values = Object.fromEntries(
      (scenario["pageParameters"] as Record<string, unknown>[])
        .filter(
          (parameter) =>
            !["messageType", "sequence", "settlementLeg"].includes(
              String(parameter["key"]),
            ),
        )
        .map((parameter) => [
          this.fieldId(String(parameter["key"]), String(scenario["sequence"])),
          typeof parameter["value"] === "boolean"
            ? parameter["value"]
            : scalarText(parameter["value"]),
        ]),
    );
    const expected = scenario["expected"] as Record<string, unknown>;
    const fixture = scenario["fixtureBinding"] as Record<string, unknown>;
    const executionContext = scenario["executionContext"] as
      Record<string, unknown> | undefined;
    const rawFieldOptions = executionContext?.["fieldOptions"];
    const fieldOptions =
      rawFieldOptions &&
      typeof rawFieldOptions === "object" &&
      !Array.isArray(rawFieldOptions)
        ? Object.fromEntries(
            Object.entries(rawFieldOptions).filter(
              ([tag, option]) =>
                /^\d{2}$/.test(tag) && /^[A-Z]$/.test(scalarText(option)),
            ),
          )
        : {};
    return {
      scenarioId: String(scenario["scenarioId"]),
      testCaseId: String(scenario["scenarioId"]),
      profileId: this.profileFor(scenario),
      label: String(scenario["businessScenario"]),
      polarity: scenario["polarity"] as PageParameterPolarity,
      ...scenarioPresentation(scenario),
      fixtureBindingId: String(fixture["bindingId"]),
      // A prose-only upstream FIN oracle is deliberately not converted into
      // an SSI 422. Read-only scope rows use 200 as a non-executed reference
      // status; only explicitly governed numeric statuses become SSI oracles.
      expectedHttp: [
        ...new Set(
          scalarText(expected["http"])
            .match(/\b[1-5]\d\d\b/g)
            ?.map(Number) ?? [200],
        ),
      ],
      inputValues: values,
      ...(Object.keys(fieldOptions).length ? { fieldOptions } : {}),
      reasonCode: governedScenarioReasonCode(expected["statusOrError"]),
    };
  }

  private profileFor(scenario: Record<string, unknown>): string {
    return [
      "MT347",
      scenario["messageType"],
      scenario["sequence"],
      scenario["settlementLeg"],
    ]
      .map((part) =>
        scalarText(part, "MESSAGE")
          .trim()
          .replaceAll(/[^A-Za-z0-9]+/g, "-")
          .replace(/^-/, "")
          .replace(/-$/, "")
          .toUpperCase(),
      )
      .join(":");
  }

  private fieldId(key: string, sequence: string): string {
    const canonicalKey = this.canonicalParameterKey(key);
    if (!canonicalKey.startsWith("tag.")) return `context.${canonicalKey}`;
    const tagKey = canonicalKey.endsWith(".present")
      ? canonicalKey
      : `${canonicalKey}.present`;
    return `context.${sequence}.${tagKey}`;
  }

  private governedBankServiceRole(
    key: string,
    messageType: string,
  ): string | undefined {
    const canonicalKey = this.canonicalParameterKey(key);
    if (
      canonicalKey === "beneficiaryBankServiceId" &&
      ["MT742", "MT754"].includes(messageType)
    )
      return "BENEFICIARY_BANK";
    return (
      {
        senderCorrespondentBankServiceId: "SENDERS_CORRESPONDENT",
        receiverCorrespondentBankServiceId: "RECEIVERS_CORRESPONDENT",
        intermediaryBankServiceId: "INTERMEDIARY",
        receivingBankServiceId: "ACCOUNT_WITH_INSTITUTION",
        beneficiaryBankServiceId: "BENEFICIARY_INSTITUTION",
        reimbursingBankServiceId: "REIMBURSING_BANK",
      } as Record<string, string>
    )[canonicalKey];
  }

  private configuredInputs(
    scenarios: readonly Record<string, unknown>[],
    profileFor: (scenario: Record<string, unknown>) => string,
    fieldId: (key: string, sequence: string) => string,
    roleFor: (key: string, messageType: string) => string | undefined,
  ): Map<string, { profileId: string; field: PageParameterField }> {
    const facts = this.parameterFacts(scenarios, profileFor);
    const inputs = new Map<
      string,
      { profileId: string; field: PageParameterField }
    >();
    for (const scenario of scenarios) {
      const profileId = profileFor(scenario);
      const parameters = scenario["pageParameters"] as Record<
        string,
        unknown
      >[];
      for (const parameter of parameters) {
        const key = this.canonicalParameterKey(String(parameter["key"]));
        if (["messageType", "sequence", "settlementLeg"].includes(key))
          continue;
        const id = fieldId(key, String(scenario["sequence"]));
        inputs.set(`${profileId}|${id}`, {
          profileId,
          field: this.configuredField({
            parameter,
            scenario,
            profileId,
            key,
            id,
            inputCount: inputs.size,
            facts,
            roleFor,
          }),
        });
      }
    }
    return inputs;
  }

  private parameterFacts(
    scenarios: readonly Record<string, unknown>[],
    profileFor: (scenario: Record<string, unknown>) => string,
  ): {
    values: ReadonlyMap<string, Set<string>>;
    polarities: ReadonlyMap<string, Set<string>>;
  } {
    const values = new Map<string, Set<string>>();
    const polarities = new Map<string, Set<string>>();
    for (const scenario of scenarios) {
      const profileId = profileFor(scenario);
      const parameters = scenario["pageParameters"] as Record<
        string,
        unknown
      >[];
      for (const parameter of parameters) {
        const key = this.canonicalParameterKey(String(parameter["key"]));
        const identity = `${profileId}|${key}`;
        const observed = values.get(identity) ?? new Set<string>();
        if (parameter["value"] !== undefined && parameter["value"] !== "")
          observed.add(scalarText(parameter["value"]));
        values.set(identity, observed);
        const seenPolarities = polarities.get(identity) ?? new Set<string>();
        seenPolarities.add(String(scenario["polarity"]));
        polarities.set(identity, seenPolarities);
      }
    }
    return { values, polarities };
  }

  private configuredField(input: {
    parameter: Record<string, unknown>;
    scenario: Record<string, unknown>;
    profileId: string;
    key: string;
    id: string;
    inputCount: number;
    facts: {
      values: ReadonlyMap<string, Set<string>>;
      polarities: ReadonlyMap<string, Set<string>>;
    };
    roleFor: (key: string, messageType: string) => string | undefined;
  }): PageParameterField {
    const { parameter, scenario, profileId, key, id, facts, roleFor } = input;
    const typeName = String(parameter["dataType"]);
    const dataType = fieldDataType(typeName);
    const identity = `${profileId}|${key}`;
    const observed = [...(facts.values.get(identity) ?? [])];
    let allowed: string[] | undefined;
    if (Array.isArray(parameter["allowedValues"]))
      allowed = parameter["allowedValues"].map(String);
    else if (["currency", "bookingEntity", "route"].includes(key))
      allowed = observed;
    const bankService = typeName === "SWIFT_BIC_BANK_SERVICE";
    const messageType = String(scenario["messageType"]);
    const role = bankService ? roleFor(key, messageType) : undefined;
    const supplementalType = [
      "SWIFT_PARTY_IDENTIFIER",
      "ACCOUNT_REFERENCE",
    ].includes(typeName);
    const supplementalStem = key.replace(
      /(?:PartyIdentifier|AccountReference)$/,
      "",
    );
    const supplementalRole = supplementalType
      ? roleFor(`${supplementalStem}BankServiceId`, messageType)
      : undefined;
    const testOnly =
      key.startsWith("tag.") ||
      !facts.polarities.get(identity)?.has("POSITIVE");
    return {
      fieldId: id,
      path: configuredPath(key, typeName, supplementalRole),
      label: configuredLabel(
        key,
        typeName,
        bankService,
        role,
        supplementalRole,
      ),
      control: configuredControl(bankService, dataType, allowed),
      dataType: bankService ? "SWIFT_BIC" : dataType,
      required: parameter["required"] === true,
      displayOrder: configuredDisplayOrder(
        key,
        testOnly,
        supplementalRole,
        input.inputCount,
      ),
      section: configuredSection(testOnly, role, supplementalRole),
      visibility: testOnly ? "TEST_ONLY" : "USER_INPUT",
      helpText: configuredHelp(key, testOnly, bankService, supplementalRole),
      ...(bankService
        ? {
            lookup: {
              provider: "BANK_SERVICE" as const,
              action: "BANK_SERVICE" as const,
              endpoint:
                "/api/v1/resolution-page-definitions/lookups/bank-services",
              valueField: "bankServiceId" as const,
              displayField: "bic" as const,
              validationField: "bic" as const,
              ...(role ? { targetRole: role } : {}),
            },
          }
        : {}),
      ...configuredDefault(parameter["value"]),
      ...(allowed
        ? {
            options: allowed.map((option) => ({
              value: option,
              label: option,
            })),
          }
        : {}),
      constraints: [],
    };
  }

  private canonicalParameterKey(key: string): string {
    return (
      (
        {
          senders_correspondentBankServiceId:
            "senderCorrespondentBankServiceId",
          receivers_correspondentBankServiceId:
            "receiverCorrespondentBankServiceId",
          reimbursing_bankBankServiceId: "reimbursingBankServiceId",
        } as Readonly<Record<string, string>>
      )[key] ?? key
    );
  }

  private expressionFields(
    expression: ResolutionPageCrossTagExpression,
  ): string[] {
    return [
      expression.field,
      ...this.expressionChildren(expression).flatMap((child) =>
        this.expressionFields(child),
      ),
    ].filter((field): field is string => Boolean(field));
  }

  private normalizeExecutableInputs(
    scenarios: Record<string, unknown>[],
  ): void {
    const configured = JSON.parse(
      readFileSync(
        join(process.cwd(), "parameters", "mt347-fixture-inputs.v1.json"),
        "utf8",
      ),
    ) as { messageReceiverBankServices?: Record<string, string> };
    const directory = new BankServiceDirectory();
    for (const scenario of scenarios) {
      const parameters = scenario["pageParameters"] as Record<
        string,
        unknown
      >[];
      this.ensureCounterpartyParameter(
        scenario,
        parameters,
        configured,
        directory,
      );
      for (const parameter of parameters)
        this.normalizeBankServiceParameter(parameter, parameters, directory);
    }
  }

  private ensureCounterpartyParameter(
    scenario: Readonly<Record<string, unknown>>,
    parameters: Record<string, unknown>[],
    configured: { messageReceiverBankServices?: Record<string, string> },
    directory: BankServiceDirectory,
  ): void {
    if (parameters.some(({ key }) => key === "counterpartyBankServiceId"))
      return;
    const serviceId =
      configured.messageReceiverBankServices?.[String(scenario["messageType"])];
    if (!serviceId) return;
    parameters.push({
      key: "counterpartyBankServiceId",
      dataType: "SWIFT_BIC_BANK_SERVICE",
      value: serviceId,
      required: true,
      uiAction: "BANK_SERVICE_LOOKUP",
      resolvedBic: directory.resolve(serviceId).bic,
    });
  }

  private normalizeBankServiceParameter(
    parameter: Record<string, unknown>,
    parameters: Record<string, unknown>[],
    directory: BankServiceDirectory,
  ): void {
    if (parameter["dataType"] !== "SWIFT_BIC_BANK_SERVICE") return;
    const raw = scalarText(parameter["value"]).trim();
    if (!raw || /^BANK-SVC-[A-Z0-9-]+$/.test(raw)) return;
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const bic = lines.at(-1) ?? scalarText(parameter["resolvedBic"]).trim();
    const match = directory.search(bic).find((item) => item.bic === bic);
    if (!match) return;
    parameter["value"] = match.bankServiceId;
    const supplemental = lines.slice(0, -1).join("\n");
    if (!supplemental) return;
    const account =
      supplemental.startsWith("/") && !supplemental.startsWith("//");
    const stem = String(parameter["key"]).replace(/BankServiceId$/, "");
    parameters.push({
      key: `${stem}${account ? "AccountReference" : "PartyIdentifier"}`,
      dataType: account ? "ACCOUNT_REFERENCE" : "SWIFT_PARTY_IDENTIFIER",
      value: account ? supplemental.slice(1) : supplemental,
      required: false,
    });
  }

  private expressionChildren(
    expression: ResolutionPageCrossTagExpression,
  ): ResolutionPageCrossTagExpression[] {
    return [
      expression.when,
      ...(expression.then ?? []),
      ...(expression.alternatives ?? []),
      ...(expression.all ?? []),
    ].filter((item): item is ResolutionPageCrossTagExpression => Boolean(item));
  }

  private mapExpressionFields(
    expression: ResolutionPageCrossTagExpression,
    map: (field: string) => string,
  ): ResolutionPageCrossTagExpression {
    const mapped = structuredClone(expression);
    this.mapExpressionFieldsInPlace(mapped, map);
    return mapped;
  }

  private mapExpressionFieldsInPlace(
    expression: ResolutionPageCrossTagExpression,
    map: (field: string) => string,
  ): void {
    if (expression.field)
      Reflect.set(expression, "field", map(expression.field));
    for (const child of this.expressionChildren(expression))
      this.mapExpressionFieldsInPlace(child, map);
  }

  private valid(
    value: unknown,
  ): value is Omit<
    ResolutionPageScenarioCatalogue,
    "sourceArtifactId" | "sourceArtifactSha256"
  > {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    if (
      item["schemaVersion"] !== "1.0" ||
      item["standardsRelease"] !== "SR2026" ||
      item["messageFamily"] !== "MT347"
    )
      return false;
    if (!hasText(item["catalogueVersion"])) return false;
    if (
      !Array.isArray(item["definitions"]) ||
      !Array.isArray(item["scenarios"]) ||
      !Array.isArray(item["inputs"]) ||
      !Array.isArray(item["crossTagConstraints"])
    )
      return false;
    const definitions = item["definitions"] as Record<string, unknown>[];
    const scenarios = item["scenarios"] as Record<string, unknown>[];
    const constraints = item["crossTagConstraints"] as Record<
      string,
      unknown
    >[];
    const profileIds = definitions.map((definition) =>
      scalarText(definition["profileId"]),
    );
    const scenarioIds = scenarios.map((scenario) =>
      scalarText(scenario["scenarioId"]),
    );
    if (
      !unique(profileIds) ||
      !unique(scenarioIds) ||
      profileIds.some((id) => !id) ||
      scenarioIds.some((id) => !id)
    )
      return false;
    if (
      scenarios.some(
        (scenario) =>
          !hasText(scenario["testCaseId"]) ||
          !profileIds.includes(String(scenario["profileId"])) ||
          !["POSITIVE", "NEGATIVE", "BOUNDARY"].includes(
            String(scenario["polarity"]),
          ) ||
          !["OPERATIONAL", "QA_TEST_ONLY"].includes(
            String(scenario["audience"]),
          ) ||
          ![
            "CORE_SSI",
            "TRANSACTION_CONTEXT",
            "HYBRID",
            "NO_ROUTE",
            "NEGATIVE_BOUNDARY",
          ].includes(String(scenario["flowKind"])) ||
          !hasText(scenario["fixtureBindingId"]) ||
          !Array.isArray(scenario["expectedHttp"]) ||
          (scenario["fieldOptions"] !== undefined &&
            (!scenario["fieldOptions"] ||
              typeof scenario["fieldOptions"] !== "object" ||
              Array.isArray(scenario["fieldOptions"]) ||
              Object.entries(
                scenario["fieldOptions"] as Record<string, unknown>,
              ).some(
                ([tag, option]) =>
                  !/^\d{2}$/.test(tag) || !/^[A-Z]$/.test(scalarText(option)),
              ))),
      )
    )
      return false;
    if (
      constraints.some(
        (constraint) =>
          !hasText(constraint["constraintId"]) ||
          !scenarioIds.includes(String(constraint["scenarioId"])) ||
          !OPERATORS.has(constraint["operator"] as CrossTagOperator) ||
          !hasText(constraint["fieldId"]) ||
          !hasText(constraint["reasonCode"]),
      )
    )
      return false;
    return true;
  }
}
