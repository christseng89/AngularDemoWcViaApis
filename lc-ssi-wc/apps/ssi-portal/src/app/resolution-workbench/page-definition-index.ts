import type {
  PageParameterBusinessDomain,
  PageParameterPolarity,
  ResolutionPageDefinitionIndexItem,
} from "@ssi/contracts";

export interface MessageDefinitionGroup {
  readonly id: string;
  readonly messageCode: string;
  readonly description: string;
  readonly inputFields: readonly string[];
  readonly profileSlots: readonly string[];
  readonly mappingStatus: ResolutionPageDefinitionIndexItem["mappingStatus"];
  readonly processingStatus: ResolutionPageDefinitionIndexItem["processingStatus"];
  readonly scenarioCount: number;
  readonly operationalScenarioCount: number;
  readonly qaScenarioCount: number;
  readonly order: number;
  readonly definitions: readonly ResolutionPageDefinitionIndexItem[];
}

export interface ScenarioIndexRow {
  readonly scenarioId: string;
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
  const sourceCounts = new Map<string, number>();
  for (const item of items)
    sourceCounts.set(
      item.transactionGroupId,
      (sourceCounts.get(item.transactionGroupId) ?? 0) + item.scenarioDetails.length,
    );
  if (items.some((item) =>
    item.businessDomain === "TRADE_FINANCE" &&
    item.scenarioCount !== sourceCounts.get(item.transactionGroupId),
  )) throw new Error("PAGE_DEFINITION_SCENARIO_COUNT_MISMATCH");
  const visible = items.flatMap((item) => {
    if (item.businessDomain !== "TRADE_FINANCE") return [item];
    const scenarioDetails = item.scenarioDetails.filter(
      ({ label }) => label !== "MESSAGE - Message / direct canonical route",
    );
    if (!scenarioDetails.length) return [];
    return [{
      ...item,
      scenarioDetails,
      scenarioLabel: scenarioDetails[0]!.label,
    }];
  });
  const visibleCounts = new Map<string, number>();
  for (const item of visible)
    visibleCounts.set(
      item.transactionGroupId,
      (visibleCounts.get(item.transactionGroupId) ?? 0) +
        item.scenarioDetails.length,
    );
  const groups = new Map<string, MessageDefinitionGroup>();
  for (const source of visible) {
    const item = source.businessDomain === "TRADE_FINANCE"
      ? { ...source, scenarioCount: visibleCounts.get(source.transactionGroupId)! }
      : source;
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
      (existing.messageCode !== item.messageCode ||
        existing.description !== item.swiftDescription ||
        existing.order !== item.originalOrder ||
        existing.scenarioCount !== item.scenarioCount ||
        existing.mappingStatus !== item.mappingStatus ||
        existing.processingStatus !== item.processingStatus)
    )
      throw new Error("PAGE_DEFINITION_GROUP_MISMATCH");
    groups.set(item.transactionGroupId, {
      id: item.transactionGroupId,
      messageCode: item.messageCode,
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
      item.swiftDescription,
      ...item.inputFields,
      ...item.profileSlots,
      ...item.targetProfileSlots,
      item.mappingStatus,
    ].some((value) => value.toLocaleUpperCase().includes(normalized)),
  );
};
