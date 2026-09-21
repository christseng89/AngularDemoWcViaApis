import { AuditRetentionController } from "../../../app/audit-retention/audit-retention.controller";
import { AuditRetentionService } from "../../../app/audit-retention/audit-retention.service";

describe("AuditRetentionController", () => {
  it("exposes retention health evidence", () => {
    const health = {
      status: "UP",
      policy: "AUDIT_LIFECYCLE",
      onlineQueryDays: 7,
      archiveAfterDays: 14,
      archiveRetentionDays: 365,
      scheduleIntervalHours: 12,
      governedTables: [],
    } as const;
    const service = {
      health: jest.fn().mockReturnValue(health),
    } as unknown as AuditRetentionService;
    expect(new AuditRetentionController(service).health()).toBe(health);
  });
});
