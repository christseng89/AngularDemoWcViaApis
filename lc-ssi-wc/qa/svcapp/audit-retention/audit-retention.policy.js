"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onlineAuditCutoffUtc = exports.AuditRetentionPolicy = exports.AUDIT_RETENTION_CONFIG_ERROR = void 0;
exports.AUDIT_RETENTION_CONFIG_ERROR = "AUDIT_LIFECYCLE_CONFIG_INVALID";
const DAY_IN_MILLISECONDS = 86_400_000;
const MAX_SCHEDULE_INTERVAL_HOURS = 168;
const positiveInteger = (environment, name) => {
    const rawValue = environment[name];
    if (!rawValue || !/^[1-9]\d*$/.test(rawValue)) {
        throw new Error(`${exports.AUDIT_RETENTION_CONFIG_ERROR}:${name}`);
    }
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value)) {
        throw new Error(`${exports.AUDIT_RETENTION_CONFIG_ERROR}:${name}`);
    }
    return value;
};
class AuditRetentionPolicy {
    onlineQueryDays;
    archiveAfterDays;
    archiveRetentionDays;
    scheduleIntervalHours;
    constructor(onlineQueryDays, archiveAfterDays, archiveRetentionDays, scheduleIntervalHours) {
        this.onlineQueryDays = onlineQueryDays;
        this.archiveAfterDays = archiveAfterDays;
        this.archiveRetentionDays = archiveRetentionDays;
        this.scheduleIntervalHours = scheduleIntervalHours;
    }
    static fromEnvironment(environment = process.env) {
        const onlineQueryDays = positiveInteger(environment, "AUDIT_ONLINE_QUERY_DAYS");
        const archiveAfterDays = positiveInteger(environment, "AUDIT_ARCHIVE_AFTER_DAYS");
        const archiveRetentionDays = positiveInteger(environment, "AUDIT_ARCHIVE_RETENTION_DAYS");
        const scheduleIntervalHours = positiveInteger(environment, "AUDIT_RETENTION_SCHEDULE_HOURS");
        if (onlineQueryDays >= archiveAfterDays ||
            archiveAfterDays >= archiveRetentionDays ||
            scheduleIntervalHours > MAX_SCHEDULE_INTERVAL_HOURS) {
            throw new Error(exports.AUDIT_RETENTION_CONFIG_ERROR);
        }
        return new AuditRetentionPolicy(onlineQueryDays, archiveAfterDays, archiveRetentionDays, scheduleIntervalHours);
    }
    onlineCutoffUtc(now) {
        return this.daysBefore(now, this.onlineQueryDays);
    }
    archiveCutoffUtc(now) {
        return this.daysBefore(now, this.archiveAfterDays);
    }
    archivePurgeCutoffUtc(now) {
        return this.daysBefore(now, this.archiveRetentionDays);
    }
    daysBefore(now, days) {
        return new Date(now.getTime() - days * DAY_IN_MILLISECONDS).toISOString();
    }
}
exports.AuditRetentionPolicy = AuditRetentionPolicy;
const onlineAuditCutoffUtc = (now = new Date(), environment = process.env) => AuditRetentionPolicy.fromEnvironment(environment).onlineCutoffUtc(now);
exports.onlineAuditCutoffUtc = onlineAuditCutoffUtc;
//# sourceMappingURL=audit-retention.policy.js.map