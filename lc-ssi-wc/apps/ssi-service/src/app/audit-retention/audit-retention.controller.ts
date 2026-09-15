import { Controller, Get } from "@nestjs/common";
import {
  AuditRetentionHealth,
  AuditRetentionService,
} from "./audit-retention.service";

@Controller("health")
export class AuditRetentionController {
  constructor(private readonly service: AuditRetentionService) {}

  @Get("audit-retention")
  health(): AuditRetentionHealth {
    return this.service.health();
  }
}
