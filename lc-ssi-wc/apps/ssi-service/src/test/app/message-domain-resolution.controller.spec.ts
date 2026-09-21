import { HttpException } from "@nestjs/common";
import { MessageDomainResolutionController } from "../../app/message-domain-resolution.controller";
import { MessageDomainResolutionService } from "../../app/message-domain-resolution.service";

describe("MessageDomainResolutionController", () => {
  it("preserves adapter outcome HTTP status and JSON contract", () => {
    const controller = new MessageDomainResolutionController(
      new MessageDomainResolutionService(),
    );

    expect(() => controller.ownAccount({ accountWithBankServiceId: "" })).toThrow(
      expect.objectContaining({
        status: 503,
        response: expect.objectContaining({ mx: expect.objectContaining({ code: "PROFILE_INCOMPLETE" }) }),
      }) as HttpException,
    );
  });
});
