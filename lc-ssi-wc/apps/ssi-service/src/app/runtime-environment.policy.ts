export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface ResolvedRuntimeEnvironment {
  readonly runtimeEnvironment: string;
  readonly developmentEnabled: boolean;
}

export const resolveRuntimeEnvironment = (
  environment: RuntimeEnvironment = process.env,
): ResolvedRuntimeEnvironment => {
  const explicit = environment["SSI_RUNTIME_ENV"];
  const value = explicit ?? environment["NODE_ENV"];
  const runtimeEnvironment = (value ?? "production").trim().toLowerCase();
  return {
    runtimeEnvironment: runtimeEnvironment || "unknown",
    developmentEnabled: ["demo", "development"].includes(runtimeEnvironment),
  };
};
