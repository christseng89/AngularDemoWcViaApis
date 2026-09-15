import { FinFieldResolutionController } from "./fin-field-resolution.controller";

describe("FinFieldResolutionController", () => {
  const service = {
    catalogueIndex: jest.fn(() => ({
      standardsRelease: "SR2026",
      items: [{ messageType: "MT300" }, { messageType: "MT400" }],
    })),
    resolve: jest.fn((request) => ({ request })),
  };
  const fixtures = { list: jest.fn((query) => ({ query })) };
  const controlledResolution = {
    resolve: jest.fn((request) => ({ request })),
  };
  const pages = {
    index: jest.fn(() => ({
      schemaVersion: "1.0.0",
      indexVersion: "2026-09-14",
      items: [
        { query: { messageType: "MT300" }, definitionId: "PAGE-MT300" },
        { query: { messageType: "MT400" }, definitionId: "PAGE-MT400" },
        { query: { messageType: "MT769" }, definitionId: "PAGE-MT769" },
      ],
    })),
  };
  const controller = new FinFieldResolutionController(
    service as never,
    fixtures as never,
    controlledResolution as never,
    pages as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("joins page definitions to each catalogue item for the requested release", () => {
    expect(controller.catalogue("SR2026")).toEqual({
      standardsRelease: "SR2026",
      pageDefinitionSchemaVersion: "1.0.0",
      pageDefinitionIndexVersion: "2026-09-14",
      items: [
        {
          messageType: "MT300",
          pageDefinitions: [
            { query: { messageType: "MT300" }, definitionId: "PAGE-MT300" },
          ],
        },
        {
          messageType: "MT400",
          pageDefinitions: [
            { query: { messageType: "MT400" }, definitionId: "PAGE-MT400" },
          ],
        },
      ],
    });
    expect(service.catalogueIndex).toHaveBeenCalledWith("SR2026");
    expect(pages.index).toHaveBeenCalledWith("SR2026");
  });

  it("uses SR2026 as the catalogue default", () => {
    controller.catalogue();
    expect(service.catalogueIndex).toHaveBeenCalledWith("SR2026");
  });

  it("omits optional controlled-fixture filters when blank", () => {
    controller.controlledFixtures("MT300", "", "USD", "HK01", "2026-09-14", "");
    expect(fixtures.list).toHaveBeenCalledWith({
      messageType: "MT300",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-14",
    });
  });

  it("passes optional controlled-fixture filters when supplied", () => {
    controller.controlledFixtures(
      "MT300",
      "A",
      "EUR",
      "HK01",
      "2026-09-15",
      "FIX-1",
    );
    expect(fixtures.list).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: "A", bindingId: "FIX-1" }),
    );
  });

  it("delegates controlled and tag resolution without reshaping the request", () => {
    const controlled = { scenarioId: "MT300-001" };
    const tag = { messageType: "MT300" };
    expect(controller.resolveControlled(controlled as never)).toEqual({
      request: controlled,
    });
    expect(controller.resolve(tag as never)).toEqual({ request: tag });
  });
});
