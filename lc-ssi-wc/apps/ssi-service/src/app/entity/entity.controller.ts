import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  EntityApplicationService,
  type EntityCommand,
} from "./entity-application.service";
import { pagedListQuery } from "../shared/paged-list-query";
@Controller("booking-branch-entities")
export class EntityController {
  constructor(private readonly service: EntityApplicationService) {}
  @Get() list(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ) {
    const request = pagedListQuery({ status, page, pageSize, search });
    return request ? this.service.listPage(request) : this.service.list(status);
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
  @Post(":id/suppress") suppress(
    @Param("id") id: string,
    @Body() body: { maker: string; reason: string },
  ) {
    return this.service.suppress(id, body.maker, body.reason);
  }
  @Post(":id/:action") transition(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: { actor: string; reason?: string },
  ) {
    if (!["submit", "approve", "reject", "activate"].includes(action)) {
      throw new BadRequestException("INVALID_ACTION");
    }
    return this.service.transition(
      id,
      action.toUpperCase() as
        | "SUBMIT"
        | "APPROVE"
        | "REJECT"
        | "ACTIVATE",
      body.actor,
      body.reason,
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
