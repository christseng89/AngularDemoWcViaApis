import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  PageParameterField,
  PageParameterInputOwnership,
  PageParameterProcessingPolicy,
  PageParameterVisibility,
} from "@ssi/contracts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface OasFieldPolicy {
  readonly inputOwnership: PageParameterInputOwnership;
  readonly visibility: PageParameterVisibility;
  readonly processingPolicy: PageParameterProcessingPolicy;
}

interface OasFieldPolicyRule extends OasFieldPolicy {
  readonly ruleId: string;
  readonly messageTypePattern: string;
  readonly swiftTag: string;
  readonly swiftOptions?: readonly string[];
  readonly inputLabel?: string;
  readonly fieldId?: string;
  readonly targetRole?: string;
  readonly sequenceId?: string;
  readonly applicableScenarioIds?: readonly string[];
  readonly required?: boolean;
}

export interface ResolutionPageIndexInputField {
  readonly swiftTag: string;
  readonly swiftOptions: readonly string[];
  readonly label: string;
  readonly display: string;
}

interface ResolutionPageOasPolicyContract {
  readonly schemaVersion: "1.0";
  readonly defaultBankServicePolicy: OasFieldPolicy;
  readonly rules: readonly OasFieldPolicyRule[];
}

type IndexInputRule = OasFieldPolicyRule &
  Required<Pick<OasFieldPolicyRule, "swiftOptions" | "inputLabel">>;
type MaterializedFieldRule = OasFieldPolicyRule &
  Required<
    Pick<
      OasFieldPolicyRule,
      "fieldId" | "targetRole" | "sequenceId" | "inputLabel"
    >
  >;

const isIndexInputRule = (
  rule: OasFieldPolicyRule,
  messageType: string,
): rule is IndexInputRule =>
  rule.inputOwnership === "TRANSACTION_USER" &&
  new RegExp(rule.messageTypePattern).test(messageType) &&
  Boolean(rule.swiftOptions?.length) &&
  Boolean(rule.inputLabel?.trim());

const isMaterializedFieldRule = (
  rule: OasFieldPolicyRule,
  messageType: string,
): rule is MaterializedFieldRule =>
  new RegExp(rule.messageTypePattern).test(messageType) &&
  Boolean(
    rule.fieldId && rule.targetRole && rule.sequenceId && rule.inputLabel,
  );

export interface ResolutionPageOasFieldPolicySource {
  readonly path: string;
}

export const RESOLUTION_PAGE_OAS_FIELD_POLICY_SOURCE = Symbol(
  "RESOLUTION_PAGE_OAS_FIELD_POLICY_SOURCE",
);

const validOptionalText = (
  rule: Readonly<Record<string, unknown>>,
  key: string,
): boolean =>
  rule[key] === undefined ||
  (typeof rule[key] === "string" && Boolean(rule[key].trim()));

const validSwiftOptions = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (option) => typeof option === "string" && /^[A-Z]$/.test(option),
    ));

const validScenarioIds = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) &&
    value.every(
      (scenarioId) =>
        typeof scenarioId === "string" && Boolean(scenarioId.trim()),
    ));

const validPattern = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
};

@Injectable()
export class ResolutionPageOasFieldPolicyService {
  private readonly contract: ResolutionPageOasPolicyContract;

  constructor(
    @Optional()
    @Inject(RESOLUTION_PAGE_OAS_FIELD_POLICY_SOURCE)
    source?: ResolutionPageOasFieldPolicySource,
  ) {
    this.contract = this.load(
      source?.path ??
        join(process.cwd(), "openapi", "swift-data-service.v1.json"),
    );
  }

  resolve(
    messageType: string,
    field: PageParameterField,
  ): OasFieldPolicy | undefined {
    if (field.lookup?.provider !== "BANK_SERVICE") return undefined;
    const override = this.contract.rules.find(
      (rule) =>
        new RegExp(rule.messageTypePattern).test(messageType) &&
        rule.swiftTag === field.swiftTag,
    );
    return override ?? this.contract.defaultBankServicePolicy;
  }

  inputFields(messageType: string): readonly ResolutionPageIndexInputField[] {
    return this.contract.rules
      .filter((rule): rule is IndexInputRule =>
        isIndexInputRule(rule, messageType),
      )
      .map((rule) => ({
        swiftTag: rule.swiftTag,
        swiftOptions: rule.swiftOptions,
        label: rule.inputLabel,
        display: rule.swiftOptions
          .map((option) => `${rule.swiftTag}${option}`)
          .join("/"),
      }))
      .sort((left, right) => left.swiftTag.localeCompare(right.swiftTag));
  }

