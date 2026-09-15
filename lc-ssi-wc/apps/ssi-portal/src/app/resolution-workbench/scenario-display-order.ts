import type { PageParameterPolarity } from "@ssi/contracts";

export interface ScenarioDisplayItem {
  readonly label: string;
  readonly description?: string;
  readonly polarity: PageParameterPolarity;
  readonly scenarioId?: string;
  readonly id?: string;
}

const POLARITY_ORDER: Readonly<Record<PageParameterPolarity, number>> = {
  POSITIVE: 0,
  NEGATIVE: 1,
  BOUNDARY: 2,
};

export const compareScenarioDisplayOrder = <T extends ScenarioDisplayItem>(
  left: T,
  right: T,
): number =>
  POLARITY_ORDER[left.polarity] - POLARITY_ORDER[right.polarity] ||
  (left.description ?? left.label).localeCompare(
    right.description ?? right.label,
    undefined,
    { sensitivity: "base" },
  ) ||
  (left.scenarioId ?? left.id ?? "").localeCompare(
    right.scenarioId ?? right.id ?? "",
  );
