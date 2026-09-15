import type {
  ResolutionPageDefinition,
  ResolutionPageDefinitionQuery,
} from "@ssi/contracts";
import { CompositeResolutionPageDefinitionSource } from "./composite-resolution-page-definition.source";
import type { ResolutionPageDefinitionSource } from "./resolution-page-definition.source";

const definition = (
  definitionId: string,
  messageType: string,
): ResolutionPageDefinition =>
  ({ definitionId, messageType }) as ResolutionPageDefinition;

const source = (
  definitions: readonly ResolutionPageDefinition[],
): ResolutionPageDefinitionSource => ({
  all: jest.fn(() => definitions),
  find: jest.fn((query: ResolutionPageDefinitionQuery) =>
    definitions.filter(
      (candidate) => candidate.messageType === query.messageType,
    ),
  ),
});

describe("CompositeResolutionPageDefinitionSource", () => {
  it("combines independent governed sources without knowing their domains", () => {
    const mt347 = source([definition("PAGE-MT300", "MT300")]);
    const payment = source([definition("PAGE-MT202", "MT202")]);
    const composite = new CompositeResolutionPageDefinitionSource([
      mt347,
      payment,
    ]);

    expect(
      composite.all("SR2026").map(({ definitionId }) => definitionId),
    ).toEqual(["PAGE-MT300", "PAGE-MT202"]);
    expect(
      composite.find({
        standardsRelease: "SR2026",
        messageFamily: "MT2_PACS009",
        messageType: "MT202",
        direction: "OUTGOING",
      }),
    ).toEqual([expect.objectContaining({ definitionId: "PAGE-MT202" })]);
  });

  it("fails closed when sources publish the same definition identity", () => {
    const duplicate = definition("PAGE-DUPLICATE", "MT202");
    const composite = new CompositeResolutionPageDefinitionSource([
      source([duplicate]),
      source([duplicate]),
    ]);

    expect(() => composite.all("SR2026")).toThrow(
      "DUPLICATE_RESOLUTION_PAGE_DEFINITION",
    );
  });
});
