export const MAINTENANCE_INDEX_ALL_STATUSES = ["ACTIVE", "SUPPRESSED"] as const;

export function maintenanceIndexStatuses(status?: string): readonly string[] {
  return !status || status === "ALL"
    ? MAINTENANCE_INDEX_ALL_STATUSES
    : [status];
}
