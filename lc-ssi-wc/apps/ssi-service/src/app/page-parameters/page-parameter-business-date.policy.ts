import { Inject, Injectable, Optional } from "@nestjs/common";
import type { PageParameterBusinessDateMetadata } from "@ssi/contracts";

export interface PageParameterClock {
  now(): Date;
}

export interface PageParameterBusinessCalendar {
  isBusinessDate(isoDate: string): boolean;
}

export interface BusinessDaysAddRequest {
  readonly date: string;
  readonly businessDays: number;
}

export interface BusinessDaysAddResult {
  readonly date: string;
  readonly businessDays: number;
  readonly calendarCode: string;
  readonly adjustedDate: string;
  readonly skippedDates: readonly {
    readonly date: string;
    readonly reasonCode: string;
    readonly reasonDescription: string;
  }[];
}

/** Synchronous cache/adapter port matching POST /business-days/add. */
export interface PageParameterBusinessDaysPort {
  readonly calendarMode: PageParameterBusinessDateMetadata["calendarMode"];
  readonly holidayIntegrationStatus: PageParameterBusinessDateMetadata["holidayIntegrationStatus"];
  add(request: BusinessDaysAddRequest): BusinessDaysAddResult;
}

const shiftedIsoDate = (isoDate: string, dayOffset: number): string => {
  const [year = 0, month = 0, day = 0] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset))
    .toISOString()
    .slice(0, 10);
};

export const PAGE_PARAMETER_CLOCK = Symbol("PAGE_PARAMETER_CLOCK");
export const PAGE_PARAMETER_BUSINESS_CALENDAR = Symbol(
  "PAGE_PARAMETER_BUSINESS_CALENDAR",
);
export const PAGE_PARAMETER_BUSINESS_DAYS_PORT = Symbol(
  "PAGE_PARAMETER_BUSINESS_DAYS_PORT",
);
export const BUSINESS_DAYS_SERVICE_ENDPOINT_ENV =
  "BUSINESS_DAYS_SERVICE_ENDPOINT";

export const configuredBusinessDaysServiceEndpoint = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined =>
  environment[BUSINESS_DAYS_SERVICE_ENDPOINT_ENV]?.trim() || undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIME_ZONE = "Asia/Hong_Kong";

@Injectable()
export class SystemPageParameterClock implements PageParameterClock {
  now(): Date {
    return new Date();
  }
}

/**
 * Controlled startup fallback only. The balance-workbench reference mock is an
 * illustrative TW calendar, not a production authority, so its holiday data is
 * deliberately not copied into this service. A configured implementation can
 * replace this policy through PAGE_PARAMETER_BUSINESS_DAYS_PORT.
 */
@Injectable()
export class WeekdayBusinessCalendar implements PageParameterBusinessCalendar {
  isBusinessDate(isoDate: string): boolean {
    if (!ISO_DATE.test(isoDate)) return false;
    const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
    return day !== 0 && day !== 6;
  }
}

/**
 * Implements the balance-compatible add contract without claiming holiday
 * coverage. It keeps local startup independent of the reference mock checkout.
 */
@Injectable()
export class WeekdayBusinessDaysPort implements PageParameterBusinessDaysPort {
  readonly calendarMode = "WEEKDAY_FALLBACK" as const;
  readonly holidayIntegrationStatus = "NOT_EVALUATED" as const;

  constructor(
    @Inject(PAGE_PARAMETER_BUSINESS_CALENDAR)
    private readonly calendar: PageParameterBusinessCalendar,
  ) {}

  add(request: BusinessDaysAddRequest): BusinessDaysAddResult {
    if (
      !ISO_DATE.test(request.date) ||
      !Number.isInteger(request.businessDays) ||
      request.businessDays < 0
    )
      throw new Error("INVALID_BUSINESS_DAYS_REQUEST");
    let adjustedDate = request.date;
    let remaining = request.businessDays;
    const skippedDates: BusinessDaysAddResult["skippedDates"][number][] = [];
    while (remaining > 0) {
      adjustedDate = this.followingDate(adjustedDate);
      if (this.calendar.isBusinessDate(adjustedDate)) remaining -= 1;
      else
        skippedDates.push({
          date: adjustedDate,
          reasonCode: "WEEKEND",
          reasonDescription:
            "Weekend-only fallback; holiday calendar not evaluated.",
        });
    }
    return {
      ...request,
      calendarCode: "WEEKDAY_ONLY",
      adjustedDate,
      skippedDates,
    };
  }

  private followingDate(isoDate: string): string {
    return shiftedIsoDate(isoDate, 1);
  }
}

@Injectable()
export class PageParameterBusinessDatePolicy {
  private readonly clock: PageParameterClock;
  private readonly calendar: PageParameterBusinessCalendar;
  private readonly businessDays: PageParameterBusinessDaysPort | undefined;
  private currentMetadata: PageParameterBusinessDateMetadata = {
    timeZone: DEFAULT_TIME_ZONE,
    calendarMode: "WEEKDAY_FALLBACK",
    calendarCode: "WEEKDAY_ONLY",
    holidayIntegrationStatus: "NOT_EVALUATED",
    sourceContract: {
      method: "POST",
      path: "/business-days/add",
      endpointEnvironmentVariable: BUSINESS_DAYS_SERVICE_ENDPOINT_ENV,
    },
  };

  constructor(
    @Optional() @Inject(PAGE_PARAMETER_CLOCK) clock?: PageParameterClock,
    @Optional()
    @Inject(PAGE_PARAMETER_BUSINESS_CALENDAR)
    calendar?: PageParameterBusinessCalendar,
    @Optional()
    @Inject(PAGE_PARAMETER_BUSINESS_DAYS_PORT)
    businessDays?: PageParameterBusinessDaysPort,
  ) {
    this.clock = clock ?? new SystemPageParameterClock();
    this.calendar = calendar ?? new WeekdayBusinessCalendar();
    this.businessDays = businessDays;
  }

  firstAvailableDate(timeZone = DEFAULT_TIME_ZONE): string {
    this.currentMetadata = { ...this.currentMetadata, timeZone };
    let date = this.localIsoDate(this.clock.now(), timeZone);
    if (this.businessDays) {
      const result = this.businessDays.add({
        date: this.previousDate(date),
        businessDays: 1,
      });
      this.currentMetadata = {
        timeZone,
        calendarMode: this.businessDays.calendarMode,
        calendarCode: result.calendarCode,
        holidayIntegrationStatus: this.businessDays.holidayIntegrationStatus,
        sourceContract: this.currentMetadata.sourceContract,
      };
      return result.adjustedDate;
    }
    while (!this.calendar.isBusinessDate(date)) date = this.followingDate(date);
    return date;
  }

  metadata(): PageParameterBusinessDateMetadata {
    return this.currentMetadata;
  }

  private localIsoDate(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  }

  private followingDate(isoDate: string): string {
    return shiftedIsoDate(isoDate, 1);
  }

  private previousDate(isoDate: string): string {
    return shiftedIsoDate(isoDate, -1);
  }
}
