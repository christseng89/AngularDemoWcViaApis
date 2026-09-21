import type { ResolutionPageDefinitionIndexItem } from "@ssi/contracts";
import {
  assertPageDefinitionDomain,
  filterPageDefinitions,
  groupPageDefinitions,
  scenarioNavigation,
  scenarioSelection,
  scenarioRows,
} from "../../../app/resolution-workbench/page-definition-index";

const item: ResolutionPageDefinitionIndexItem = {
  definitionId: "PAGE-MSG-X-Q9",
  definitionVersion: "v-next",
  contractSha256: "a".repeat(64),
  title: "Synthetic extensibility",
  businessDomain: "TREASURY",
  transactionGroupId: "TREASURY:MSG-X",
  transactionGroupLabel: "MSG-X — Synthetic transaction",
  transactionGroupOrder: 1,
  scenarioLabel: "Synthetic Q9",
  scenarioDescription: "Synthetic scenario",
  scenarioOrder: 1,
  transactionDescription: "Synthetic transaction",
  scenarioSequence: "Q9",
  ssiScope: "IN_SCOPE",
  validationOwner: "SSI_FIELD_RESOLUTION_API",
  status: "AVAILABLE",
  executable: true,
  actionLabel: "Open workbench",
  swiftDescription: "Synthetic transaction",
  messageCode: "MSG-X",
  inputFields: [],
  profileSlots: ["57A"],
  targetProfileSlots: ["57A"],
  mappingStatus: "PROFILE_VERIFIED",
  processingStatus: "PROFILE_VERIFIED",
  originalOrder: 1,
  scenarioCount: 1,
  scenarioDetails: [
    {
      scenarioId: "Q9",
      label: "Synthetic Q9",
      sequence: "Q9",
      polarity: "POSITIVE",
      audience: "OPERATIONAL",
      flowKind: "CORE_SSI",
      executable: true,
    },
  ],
  query: {
    standardsRelease: "FUTURE",
    messageFamily: "UNSEEN",
    messageType: "MSG-X",
    direction: "OUTGOING",
    businessScenarioId: "Q9",
  },
};

