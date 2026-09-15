import type {
  PageParameterControlKind,
  PageParameterExecution,
  PageParameterField,
  PageParameterScenarioFieldPolicy,
  ResolutionPageDefinition,
  ResolutionPageScenario,
} from "@ssi/contracts";
import type { ParameterValue } from "./page-parameter.contract";
import { compareScenarioDisplayOrder } from "./scenario-display-order";

export interface ParameterFieldViewModel extends PageParameterField {
  readonly inputId: string;
  readonly errorId: string;
  readonly inputType: ReturnType<typeof htmlInputType>;
  readonly displayLabel: string;
  readonly scenarioPolicy: PageParameterScenarioFieldPolicy | null;
}

export interface ScenarioViewModel {
  readonly id: string;
  readonly label: string;
  readonly polarity: ResolutionPageScenario["polarity"];
}

export interface ParameterFieldSectionViewModel {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly ParameterFieldViewModel[];
}

export interface ResolutionWorkbenchViewModel {
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly contractSha256: string;
  readonly title: string;
  readonly description: string;
  readonly messageType: string;
  readonly businessFunction: string;
  readonly sourceSummary: string;
  readonly sourceAudit: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: string;
  }[];
  readonly context: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: string;
  }[];
  readonly scenarios: readonly ScenarioViewModel[];
  readonly selectedScenarioId: string;
  readonly fixtureBindingId: string;
  readonly execution: PageParameterExecution;
  readonly actionLabel: string;
  readonly fields: readonly ParameterFieldViewModel[];
  readonly fieldLabels: Readonly<Record<string, string>>;
  readonly fieldSections: readonly ParameterFieldSectionViewModel[];
  readonly initialValues: Readonly<Record<string, ParameterValue>>;
  readonly lookupContext: {
    readonly scenarioId: string;
    readonly messageType: string;
    readonly sequence: string;
  };
}

export interface PageDefinitionWithIdentity {
  readonly definition: ResolutionPageDefinition;
  readonly contractSha256: string;
}

const toDomToken = (value: string): string =>
  value.replaceAll(/[^A-Za-z0-9_-]/g, "-");

export const htmlInputType = (
  control: PageParameterControlKind,
): "checkbox" | "date" | "hidden" | "radio" | "select" | "text" =>
  control.toLowerCase() as
    "checkbox" | "date" | "hidden" | "radio" | "select" | "text";

export const swiftFieldLabel = (
  field: Pick<PageParameterField, "label" | "swiftTag" | "swiftOption">,
): string => {
  const tagAndOption = `${field.swiftTag ?? ""}${field.swiftOption ?? ""}`;
  return tagAndOption ? `SWIFT ${tagAndOption} • ${field.label}` : field.label;
};

const selectedScenario = (
  definition: ResolutionPageDefinition,
  scenarioId?: string,
): ResolutionPageScenario => {
  const scenario = scenarioId
    ? definition.scenarios.find(
        (candidate) => candidate.scenarioId === scenarioId,
      )
    : definition.scenarios[0];
  if (!scenario) throw new Error("PAGE_PARAMETER_SCENARIO_NOT_FOUND");
  return scenario;
};

const actionLabel = (action: PageParameterExecution["action"]): string => {
  if (action === "RESOLVE_SSI") return "Resolve SSI";
  if (action === "PREVIEW_REFERENCE") return "Preview reference";
  return "Validate message";
};

const sectionLabel = (section: PageParameterField["section"]): string => {
  if (section === "SETTLEMENT_INSTRUCTIONS") return "Settlement instructions";
  if (section === "VALIDATION_CONTEXT") return "Additional details";
  return "Transaction details";
};

const sectionOrder: Readonly<
  Record<NonNullable<PageParameterField["section"]>, number>
> = {
  TRANSACTION: 0,
  SETTLEMENT_INSTRUCTIONS: 1,
  VALIDATION_CONTEXT: 2,
};

const visibleField = (field: ParameterFieldViewModel): boolean => {
  const policy = field.scenarioPolicy;
  if (
    policy &&
    (policy.applicability !== "APPLICABLE" ||
      policy.inputOwnership !== "TRANSACTION_USER" ||
      policy.visibility !== "USER_INPUT" ||
      policy.processingPolicy !== "APPLY")
  )
    return false;
  return field.visibility === "USER_INPUT";
};

const assertVisibleFieldPresentation = (field: PageParameterField): void => {
  if (!field.label.trim() || field.displayOrder === undefined || !field.section)
    throw new Error("PAGE_PARAMETER_PRESENTATION_REQUIRED");
  if (field.control === "HIDDEN" || /bankServiceId|^tag[._]/i.test(field.label))
    throw new Error("PAGE_PARAMETER_HUMAN_LABEL_REQUIRED");
  if (field.control === "SELECT" && !field.options?.length && !field.lookup)
    throw new Error("PAGE_PARAMETER_OPTIONS_REQUIRED");
  if (field.dataType === "SWIFT_BIC" && !field.lookup)
    throw new Error("PAGE_PARAMETER_BANK_LOOKUP_REQUIRED");
};

const assertPresentationMetadata = (
  definition: ResolutionPageDefinition,
  scenario: ResolutionPageScenario,
): void => {
  const byId = new Map(
    definition.fields.map((field) => [field.fieldId, field]),
  );
  for (const fieldId of scenario.fieldIds) {
    const field = byId.get(fieldId);
    if (!field) throw new Error("PAGE_PARAMETER_FIELD_NOT_FOUND");
    if (!field.visibility)
      throw new Error("PAGE_PARAMETER_VISIBILITY_REQUIRED");
    if (field.visibility !== "USER_INPUT") continue;
    assertVisibleFieldPresentation(field);
  }
};

