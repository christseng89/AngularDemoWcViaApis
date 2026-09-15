import { of, Subject, throwError } from "rxjs";
import type { ResolutionPageDefinitionIndexItem } from "@ssi/contracts";

type TestSignal<T> = (() => T) & {
  set(value: T): void;
  update(updater: (value: T) => T): void;
};

const testSignal = <T>(initial: T): TestSignal<T> => {
  let value = initial;
  const read = (() => value) as TestSignal<T>;
  read.set = (next) => {
    value = next;
  };
  read.update = (updater) => {
    value = updater(value);
  };
  return read;
};

const mockClient = {
  loadIndex: jest.fn(),
};

const mockRequiredInput = testSignal("TREASURY");

jest.mock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component:
    () =>
    <T>(target: T): T =>
      target,
  ElementRef: class ElementRef {},
  computed: <T>(calculation: () => T) => calculation,
  effect: jest.fn(),
  inject: () => mockClient,
  input: Object.assign(<T>(initial: T) => testSignal(initial), {
    required: () => mockRequiredInput,
  }),
  signal: testSignal,
  viewChild: () => () => null,
}));
jest.mock("./page-parameter.client", () => ({
  RESOLUTION_PAGE_PARAMETER_CLIENT: Symbol("client"),
  provideResolutionPageParameterClient: () => ({ provide: "client" }),
}));
jest.mock("./resolution-failure.component", () => ({
  ResolutionFailureComponent: class ResolutionFailureComponent {},
}));
jest.mock("./resolution-workbench.component", () => ({
  ResolutionWorkbenchComponent: class ResolutionWorkbenchComponent {},
}));

const item = (
  overrides: Partial<ResolutionPageDefinitionIndexItem> = {},
): ResolutionPageDefinitionIndexItem => ({
  definitionId: "PAGE-MT300-001",
  definitionVersion: "1",
  contractSha256: "a".repeat(64),
  title: "MT300 Amount Bought",
  businessDomain: "TREASURY",
  transactionGroupId: "TREASURY:MT300",
  transactionGroupLabel: "MT300 — Foreign Exchange Confirmation",
  transactionGroupOrder: 1,
  scenarioLabel: "Amount Bought",
  scenarioDescription: "Direct canonical route",
  scenarioOrder: 1,
  transactionDescription: "Foreign Exchange Confirmation",
  scenarioSequence: "B1",
  ssiScope: "IN_SCOPE",
  validationOwner: "SSI_FIELD_RESOLUTION_API",
  status: "AVAILABLE",
  executable: true,
  actionLabel: "Open workbench",
  swiftDescription: "Foreign Exchange Confirmation",
  messageCode: "MT300",
  inputFields: ["53A", "57A"],
  profileSlots: ["53A", "57A"],
  targetProfileSlots: ["53A", "57A"],
  mappingStatus: "PROFILE_VERIFIED",
  processingStatus: "PROFILE_VERIFIED",
  originalOrder: 1,
  scenarioCount: 1,
  scenarioDetails: [
    {
      scenarioId: "MT300-001",
      label: "Amount Bought",
      description: "Direct canonical route",
      sequence: "B1",
      polarity: "POSITIVE",
      audience: "OPERATIONAL",
      flowKind: "CORE_SSI",
      executable: true,
    },
  ],
  query: {
    standardsRelease: "SR2026",
    messageFamily: "MT3",
    messageType: "MT300",
    direction: "OUTGOING",
    businessScenarioId: "MT300-001",
  },
  ...overrides,
});

const response = (items: readonly ResolutionPageDefinitionIndexItem[]) => ({
  schemaVersion: "1.0",
  generatedAt: "2026-09-14T00:00:00.000Z",
  pagination: {
    mode: "PAGE_BY_PAGE" as const,
    defaultPageSize: 10,
    maxPageSize: 100,
  },
  items,
});

