import { of, Subject, throwError } from "rxjs";

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

const metadata = {
  provider: "BANK_SERVICE" as const,
  action: "BANK_SERVICE" as const,
  endpoint: "/api/v1/resolution-page-definitions/lookups/bank-services",
  valueField: "bankServiceId" as const,
  displayField: "bic" as const,
  validationField: "bic" as const,
};
const first = {
  provider: "BANK_SERVICE" as const,
  action: "BANK_SERVICE" as const,
  bankServiceId: "bank-service-17",
  bic: "FUTRHKHH",
  displayValue: "FUTRHKHH",
};
const ssiMetadata = {
  ...metadata,
  provider: "SSI_COUNTERPARTY" as const,
  action: "SSI_COUNTERPARTY" as const,
  endpoint: "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
  dependency: {
    dependsOnFieldIds: [
      "context.currency",
      "context.bookingEntity",
      "context.valueDate",
    ],
    invalidatesFieldIds: ["context.counterpartyBankServiceId"],
    selectionPolicy: "SELECTABLE" as const,
  },
};
const ssiContext = {
  scenarioId: "MT300-001",
  messageType: "MT300",
  sequence: "B1",
  dependencyValues: {
    "context.currency": "USD",
    "context.bookingEntity": "DEMOHKHH",
    "context.valueDate": "2026-09-13",
  },
};
const ssiFirst = {
  ...first,
  provider: "SSI_COUNTERPARTY" as const,
  action: "SSI_COUNTERPARTY" as const,
  bankName: "Future Bank",
};
let lookupError = false;
const client = {
  lookup: jest.fn(() =>
    lookupError
      ? throwError(() => new Error("offline"))
      : of({
          provider: "BANK_SERVICE",
          action: "BANK_SERVICE",
          items: [first],
        }),
  ),
};

jest.mock("@angular/core", () => ({
  Injectable:
    () =>
    <T>(target: T): T =>
      target,
  inject: () => client,
  signal: testSignal,
}));
jest.mock("./page-parameter.client", () => ({
  RESOLUTION_PAGE_PARAMETER_CLIENT: Symbol("client"),
}));

