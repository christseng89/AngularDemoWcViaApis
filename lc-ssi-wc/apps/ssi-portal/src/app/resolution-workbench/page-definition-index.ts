import type {
  PageParameterBusinessDomain,
  PageParameterPolarity,
  ResolutionPageDefinitionIndexItem,
} from "@ssi/contracts";

export interface MessageDefinitionGroup {
  readonly id: string;
  readonly familyLabel: string;
  readonly messageCode: string;
  readonly displayLabel?: string;
  readonly description: string;
  readonly inputFields: readonly string[];
  readonly profileSlots: readonly string[];
  readonly mappingStatus: ResolutionPageDefinitionIndexItem["mappingStatus"];
  readonly processingStatus: ResolutionPageDefinitionIndexItem["processingStatus"];
  readonly profileCount: number;
  readonly scenarioCount: number;
  readonly operationalScenarioCount: number;
  readonly qaScenarioCount: number;
  readonly order: number;
  readonly definitions: readonly ResolutionPageDefinitionIndexItem[];
}

const messageFamilyLabel = (messageFamily: string): string => {
  const pairedFamily = /^MT(\d+)_PACS(\d{3})$/.exec(messageFamily);
  return pairedFamily
    ? `MT${pairedFamily[1]} / pacs.${pairedFamily[2]}`
    : messageFamily;
};

export interface ScenarioIndexRow {
  readonly scenarioId: string;
  readonly profileLabel: string;
  readonly label: string;
  readonly polarity: PageParameterPolarity;
  readonly audience: ResolutionPageDefinitionIndexItem["scenarioDetails"][number]["audience"];
  readonly flowKind: ResolutionPageDefinitionIndexItem["scenarioDetails"][number]["flowKind"];
  readonly description: string;
  readonly sequence: string;
  readonly ssiScope: ResolutionPageDefinitionIndexItem["ssiScope"];
  readonly validationOwner: ResolutionPageDefinitionIndexItem["validationOwner"];
  readonly status: ResolutionPageDefinitionIndexItem["status"];
  readonly executable: boolean;
  readonly order: number;
  readonly definition: ResolutionPageDefinitionIndexItem;
}

export interface ScenarioNavigationSelection {
  readonly query: ResolutionPageDefinitionIndexItem["query"];
  readonly selectedScenarioId: string;
}

/**
 * Keep the authoritative definition selector separate from the child scenario.
 * A single definition can own several drawer rows, so replacing its
 * businessScenarioId with the row id makes sibling scenarios unloadable.
 */
export const scenarioSelection = (
  row: ScenarioIndexRow,
  businessDomain: PageParameterBusinessDomain,
): ScenarioNavigationSelection => ({
  query: { ...row.definition.query, businessDomain },
  selectedScenarioId: row.scenarioId,
});

export const scenarioNavigation = (
  group: MessageDefinitionGroup,
): "DIRECT" | "DRAWER" => (group.scenarioCount === 1 ? "DIRECT" : "DRAWER");

export const assertPageDefinitionDomain = (
  items: readonly ResolutionPageDefinitionIndexItem[],
  businessDomain: PageParameterBusinessDomain,
): readonly ResolutionPageDefinitionIndexItem[] => {
  if (items.some((item) => item.businessDomain !== businessDomain))
    throw new Error("PAGE_DEFINITION_DOMAIN_MISMATCH");
  return items;
};