const orderedFields = (
  definition: ResolutionPageDefinition,
  scenario: ResolutionPageScenario,
): readonly PageParameterField[] => {
  const scenarioFieldIds = new Set(scenario.fieldIds);
  const sourceIndex = new Map(
    definition.fields.map((field, index) => [field.fieldId, index]),
  );
  const presentationOrder = [...definition.fields]
    .filter((field) => scenarioFieldIds.has(field.fieldId))
    .sort(
      (left, right) =>
        (left.displayOrder ?? 0) - (right.displayOrder ?? 0) ||
        (sourceIndex.get(left.fieldId) ?? 0) -
          (sourceIndex.get(right.fieldId) ?? 0),
    );
  const pending = [...presentationOrder];
  const ordered: PageParameterField[] = [];
  const includedIds = new Set(presentationOrder.map(({ fieldId }) => fieldId));
  while (pending.length > 0) {
    const nextIndex = pending.findIndex((field) => {
      const dependencies = [
        ...(field.optionSource?.dependsOnFieldIds ?? []),
        ...(field.lookup?.dependency?.dependsOnFieldIds ?? []),
      ].filter((fieldId) => includedIds.has(fieldId));
      return dependencies.every((fieldId) =>
        ordered.some((candidate) => candidate.fieldId === fieldId),
      );
    });
    if (nextIndex < 0) return [...ordered, ...pending];
    ordered.push(pending.splice(nextIndex, 1)[0]!);
  }
  return ordered;
};

export const mapPageDefinition = (
  source: PageDefinitionWithIdentity,
  scenarioId?: string,
): ResolutionWorkbenchViewModel => {
  const { definition } = source;
  const scenario = selectedScenario(definition, scenarioId);
  assertPresentationMetadata(definition, scenario);
  const policies = new Map(
    scenario.fieldPolicies?.map((policy) => [policy.fieldId, policy]),
  );
  const fields: readonly ParameterFieldViewModel[] = orderedFields(
    definition,
    scenario,
  ).map((field) => {
    const scenarioPolicy = policies.get(field.fieldId) ?? null;
    return {
      ...field,
      ...(scenarioPolicy
        ? {
            required: scenarioPolicy.required,
            readOnly: scenarioPolicy.readOnly,
            visibility: scenarioPolicy.visibility,
          }
        : {}),
      ...(field.optionSource?.selectionPolicy === "SINGLE_VALUE_RESTRICTED"
        ? { readOnly: true }
        : {}),
      scenarioPolicy,
      displayLabel: swiftFieldLabel(field),
      inputId: `parameter-${toDomToken(field.fieldId)}`,
      errorId: `parameter-${toDomToken(field.fieldId)}-error`,
      inputType: htmlInputType(field.control),
    };
  });
  const visibleFields = fields.filter(visibleField);
  const sections = new Map<string, ParameterFieldViewModel[]>();
  for (const field of visibleFields) {
    const section = field.section ?? "TRANSACTION";
    sections.set(section, [...(sections.get(section) ?? []), field]);
  }
  return {
    definitionId: definition.definitionId,
    definitionVersion: definition.definitionVersion,
    contractSha256: source.contractSha256,
    title: definition.title,
    description: definition.description ?? "",
    messageType: definition.messageType,
    businessFunction: definition.businessFunction,
    sourceSummary: `${definition.standardsRelease} · ${definition.display.familyLabel}`,
    sourceAudit: [
      {
        id: "definition",
        label: "Definition",
        value: `${definition.definitionId} · ${definition.definitionVersion}`,
      },
      {
        id: "contract",
        label: "Contract SHA-256",
        value: source.contractSha256,
      },
      {
        id: "source",
        label: "Source SHA-256",
        value: definition.source.sourceSha256,
      },
      { id: "profile", label: "Profile", value: definition.profile.profileId },
    ],
    context: [
      { id: "release", label: "Release", value: definition.standardsRelease },
      { id: "family", label: "Family", value: definition.display.familyLabel },
      { id: "message", label: "Message", value: definition.messageType },
      {
        id: "direction",
        label: "Direction",
        value: definition.direction === "INCOMING" ? "Incoming" : "Outgoing",
      },
    ],
    scenarios: definition.scenarios
      .map((item) => ({
        id: item.scenarioId,
        label: item.label,
        polarity: item.polarity,
      }))
      .sort(compareScenarioDisplayOrder),
    selectedScenarioId: scenario.scenarioId,
    fixtureBindingId: scenario.fixture.bindingId,
    execution: scenario.execution,
    actionLabel: actionLabel(scenario.execution.action),
    fields,
    fieldLabels: Object.fromEntries(
      fields.map(({ fieldId, displayLabel }) => [fieldId, displayLabel]),
    ),
    fieldSections: [...sections]
      .sort(
        ([left], [right]) =>
          sectionOrder[left as keyof typeof sectionOrder] -
          sectionOrder[right as keyof typeof sectionOrder],
      )
      .map(([id, sectionFields]) => ({
        id,
        label: sectionLabel(sectionFields[0]?.section),
        fields: sectionFields,
      })),
    initialValues: Object.fromEntries(
      fields.map((field) => [
        field.fieldId,
        field.lookup?.provider === "SSI_COUNTERPARTY"
          ? ""
          : (scenario.inputValues?.[field.fieldId] ?? field.defaultValue ?? ""),
      ]),
    ),
    lookupContext: {
      scenarioId: scenario.scenarioId,
      messageType: definition.messageType,
      sequence: scenario.sequenceIds[0] ?? "",
    },
  };
};
