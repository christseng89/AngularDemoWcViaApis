import { of, Subject, throwError } from "rxjs";
import { arbitraryDefinition } from "./parameter-model.mapper.spec";

type TestSignal<T> = (() => T) & {
  set(value: T): void;
  asReadonly(): () => T;
};

const testSignal = <T>(initial: T): TestSignal<T> => {
  let value = initial;
  const read = (() => value) as TestSignal<T>;
  read.set = (next) => {
    value = next;
  };
  read.asReadonly = () => read;
  return read;
};

let loadError = false;
let executeError = false;
const client = {
  loadIndex: jest.fn(),
  load: jest.fn(() =>
    loadError
      ? throwError(() => ({ code: "LOAD-X" }))
      : of({ contract: arbitraryDefinition, contractSha256: "c".repeat(64) }),
  ),
  execute: jest.fn(() =>
    executeError
      ? throwError(() => ({ error: { code: "EXEC-X" } }))
      : of({
          definitionId: "future-definition",
          definitionVersion: "r17",
          scenarioId: "SCENARIO-X",
          fixtureBindingId: "FIXTURE-X",
          outcome: "REFERENCE_ONLY" as const,
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
          fields: [],
          evidence: {
            correlationId: "C1",
            owner: "SSI_FIELD_RESOLUTION_API" as const,
            action: "RESOLVE_SSI" as const,
            executorIdentity: "ssi-field-resolution-api",
            requestSha256: "d".repeat(64),
            responseSha256: "e".repeat(64),
            ruleIds: [],
          },
        }),
  ),
  lookup: jest.fn(),
};

jest.mock("@angular/core", () => ({
  Injectable:
    () =>
    <T>(target: T): T =>
      target,
  inject: () => client,
  signal: testSignal,
  computed: <T>(read: () => T) => read,
}));
jest.mock("../../../app/resolution-workbench/page-parameter.client", () => ({
  RESOLUTION_PAGE_PARAMETER_CLIENT: Symbol("client"),
}));

const query = {
  standardsRelease: "FUTURE",
  messageFamily: "UNSEEN",
  messageType: "MSG-X",
  direction: "OUTGOING" as const,
};