/** Preserve API order while grouping its definitions into a user-facing first step. */
export const groupPageDefinitions = (
  items: readonly ResolutionPageDefinitionIndexItem[],
): readonly MessageDefinitionGroup[] => {
  const groups = new Map<string, MessageDefinitionGroup>();
  for (const item of items) {
    const familyLabel = messageFamilyLabel(item.query.messageFamily);
    if (
      !item.transactionGroupId.trim() ||
      !item.transactionGroupLabel.trim() ||
      !Number.isFinite(item.transactionGroupOrder) ||
      !item.scenarioLabel.trim() ||
      !Number.isFinite(item.scenarioOrder) ||
      !item.messageCode.trim() ||
      !item.swiftDescription.trim() ||
      !Number.isInteger(item.scenarioCount) ||
      item.scenarioCount < 1
    )
      throw new Error("PAGE_DEFINITION_PRESENTATION_REQUIRED");
    const existing = groups.get(item.transactionGroupId);
    if (
      existing &&
      (existing.familyLabel !== familyLabel ||
        existing.messageCode !== item.messageCode ||
        existing.displayLabel !== item.displayLabel ||
        existing.description !== item.swiftDescription ||
        existing.order !== item.originalOrder ||
        existing.scenarioCount !== item.scenarioCount ||
        existing.mappingStatus !== item.mappingStatus ||
        existing.processingStatus !== item.processingStatus)
    )
      throw new Error("PAGE_DEFINITION_GROUP_MISMATCH");
    groups.set(item.transactionGroupId, {
      id: item.transactionGroupId,
      familyLabel,
      messageCode: item.messageCode,
      ...(item.displayLabel ? { displayLabel: item.displayLabel } : {}),
      description: item.swiftDescription,
      inputFields: [
        ...new Set([...(existing?.inputFields ?? []), ...item.inputFields]),
      ],
      profileSlots: [
        ...new Set([
          ...(existing?.profileSlots ?? []),
          ...item.targetProfileSlots,
        ]),
      ],
      mappingStatus: item.mappingStatus,
      processingStatus: item.processingStatus,
      profileCount: (existing?.profileCount ?? 0) + 1,
      scenarioCount: item.scenarioCount,
      operationalScenarioCount:
        (existing?.operationalScenarioCount ?? 0) +
        item.scenarioDetails.filter(
          ({ audience }) => audience === "OPERATIONAL",
        ).length,
      qaScenarioCount:
        (existing?.qaScenarioCount ?? 0) +
        item.scenarioDetails.filter(
          ({ audience }) => audience === "QA_TEST_ONLY",
        ).length,
      order: item.originalOrder,
      definitions: [...(existing?.definitions ?? []), item],
    });
  }
  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      definitions: [...group.definitions].sort(
        (left, right) => left.scenarioOrder - right.scenarioOrder,
      ),
    }));
};

export const scenarioRows = (
  group: MessageDefinitionGroup,
): readonly ScenarioIndexRow[] => {
  const rows = new Map<string, ScenarioIndexRow>();
  for (const definition of group.definitions) {
    for (const scenario of definition.scenarioDetails) {
      if (rows.has(scenario.scenarioId))
        throw new Error("PAGE_DEFINITION_SCENARIO_DUPLICATE");
      rows.set(scenario.scenarioId, {
        scenarioId: scenario.scenarioId,
        profileLabel: definition.query.businessService ?? definition.title,
        label: scenario.label,
        polarity: scenario.polarity,
        audience: scenario.audience,
        flowKind: scenario.flowKind,
        description: definition.scenarioDescription,
        sequence: scenario.sequence,
        ssiScope: definition.ssiScope,
        validationOwner: definition.validationOwner,
        status:
          scenario.executable && definition.executable
            ? definition.status
            : "READ_ONLY_SCOPE_DECISION",
        executable: scenario.executable && definition.executable,
        order: definition.scenarioOrder,
        definition,
      });
    }
  }
  if (rows.size !== group.scenarioCount)
    throw new Error("PAGE_DEFINITION_SCENARIO_COUNT_MISMATCH");
  return [...rows.values()];
};

export const filterPageDefinitions = (
  items: readonly ResolutionPageDefinitionIndexItem[],
  search: string,
): readonly ResolutionPageDefinitionIndexItem[] => {
  const normalized = search.trim().toLocaleUpperCase();
  if (!normalized) return items;
  return items.filter((item) =>
    [
      item.title,
      item.definitionId,
      item.query.messageType,
      item.query.messageFamily,
      item.query.businessScenarioId ?? "",
      item.transactionGroupLabel,
      item.scenarioLabel,
      item.scenarioDescription,
      item.messageCode,
      messageFamilyLabel(item.query.messageFamily),
      item.swiftDescription,
      ...item.inputFields,
      ...item.profileSlots,
      ...item.targetProfileSlots,
      item.mappingStatus,
    ].some((value) => value.toLocaleUpperCase().includes(normalized)),
  );
};
