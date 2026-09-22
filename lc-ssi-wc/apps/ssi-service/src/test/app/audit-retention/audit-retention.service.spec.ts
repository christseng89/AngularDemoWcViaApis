import { AuditRetentionPolicy } from "../../../app/audit-retention/audit-retention.policy";
import { AuditRetentionRepository } from "../../../app/audit-retention/audit-retention.repository";
import {
  HOURS_IN_MILLISECONDS,
  AuditRetentionService,
} from "../../../app/audit-retention/audit-retention.service";

describe("AuditRetentionService", () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date("2026-09-11T12:00:00.000Z")),
  );
  afterEach(() => jest.useRealTimers());

  it("cleans at startup and on the configured schedule without request activity", () => {
    const repository = {
      runLifecycle: jest.fn().mockReturnValue({
        archiveCutoffUtc: "2026-08-28T12:00:00.000Z",
        archivePurgeCutoffUtc: "2025-09-11T12:00:00.000Z",
        archivedByTable: {
          audit_event: 1,
          rma_audit_event: 1,
          nostro_audit_event: 1,
          booking_branch_entity_audit: 1,
        },
        totalArchived: 4,
        purgedFromArchive: 2,
      }),
    } as unknown as AuditRetentionRepository;
    const service = new AuditRetentionService(
      AuditRetentionPolicy.fromEnvironment({
        AUDIT_ONLINE_QUERY_DAYS: "7",
        AUDIT_ARCHIVE_AFTER_DAYS: "14",
        AUDIT_ARCHIVE_RETENTION_DAYS: "365",
        AUDIT_RETENTION_SCHEDULE_HOURS: "12",
      }),
      repository,
    );

    service.onModuleInit();
    expect(repository.runLifecycle).toHaveBeenCalledWith(
      "2026-08-28T12:00:00.000Z",
      "2025-09-11T12:00:00.000Z",
      "2026-09-11T12:00:00.000Z",
    );
    expect(service.health()).toMatchObject({
      status: "UP",
      onlineQueryDays: 7,
      archiveAfterDays: 14,
      archiveRetentionDays: 365,
      scheduleIntervalHours: 12,
      totalArchived: 4,
      purgedFromArchive: 2,
    });

    jest.advanceTimersByTime(12 * HOURS_IN_MILLISECONDS);
    expect(repository.runLifecycle).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it("reports a scheduled lifecycle failure and permits destroy before init", () => {
    const lifecycleResult = {
      archiveCutoffUtc: "2026-08-28T12:00:00.000Z",
      archivePurgeCutoffUtc: "2025-09-11T12:00:00.000Z",
      archivedByTable: {},
      totalArchived: 0,
      purgedFromArchive: 0,
    };
    const repository = {
      runLifecycle: jest
        .fn()
        .mockReturnValueOnce(lifecycleResult)
        .mockImplementationOnce(() => {
          throw new Error("database unavailable");
        }),
    } as unknown as AuditRetentionRepository;
    const policy = AuditRetentionPolicy.fromEnvironment({
      AUDIT_ONLINE_QUERY_DAYS: "7",
      AUDIT_ARCHIVE_AFTER_DAYS: "14",
      AUDIT_ARCHIVE_RETENTION_DAYS: "365",
      AUDIT_RETENTION_SCHEDULE_HOURS: "1",
    });
    const service = new AuditRetentionService(policy, repository);
    new AuditRetentionService(policy, repository).onModuleDestroy();

    service.onModuleInit();
    jest.advanceTimersByTime(HOURS_IN_MILLISECONDS);
    expect(service.health()).toMatchObject({
      status: "DOWN",
      lastErrorCode: "AUDIT_LIFECYCLE_FAILED",
      lastRunAtUtc: "2026-09-11T12:00:00.000Z",
    });
    service.onModuleDestroy();
  });
});
