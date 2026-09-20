export interface ResolutionCurrencyCoverageRow {
  readonly standardsRelease: string;
  readonly businessDomain: "PAYMENT" | "TREASURY" | "TRADE_FINANCE";
  readonly currency: string;
  readonly status: "ACTIVE" | "INACTIVE";
}

export type ResolutionCurrencyReconciliationMode =
  "APPROVAL_DISCOVERY" | "FULL_RESYNC";

export interface ResolutionCurrencyReconciliationPlan {
  readonly insert: readonly ResolutionCurrencyCoverageRow[];
  readonly activate: readonly ResolutionCurrencyCoverageRow[];
  readonly inactivate: readonly ResolutionCurrencyCoverageRow[];
  readonly keep: readonly ResolutionCurrencyCoverageRow[];
}

const key = (row: ResolutionCurrencyCoverageRow): string =>
  `${row.standardsRelease}\u0000${row.businessDomain}\u0000${row.currency}`;

const sorted = (
  rows: readonly ResolutionCurrencyCoverageRow[],
): ResolutionCurrencyCoverageRow[] =>
  [...rows].sort((left, right) => key(left).localeCompare(key(right)));

export function planResolutionCurrencyReconciliation(
  existing: readonly ResolutionCurrencyCoverageRow[],
  discovered: readonly ResolutionCurrencyCoverageRow[],
  mode: ResolutionCurrencyReconciliationMode,
): ResolutionCurrencyReconciliationPlan {
  const oldByKey = new Map<string, ResolutionCurrencyCoverageRow>();
  for (const row of existing) {
    if (oldByKey.has(key(row)))
      throw new Error("RESOLUTION_CURRENCY_DUPLICATE_EXISTING");
    oldByKey.set(key(row), row);
  }
  const discoveredKeys = new Set(discovered.map(key));
  const insert = sorted(
    discovered
      .filter((row) => !oldByKey.has(key(row)))
      .filter(
        (row, index, rows) =>
          rows.findIndex((item) => key(item) === key(row)) === index,
      )
      .map((row) => ({ ...row, status: "ACTIVE" as const })),
  );
  const activate = sorted(
    existing.filter(
      (row) =>
        mode === "FULL_RESYNC" &&
        row.status === "INACTIVE" &&
        discoveredKeys.has(key(row)),
    ),
  );
  const inactivate = sorted(
    existing.filter(
      (row) =>
        mode === "FULL_RESYNC" &&
        row.status === "ACTIVE" &&
        !discoveredKeys.has(key(row)),
    ),
  );
  const changedKeys = new Set([...activate, ...inactivate].map(key));
  const keep = sorted(existing.filter((row) => !changedKeys.has(key(row))));
  return { insert, activate, inactivate, keep };
}