describe("PageDefinitionIndexWorkspaceComponent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequiredInput.set("TREASURY");
    mockClient.loadIndex.mockReturnValue(of(response([item()])));
  });

  it("loads the governed index and resets transient navigation state", async () => {
    const { PageDefinitionIndexWorkspaceComponent } =
      await import("./page-definition-index-workspace.component");
    const component = new PageDefinitionIndexWorkspaceComponent();
    component.search.set("old");
    component.page.set(3);
    component.drawerAudience.set("QA_TEST_ONLY");

    await component.load();

    expect(mockClient.loadIndex).toHaveBeenCalledWith("TREASURY");
    expect(component.loading()).toBe(false);
    expect(component.failure()).toBeNull();
    expect(component.index()?.items).toHaveLength(1);
    expect(component.search()).toBe("");
    expect(component.page()).toBe(1);
    expect(component.drawerAudience()).toBe("OPERATIONAL");
    expect(component.domainLabel()).toBe("Treasury");
  });

  it("labels the PAYMENT domain without treating it as trade finance", async () => {
    mockRequiredInput.set("PAYMENT");
    const { PageDefinitionIndexWorkspaceComponent } =
      await import("./page-definition-index-workspace.component");
    const component = new PageDefinitionIndexWorkspaceComponent();

    expect(component.domainLabel()).toBe("Payment");
  });

  it("fails closed with the server code and ignores a superseded response", async () => {
    const { PageDefinitionIndexWorkspaceComponent } =
      await import("./page-definition-index-workspace.component");
    const component = new PageDefinitionIndexWorkspaceComponent();
    mockClient.loadIndex.mockReturnValueOnce(
      throwError(() => ({ error: { code: "INDEX_OFFLINE" } })),
    );
    await component.load();
    expect(component.failure()?.code).toBe("INDEX_OFFLINE");
    expect(component.index()).toBeNull();

    const stale = new Subject<ReturnType<typeof response>>();
    mockClient.loadIndex
      .mockReturnValueOnce(stale.asObservable())
      .mockReturnValueOnce(of(response([item({ messageCode: "MT320" })])));
    const older = component.load();
    const newer = component.load();
    await newer;
    stale.next(response([item()]));
    stale.complete();
    await older;
    expect(component.index()?.items[0]?.messageCode).toBe("MT320");
  });

  it("filters, sorts and paginates API-provided message groups", async () => {
    const { PageDefinitionIndexWorkspaceComponent } =
      await import("./page-definition-index-workspace.component");
    const component = new PageDefinitionIndexWorkspaceComponent();
    const mt320 = item({
      definitionId: "PAGE-MT320-001",
      transactionGroupId: "TREASURY:MT320",
      transactionGroupLabel: "MT320 — Fixed Loan",
      transactionGroupOrder: 2,
      transactionDescription: "Fixed Loan",
      swiftDescription: "Fixed Loan",
      messageCode: "MT320",
      inputFields: ["57A"],
      profileSlots: ["57A"],
      query: { ...item().query, messageType: "MT320" },
    });
    component.index.set(response([item(), mt320]));

    component.searchIndex("fixed");
    expect(
      component.visibleMessageGroups().map(({ messageCode }) => messageCode),
    ).toEqual(["MT320"]);
    component.searchIndex("");
    component.sortBy("messageCode");
    expect(component.ariaSort("messageCode")).toBe("ascending");
    component.sortBy("messageCode");
    expect(component.ariaSort("messageCode")).toBe("descending");
    expect(component.ariaSort("description")).toBe("none");
    expect(component.visibleMessageGroups()[0]?.messageCode).toBe("MT320");
    component.movePage(99);
    expect(component.page()).toBe(component.totalPages());
    component.movePage(-99);
    expect(component.page()).toBe(1);
  });

  it("separates operational and QA scenarios and preserves drawer navigation", async () => {
    jest.useFakeTimers();
    const { PageDefinitionIndexWorkspaceComponent } =
      await import("./page-definition-index-workspace.component");
    const component = new PageDefinitionIndexWorkspaceComponent();
    const definition = item({
      scenarioCount: 2,
      scenarioDetails: [
        item().scenarioDetails[0]!,
        {
          scenarioId: "MT300-002",
          label: "Invalid option",
          description: "Negative boundary",
          sequence: "B1",
          polarity: "NEGATIVE",
          audience: "QA_TEST_ONLY",
          flowKind: "NEGATIVE_BOUNDARY",
          executable: true,
        },
      ],
    });
    component.index.set(response([definition]));
    const group = component.messageGroups()[0]!;
    const trigger = { focus: jest.fn() } as unknown as HTMLElement;

    component.activateGroup(group, {
      currentTarget: trigger,
    } as unknown as Event);
    expect(component.drawerGroup()?.id).toBe(group.id);
    expect(
      component.visibleDrawerRows().map(({ scenarioId }) => scenarioId),
    ).toEqual(["MT300-001"]);
    component.showScenarioAudience("QA_TEST_ONLY");
    expect(component.visibleDrawerRows()[0]?.scenarioId).toBe("MT300-002");
    component.searchDrawer("invalid");
    expect(component.visibleDrawerRows()).toHaveLength(1);
    component.sortScenarioBy("description");
    expect(component.scenarioAriaSort("description")).toBe("ascending");
    component.sortScenarioBy("description");
    expect(component.scenarioAriaSort("description")).toBe("descending");
    expect(component.scenarioAriaSort("label")).toBe("none");
    component.moveDrawerPage(99);
    expect(component.drawerPage()).toBe(1);

    component.openScenario(component.visibleDrawerRows()[0]!);
    expect(component.selected()?.selectedScenarioId).toBe("MT300-002");
    expect(component.drawerGroup()).toBeNull();
    component.backToScenarios();
    expect(component.drawerGroup()?.id).toBe(group.id);
    expect(component.selected()).toBeNull();
    component.closeDrawer();
    jest.runAllTimers();
    expect(trigger.focus).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("opens a single executable scenario directly and ignores read-only rows", async () => {
    const { PageDefinitionIndexWorkspaceComponent } =
      await import("./page-definition-index-workspace.component");
    const component = new PageDefinitionIndexWorkspaceComponent();
    component.index.set(response([item()]));
    const group = component.messageGroups()[0]!;
    const definition = group.definitions[0]!;
    component.activateGroup(group, { currentTarget: null } as unknown as Event);
    expect(component.selected()?.selectedScenarioId).toBe("MT300-001");

    const selected = component.selected();
    component.openScenario({
      definition,
      scenarioId: "MT300-001",
      executable: false,
    } as never);
    expect(component.selected()).toBe(selected);
    component.close();
    expect(component.selected()).toBeNull();
  });
});
