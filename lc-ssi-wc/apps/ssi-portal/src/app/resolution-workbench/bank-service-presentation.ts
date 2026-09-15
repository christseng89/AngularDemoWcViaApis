import type { PageParameterLookupResult } from "@ssi/contracts";

export const bankServiceDescription = (
  item: PageParameterLookupResult,
): string => {
  const description =
    item.bankName ?? item.displayValue.replace(`${item.bic} — `, "");
  return description === item.bic ? "" : description;
};
