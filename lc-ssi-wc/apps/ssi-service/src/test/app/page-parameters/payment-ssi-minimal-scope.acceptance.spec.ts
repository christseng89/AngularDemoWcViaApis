import type {
  PageParameterField,
  ResolutionPageDefinition,
} from "@ssi/contracts";
import { PageParameterEnvironmentPolicy } from "../../../app/page-parameters/page-parameter-environment.policy";
import { PaymentResolutionPageDefinitionSource } from "../../../app/page-parameters/payment-resolution-page-definition.source";
import { ResolutionPageAggregationService } from "../../../app/page-parameters/resolution-page-aggregation.service";

const MESSAGE_TYPES = ["MT202", "MT202COV", "MT205", "MT205COV"] as const;
const BOUNDARY_SCENARIO_IDS = [
  "MT202-QA-CONTINUITY",
  "MT202COV-QA-CONTINUITY",
  "MT205-QA-PROVENANCE",
  "MT205COV-QA-CONTINUITY",
] as const;
const SEQUENCE_BY_NVR = { C81: "A", C68: "B" } as const;
const SWIFT_TAG_OPTION = /^(?:[AB]\.)?\d{2,3}(?:NONE|[A-Z])?$/;

const definitions = (): readonly ResolutionPageDefinition[] =>
  new PaymentResolutionPageDefinitionSource().all("SR2026");

const fieldById = (
  definition: ResolutionPageDefinition,
  fieldId: string,
): PageParameterField | undefined =>
  definition.fields.find((field) => field.fieldId === fieldId);

describe("Payment SSI minimal-scope acceptance", () => {
  it("does not expose transactionReference as a user-owned input in any scenario", () => {
    const violations = definitions().flatMap((definition) =>
      definition.scenarios.flatMap((scenario) =>
        (scenario.fieldPolicies ?? [])
          .filter(
            (policy) =>
              policy.fieldId === "context.transactionReference" &&
              (policy.visibility === "USER_INPUT" ||
                policy.inputOwnership === "TRANSACTION_USER"),
          )
          .map((policy) => ({
            messageType: definition.messageType,
            scenarioId: scenario.scenarioId,
            visibility: policy.visibility,
            inputOwnership: policy.inputOwnership,
          })),
      ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps every executable scenario on the SSI-owned Resolve action", () => {
    const violations = definitions().flatMap((definition) =>
      definition.scenarios
        .filter(
          ({ execution }) =>
            execution.owner === "UPSTREAM_FIN_VALIDATOR" ||
            execution.action === "VALIDATE_FIN",
        )
        .map((scenario) => ({
          messageType: definition.messageType,
          scenarioId: scenario.scenarioId,
          action: scenario.execution.action,
          owner: scenario.execution.owner,
          endpoint: scenario.execution.endpoint,
        })),
    );

    expect(violations).toEqual([]);
  });

  it("does not submit internal scenario selectors or raw SWIFT 32A fixtures", () => {
    const forbiddenKeys = ["context.scenarioCode", "context.swift32A"];
    const violations = definitions().flatMap((definition) =>
      definition.scenarios.flatMap((scenario) =>
        forbiddenKeys
          .filter((key) => Object.hasOwn(scenario.inputValues ?? {}, key))
          .map((key) => ({
            messageType: definition.messageType,
            scenarioId: scenario.scenarioId,
            forbiddenKey: key,
          })),
      ),
    );

    expect(violations).toEqual([]);
  });

  it("executes each named boundary through a split SSI-owned boundary path", () => {
    const scenarios = definitions().flatMap((definition) =>
      definition.scenarios.map((scenario) => ({
        messageType: definition.messageType,
        ...scenario,
      })),
    );
    const boundaryExecutions = BOUNDARY_SCENARIO_IDS.map((scenarioId) => {
      const scenario = scenarios.find(
        (candidate) => candidate.scenarioId === scenarioId,
      );
      return {
        scenarioId,
        found: Boolean(scenario),
        polarity: scenario?.polarity,
        action: scenario?.execution.action,
        owner: scenario?.execution.owner,
        endpoint: scenario?.execution.endpoint,
      };
    });

    expect(boundaryExecutions).toEqual(
      BOUNDARY_SCENARIO_IDS.map((scenarioId) => ({
        scenarioId,
        found: true,
        polarity: "BOUNDARY",
        action: "RESOLVE_SSI",
        owner: "SSI_FIELD_RESOLUTION_API",
        endpoint: "/api/v1/resolution-page-definitions/execute",
      })),
    );
  });

  it("scopes C81 to sequence A and C68 to sequence B field dependencies", () => {
    const observed = definitions().flatMap((definition) =>
      definition.validationRules
        .filter(
          (
            rule,
          ): rule is typeof rule & {
            reasonCode: keyof typeof SEQUENCE_BY_NVR;
          } => Object.hasOwn(SEQUENCE_BY_NVR, rule.reasonCode),
        )
        .map((rule) => {
          const dependencies = rule.appliesToFieldIds.map((fieldId) => {
            const field = fieldById(definition, fieldId);
            return {
              fieldId,
              sequenceId: field?.sequenceId,
              swiftTag: field?.swiftTag,
            };
          });
          return {
            messageType: definition.messageType,
            reasonCode: rule.reasonCode,
            owner: rule.owner,
            expectedSequenceId: SEQUENCE_BY_NVR[rule.reasonCode],
            dependencies,
          };
        }),
    );
    const violations = observed.filter(
      ({ owner, expectedSequenceId, dependencies }) =>
        owner !== "SSI_FIELD_RESOLUTION_API" ||
        dependencies.length === 0 ||
        dependencies.some(
          ({ sequenceId, swiftTag }) =>
            sequenceId !== expectedSequenceId ||
            !["56", "57"].includes(swiftTag ?? ""),
        ),
    );

    expect(
      observed.map(({ messageType, reasonCode }) => ({
        messageType,
        reasonCode,
      })),
    ).toEqual([
      { messageType: "MT202", reasonCode: "C81" },
      { messageType: "MT202COV", reasonCode: "C81" },
      { messageType: "MT202COV", reasonCode: "C68" },
      { messageType: "MT205", reasonCode: "C81" },
      { messageType: "MT205COV", reasonCode: "C81" },
      { messageType: "MT205COV", reasonCode: "C68" },
    ]);
    expect(violations).toEqual([]);
  });

  it("publishes only SWIFT Tag/Option values in Payment index inputFields", () => {
    const index = new ResolutionPageAggregationService(
      new PaymentResolutionPageDefinitionSource(),
      new PageParameterEnvironmentPolicy("DEMO"),
    ).index("SR2026", "PAYMENT");
    const paymentItems = index.items.filter(({ messageCode }) =>
      MESSAGE_TYPES.includes(messageCode as (typeof MESSAGE_TYPES)[number]),
    );
    const violations = paymentItems.flatMap((item) =>
      item.inputFields
        .filter((display) => !SWIFT_TAG_OPTION.test(display))
        .map((display) => ({ messageCode: item.messageCode, display })),
    );

    expect(paymentItems.map(({ messageCode }) => messageCode)).toEqual(
      MESSAGE_TYPES,
    );
    expect(violations).toEqual([]);
  });
});
