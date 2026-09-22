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

  it("dispatches every domain route and returns successful adapter outcomes", () => {
    const result = { mx: { httpStatus: 200 }, domain: "ok" };
    const service = { resolve: jest.fn(() => result) };
    const controller = new MessageDomainResolutionController(service as never);
    const body = { correlationId: "C-1" };

    expect(controller.ownAccount(body)).toBe(result);
    expect(controller.directDebit(body)).toBe(result);
    expect(controller.notification(body)).toBe(result);
    expect(service.resolve.mock.calls).toEqual([
      ["OWN_SSI_NOSTRO", body],
      ["FI_DIRECT_DEBIT", body],
      ["NOTIFICATION", body],
    ]);
  });

  it("returns a result whose HTTP status metadata is not numeric", () => {
    const result = { mx: { httpStatus: "200" } };
    const controller = new MessageDomainResolutionController({
      resolve: jest.fn(() => result),
    } as never);
    expect(controller.notification({})).toBe(result);
  });
});
