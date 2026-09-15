import type { ParameterValue } from "./page-parameter.contract";
import type {
  PageParameterEligibilitySnapshot,
  PageParameterLookupEnvelope,
  PageParameterLookupResult,
  PageParameterSelectedRouteIdentity,
} from "@ssi/contracts";
import type {
  ParameterFieldViewModel,
  ResolutionWorkbenchViewModel,
} from "./parameter-model.mapper";

type FormModel = Pick<ResolutionWorkbenchViewModel, "fieldSections">;

export const userInputFields = (
  model: FormModel,
): readonly ParameterFieldViewModel[] =>
  model.fieldSections.flatMap((section) => section.fields);

export const userInputValues = (
  model: FormModel,
  values: Readonly<Record<string, ParameterValue>>,
): Readonly<Record<string, ParameterValue>> =>
  Object.fromEntries(
    userInputFields(model).flatMap((field) =>
      Object.hasOwn(values, field.fieldId)
        ? [[field.fieldId, values[field.fieldId]!]]
        : [],
    ),
  );

export interface SelectedLookupBinding {
  readonly selectedRouteIdentity: PageParameterSelectedRouteIdentity;
  readonly eligibilitySnapshot: PageParameterEligibilitySnapshot;
}

/**
 * Preserves the server-owned route tuple and its discovery snapshot together.
 * Callers must discard the whole binding when any dependency value changes.
 */
export const selectedLookupBinding = (
  item: PageParameterLookupResult,
  envelope: Pick<PageParameterLookupEnvelope, "eligibilitySnapshot">,
): SelectedLookupBinding => {
  if (!item.selectedRouteIdentity || !envelope.eligibilitySnapshot)
    throw new Error("PAGE_PARAMETER_ROUTE_BINDING_REQUIRED");
  if (
    item.selectedRouteIdentity.contextSha256 !==
    envelope.eligibilitySnapshot.contextSha256
  )
    throw new Error("PAGE_PARAMETER_ROUTE_CONTEXT_MISMATCH");
  return {
    selectedRouteIdentity: item.selectedRouteIdentity,
    eligibilitySnapshot: envelope.eligibilitySnapshot,
  };
};
