import { Body, Controller, HttpCode, HttpException, Post } from "@nestjs/common";
import {
  MessageDomainResolutionService,
  type MessageDomainResolutionResult,
} from "./message-domain-resolution.service";

@Controller()
export class MessageDomainResolutionController {
  constructor(private readonly service: MessageDomainResolutionService) {}

  private response(result: MessageDomainResolutionResult): unknown {
    const status = result.mx["httpStatus"];
    if (typeof status === "number" && status >= 400)
      throw new HttpException(result, status);
    return result;
  }

  @Post("own-account-settlements/resolve")
  @HttpCode(200)
  ownAccount(@Body() body: Record<string, unknown>): unknown {
    return this.response(this.service.resolve("OWN_SSI_NOSTRO", body));
  }

  @Post("fi-direct-debits/resolve")
  @HttpCode(200)
  directDebit(@Body() body: Record<string, unknown>): unknown {
    return this.response(this.service.resolve("FI_DIRECT_DEBIT", body));
  }

  @Post("payment-notifications/resolve")
  @HttpCode(200)
  notification(@Body() body: Record<string, unknown>): unknown {
    return this.response(this.service.resolve("NOTIFICATION", body));
  }
}
