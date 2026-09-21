import { resolveRuntimeEnvironment } from "../../app/runtime-environment.policy";

describe("resolveRuntimeEnvironment", () => {
  it.each([
    [{ SSI_RUNTIME_ENV: "demo", NODE_ENV: "production" }, "demo", true],
    [{ SSI_RUNTIME_ENV: "DEVELOPMENT" }, "development", true],
    [{ SSI_RUNTIME_ENV: "", NODE_ENV: "development" }, "unknown", false],
    [{ SSI_RUNTIME_ENV: "qa" }, "qa", false],
    [{ NODE_ENV: "test" }, "test", false],
    [{}, "production", false],
  ] as const)("resolves environment %#", (environment, name, enabled) => {
    expect(resolveRuntimeEnvironment(environment)).toEqual({
      runtimeEnvironment: name,
      developmentEnabled: enabled,
    });
  });

  it("uses process.env by default", () => {
    const previousEnvironment = process.env["SSI_RUNTIME_ENV"];
    process.env["SSI_RUNTIME_ENV"] = "development";
    try {
      expect(resolveRuntimeEnvironment()).toEqual({
        runtimeEnvironment: "development",
        developmentEnabled: true,
      });
    } finally {
      if (previousEnvironment === undefined)
        delete process.env["SSI_RUNTIME_ENV"];
      else process.env["SSI_RUNTIME_ENV"] = previousEnvironment;
    }
  });
});
