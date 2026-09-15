import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  activeBankServices,
  loadBankServiceCatalogue,
  type BankServiceRecord,
} from "../../../libs/parameter-engine/src";

interface ClearingSystemReference {
  code: string;
  name: string;
  supportedCurrency: string;
  settlementCountry: string;
  marketScope: "DOMESTIC" | "MARKET_SPECIFIC" | "PAN_REGIONAL";
  eligibleCountries: readonly string[];
  settlementMarket: string;
  paymentServiceLevel: "HIGH_VALUE" | "RETAIL" | "INSTANT";
  schemeType: "RTGS" | "LVPS" | "ACH" | "IPS";
  status: "ACTIVE" | "INACTIVE";
  validFrom: string;
  validTo: string;
  legacyAliases?: readonly string[];
}
const clearingSystems = Object.freeze(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "parameters", "clearing-systems.json"),
      "utf8",
    ),
  ) as ClearingSystemReference[],
);

const splitSeed = <T extends readonly (string | undefined)[]>(row: string): T =>
  row.split("|") as unknown as T;

const bankCatalogue = loadBankServiceCatalogue();
const banks = activeBankServices(bankCatalogue);

interface NegativeBankCounterparty {
  readonly counterpartyId: string;
  readonly name: string;
  readonly country: string;
  readonly partyType: "BANK";
  readonly bankServiceId: null;
}

interface NegativeFixtureDocument {
  readonly schemaVersion: number;
  readonly fixtureClass: "QA_NEGATIVE_MISSING_BIC";
  readonly items: readonly NegativeBankCounterparty[];
}

const negativeFixtureDocument = JSON.parse(readFileSync(
  resolve(process.cwd(), "parameters", "bank-counterparty-negative-fixtures.json"),
  "utf8",
)) as NegativeFixtureDocument;
const negativeBankCounterparties = negativeFixtureDocument.items.map((counterparty) => ({
  ...counterparty,
  fixtureClass: negativeFixtureDocument.fixtureClass,
  selectable: false,
}));

type CustomerSeed = readonly [
  customerId: string,
  name: string,
  country: string,
  beneficiaryAccountReference: string,
  address: string,
];
const createCustomer = ([
  customerId,
  name,
  country,
  beneficiaryAccountReference,
  address,
]: CustomerSeed) => ({
  customerId,
  name,
  country,
  beneficiaryAccountReference,
  address,
});
const customers = `CUST-00001|Demo Global Trading Ltd.|HK|DEMO-CUSTOMER-HKD-001|Hong Kong
CUST-00002|Demo International Commerce Ltd.|SG|DEMO-CUSTOMER-USD-002|Singapore
CUST-00003|Demo European Importers GmbH|DE|DEMO-CUSTOMER-EUR-003|Frankfurt, Germany
CUST-00004|Demo Sterling Retailers Ltd.|GB|DEMO-CUSTOMER-GBP-004|London, United Kingdom
CUST-00005|Demo Mainland Trading Co., Ltd.|CN|DEMO-CUSTOMER-CNY-005|Shanghai, China`
  .split("\n")
  .map((row) => createCustomer(splitSeed<CustomerSeed>(row)));