describe("ResolutionWorkbenchFacade", () => {
  beforeEach(() => {
    loadError = false;
    executeError = false;
    jest.clearAllMocks();
  });

  it("loads and maps a server-provided definition without family logic", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();
    await facade.load(query);

    expect(facade.model()).toMatchObject({
      definitionId: "future-definition",
      title: "Future message",
      selectedScenarioId: "SCENARIO-X",
    });
    expect(
      facade.model()?.fields.some(({ fieldId }) => fieldId === "79Z/free text"),
    ).toBe(true);
    expect(facade.phase()).toBe("ready");
  });

  it("loads by definition selector and maps the explicitly selected child scenario", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();
    const definitionQuery = {
      ...query,
      businessScenarioId: "DEFINITION-SELECTOR",
    };

    await facade.load(definitionQuery, "SCENARIO-X");

    expect(client.load).toHaveBeenCalledWith(definitionQuery);
    expect(facade.model()?.selectedScenarioId).toBe("SCENARIO-X");
  });

  it("fails closed when a loaded definition crosses its requested business domain", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();

    await facade.load({ ...query, businessDomain: "TRADE_FINANCE" });

    expect(facade.model()).toBeNull();
    expect(facade.failure()?.code).toBe("PAGE_DEFINITION_DOMAIN_MISMATCH");
    expect(facade.phase()).toBe("idle");
  });

  it("submits through the API-selected endpoint and controlled identity", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();
    await facade.load(query);
    await facade.execute({ "79Z/free text": "entered" });

    expect(client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/v1/resolution-page-definitions/execute",
        method: "POST",
        action: "RESOLVE_SSI",
        owner: "SSI_FIELD_RESOLUTION_API",
      }),
      {
        definitionId: "future-definition",
        definitionVersion: "r17",
        scenarioId: "SCENARIO-X",
        fixtureBindingId: "FIXTURE-X",
        contractSha256: "c".repeat(64),
        values: { "79Z/free text": "entered" },
      },
    );
    expect(facade.result()?.outcome).toBe("REFERENCE_ONLY");
  });

  it("submits the selected route and discovery snapshot with Payment values", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();
    await facade.load(query);
    const routeBinding = {
      selectedRouteIdentity: {
        routeId: "r".repeat(64),
        definitionId: "future-definition",
        definitionVersion: "r17",
        fixtureBindingId: "FIXTURE-X",
        contextSha256: "c".repeat(64),
        ssi: { id: "SSI-1", version: 1 },
        applicability: { id: "APPL-1", version: 1 },
        nostro: { id: "NOSTRO-1", version: 1 },
        rma: { id: "RMA-1", version: 1 },
      },
      eligibilitySnapshot: {
        snapshotId: "s".repeat(64),
        contextSha256: "c".repeat(64),
      },
    };

    await facade.execute({ "79Z/free text": "entered" }, routeBinding);

    expect(client.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining(routeBinding),
    );
  });

  it("dismisses the result without discarding the mapped form model", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();
    await facade.load(query);
    const model = facade.model();
    await facade.execute({ "79Z/free text": "entered" });

    facade.dismissResult();

    expect(facade.result()).toBeNull();
    expect(facade.model()).toBe(model);
    expect(facade.phase()).toBe("ready");
  });

  it("surfaces load and execution failures with their API code", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();
    loadError = true;
    await facade.load(query);
    expect(facade.failure()?.code).toBe("LOAD-X");

    loadError = false;
    await facade.load(query);
    executeError = true;
    await facade.execute({ "79Z/free text": "entered" });
    expect(facade.failure()?.code).toBe("EXEC-X");
    expect(facade.result()).toBeNull();
  });

  it("surfaces a nested Payment resolver reason instead of UNEXPECTED_ERROR", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const facade = new ResolutionWorkbenchFacade();
    await facade.load(query);
    client.execute.mockImplementationOnce(() =>
      throwError(() => ({
        error: {
          mx: {
            code: "OPTION_CONSTRAINT_VIOLATION",
            reasonCode: "OWN_ACCOUNT_PIN_REQUIRED",
          },
        },
      })),
    );

    await facade.execute({ "79Z/free text": "entered" });

    expect(facade.failure()?.code).toBe(
      "OPTION_CONSTRAINT_VIOLATION · OWN_ACCOUNT_PIN_REQUIRED",
    );
  });

  it("ignores a stale response when the same query is reloaded", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const older = new Subject<{
      contract: typeof arbitraryDefinition;
      contractSha256: string;
    }>();
    const newer = new Subject<{
      contract: typeof arbitraryDefinition;
      contractSha256: string;
    }>();
    client.load
      .mockImplementationOnce(() => older.asObservable() as never)
      .mockImplementationOnce(() => newer.asObservable() as never);
    const facade = new ResolutionWorkbenchFacade();
    const first = facade.load(query);
    const second = facade.load(query);
    newer.next({
      contract: arbitraryDefinition,
      contractSha256: "n".repeat(64),
    });
    newer.complete();
    await second;
    older.next({
      contract: arbitraryDefinition,
      contractSha256: "o".repeat(64),
    });
    older.complete();
    await first;
    expect(facade.model()?.contractSha256).toBe("n".repeat(64));
  });

  it("does not display an execution response after a new definition load", async () => {
    const { ResolutionWorkbenchFacade } =
      await import("../../../app/resolution-workbench/resolution-workbench.facade");
    const pending = new Subject<
      ReturnType<typeof client.execute> extends import("rxjs").Observable<
        infer T
      >
        ? T
        : never
    >();
    const facade = new ResolutionWorkbenchFacade();
    await facade.load(query);
    client.execute.mockImplementationOnce(
      () => pending.asObservable() as never,
    );
    const execution = facade.execute({ "79Z/free text": "entered" });
    await facade.load(query);
    pending.next({
      definitionId: "future-definition",
      definitionVersion: "r17",
      scenarioId: "SCENARIO-X",
      fixtureBindingId: "FIXTURE-X",
      outcome: "REFERENCE_ONLY",
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      fields: [],
      evidence: {
        correlationId: "STALE",
        owner: "SSI_FIELD_RESOLUTION_API",
        action: "RESOLVE_SSI",
        executorIdentity: "ssi-field-resolution-api",
        requestSha256: "d".repeat(64),
        responseSha256: "e".repeat(64),
        ruleIds: [],
      },
    });
    pending.complete();
    await execution;
    expect(facade.result()).toBeNull();
    expect(facade.phase()).toBe("ready");
  });
});
