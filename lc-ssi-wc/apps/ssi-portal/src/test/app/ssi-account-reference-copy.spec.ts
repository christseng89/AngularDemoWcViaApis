import { ssiAccountReferenceCopy } from "../../app/ssi-account-reference-copy";

describe("SSI account reference copy", () => {
  it("labels an own SSI account as an own Nostro reference", () => {
    const copy = ssiAccountReferenceCopy("OWN", "BANK");
    expect(copy.label).toContain("Own Nostro");
    expect(copy.description).toContain("本行持有");
  });

  it("does not call a bank counterparty account a Nostro", () => {
    const copy = ssiAccountReferenceCopy("COUNTERPARTY", "BANK");
    expect(copy.label).toContain("Counterparty Settlement Account");
    expect(copy.description).toContain("不是本行 Nostro");
  });

  it("identifies a customer-owned beneficiary account", () => {
    const copy = ssiAccountReferenceCopy("COUNTERPARTY", "CUSTOMER");
    expect(copy.label).toContain("Customer Beneficiary Account");
    expect(copy.description).toContain("客戶 SSI");
  });
});
