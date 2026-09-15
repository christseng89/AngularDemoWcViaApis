import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ClearingSystemReference {
  readonly code: string;
  readonly name: string;
  readonly supportedCurrency: string;
  readonly settlementCountry: string;
  readonly marketScope: "DOMESTIC" | "MARKET_SPECIFIC" | "PAN_REGIONAL";
  readonly eligibleCountries: readonly string[];
  readonly settlementMarket: string;
  readonly paymentServiceLevel: "HIGH_VALUE" | "RETAIL" | "INSTANT";
  readonly schemeType: "RTGS" | "LVPS" | "ACH" | "IPS";
  readonly status: "ACTIVE" | "INACTIVE";
  readonly validFrom: string;
  readonly validTo: string;
  readonly legacyAliases?: readonly string[];
}

export const CLEARING_SYSTEMS = Object.freeze(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "parameters", "clearing-systems.json"),
      "utf8",
    ),
  ) as ClearingSystemReference[],
);
