import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  PageParameterScenarioFieldPolicy,
  ResolutionPageDefinition,
} from "@ssi/contracts";
import { PaymentResolutionPageDefinitionSource } from "./payment-resolution-page-definition.source";

const MESSAGE_SCENARIO_COUNT = {
  MT202: 5,
  MT202COV: 5,
  MT205: 4,
  MT205COV: 3,
} as const;

const OWN_ACCOUNT_SCENARIOS = new Set([
  "MT202-OP-BOOK",
  "MT202-OP-CREDIT-57A",
  "MT202COV-OP-BOOK",
  "MT202COV-OP-CREDIT-57A",
]);

const COMMON_USER_INPUTS = [
  "context.currency",
  "context.bookingEntity",
  "context.valueDate",
  "context.amount",
] as const;

const OWN_ACCOUNT_USER_INPUTS = ["context.receiverBankServiceId"] as const;

const definitions = (): readonly ResolutionPageDefinition[] =>
  new PaymentResolutionPageDefinitionSource().all("SR2026");

const policyMap = (
  policies: readonly PageParameterScenarioFieldPolicy[] | undefined,
): ReadonlyMap<string, PageParameterScenarioFieldPolicy> =>
  new Map((policies ?? []).map((policy) => [policy.fieldId, policy]));