describe("filterPageDefinitions", () => {
  it("finds a synthetic API item without a client catalogue update", () => {
    expect(filterPageDefinitions([item], "79z")).toEqual([]);
    expect(filterPageDefinitions([item], "msg-x")).toEqual([item]);
    expect(filterPageDefinitions([item], "q9")).toEqual([item]);
  });

  it("groups API definitions by transaction without a client message catalogue", () => {
    const second = {
      ...item,
      definitionId: "PAGE-MSG-X-Q10",
      title: "Second scenario",
      scenarioLabel: "Synthetic Q10",
      scenarioOrder: 2,
      scenarioSequence: "Q10",
      scenarioCount: 2,
      scenarioDetails: [
        {
          scenarioId: "Q10",
          label: "Synthetic Q10",
          sequence: "Q10",
          polarity: "NEGATIVE" as const,
          audience: "QA_TEST_ONLY" as const,
          flowKind: "NEGATIVE_BOUNDARY" as const,
          executable: true,
        },
      ],
      query: { ...item.query, businessScenarioId: "Q10" },
    };
    const first = {
      ...item,
      scenarioCount: 2,
    };
    const anotherMessage = {
      ...item,
      definitionId: "PAGE-MSG-Y-Q1",
      title: "Another transaction",
      transactionGroupId: "TREASURY:MSG-Y",
      transactionGroupLabel: "MSG-Y — Another transaction",
      transactionGroupOrder: 2,
      messageCode: "MSG-Y",
      originalOrder: 2,
      scenarioLabel: "Another Q1",
      query: {
        ...item.query,
        messageType: "MSG-Y",
        businessScenarioId: "Q1",
      },
    };

    const groups = groupPageDefinitions([first, second, anotherMessage]);
    expect(groups).toEqual([
      {
        id: "TREASURY:MSG-X",
        messageCode: "MSG-X",
        description: "Synthetic transaction",
        inputFields: [],
        profileSlots: ["57A"],
        mappingStatus: "PROFILE_VERIFIED",
        processingStatus: "PROFILE_VERIFIED",
        scenarioCount: 2,
        operationalScenarioCount: 1,
        qaScenarioCount: 1,
        order: 1,
        definitions: [first, second],
      },
      {
        id: "TREASURY:MSG-Y",
        messageCode: "MSG-Y",
        description: "Synthetic transaction",
        inputFields: [],
        profileSlots: ["57A"],
        mappingStatus: "PROFILE_VERIFIED",
        processingStatus: "PROFILE_VERIFIED",
        scenarioCount: 1,
        operationalScenarioCount: 1,
        qaScenarioCount: 0,
        order: 2,
        definitions: [anotherMessage],
      },
    ]);
    expect(scenarioRows(groups[0]!)).toHaveLength(2);
    expect(scenarioNavigation(groups[0]!)).toBe("DRAWER");
    expect(scenarioNavigation(groups[1]!)).toBe("DIRECT");
  });

  it("fails closed when API scenario count does not reconcile", () => {
    const group = groupPageDefinitions([{ ...item, scenarioCount: 2 }])[0]!;
    expect(() => scenarioRows(group)).toThrow(
      "PAGE_DEFINITION_SCENARIO_COUNT_MISMATCH",
    );
  });

  it("fails closed when the API index crosses the requested business domain", () => {
    const treasury = { ...item, businessDomain: "TREASURY" as const };
    const tradeFinance = {
      ...item,
      definitionId: "PAGE-MSG-Y-Q1",
      businessDomain: "TRADE_FINANCE" as const,
    };

    expect(assertPageDefinitionDomain([treasury], "TREASURY")).toEqual([
      treasury,
    ]);
    expect(() =>
      assertPageDefinitionDomain([treasury, tradeFinance], "TREASURY"),
    ).toThrow("PAGE_DEFINITION_DOMAIN_MISMATCH");
  });

  it("keeps each authoritative definition selector while navigating all MT300 child scenarios", () => {
    const selectorRanges = [
      { selector: "MT300-001", first: 1, last: 5 },
      { selector: "MT300-006", first: 6, last: 10 },
      { selector: "MT300-011", first: 11, last: 16 },
    ] as const;
    const definitions = selectorRanges.map(({ selector, first, last }) => ({
      ...item,
      definitionId: `PAGE-${selector}`,
      transactionGroupId: "TREASURY:MT300",
      transactionGroupLabel: "MT300 — Foreign Exchange Confirmation",
      messageCode: "MT300",
      swiftDescription: "Foreign Exchange Confirmation",
      scenarioCount: 16,
      scenarioOrder: first,
      query: { ...item.query, businessScenarioId: selector },
      scenarioDetails: Array.from({ length: last - first + 1 }, (_, offset) => {
        const scenarioId = `MT300-${String(first + offset).padStart(3, "0")}`;
        return {
          scenarioId,
          label: scenarioId,
          sequence: "B1",
          polarity: "POSITIVE" as const,
          audience: "OPERATIONAL" as const,
          flowKind: "CORE_SSI" as const,
          executable: true,
        };
      }),
    }));

    const rows = scenarioRows(groupPageDefinitions(definitions)[0]!);
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      const navigation = scenarioSelection(row, "TREASURY");
      expect(navigation.selectedScenarioId).toBe(row.scenarioId);
      expect(navigation.query.businessScenarioId).toBe(
        row.definition.query.businessScenarioId,
      );
      expect(navigation.query.businessDomain).toBe("TREASURY");
    }
    expect(
      scenarioSelection(
        rows.find(({ scenarioId }) => scenarioId === "MT300-002")!,
        "TREASURY",
      ).query.businessScenarioId,
    ).toBe("MT300-001");
    expect(
      scenarioSelection(
        rows.find(({ scenarioId }) => scenarioId === "MT300-007")!,
        "TREASURY",
      ).query.businessScenarioId,
    ).toBe("MT300-006");
    expect(
      scenarioSelection(
        rows.find(({ scenarioId }) => scenarioId === "MT300-012")!,
        "TREASURY",
      ).query.businessScenarioId,
    ).toBe("MT300-011");
  });

  it("does not advertise an unavailable child scenario as available", () => {
    const definition = {
      ...item,
      executable: true,
      scenarioDetails: [{ ...item.scenarioDetails[0]!, executable: false }],
    };
    const row = scenarioRows(groupPageDefinitions([definition])[0]!)[0]!;
    expect(row.executable).toBe(false);
    expect(row.status).toBe("READ_ONLY_SCOPE_DECISION");
  });
});
