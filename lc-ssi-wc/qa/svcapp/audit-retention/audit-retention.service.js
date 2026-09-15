"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRetentionService = exports.HOURS_IN_MILLISECONDS = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const audit_retention_policy_1 = require("./audit-retention.policy");
const audit_retention_repository_1 = require("./audit-retention.repository");
exports.HOURS_IN_MILLISECONDS = 60 * 60 * 1_000;
let AuditRetentionService = class AuditRetentionService {
    policy;
    repository;
    timer;
    healthState;
    constructor(policy, repository) {
        this.policy = policy;
        this.repository = repository;
        this.healthState = this.baseHealth("UP");
    }
    onModuleInit() {
        this.processLifecycle(new Date());
        this.timer = setInterval(() => this.runScheduledCleanup(), this.scheduleIntervalMilliseconds());
        this.timer.unref();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    processLifecycle(now) {
        const result = this.repository.runLifecycle(this.policy.archiveCutoffUtc(now), this.policy.archivePurgeCutoffUtc(now), now.toISOString());
        this.healthState = {
            ...this.baseHealth("UP"),
            lastRunAtUtc: now.toISOString(),
            nextRunAtUtc: new Date(now.getTime() + this.scheduleIntervalMilliseconds()).toISOString(),
            onlineCutoffUtc: this.policy.onlineCutoffUtc(now),
            ...result,
        };
        return result;
    }
    health() {
        return { ...this.healthState };
    }
    runScheduledCleanup() {
        try {
            this.processLifecycle(new Date());
        }
        catch {
            this.healthState = {
                ...this.baseHealth("DOWN"),
                ...this.healthState,
                status: "DOWN",
                lastErrorCode: "AUDIT_LIFECYCLE_FAILED",
            };
        }
    }
    baseHealth(status) {
        return {
            status,
            policy: "AUDIT_LIFECYCLE",
            onlineQueryDays: this.policy.onlineQueryDays,
            archiveAfterDays: this.policy.archiveAfterDays,
            archiveRetentionDays: this.policy.archiveRetentionDays,
            scheduleIntervalHours: this.policy.scheduleIntervalHours,
            governedTables: audit_retention_repository_1.GOVERNED_AUDIT_TABLES,
        };
    }
    scheduleIntervalMilliseconds() {
        return this.policy.scheduleIntervalHours * exports.HOURS_IN_MILLISECONDS;
    }
};
exports.AuditRetentionService = AuditRetentionService;
exports.AuditRetentionService = AuditRetentionService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [audit_retention_policy_1.AuditRetentionPolicy,
        audit_retention_repository_1.AuditRetentionRepository])
], AuditRetentionService);
//# sourceMappingURL=audit-retention.service.js.map