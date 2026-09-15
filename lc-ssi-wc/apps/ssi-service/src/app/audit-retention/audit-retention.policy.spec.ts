import {
  AUDIT_RETENTION_CONFIG_ERROR,
  AuditRetentionPolicy,
} from "./audit-retention.policy";

describe("AuditRetentionPolicy", () => {
  const environment = {
    AUDIT_ONLINE_QUERY_DAYS: "7",
    AUDIT_ARCHIVE_AFTER_DAYS: "14",
    AUDIT_ARCHIVE_RETENTION_DAYS: "365",
    AUDIT_RETENTION_SCHEDULE_HOURS: "12",
  };

  it("calculates the three exact UTC lifecycle cutoffs", () => {
    const policy = AuditRetentionPolicy.fromEnvironment(environment);
    expect(policy.onlineQueryDays).toBe(7);
    expect(policy.archiveAfterDays).toBe(14);
    expect(policy.archiveRetentionDays).toBe(365);
    expect(policy.scheduleIntervalHours).toBe(12);
    const now = new Date("2026-09-11T12:30:00.000Z");
    expect(policy.onlineCutoffUtc(now)).toBe("2026-09-04T12:30:00.000Z");
    expect(policy.archiveCutoffUtc(now)).toBe("2026-08-28T12:30:00.000Z");
    expect(policy.archivePurgeCutoffUtc(now)).toBe("2025-09-11T12:30:00.000Z");
  });

  it.each([
    undefined,
    "",
    "0",
    "-1",
    "1.5",
    " 7",
    "7 ",
    "1e2",
    "9007199254740992",
  ])("fails closed for invalid value %p", (value) => {
    expect(() =>
      AuditRetentionPolicy.fromEnvironment(
        value === undefined
          ? {}
          : { ...environment, AUDIT_ARCHIVE_AFTER_DAYS: value },
      ),
    ).toThrow(AUDIT_RETENTION_CONFIG_ERROR);
  });

  it.each([
    { ...environment, AUDIT_ONLINE_QUERY_DAYS: "14" },
    { ...environment, AUDIT_ARCHIVE_AFTER_DAYS: "365" },
  ])(
    "fails closed when lifecycle windows are not strictly increasing",
    (value) => {
      expect(() => AuditRetentionPolicy.fromEnvironment(value)).toThrow(
        AUDIT_RETENTION_CONFIG_ERROR,
      );
    },
  );

  it.each(["14", "30"])("supports configurable archive age %s days", (days) => {
    expect(
      AuditRetentionPolicy.fromEnvironment({
        ...environment,
        AUDIT_ARCHIVE_AFTER_DAYS: days,
      }).archiveAfterDays,
    ).toBe(Number(days));
  });

  it.each(["180", "365"])(
    "supports configurable archive retention %s days",
    (days) => {
      expect(
        AuditRetentionPolicy.fromEnvironment({
          ...environment,
          AUDIT_ARCHIVE_RETENTION_DAYS: days,
        }).archiveRetentionDays,
      ).toBe(Number(days));
    },
  );

  it.each(["12", "24"])(
    "supports configurable lifecycle schedule %s hours",
    (hours) => {
      expect(
        AuditRetentionPolicy.fromEnvironment({
          ...environment,
          AUDIT_RETENTION_SCHEDULE_HOURS: hours,
        }).scheduleIntervalHours,
      ).toBe(Number(hours));
    },
  );

  it.each([undefined, "", "0", "1.5", "169"])(
    "fails closed for unsafe schedule value %p",
    (hours) => {
      expect(() =>
        AuditRetentionPolicy.fromEnvironment(
          hours === undefined
            ? { ...environment, AUDIT_RETENTION_SCHEDULE_HOURS: undefined }
            : { ...environment, AUDIT_RETENTION_SCHEDULE_HOURS: hours },
        ),
      ).toThrow(AUDIT_RETENTION_CONFIG_ERROR);
    },
  );
});
