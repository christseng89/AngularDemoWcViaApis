import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  RmaApplicationService,
  type RmaCommand,
} from "./rma-application.service";
import { GovernedLifecycleControllerDelegate } from "../shared/governed-lifecycle-controller.delegate";
@Controller("rma-authorisations")
export class RmaController {
  private readonly lifecycle: GovernedLifecycleControllerDelegate<RmaCommand>;
  constructor(private readonly service: RmaApplicationService) {
    this.lifecycle = new GovernedLifecycleControllerDelegate(service);
  }
  @Get() list(): unknown {
    return this.lifecycle.list();
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
  @Post(":id/:action") transition(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: { actor: string },
  ): unknown {
    return this.lifecycle.transition(id, action, body.actor);
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
