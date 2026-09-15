import type { PageParameterField } from "@ssi/contracts";

type DependencyField = Pick<
  PageParameterField,
  "fieldId" | "lookup" | "optionSource"
>;

export const invalidatedFieldIds = (
  field: Pick<PageParameterField, "lookup" | "optionSource">,
): readonly string[] => [
  ...new Set([
    ...(field.optionSource?.invalidatesFieldIds ?? []),
    ...(field.lookup?.dependency?.invalidatesFieldIds ?? []),
  ]),
];

const directlyInvalidatedFieldIds = (
  fields: readonly DependencyField[],
  fieldsById: ReadonlyMap<string, DependencyField>,
  sourceFieldId: string,
): readonly string[] => {
  const sourceInvalidations = invalidatedFieldIds(
    fieldsById.get(sourceFieldId) ?? {},
  );
  const dependentInvalidations = fields
    .filter((field) =>
      field.lookup?.dependency?.dependsOnFieldIds.includes(sourceFieldId),
    )
    .flatMap((field) => [field.fieldId, ...invalidatedFieldIds(field)]);
  return [...sourceInvalidations, ...dependentInvalidations];
};

export const dependentInvalidatedFieldIds = (
  fields: readonly DependencyField[],
  changedFieldId: string,
): readonly string[] => {
  const fieldsById = new Map(fields.map((field) => [field.fieldId, field]));
  const invalidated = new Set<string>();
  const pending = [changedFieldId];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const sourceFieldId = pending.shift();
    if (!sourceFieldId || visited.has(sourceFieldId)) continue;
    visited.add(sourceFieldId);
    for (const fieldId of directlyInvalidatedFieldIds(
      fields,
      fieldsById,
      sourceFieldId,
    )) {
      if (invalidated.has(fieldId)) continue;
      invalidated.add(fieldId);
      pending.push(fieldId);
    }
  }

  invalidated.delete(changedFieldId);
  return [...invalidated];
};