describe("ParameterLookupFacade", () => {
  beforeEach(() => {
    lookupError = false;
    jest.clearAllMocks();
  });

  it("loads lookup results and returns only the stable identifier on selection", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    const loading = facade.search(metadata, "FUTR");
    expect(facade.phase()).toBe("loading");
    await loading;

    expect(client.lookup).toHaveBeenCalledWith(metadata, { query: "FUTR" });
    expect(facade.items()[0]?.bic).toBe("FUTRHKHH");
    expect(facade.select(metadata, facade.items()[0]!)).toBe("bank-service-17");
    expect(facade.selected()?.bic).toBe("FUTRHKHH");
  });

  it("keeps the selected identity while opening or searching the picker", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    await facade.search(metadata, "FUTR");
    facade.select(metadata, facade.items()[0]!);

    await facade.search(metadata, "");

    expect(facade.selected()?.bankServiceId).toBe("bank-service-17");
  });

  it("surfaces failures without retaining untrusted items", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    lookupError = true;
    const facade = new ParameterLookupFacade();
    await facade.search(metadata, "X");

    expect(facade.phase()).toBe("error");
    expect(facade.items()).toEqual([]);
    expect(facade.error()).toBe("Bank Service lookup is unavailable.");
  });

  it("rejects mismatched provider results and ignores stale responses", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const stale = new Subject<
      ReturnType<typeof client.lookup> extends import("rxjs").Observable<
        infer T
      >
        ? T
        : never
    >();
    client.lookup
      .mockImplementationOnce(() => stale.asObservable() as never)
      .mockImplementationOnce(
        () =>
          of({
            provider: "BANK_SERVICE",
            action: "BANK_SERVICE",
            items: [first],
          }) as never,
      );
    const facade = new ParameterLookupFacade();
    const older = facade.search(metadata, "OLD");
    const newer = facade.search(metadata, "NEW");
    await newer;
    stale.next({
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      items: [{ ...first, bankServiceId: "stale" }],
    });
    stale.complete();
    await older;
    expect(facade.items()[0]?.bankServiceId).toBe("bank-service-17");

    client.lookup.mockReturnValueOnce(
      of({
        provider: "OTHER",
        action: "BANK_SERVICE",
        items: [first],
      }) as never,
    );
    await facade.search(metadata, "TAMPERED");
    expect(facade.phase()).toBe("error");
    expect(facade.items()).toEqual([]);
  });

  it("clears stale identity synchronously before a dependency lookup completes", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    await facade.search(metadata, "FUTR");
    facade.select(metadata, facade.items()[0]!);
    const pending = new Subject<{
      provider: "SSI_COUNTERPARTY";
      action: "SSI_COUNTERPARTY";
      items: (typeof ssiFirst)[];
    }>();
    client.lookup.mockReturnValueOnce(pending.asObservable() as never);

    const resolving = facade.resolve(ssiMetadata, "", {
      ...ssiContext,
      dependencyValues: {
        ...ssiContext.dependencyValues,
        "context.currency": "JPY",
      },
    });

    expect(facade.phase()).toBe("loading");
    expect(facade.selected()).toBeNull();
    expect(facade.items()).toEqual([]);
    expect(facade.defaultSelection()).toBeNull();
    pending.next({
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      items: [ssiFirst],
    });
    pending.complete();
    await resolving;
    expect(facade.phase()).toBe("ready");
  });

  it("does not accept an item that was not returned by the active lookup", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    await facade.search(metadata, "FUTR");

    expect(() =>
      facade.select(metadata, { ...first, bankServiceId: "injected" }),
    ).toThrow("PAGE_PARAMETER_LOOKUP_SELECTION_MISMATCH");
    expect(() =>
      facade.select(metadata, { ...first, bic: "ALTEREDBIC" }),
    ).toThrow("PAGE_PARAMETER_LOOKUP_SELECTION_MISMATCH");
  });

  it("accepts an immutable picker projection of a returned stable identity", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    await facade.search(metadata, "FUTR");

    expect(
      facade.select(metadata, {
        ...facade.items()[0]!,
        displayValue: "Future Bank",
      }),
    ).toBe("bank-service-17");
    expect(facade.selected()).toBe(first);
  });

  it("resolves an existing stable identifier and bootstraps an empty picker", async () => {
    const { ParameterLookupFacade, unselectedLookupItems } =
      await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    await facade.resolve(metadata, "bank-service-17");

    expect(client.lookup).toHaveBeenCalledWith(metadata, {
      bankServiceId: "bank-service-17",
    });
    expect(facade.selected()?.bic).toBe("FUTRHKHH");
    expect(facade.items()).toEqual([]);
    expect(unselectedLookupItems([first], first)).toEqual([]);

    await facade.resolve(metadata, "");
    expect(client.lookup).toHaveBeenLastCalledWith(metadata, {});
    expect(facade.phase()).toBe("ready");
    expect(facade.selected()).toBeNull();
    expect(facade.items()).toEqual([first]);
  });

  it("rejects an exact-id response with a different stable identifier", async () => {
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    await facade.resolve(metadata, "different-bank-service");

    expect(facade.phase()).toBe("error");
    expect(facade.items()).toEqual([]);
  });

  it("passes governed context to SSI counterparty lookup and resolves its stable id", async () => {
    client.lookup.mockReturnValue(
      of({
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        items: [ssiFirst],
      }) as never,
    );
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();

    await facade.search(ssiMetadata, "FUTR", ssiContext);
    expect(client.lookup).toHaveBeenLastCalledWith(ssiMetadata, {
      ...ssiContext,
      query: "FUTR",
    });
    expect(facade.items()).toEqual([ssiFirst]);

    await facade.resolve(ssiMetadata, ssiFirst.bankServiceId, ssiContext);
    expect(client.lookup).toHaveBeenLastCalledWith(ssiMetadata, ssiContext);
    expect(facade.selected()).toEqual(ssiFirst);
    expect(facade.items()).toEqual([]);
  });

  it("retains the route snapshot together with a selected SSI lookup row", async () => {
    const snapshot = { snapshotId: "s".repeat(64), contextSha256: "c".repeat(64) };
    const item = {
      ...ssiFirst,
      selectedRouteIdentity: {
        routeId: "r".repeat(64),
        definitionId: "PAYMENT:MT202COV",
        definitionVersion: "v1",
        fixtureBindingId: "FIXTURE-MT202COV-OP-STANDARD",
        contextSha256: snapshot.contextSha256,
        ssi: { id: "SSI-1", version: 1 },
        applicability: { id: "APPL-1", version: 1 },
        nostro: { id: "NOSTRO-1", version: 1 },
        rma: { id: "RMA-1", version: 1 },
      },
    };
    client.lookup.mockReturnValueOnce(of({
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      items: [item],
      eligibilitySnapshot: snapshot,
    }) as never);
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();
    await facade.resolve(ssiMetadata, "", ssiContext);
    facade.select(ssiMetadata, item);

    expect(facade.eligibilitySnapshot()).toEqual(snapshot);
    expect(facade.selected()?.selectedRouteIdentity).toEqual(item.selectedRouteIdentity);
  });

  it("accepts only an explicit eligible default matching the current currency", async () => {
    const configured = {
      valueField: "bankServiceId" as const,
      value: ssiFirst.bankServiceId,
      reasonCode: "GOVERNED_CURRENCY_DEFAULT" as const,
      dependency: {
        fieldId: "context.currency" as const,
        value: "USD",
      },
    };
    client.lookup.mockReturnValue(
      of({
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        items: [ssiFirst],
        defaultSelection: configured,
      }) as never,
    );
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();

    await facade.resolve(ssiMetadata, "", ssiContext);
    expect(facade.defaultSelection()).toBe(ssiFirst.bankServiceId);
    expect(facade.selected()).toEqual(ssiFirst);

    await facade.resolve(ssiMetadata, "", {
      ...ssiContext,
      dependencyValues: {
        ...ssiContext.dependencyValues,
        "context.currency": "EUR",
      },
    });
    expect(facade.defaultSelection()).toBeNull();

    await facade.search(ssiMetadata, "FUTR", ssiContext);
    expect(facade.defaultSelection()).toBeNull();

    client.lookup.mockReturnValue(
      of({
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        items: [ssiFirst],
        defaultSelection: {
          ...configured,
          value: "not-an-eligible-id",
        },
      }) as never,
    );
    await facade.resolve(ssiMetadata, "", ssiContext);
    expect(facade.defaultSelection()).toBeNull();
  });

  it("never selects the first eligible item when the API has no default", async () => {
    client.lookup.mockReturnValue(
      of({
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        items: [ssiFirst],
      }) as never,
    );
    const { ParameterLookupFacade } = await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();

    await facade.resolve(ssiMetadata, "", ssiContext);

    expect(facade.items()).toHaveLength(1);
    expect(facade.selected()).toBeNull();
    expect(facade.defaultSelection()).toBeNull();
  });

  it("uses the versioned Nostro identity and provider-specific failure copy", async () => {
    const nostroMetadata = {
      ...metadata,
      provider: "NOSTRO_ACCOUNT" as const,
      action: "NOSTRO_ACCOUNT" as const,
      valueField: "nostroId" as const,
      displayField: "displayValue" as const,
      validationField: "nostroId" as const,
    };
    const nostro = {
      provider: "NOSTRO_ACCOUNT" as const,
      action: "NOSTRO_ACCOUNT" as const,
      nostroId: "NOSTRO-1",
      version: 3,
      displayValue: "USD settlement account",
    };
    client.lookup.mockReturnValueOnce(
      of({
        provider: "NOSTRO_ACCOUNT",
        action: "NOSTRO_ACCOUNT",
        items: [nostro],
      }) as never,
    );
    const { ParameterLookupFacade, lookupItemValue } =
      await import("./parameter-lookup.facade");
    const facade = new ParameterLookupFacade();

    await facade.search(nostroMetadata, "");
    expect(lookupItemValue(nostroMetadata, nostro)).toBe("NOSTRO-1");
    expect(facade.select(nostroMetadata, { ...nostro })).toBe("NOSTRO-1");
    expect(() =>
      facade.select(nostroMetadata, { ...nostro, version: 4 }),
    ).toThrow("PAGE_PARAMETER_LOOKUP_SELECTION_MISMATCH");

    facade.clear();
    expect(facade.phase()).toBe("idle");
    expect(facade.selected()).toBeNull();

    client.lookup.mockReturnValueOnce(throwError(() => new Error("offline")));
    await facade.search(nostroMetadata, "");
    expect(facade.error()).toBe("Own-account lookup is unavailable.");

    client.lookup.mockReturnValueOnce(throwError(() => new Error("offline")));
    await facade.search(ssiMetadata, "", ssiContext);
    expect(facade.error()).toBe("SSI counterparty lookup is unavailable.");
  });
});
