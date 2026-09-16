import {
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
  RmaApplicationService,
  type RmaCommand,
} from "./rma-application.service";
import { GovernedLifecycleControllerDelegate } from "../shared/governed-lifecycle-controller.delegate";
import { pagedListQuery } from "../shared/paged-list-query";
@Controller("rma-authorisations")
export class RmaController {
  private readonly lifecycle: GovernedLifecycleControllerDelegate<RmaCommand>;
  constructor(private readonly service: RmaApplicationService) {
    this.lifecycle = new GovernedLifecycleControllerDelegate(service);
  }
  @Get() list(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ): unknown {
    const request = pagedListQuery({ status, page, pageSize, search });
    return request
      ? this.service.listPage(request)
      : this.lifecycle.list(status);
  }
  @Post("check") check(
    @Body()
    body: {
      ownBic: string;
      counterpartyBic: string;
      service: string;
      direction: "INBOUND" | "OUTBOUND";
      messageType: string;
      at?: string;
    },
  ): unknown {
    return this.service.check(body);
  }
  @Get("message-types") messageTypes(): string[] {
    return this.service.supportedMessageTypes();
  }
  @Post() create(@Body() body: RmaCommand): unknown {
    return this.lifecycle.create(body);
  }
  @Put(":id") update(
    @Param("id") id: string,
    @Body() body: RmaCommand,
  ): unknown {
    return this.lifecycle.update(id, body);
  }
  @Post(":id/revise") revise(
    @Param("id") id: string,
    @Body() body: { maker: string },
  ): unknown {
    return this.lifecycle.revise(id, body.maker);
  }
  @Post(":id/suppress") suppress(
    @Param("id") id: string,
    @Body() body: { maker: string; reason: string },
  ): unknown {
    return this.lifecycle.suppress(id, body.maker, body.reason);
  }
  @Post(":id/:action") transition(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: { actor: string; reason?: string },
  ): unknown {
    return this.lifecycle.transition(id, action, body.actor, body.reason);
  }
  @Delete(":id") revoke(
    @Param("id") id: string,
    @Body() body: { actor: string; reason: string },
  ): unknown {
    return this.lifecycle.revoke(id, body.actor, body.reason);
  }
  @Get("audit/events") audit(): unknown {
    return this.lifecycle.audit();
  }
}
