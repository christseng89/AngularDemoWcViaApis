import {
  PAGE_PARAMETER_RUNTIME_ENVIRONMENT,
  PageParameterEnvironmentPolicy,
} from "../../../app/page-parameters/page-parameter-environment.policy";

describe("Page Parameter environment policy", () => {
  it("publishes the DI token used by the optional runtime override", () => {
    expect(PAGE_PARAMETER_RUNTIME_ENVIRONMENT.description).toBe(
      "PAGE_PARAMETER_RUNTIME_ENVIRONMENT",
    );
  });

  it.each([
    [" development ", 409, true],
    ["DEMO", 409, true],
    ["qa", 500, true],
    ["production", 500, false],
  ] as const)(
    "normalizes %s and applies controlled-scenario policy",
    (environment, status, exposes) => {
      const policy = new PageParameterEnvironmentPolicy(environment);
      expect(policy.configurationErrorStatus()).toBe(status);
      expect(policy.exposesControlledTestScenarios()).toBe(exposes);
    },
  );
});
