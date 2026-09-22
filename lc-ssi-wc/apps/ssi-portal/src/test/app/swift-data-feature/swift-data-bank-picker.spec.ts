import "@angular/compiler";
import { Injector, runInInjectionContext } from "@angular/core";
import { FormControl, FormGroup } from "@angular/forms";
import { of, throwError } from "rxjs";
import { SwiftDataApiService } from "../../../app/swift-data-feature/swift-data-api.service";
import { SwiftDataBankPicker } from "../../../app/swift-data-feature/swift-data-bank-picker";

describe("Swift Data bank picker", () => {
  const page = {
    items: [
      {
        bankServiceId: "BANK-1",
        bic: "BANKHKHH",
        name: "Bank One",
        city: "Hong Kong",
        country: "HK",
        standard: "BIC",
      },
      {
        bankServiceId: "BANK-2",
        bic: "BANKUS33",
        name: "Bank Two",
        city: "",
        country: "US",
        standard: "BIC",
      },
    ],
    page: 1,
    pageSize: 8,
    total: 2,
    totalPages: 1,
  };

  const create = (bankPage: jest.Mock) =>
    runInInjectionContext(
      Injector.create({
        providers: [{ provide: SwiftDataApiService, useValue: { bankPage } }],
      }),
      () => new SwiftDataBankPicker(),
    );

  it("opens, maps, searches, selects and closes a Bank Service", async () => {
    const bankPage = jest.fn().mockReturnValue(of(page));
    const picker = create(bankPage);
    await picker.open({ key: "receiverBic", label: "Receiver Bank" } as never);
    expect(picker.title()).toBe("Select Receiver Bank");
    expect(picker.items()).toEqual([
      expect.objectContaining({ location: "Hong Kong · HK" }),
      expect.objectContaining({ location: "US" }),
    ]);

    await picker.search("  bank  ");
    await picker.moveToPage(2);
    expect(bankPage).toHaveBeenLastCalledWith(2, 8, "bank");
    const form = new FormGroup({ receiverBic: new FormControl("") });
    picker.select(picker.items()[0]!, form);
    expect(form.value.receiverBic).toBe("BANKHKHH");
    expect(picker.target()).toBeNull();
    picker.select(picker.items()[0]!, form);
  });

  it("reports lookup failure and always releases loading state", async () => {
    const picker = create(
      jest.fn().mockReturnValue(throwError(() => new Error("unavailable"))),
    );
    await picker.moveToPage(3);
    expect(picker.error()).toBe("Bank Service lookup is unavailable.");
    expect(picker.loading()).toBe(false);
  });
});
