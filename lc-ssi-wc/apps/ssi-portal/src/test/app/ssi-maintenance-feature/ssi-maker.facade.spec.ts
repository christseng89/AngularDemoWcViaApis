import { of, throwError } from "rxjs";

type TestSignal<T> = (() => T) & { set(value: T): void };
function testSignal<T>(initial: T): TestSignal<T> {
  let current = initial;
  const read = (() => current) as TestSignal<T>;
  read.set = (value) => {
    current = value;
  };
  return read;
}

jest.mock("@angular/core", () => ({
  signal: testSignal,
  computed: (read: () => unknown) => read,
}));
jest.mock("@angular/forms", () => ({
  FormGroup: class {
    reset = jest.fn();
    get = jest.fn(() => undefined);
  },
}));

import type { SsiMaintenanceApiService } from "../../../app/ssi-maintenance-api.service";
import type { SsiRow } from "../../../app/ssi-maintenance.types";
import { SsiMakerFacade } from "../../../app/ssi-maintenance-feature/ssi-maker.facade";

const active: SsiRow = {
  id: "SSI-ACTIVE",
  counterpartyId: "BANK-1",
  scope: "STANDING",
  status: "ACTIVE",
  maker: "maker.original",
  route: { currency: "USD" },
  version: 9,
};
const revision: SsiRow = {
  ...active,
  id: "SSI-WIP",
  status: "WIP",
  maker: "maker.revision",
  version: 10,
};

