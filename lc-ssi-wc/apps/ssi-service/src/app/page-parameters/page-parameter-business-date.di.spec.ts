import { Test } from "@nestjs/testing";
import { AuditRetentionPolicy } from "../audit-retention/audit-retention.policy";
import { AppModule } from "../app.module";
import { SettlementController } from "../settlement.controller";
import { CompositeResolutionPageDefinitionSource } from "./composite-resolution-page-definition.source";
import { MappingResolutionPageDefinitionSource } from "./mapping-resolution-page-definition.source";
import { PaymentResolutionPageDefinitionSource } from "./payment-resolution-page-definition.source";
import { PAYMENT_SETTLEMENT_RESOLUTION_PORT } from "./payment-resolution-page-submission.adapter";
import { RESOLUTION_PAGE_DEFINITION_SOURCE } from "./resolution-page-definition.source";
import {
  PAGE_PARAMETER_BUSINESS_CALENDAR,
  PAGE_PARAMETER_BUSINESS_DAYS_PORT,
  PAGE_PARAMETER_CLOCK,
  PageParameterBusinessDatePolicy,
  type PageParameterBusinessDaysPort,
  type PageParameterClock,
  WeekdayBusinessCalendar,
  WeekdayBusinessDaysPort,
} from "./page-parameter-business-date.policy";

describe("Page parameter business-date dependency injection", () => {
  it("allows AppModule to replace the startup fallback with a balance-compatible adapter", async () => {
    const fixedClock: PageParameterClock = {
      now: () => new Date("2025-12-31T16:30:00.000Z"),
    };
    const adapter: PageParameterBusinessDaysPort = {
      calendarMode: "BUSINESS_DAYS_ADD",
      holidayIntegrationStatus: "CONFIGURED",
      add: jest.fn(() => ({
        date: "2025-12-31",
        businessDays: 1,
        calendarCode: "TW",
        adjustedDate: "2026-01-02",
        skippedDates: [
          {
            date: "2026-01-01",
            reasonCode: "PUBLIC_HOLIDAY",
            reasonDescription: "Configured calendar holiday",
          },
        ],
      })),
    };
    const appProviders = Reflect.getMetadata(
      "providers",
      AppModule,
    ) as readonly (
      { readonly provide?: symbol } | (new (...arguments_: never[]) => unknown)
    )[];
    expect(appProviders).toEqual(
      expect.arrayContaining([
        PageParameterBusinessDatePolicy,
        expect.objectContaining({ provide: PAGE_PARAMETER_CLOCK }),
        expect.objectContaining({
          provide: PAGE_PARAMETER_BUSINESS_CALENDAR,
        }),
        expect.objectContaining({ provide: PAGE_PARAMETER_BUSINESS_DAYS_PORT }),
      ]),
    );

    const module = await Test.createTestingModule({
      providers: [
        WeekdayBusinessCalendar,
        {
          provide: PAGE_PARAMETER_BUSINESS_CALENDAR,
          useExisting: WeekdayBusinessCalendar,
        },
        WeekdayBusinessDaysPort,
        {
          provide: PAGE_PARAMETER_BUSINESS_DAYS_PORT,
          useExisting: WeekdayBusinessDaysPort,
        },
        { provide: PAGE_PARAMETER_CLOCK, useValue: fixedClock },
        PageParameterBusinessDatePolicy,
      ],
    })
      .overrideProvider(PAGE_PARAMETER_CLOCK)
      .useValue(fixedClock)
      .overrideProvider(PAGE_PARAMETER_BUSINESS_DAYS_PORT)
      .useValue(adapter)
      .compile();

    const policy = module.get(PageParameterBusinessDatePolicy);
    expect(policy.firstAvailableDate()).toBe("2026-01-02");
    expect(policy.metadata()).toMatchObject({
      timeZone: "Asia/Hong_Kong",
      calendarMode: "BUSINESS_DAYS_ADD",
      calendarCode: "TW",
      holidayIntegrationStatus: "CONFIGURED",
    });
    expect(adapter.add).toHaveBeenCalledWith({
      date: "2025-12-31",
      businessDays: 1,
    });
    await module.close();
  });

  it("wires AppModule factories without changing adapter contracts", () => {
    const providers = Reflect.getMetadata("providers", AppModule) as readonly {
      readonly provide?: unknown;
      readonly useFactory?: (...arguments_: never[]) => unknown;
    }[];
    const provider = (token: unknown) =>
      providers.find((candidate) => candidate.provide === token)!;

    const resolve = jest.fn((request) => ({ request }));
    const moduleRef = {
      get: jest.fn(
        () => ({ resolve }) as Pick<SettlementController, "resolve">,
      ),
    };
    const settlementPort = provider(PAYMENT_SETTLEMENT_RESOLUTION_PORT)
      .useFactory!(moduleRef as never) as {
      resolve(request: unknown): unknown;
    };
    const request = { messageType: "pacs.009.001.08" };
    expect(settlementPort.resolve(request)).toEqual({ request });
    expect(moduleRef.get).toHaveBeenCalledWith(SettlementController, {
      strict: false,
    });

    const mapping = {} as MappingResolutionPageDefinitionSource;
    const payment = {} as PaymentResolutionPageDefinitionSource;
    expect(
      provider(RESOLUTION_PAGE_DEFINITION_SOURCE).useFactory!(
        mapping as never,
        payment as never,
      ),
    ).toBeInstanceOf(CompositeResolutionPageDefinitionSource);

    const audit = {} as AuditRetentionPolicy;
    const factory = jest
      .spyOn(AuditRetentionPolicy, "fromEnvironment")
      .mockReturnValueOnce(audit);
    expect(provider(AuditRetentionPolicy).useFactory!()).toBe(audit);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
