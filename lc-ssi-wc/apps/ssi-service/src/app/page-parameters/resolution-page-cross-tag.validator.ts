import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import type { ResolutionPageSubmission } from "@ssi/contracts";
import type {
  ResolutionPageCrossTagConstraint,
  ResolutionPageCrossTagExpression,
} from "./resolution-page-scenario-catalogue.service";

type SubmittedValue = ResolutionPageSubmission["values"][string] | undefined;

const present = (value: SubmittedValue): boolean =>
  typeof value === "boolean"
    ? value
    : value !== undefined && value.trim() !== "";

@Injectable()
export class ResolutionPageCrossTagValidator {
  validate(
    submission: ResolutionPageSubmission,
    constraints: readonly ResolutionPageCrossTagConstraint[],
  ): void {
    for (const constraint of constraints) {
      const left = submission.values[constraint.fieldId];
      const right = constraint.comparedFieldId
        ? submission.values[constraint.comparedFieldId]
        : constraint.value;
      const invalid = constraint.expression
        ? !this.evaluate(constraint.expression, submission.values)
        : this.invalid(constraint, left, right);
      if (invalid)
        throw new UnprocessableEntityException({
          code: constraint.reasonCode,
          constraintId: constraint.constraintId,
          fieldId: constraint.fieldId,
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
          ...(constraint.comparedFieldId
            ? { comparedFieldId: constraint.comparedFieldId }
            : {}),
        });
    }
  }

  private evaluate(
    expression: ResolutionPageCrossTagExpression,
    values: ResolutionPageSubmission["values"],
  ): boolean {
    if (expression.alternatives?.length)
      return expression.alternatives.some((item) =>
        this.evaluate(item, values),
      );
    if (expression.all?.length)
      return expression.all.every((item) => this.evaluate(item, values));
    const value = expression.field ? values[expression.field] : undefined;
    switch (expression.operator) {
      case "PRESENT":
        return present(value);
      case "ABSENT":
        return !present(value);
      case "EQUALS":
        return value === expression.value;
      case "NOT_EQUALS":
        return value !== expression.value;
      case "ONE_OF":
        return (
          value !== undefined && expression.values?.includes(value) === true
        );
      case "REQUIRES": {
        const condition = expression.when
          ? this.evaluate(expression.when, values)
          : (expression.all?.every((item) => this.evaluate(item, values)) ??
            present(value));
        return (
          !condition ||
          expression.then?.every((item) => this.evaluate(item, values)) !==
            false
        );
      }
    }
  }

  private invalid(
    constraint: ResolutionPageCrossTagConstraint,
    left: string | boolean | undefined,
    right: string | boolean | undefined,
  ): boolean {
    switch (constraint.operator) {
      case "PRESENT":
        return !present(left);
      case "ABSENT":
        return present(left);
      case "EQUALS":
        return left !== right;
      case "NOT_EQUALS":
        return left === right;
      case "ONE_OF":
        return left === undefined || !constraint.values?.includes(left);
      case "REQUIRES":
        return present(left) && !present(right);
    }
  }
}
