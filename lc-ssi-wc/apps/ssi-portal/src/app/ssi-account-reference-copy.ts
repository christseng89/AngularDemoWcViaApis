export interface SsiAccountReferenceCopy {
  readonly label: string;
  readonly description: string;
  readonly placeholder: string;
}

export function ssiAccountReferenceCopy(
  ownershipType: "OWN" | "COUNTERPARTY" | undefined,
  counterpartyType: "BANK" | "CUSTOMER" | undefined,
): SsiAccountReferenceCopy {
  if (ownershipType === "OWN")
    return {
      label: "Own Nostro Account Reference／本行 Nostro 帳戶參考",
      description:
        "本行持有、由 Account With Institution 服務的結算帳戶參考。Demo 僅可使用虛構或遮罩值。",
      placeholder: "例如 DEMO-NOSTRO-USD-001",
    };
  if (counterpartyType === "CUSTOMER")
    return {
      label: "Customer Beneficiary Account Reference／客戶收款帳戶參考",
      description:
        "客戶提供的收款帳戶參考；屬於客戶 SSI，不是本行 Nostro。Demo 僅可使用虛構或遮罩值。",
      placeholder: "例如 DEMO-CUSTOMER-USD-001",
    };
  return {
    label: "Counterparty Settlement Account Reference／對手行結算帳戶參考",
    description:
      "對手行提供的收款或結算帳戶參考；屬於對手行 SSI，不是本行 Nostro。Demo 僅可使用虛構或遮罩值。",
    placeholder: "例如 DEMO-COUNTERPARTY-USD-001",
  };
}
