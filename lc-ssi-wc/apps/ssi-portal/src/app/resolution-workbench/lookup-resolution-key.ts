import type { PageParameterLookupMetadata } from "@ssi/contracts";
import type { ParameterLookupContext } from "./parameter-lookup.facade";

export const lookupResolutionKey = (
  metadata: PageParameterLookupMetadata,
  value: string,
  context: ParameterLookupContext,
): string => {
  const governedDependencies = new Set(
    metadata.dependency?.dependsOnFieldIds ?? [],
  );
  const dependencyValues = Object.entries(context.dependencyValues ?? {})
    .filter(([fieldId]) => governedDependencies.has(fieldId))
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify([
    metadata.provider,
    metadata.endpoint,
    value,
    context.scenarioId ?? "",
    context.messageType ?? "",
    context.sequence ?? "",
    dependencyValues,
  ]);
};

export const lookupDependenciesSatisfied = (
  metadata: PageParameterLookupMetadata,
  context: ParameterLookupContext,
): boolean =>
  (metadata.dependency?.dependsOnFieldIds ?? []).every((fieldId) => {
    const value = context.dependencyValues?.[fieldId];
    return value !== undefined && value !== "";
  });
