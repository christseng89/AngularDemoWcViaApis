export interface SsiBankReference {
  bankServiceId: string;
  bic: string;
  name: string;
  country: string;
  city?: string;
  addressRef: string;
  standard: string;
  dataClass?: string;
  partyType?: "BANK" | "CUSTOMER";
}

export interface SsiBankPage {
  items: readonly SsiBankReference[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  disclaimer?: string;
}

export interface SsiCustomerReference {
  customerId: string;
  name: string;
  country: string;
  swiftBic?: string;
}

export interface SsiCustomerPage {
  items: readonly SsiCustomerReference[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  disclaimer?: string;
}

export interface SsiCounterpartyReference {
  counterpartyId: string;
  bic?: string;
  name: string;
  country: string;
  partyType: "BANK" | "CUSTOMER";
  beneficiaryAccountReference?: string;
  address?: string;
}
