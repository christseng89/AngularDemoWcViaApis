import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable, Optional } from "@nestjs/common";
import type {
  PageParameterField,
  PageParameterScenarioFieldPolicy,
  ResolutionPageDefinition,
  ResolutionPageDefinitionQuery,
  ResolutionPageScenario,
} from "@ssi/contracts";
import {
  Mt1SsiProfileRegistry,
  type Mt1SsiInputParameter,
  type Mt1SsiProfile,
  type Mt1SsiScenario,
} from "../mt1-ssi-profile.registry";
import type { ResolutionPageDefinitionSource } from "./resolution-page-definition.source";
import { validateResolutionPageDefinition } from "./resolution-page-definition.validator";

const DEFAULT_OAS = join(
  process.cwd(),
  "openapi",
  "swift-data-service.v1.json",
);
const OAS_ARTIFACT = "openapi/swift-data-service.v1.json";
const MEMORY_ARTIFACT = "memory/swift-mt1xx-pacs008-ssi-v3.md";
const MEMORY_SHA =
  "C5F4C7F981BC6F43406A9991DECFAF3A17FB28A9C6D4B3241F48E572D074F161";

export interface Mt1SsiResolutionPageDefinitionSourceOptions {
  readonly oasPath?: string;
}

const requiredConstraint = (fieldId: string) => ({
  constraintId: `${fieldId}.required`,
  kind: "REQUIRED" as const,
  message: "Required by the governed MT1 SSI resolution context.",
});

const inputField = (input: Mt1SsiInputParameter): PageParameterField => ({
  fieldId: input.fieldId,
  path: input.path,
  label: input.label,
  control: input.control,
  dataType: input.dataType,
  required: true,
  displayOrder: input.displayOrder,
  section: "TRANSACTION",
  visibility: "USER_INPUT",
  ...(input.defaultValue ? { defaultValue: input.defaultValue } : {}),
  ...(input.options
    ? {
        options: input.options.map((value) => ({ value, label: value })),
      }
    : {}),
  ...(input.lookup === "SSI_COUNTERPARTY"
    ? {
        lookup: {
          provider: "SSI_COUNTERPARTY" as const,
          action: "SSI_COUNTERPARTY" as const,
          endpoint:
            "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
          valueField: "bankServiceId" as const,
          displayField: "bic" as const,
          validationField: "bic" as const,
          buttonLabel: "Select Destination Bank",
          selectedButtonLabel: "Change",
          dependency: {
            dependsOnFieldIds: [
              "context.currency",
              "context.bookingEntity",
              "context.valueDate",
            ],
            invalidatesFieldIds: [],
            selectionPolicy: "SELECTABLE" as const,
          },
        },
      }
    : {}),
  constraints: [requiredConstraint(input.fieldId)],
});

const hiddenField = (
  fieldId: string,
  path: string,
  label: string,
  defaultValue: string | undefined,
  displayOrder: number,
): PageParameterField => ({
  fieldId,
  path,
  label,
  control: "HIDDEN",
  dataType: "STRING",
  required: defaultValue !== undefined,
  readOnly: true,
  ...(defaultValue ? { defaultValue } : {}),
  displayOrder,
  section: "VALIDATION_CONTEXT",
  visibility: "HIDDEN_EVIDENCE",
  constraints: defaultValue === undefined ? [] : [requiredConstraint(fieldId)],
});

const fieldPolicy = (
  field: PageParameterField,
): PageParameterScenarioFieldPolicy => ({
  fieldId: field.fieldId,
  applicability: "APPLICABLE",
  inputOwnership:
    field.visibility === "USER_INPUT" ? "TRANSACTION_USER" : "SCENARIO_FIXED",
  visibility: field.visibility ?? "HIDDEN_EVIDENCE",
  processingPolicy: "APPLY",
  required: field.required,
  readOnly: field.readOnly === true,
});

@Injectable()
export class Mt1SsiResolutionPageDefinitionSource implements ResolutionPageDefinitionSource {
  private readonly oasPath: string;
  private readonly registry: Mt1SsiProfileRegistry;

  constructor(
    @Optional() options?: Mt1SsiResolutionPageDefinitionSourceOptions,
    @Optional() registry?: Mt1SsiProfileRegistry,
  ) {
    this.oasPath = options?.oasPath ?? DEFAULT_OAS;
    this.registry =
      registry ?? new Mt1SsiProfileRegistry({ oasPath: this.oasPath });
  }

