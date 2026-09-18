export interface MaintenanceServerPageRow {
  readonly status: string;
}

export function assertMaintenanceServerPage(
  rows: readonly MaintenanceServerPageRow[],
  requestedStatus: string,
): void {
  const allowed =
    requestedStatus === "ALL"
      ? new Set(["ACTIVE", "SUPPRESSED"])
      : new Set([requestedStatus]);
  if (rows.some((row) => !allowed.has(row.status)))
    throw new Error("MAINTENANCE_INDEX_SERVER_PAGE_STATUS_MISMATCH");
}
