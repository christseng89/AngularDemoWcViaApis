import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  EntityApplicationService,
  type EntityCommand,
} from "./entity-application.service";
@Controller("booking-branch-entities")
export class EntityController {
  constructor(private readonly service: EntityApplicationService) {}
  @Get() list() {
    return this.service.list();
  }
  @Post() create(@Body() body: EntityCommand) {
    return this.service.create(body);
  }
  @Put(":id") update(@Param("id") id: string, @Body() body: EntityCommand) {
    return this.service.update(id, body);
  }
  @Post(":id/revise") revise(
    @Param("id") id: string,
    @Body() body: { maker: string },
  ) {
    return this.service.revise(id, body.maker);
  }
  @Post(":id/:action") transition(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: { actor: string },
  ) {
    if (!["submit", "approve", "activate"].includes(action)) {
      throw new BadRequestException("INVALID_ACTION");
    }
    return this.service.transition(
      id,
      action.toUpperCase() as "SUBMIT" | "APPROVE" | "ACTIVATE",
      body.actor,
    );
  }
  @Delete(":id") revoke(
    @Param("id") id: string,
    @Body() body: { actor: string; reason: string },
  ) {
    return this.service.revoke(id, body.actor, body.reason);
  }
  @Get("audit/events") audit() {
    return this.service.audit();
  }
}
