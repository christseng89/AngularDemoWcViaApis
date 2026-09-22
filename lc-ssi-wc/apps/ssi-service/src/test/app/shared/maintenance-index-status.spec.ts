import {
  MAINTENANCE_INDEX_ALL_STATUSES,
  maintenanceIndexStatuses,
} from "../../../app/shared/maintenance-index-status";

describe("maintenance index statuses", () => {
  it.each([undefined, "", "ALL"])(
    "uses the operating-record denominator for %s",
    (status) => {
      expect(maintenanceIndexStatuses(status)).toBe(
        MAINTENANCE_INDEX_ALL_STATUSES,
      );
    },
  );

  it("uses an explicitly requested lifecycle status", () => {
    expect(maintenanceIndexStatuses("DRAFT")).toEqual(["DRAFT"]);
  });
});
