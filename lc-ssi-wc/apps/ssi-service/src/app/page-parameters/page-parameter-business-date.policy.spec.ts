import {
  BUSINESS_DAYS_SERVICE_ENDPOINT_ENV,
  PageParameterBusinessDatePolicy,
  type PageParameterBusinessDaysPort,
  type PageParameterBusinessCalendar,
  type PageParameterClock,
  WeekdayBusinessCalendar,
  WeekdayBusinessDaysPort,
  SystemPageParameterClock,
  configuredBusinessDaysServiceEndpoint,
} from "./page-parameter-business-date.policy";

const balanceCompatiblePort = (
  add: PageParameterBusinessDaysPort["add"],
): PageParameterBusinessDaysPort => ({
  calendarMode: "BUSINESS_DAYS_ADD",
  holidayIntegrationStatus: "MOCK_REFERENCE",
  add,
});

const clock = (isoInstant: string): PageParameterClock => ({
  now: () => new Date(isoInstant),
});

describe("PageParameterBusinessDatePolicy", () => {
  it("uses local today when today is a weekday", () => {
    const policy = new PageParameterBusinessDatePolicy(
      clock("2026-09-14T04:00:00.000Z"),
      new WeekdayBusinessCalendar(),
    );

    expect(policy.firstAvailableDate()).toBe("2026-09-14");
  });

  it.each([
    ["Saturday", "2026-09-12T04:00:00.000Z"],
    ["Sunday", "2026-09-13T04:00:00.000Z"],
  ])("moves %s forward to Monday", (_day, instant) => {
    const policy = new PageParameterBusinessDatePolicy(
      clock(instant),
      new WeekdayBusinessCalendar(),
    );

    expect(policy.firstAvailableDate()).toBe("2026-09-14");
  });

  it("honours an injected authoritative holiday calendar", () => {
    const weekday = new WeekdayBusinessCalendar();
    const calendar: PageParameterBusinessCalendar = {
      isBusinessDate: (date) =>
        date !== "2026-09-14" && weekday.isBusinessDate(date),
    };
    const policy = new PageParameterBusinessDatePolicy(
      clock("2026-09-14T04:00:00.000Z"),
      calendar,
    );

    expect(policy.firstAvailableDate()).toBe("2026-09-15");
  });

  it("uses the business-days service contract to skip the controlled New Year holiday", () => {
    const add = jest.fn(() => ({
      date: "2025-12-31",
      businessDays: 1,
      calendarCode: "TW",
      adjustedDate: "2026-01-02",
      skippedDates: [
        {
          date: "2026-01-01",
          reasonCode: "PUBLIC_HOLIDAY",
          reasonDescription: "元旦",
        },
      ],
    }));
    const policy = new PageParameterBusinessDatePolicy(
      clock("2025-12-31T16:30:00.000Z"),
      new WeekdayBusinessCalendar(),
      balanceCompatiblePort(add),
    );

    expect(policy.firstAvailableDate()).toBe("2026-01-02");
    expect(add).toHaveBeenCalledWith({
      date: "2025-12-31",
      businessDays: 1,
    });
    expect(policy.metadata()).toEqual({
      timeZone: "Asia/Hong_Kong",
      calendarMode: "BUSINESS_DAYS_ADD",
      calendarCode: "TW",
      holidayIntegrationStatus: "MOCK_REFERENCE",
      sourceContract: {
        method: "POST",
        path: "/business-days/add",
        endpointEnvironmentVariable: BUSINESS_DAYS_SERVICE_ENDPOINT_ENV,
      },
    });
  });

  it("propagates a configured calendar range failure", () => {
    const policy = new PageParameterBusinessDatePolicy(
      clock("2029-01-01T04:00:00.000Z"),
      new WeekdayBusinessCalendar(),
      balanceCompatiblePort(() => {
        throw new Error("CALENDAR_RANGE_EXCEEDED");
      }),
    );

    expect(() => policy.firstAvailableDate()).toThrow(
      "CALENDAR_RANGE_EXCEEDED",
    );
  });

  it("derives today in the governed local timezone at a UTC date boundary", () => {
    const policy = new PageParameterBusinessDatePolicy(
      clock("2026-09-13T16:30:00.000Z"),
      new WeekdayBusinessCalendar(),
    );

    expect(policy.firstAvailableDate("Asia/Hong_Kong")).toBe("2026-09-14");
  });

  it("does not fabricate a business-days endpoint when it is not configured", () => {
    expect(configuredBusinessDaysServiceEndpoint({})).toBeUndefined();
    expect(
      configuredBusinessDaysServiceEndpoint({
        [BUSINESS_DAYS_SERVICE_ENDPOINT_ENV]: " http://calendar.internal:4500 ",
      }),
    ).toBe("http://calendar.internal:4500");
  });

  it("uses the process environment by default and treats whitespace as absent", () => {
    const prior = process.env[BUSINESS_DAYS_SERVICE_ENDPOINT_ENV];
    process.env[BUSINESS_DAYS_SERVICE_ENDPOINT_ENV] = "   ";
    try {
      expect(configuredBusinessDaysServiceEndpoint()).toBeUndefined();
    } finally {
      if (prior === undefined)
        delete process.env[BUSINESS_DAYS_SERVICE_ENDPOINT_ENV];
      else process.env[BUSINESS_DAYS_SERVICE_ENDPOINT_ENV] = prior;
    }
  });

  it("rejects malformed calendar input", () => {
    const calendar = new WeekdayBusinessCalendar();
    const port = new WeekdayBusinessDaysPort(calendar);
    expect(calendar.isBusinessDate("not-a-date")).toBe(false);
    expect(() => port.add({ date: "bad", businessDays: 1 })).toThrow(
      "INVALID_BUSINESS_DAYS_REQUEST",
    );
    expect(() => port.add({ date: "2026-09-14", businessDays: -1 })).toThrow(
      "INVALID_BUSINESS_DAYS_REQUEST",
    );
    expect(() => port.add({ date: "2026-09-14", businessDays: 0.5 })).toThrow(
      "INVALID_BUSINESS_DAYS_REQUEST",
    );
  });

  it("returns the same date for zero days and records skipped weekend dates", () => {
    const port = new WeekdayBusinessDaysPort(new WeekdayBusinessCalendar());
    expect(port.add({ date: "2026-09-14", businessDays: 0 })).toMatchObject({
      adjustedDate: "2026-09-14",
      skippedDates: [],
    });
    expect(port.add({ date: "2026-09-11", businessDays: 1 })).toMatchObject({
      adjustedDate: "2026-09-14",
      skippedDates: [
        { date: "2026-09-12", reasonCode: "WEEKEND" },
        { date: "2026-09-13", reasonCode: "WEEKEND" },
      ],
    });
  });

  it("can be constructed with its default clock and calendar", () => {
    expect(new SystemPageParameterClock().now()).toBeInstanceOf(Date);
    expect(new PageParameterBusinessDatePolicy().metadata()).toMatchObject({
      calendarMode: "WEEKDAY_FALLBACK",
      calendarCode: "WEEKDAY_ONLY",
    });
  });
});