const counterparties = [
  ...banks.filter((bank) => bank.usageGroup !== "OWN_BANK_IDENTITY").map((bank) => ({
    counterpartyId: bank.bic,
    bankServiceId: bank.bankServiceId,
    name: bank.name,
    country: bank.country,
    partyType: "BANK" as const,
    selectable: true,
  })),
  ...customers.map((customer) => ({
    counterpartyId: customer.customerId,
    name: customer.name,
    country: customer.country,
    beneficiaryAccountReference: customer.beneficiaryAccountReference,
    address: customer.address,
    partyType: "CUSTOMER" as const,
  })),
] as const;
const currencies = [
  "USD",
  "GBP",
  "EUR",
  "SGD",
  "JPY",
  "HKD",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
].map((code) => ({
  code,
  decimals: code === "JPY" ? 0 : 2,
  standard: "ISO 4217",
}));
const countries = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["SG", "Singapore"],
  ["JP", "Japan"],
  ["HK", "Hong Kong"],
  ["AU", "Australia"],
  ["CA", "Canada"],
  ["CH", "Switzerland"],
  ["CN", "China"],
  ["TW", "Taiwan"],
  ["ZA", "South Africa"],
  ["AE", "United Arab Emirates"],
  ["KR", "South Korea"],
].map(([code, name]) => ({
  code,
  name,
  standard: "ISO 3166-1 alpha-2",
  status: "ACTIVE",
}));
type BranchSeed = readonly [
  branchCode: string,
  branchName: string,
  legalEntityCode: string,
  legalEntityName: string,
  countryCode: string,
];
const createBookingBranch = ([
  branchCode,
  branchName,
  legalEntityCode,
  legalEntityName,
  countryCode,
]: BranchSeed) => ({
  branchCode,
  branchName,
  legalEntityCode,
  legalEntityName,
  countryCode,
  status: "ACTIVE",
  validFrom: "2026-01-01",
  validTo: "2099-12-31",
});
const bookingBranches = `HK01|Hong Kong Branch|BASELINE-HK|Baseline Bank Hong Kong|HK
SG01|Singapore Branch|BASELINE-SG|Baseline Bank Singapore|SG
GB01|London Branch|BASELINE-GB|Baseline Bank London|GB
US01|New York Branch|BASELINE-US|Baseline Bank New York|US
TW01|Taipei Branch|DEMO-TW|Demo Bank Taiwan|TW
ZA01|Johannesburg Branch|DEMO-ZA|Demo Bank South Africa|ZA
AE01|Dubai Branch|DEMO-AE|Demo Bank UAE|AE
DE01|Frankfurt Branch|DEMO-DE|Demo Bank Germany|DE
CN01|Shanghai Branch|DEMO-CN|Demo Bank China|CN
KR01|Seoul Branch|DEMO-KR|Demo Bank South Korea|KR`
  .split("\n")
  .map((row) => createBookingBranch(splitSeed<BranchSeed>(row)));
const bankService = (bank: BankServiceRecord) => ({
  ...bank,
  partyType: "BANK" as const,
});
const accounts = banks.filter((bank) => bank.demoNostro).map((bank, index) => ({
  id: `DEMO-NOSTRO-${String(index + 1).padStart(3, "0")}`,
  currency: [
    "USD",
    "GBP",
    "EUR",
    "SGD",
    "JPY",
    "HKD",
    "AUD",
    "CAD",
    "CHF",
    "CNY",
  ][index],
  ownerBic: bank.bic,
  maskedAccount: `****${String(4801 + index)}`,
  status: "ACTIVE",
  dataClass: "FICTIONAL_ACCOUNT",
}));

function enforceFailureMode(): void {
  if (process.env["MOCK_FAILURE_MODE"] === "unavailable")
    throw new ServiceUnavailableException("Configured mock outage");
}

const guarded = <T>(handler: () => T): T => {
  enforceFailureMode();
  return handler();
};

const referenceCollection = <T, M extends Record<string, unknown>>(
  items: readonly T[],
  source: string,
  disclaimer: string,
  metadata?: M,
) => ({ items, source, ...metadata, disclaimer });

interface PageRequest<T, R> {
  readonly items: readonly T[];
  readonly pageValue: string;
  readonly pageSizeValue: string;
  readonly query: string;
  readonly searchText: (item: T) => string;
  readonly present: (item: T) => R;
  readonly source: string;
  readonly disclaimer: string;
}

const pagedReference = <T, R>({
  items,
  pageValue,
  pageSizeValue,
  query,
  searchText,
  present,
  source,
  disclaimer,
}: PageRequest<T, R>) => {
  const requestedPage = Math.max(1, Number.parseInt(pageValue, 10) || 1);
  const pageSize = Math.min(
    20,
    Math.max(1, Number.parseInt(pageSizeValue, 10) || 5),
  );
  const term = query.trim().toUpperCase();
  const filtered = term
    ? items.filter((item) => searchText(item).toUpperCase().includes(term))
    : items;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const page = totalPages ? Math.min(requestedPage, totalPages) : 1;
  return {
    items: filtered
      .slice((page - 1) * pageSize, page * pageSize)
      .map(present),
    page,
    pageSize,
    total: filtered.length,
    totalPages,
    source,
    disclaimer,
  };
};

