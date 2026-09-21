import {
  MaintenanceIndexActionPolicy,
  createMaintenanceIndexActionAdapter,
  showsRequestTypeColumn,
  type MaintenanceIndexTab,
} from "../../app/maintenance-index-action-policy";

describe("MaintenanceIndexActionPolicy", () => {
  const policy = new MaintenanceIndexActionPolicy();
  const resources = ["rma", "entity", "nostro", "ssi"] as const;
  const scenarios = [
    {
      id: "01",
      tab: "ACTIVE",
      rows: [{ status: "ACTIVE", currentStatus: "EMPTY" }],
      expected: ["REVISE", "SUPPRESS"],
    },
    {
      id: "02",
      tab: "ACTIVE",
      rows: [{ status: "ACTIVE", currentStatus: "IN_PROGRESS" }],
      expected: [],
    },
    {
      id: "03",
      tab: "ACTIVE",
      rows: [
        {
          status: "ACTIVE",
          currentStatus: "DRAFTED",
        },
      ],
      expected: [],
    },
    {
      id: "04",
      tab: "ACTIVE",
      rows: [
        {
          status: "ACTIVE",
          currentStatus: "DRAFTED",
        },
      ],
      expected: [],
    },
    {
      id: "05",
      tab: "ACTIVE",
      rows: [
        {
          status: "ACTIVE",
          currentStatus: "DRAFTED",
        },
      ],
      expected: [],
    },
    {
      id: "06",
      tab: "DRAFT",
      rows: [{ status: "DRAFT" }],
      expected: ["SUBMIT", "EDIT", "REVOKE_DRAFT"],
    },
    {
      id: "07",
      tab: "DRAFT",
      rows: [{ status: "DRAFT", changeType: "REVISION" }],
      expected: ["SUBMIT", "EDIT", "REVOKE_DRAFT"],
    },
    {
      id: "08",
      tab: "DRAFT",
      rows: [{ status: "DRAFT", changeType: "SUPPRESSION" }],
      expected: ["SUBMIT", "REVOKE_DRAFT"],
    },
    {
      id: "09",
      tab: "SUPPRESSED",
      rows: [{ status: "SUPPRESSED" }],
      expected: [],
    },
    {
      id: "10",
      tab: "ALL",
      rows: [
        { status: "ACTIVE", currentStatus: "EMPTY" },
        { status: "DRAFT" },
        { status: "DRAFT", changeType: "SUPPRESSION" },
        { status: "SUPPRESSED" },
      ],
      expected: [],
    },
  ] as const;

  it.each(
    resources.flatMap((resource) =>
      scenarios.map((scenario) => ({ resource, scenario })),
    ),
  )(
    "$resource-$scenario.id applies the shared action matrix",
    ({ resource, scenario }) => {
      const adapter = createMaintenanceIndexActionAdapter(resource);
      const tab = scenario.tab as MaintenanceIndexTab;
      expect(adapter.columnsFor(tab).map(({ id }) => id)).toEqual(
        tab === "ACTIVE"
          ? ["REVISE", "SUPPRESS"]
          : tab === "DRAFT"
            ? ["SUBMIT", "EDIT", "REVOKE_DRAFT"]
            : [],
      );
      for (const row of scenario.rows)
        expect(policy.visibleActionIds(tab, row)).toEqual(scenario.expected);
    },
  );

  it("defines exact tab-aware columns without resource-specific branches", () => {
    expect(policy.columnsFor("ACTIVE").map(({ label }) => label)).toEqual([
      "Revise",
      "Suppress",
    ]);
    expect(policy.columnsFor("DRAFT").map(({ label }) => label)).toEqual([
      "Submit",
      "Edit",
      "Revoke",
    ]);
    expect(policy.columnsFor("SUPPRESSED")).toEqual([]);
    expect(policy.columnsFor("ALL")).toEqual([]);
  });

  it("identifies hidden action sorts while retaining informational sorts", () => {
    const shared = createMaintenanceIndexActionAdapter("rma");
    const ssi = createMaintenanceIndexActionAdapter("ssi");
    expect(shared.isVisibleSort("ACTIVE", "__editAction")).toBe(true);
    expect(shared.isVisibleSort("ALL", "__workflowAction")).toBe(false);
    expect(ssi.isVisibleSort("ACTIVE", "EDIT_REVISE")).toBe(true);
    expect(ssi.isVisibleSort("ALL", "EDIT_REVISE")).toBe(false);
    expect(ssi.isVisibleSort("ALL", "REVISION_STATUS")).toBe(true);
  });

  it("hides Request Type only in Draft indexes and resets its hidden sort", () => {
    expect(showsRequestTypeColumn("DRAFT")).toBe(false);
    for (const tab of ["ACTIVE", "SUPPRESSED", "ALL", "PENDING_APPROVAL"] as const)
      expect(showsRequestTypeColumn(tab)).toBe(true);
    expect(createMaintenanceIndexActionAdapter("nostro").isVisibleSort("DRAFT", "__requestType")).toBe(false);
    expect(createMaintenanceIndexActionAdapter("ssi").isVisibleSort("DRAFT", "REQUEST_TYPE")).toBe(false);
  });
});