  all(standardsRelease?: string): readonly ResolutionPageDefinition[] {
    if (standardsRelease && standardsRelease !== "SR2026") return [];
    return this.registry.profiles().map((profile) => this.definition(profile));
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
          definition.scenarios.some(
            ({ scenarioId }) => scenarioId === query.businessScenarioId,
          )),
    );
  }

  private definition(profile: Mt1SsiProfile): ResolutionPageDefinition {
    const profileRuleId = `POL-MT1-PROFILE-${profile.profileId}`;
    const fields = [
      ...this.registry.inputs().map(inputField),
      hiddenField(
        "context.profileId",
        "profileId",
        "Controlled profile",
        profile.profileId,
        100,
      ),
      hiddenField(
        "context.businessService",
        "businessService",
        "Business service",
        profile.businessService,
        110,
      ),
      hiddenField(
        "context.messageDefinitionId",
        "messageDefinitionId",
        "Message definition identifier",
        profile.messageDefinitionId,
        120,
      ),
      hiddenField(
        "context.paymentDirection",
        "paymentDirection",
        "Payment direction",
        "OUTWARD",
        130,
      ),
      hiddenField(
        "context.localBankRole",
        "localBankRole",
        "Local bank role",
        "INSTRUCTING_AGENT",
        140,
      ),
      hiddenField(
        "context.transferMethod",
        "transferMethod",
        "Transfer method",
        undefined,
        150,
      ),
      hiddenField(
        "context.settlementContext",
        "settlementContext",
        "Settlement context",
        undefined,
        160,
      ),
    ];
    const scenarios = this.registry
      .scenarios()
      .map((scenario) =>
        this.scenario(scenario, fields, profileRuleId, profile.profileId),
      );
    const primaryScenario = scenarios[0]!;
    const sourceSha256 = createHash("sha256")
      .update(readFileSync(this.oasPath))
      .digest("hex")
      .toUpperCase();
    const definition: ResolutionPageDefinition = {
      schemaVersion: "1.0",
      definitionId: `PAYMENT-${profile.profileId}`,
      definitionVersion: "2026.09.24-mt1-ssi-demo",
      source: {
        catalogueVersion: "MT1-SSI-SR2026-V1",
        sourceArtifactId: OAS_ARTIFACT,
        sourceSha256,
      },
      standardsRelease: "SR2026",
      messageFamily: "MT1_PACS008",
      messageType: profile.messageType,
      businessDomain: "PAYMENT",
      direction: "OUTGOING",
      businessFunction: "CUSTOMER_CREDIT_TRANSFER_SSI_RESOLUTION",
      title: `${profile.profileId} Payment SSI Resolution`,
      description:
        "Outward bank SSI resolution only; customer payment instructions remain upstream.",
      display: {
        familyCode: "MT1",
        familyLabel: "MT1 / pacs.008",
        categoryCode: "PAYMENT",
        categoryLabel: "Payment SSI Resolution",
      },
      profile: {
        profileId: profile.profileId,
        profileKind: "SSI_RESOLUTION_ONLY",
        businessService: profile.businessService,
        ...(profile.messageDefinitionId
          ? { messageDefinitionId: profile.messageDefinitionId }
          : {}),
        paymentExecutable: true,
        selectionBasis: {
          businessScenarioId: primaryScenario.scenarioId,
          businessService: profile.businessService,
        },
        index: profile.index,
        resolutionEvidence: profile.resolutionEvidence,
      },
      sequences: [
        {
          sequenceId: "SSI_ROUTE",
          label: "Bank-controlled SSI route",
          settlementLeg: "BANK_SETTLEMENT",
          fieldIds: fields.map(({ fieldId }) => fieldId),
        },
      ],
      fields,
      scenarios,
      validationRules: [
        {
          ruleId: profileRuleId,
          taxonomy: "FIELD_USAGE_RULE",
          owner: "SSI_FIELD_RESOLUTION_API",
          validationScope: "IN_SCOPE_SSI_TAG_NVR",
          appliesToFieldIds: ["context.profileId"],
          reasonCode: "PROFILE_INCOMPLETE",
          evidenceIds: ["MT1-SSI-MEMORY"],
        },
      ],
      evidence: [
        {
          evidenceId: "MT1-SSI-MEMORY",
          classification: "PRODUCT_POLICY",
          artifactId: MEMORY_ARTIFACT,
          artifactSha256: MEMORY_SHA,
          ruleId: "POL-MT1-FAIL-CLOSED-001",
        },
      ],
    };
    validateResolutionPageDefinition(definition, {
      standardsRelease: definition.standardsRelease,
      messageFamily: definition.messageFamily,
      messageType: definition.messageType,
      direction: definition.direction,
      businessDomain: definition.businessDomain,
      businessScenarioId: primaryScenario.scenarioId,
      businessService: profile.businessService,
    });
    return definition;
  }

  private scenario(
    scenario: Mt1SsiScenario,
    fields: readonly PageParameterField[],
    profileRuleId: string,
    profileId: string,
  ): ResolutionPageScenario {
    const scenarioId = `${profileId}:${scenario.scenarioId}`;
    return {
      scenarioId,
      label: scenario.label,
      polarity: "POSITIVE",
      audience: "OPERATIONAL",
      flowKind: "CORE_SSI",
      servicerRelationship: "DIFFERENT",
      sequenceIds: ["SSI_ROUTE"],
      fieldIds: fields.map(({ fieldId }) => fieldId),
      fieldPolicies: fields.map(fieldPolicy),
      validationRuleIds: [profileRuleId],
      validation: {
        owner: "SSI_FIELD_RESOLUTION_API",
        taxonomy: "FIELD_USAGE_RULE",
        nvrOutcome: "PASS",
        dispositions: [
          {
            validationScope: "IN_SCOPE_SSI_TAG_NVR",
            owner: "SSI_FIELD_RESOLUTION_API",
            taxonomy: "FIELD_USAGE_RULE",
            expectedOutcome: "PASS",
            ruleIds: [profileRuleId],
          },
        ],
      },
      fixture: {
        bindingId: scenario.fixtureBindingId,
        fixtureSet: "MT1-PACS008-SR2026",
        fixtureVersion: "MT1-SSI-SR2026-V1",
        sourceSha256: createHash("sha256")
          .update(readFileSync(this.oasPath))
          .digest("hex")
          .toUpperCase(),
        isolation: "CANONICAL",
      },
      execution: {
        action: "RESOLVE_SSI",
        owner: "SSI_FIELD_RESOLUTION_API",
        endpoint: "/api/v1/resolution-page-definitions/execute",
        method: "POST",
        expectedHttp: [200, 409, 422],
      },
      inputValues: {
        ...Object.fromEntries(
          fields
            .filter(
              (field) =>
                field.visibility === "HIDDEN_EVIDENCE" &&
                field.defaultValue !== undefined,
            )
            .map((field) => [field.fieldId, field.defaultValue!]),
        ),
        "context.transferMethod": scenario.transferMethod,
        "context.settlementContext": scenario.settlementContext,
      },
    };
  }
}