@Controller("mock")
class MockController {
  @Get("currencies") currencies(): unknown {
    return guarded(() => currencies);
  }
  @Get("countries") countries(): unknown {
    return guarded(() =>
      referenceCollection(
        countries,
        "MOCK_COUNTRY_STANDING_DATA",
        "Synthetic prototype standing data; production must use governed reference data.",
      ),
    );
  }
  @Get("booking-branches") bookingBranches(): unknown {
    return guarded(() =>
      referenceCollection(
        bookingBranches,
        "MOCK_ENTITY_STANDING_DATA",
        "Synthetic prototype standing data.",
        { entityMeaning: "OWN_BOOKING_BRANCH_NOT_COUNTERPARTY" },
      ),
    );
  }
  @Get("clearing-systems") clearingSystems(
    @Query("currency") currency = "",
    @Query("settlementCountry") settlementCountry = "",
  ): unknown {
    enforceFailureMode();
    const at = Date.now();
    const requestedCurrency = currency.trim().toUpperCase();
    const requestedCountry = settlementCountry.trim().toUpperCase();
    const items = clearingSystems.filter(
      (system) =>
        system.status === "ACTIVE" &&
        Date.parse(system.validFrom) <= at &&
        at <= Date.parse(system.validTo) &&
        (!requestedCurrency ||
          system.supportedCurrency === requestedCurrency) &&
        (!requestedCountry ||
          system.settlementCountry === requestedCountry ||
          system.eligibleCountries.includes(requestedCountry)),
    );
    return {
      items,
      source: "MOCK_CLEARING_SYSTEM_STANDING_DATA",
      aliasPolicy: "TARGET/TARGET2 are legacy aliases; UI must display T2.",
      disclaimer:
        "Synthetic prototype capability data; production must use governed scheme directories and live reachability.",
    };
  }
  @Get("banks") bankPage(
    @Query("page") pageValue = "1",
    @Query("pageSize") pageSizeValue = "5",
    @Query("query") query = "",
  ): unknown {
    return guarded(() =>
      pagedReference({
        items: banks,
        pageValue,
        pageSizeValue,
        query,
        searchText: (bank) =>
          `${bank.bic} ${bank.name} ${bank.country} ${bank.city}`,
        present: bankService,
        source: "MOCK_BANK_SERVICE",
        disclaimer:
          "BIC examples only; not licensed SwiftRef SSI or account data.",
      }),
    );
  }
  @Get("counterparties") counterpartyPage(): unknown {
    return guarded(() =>
      referenceCollection(
        counterparties,
        "MOCK_COUNTERPARTY_MASTER",
        "Synthetic customer master data; bank BICs remain governed by the BIC Directory.",
      ),
    );
  }
  @Get("qa/negative-bank-counterparties/:id") qaNegativeBankCounterparty(
    @Param("id") id: string,
  ): unknown {
    enforceFailureMode();
    if (process.env["ENABLE_QA_NEGATIVE_FIXTURES"] !== "true")
      throw new NotFoundException("QA negative fixture not enabled");
    const fixture = negativeBankCounterparties.find(
      ({ counterpartyId }) => counterpartyId === id,
    );
    if (!fixture) throw new NotFoundException("QA negative fixture not found");
    return fixture;
  }
  @Get("customers") customerPage(
    @Query("page") pageValue = "1",
    @Query("pageSize") pageSizeValue = "5",
    @Query("query") query = "",
  ): unknown {
    return guarded(() =>
      pagedReference({
        items: customers,
        pageValue,
        pageSizeValue,
        query,
        searchText: (customer) =>
          `${customer.customerId} ${customer.name} ${customer.country}`,
        present: (customer) => customer,
        source: "MOCK_CUSTOMER_SERVICE",
        disclaimer: "Synthetic customer master data for demo testing only.",
      }),
    );
  }
  @Get("banks/:bic") bank(@Param("bic") bic: string): unknown {
    enforceFailureMode();
    const value = banks.find((bank) => bank.bic === bic.toUpperCase());
    if (!value) throw new NotFoundException("Bank not found");
    return {
      ...bankService(value),
      disclaimer:
        "Validate against the bank licensed SwiftRef/BIC Directory before production use.",
    };
  }
  @Get("accounts/:id") account(@Param("id") id: string): unknown {
    enforceFailureMode();
    const value = accounts.find((account) => account.id === id);
    if (!value) throw new NotFoundException("Account not found");
    return value;
  }
  @Get("nostros") nostro(
    @Query("currency") currency: string,
    @Query("bankBic") bankBic: string,
  ): unknown {
    enforceFailureMode();
    return accounts.filter(
      (account) =>
        account.currency === currency && account.ownerBic === bankBic,
    );
  }
  @Get("aml/screening-status/:caseId") aml(
    @Param("caseId") caseId: string,
  ): unknown {
    enforceFailureMode();
    return {
      caseId,
      status: "CLEAR",
      source: "DEMO_MOCK_ONLY",
      checkedAt: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [MockController] })
class MockModule {}
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(MockModule);
  app.enableCors();
  await app.listen(Number(process.env["MOCK_SERVICES_PORT"] ?? 3102));
}
void bootstrap();