describe("Payment SSI route UI acceptance", () => {
  it("keeps the complete four-message, seventeen-scenario denominator", () => {
    const observed = Object.fromEntries(
      definitions().map((definition) => [
        definition.messageType,
        definition.scenarios.length,
      ]),
    );

    expect(observed).toEqual(MESSAGE_SCENARIO_COUNT);
    expect(
      definitions().reduce(
        (total, definition) => total + definition.scenarios.length,
        0,
      ),
    ).toBe(17);
  });

  it("applies the MT347-style governed defaults to every Payment message", () => {
    const governedOptions = {
      options: () => ({
        currencies: ["USD", "EUR"],
        bookingEntities: ["HK01"],
        defaultCurrency: "USD",
        defaultBookingEntity: "HK01",
      }),
    };
    const businessDates = {
      firstAvailableDate: () => "2026-09-15",
      metadata: () => ({
        timeZone: "Asia/Hong_Kong",
        calendarMode: "WEEKDAY_FALLBACK",
        calendarCode: "WEEKDAY_ONLY",
        holidayIntegrationStatus: "NOT_EVALUATED",
        sourceContract: {
          method: "POST",
          path: "/business-days/add",
          endpointEnvironmentVariable: "BUSINESS_DAYS_SERVICE_ENDPOINT",
        },
      }),
    };
    const runtimeDefinitions = new PaymentResolutionPageDefinitionSource(
      undefined,
      governedOptions as never,
      businessDates as never,
    ).all("SR2026");
    const violations = runtimeDefinitions.flatMap((definition) => {
      const fields = new Map(
        definition.fields.map((field) => [field.fieldId, field]),
      );
      const expected = {
        "context.transactionReference": "MT2-DEMO-REFERENCE",
        "context.currency": "USD",
        "context.bookingEntity": "HK01",
        "context.valueDate": "2026-09-15",
        "context.amount": "1000.00",
      };
      return Object.entries(expected)
        .filter(
          ([fieldId, defaultValue]) =>
            fields.get(fieldId)?.defaultValue !== defaultValue,
        )
        .map(([fieldId, defaultValue]) => ({
          messageType: definition.messageType,
          fieldId,
          expected: defaultValue,
          actual: fields.get(fieldId)?.defaultValue,
        }));
    });

    expect(violations).toEqual([]);
  });

  it("exposes only the SSI routing inputs appropriate to each scenario", () => {
    const violations = definitions().flatMap((definition) =>
      definition.scenarios.flatMap((scenario) => {
        const policies = policyMap(scenario.fieldPolicies);
        const actual = [...policies.values()]
          .filter(
            ({ applicability, inputOwnership, visibility }) =>
              applicability === "APPLICABLE" &&
              inputOwnership === "TRANSACTION_USER" &&
              visibility === "USER_INPUT",
          )
          .map(({ fieldId }) => fieldId)
          .sort();
        const ownAccount = OWN_ACCOUNT_SCENARIOS.has(scenario.scenarioId);
        const expected = [
          ...COMMON_USER_INPUTS,
          ...(ownAccount
            ? OWN_ACCOUNT_USER_INPUTS
            : (["context.counterpartyBankServiceId"] as const)),
        ].sort();

        return JSON.stringify(actual) === JSON.stringify(expected)
          ? []
          : [
              {
                messageType: definition.messageType,
                scenarioId: scenario.scenarioId,
                expected,
                actual,
              },
            ];
      }),
    );

    expect(violations).toEqual([]);
  });

  it("submits every scenario to the SSI resolver for automatic route selection", () => {
    const violations = definitions().flatMap((definition) =>
      definition.scenarios
        .filter(
          ({ execution }) =>
            execution.action !== "RESOLVE_SSI" ||
            execution.owner !== "SSI_FIELD_RESOLUTION_API" ||
            execution.endpoint !==
              "/api/v1/resolution-page-definitions/execute" ||
            execution.method !== "POST",
        )
        .map((scenario) => ({
          messageType: definition.messageType,
          scenarioId: scenario.scenarioId,
          execution: scenario.execution,
        })),
    );

    expect(violations).toEqual([]);
  });

  it("derives own debit and credit accounts for the exact four own-account scenarios", () => {
    const observed = definitions().flatMap((definition) =>
      definition.scenarios
        .filter((scenario) => {
          const policies = policyMap(scenario.fieldPolicies);
          return ["context.receiverBankServiceId"].every((fieldId) =>
            Object.entries({
              applicability: "APPLICABLE",
              inputOwnership: "TRANSACTION_USER",
              visibility: "USER_INPUT",
              processingPolicy: "APPLY",
            }).every(
              ([key, value]) =>
                policies.get(fieldId)?.[
                  key as keyof PageParameterScenarioFieldPolicy
                ] === value,
            ),
          );
        })
        .map(({ scenarioId }) => scenarioId),
    );

    expect(new Set(observed)).toEqual(OWN_ACCOUNT_SCENARIOS);

    for (const definition of definitions()) {
      for (const scenario of definition.scenarios.filter(({ scenarioId }) =>
        OWN_ACCOUNT_SCENARIOS.has(scenarioId),
      )) {
        const policies = policyMap(scenario.fieldPolicies);
        expect(policies.get("context.receiverBankServiceId")?.required).toBe(
          true,
        );
        for (const fieldId of [
          "context.ownDebitAccountId",
          "context.ownDebitAccountVersion",
          "context.ownCreditAccountId",
          "context.ownCreditAccountVersion",
        ]) {
          expect(policies.get(fieldId)).toMatchObject({
            applicability: "APPLICABLE",
            inputOwnership: "SSI_DERIVED",
            visibility: "HIDDEN_EVIDENCE",
            processingPolicy: "APPLY",
            required: false,
            readOnly: true,
          });
        }
      }
    }
  });

  it("never exposes a derived SWIFT 5x settlement field as a manual bank-service input", () => {
    const violations = definitions().flatMap((definition) =>
      definition.scenarios.flatMap((scenario) => {
        const policies = policyMap(scenario.fieldPolicies);
        return definition.fields
          .filter(
            ({ section, swiftTag }) =>
              section === "SETTLEMENT_INSTRUCTIONS" &&
              /^5\d$/.test(swiftTag ?? ""),
          )
          .filter((field) => {
            const policy = policies.get(field.fieldId);
            return (
              field.control !== "HIDDEN" ||
              field.readOnly !== true ||
              policy?.inputOwnership === "TRANSACTION_USER" ||
              policy?.visibility !== "HIDDEN_EVIDENCE" ||
              policy?.readOnly !== true
            );
          })
          .map((field) => ({
            messageType: definition.messageType,
            scenarioId: scenario.scenarioId,
            fieldId: field.fieldId,
            control: field.control,
            policy: policies.get(field.fieldId),
          }));
      }),
    );

    expect(violations).toEqual([]);
  });

  it("uses the same governed eligibility context for Counterparty and Receiver pickers", () => {
    const expectedDependencies = [
      "context.currency",
      "context.bookingEntity",
      "context.valueDate",
    ];
    const violations = definitions().flatMap((definition) =>
      [
        "context.counterpartyBankServiceId",
        "context.receiverBankServiceId",
      ].flatMap((fieldId) => {
        const field = definition.fields.find(
          (candidate) => candidate.fieldId === fieldId,
        );
        return JSON.stringify(field?.lookup?.dependency?.dependsOnFieldIds) ===
          JSON.stringify(expectedDependencies)
          ? []
          : [
              {
                messageType: definition.messageType,
                fieldId,
                dependencies: field?.lookup?.dependency?.dependsOnFieldIds,
              },
            ];
      }),
    );

    expect(violations).toEqual([]);
  });

  it("binds Picker and Resolve to one OAS-governed eligibility snapshot", () => {
    const oas = JSON.parse(
      readFileSync(
        join(process.cwd(), "openapi", "swift-data-service.v1.json"),
        "utf8",
      ),
    ) as {
      components: {
        schemas: Record<
          string,
          { required?: string[]; properties?: Record<string, unknown> }
        >;
      };
    };
    const lookup = oas.components.schemas["PageParameterLookupEnvelope"]!;
    const submission = oas.components.schemas["ResolutionPageSubmission"]!;
    const lookupBinding = lookup.properties?.["eligibilitySnapshot"];
    const submissionBinding = submission.properties?.["eligibilitySnapshot"];
    const selectedRoute = oas.components.schemas[
      "PageParameterSelectedRouteIdentity"
    ]!;

    expect(lookupBinding).toBeDefined();
    expect(submissionBinding).toEqual(lookupBinding);
    expect(lookup.required).toContain("eligibilitySnapshot");
    expect(submission.required).toContain("eligibilitySnapshot");
    expect(submission.required).toContain("selectedRouteIdentity");
    expect(selectedRoute.required).toEqual(
      expect.arrayContaining([
        "routeId",
        "definitionId",
        "definitionVersion",
        "fixtureBindingId",
        "contextSha256",
        "ssi",
        "applicability",
        "nostro",
        "rma",
      ]),
    );
  });
});
