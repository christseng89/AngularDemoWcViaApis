import { Controller, Get, Post, Body } from "@nestjs/common";
import { DatabaseSnapshotIdentityService } from "./database-snapshot-identity.service";
import { DevelopmentDataReloadService } from "./development-data-reload.service";

@Controller("settings")
export class RuntimeSettingsController {
  constructor(
    private readonly reloadService: DevelopmentDataReloadService,
    private readonly snapshotIdentity: DatabaseSnapshotIdentityService,
  ) {}

  @Get("runtime")
  runtime(): unknown {
    return {
      ...this.reloadService.status(),
      currentSnapshot: this.snapshotIdentity.current(),
    };
  }

  @Post("development-data/reload")
  reload(@Body() body: { password?: unknown }): unknown {
    return this.reloadService.reload(
      typeof body?.password === "string" ? body.password : "",
    );
  }
}
