import "reflect-metadata";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";

jest.mock("@nestjs/core", () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue({
      enableCors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

type Controller = Record<string, (...args: string[]) => unknown>;

describe("mock reference service contracts", () => {
  let controller: Controller;

  beforeAll(async () => {
    await import("./main");
    const moduleType = (NestFactory.create as jest.Mock).mock.calls[0]?.[0];
    const [controllerType] = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      moduleType,
    ) as Array<new () => Controller>;
    controller = new controllerType();
  });

  afterEach(() => {
    delete process.env["MOCK_FAILURE_MODE"];
    delete process.env["ENABLE_QA_NEGATIVE_FIXTURES"];
  });

  it("returns stable Bank Service identity separate from read-only BIC", () => {
    const page = controller["bankPage"]("1", "5", "CITI") as {
      items: Array<Record<string, unknown>>;
      source: string;
    };

    expect(page.source).toBe("MOCK_BANK_SERVICE");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      bankServiceId: "BANK-SVC-CITIUS33",
      bic: "CITIUS33",
      partyType: "BANK",
    });
    expect(page.items[0]?.["bankServiceId"]).not.toBe(page.items[0]?.["bic"]);
  });

  it("normalises paging, caps page size and searches without case sensitivity", () => {
    const page = controller["bankPage"]("99", "500", "bank") as {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      items: unknown[];
    };

    expect(page.pageSize).toBe(20);
    expect(page.page).toBe(page.totalPages);
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(page.pageSize);
  });

  it("filters active clearing systems by governed currency and country", () => {
    const result = controller["clearingSystems"]("usd", "us") as {
      items: Array<{
        supportedCurrency: string;
        settlementCountry: string;
        status: string;
      }>;
    };

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          supportedCurrency: "USD",
          settlementCountry: "US",
          status: "ACTIVE",
        }),
      ]),
    );
  });

  it("keeps customers and banks economically classified", () => {
    const result = controller["counterpartyPage"]() as {
      items: Array<{ counterpartyId: string; partyType: string; bankServiceId?: string | null; fixtureClass?: string; selectable?: boolean }>;
    };
    expect(result.items.some(({ partyType }) => partyType === "BANK")).toBe(
      true,
    );
    expect(result.items.some(({ partyType }) => partyType === "CUSTOMER")).toBe(
      true,
    );
    const normalBanks = result.items.filter(({ partyType, fixtureClass }) => partyType === "BANK" && !fixtureClass);
    expect(normalBanks).toHaveLength(27);
    expect(normalBanks.every(({ bankServiceId }) => Boolean(bankServiceId))).toBe(true);
    expect(result.items.some(({ fixtureClass }) => fixtureClass === "QA_NEGATIVE_MISSING_BIC")).toBe(false);
  });

  it("makes synthetic directory banks selectable without creating SSI or Nostro", () => {
    const page = controller["bankPage"]("1", "20", "DMOA") as { items: Array<{ bic: string; usageGroup: string }> };
    expect(page.items.map(({ bic }) => bic)).toEqual(["DMOASGSG", "DMOAJPJT", "DMOACHZZ", "DMOAAEAD"]);
    expect(page.items.every(({ usageGroup }) => usageGroup === "DIRECTORY_ONLY_NO_SSI")).toBe(true);
    expect(controller["nostro"]("USD", "DMOAAEAD")).toEqual([]);
  });

  it("does not expose inactive or QA-negative banks in the selector", () => {
    const inactive = controller["bankPage"]("1", "20", "DMOZUSN1") as { total: number };
    const negative = controller["bankPage"]("1", "20", "QA-NEG-BANK") as { total: number };
    expect(inactive.total).toBe(0);
    expect(negative.total).toBe(0);
    expect(() => controller["bank"]("DMOZUSN1")).toThrow(NotFoundException);
    expect(() => controller["qaNegativeBankCounterparty"]("QA-NEG-BANK-MISSING-BIC-01")).toThrow(NotFoundException);
  });

  it("exposes an explicitly classified missing-BIC fixture only in governed QA mode", () => {
    process.env["ENABLE_QA_NEGATIVE_FIXTURES"] = "true";
    expect(controller["qaNegativeBankCounterparty"]("QA-NEG-BANK-MISSING-BIC-01")).toMatchObject({
      counterpartyId: "QA-NEG-BANK-MISSING-BIC-01",
      fixtureClass: "QA_NEGATIVE_MISSING_BIC",
      bankServiceId: null,
      selectable: false,
    });
  });

  it("publishes governed reference metadata for currency, country and entity", () => {
    const currencyItems = controller["currencies"]() as Array<{
      code: string;
      decimals: number;
    }>;
    const countries = controller["countries"]() as {
      items: Array<{ code: string; status: string }>;
      source: string;
    };
    const branches = controller["bookingBranches"]() as {
      items: Array<{ branchCode: string; status: string }>;
      entityMeaning: string;
    };

    expect(currencyItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "JPY", decimals: 0 }),
        expect.objectContaining({ code: "USD", decimals: 2 }),
      ]),
    );
    expect(countries.source).toBe("MOCK_COUNTRY_STANDING_DATA");
    expect(countries.items.every(({ status }) => status === "ACTIVE")).toBe(
      true,
    );
    expect(branches.entityMeaning).toBe("OWN_BOOKING_BRANCH_NOT_COUNTERPARTY");
    expect(branches.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ branchCode: "HK01", status: "ACTIVE" }),
      ]),
    );
  });

  it("returns exact bank, account and AML records without broad fallback", () => {
    expect(controller["bank"]("citius33")).toMatchObject({
      bic: "CITIUS33",
      partyType: "BANK",
    });
    expect(controller["account"]("DEMO-NOSTRO-001")).toMatchObject({
      id: "DEMO-NOSTRO-001",
      currency: "USD",
      ownerBic: "CITIUS33",
    });
    expect(controller["aml"]("CASE-1")).toMatchObject({
      caseId: "CASE-1",
      status: "CLEAR",
      source: "DEMO_MOCK_ONLY",
    });
  });

  it("keeps customer search paged and distinct from Bank Service", () => {
    const page = controller["customerPage"]("-4", "2", "global") as {
      page: number;
      pageSize: number;
      total: number;
      items: Array<{ customerId: string }>;
      source: string;
    };
    expect(page).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 1,
      source: "MOCK_CUSTOMER_SERVICE",
    });
    expect(page.items[0]?.customerId).toBe("CUST-00001");
  });

  it("returns not found instead of inventing a bank or account", () => {
    expect(() => controller["bank"]("UNKNOWN")).toThrow(NotFoundException);
    expect(() => controller["account"]("UNKNOWN")).toThrow(NotFoundException);
  });

  it("fails closed for every reference endpoint during a configured outage", () => {
    process.env["MOCK_FAILURE_MODE"] = "unavailable";
    expect(() => controller["bankPage"]()).toThrow(ServiceUnavailableException);
    expect(() => controller["customerPage"]()).toThrow(
      ServiceUnavailableException,
    );
    expect(() => controller["nostro"]("USD", "CITIUS33")).toThrow(
      ServiceUnavailableException,
    );
  });

  it("returns only the requested nostro relationship", () => {
    const accounts = controller["nostro"]("USD", "CITIUS33") as Array<{
      currency: string;
      ownerBic: string;
      status: string;
    }>;
    expect(accounts).toEqual([
      expect.objectContaining({
        currency: "USD",
        ownerBic: "CITIUS33",
        status: "ACTIVE",
      }),
    ]);
  });
});
