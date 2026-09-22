import { compareScenarioDisplayOrder } from "../../../app/resolution-workbench/scenario-display-order";

describe("scenario display order", () => {
  it("orders valid, invalid, then boundary and sorts descriptions within each group", () => {
    const scenarios = [
      { id: "b-z", label: "A", description: "Zulu boundary", polarity: "BOUNDARY" as const },
      { id: "n-z", label: "A", description: "Zulu invalid", polarity: "NEGATIVE" as const },
      { id: "p-z", label: "A", description: "Zulu valid", polarity: "POSITIVE" as const },
      { id: "b-a", label: "Z", description: "Alpha boundary", polarity: "BOUNDARY" as const },
      { id: "n-a", label: "Z", description: "Alpha invalid", polarity: "NEGATIVE" as const },
      { id: "p-a", label: "Z", description: "Alpha valid", polarity: "POSITIVE" as const },
    ];

    expect(
      [...scenarios].sort(compareScenarioDisplayOrder).map(({ id }) => id),
    ).toEqual(["p-a", "p-z", "n-a", "n-z", "b-a", "b-z"]);
  });

  it("falls back from description to label and then stable scenario identity", () => {
    const scenarios = [
      { label: "Same", polarity: "POSITIVE" as const, scenarioId: "scenario-b" },
      { label: "Same", polarity: "POSITIVE" as const, scenarioId: "scenario-a" },
      { label: "Same", polarity: "POSITIVE" as const, id: "id-only" },
      { label: "Same", polarity: "POSITIVE" as const },
    ];
    expect(
      [...scenarios]
        .sort(compareScenarioDisplayOrder)
        .map(({ scenarioId, id }) => scenarioId ?? id ?? "empty"),
    ).toEqual(["empty", "id-only", "scenario-a", "scenario-b"]);
  });
});
