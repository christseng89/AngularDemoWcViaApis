import { UnprocessableEntityException } from "@nestjs/common";
import type { ResolutionPageSubmission } from "@ssi/contracts";
import { ResolutionPageCrossTagValidator } from "../../../app/page-parameters/resolution-page-cross-tag.validator";
import { PageParameterEnvironmentPolicy } from "../../../app/page-parameters/page-parameter-environment.policy";
import { ResolutionPageScenarioCatalogueService } from "../../../app/page-parameters/resolution-page-scenario-catalogue.service";

const submission = (
  values: Record<string, string | boolean>,
): ResolutionPageSubmission => ({
  definitionId: "PAGE-X",
  definitionVersion: "v1",
  contractSha256: "a".repeat(64),
  scenarioId: "CASE-1",
  fixtureBindingId: "FIX-1@v1",
  values,
});

describe("ResolutionPageCrossTagValidator", () => {
  const validator = new ResolutionPageCrossTagValidator();

  it.each([
    ["PRESENT", {}, {}, true],
    ["ABSENT", { left: "A" }, {}, true],
    ["EQUALS", { left: "A", right: "B" }, { comparedFieldId: "right" }, true],
    [
      "NOT_EQUALS",
      { left: "A", right: "A" },
      { comparedFieldId: "right" },
      true,
    ],
    ["ONE_OF", { left: "B" }, { values: ["A"] }, true],
    ["REQUIRES", { left: true }, { comparedFieldId: "right" }, true],
    ["REQUIRES", { left: false }, { comparedFieldId: "right" }, false],
  ])("evaluates %s declaratively", (operator, values, extra, rejected) => {
    const action = () =>
      validator.validate(submission(values), [
        {
          constraintId: "C-1",
          scenarioId: "CASE-1",
          operator: operator as never,
          fieldId: "left",
          reasonCode: "CONTROLLED_RULE_REJECTED",
          ...extra,
        },
      ]);
    if (rejected) {
      expect(action).toThrow(UnprocessableEntityException);
      try {
        action();
      } catch (error) {
        expect((error as UnprocessableEntityException).getStatus()).toBe(422);
      }
    } else expect(action).not.toThrow();
  });

  const expressionConstraint = (expression: unknown) =>
    ({
      constraintId: "C-EXPRESSION",
      scenarioId: "CASE-1",
      operator: "PRESENT",
      fieldId: "left",
      reasonCode: "CONTROLLED_RULE_REJECTED",
      expression,
    }) as never;

  it.each([
    [{ field: "flag", operator: "PRESENT" }, { flag: true }],
    [{ field: "flag", operator: "ABSENT" }, {}],
    [{ field: "code", operator: "EQUALS", value: "A" }, { code: "A" }],
    [{ field: "code", operator: "NOT_EQUALS", value: "B" }, { code: "A" }],
    [{ field: "code", operator: "ONE_OF", values: ["A", "B"] }, { code: "B" }],
    [
      {
        alternatives: [
          { field: "code", operator: "EQUALS", value: "A" },
          { field: "code", operator: "EQUALS", value: "B" },
        ],
      },
      { code: "B" },
    ],
    [
      {
        all: [
          { field: "left", operator: "PRESENT" },
          { field: "right", operator: "PRESENT" },
        ],
      },
      { left: "A", right: "B" },
    ],
  ])("accepts a satisfied expression %#", (expression, values) => {
    expect(() =>
      validator.validate(submission(values), [
        expressionConstraint(expression),
      ]),
    ).not.toThrow();
  });

  it("rejects an unsatisfied expression and reports compared field context", () => {
    try {
      validator.validate(submission({ flag: false }), [
        {
          ...expressionConstraint({ field: "flag", operator: "PRESENT" }),
          comparedFieldId: "right",
        },
      ]);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        code: "CONTROLLED_RULE_REJECTED",
        constraintId: "C-EXPRESSION",
        fieldId: "left",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
        comparedFieldId: "right",
      });
    }
  });

  it.each([
    [
      {
        operator: "REQUIRES",
        when: { field: "trigger", operator: "PRESENT" },
        then: [{ field: "required", operator: "PRESENT" }],
      },
      { trigger: "Y", required: "value" },
    ],
    [
      {
        field: "trigger",
        operator: "REQUIRES",
        then: [{ field: "required", operator: "PRESENT" }],
      },
      { trigger: "" },
    ],
    [
      {
        operator: "REQUIRES",
        when: { field: "trigger", operator: "ABSENT" },
      },
      { trigger: "present" },
    ],
  ])("supports conditional REQUIRES expression %#", (expression, values) => {
    expect(() =>
      validator.validate(submission(values), [
        expressionConstraint(expression),
      ]),
    ).not.toThrow();
  });

  it("rejects REQUIRES when its condition holds and a required expression fails", () => {
    expect(() =>
      validator.validate(submission({ trigger: true }), [
        expressionConstraint({
          operator: "REQUIRES",
          when: { field: "trigger", operator: "PRESENT" },
          then: [{ field: "required", operator: "PRESENT" }],
        }),
      ]),
    ).toThrow(UnprocessableEntityException);
  });

  it("rejects the governed MT742-007 branch-account 57A conflict", () => {
    const catalogue = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
    );
    const scenario = catalogue
      .get()
      .scenarios.find(({ scenarioId }) => scenarioId === "MT742-007")!;

    try {
      validator.validate(
        submission({ ...scenario.inputValues }),
        catalogue.constraintsFor("MT742-007"),
      );
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual(
        expect.objectContaining({
          code: "CONDITIONAL_57A_USAGE_RULE_VIOLATION",
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
        }),
      );
    }
  });
});