  materializedFields(messageType: string): readonly PageParameterField[] {
    return this.contract.rules
      .filter((rule): rule is MaterializedFieldRule =>
        isMaterializedFieldRule(rule, messageType),
      )
      .map((rule) => ({
        fieldId: rule.fieldId,
        path: `roleBankServiceIds.${rule.targetRole}`,
        label: rule.inputLabel,
        helpText:
          "Choose a governed Bank Service. The stable ID is submitted; its BIC is displayed.",
        control: "SELECT" as const,
        dataType: "SWIFT_BIC" as const,
        required: false,
        constraints: [
          {
            constraintId: `BANK-SERVICE-${rule.fieldId.replaceAll(/[^A-Za-z0-9]+/g, "-")}-KNOWN`,
            kind: "DEPENDENCY" as const,
            message: "Select a governed Bank Service identity.",
            value: "BANK_SERVICE",
          },
        ],
        lookup: {
          provider: "BANK_SERVICE" as const,
          action: "BANK_SERVICE" as const,
          endpoint: "/api/v1/resolution-page-definitions/lookups/bank-services",
          valueField: "bankServiceId",
          displayField: "bic",
          validationField: "bic",
          targetRole: rule.targetRole,
        },
        sequenceId: rule.sequenceId,
        swiftTag: rule.swiftTag,
        officialRole: rule.inputLabel,
        displayOrder: 100 + Number(rule.swiftTag),
        section: "SETTLEMENT_INSTRUCTIONS" as const,
        visibility: "HIDDEN_EVIDENCE" as const,
        readOnly: true,
      }));
  }

  scenarioApplicability(
    messageType: string,
    field: PageParameterField,
    scenarioId: string,
  ): { readonly applicable: boolean; readonly required: boolean } | undefined {
    const rule = this.contract.rules.find(
      (candidate) =>
        new RegExp(candidate.messageTypePattern).test(messageType) &&
        candidate.swiftTag === field.swiftTag &&
        (!candidate.applicableScenarioIds ||
          candidate.applicableScenarioIds.includes(scenarioId)),
    );
    return rule
      ? { applicable: true, required: rule.required === true }
      : undefined;
  }

  private load(path: string): ResolutionPageOasPolicyContract {
    let value: unknown;
    try {
      const document = JSON.parse(readFileSync(path, "utf8")) as Record<
        string,
        unknown
      >;
      value = document["x-resolution-page-field-policy"];
    } catch {
      throw new BadRequestException({ code: "PAGE_OAS_POLICY_LOAD_FAILED" });
    }
    if (!this.valid(value))
      throw new BadRequestException({ code: "PAGE_OAS_POLICY_INVALID" });
    return value;
  }

  private valid(value: unknown): value is ResolutionPageOasPolicyContract {
    if (!value || typeof value !== "object") return false;
    const contract = value as Record<string, unknown>;
    if (contract["schemaVersion"] !== "1.0") return false;
    if (!this.validPolicy(contract["defaultBankServicePolicy"])) return false;
    if (!Array.isArray(contract["rules"])) return false;
    return contract["rules"].every((item) => this.validRule(item));
  }

  private validRule(item: unknown): boolean {
    if (!item || typeof item !== "object") return false;
    const rule = item as Record<string, unknown>;
    return (
      typeof rule["ruleId"] === "string" &&
      typeof rule["swiftTag"] === "string" &&
      this.validPolicy(rule) &&
      validPattern(rule["messageTypePattern"]) &&
      validSwiftOptions(rule["swiftOptions"]) &&
      validOptionalText(rule, "inputLabel") &&
      ["fieldId", "targetRole", "sequenceId"].every((key) =>
        validOptionalText(rule, key),
      ) &&
      validScenarioIds(rule["applicableScenarioIds"]) &&
      (rule["required"] === undefined || typeof rule["required"] === "boolean")
    );
  }

  private validPolicy(value: unknown): value is OasFieldPolicy {
    if (!value || typeof value !== "object") return false;
    const policy = value as Record<string, unknown>;
    return (
      ["TRANSACTION_USER", "SSI_DERIVED", "SCENARIO_FIXED"].includes(
        String(policy["inputOwnership"]),
      ) &&
      ["USER_INPUT", "HIDDEN_EVIDENCE", "TEST_ONLY"].includes(
        String(policy["visibility"]),
      ) &&
      ["APPLY", "IGNORE_AUDIT"].includes(String(policy["processingPolicy"]))
    );
  }
}
