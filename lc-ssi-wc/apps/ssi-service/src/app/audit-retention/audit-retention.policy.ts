export const AUDIT_RETENTION_CONFIG_ERROR = "AUDIT_LIFECYCLE_CONFIG_INVALID";

const DAY_IN_MILLISECONDS = 86_400_000;
const MAX_SCHEDULE_INTERVAL_HOURS = 168;

const positiveInteger = (
  environment: NodeJS.ProcessEnv,
  name: string,
): number => {
  const rawValue = environment[name];
  if (!rawValue || !/^[1-9]\d*$/.test(rawValue)) {
    throw new TypeError(`${AUDIT_RETENTION_CONFIG_ERROR}:${name}`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${AUDIT_RETENTION_CONFIG_ERROR}:${name}`);
  }
  return value;
};

export class AuditRetentionPolicy {
  private constructor(
    readonly onlineQueryDays: number,
    readonly archiveAfterDays: number,
    readonly archiveRetentionDays: number,
    readonly scheduleIntervalHours: number,
  ) {}

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): AuditRetentionPolicy {
    const onlineQueryDays = positiveInteger(
      environment,
      "AUDIT_ONLINE_QUERY_DAYS",
    );
    const archiveAfterDays = positiveInteger(
      environment,
      "AUDIT_ARCHIVE_AFTER_DAYS",
    );
    const archiveRetentionDays = positiveInteger(
      environment,
      "AUDIT_ARCHIVE_RETENTION_DAYS",
    );
    const scheduleIntervalHours = positiveInteger(
      environment,
      "AUDIT_RETENTION_SCHEDULE_HOURS",
    );
    if (
      onlineQueryDays >= archiveAfterDays ||
      archiveAfterDays >= archiveRetentionDays ||
      scheduleIntervalHours > MAX_SCHEDULE_INTERVAL_HOURS
    ) {
      throw new Error(AUDIT_RETENTION_CONFIG_ERROR);
    }
    return new AuditRetentionPolicy(
      onlineQueryDays,
      archiveAfterDays,
      archiveRetentionDays,
      scheduleIntervalHours,
    );
  }

  onlineCutoffUtc(now: Date): string {
    return this.daysBefore(now, this.onlineQueryDays);
  }

  archiveCutoffUtc(now: Date): string {
    return this.daysBefore(now, this.archiveAfterDays);
  }

  archivePurgeCutoffUtc(now: Date): string {
    return this.daysBefore(now, this.archiveRetentionDays);
  }

  private daysBefore(now: Date, days: number): string {
    return new Date(now.getTime() - days * DAY_IN_MILLISECONDS).toISOString();
  }
}

export const onlineAuditCutoffUtc = (
  now: Date = new Date(),
  environment: NodeJS.ProcessEnv = process.env,
): string =>
  AuditRetentionPolicy.fromEnvironment(environment).onlineCutoffUtc(now);
