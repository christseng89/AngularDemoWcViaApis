import { Inject, Injectable, Optional } from "@nestjs/common";

export const PAGE_PARAMETER_RUNTIME_ENVIRONMENT = Symbol(
  "PAGE_PARAMETER_RUNTIME_ENVIRONMENT",
);

@Injectable()
export class PageParameterEnvironmentPolicy {
  private readonly environment: string;

  constructor(
    @Optional()
    @Inject(PAGE_PARAMETER_RUNTIME_ENVIRONMENT)
    environment?: string,
  ) {
    this.environment = (environment ?? process.env["NODE_ENV"] ?? "PRODUCTION")
      .trim()
      .toUpperCase();
  }

  configurationErrorStatus(): 409 | 500 {
    return ["DEVELOPMENT", "DEMO"].includes(this.environment) ? 409 : 500;
  }

  exposesControlledTestScenarios(): boolean {
    return ["DEVELOPMENT", "DEMO", "QA"].includes(this.environment);
  }
}
