import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AuditRetentionPolicy } from "./audit-retention.policy";
import {
  AuditLifecycleResult,
  AuditRetentionRepository,
  GOVERNED_AUDIT_TABLES,
} from "./audit-retention.repository";

export const HOURS_IN_MILLISECONDS = 60 * 60 * 1_000;

export interface AuditRetentionHealth {
  status: "UP" | "DOWN";
  policy: "AUDIT_LIFECYCLE";
  onlineQueryDays: number;
  archiveAfterDays: number;
  archiveRetentionDays: number;
  scheduleIntervalHours: number;
  governedTables: readonly string[];
  lastRunAtUtc?: string;
  nextRunAtUtc?: string;
  onlineCutoffUtc?: string;
  archiveCutoffUtc?: string;
  archivePurgeCutoffUtc?: string;
  totalArchived?: number;
  archivedByTable?: AuditLifecycleResult["archivedByTable"];
  purgedFromArchive?: number;
  lastErrorCode?: "AUDIT_LIFECYCLE_FAILED";
}

@Injectable()
export class AuditRetentionService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private healthState: AuditRetentionHealth;

  constructor(
    private readonly policy: AuditRetentionPolicy,
    private readonly repository: AuditRetentionRepository,
  ) {
    this.healthState = this.baseHealth("UP");
  }

  onModuleInit(): void {
    this.processLifecycle(new Date());
    this.timer = setInterval(
      () => this.runScheduledCleanup(),
      this.scheduleIntervalMilliseconds(),
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  processLifecycle(now: Date): AuditLifecycleResult {
    const result = this.repository.runLifecycle(
      this.policy.archiveCutoffUtc(now),
      this.policy.archivePurgeCutoffUtc(now),
      now.toISOString(),
    );
    this.healthState = {
      ...this.baseHealth("UP"),
      lastRunAtUtc: now.toISOString(),
      nextRunAtUtc: new Date(
        now.getTime() + this.scheduleIntervalMilliseconds(),
      ).toISOString(),
      onlineCutoffUtc: this.policy.onlineCutoffUtc(now),
      ...result,
    };
    return result;
  }

  health(): AuditRetentionHealth {
    return { ...this.healthState };
  }

  private runScheduledCleanup(): void {
    try {
      this.processLifecycle(new Date());
    } catch {
      this.healthState = {
        ...this.baseHealth("DOWN"),
        ...this.healthState,
        status: "DOWN",
        lastErrorCode: "AUDIT_LIFECYCLE_FAILED",
      };
    }
  }

  private baseHealth(status: "UP" | "DOWN"): AuditRetentionHealth {
    return {
      status,
      policy: "AUDIT_LIFECYCLE",
      onlineQueryDays: this.policy.onlineQueryDays,
      archiveAfterDays: this.policy.archiveAfterDays,
      archiveRetentionDays: this.policy.archiveRetentionDays,
      scheduleIntervalHours: this.policy.scheduleIntervalHours,
      governedTables: GOVERNED_AUDIT_TABLES,
    };
  }

  private scheduleIntervalMilliseconds(): number {
    return this.policy.scheduleIntervalHours * HOURS_IN_MILLISECONDS;
  }
}
