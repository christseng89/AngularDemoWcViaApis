import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";

/** Controlled Page Parameter identity shared by bootstrap, approval and Resync. */
@Injectable()
export class ResolutionCurrencyCoveragePolicy {
  readonly asOfDate: string;
  private readonly defaults: readonly {
    businessDomain: "PAYMENT" | "TREASURY" | "TRADE_FINANCE";
    messageType?: string;
    currency?: string;
    bookingEntity?: string;
  }[];

  constructor() {
    const raw: unknown = JSON.parse(
      readFileSync(
        join(process.cwd(), "parameters", "resolution-currency-coverage.sr2026.json"),
        "utf8",
      ),
    );
    if (
      typeof raw !== "object" || raw === null ||
      !("schemaVersion" in raw) || raw.schemaVersion !== "1.0" ||
      !("standardsRelease" in raw) || raw.standardsRelease !== "SR2026" ||
      !("discoveryAsOfDate" in raw) ||
      typeof raw.discoveryAsOfDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.discoveryAsOfDate) ||
      !Array.isArray((raw as { defaults?: unknown }).defaults)
    ) throw new Error("RESOLUTION_CURRENCY_POLICY_INVALID");
    this.asOfDate = raw.discoveryAsOfDate;
    const defaults = (raw as { defaults?: unknown }).defaults as unknown[];
    if (defaults.some((item) => {
      if (typeof item !== "object" || item === null) return true;
      const value = item as Record<string, unknown>;
      return !["PAYMENT", "TREASURY", "TRADE_FINANCE"].includes(String(value["businessDomain"])) ||
        (value["messageType"] !== undefined && typeof value["messageType"] !== "string") ||
        (value["currency"] !== undefined && (typeof value["currency"] !== "string" || !/^[A-Z]{3}$/.test(value["currency"]))) ||
        (value["bookingEntity"] !== undefined && typeof value["bookingEntity"] !== "string");
    })) throw new Error("RESOLUTION_CURRENCY_POLICY_INVALID");
    this.defaults = defaults as typeof this.defaults;
  }

  defaultFor(
    businessDomain: "PAYMENT" | "TREASURY" | "TRADE_FINANCE",
    messageType?: string,
  ): { readonly currency?: string; readonly bookingEntity?: string } {
    const scoped = this.defaults.find((row) => row.businessDomain === businessDomain && row.messageType === messageType);
    const fallback = this.defaults.find((row) => row.businessDomain === businessDomain && !row.messageType);
    const selected = scoped ?? fallback;
    return selected ? {
      ...(selected.currency ? { currency: selected.currency } : {}),
      ...(selected.bookingEntity ? { bookingEntity: selected.bookingEntity } : {}),
    } : {};
  }
}