describe("SsiMakerFacade", () => {
  it("owns Bank picker paging, selection and model binding", async () => {
    const bank = {
      bankServiceId: "BANK-SVC-1",
      bic: "BARCGB22",
      name: "Barclays",
      country: "GB",
      addressRef: "ADDR-1",
      standard: "BIC",
    };
    const lookupBanks = jest.fn(() =>
      of({
        items: [bank],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      }),
    );
    const facade = new SsiMakerFacade(
      { lookupBanks } as unknown as SsiMaintenanceApiService,
      jest.fn(),
    );
    const selected = { setValue: jest.fn() };
    (facade.form.get as jest.Mock).mockReturnValue(selected);
    await facade.openBicPicker("counterpartyId", "選擇交易對手識別碼");
    expect(lookupBanks).toHaveBeenCalledWith(1, 10, "");
    expect(facade.bankPickerItems()).toEqual([
      expect.objectContaining({ bankServiceId: "BANK-SVC-1", bic: "BARCGB22" }),
    ]);
    facade.selectBankPickerItem({ bankServiceId: "BANK-SVC-1" } as never);
    expect(selected.setValue).toHaveBeenCalledWith("CP-BARCGB22");
    expect(facade.model).toMatchObject({
      counterpartyId: "CP-BARCGB22",
      route: { counterpartyBic: "BARCGB22" },
    });
    expect(facade.bicPickerTarget()).toBeNull();
  });

  it("routes Customer picker requests to the same HTTP-only API and closes on failure", async () => {
    const lookupCustomers = jest.fn(() =>
      throwError(() => new Error("offline")),
    );
    const notice = jest.fn();
    const facade = new SsiMakerFacade(
      { lookupCustomers } as unknown as SsiMaintenanceApiService,
      notice,
    );
    (facade.form.get as jest.Mock).mockReturnValue({ value: "CUSTOMER" });
    await facade.openBicPicker("counterpartyId", "選擇交易對手識別碼");
    expect(lookupCustomers).toHaveBeenCalledWith(1, "");
    expect(facade.identityPickerSource()).toBe("CUSTOMER");
    expect(facade.bicPickerTarget()).toBeNull();
    expect(notice).toHaveBeenCalledWith({
      kind: "error",
      text: "Customer 參考服務暫時不可用。",
    });
  });

  it("owns currency-driven Formly fields while opening its feature picker", () => {
    const facade = new SsiMakerFacade({} as SsiMaintenanceApiService);
    const openPicker = jest.spyOn(facade, "openBicPicker").mockResolvedValue();
    facade.setCurrencyOptions([{ code: "SGD", decimals: 2 }]);
    const fields = facade.fields();
    expect(
      fields.find((field) => field.key === "route.currency")?.props?.options,
    ).toEqual([{ label: "SGD · 2 decimals", value: "SGD" }]);
    const beneficiary = fields.find(
      (field) => field.key === "route.beneficiaryBic",
    );
    (beneficiary?.props?.pickerAction as () => void)();
    expect(openPicker).toHaveBeenCalledWith(
      "beneficiaryBic",
      "選擇 Beneficiary BIC",
    );
  });

  it("owns reset and revision state without changing the Maker defaults", () => {
    const facade = new SsiMakerFacade({} as SsiMaintenanceApiService);
    facade.reset("COUNTERPARTY");
    expect(facade.model).toMatchObject({
      maker: "maker.demo",
      ownershipType: "COUNTERPARTY",
      ownerParty: "COUNTERPARTY",
      route: {
        currency: "USD",
        counterpartyType: "ANY_BANK",
        counterpartyBic: "ANY",
        beneficiarySource: "SSI",
      },
    });
    facade.beginRevision(active, revision, { maker: "maker.revision" });
    expect(facade.editingId()).toBe("SSI-WIP");
    expect(facade.revisionSourceIdentity()).toBe("BANK-1 · v9");
    expect(facade.makerEditing()).toBe(true);
  });

  it("reserves through the HTTP-only service and clears a WIP only after confirmed cancellation", async () => {
    const reserveRevision = jest.fn(() => of(revision));
    const cancelRevision = jest
      .fn()
      .mockReturnValueOnce(throwError(() => new Error("locked")))
      .mockReturnValueOnce(of({}));
    const facade = new SsiMakerFacade({
      reserveRevision,
      cancelRevision,
    } as unknown as SsiMaintenanceApiService);
    expect(await facade.reserveRevision(active.id, "maker.revision")).toBe(
      revision,
    );
    expect(facade.editingId()).toBeNull();
    facade.beginRevision(active, revision, { maker: "maker.revision" });
    await expect(facade.cancelRevision()).rejects.toThrow("locked");
    expect(facade.editingId()).toBe("SSI-WIP");
    await facade.cancelRevision();
    expect(cancelRevision).toHaveBeenCalledWith("SSI-WIP", "maker.revision");
    expect(facade.editingId()).toBeNull();
    expect(facade.revisionSource()).toBeNull();
  });

  it("preserves create versus update request selection", async () => {
    const createDraft = jest.fn(() => of({}));
    const updateDraft = jest.fn(() => of({}));
    const facade = new SsiMakerFacade({
      createDraft,
      updateDraft,
    } as unknown as SsiMaintenanceApiService);
    facade.model = { maker: "maker.demo" };
    await facade.saveDraft();
    expect(createDraft).toHaveBeenCalledWith({ maker: "maker.demo" });
    facade.editingId.set("SSI-DRAFT");
    await facade.saveDraft();
    expect(updateDraft).toHaveBeenCalledWith("SSI-DRAFT", {
      maker: "maker.demo",
    });
  });

  it("normalizes Maker bank identity before save without altering ANY_BANK semantics", () => {
    const facade = new SsiMakerFacade({} as SsiMaintenanceApiService);
    facade.model = {
      counterpartyId: "CP-chasus33",
      route: { counterpartyType: "BANK", counterpartyBic: "bad" },
    };
    facade.applyCounterpartyIdentityPolicy();
    expect(facade.model).toMatchObject({
      counterpartyId: "CP-chasus33",
      route: { counterpartyType: "BANK", counterpartyBic: "CHASUS33" },
    });
    facade.model = {
      counterpartyId: "CP-CHASUS33",
      route: { counterpartyType: "ANY_BANK", counterpartyBic: "CHASUS33" },
    };
    facade.applyCounterpartyIdentityPolicy();
    expect(facade.model).toMatchObject({
      counterpartyId: "ANY",
      route: { counterpartyType: "ANY_BANK", counterpartyBic: "ANY" },
    });
  });
});
